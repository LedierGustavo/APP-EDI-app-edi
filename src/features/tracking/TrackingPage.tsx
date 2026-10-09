import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trackingByNfSchema, trackingByPedidoSchema } from "@/lib/validators";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/ui/json-viewer";
import { Search, Package, Clock, AlertTriangle, MapPin, Truck, CheckCircle2, XCircle, ArrowRight, PackageCheck } from "lucide-react";

function statusVariant(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("entreg")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200";
  if (s.includes("transito") || s.includes("trânsito") || s.includes("em trans")) return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200";
  if (s.includes("colet")) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200";
  if (s.includes("extrav") || s.includes("ocorr")) return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200";
  return "bg-primary/10 text-primary border-primary/20";
}

export function TrackingPage() {
  const { basic, cred } = useAuthStore();
  const [tab, setTab] = useState("byNf");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [returnType] = useState("json");

  const formNf = useForm({ resolver: zodResolver(trackingByNfSchema), defaultValues: { cnpj: "", notaFiscal: "" } });
  const formPedido = useForm({ resolver: zodResolver(trackingByPedidoSchema), defaultValues: { cnpj: "", numPedido: "" } });

  useEffect(() => {
    if (cred?.usuario) {
      const cnpj = cred.usuario.split("_")[0].replace(/\D/g, "");
      if (cnpj.length === 14) {
        formNf.setValue("cnpj", cnpj, { shouldValidate: true, shouldDirty: true });
        formPedido.setValue("cnpj", cnpj, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [cred?.usuario]);

  const onSearch = async (tipo: "byNf" | "byNumPedido", cnpj: string, valor: string) => {
    if (!basic) { alert("Selecione credencial"); return; }
    setLoading(true);
    const cnpjDigits = cnpj.replace(/\D/g, "");
    try {
      const res = (window as any).api
        ? await (window as any).api.callTracking({ basic, cnpj: cnpjDigits, valor, tipo, returnType })
        : await fetch(`https://api.braspress.com/v3/tracking/${tipo}/${cnpjDigits}/${valor}/${returnType}`, { headers: { Authorization: `Basic ${basic}` } }).then(async (r) => {
            const text = await r.text();
            let data: any;
            try { data = JSON.parse(text); } catch { data = text; }
            return { status: r.status, ok: r.ok, data, raw: text };
          });
      setResult(res);
    } catch (e: any) { setResult({ status: 0, ok: false, data: { message: e.message } }); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="byNf">Por Nota Fiscal (v3)</TabsTrigger>
          <TabsTrigger value="byNumPedido">Por Nº Pedido (v3)</TabsTrigger>
        </TabsList>

        <TabsContent value="byNf">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Tracking por Nota Fiscal</CardTitle><CardDescription>Busca por NF nos últimos 90 dias (grupo econômico v3)</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={formNf.handleSubmit((d) => onSearch("byNf", d.cnpj, d.notaFiscal))} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div><Label>CNPJ Tomador *</Label><Input {...formNf.register("cnpj")} placeholder="12345678912345" />{formNf.formState.errors.cnpj && <p className="text-xs text-red-600">{String(formNf.formState.errors.cnpj.message)}</p>}</div>
                <div><Label>Nota Fiscal *</Label><Input {...formNf.register("notaFiscal")} placeholder="12345" />{formNf.formState.errors.notaFiscal && <p className="text-xs text-red-600">{String(formNf.formState.errors.notaFiscal.message)}</p>}</div>
                <Button type="submit" disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? "Buscando..." : "Buscar"}</Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">GET /v3/tracking/byNf/{"{cnpj}"}/{"{notaFiscal}"}/json</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byNumPedido">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Tracking por Nº Pedido</CardTitle><CardDescription>Busca por número do pedido (v3)</CardDescription></CardHeader>
            <CardContent>
              <form onSubmit={formPedido.handleSubmit((d) => onSearch("byNumPedido", d.cnpj, d.numPedido))} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div><Label>CNPJ Tomador *</Label><Input {...formPedido.register("cnpj")} placeholder="12345678912345" />{formPedido.formState.errors.cnpj && <p className="text-xs text-red-600">{String(formPedido.formState.errors.cnpj.message)}</p>}</div>
                <div><Label>Nº Pedido *</Label><Input {...formPedido.register("numPedido")} placeholder="PED123" />{formPedido.formState.errors.numPedido && <p className="text-xs text-red-600">{String(formPedido.formState.errors.numPedido.message)}</p>}</div>
                <Button type="submit" disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? "Buscando..." : "Buscar"}</Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">GET /v3/tracking/byNumPedido/{"{cnpj}"}/{"{numPedido}"}/json</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {result && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              Resultado
              <Badge className={result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200" : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200"}>{result.status}</Badge>
              {result.ok && Array.isArray(result.data?.conhecimentos) && <span className="text-xs font-normal text-muted-foreground">{result.data.conhecimentos.length} conhecimento(s)</span>}
            </CardTitle>
            {!result.ok && result.data?.message && <CardDescription className="text-red-600 dark:text-red-400">{result.data.message}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.ok && (
              <JsonViewer data={result.data} title="Erro" />
            )}

            {result.ok && Array.isArray(result.data?.conhecimentos) && (
              <Tabs defaultValue="visual">
                <TabsList>
                  <TabsTrigger value="visual">Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="visual" className="space-y-4 mt-4">
                  {result.data.conhecimentos.map((c: any, idx: number) => (
                    <div key={idx} className="border rounded-xl overflow-hidden shadow-sm bg-card">
                      <div className="px-4 py-3 bg-muted/20 border-b flex flex-wrap gap-2 items-center justify-between">
                        <span className="font-mono font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />AWB {c.numero}</span>
                        <Badge className={statusVariant(c.status)}>{c.status}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{c.origem} <ArrowRight className="h-3 w-3" /> {c.cidade}/{c.uf}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Remetente</div><div className="text-xs font-medium truncate">{c.remetente}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Destinatário</div><div className="text-xs font-medium truncate">{c.destinatario}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" />Volumes / Peso</div><div className="text-xs font-medium">{c.volumes} • {c.peso}kg</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Frete</div><div className="text-xs font-bold">R$ {c.totalFrete}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Previsão</div><div className="text-xs">{c.previsaoEntrega}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Entrega</div><div className="text-xs">{c.dataEntrega || "-"}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Última ocorrência</div><div className="text-xs truncate">{c.ultimaOcorrencia}</div></div>
                          <div className="p-2 rounded-lg border bg-muted/20"><div className="text-[11px] text-muted-foreground">Data</div><div className="text-xs">{c.dataOcorrencia}</div></div>
                        </div>

                        {c.timeline && c.timeline.length > 0 && (
                          <div className="rounded-lg border bg-card p-3">
                            <div className="font-medium text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Timeline</div>
                            <div className="mt-3 relative pl-6 space-y-3">
                              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-primary/10 rounded" />
                              {c.timeline.map((t: any, i: number) => (
                                <div key={i} className="relative flex gap-3">
                                  <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-4 ${i === 0 ? "bg-primary ring-primary/20" : "bg-muted-foreground/40 ring-muted/20"}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium">{t.descricao}</div>
                                    <div className="text-xs text-muted-foreground">{t.data}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {c.ocorrencias && c.ocorrencias.length > 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-500/10 dark:bg-amber-950/20 p-3">
                            <div className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /> Ocorrências</div>
                            <div className="mt-2 space-y-1">
                              {c.ocorrencias.map((o: any, i: number) => <div key={i} className="text-xs"><span className="font-medium">{o.descricao}</span> <span className="text-muted-foreground">— {o.data}</span></div>)}
                            </div>
                          </div>
                        )}

                        {c.notasFiscais?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1"><PackageCheck className="h-3 w-3" />Notas:</span>
                            {c.notasFiscais.map((n: any, i: number) => <Badge key={i} className="font-mono text-xs border">{n.serie}-{n.numero}</Badge>)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {result.data.conhecimentos.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border rounded-xl bg-muted/20 flex flex-col items-center gap-2"><Package className="h-8 w-8 opacity-40" />Nenhum conhecimento encontrado (verifique período 90 dias)</div>}
                </TabsContent>
                <TabsContent value="json" className="mt-4">
                  <JsonViewer data={result.data} title="Response JSON" />
                </TabsContent>
              </Tabs>
            )}

            {result.ok && !result.data?.conhecimentos && <JsonViewer data={result.data} title="Resposta" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
