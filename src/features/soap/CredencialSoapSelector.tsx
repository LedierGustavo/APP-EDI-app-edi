import { useState, useEffect, useMemo, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchCredenciaisSoap } from "@/lib/credenciaisSoap";
import { fetchClienteNome, fetchClientesBatch } from "@/lib/clienteCache";
import { lookupCepByCNPJ, normalizeCNPJ } from "@/lib/cnpj";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CredentialDrawer } from "@/components/layout/CredentialDrawer";
import { Search, RefreshCw, Shield, User, Building2, Download, Check } from "lucide-react";
import { CreateTokenSoapDialog } from "@/features/soap/CreateTokenSoapDialog";

type Props = {
  value?: string;
  onSelect: (cnpj: string) => void;
};

export function CredencialSoapSelector({ value, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fetchingCnpj, setFetchingCnpj] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pageSize = 50;
  const selected = normalizeCNPJ(value ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["credenciais_soap_list", debounced, page],
    queryFn: () => fetchCredenciaisSoap({ search: debounced, page, pageSize }),
  });

  const cnpjsPage = useMemo(
    () => (data?.data ?? []).map((credential) => normalizeCNPJ(credential.cnpj)).filter((cnpj) => cnpj.length === 14),
    [data],
  );
  const { data: nomesMap } = useQuery({
    queryKey: ["cliente_cache", cnpjsPage.join(",")],
    queryFn: () => fetchClientesBatch(cnpjsPage),
    enabled: cnpjsPage.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const { data: selectedName } = useQuery({
    queryKey: ["cliente_cache", selected],
    queryFn: () => fetchClienteNome(selected),
    enabled: selected.length === 14,
    staleTime: 5 * 60 * 1000,
  });

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

  const handleSelect = (cnpj: string) => {
    onSelect(cnpj);
    setDrawerOpen(false);
  };

  return (
    <CredentialDrawer
      open={drawerOpen}
      onOpenChange={setDrawerOpen}
      category="Acesso SOAP"
      selected={selected || null}
      client={selectedName}
      icon={Shield}
    >
      <div className="credential-drawer-tools">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar CNPJ ou Razão Social"
            placeholder="Buscar CNPJ ou cliente..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => refetch()} title="Atualizar lista" aria-label="Atualizar lista">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <CreateTokenSoapDialog
          onCreated={() => {
            void refetch();
            void queryClient.invalidateQueries({ queryKey: ["credenciais_soap"] });
          }}
          defaultCnpj={selected}
        />
      </div>

      {error && <div role="alert" className="credential-drawer-error">Erro: {(error as Error).message}</div>}
      {isLoading && <div className="py-3 text-sm text-muted-foreground">Carregando credenciais...</div>}

      <div className="credential-drawer-list scrollbar-thin">
        {data?.data.map((credential) => {
          const cnpj = normalizeCNPJ(credential.cnpj);
          const nome = nomesMap?.get(cnpj);
          return (
            <div key={credential.cnpj} className={`credential-list-row ${selected === cnpj ? "is-current" : ""}`}>
              <button type="button" className="credential-row-select" onClick={() => handleSelect(cnpj)}>
                <span className="credential-row-top">
                  <span className="credential-row-user"><User className="h-4 w-4 shrink-0" />{cnpj}</span>
                  {selected === cnpj && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </span>
                <span className="credential-row-meta">
                  <span className="credential-row-client"><Building2 className="h-3.5 w-3.5 shrink-0" />{nome || "Nome do cliente não consultado"}</span>
                  <span className="credential-row-submeta">{credential.created_at ? new Date(credential.created_at).toLocaleDateString() : "Data indisponível"}</span>
                </span>
              </button>
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
            </div>
          );
        })}
        {data?.data.length === 0 && !isLoading && <div className="credential-empty">Nenhuma credencial SOAP encontrada.</div>}
      </div>

      <div className="credential-drawer-pagination">
        <Button type="button" variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</Button>
        <span>Página {page + 1} <span>·</span> {data?.count ?? "—"} credenciais</span>
        <Button type="button" variant="ghost" size="sm" disabled={(data?.data.length ?? 0) < pageSize} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
      </div>
    </CredentialDrawer>
  );
}
