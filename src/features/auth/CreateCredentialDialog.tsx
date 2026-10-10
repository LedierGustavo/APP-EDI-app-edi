import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { criarCredencial } from "./credentialsService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/ui/PasswordField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { normalizeCNPJ } from "@/lib/cnpj";
import { getApi } from "@/lib/ipc";

const schema = z.object({
  usuario: z.string().min(1, "Usuário obrigatório").regex(/^\d{14}_[A-Z0-9]+$/, "Formato deve ser CNPJ_SUFIXO ex: 60701190000104_PRD"),
  senha: z.string().min(6, "Senha mínimo 6 caracteres"),
});

export function CreateCredentialDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { usuario: "", senha: "" },
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    setMsg(null);
    try {
      // O cofre (main) criptografa e grava; o renderer nunca vê a chave nem grava texto puro.
      const res = await criarCredencial(data.usuario, data.senha);
      if (res.error) throw new Error(res.error);

      // Aquece o cache de nome no main (best-effort).
      const cnpj = normalizeCNPJ(data.usuario.split("_")[0]);
      if (cnpj.length === 14) {
        getApi()?.lookupCnpj(cnpj).catch(() => {});
      }

      setMsg({ type: "success", text: "Credencial criada com sucesso (criptografada no cofre Electron)!" });
      reset();
      onCreated?.();
      setTimeout(() => setOpen(false), 1200);
    } catch (e: any) {
      setMsg({ type: "error", text: e.message || "Erro ao criar credencial" });
    }
    setLoading(false);
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" />Nova Credencial</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
      <Card role="dialog" aria-modal="true" aria-labelledby="create-cred-title" className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span id="create-cred-title">Nova Credencial</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="cc-usuario">Usuário * <span className="text-muted-foreground font-normal">CNPJ_SUFIXO</span></Label>
              <Input id="cc-usuario" autoFocus {...register("usuario")} placeholder="60701190000104_PRD" />
              {errors.usuario && <p className="text-xs text-red-600 mt-1">{errors.usuario.message}</p>}
            </div>
            <div>
              <Label htmlFor="cc-senha">Senha *</Label>
              <PasswordField id="cc-senha" {...register("senha")} placeholder="••••••••" />
              {errors.senha && <p className="text-xs text-red-600 mt-1">{errors.senha.message}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">Será criptografada no cofre (Electron) antes de salvar no Supabase</p>
            </div>
            {msg && <div className={`text-xs p-2 rounded border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20" : "bg-red-50 border-red-200 text-red-600"}`}>{msg.text}</div>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar criptografado"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
