import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { upsertEtiqueta } from "@/lib/credenciaisEtiquetas";

const schema = z.object({
  cnpj: z.string().min(14, "CNPJ 14 dígitos").transform((v) => v.replace(/\D/g, "").padStart(14, "0")).refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos"),
  senha: z.string().min(1, "Senha obrigatória"),
  codigoCliente: z.string().min(1, "Código do cliente obrigatório"),
});

export function CreateEtiquetaDialog({ onCreated, defaultCnpj }: { onCreated?: () => void; defaultCnpj?: string }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { cnpj: defaultCnpj || "", senha: "", codigoCliente: "" },
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    setMsg(null);
    const res = await upsertEtiqueta(data.cnpj, data.senha, data.codigoCliente);
    if (res.error) {
      setMsg({ type: "error", text: res.error });
    } else {
      setMsg({ type: "success", text: "Credencial de etiqueta salva (criptografada via Rust)!" });
      reset();
      onCreated?.();
      setTimeout(() => setOpen(false), 1000);
    }
    setLoading(false);
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)} variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" />Nova Credencial</Button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
      <Card className="w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Nova Credencial Etiqueta</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>CNPJ *</Label>
              <Input {...register("cnpj")} placeholder="58344029000170" />
              {errors.cnpj && <p className="text-xs text-red-600 mt-1">{errors.cnpj.message}</p>}
            </div>
            <div>
              <Label>Senha *</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} {...register("senha")} placeholder="••••••" className="pr-10" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.senha && <p className="text-xs text-red-600 mt-1">{errors.senha.message}</p>}
            </div>
            <div>
              <Label>Código do Cliente *</Label>
              <Input {...register("codigoCliente")} placeholder="12345" />
              {errors.codigoCliente && <p className="text-xs text-red-600 mt-1">{errors.codigoCliente.message}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">Criptografado via Rust antes do INSERT em credenciais_etiquetas</p>
            </div>
            {msg && <div className={`text-xs p-2 rounded border ${msg.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>{msg.text}</div>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
