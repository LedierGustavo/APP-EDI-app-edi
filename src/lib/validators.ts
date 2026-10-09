import { z } from "zod";

const onlyDigits = (v: string) => v.replace(/\D/g, "");

export const cnpjSchema = z.string().transform(onlyDigits).refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos");
export const cnpjCpfSchema = z.string().transform(onlyDigits).refine((v) => v.length === 11 || v.length === 14, "CNPJ 14 ou CPF 11 dígitos");
export const cepSchema = z.string().transform(onlyDigits).refine((v) => v.length === 8, "CEP deve ter 8 dígitos");

export const cotacaoSchema = z.object({
  cnpjRemetente: cnpjSchema,
  cnpjDestinatario: cnpjCpfSchema,
  cnpjConsignado: z.string().optional().transform((v) => v ? onlyDigits(v) : undefined).refine((v) => !v || v.length === 14, "CNPJ consignado 14 dígitos"),
  modal: z.enum(["R", "A"]),
  tipoFrete: z.enum(["1", "2", "3"]),
  cepOrigem: cepSchema,
  cepDestino: cepSchema,
  vlrMercadoria: z.coerce.number().positive("Valor > 0"),
  peso: z.coerce.number().positive("Peso > 0"),
  volumes: z.coerce.number().int().positive("Volumes > 0"),
  cubagem: z.array(z.object({
    comprimento: z.coerce.number().positive(),
    largura: z.coerce.number().positive(),
    altura: z.coerce.number().positive(),
    volumes: z.coerce.number().int().positive(),
  })).min(1, "Informe ao menos 1 cubagem"),
}).superRefine((data, ctx) => {
  if (data.tipoFrete === "3" && !data.cnpjConsignado) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CNPJ consignado obrigatório para tipo 3", path: ["cnpjConsignado"] });
  }
});

export const trackingByNfSchema = z.object({
  cnpj: cnpjSchema,
  notaFiscal: z.string().min(1, "Nota fiscal obrigatória").transform((v) => v.trim()),
});
export const trackingByPedidoSchema = z.object({
  cnpj: cnpjSchema,
  numPedido: z.string().min(1, "Nº pedido obrigatório").transform((v) => v.trim()),
});
