import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCredenciais, obterSenha } from "./credentialsService";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Search, RefreshCw, Shield, User, Eye, EyeOff, Copy, Check, Building2, Download, ChevronDown, ChevronUp } from "lucide-react";
import { fetchClientesBatch, fetchClienteNome } from "@/lib/clienteCache";
import { CreateCredentialDialog } from "./CreateCredentialDialog";
import { lookupCepByCNPJ } from "@/lib/cnpj";
import { useQueryClient } from "@tanstack/react-query";

export function CredentialSelector() {
  const { cred, basic, setCred } = useAuthStore();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [listOpen, setListOpen] = useState(!cred);
  const [showSenha, setShowSenha] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fetchingCnpj, setFetchingCnpj] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const selectedCnpj = cred?.usuario ? cred.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0") : "";
  const { data: selectedNome } = useQuery({
    queryKey: ["cliente_cache", selectedCnpj],
    queryFn: () => fetchClienteNome(selectedCnpj),
    enabled: !!selectedCnpj,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["credenciais", debounced, page],
    queryFn: () => fetchCredenciais({ search: debounced, page, pageSize }),
  });

  // Batch fetch nomes para a página atual
  const cnpjsPage = useMemo(() => (data?.data ?? []).map((c) => c.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0")).filter((c) => c.length === 14), [data]);
  const { data: nomesMap } = useQuery({
    queryKey: ["cliente_cache", cnpjsPage.join(",")],
    queryFn: () => fetchClientesBatch(cnpjsPage),
    enabled: cnpjsPage.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleSelect = async (usuario: string) => {
    try {
      // A descriptografia acontece no main (cofre); o renderer recebe a senha pura.
      const senha = await obterSenha(usuario);
      setCred({ usuario, senha, senhaRaw: "" });
      setShowSenha(false);
      setListOpen(false);
    } catch {
      // erro reportado pelo cofre; nada a fazer aqui por ora
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFetchNome = async (e: React.MouseEvent, cnpj: string) => {
    e.stopPropagation();
    setFetchingCnpj(cnpj);
    try {
      // lookupCepByCNPJ já faz upsert do nome via BrasilAPI/cnpj.ws
      await lookupCepByCNPJ(cnpj);
      // Invalida cache para recarregar nome
      await queryClient.invalidateQueries({ queryKey: ["cliente_cache"] });
    } catch {}
    setFetchingCnpj(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 p-4 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" /> Credenciais</CardTitle>
          <CardDescription className="mt-1 truncate">
            {cred ? <><span className="text-primary font-medium">{cred.usuario}</span>{selectedNome && <span> · {selectedNome}</span>}</> : `${data?.count ?? 0} credenciais disponíveis`}
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setListOpen((open) => !open)} aria-expanded={listOpen}>
          {listOpen ? <><ChevronUp className="mr-1.5 h-4 w-4" />Ocultar lista</> : <><ChevronDown className="mr-1.5 h-4 w-4" />Trocar credencial</>}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        {listOpen && (
          <div className="flex flex-col gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Buscar usuário ou Razão Social" placeholder="Buscar usuário ou Razão Social..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="w-full" onClick={() => refetch()}><RefreshCw className="mr-1.5 h-4 w-4" />Recarregar</Button>
              <CreateCredentialDialog onCreated={() => refetch()} />
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600 p-3 border border-red-200 rounded bg-red-50">Erro: {(error as Error).message}</div>}
        {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}

        {listOpen && <div className="credential-list border rounded-lg overflow-auto scrollbar-thin divide-y">
          {data?.data.map((c) => {
            const cnpj = c.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0");
            const nome = nomesMap?.get(cnpj);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(c.usuario)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(c.usuario); } }}
                className={`w-full text-left px-3 py-1.5 hover:bg-accent flex flex-col gap-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cred?.usuario === c.usuario ? "bg-primary/10" : ""}`}
              >
                <span className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2 font-medium"><User className="h-4 w-4 text-muted-foreground" />{c.usuario}</span>
                  <span className="text-xs text-muted-foreground">{c.criado_em ? new Date(c.criado_em).toLocaleDateString() : ""}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs truncate">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  {nome ? (
                    <span className="text-primary font-medium truncate">{nome}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleFetchNome(e, cnpj)}
                      disabled={fetchingCnpj === cnpj}
                      className="italic text-muted-foreground hover:text-primary hover:underline flex items-center gap-1"
                      title="Buscar nome"
                    >
                      {fetchingCnpj === cnpj ? (
                        <><span className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" /> buscando...</>
                      ) : (
                        <><Download className="h-3 w-3" /> Buscar nome</>
                      )}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {data?.data.length === 0 && !isLoading && <div className="p-4 text-sm text-muted-foreground text-center">Nenhum usuário encontrado</div>}
        </div>}

        {listOpen && <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1} • {data?.count ?? "?"} total</span>
          <Button variant="ghost" size="sm" disabled={(data?.data.length ?? 0) < pageSize} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>}

        {cred && (
          <div className="p-3 rounded bg-card border space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Usuário selecionado</Label>
                <div className="flex items-center gap-2">
                  <code title={cred.usuario} className="flex-1 font-mono text-sm bg-muted px-2 py-1.5 rounded border truncate">{cred.usuario}</code>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(cred.usuario)} title="Copiar usuário">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Cliente</Label>
                <div className="flex items-center gap-2">
                  <code title={selectedNome || "— sem nome"} className="flex-1 text-sm bg-muted px-2 py-1.5 rounded border truncate">{selectedNome || "— sem nome"}</code>
                  {selectedNome && <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(selectedNome)} title="Copiar nome"><Copy className="h-4 w-4" /></Button>}
                </div>
                <div className="text-[11px] text-muted-foreground">CNPJ {selectedCnpj}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Senha</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-muted px-2 py-1.5 rounded border truncate">{showSenha ? cred.senha : "•".repeat(Math.min(cred.senha.length, 16))}</code>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowSenha(!showSenha)} title={showSenha ? "Ocultar" : "Mostrar"}>
                    {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(cred.senha)} title="Copiar senha">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleCopy(`${cred.usuario}:${cred.senha}`)}><Copy className="h-3 w-3 mr-1" />Copiar usuario:senha</Button>
              <Button variant="secondary" size="sm" onClick={() => handleCopy(basic || btoa(`${cred.usuario}:${cred.senha}`))}><Copy className="h-3 w-3 mr-1" />Copiar Basic</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
