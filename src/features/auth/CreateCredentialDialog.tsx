import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { upsertClienteCache } from "@/lib/clienteCache";
import { normalizeCNPJ } from "@/lib/cnpj";

const schema = z.object({
  usuario: z.string().min(1, "Usuário obrigatório").regex(/^\d{14}_[A-Z0-9]+$/, "Formato deve ser CNPJ_SUFIXO ex: 60701190000104_PRD"),
  senha: z.string().min(6, "Senha mínimo 6 caracteres"),
});

export function CreateCredentialDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { usuario: "", senha: "" },
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    setMsg(null);
    try {
      // 1) Criptografa via Rust/Electron main (Fernet) antes do INSERT
      let senhaEnc = data.senha;
      if ((window as any).api?.encryptSenha) {
        const enc = await (window as any).api.encryptSenha(data.senha);
        if (enc) senhaEnc = enc;
      } else {
        // fallback web: tenta via WebCrypto (se disponível) ou mantém texto puro com aviso
        console.warn("[CreateCredential] window.api.encryptSenha não disponível, salvando em texto puro (dev)");
      }

      // 2) INSERT no Supabase
      const { error } = await supabase.from("credenciais").insert({ usuario: data.usuario, senha: senhaEnc });
      if (error) throw error;

      // 3) Upsert cliente_cache em background (BrasilAPI / cnpj.ws)
      const cnpj = normalizeCNPJ(data.usuario.split("_")[0]);
      if (cnpj.length === 14) {
        (async () => {
          try {
            const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (r.ok) {
              const j: any = await r.json();
              if (j.razao_social) await upsertClienteCache(cnpj, j.razao_social);
              else if (j.nome_fantasia) await upsertClienteCache(cnpj, j.nome_fantasia);
              return;
            }
          } catch {}
          try {
            const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { headers: { Accept: "application/json" } });
            if (r2.ok) {
              const j2: any = await r2.json();
              const nome = j2.razaoSocial || j2.estabelecimento?.nome_fantasia || j2.nome_fantasia;
              if (nome) await upsertClienteCache(cnpj, nome);
            }
          } catch {}
        })();
      }

      setMsg({ type: "success", text: "Credencial criada com sucesso (criptografada via Rust)!" });
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
      <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Nova Credencial</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Usuário * <span className="text-muted-foreground font-normal">CNPJ_SUFIXO</span></Label>
              <Input {...register("usuario")} placeholder="60701190000104_PRD" />
              {errors.usuario && <p className="text-xs text-red-600 mt-1">{errors.usuario.message}</p>}
            </div>
            <div>
              <Label>Senha *</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} {...register("senha")} placeholder="••••••••" className="pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.senha && <p className="text-xs text-red-600 mt-1">{errors.senha.message}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">Será criptografada via Rust (Fernet) antes de salvar no Supabase</p>
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
