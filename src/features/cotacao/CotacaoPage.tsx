import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cotacaoSchema } from "@/lib/validators";
import { buildCurlCotacao } from "@/lib/braspress";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JsonViewer, XmlViewer } from "@/components/ui/json-viewer";
import { Plus, Trash2, Copy, Calculator, Truck, Hash, BadgeDollarSign, AlertTriangle, CheckCircle2, XCircle, MapPin, Loader2, Building2 } from "lucide-react";
import { lookupCepByCNPJ } from "@/lib/cnpj";
import { fetchClienteNome } from "@/lib/clienteCache";
import { useQuery } from "@tanstack/react-query";

export function CotacaoPage() {
  const { basic, cred } = useAuthStore();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [returnType, setReturnType] = useState<"json" | "xml">("json");
  const [resultTab, setResultTab] = useState("visual");

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
    resolver: zodResolver(cotacaoSchema),
    defaultValues: {
      cnpjRemetente: "60701190000104",
      cnpjDestinatario: "30539356867",
      modal: "R",
      tipoFrete: "1",
      cepOrigem: "02323000",
      cepDestino: "07093090",
      vlrMercadoria: 100,
      peso: 50.55,
      volumes: 10,
      cubagem: [{ comprimento: 0.67, largura: 0.67, altura: 0.46, volumes: 10 }],
    },
  });

  useEffect(() => {
    if (cred?.usuario) {
      const cnpj = cred.usuario.split("_")[0].replace(/\D/g, "");
      if (cnpj.length === 14) setValue("cnpjRemetente", cnpj, { shouldValidate: true, shouldDirty: true });
    }
  }, [cred?.usuario, setValue]);

  // Auto CEP via CNPJ - BrasilAPI + fallback publica.cnpj.ws, com debounce, normalização e toast
  const [cepLoading, setCepLoading] = useState<"origem" | "destino" | null>(null);
  const cepTimers = useRef<{ origem: any; destino: any }>({ origem: null, destino: null });
  const cepAbort = useRef<{ origem: AbortController | null; destino: AbortController | null }>({ origem: null, destino: null });

  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (name === "cnpjRemetente") {
        const raw = String(values.cnpjRemetente || "");
        const digits = raw.replace(/\D/g, "");
        if (digits.length === 14) {
          if (cepTimers.current.origem) clearTimeout(cepTimers.current.origem);
          if (cepAbort.current.origem) cepAbort.current.origem.abort();
          const ctrl = new AbortController();
          cepAbort.current.origem = ctrl;
          setCepLoading("origem");
          cepTimers.current.origem = setTimeout(async () => {
            try {
              const cep = await lookupCepByCNPJ(digits, ctrl.signal);
              if (cep) {
                setValue("cepOrigem", cep, { shouldValidate: true, shouldDirty: true });
              } else {
                console.warn(`[CEP] não encontrado para CNPJ ${digits}`);
              }
            } catch (e: any) {
              if (e?.name !== "AbortError") console.warn(`[CEP] erro CNPJ ${digits}:`, e?.message);
            }
            setCepLoading(null);
          }, 500);
        }
      }
      if (name === "cnpjDestinatario") {
        const c = String(values.cnpjDestinatario || "").replace(/\D/g, "");
        if (c.length === 14) {
          if (cepTimers.current.destino) clearTimeout(cepTimers.current.destino);
          if (cepAbort.current.destino) cepAbort.current.destino.abort();
          const ctrl = new AbortController();
          cepAbort.current.destino = ctrl;
          setCepLoading("destino");
          cepTimers.current.destino = setTimeout(async () => {
            try {
              const cep = await lookupCepByCNPJ(c, ctrl.signal);
              if (cep) setValue("cepDestino", cep, { shouldValidate: true, shouldDirty: true });
            } catch {}
            setCepLoading(null);
          }, 500);
        } else if (c.length === 11) {
          // CPF 11 dígitos -> manual, não busca
        }
      }
    });
    return () => {
      sub.unsubscribe();
      if (cepTimers.current.origem) clearTimeout(cepTimers.current.origem);
      if (cepTimers.current.destino) clearTimeout(cepTimers.current.destino);
    };
  }, [watch, setValue]);

  // Busca inicial no mount para CNPJ padrão 60701190000104 (Itaú) e para cred selecionado
  useEffect(() => {
    const init = async () => {
      const cnpjRem = String(watch("cnpjRemetente") || "").replace(/\D/g, "");
      if (cnpjRem && cnpjRem.length === 14) {
        const cep = await lookupCepByCNPJ(cnpjRem).catch(() => null);
        if (cep) setValue("cepOrigem", cep, { shouldValidate: true });
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { fields, append, remove } = useFieldArray({ control, name: "cubagem" });
  const values = watch();
  const cubagemValues = watch("cubagem") || [];
  const totalVolumes = cubagemValues.reduce((s: number, c: any) => s + (Number(c?.volumes) || 0), 0);

  const cnpjRemetenteWatch = watch("cnpjRemetente") || "";
  const cnpjDestinatarioWatch = watch("cnpjDestinatario") || "";
  const { data: nomeRemetente } = useQuery({ queryKey: ["cliente_cache", cnpjRemetenteWatch], queryFn: () => fetchClienteNome(cnpjRemetenteWatch), enabled: cnpjRemetenteWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });
  const { data: nomeDestinatario } = useQuery({ queryKey: ["cliente_cache", cnpjDestinatarioWatch], queryFn: () => fetchClienteNome(cnpjDestinatarioWatch), enabled: cnpjDestinatarioWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });

  // Sincroniza volumes = soma cubagem[].volumes (não editável manual)
  useEffect(() => {
    setValue("volumes", totalVolumes || 0, { shouldValidate: true, shouldDirty: true });
  }, [totalVolumes, setValue]);

  const onSubmit = async (data: any) => {
    if (!basic) { alert("Selecione uma credencial primeiro"); return; }
    setLoading(true);
    try {
      const payload = { ...data, cnpjRemetente: String(data.cnpjRemetente).replace(/\D/g, ""), cnpjDestinatario: String(data.cnpjDestinatario).replace(/\D/g, ""), cepOrigem: String(data.cepOrigem).replace(/\D/g, ""), cepDestino: String(data.cepDestino).replace(/\D/g, "") };
      const res = (window as any).api
        ? await (window as any).api.callCotacao({ basic, payload, returnType })
        : await fetch(`https://api.braspress.com/v1/cotacao/calcular/${returnType}`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(async (r) => {
            const text = await r.text();
            let data: any;
            try { data = JSON.parse(text); } catch {
              if (returnType === "xml" && text.trim().startsWith("<")) {
                try { const { XMLParser } = await import("fast-xml-parser"); const p = new XMLParser({ ignoreAttributes: false }).parse(text); const flat = p?.cotacao || p?.response || p; if (flat?.id || flat?.prazo) data = { id: String(flat.id ?? ""), prazo: Number(flat.prazo ?? 0), totalFrete: Number(flat.totalFrete ?? 0), _rawXml: text }; else data = text; } catch { data = text; }
              } else data = text;
            }
            return { status: r.status, ok: r.ok, data, raw: text };
          });
      setResult(res);
      setResultTab("visual");
    } catch (e: any) { setResult({ status: 0, ok: false, data: { message: e.message } }); }
    setLoading(false);
  };

  const isSuccess = result?.ok && result?.data && typeof result.data === "object" && "totalFrete" in result.data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Cotação de Frete</CardTitle><CardDescription>Teste de cálculo com autenticação Basic • CEP auto via CNPJ (BrasilAPI)</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CNPJ Remetente *</Label><Input {...register("cnpjRemetente")} placeholder="60701190000104" />
                {nomeRemetente && <div className="flex items-center gap-1 text-xs text-primary mt-1"><Building2 className="h-3 w-3" />{nomeRemetente}</div>}
                {errors.cnpjRemetente && <p className="text-xs text-red-600">{String(errors.cnpjRemetente.message)}</p>}
              </div>
              <div>
                <Label>CNPJ Destinatário *</Label><Input {...register("cnpjDestinatario")} placeholder="CPF ou CNPJ" />
                {nomeDestinatario && <div className="flex items-center gap-1 text-xs text-primary mt-1"><Building2 className="h-3 w-3" />{nomeDestinatario}</div>}
                {errors.cnpjDestinatario && <p className="text-xs text-red-600">{String(errors.cnpjDestinatario.message)}</p>}
              </div>
            </div>
            {watch("tipoFrete") === "3" && <div><Label>CNPJ Consignado *</Label><Input {...register("cnpjConsignado")} />{errors.cnpjConsignado && <p className="text-xs text-red-600">{String(errors.cnpjConsignado.message)}</p>}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Modal</Label><select {...register("modal")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="R">Rodoviário (R)</option><option value="A">Aéreo (A)</option></select></div>
              <div><Label>Tipo Frete</Label><select {...register("tipoFrete")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="1">1 - CIF</option><option value="2">2 - FOB</option><option value="3">3 - Consignado</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">CEP Origem * <span className="text-muted-foreground font-normal">auto via CNPJ</span> {cepLoading === "origem" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}</Label>
                <div className="relative">
                  <Input {...register("cepOrigem")} placeholder="02323000" className="pr-8" />
                  <MapPin className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
                {errors.cepOrigem && <p className="text-xs text-red-600">{String(errors.cepOrigem.message)}</p>}
              </div>
              <div>
                <Label className="flex items-center gap-1">CEP Destino * <span className="text-muted-foreground font-normal">auto se CNPJ</span> {cepLoading === "destino" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}</Label>
                <div className="relative">
                  <Input {...register("cepDestino")} placeholder="07093090" className="pr-8" />
                  <MapPin className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  {watch("cnpjDestinatario")?.replace(/\D/g,"").length === 11 && <span className="absolute right-8 top-2 text-[10px] bg-muted px-1 rounded">CPF manual</span>}
                </div>
                {errors.cepDestino && <p className="text-xs text-red-600">{String(errors.cepDestino.message)}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Vlr Mercadoria *</Label><Input type="number" step="0.01" {...register("vlrMercadoria")} />{errors.vlrMercadoria && <p className="text-xs text-red-600">{String(errors.vlrMercadoria.message)}</p>}</div>
              <div><Label>Peso *</Label><Input type="number" step="0.01" {...register("peso")} />{errors.peso && <p className="text-xs text-red-600">{String(errors.peso.message)}</p>}</div>
              <div>
                <Label className="flex items-center gap-1">Volumes * <span className="text-muted-foreground font-normal">(soma cubagem)</span></Label>
                <Input type="number" value={totalVolumes} readOnly className="bg-muted font-medium" tabIndex={-1} />
                <input type="hidden" {...register("volumes")} />
                {errors.volumes && <p className="text-xs text-red-600">{String(errors.volumes.message)}</p>}
                <p className="text-[11px] text-muted-foreground mt-1">Automático = soma de cubagem.volumes ({cubagemValues.length} item{cubagemValues.length!==1?"s":""})</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center"><Label>Cubagem (metros)</Label><Button type="button" variant="outline" size="sm" onClick={() => append({ comprimento: 0.5, largura: 0.5, altura: 0.5, volumes: 1 })}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-5 gap-2 items-end border p-2 rounded-lg bg-muted/20">
                  <div><Label className="text-xs">Comp.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.comprimento`)} /></div>
                  <div><Label className="text-xs">Larg.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.largura`)} /></div>
                  <div><Label className="text-xs">Alt.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.altura`)} /></div>
                  <div><Label className="text-xs">Vols</Label><Input type="number" {...register(`cubagem.${i}.volumes`)} /></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <Label>Retorno:</Label>
              <select value={returnType} onChange={(e) => setReturnType(e.target.value as any)} className="h-9 rounded-md border border-input bg-background text-foreground px-3 text-sm focus:ring-1 focus:ring-ring"><option value="json">json</option><option value="xml">xml</option></select>
              <span className="text-xs text-muted-foreground">json: cards + viewer • xml: normalizado + raw</span>
            </div>

            <Button type="submit" disabled={loading} className="w-full">{loading ? "Calculando..." : "Calcular Frete"}</Button>
            {!basic && <p className="text-xs text-amber-600 text-center">Selecione uma credencial no topo para habilitar.</p>}
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Preview Payload</CardTitle><CardDescription>Body que será enviado à API</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <JsonViewer data={values} title="JSON Payload" defaultCollapsed={false} />
            <Button variant="outline" size="sm" onClick={() => { if (!basic) return; const payload = values as any; navigator.clipboard.writeText(buildCurlCotacao(basic, payload, returnType)); }}><Copy className="h-4 w-4 mr-1" />Copiar cURL</Button>
          </CardContent>
        </Card>

        {result && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                Resultado
                <Badge className={result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200" : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200"}>{result.status}</Badge>
              </CardTitle>
              {!result.ok && result.data?.message && <CardDescription className="text-red-600 dark:text-red-400">{result.data.message}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
              {isSuccess ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border bg-gradient-to-br from-primary/5 to-transparent text-center shadow-sm">
                    <BadgeDollarSign className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
                    <div className="text-xs text-muted-foreground">Total Frete</div><div className="text-lg font-bold">R$ {String(result.data.totalFrete)}</div>
                  </div>
                  <div className="p-4 rounded-xl border bg-gradient-to-br from-primary/5 to-transparent text-center shadow-sm">
                    <Truck className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <div className="text-xs text-muted-foreground">Prazo</div><div className="text-lg font-bold">{String(result.data.prazo)} dias</div>
                  </div>
                  <div className="p-4 rounded-xl border bg-gradient-to-br from-primary/5 to-transparent text-center shadow-sm">
                    <Hash className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">ID Cotação</div><div className="font-mono text-xs truncate font-medium">{String(result.data.id)}</div>
                  </div>
                </div>
              ) : !result.ok ? (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
                    <div className="font-medium">Erro {result.data?.statusCode || result.status}: {result.data?.message || "Falha na cotação"}</div>
                    {result.data?.dateTime && <div className="text-red-600/80">{result.data.dateTime}</div>}
                  </div>
                </div>
              ) : null}

              <Tabs value={resultTab} onValueChange={setResultTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="visual">Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                  <TabsTrigger value="raw">{returnType === "xml" ? "XML" : "Raw"}</TabsTrigger>
                </TabsList>
                <TabsContent value="visual">
                  {isSuccess ? (
                    <div className="text-xs text-muted-foreground p-3 border rounded-lg bg-muted/20">Visual acima já resume os 3 campos principais. Use a aba JSON para inspeção completa.</div>
                  ) : (
                    <JsonViewer data={result.data} title="Resposta" />
                  )}
                </TabsContent>
                <TabsContent value="json">
                  <JsonViewer data={result.data} title={returnType === "xml" ? "XML normalizado → JSON" : "Response JSON"} />
                </TabsContent>
                <TabsContent value="raw">
                  {returnType === "xml" && typeof result.raw === "string" && result.raw.trim().startsWith("<") ? (
                    <XmlViewer xml={result.raw} title="XML Raw" />
                  ) : (
                    <JsonViewer data={result.raw || result.data} title="Raw" />
                  )}
                </TabsContent>
              </Tabs>

              {result.data?.errorList && (
                <JsonViewer data={result.data.errorList} title="errorList" defaultCollapsed={true} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
