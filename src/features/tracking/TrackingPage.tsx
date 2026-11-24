import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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
import { Search, Package, Clock, AlertTriangle, MapPin, Truck, CheckCircle2, XCircle, ArrowRight, PackageCheck, Building2, CalendarDays, CircleDollarSign, X } from "lucide-react";
import { fetchClienteNome } from "@/lib/clienteCache";
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl, useApiEnvironmentStore } from "@/store/apiEnvironmentStore";

function statusVariant(status: string) {
  const s = status?.toLowerCase() || "";
  if (s.includes("entreg") || s.includes("finaliz")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200";
  if (s.includes("transito") || s.includes("trânsito") || s.includes("em trans")) return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200";
  if (s.includes("colet")) return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200";
  if (s.includes("extrav") || s.includes("ocorr")) return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200";
  return "bg-primary/10 text-primary border-primary/20";
}

function formatCurrency(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount) : String(value);
}

function displayValue(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

type TrackingEvent = {
  descricao?: unknown;
  data?: unknown;
  secondaryName?: unknown;
  secundaryName?: unknown;
};

type TrackingDocument = {
  numero?: unknown;
  serie?: unknown;
  emissao?: unknown;
  tipo?: unknown;
};

type TrackingRecord = {
  key: string;
  label: string;
  data: Record<string, unknown>;
  timeLine: TrackingEvent[];
  ocorrenciasDetalhe: TrackingEvent[];
  documents: TrackingDocument[];
  documentsLabel: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trackingEvents(value: unknown): TrackingEvent[] {
  return Array.isArray(value)
    ? value.filter((event): event is TrackingEvent => typeof event === "object" && event !== null)
    : [];
}

function trackingDocuments(value: unknown): TrackingDocument[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function trackingRecords(value: unknown): TrackingRecord[] {
  if (!isRecord(value)) return [];

  if (Array.isArray(value.notasFiscais)) {
    return value.notasFiscais.flatMap((entry, index) => {
      if (!isRecord(entry)) return [];
      const notaFiscal = isRecord(entry.notaFiscal) ? entry.notaFiscal : {};
      const serie = displayValue(notaFiscal.serie);
      const numero = displayValue(notaFiscal.numero);
      return [{
        key: `nf-${serie}-${numero}-${index}`,
        label: `Nota Fiscal ${serie !== "—" ? `${serie}-` : ""}${numero}`,
        data: notaFiscal,
        timeLine: trackingEvents(entry.timeLine ?? entry.timeline),
        ocorrenciasDetalhe: trackingEvents(entry.ocorrenciasDetalhe),
        documents: trackingDocuments(entry.conhecimentos),
        documentsLabel: "Conhecimentos vinculados",
      }];
    });
  }

  if (Array.isArray(value.conhecimentos)) {
    return value.conhecimentos.flatMap((entry, index) => {
      if (!isRecord(entry)) return [];
      return [{
        key: `cte-${displayValue(entry.numero)}-${index}`,
        label: `Conhecimento ${displayValue(entry.numero)}`,
        data: entry,
        timeLine: trackingEvents(entry.timeLine ?? entry.timeline),
        ocorrenciasDetalhe: trackingEvents(entry.ocorrenciasDetalhe),
        documents: trackingDocuments(entry.notasFiscais),
        documentsLabel: "Notas fiscais",
      }];
    });
  }

  return [];
}

function trackingEventDetail(event: TrackingEvent) {
  const detail = event.secondaryName ?? event.secundaryName;
  if (detail === null || detail === undefined || detail === "") return "";
  return String(detail).replace(/<br\s*\/?>/gi, " · ").replace(/<\/?[^>]+>/g, "").trim();
}

function TrackingEventList({ events, includeDetail = false }: { events: TrackingEvent[]; includeDetail?: boolean }) {
  if (events.length === 0) {
    return <p className="tracking-history-empty">Nenhum evento disponível.</p>;
  }

  return (
    <ol className="tracking-event-list">
      {events.map((event, index) => {
        const detail = includeDetail ? trackingEventDetail(event) : "";
        return (
          <li className="tracking-event-item" key={`${displayValue(event.data)}-${index}`}>
            <span className="tracking-event-title">{displayValue(event.descricao)}</span>
            <time className="tracking-event-time">{displayValue(event.data)}</time>
            {detail && <span className="tracking-event-detail">{detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function TrackingPage() {
  const { basic, cred } = useAuthStore();
  const { environment } = useApiEnvironmentStore();
  const apiBaseUrl = getApiBaseUrl(environment);
  const [tab, setTab] = useState("byNf");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeHistory, setActiveHistory] = useState<{ numero: string; timeLine: TrackingEvent[]; ocorrenciasDetalhe: TrackingEvent[] } | null>(null);
  const [historyTab, setHistoryTab] = useState("timeline");
  const [returnType] = useState("json");
  const [searchParams, setSearchParams] = useSearchParams();
  const records = trackingRecords(result?.data);
  const hasTrackingRecords = Array.isArray(result?.data?.notasFiscais) || Array.isArray(result?.data?.conhecimentos);

  const syncParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const formNf = useForm({ resolver: zodResolver(trackingByNfSchema), defaultValues: { cnpj: searchParams.get("cnpj") || "", notaFiscal: searchParams.get("nf") || "" } });
  const formPedido = useForm({ resolver: zodResolver(trackingByPedidoSchema), defaultValues: { cnpj: searchParams.get("cnpj") || "", numPedido: searchParams.get("pedido") || "" } });

  const cnpjNfWatch = formNf.watch("cnpj") || "";
  const cnpjPedidoWatch = formPedido.watch("cnpj") || "";
  const { data: nomeNf } = useQuery({ queryKey: ["cliente_cache", cnpjNfWatch], queryFn: () => fetchClienteNome(cnpjNfWatch), enabled: cnpjNfWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });
  const { data: nomePedido } = useQuery({ queryKey: ["cliente_cache", cnpjPedidoWatch], queryFn: () => fetchClienteNome(cnpjPedidoWatch), enabled: cnpjPedidoWatch.replace(/\D/g,"").length === 14, staleTime: 5*60*1000 });

  useEffect(() => {
    if (cred?.usuario) {
      const cnpj = cred.usuario.split("_")[0].replace(/\D/g, "");
      if (cnpj.length === 14) {
        formNf.setValue("cnpj", cnpj, { shouldValidate: true, shouldDirty: true });
        formPedido.setValue("cnpj", cnpj, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [cred?.usuario]);

  useEffect(() => {
    if (!activeHistory) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveHistory(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeHistory]);

  const onSearch = async (tipo: "byNf" | "byNumPedido", cnpj: string, valor: string) => {
    if (!basic) { toast.error("Selecione uma credencial."); return; }
    setActiveHistory(null);
    setLoading(true);
    const cnpjDigits = cnpj.replace(/\D/g, "");
    syncParam("cnpj", cnpjDigits);
    syncParam(tipo === "byNf" ? "nf" : "pedido", valor);
    try {
      const res = (window as any).api
        ? await (window as any).api.callTracking({ basic, cnpj: cnpjDigits, valor, tipo, returnType, environment })
        : await fetch(`${apiBaseUrl}/v4/tracking/${tipo}/${cnpjDigits}/${valor}/${returnType}`, { headers: { Authorization: `Basic ${basic}` } }).then(async (r) => {
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
          <TabsTrigger value="byNf">Por Nota Fiscal (v4)</TabsTrigger>
          <TabsTrigger value="byNumPedido">Por Nº Pedido (v4)</TabsTrigger>
        </TabsList>

        <TabsContent value="byNf">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Tracking por Nota Fiscal</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={formNf.handleSubmit((d) => onSearch("byNf", d.cnpj, d.notaFiscal))} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <div>
                  <Label htmlFor="trk-nf-cnpj">CNPJ Tomador *</Label><Input id="trk-nf-cnpj" {...formNf.register("cnpj")} />
                  {nomeNf && <div className="flex items-center gap-1 text-xs text-primary mt-1"><Building2 className="h-3 w-3" />{nomeNf}</div>}
                  {formNf.formState.errors.cnpj && <p className="text-xs text-red-600">{String(formNf.formState.errors.cnpj.message)}</p>}
                </div>
                <div><Label htmlFor="trk-nf-nota">Nota Fiscal *</Label><Input id="trk-nf-nota" {...formNf.register("notaFiscal")} />{formNf.formState.errors.notaFiscal && <p className="text-xs text-red-600">{String(formNf.formState.errors.notaFiscal.message)}</p>}</div>
                <Button type="submit" disabled={loading} className="action-button w-full md:mt-6 md:w-auto"><Search className="h-4 w-4 mr-2" />{loading ? "Buscando..." : "Buscar"}</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="byNumPedido">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" /> Tracking por Nº Pedido</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={formPedido.handleSubmit((d) => onSearch("byNumPedido", d.cnpj, d.numPedido))} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                <div>
                  <Label htmlFor="trk-ped-cnpj">CNPJ Tomador *</Label><Input id="trk-ped-cnpj" {...formPedido.register("cnpj")} />
                  {nomePedido && <div className="flex items-center gap-1 text-xs text-primary mt-1"><Building2 className="h-3 w-3" />{nomePedido}</div>}
                  {formPedido.formState.errors.cnpj && <p className="text-xs text-red-600">{String(formPedido.formState.errors.cnpj.message)}</p>}
                </div>
                <div><Label htmlFor="trk-ped-num">Nº Pedido *</Label><Input id="trk-ped-num" {...formPedido.register("numPedido")} />{formPedido.formState.errors.numPedido && <p className="text-xs text-red-600">{String(formPedido.formState.errors.numPedido.message)}</p>}</div>
                <Button type="submit" disabled={loading} className="action-button w-full md:mt-6 md:w-auto"><Search className="h-4 w-4 mr-2" />{loading ? "Buscando..." : "Buscar"}</Button>
              </form>
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
              {result.ok && hasTrackingRecords && (
                <span className="text-xs font-normal text-muted-foreground">
                  {records.length} {Array.isArray(result.data?.notasFiscais) ? "nota(s) fiscal(is)" : "conhecimento(s)"}
                </span>
              )}
            </CardTitle>
            {!result.ok && result.data?.message && <CardDescription className="text-red-600 dark:text-red-400">{result.data.message}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!result.ok && (
              <JsonViewer data={result.data} title="Erro" />
            )}

            {result.ok && hasTrackingRecords && (
              <Tabs defaultValue="visual">
                <TabsList>
                  <TabsTrigger value="visual">Visual</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="visual" className="space-y-4 mt-4">
                  {records.map((record) => {
                    const c = record.data;
                    const { timeLine: timeline, ocorrenciasDetalhe: occurrences } = record;
                    const status = c.ultimaOcorrencia || c.statusEntrega || c.status;
                    const origem = [c.cidadeColeta || c.origem, c.ufColeta].filter(Boolean).join("/");
                    const destino = [c.cidade || c.destino, c.uf].filter(Boolean).join("/");
                    const hasRoute = Boolean(origem || destino);
                    const hasVolumesOrWeight = c.volumes !== undefined || c.peso !== undefined;
                    const tipoFrete = c.tipoFrete === undefined || c.tipoFrete === null || c.tipoFrete === ""
                      ? ""
                      : String(c.tipoFrete);
                    const stats = [
                      { label: "Emissão", value: displayValue(c.emissao), icon: CalendarDays },
                      { label: "Previsão de entrega", value: displayValue(c.previsaoEntrega), icon: CalendarDays },
                      { label: "Entrega realizada", value: displayValue(c.dataEntrega), icon: CheckCircle2 },
                      ...(hasVolumesOrWeight ? [{ label: "Volumes / peso", value: `${displayValue(c.volumes)} • ${displayValue(c.peso)} kg`, icon: Package }] : []),
                      ...(c.totalFrete !== undefined ? [{ label: "Frete", value: formatCurrency(c.totalFrete), icon: CircleDollarSign }] : []),
                    ];
                    return (
                    <div key={record.key} className="border rounded-xl overflow-hidden shadow-sm bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                        <span className="flex items-center gap-2 font-mono font-bold">
                          {record.documentsLabel === "Conhecimentos vinculados"
                            ? <Package className="h-4 w-4 text-primary" />
                            : <Truck className="h-4 w-4 text-primary" />}
                          {record.label}
                        </span>
                        {status !== undefined && status !== null && status !== "" && <Badge className={statusVariant(String(status))}>{displayValue(status)}</Badge>}
                        {hasRoute && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary" />{displayValue(origem)} <ArrowRight className="h-3 w-3" /> {displayValue(destino)}</span>}
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {stats.map(({ label, value, icon: Icon }) => (
                            <div key={label} className="rounded-lg border bg-muted/20 p-2.5">
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
                              <div className="mt-1 text-sm font-semibold">{value}</div>
                            </div>
                          ))}
                        </div>

                        {c.ultimaOcorrencia !== undefined && c.ultimaOcorrencia !== null && c.ultimaOcorrencia !== "" && (
                          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2.5">
                            <div className="flex min-w-0 items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              <div className="min-w-0">
                                <div className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Última ocorrência</div>
                                <div className="text-sm font-semibold">{displayValue(c.ultimaOcorrencia)}</div>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">{displayValue(c.dataOcorrencia)}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                          <div className="flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2">
                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0"><span className="text-muted-foreground">Remetente</span><div className="font-medium">{displayValue(c.remetente)}</div></div>
                          </div>
                          <div className="flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2">
                            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0"><span className="text-muted-foreground">Destinatário</span><div className="font-medium">{displayValue(c.destinatario)}</div></div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                        {c.valorMercantil !== undefined && (
                          <span className="text-xs text-muted-foreground">Valor mercantil: <strong className="font-medium text-foreground">{formatCurrency(c.valorMercantil)}</strong></span>
                        )}
                        {tipoFrete && <span className="text-xs text-muted-foreground">Tipo de frete: <strong className="font-medium text-foreground">{tipoFrete}</strong></span>}
                        {record.documents.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground"><PackageCheck className="h-3 w-3" />{record.documentsLabel}:</span>
                            {record.documents.map((document, index) => (
                              <Badge key={`${displayValue(document.numero)}-${index}`} className="border font-mono text-xs">
                                {record.documentsLabel === "Conhecimentos vinculados" ? "CTe " : ""}
                                {displayValue(document.serie) !== "—" ? `${displayValue(document.serie)}-` : ""}
                                {displayValue(document.numero)}
                                {document.tipo !== undefined && document.tipo !== null && document.tipo !== "" ? ` · ${String(document.tipo)}` : ""}
                                {document.emissao !== undefined && document.emissao !== null && document.emissao !== "" ? ` · ${String(document.emissao)}` : ""}
                              </Badge>
                            ))}
                            </div>
                          )}
                          {(timeline.length > 0 || occurrences.length > 0) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="tracking-history-trigger"
                              aria-haspopup="dialog"
                              onClick={() => {
                                setHistoryTab(timeline.length ? "timeline" : "occurrences");
                                setActiveHistory({ numero: record.label, timeLine: timeline, ocorrenciasDetalhe: occurrences });
                              }}
                            >
                              <Clock className="mr-1.5 h-4 w-4" />
                              Linha do tempo ({timeline.length + occurrences.length})
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {records.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border rounded-xl bg-muted/20 flex flex-col items-center gap-2"><Package className="h-8 w-8 opacity-40" />Nenhum resultado de rastreamento encontrado</div>}
                </TabsContent>
                <TabsContent value="json" className="mt-4">
                  <JsonViewer data={result.data} title="Response JSON" />
                </TabsContent>
              </Tabs>
            )}

            {result.ok && !hasTrackingRecords && <JsonViewer data={result.data} title="Resposta" />}
          </CardContent>
        </Card>
      )}

      {activeHistory && createPortal(
        <div
          className="credential-drawer-overlay tracking-history-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveHistory(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="tracking-history-title"
            className="tracking-history-panel"
          >
            <header className="credential-drawer-header">
              <div>
                <span className="credential-drawer-kicker">Rastreamento</span>
                <h2 id="tracking-history-title">Histórico de movimentações</h2>
                <p>{activeHistory.numero}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="credential-drawer-close"
                onClick={() => setActiveHistory(null)}
                aria-label="Fechar histórico"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="credential-drawer-body tracking-history-body">
              <Tabs value={historyTab} onValueChange={setHistoryTab}>
                <TabsList aria-label={`Histórico de ${activeHistory.numero}`}>
                  <TabsTrigger value="timeline">Linha do tempo ({activeHistory.timeLine.length})</TabsTrigger>
                  {activeHistory.ocorrenciasDetalhe.length > 0 && (
                    <TabsTrigger value="occurrences">Ocorrências ({activeHistory.ocorrenciasDetalhe.length})</TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="timeline">
                  <TrackingEventList events={activeHistory.timeLine} includeDetail />
                </TabsContent>
                <TabsContent value="occurrences">
                  <TrackingEventList events={activeHistory.ocorrenciasDetalhe} />
                </TabsContent>
              </Tabs>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}
