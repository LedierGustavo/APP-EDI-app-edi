import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/ui/json-viewer";
import { CredencialEtiquetasSelector } from "@/features/rotacep/CredencialEtiquetasSelector";
import { fetchEtiquetaByCnpj } from "@/lib/credenciaisEtiquetas";
import { getApi } from "@/lib/ipc";
import { Copy, CheckCircle2, XCircle, Tags, Package, MapPin, Truck, Hash, ClipboardCheck } from "lucide-react";

const schema = z.object({
  cnpj: z.string().length(14, "Selecione uma credencial"),
  danfe: z.string().regex(/^\d{44}$/, "A DANFE deve conter exatamente 44 dígitos"),
  quantidade: z.number().int().min(1).max(999),
  cep: z.string().regex(/^\d{8}$/, "O CEP deve conter exatamente 8 dígitos"),
  tipoFrete: z.enum(["CIF", "FOB", "CONS"]),
});

type FormValues = z.infer<typeof schema>;

export function EtiquetaPage() {
  const [result, setResult] = useState<{ status: number; ok: boolean; data: unknown } | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cnpj: "", danfe: "", quantidade: 1, cep: "", tipoFrete: "CIF" },
  });
  const cnpj = form.watch("cnpj");
  const { data: credencial } = useQuery({
    queryKey: ["credenciais_etiquetas", cnpj],
    queryFn: () => fetchEtiquetaByCnpj(cnpj),
    enabled: cnpj.length === 14,
  });

  const onSubmit = async (values: FormValues) => {
    const api = getApi();
    if (!api) {
      toast.error("Esta função exige o aplicativo desktop.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await api.callEtiqueta({
        cnpj: values.cnpj,
        danfe: values.danfe,
        quantidade_volumes: values.quantidade,
        cep_destino: values.cep,
        tipo_frete: values.tipoFrete,
      });
      setResult(response);
      if (response.ok) toast.success("Etiquetas geradas com sucesso.");
      else toast.error("Falha ao gerar etiquetas.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Código copiado.");
  };

  const responseRecord = result?.data && typeof result.data === "object"
    ? result.data as Record<string, unknown>
    : null;
  const etiquetas = Array.isArray(responseRecord?.etiquetas)
    ? responseRecord.etiquetas.map(String)
    : [];

  return (
    <div className="space-y-4">
      <CredencialEtiquetasSelector
        value={cnpj}
        detail={credencial?.codigo_cliente ? `Código ${credencial.codigo_cliente}` : undefined}
        onSelect={(value) => form.setValue("cnpj", value, { shouldDirty: true, shouldValidate: true })}
      />
      <section className="service-content min-w-0 space-y-4">
        <Card>
          <CardHeader className="p-4 pb-3">
            <CardTitle className="flex items-center gap-2"><Tags className="h-5 w-5 text-primary" /> Dados da nota fiscal</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <Label htmlFor="et-danfe">DANFE (44 dígitos) *</Label>
                  <Input
                    id="et-danfe"
                    inputMode="numeric"
                    maxLength={44}
                    placeholder="42200707019308000128550210000389431320160372"
                    {...form.register("danfe")}
                    onChange={(e) => form.setValue("danfe", e.target.value.replace(/\D/g, "").slice(0, 44), { shouldDirty: true, shouldValidate: true })}
                  />
                  {form.formState.errors.danfe && <p className="mt-1 text-xs text-red-600">{form.formState.errors.danfe.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="et-volumes">Volumes *</Label>
                    <Input id="et-volumes" type="number" min={1} max={999} {...form.register("quantidade", { valueAsNumber: true })} />
                  </div>
                  <div>
                    <Label htmlFor="et-frete">Tipo de frete *</Label>
                    <select id="et-frete" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...form.register("tipoFrete")}>
                      <option value="CIF">CIF</option>
                      <option value="FOB">FOB</option>
                      <option value="CONS">CONS</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="et-cep">CEP de destino *</Label>
                  <Input
                    id="et-cep"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="09195430"
                    {...form.register("cep")}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                      form.setValue("cep", digits, { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                  {form.formState.errors.cep && <p className="mt-1 text-xs text-red-600">{form.formState.errors.cep.message}</p>}
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading || !credencial} className="w-full">
                    <Package className="mr-2 h-4 w-4" />
                    {loading ? "Gerando..." : "Gerar Etiquetas"}
                  </Button>
                </div>
              </div>
              {!credencial && cnpj.length === 14 && (
                <p className="text-xs text-amber-600">Credencial encontrada, mas confirme o código do cliente e a senha.</p>
              )}
            </form>
          </CardContent>
        </Card>

        {result && (
          <Card className="overflow-hidden">
            <CardHeader className={result.ok ? "border-b border-emerald-500/20 bg-emerald-500/[0.04] p-4" : "border-b border-red-500/20 bg-red-500/[0.04] p-4"}>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
                  {result.ok ? "Etiquetas geradas" : "Não foi possível gerar"}
                </span>
                <Badge className={result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-red-500/30 bg-red-500/10 text-red-700"}>
                  HTTP {result.status || "Erro"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Tabs defaultValue="visual">
                <TabsList className="mt-4"><TabsTrigger value="visual">Resumo visual</TabsTrigger><TabsTrigger value="json">Resposta JSON</TabsTrigger></TabsList>
                <TabsContent value="visual" className="mt-4">
                  {result.ok && responseRecord ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-xl border bg-muted/10 p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><MapPin className="h-4 w-4 text-primary" /> Filial destino</div>
                          <div className="text-2xl font-bold text-primary">{String(responseRecord.filial_destino ?? "—")}</div>
                        </div>
                        <div className="rounded-xl border bg-muted/10 p-4">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Truck className="h-4 w-4 text-primary" /> Rota de entrega</div>
                          <div className="text-2xl font-bold text-primary">{String(responseRecord.rota_entrega ?? "—")}</div>
                        </div>
                        <div className="rounded-xl border bg-muted/10 p-4 md:col-span-2 xl:col-span-1">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Hash className="h-4 w-4 text-primary" /> Protocolo</div>
                          <code className="break-all text-sm font-semibold">{String(responseRecord.protocolo ?? "—")}</code>
                        </div>
                      </div>
                      {etiquetas.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Etiquetas geradas ({etiquetas.length})</Label>
                            {etiquetas.length > 1 && (
                              <Button type="button" variant="outline" size="sm" onClick={() => copyText(etiquetas.join("\n"))}>
                                <Copy className="mr-2 h-4 w-4" /> Copiar todas
                              </Button>
                            )}
                          </div>
                          {etiquetas.map((etiqueta, index) => (
                            <div key={`${etiqueta}-${index}`} className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                              <code className="min-w-0 flex-1 select-all break-all font-mono text-sm font-semibold">{etiqueta}</code>
                              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => copyText(etiqueta)} aria-label={`Copiar etiqueta ${index + 1}`}><Copy className="h-4 w-4" /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {responseRecord?.message ? String(responseRecord.message) : "Falha ao gerar etiquetas."}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="json" className="mt-4"><JsonViewer data={result.data} title="Resposta da API" /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
