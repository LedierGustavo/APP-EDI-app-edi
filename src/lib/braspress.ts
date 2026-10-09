export type CotacaoPayload = {
  cnpjRemetente: string;
  cnpjDestinatario: string;
  cnpjConsignado?: string;
  modal: "R" | "A";
  tipoFrete: "1" | "2" | "3";
  cepOrigem: string;
  cepDestino: string;
  vlrMercadoria: number;
  peso: number;
  volumes: number;
  cubagem: { comprimento: number; largura: number; altura: number; volumes: number }[];
};

export type CotacaoResponse = { id: string; prazo: number; totalFrete: number };
export type BraspressError = { statusCode: number; message: string; dateTime: string; errorList?: any[] };

export type TrackingConhecimento = {
  numero: string; origem: string; emissao: string; remetente: string; destinatario: string;
  tipoFrete: string; volumes: number; valorMercantil: number; peso: number; totalFrete: number;
  previsaoEntrega: string; dataEntrega: string | null; status: string; cidade: string; uf: string;
  cidadeColeta: string; ufColeta: string; dataOcorrencia: string; ultimaOcorrencia: string;
  notasFiscais: { serie: string; numero: string; emissao: string }[];
  timeline?: { descricao: string; data: string }[];
  ocorrencias?: { descricao: string; data: string }[];
};

export function buildBasic(user: string, pass: string) { return btoa(`${user}:${pass}`); }
export function buildCurlCotacao(basic: string, payload: CotacaoPayload, returnType: string) {
  return `curl -H "Authorization: Basic ${basic}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}' -X POST https://api.braspress.com/v1/cotacao/calcular/${returnType}`;
}
