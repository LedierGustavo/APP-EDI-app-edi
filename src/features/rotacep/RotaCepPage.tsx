import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/ui/PasswordField";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { JsonViewer } from "@/components/ui/json-viewer";
import { Search, MapPin, CheckCircle2, XCircle, Building2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchClienteNome } from "@/lib/clienteCache";
import { fetchEtiquetaByCnpj, upsertEtiqueta } from "@/lib/credenciaisEtiquetas";
import { parseRotaCep } from "@/lib/rotaCepParser";
import { CredencialEtiquetasSelector } from "@/features/rotacep/CredencialEtiquetasSelector";
import * as z from "zod";

const cepSchema = z.object({
  cep: z.string().min(8, "CEP deve ter 8 dígitos").transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 8, "CEP deve ter 8 dígitos"),
  cnpj: z.string().min(14, "Selecione uma credencial"),
});

function statusVariant(msg: string) {
  const s = (msg || "").toLowerCase();
  if (s.includes("ok")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200";
  if (s.includes("erro") || s.includes("invalid")) return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200";
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="p-2 rounded-lg border bg-muted/20">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-medium truncate">{value || "—"}</div>
    </div>
  );
}

export function RotaCepPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editingSenha, setEditingSenha] = useState(false);
  const [senhaEdit, setSenhaEdit] = useState("");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const syncParam = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  };

  const form = useForm({ resolver: zodResolver(cepSchema), defaultValues: { cep: searchParams.get("cep") || "", cnpj: searchParams.get("cnpj") || "" } });
  const cnpjWatch = form.watch("cnpj") || "";

  const { data: nomeCnpj } = useQuery({ queryKey: ["cliente_cache", cnpjWatch], queryFn: () => fetchClienteNome(cnpjWatch), enabled: cnpjWatch.replace(/\D/g, "").length === 14, staleTime: 5 * 60 * 1000 });
  const { data: etiqueta } = useQuery({ queryKey: ["credenciais_etiquetas", cnpjWatch], queryFn: () => fetchEtiquetaByCnpj(cnpjWatch), enabled: cnpjWatch.replace(/\D/g, "").length === 14, staleTime: 5 * 60 * 1000 });

  const handleSelectCredencial = (cnpj: string) => {
    form.setValue("cnpj", cnpj, { shouldValidate: true, shouldDirty: true });
    syncParam("cnpj", cnpj);
    setEditingSenha(false);
    setSenhaEdit("");
  };

  const handleEditSenha = () => {
    setSenhaEdit(etiqueta?.senha ?? "");
    setEditingSenha(true);
  };

  const handleSaveSenha = async () => {
    if (!etiqueta) return;
    const res = await upsertEtiqueta(cnpjWatch, senhaEdit, etiqueta.codigo_cliente || "");
    if (res.error) toast.error(res.error);
    else {
      toast.success("Senha salva com sucesso.");
      setEditingSenha(false);
      setSenhaEdit("");
      queryClient.invalidateQueries({ queryKey: ["credenciais_etiquetas"] });
    }
  };

  const onConsulta = async (data: { cep: string; cnpj: string }) => {
    setLoading(true);
    try {
      const res = (window as any).api
        ? await (window as any).api.callRotaCep({ cep: data.cep, cnpj: data.cnpj })
        : await fetch("/rota-cep-proxy/dataservice/consultarotacep", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-etiqueta-cnpj": data.cnpj,
              "x-etiqueta-senha": etiqueta?.senha ?? "",
            },
            body: JSON.stringify({ cep: data.cep }),
          }).then(async (r) => {
            const text = await r.text();
            let parsed: any;
            try { parsed = JSON.parse(text); } catch { parsed = text; }
            return { status: r.status, ok: r.ok, data: parsed };
          });
      setResult(res);
    } catch (e: any) {
      setResult({ status: 0, ok: false, data: { message: e.message } });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <CredencialEtiquetasSelector value={cnpjWatch} onSelect={handleSelectCredencial} />

      {etiqueta && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Credencial Selecionada</CardTitle>
            <CardDescription>Detalhes da credencial de etiqueta em uso</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">CNPJ</Label>
                <code className="flex-1 font-mono text-sm bg-muted px-2 py-1.5 rounded border block truncate">{cnpjWatch}</code>
                {nomeCnpj && <div className="text-xs text-primary mt-1 flex items-center gap-1"><Building2 className="h-3 w-3" />{nomeCnpj}</div>}
              </div>
              <div>
                <Label className="text-xs">Código Cliente</Label>
                <code className="flex-1 text-sm bg-muted px-2 py-1.5 rounded border block truncate">{etiqueta.codigo_cliente || "—"}</code>
              </div>
              <div>
                <Label htmlFor="rc-senha" className="text-xs">Senha</Label>
                <div className="flex gap-2">
                  <PasswordField
                    id="rc-senha"
                    value={editingSenha ? senhaEdit : (etiqueta.senha || "")}
                    onChange={(e) => setSenhaEdit(e.target.value)}
                    disabled={!editingSenha}
                    placeholder="••••••••"
                    className="font-mono"
                    containerClassName="flex-1"
                  />
                  {!editingSenha ? (
                    <Button type="button" variant="outline" onClick={handleEditSenha}>Editar</Button>
                  ) : (
                    <Button type="button" onClick={handleSaveSenha}>Salvar</Button>
                  )}
                </div>
                {!editingSenha && <div className="text-[11px] text-muted-foreground mt-1">Criptografada no banco • descriptografada via cofre (Electron)</div>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Consulta Rota por CEP</CardTitle>
          <CardDescription>Consulta de rota logística via dataservices.braspress.com.br • Autenticação Basic via credenciais_etiquetas</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onConsulta)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <Label htmlFor="rc-cnpj">CNPJ Cliente *</Label>
                <Input id="rc-cnpj" {...form.register("cnpj", { onBlur: (e) => syncParam("cnpj", String(e.target.value).replace(/\D/g, "")) })} placeholder="04896434000504" />
                {nomeCnpj && <div className="text-xs text-primary mt-1">{nomeCnpj}</div>}
                {form.formState.errors.cnpj && <p className="text-xs text-red-600">{String(form.formState.errors.cnpj.message)}</p>}
              </div>
              <div>
                <Label htmlFor="rc-cep">CEP *</Label>
                <Input
                  id="rc-cep"
                  {...form.register("cep")}
                  placeholder="00000-000"
                  maxLength={9}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
                    form.setValue("cep", masked, { shouldValidate: true, shouldDirty: true });
                    syncParam("cep", digits);
                  }}
                />
                {form.formState.errors.cep && <p className="text-xs text-red-600">{String(form.formState.errors.cep.message)}</p>}
              </div>
              <Button type="submit" disabled={loading || !etiqueta}>
                <Search className="h-4 w-4 mr-2" />
                {loading ? "Consultando..." : "Consultar Rota"}
              </Button>
            </div>
            {!etiqueta && cnpjWatch.replace(/\D/g, "").length === 14 && (
              <p className="text-[11px] text-amber-600">Sem credencial de etiqueta para este CNPJ</p>
            )}
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
              Resultado RotaCep
              <Badge className={result.ok ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-red-500/10 text-red-700 border-red-200"}>{result.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="visual">
              <TabsList>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="visual" className="mt-4">
                {result.ok && result.data && typeof result.data === "object" ? (() => {
                  const parsed = parseRotaCep(result.data);
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge className={statusVariant(parsed.mensagem)}>
                          {parsed.mensagem}
                        </Badge>
                        <span className="text-xs text-muted-foreground">CEP: {form.getValues("cep")}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                          <div className="px-4 py-3 bg-muted/20 border-b">
                            <span className="font-medium text-sm">Filial</span>
                          </div>
                          <div className="p-4">
                            <div className="text-lg font-bold text-primary">
                              {parsed.idFilial ?? "—"} - {parsed.filial ?? "—"}
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <Field label="ID Filial" value={parsed.idFilial != null ? String(parsed.idFilial) : undefined} />
                              <Field label="Nome Filial" value={parsed.filial} />
                            </div>
                          </div>
                        </div>
                        <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                          <div className="px-4 py-3 bg-muted/20 border-b">
                            <span className="font-medium text-sm">Rota</span>
                          </div>
                          <div className="p-4">
                            <div className="text-lg font-bold text-primary">
                              {parsed.rota ?? "—"}
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-3">
                              <Field label="Código Rota" value={parsed.rota} />
                              <Field label="Descrição" value={parsed.descricaoRota} />
                            </div>
                          </div>
                        </div>
                      </div>
                      {(parsed.endereco || parsed.bairro || parsed.cidade || parsed.uf) && (
                        <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                          <div className="px-4 py-3 bg-muted/20 border-b">
                            <span className="font-medium text-sm">Endereço</span>
                          </div>
                          <div className="p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <Field label="Endereço" value={parsed.endereco} />
                              <Field label="Bairro" value={parsed.bairro} />
                              <Field label="Cidade" value={parsed.cidade} />
                              <Field label="UF" value={parsed.uf} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="text-sm text-muted-foreground p-3 border rounded-lg bg-muted/20">
                    {result.ok ? "Resposta vazia ou sem dados de rota." : `Erro: ${result.data?.message || "Falha na consulta"}`}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="json" className="mt-4">
                <JsonViewer data={result.data} title="RotaCep Data" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
