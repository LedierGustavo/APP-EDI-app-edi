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
const ROTA_KEYS = ["Rota", "rota", "CODROTA", "codRota", "ROTAID", "rotaId"];
const ROTA_DESC_KEYS = ["DescricaoRota", "descricaoRota", "DESCRICAOROTA", "descRota"];
const CEP_KEYS = ["CEP", "cep"];
const ENDERECO_KEYS = ["ENDERECO", "endereco", "Endereco", "LOGRADOURO", "logradouro"];
const BAIRRO_KEYS = ["BAIRRO", "bairro", "Bairro"];
const CIDADE_KEYS = ["CIDADE", "cidade", "Cidade", "MUNICIPIO", "municipio"];
const UF_KEYS = ["UF", "uf", "UF_SIGLA", "estado"];

function pick(obj: any, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") {
      return String(obj[k]).trim();
    }
  }
  return undefined;
}

export function parseRotaCep(data: any): RotaCepResult {
  if (!data || typeof data !== "object") {
    return { mensagem: "Resposta vazia", raw: data };
  }
  const wrapper = data.return ?? data.response ?? data.result ?? data;
  const target = wrapper?.consultarotacepReturn ?? wrapper?.rotaCepReturn ?? wrapper?.return ?? wrapper;
  const source = target && typeof target === "object" && !Array.isArray(target) ? target : wrapper;
  return {
    mensagem: pick(data, MENSAGEM_KEYS) ?? pick(source, MENSAGEM_KEYS) ?? "OK",
    idFilial: pick(source, FILIAL_KEYS) ? Number(pick(source, FILIAL_KEYS)) : undefined,
    filial: pick(source, FILIAL_NOME_KEYS),
    rota: pick(source, ROTA_KEYS),
    descricaoRota: pick(source, ROTA_DESC_KEYS),
    cep: pick(source, CEP_KEYS),
    endereco: pick(source, ENDERECO_KEYS),
    bairro: pick(source, BAIRRO_KEYS),
    cidade: pick(source, CIDADE_KEYS),
    uf: pick(source, UF_KEYS),
    raw: data,
  };
}
