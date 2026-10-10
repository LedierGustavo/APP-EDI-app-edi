import { XMLParser } from "fast-xml-parser";

// Parser SOAP/XML rodando no MAIN process (Electron).
// Mantido dentro de electron/ para ser compilado em dist-electron/ e resolvido
// corretamente no pacote final (.exe) — antes o import apontava para ../src,
// que não existe fora do bundle do Vite.

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

const TARGET_KEYS = [
  "numeroNotaFiscal",
  "numeroAWB_NFSe",
  "statusConhecimento",
  "dataOcorrencia",
];

function isOccurrence(item: unknown): item is Record<string, unknown> {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const rec = item as Record<string, unknown>;
  return TARGET_KEYS.some((k) => rec[k] !== undefined && rec[k] !== null && rec[k] !== "");
}

function findOccurrences(node: unknown): Record<string, unknown>[] {
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
  for (const value of Object.values(node as Record<string, unknown>)) {
    const found = findOccurrences(value);
    if (found.length > 0) return found;
  }
  return [];
}

function clean(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function parseSoapResponse(xml: string): SoapOcorrencia[] {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      removeNSPrefix: true,
    });
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
