import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JsonViewer, XmlViewer } from "@/components/ui/json-viewer";
import { Search, Building2, Eye, EyeOff, Truck, CheckCircle2, XCircle } from "lucide-react";
import { fetchClienteNome } from "@/lib/clienteCache";
import { fetchTokenByCnpj, upsertTokenSoap } from "@/lib/credenciaisSoap";
import { parseSoapResponse, type SoapOcorrencia } from "@/lib/soapParser";
import { CredencialSoapSelector } from "@/features/soap/CredencialSoapSelector";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as z from "zod";

const soapSchema = z.object({
  cnpjCliente: z.string().min(14, "CNPJ 14 dígitos").transform((v) => v.replace(/\D/g, "").padStart(14, "0")).refine((v) => v.length === 14, "CNPJ 14 dígitos"),
  token: z.string().min(1, "Token obrigatório"),
  tipoCliente: z.enum(["1", "2"]).default("1"),
  numeroNotaFiscal: z.string().min(1, "Nota Fiscal obrigatória"),
  serieNotaFiscal: z.string().default("1"),
  numeroCTe: z.string().optional(),
  cnpjDestinatario: z.string().optional(),
  atributo01: z.string().optional(),
  atributo02: z.string().optional(),
  atributo03: z.string().optional(),
  atributo04: z.string().optional(),
  atributo05: z.string().optional(),
});

function statusVariant(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("entreg")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200";
  if (s.includes("transito") || s.includes("trânsito") || s.includes("em trans")) return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200";
  if (s.includes("colet")) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200";
  if (s.includes("extrav") || s.includes("ocorr")) return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200";
  return "bg-primary/10 text-primary border-primary/20";
}

export function SoapPage() {
  const [resultSoap, setResultSoap] = useState<any>(null);
  const [loadingSoap, setLoadingSoap] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [editingToken, setEditingToken] = useState(false);
  const queryClient = useQueryClient();

  const formSoap = useForm({ resolver: zodResolver(soapSchema), defaultValues: { cnpjCliente: "", token: "", tipoCliente: "1", numeroNotaFiscal: "", serieNotaFiscal: "1", numeroCTe: "", cnpjDestinatario: "", atributo01: "", atributo02: "", atributo03: "", atributo04: "", atributo05: "" } } as any);

  const cnpjSoapWatch = formSoap.watch("cnpjCliente") || "";
  const { data: nomeSoap } = useQuery({ queryKey: ["cliente_cache", cnpjSoapWatch], queryFn: () => fetchClienteNome(cnpjSoapWatch), enabled: cnpjSoapWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });
  const { data: tokenSoap } = useQuery({ queryKey: ["credenciais_soap", cnpjSoapWatch], queryFn: () => fetchTokenByCnpj(cnpjSoapWatch), enabled: cnpjSoapWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });

  useEffect(() => {
    if (tokenSoap) formSoap.setValue("token", tokenSoap, { shouldValidate: true });
  }, [tokenSoap]);

  const handleSaveToken = async () => {
    const cnpj = formSoap.getValues("cnpjCliente");
    const token = formSoap.getValues("token");
    const res = await upsertTokenSoap(cnpj, token);
    if (res.error) alert(res.error);
    else {
      setEditingToken(false);
      queryClient.invalidateQueries({ queryKey: ["credenciais_soap"] });
    }
  };

  const onSearchSoap = async (data: any) => {
    setLoadingSoap(true);
    try {
      const payload = {
        cnpjCliente: data.cnpjCliente.replace(/\D/g, "").padStart(14, "0"),
        token: data.token,
        tipoCliente: data.tipoCliente,
        numeroNotaFiscal: data.numeroNotaFiscal,
        serieNotaFiscal: data.serieNotaFiscal || "1",
        numeroCTe: data.numeroCTe || "",
        cnpjDestinatario: data.cnpjDestinatario ? data.cnpjDestinatario.replace(/\D/g, "") : "",
        atributo01: data.atributo01 || "",
        atributo02: data.atributo02 || "",
        atributo03: data.atributo03 || "",
        atributo04: data.atributo04 || "",
        atributo05: data.atributo05 || "",
      };
      const res = (window as any).api
        ? await (window as any).api.callTrackingSoap(payload)
        : await fetch("/soa-proxy/soa-infra/services/dataPress/consultaLoteMultiplasOcorrenciasBraspress/consultalotemultiplasocorrenciasbraspress_client_ep", {
            method: "POST",
            headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "consultaLoteMultiplasOcorrenciasBraspress" },
            body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="http://xmlns.oracle.com/Braspress_Datapress/consultaLoteMultiplasOcorrenciasBraspress/consultaLoteMultiplasOcorrenciasBraspress"><soapenv:Body><con:process><con:cnpjCliente>${payload.cnpjCliente}</con:cnpjCliente><con:token>${payload.token}</con:token><con:tipoCliente>${payload.tipoCliente}</con:tipoCliente><con:numeroNotaFiscal>${payload.numeroNotaFiscal}</con:numeroNotaFiscal><con:serieNotaFiscal>${payload.serieNotaFiscal}</con:serieNotaFiscal><con:numeroCTe>${payload.numeroCTe}</con:numeroCTe><con:cnpjDestinatario>${payload.cnpjDestinatario}</con:cnpjDestinatario><con:atributo01>${payload.atributo01}</con:atributo01><con:atributo02>${payload.atributo02}</con:atributo02><con:atributo03>${payload.atributo03}</con:atributo03><con:atributo04>${payload.atributo04}</con:atributo04><con:atributo05>${payload.atributo05}</con:atributo05></con:process></soapenv:Body></soapenv:Envelope>`,
          }).then(async (r) => {
            const text = await r.text();
            const ocorrencias = await parseSoapResponse(text);
            return { status: r.status, ok: r.ok, data: ocorrencias, raw: text };
          });
      setResultSoap(res);
    } catch (e: any) { setResultSoap({ status: 0, ok: false, data: { message: e.message }, raw: "" }); }
    setLoadingSoap(false);
  };

  return (
    <div className="space-y-6">
      <CredencialSoapSelector value={cnpjSoapWatch} onSelect={(cnpj) => formSoap.setValue("cnpjCliente", cnpj, { shouldValidate: true, shouldDirty: true })} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> Tracking SOAP - Lote Múltiplas Ocorrências</CardTitle>
          <CardDescription>Tela dedicada para SOAP (separada do Tracking v3) • Token por CNPJ em credenciais_soap • criptografado via Rust</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={formSoap.handleSubmit(onSearchSoap)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>CNPJ Cliente *</Label><Input {...formSoap.register("cnpjCliente")} placeholder="04896434000504" />
                <p className="text-[11px] text-muted-foreground">Selecione na lista acima ou digite manualmente</p>
                {nomeSoap && <div className="flex items-center gap-1 text-xs text-primary mt-1"><Building2 className="h-3 w-3" />{nomeSoap}</div>}
                {formSoap.formState.errors.cnpjCliente && <p className="text-xs text-red-600">{String(formSoap.formState.errors.cnpjCliente.message)}</p>}
              </div>
              <div>
                <Label className="flex items-center gap-2">Token * {tokenSoap && !editingToken && <span className="text-xs text-emerald-600">(do banco)</span>}</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input type={showToken ? "text" : "password"} {...formSoap.register("token")} placeholder="@Alpar#123" className="pr-10" disabled={!editingToken && !!tokenSoap} />
                    <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-2 text-muted-foreground">
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {tokenSoap && !editingToken ? (
                    <Button type="button" variant="outline" onClick={() => setEditingToken(true)}>Editar</Button>
                  ) : tokenSoap && editingToken ? (
                    <Button type="button" onClick={handleSaveToken}>Salvar</Button>
                  ) : null}
                </div>
                {formSoap.formState.errors.token && <p className="text-xs text-red-600">{String(formSoap.formState.errors.token.message)}</p>}
                {!tokenSoap && <p className="text-[11px] text-amber-600">Sem token no banco — digite manualmente ou use + Novo Token</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>Tipo Cliente</Label><select {...formSoap.register("tipoCliente")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="1">1</option><option value="2">2</option></select></div>
              <div><Label>Nota Fiscal *</Label><Input {...formSoap.register("numeroNotaFiscal")} placeholder="244142" />{formSoap.formState.errors.numeroNotaFiscal && <p className="text-xs text-red-600">{String(formSoap.formState.errors.numeroNotaFiscal.message)}</p>}</div>
              <div><Label>Série NF</Label><Input {...formSoap.register("serieNotaFiscal")} placeholder="1" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Nº CTe (opcional)</Label><Input {...formSoap.register("numeroCTe")} placeholder="" /></div>
              <div><Label>CNPJ Destinatário (opcional)</Label><Input {...formSoap.register("cnpjDestinatario")} placeholder="" /></div>
            </div>
            <details className="border rounded-lg p-3 bg-muted/20">
              <summary className="text-sm font-medium cursor-pointer">Atributos 01-05 (opcionais)</summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div><Label>Atributo01</Label><Input {...formSoap.register("atributo01")} /></div>
                <div><Label>Atributo02</Label><Input {...formSoap.register("atributo02")} /></div>
                <div><Label>Atributo03</Label><Input {...formSoap.register("atributo03")} /></div>
                <div><Label>Atributo04</Label><Input {...formSoap.register("atributo04")} /></div>
                <div><Label>Atributo05</Label><Input {...formSoap.register("atributo05")} /></div>
              </div>
            </details>
            <div className="flex gap-2">
              <Button type="submit" disabled={loadingSoap}><Search className="h-4 w-4 mr-2" />{loadingSoap ? "Consultando..." : "Consultar Lote SOAP"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">POST http://soa.braspress.com.br:80/... • Content-Type: text/xml; SOAPAction: consultaLoteMultiplasOcorrenciasBraspress</p>
          </form>
        </CardContent>
      </Card>

      {resultSoap && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {resultSoap.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              Resultado SOAP
              <Badge className={resultSoap.ok ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-red-500/10 text-red-700 border-red-200"}>{resultSoap.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="visual">
              <TabsList>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="xml">XML</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="visual" className="mt-4">
                {Array.isArray(resultSoap.data) && resultSoap.data.length > 0 ? (
                  <div className="space-y-4">
                    {resultSoap.data.map((o: SoapOcorrencia, idx: number) => (
                      <div key={idx} className="border rounded-xl overflow-hidden shadow-sm bg-card">
                        <div className="px-4 py-3 bg-muted/20 border-b flex flex-wrap gap-2 items-center justify-between">
                          <span className="font-mono font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />AWB {o.numeroAWB_NFSe}</span>
                          <Badge className={statusVariant(o.statusConhecimento)}>{o.statusConhecimento}</Badge>
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Nota Fiscal</div><div className="text-xs font-medium">{o.numeroNotaFiscal}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Remetente</div><div className="text-xs font-medium truncate">{o.razaoSocialRemetente}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Destinatário</div><div className="text-xs font-medium truncate">{o.razaoSocialDestinatario}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Consignatário</div><div className="text-xs font-medium truncate">{o.razaoSocialConsignatario || "—"}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Filial Origem</div><div className="text-xs font-medium">{o.filialOrigem}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Filial Destino</div><div className="text-xs font-medium">{o.filialDestino}</div></div>
                            <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Data Ocorrência</div><div className="text-xs">{o.dataOcorrencia}</div></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 border rounded-lg bg-muted/20">
                    {resultSoap.ok ? "Nenhuma ocorrência encontrada na resposta." : `Erro: ${resultSoap.data?.message || "Falha na consulta"}`}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="xml" className="mt-4">
                <XmlViewer xml={resultSoap.raw || ""} title="SOAP XML Raw" />
              </TabsContent>
              <TabsContent value="json" className="mt-4">
                <JsonViewer data={resultSoap.data} title="SOAP Data" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
