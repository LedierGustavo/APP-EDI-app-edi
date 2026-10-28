import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createCredentialBatch, type CredentialBatchResult } from "./credentialsService";
import { CheckCircle2, KeyRound, Loader2, RotateCcw, Save, XCircle } from "lucide-react";

type CredentialEntry = {
  usuario: string;
  senha: string;
  error?: string;
};

function parseCredentialBatch(text: string): CredentialEntry[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const entries: CredentialEntry[] = [];

  for (let index = 0; index < lines.length; index += 2) {
    const rawUsuario = lines[index].trim();
    const senha = lines[index + 1];
    if (!senha) {
      const match = rawUsuario.match(/^(\d{1,14})_([A-Z0-9]+)$/);
      entries.push({
        usuario: match ? `${match[1].padStart(14, "0")}_${match[2]}` : `Linha ${Math.floor(index / 2) + 1}`,
        senha: "",
        error: "Senha ausente",
      });
      continue;
    }

    const match = rawUsuario.match(/^(\d{1,14})_([A-Z0-9]+)$/);
    if (!match) {
      entries.push({ usuario: `Linha ${Math.floor(index / 2) + 1}`, senha, error: "Usuário inválido" });
      continue;
    }

    const usuario = `${match[1].padStart(14, "0")}_${match[2]}`;
    if (senha.trim().length < 6) {
      entries.push({ usuario, senha, error: "Senha deve ter ao menos 6 caracteres" });
      continue;
    }
    entries.push({ usuario, senha });
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.error) counts.set(entry.usuario, (counts.get(entry.usuario) ?? 0) + 1);
  }
  for (const entry of entries) {
    if (!entry.error && (counts.get(entry.usuario) ?? 0) > 1) entry.error = "Usuário repetido no lote";
  }
  return entries;
}

export function BulkCredentialPage() {
  const [text, setText] = useState("");
  const [results, setResults] = useState<CredentialBatchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const queryClient = useQueryClient();
  const entries = useMemo(() => parseCredentialBatch(text), [text]);
  const invalidCount = entries.filter((entry) => entry.error).length;
  const savedCount = results.filter((result) => result.ok).length;
  const failedCount = results.filter((result) => !result.ok).length;
  const pendingEntries = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => !entry.error && !results[index]?.ok);

  const handleTextChange = (value: string) => {
    setText(value);
    setResults([]);
    setCompletedCount(0);
  };

  const handleSave = async () => {
    if (invalidCount > 0 || pendingEntries.length === 0 || saving) return;
    setSaving(true);
    const nextResults = [...results];
    try {
      for (const { entry, index } of pendingEntries) {
        const result = await createCredentialBatch(entry.usuario, entry.senha);
        nextResults[index] = result;
        setResults([...nextResults]);
      }
      await queryClient.invalidateQueries({ queryKey: ["credenciais"] });
      if (nextResults.every((result) => result?.ok)) {
        setCompletedCount(nextResults.length);
        setText("");
        setResults([]);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setText("");
    setResults([]);
    setCompletedCount(0);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Cadastro em lote de credenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="credential-batch">Usuário e senha</Label>
            <textarea
              id="credential-batch"
              value={text}
              onChange={(event) => handleTextChange(event.target.value)}
              className="flex min-h-64 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {entries.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{entries.length} credencial(is)</span>
                {invalidCount > 0 && <span className="text-red-600">{invalidCount} inválida(s)</span>}
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Usuário</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((entry, index) => {
                      const result = results[index];
                      return (
                        <tr key={`${entry.usuario}-${index}`}>
                          <td className="max-w-0 truncate px-3 py-2 font-mono" title={entry.usuario}>{entry.usuario}</td>
                          <td className="px-3 py-2">
                            {entry.error ? (
                              <span className="inline-flex items-center gap-1.5 text-red-600"><XCircle className="h-4 w-4" />{entry.error}</span>
                            ) : result?.ok ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" />Salva</span>
                            ) : result ? (
                              <span className="inline-flex items-center gap-1.5 text-red-600"><XCircle className="h-4 w-4" />{result.error}</span>
                            ) : (
                              <span className="text-muted-foreground">Pendente</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {savedCount > 0 && <p className="text-sm text-emerald-600">{savedCount} credencial(is) salva(s).</p>}
          {completedCount > 0 && <p className="text-sm text-emerald-600">{completedCount} credencial(is) salva(s).</p>}
          {failedCount > 0 && <p className="text-sm text-red-600">{failedCount} credencial(is) não salva(s). Corrija ou tente novamente.</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClear} disabled={saving || !text}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Limpar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || pendingEntries.length === 0 || invalidCount > 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar lote"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
