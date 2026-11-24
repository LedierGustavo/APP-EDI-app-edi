import { useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/ui/PasswordField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, X } from "lucide-react";
import { atualizarCredencial } from "./credentialsService";
import type { ApiEnvironment } from "@/store/apiEnvironmentStore";

const schema = z.object({
  usuario: z.string().trim().regex(/^\d{14}_[A-Z0-9]+$/, "Formato deve ser CNPJ_SUFIXO ex: 60701190000104_PRD"),
  senha: z.string().optional().refine((value) => !value || value.length >= 6, "Senha mínimo 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export function EditCredentialDialog({
  usuario,
  environment,
  onUpdated,
}: {
  usuario: string;
  environment: ApiEnvironment;
  onUpdated: (usuario: string, senha?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { usuario, senha: "" },
  });

  const close = () => {
    setOpen(false);
    setError("");
    reset({ usuario, senha: "" });
  };

  const onSubmit = async ({ usuario: updatedUser, senha }: FormValues) => {
    setLoading(true);
    setError("");
    try {
      const result = await atualizarCredencial(usuario, updatedUser, environment, senha || undefined);
      if (result.error) {
        setError(result.error);
        return;
      }
      onUpdated(updatedUser, senha || undefined);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar credencial");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setOpen(true)}
        aria-label={`Editar credencial ${usuario}`}
        title="Editar credencial"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      {open && createPortal(
        <div className="credential-modal-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={close}>
          <Card role="dialog" aria-modal="true" aria-labelledby="edit-cred-title" className="w-full max-w-md shadow-xl" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span id="edit-cred-title">Editar credencial</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={close} aria-label="Fechar" disabled={loading}>
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor={`edit-usuario-${usuario}`}>Usuário</Label>
                  <Input id={`edit-usuario-${usuario}`} autoFocus {...register("usuario")} />
                  {errors.usuario && <p className="mt-1 text-xs text-red-600">{errors.usuario.message}</p>}
                </div>
                <div>
                  <Label htmlFor={`edit-senha-${usuario}`}>Nova senha</Label>
                  <PasswordField id={`edit-senha-${usuario}`} autoComplete="new-password" {...register("senha")} />
                  {errors.senha && <p className="mt-1 text-xs text-red-600">{errors.senha.message}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Deixe em branco para manter a senha atual.</p>
                </div>
                {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">{error}</div>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={close} disabled={loading}>Cancelar</Button>
                  <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar alterações"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )}
    </>
  );
}
