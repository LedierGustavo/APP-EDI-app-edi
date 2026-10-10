import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCredenciaisEtiquetas } from "@/lib/credenciaisEtiquetas";
import { fetchClientesBatch } from "@/lib/clienteCache";
import { lookupCepByCNPJ } from "@/lib/cnpj";
import { normalizeCNPJ } from "@/lib/cnpj";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, RefreshCw, Shield, User, Building2, Download } from "lucide-react";
import { CreateEtiquetaDialog } from "@/features/rotacep/CreateEtiquetaDialog";

type Props = {
  value?: string;
  onSelect: (cnpj: string) => void;
};

export function CredencialEtiquetasSelector({ value, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [fetchingCnpj, setFetchingCnpj] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pageSize = 50;

  useEffect(() => { const t = setTimeout(() => { setDebounced(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["credenciais_etiquetas_list", debounced, page],
    queryFn: () => fetchCredenciaisEtiquetas({ search: debounced, page, pageSize }),
  });

  const cnpjsPage = useMemo(() => (data?.data ?? []).map((c) => normalizeCNPJ(c.cnpj)).filter((c) => c.length === 14), [data]);
  const { data: nomesMap } = useQuery({
    queryKey: ["cliente_cache", cnpjsPage.join(",")],
    queryFn: () => fetchClientesBatch(cnpjsPage),
    enabled: cnpjsPage.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const handleFetchNome = async (e: React.MouseEvent, cnpj: string) => {
    e.stopPropagation();
    setFetchingCnpj(cnpj);
    try {
      await lookupCepByCNPJ(cnpj);
      await queryClient.invalidateQueries({ queryKey: ["cliente_cache"] });
    } catch {}
    setFetchingCnpj(null);
  };

  const selected = normalizeCNPJ(value ?? "");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Credenciais Etiquetas</CardTitle>
        <CardDescription>
          Credenciais de <code>public.credenciais_etiquetas</code>. {data?.count != null ? `${data.count} encontrados` : ""}
          {selected && <span className="ml-2 text-primary font-medium">Selecionado: {selected}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Buscar CNPJ ou Razão Social" placeholder="Buscar CNPJ ou Razão Social..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Recarregar</Button>
          <CreateEtiquetaDialog onCreated={() => refetch()} defaultCnpj={selected} />
        </div>

        {error && <div className="text-sm text-red-600 p-3 border border-red-200 rounded bg-red-50">Erro: {(error as Error).message}</div>}
        {isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}

        <div className="border rounded-lg max-h-[320px] overflow-auto scrollbar-thin divide-y">
          {data?.data.map((c) => {
            const cnpj = normalizeCNPJ(c.cnpj);
            const nome = nomesMap?.get(cnpj);
            return (
              <div
                key={c.cnpj}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(cnpj)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(cnpj); } }}
                className={`w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === cnpj ? "bg-primary/10" : ""}`}
              >
                <span className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2 font-medium"><User className="h-4 w-4 text-muted-foreground" />{c.cnpj}</span>
                  <span className="text-xs text-muted-foreground">{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</span>
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
                      title="Clique para buscar nome via BrasilAPI"
                    >
                      {fetchingCnpj === cnpj ? (
                        <><span className="h-3 w-3 border border-primary border-t-transparent rounded-full animate-spin" /> buscando...</>
                      ) : (
                        <><Download className="h-3 w-3" /> sem nome no cache — clique para buscar</>
                      )}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {data?.data.length === 0 && !isLoading && <div className="p-4 text-sm text-muted-foreground text-center">Nenhuma credencial de etiqueta encontrada</div>}
        </div>

        <div className="flex justify-between items-center">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1} • {data?.count ?? "?"} total</span>
          <Button variant="ghost" size="sm" disabled={(data?.data.length ?? 0) < pageSize} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </CardContent>
    </Card>
  );
}
