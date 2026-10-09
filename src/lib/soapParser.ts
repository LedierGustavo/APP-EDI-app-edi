export type SoapOcorrencia = {
  numeroNotaFiscal: string;
  numeroAWB_NFSe: string;
  razaoSocialRemetente: string;
  razaoSocialDestinatario: string;
  razaoSocialConsignatario?: string;
  filialOrigem: string;
  filialDestino: string;
  statusConhecimento: string;
  dataOcorrencia: string;
};

const TARGET_KEYS = ["numeroNotaFiscal", "numeroAWB_NFSe", "statusConhecimento", "dataOcorrencia"];

function isOccurrence(item: any): boolean {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  return TARGET_KEYS.some((k) => item[k] !== undefined && item[k] !== null && item[k] !== "");
}

function findOccurrences(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    const occurrences = node.filter(isOccurrence);
    if (occurrences.length > 0) return occurrences;
    for (const item of node) {
      const found = findOccurrences(item);
      if (found.length > 0) return found;
    }
    return [];
  }
  if (isOccurrence(node)) return [node];
  for (const key of Object.keys(node)) {
    const found = findOccurrences(node[key]);
    if (found.length > 0) return found;
  }
  return [];
}

function clean(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") {
    if (value.nil === "true" || value["xsi:nil"] === "true") return undefined;
    return undefined;
  }
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function parseSoapResponse(xml: string): Promise<SoapOcorrencia[]> {
  try {
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true });
    const parsed = parser.parse(xml);
    const items = findOccurrences(parsed);
    return items.map((item) => ({
      numeroNotaFiscal: clean(item.numeroNotaFiscal) ?? "",
      numeroAWB_NFSe: clean(item.numeroAWB_NFSe) ?? "",
      razaoSocialRemetente: clean(item.razaoSocialRemetente) ?? "",
      razaoSocialDestinatario: clean(item.razaoSocialDestinatario) ?? "",
      razaoSocialConsignatario: clean(item.razaoSocialConsignatario),
      filialOrigem: clean(item.filialOrigem) ?? "",
      filialDestino: clean(item.filialDestino) ?? "",
      statusConhecimento: clean(item.statusConhecimento) ?? "",
      dataOcorrencia: formatDate(clean(item.dataOcorrencia)),
    }));
  } catch {
    return [];
  }
}
