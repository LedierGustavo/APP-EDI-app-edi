export type RotaCepResult = {
  mensagem: string;
  idFilial?: number;
  filial?: string;
  rota?: string;
  descricaoRota?: string;
  cep?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  raw: any;
};

const MENSAGEM_KEYS = ["MENSAGEM", "mensagem", "message", "msg", "MSG"];
const FILIAL_KEYS = ["IDFILIAL", "idFilial", "ID_FILIAL", "filialId", "FILIALID"];
const FILIAL_NOME_KEYS = ["Filial", "filial", "NOMEFILIAL", "nomeFilial", "FILIAL"];
const ROTA_KEYS = ["ROTA", "Rota", "rota", "CODROTA", "codRota", "ROTAID", "rotaId"];
const ROTA_DESC_KEYS = ["DescricaoRota", "descricaoRota", "DESCRICAOROTA", "descRota"];
const CEP_KEYS = ["CEP", "cep"];
const ENDERECO_KEYS = ["ENDERECO", "endereco", "Endereco", "LOGRADOURO", "logradouro"];
const BAIRRO_KEYS = ["BAIRRO", "bairro", "Bairro"];
const CIDADE_KEYS = ["CIDADE", "cidade", "Cidade", "MUNICIPIO", "municipio"];
const UF_KEYS = ["UF", "uf", "UF_SIGLA", "estado"];

export function parseRotaCep(data: any): RotaCepResult {
  if (!data || typeof data !== "object") {
    return { mensagem: "Resposta vazia", raw: data };
  }
  const values: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    values.push(value as Record<string, unknown>);
    Object.values(value).forEach(visit);
  };
  visit(data);

  const findKey = (keys: string[]) => {
    for (const item of values) {
      for (const key of keys) {
        const exact = item[key];
        if (exact !== undefined && exact !== null && String(exact).trim()) {
          return String(exact).trim();
        }
        const lowerKey = key.toLowerCase();
        for (const actualKey of Object.keys(item)) {
          if (actualKey.toLowerCase() === lowerKey) {
            const value = item[actualKey];
            if (value !== undefined && value !== null && String(value).trim()) {
              return String(value).trim();
            }
          }
        }
      }
    }
    return undefined;
  };
  return {
    mensagem: findKey(MENSAGEM_KEYS) ?? "OK",
    idFilial: findKey(FILIAL_KEYS) ? Number(findKey(FILIAL_KEYS)) : undefined,
    filial: findKey(FILIAL_NOME_KEYS),
    rota: findKey(ROTA_KEYS),
    descricaoRota: findKey(ROTA_DESC_KEYS),
    cep: findKey(CEP_KEYS),
    endereco: findKey(ENDERECO_KEYS),
    bairro: findKey(BAIRRO_KEYS),
    cidade: findKey(CIDADE_KEYS),
    uf: findKey(UF_KEYS),
    raw: data,
  };
}
