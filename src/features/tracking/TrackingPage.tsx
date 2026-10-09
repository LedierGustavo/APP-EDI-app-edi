import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trackingByNfSchema, trackingByPedidoSchema } from "@/lib/validators";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Clock, AlertTriangle } from "lucide-react";

export function TrackingPage() {
  const { basic, cred } = useAuthStore();
  const [tab, setTab] = useState("byNf");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [returnType] = useState("json");

  const formNf = useForm({ resolver: zodResolver(trackingByNfSchema), defaultValues: { cnpj: "", notaFiscal: "" } });
  const formPedido = useForm({ resolver: zodResolver(trackingByPedidoSchema), defaultValues: { cnpj: "", numPedido: "" } });

  // Auto-preenche CNPJ Tomador com o usuário selecionado
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
      const res = (window as any).api ? await (window as any).api.callTracking({ basic, cnpj: cnpjDigits, valor, tipo, returnType }) : await fetch(`https://api.braspress.com/v3/tracking/${tipo}/${cnpjDigits}/${valor}/${returnType}`, { headers: { Authorization: `Basic ${basic}` } }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => r.text()) }));
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
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Tracking por Nota Fiscal</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={formNf.handleSubmit((d) => onSearch("byNf", d.cnpj, d.notaFiscal))} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div><Label>CNPJ Tomador *</Label><Input {...formNf.register("cnpj")} placeholder="12345678912345" />{formNf.formState.errors.cnpj && <p className="text-xs text-red-600">{String(formNf.formState.errors.cnpj.message)}</p>}</div>
                <div><Label>Nota Fiscal *</Label><Input {...formNf.register("notaFiscal")} placeholder="12345" />{formNf.formState.errors.notaFiscal && <p className="text-xs text-red-600">{String(formNf.formState.errors.notaFiscal.message)}</p>}</div>
                <Button type="submit" disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? "Buscando..." : "Buscar"}</Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2">GET /v3/tracking/byNf/{"{cnpj}"}/{"{notaFiscal}"}/json • últimos 90 dias</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byNumPedido">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Tracking por Nº Pedido</CardTitle></CardHeader>
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
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">Resultado <Badge className={result.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>{result.status}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!result.ok && <pre className="text-xs bg-red-50 border border-red-200 p-3 rounded overflow-auto">{typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}</pre>}

            {result.ok && Array.isArray(result.data?.conhecimentos) && (
              <div className="space-y-4">
                {result.data.conhecimentos.map((c: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                      <span className="font-mono font-bold">AWB {c.numero}</span>
                      <Badge>{c.status}</Badge>
                      <span className="text-xs text-muted-foreground">{c.origem} → {c.cidade}/{c.uf}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Remetente:</span> {c.remetente}</div>
                      <div><span className="text-muted-foreground">Destinatário:</span> {c.destinatario}</div>
                      <div><span className="text-muted-foreground">Volumes:</span> {c.volumes} • {c.peso}kg</div>
                      <div><span className="text-muted-foreground">Frete:</span> R$ {c.totalFrete}</div>
                      <div><span className="text-muted-foreground">Previsão:</span> {c.previsaoEntrega}</div>
                      <div><span className="text-muted-foreground">Entrega:</span> {c.dataEntrega || "-"}</div>
                      <div><span className="text-muted-foreground">Última:</span> {c.ultimaOcorrencia}</div>
                      <div><span className="text-muted-foreground">Data:</span> {c.dataOcorrencia}</div>
                    </div>

                    {c.timeline && c.timeline.length > 0 && (
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Timeline</div>
                        <div className="mt-2 space-y-1 border-l-2 border-primary/20 pl-4">
                          {c.timeline.map((t: any, i: number) => (
                            <div key={i} className="text-xs"><span className="font-medium">{t.descricao}</span> <span className="text-muted-foreground">— {t.data}</span></div>
                          ))}
                        </div>
                      </div>
                    )}

                    {c.ocorrencias && c.ocorrencias.length > 0 && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded">
                        <div className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Ocorrências</div>
                        {c.ocorrencias.map((o: any, i: number) => <div key={i} className="text-xs mt-1">{o.descricao} — {o.data}</div>)}
                      </div>
                    )}

                    {c.notasFiscais && <div className="text-xs"><span className="font-medium">Notas:</span> {c.notasFiscais.map((n: any) => `${n.serie}-${n.numero}`).join(", ")}</div>}
                  </div>
                ))}
                {result.data.conhecimentos.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Nenhum conhecimento encontrado (verifique período 90 dias)</div>}
              </div>
            )}

            {result.ok && !result.data?.conhecimentos && <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[500px]">{typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}</pre>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
