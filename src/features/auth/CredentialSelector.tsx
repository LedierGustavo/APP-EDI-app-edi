import { useState, useEffect, useMemo, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCredenciais, obterSenha } from "./credentialsService";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, RefreshCw, Shield, User, Eye, EyeOff, Copy, Check, Building2, Download } from "lucide-react";
import { fetchClientesBatch, fetchClienteNome } from "@/lib/clienteCache";
import { CreateCredentialDialog } from "./CreateCredentialDialog";
import { EditCredentialDialog } from "./EditCredentialDialog";
import { lookupCepByCNPJ } from "@/lib/cnpj";
import { CredentialDrawer } from "@/components/layout/CredentialDrawer";

export function CredentialSelector() {
  const { cred, basic, setCred } = useAuthStore();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fetchingCnpj, setFetchingCnpj] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pageSize = 50;

  const selectedCnpj = cred?.usuario
    ? cred.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0")
    : "";
  const environment = cred?.usuario.split("_").slice(1).join("_") || null;
  const { data: selectedNome } = useQuery({
    queryKey: ["cliente_cache", selectedCnpj],
    queryFn: () => fetchClienteNome(selectedCnpj),
    enabled: !!selectedCnpj,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["credenciais", debounced, page],
    queryFn: () => fetchCredenciais({ search: debounced, page, pageSize }),
  });

  const cnpjsPage = useMemo(
    () => (data?.data ?? [])
      .map((credential) => credential.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0"))
      .filter((cnpj) => cnpj.length === 14),
    [data],
  );
  const { data: nomesMap } = useQuery({
    queryKey: ["cliente_cache", cnpjsPage.join(",")],
    queryFn: () => fetchClientesBatch(cnpjsPage),
    enabled: cnpjsPage.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleSelect = async (usuario: string) => {
    try {
      const senha = await obterSenha(usuario);
      setCred({ usuario, senha, senhaRaw: "" });
      setShowSenha(false);
      setDrawerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível selecionar a credencial.");
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar para a área de transferência.");
    }
  };

  const handleFetchNome = async (event: MouseEvent, cnpj: string) => {
    event.stopPropagation();
    setFetchingCnpj(cnpj);
    try {
      await lookupCepByCNPJ(cnpj);
      await queryClient.invalidateQueries({ queryKey: ["cliente_cache"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o nome do cliente.");
    } finally {
      setFetchingCnpj(null);
    }
  };

  const handleCredentialUpdated = async (usuarioAtual: string, usuario: string, senha?: string) => {
    if (cred?.usuario === usuarioAtual) {
      setCred({ usuario, senha: senha ?? cred.senha, senhaRaw: "" });
    }
    await queryClient.invalidateQueries({ queryKey: ["credenciais"] });
  };

  return (
    <CredentialDrawer
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      category="Acesso EDI"
      selected={cred?.usuario}
      client={selectedNome}
      environment={environment}
      icon={Shield}
    >
      <div className="credential-drawer-tools">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar usuário ou Razão Social"
            placeholder="Buscar usuário ou cliente..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => refetch()}
          title="Atualizar lista"
          aria-label="Atualizar lista"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <CreateCredentialDialog onCreated={() => refetch()} />
      </div>

      {error && <div role="alert" className="credential-drawer-error">Erro: {(error as Error).message}</div>}
      {isLoading && <div className="py-3 text-sm text-muted-foreground">Carregando credenciais...</div>}

      <div className="credential-drawer-list scrollbar-thin">
        {data?.data.map((credential) => {
          const cnpj = credential.usuario.split("_")[0].replace(/\D/g, "").padStart(14, "0");
          const environmentName = credential.usuario.split("_").slice(1).join("_");
          const nome = nomesMap?.get(cnpj);
          const createdAt = credential.criado_em
            ? new Date(credential.criado_em).toLocaleDateString()
            : "Data indisponível";
          return (
            <div key={credential.id} className={`credential-list-row ${cred?.usuario === credential.usuario ? "is-current" : ""}`}>
              <button type="button" className="credential-row-select" onClick={() => handleSelect(credential.usuario)}>
                <span className="credential-row-top">
                  <span className="credential-row-user"><User className="h-4 w-4 shrink-0" />{credential.usuario}</span>
                  {cred?.usuario === credential.usuario && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </span>
                <span className="credential-row-meta">
                  <span className="credential-row-client">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {nome || "Nome do cliente não consultado"}
                  </span>
                  <span className="credential-row-submeta">
                    <span>{createdAt}</span>
                    {environmentName && <span className="credential-environment">{environmentName}</span>}
                  </span>
                </span>
              </button>
              <div className="credential-row-actions">
                {!nome && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={(event) => handleFetchNome(event, cnpj)}
                    disabled={fetchingCnpj === cnpj}
                    title="Buscar nome do cliente"
                    aria-label="Buscar nome do cliente"
                  >
                    {fetchingCnpj === cnpj
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      : <Download className="h-4 w-4" />}
                  </Button>
                )}
                <EditCredentialDialog
                  usuario={credential.usuario}
                  onUpdated={(usuario, senha) => handleCredentialUpdated(credential.usuario, usuario, senha)}
                />
              </div>
            </div>
          );
        })}
        {data?.data.length === 0 && !isLoading && <div className="credential-empty">Nenhuma credencial encontrada.</div>}
      </div>

      <div className="credential-drawer-pagination">
        <Button type="button" variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</Button>
        <span>Página {page + 1} <span>·</span> {data?.count ?? "—"} credenciais</span>
        <Button type="button" variant="ghost" size="sm" disabled={(data?.data.length ?? 0) < pageSize} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
      </div>

      {cred && (
        <section className="credential-drawer-details">
          <div className="credential-drawer-section-title">
            <div><h3>Credencial selecionada</h3><p>Dados protegidos do acesso ativo.</p></div>
            {environment && <span className="credential-environment">{environment}</span>}
          </div>
          <div className="credential-detail-item">
            <Label htmlFor="active-credential-user">Usuário</Label>
            <div className="flex items-center gap-2">
              <code id="active-credential-user" className="credential-detail-value">{cred.usuario}</code>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(cred.usuario)} title="Copiar usuário" aria-label="Copiar usuário">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="credential-detail-item">
            <Label htmlFor="active-credential-client">Cliente</Label>
            <div className="flex items-center gap-2">
              <code id="active-credential-client" className="credential-detail-value">{selectedNome || selectedCnpj}</code>
              {selectedNome && <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(selectedNome)} title="Copiar cliente" aria-label="Copiar cliente"><Copy className="h-4 w-4" /></Button>}
            </div>
            <span className="text-[11px] text-muted-foreground">CNPJ {selectedCnpj}</span>
          </div>
          <div className="credential-detail-item">
            <Label>Senha</Label>
            <div className="flex items-center gap-2">
              <code className="credential-detail-value font-mono">{showSenha ? cred.senha : "•".repeat(Math.min(cred.senha.length, 16))}</code>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setShowSenha((show) => !show)} title={showSenha ? "Ocultar senha" : "Mostrar senha"} aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}>
                {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => handleCopy(cred.senha)} title="Copiar senha" aria-label="Copiar senha"><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="sm" className="w-full whitespace-normal" onClick={() => handleCopy(`${cred.usuario}:${cred.senha}`)}><Copy className="mr-1.5 h-3.5 w-3.5 shrink-0" />Usuário e senha</Button>
            <Button type="button" variant="secondary" size="sm" className="w-full whitespace-normal" onClick={() => handleCopy(basic || btoa(`${cred.usuario}:${cred.senha}`))}><Copy className="mr-1.5 h-3.5 w-3.5 shrink-0" />Basic Auth</Button>
          </div>
        </section>
      )}
    </CredentialDrawer>
  );
}
