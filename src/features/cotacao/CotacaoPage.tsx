import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cotacaoSchema } from "@/lib/validators";
import { buildCurlCotacao } from "@/lib/braspress";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, Calculator } from "lucide-react";

export function CotacaoPage() {
  const { basic, cred } = useAuthStore();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [returnType, setReturnType] = useState<"json" | "xml">("json");

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<any>({
    resolver: zodResolver(cotacaoSchema),
    defaultValues: {
      cnpjRemetente: "60701190000104",
      cnpjDestinatario: "30539356867",
      modal: "R",
      tipoFrete: "1",
      cepOrigem: "02323000",
      cepDestino: "07093090",
      vlrMercadoria: 100,
      peso: 50.55,
      volumes: 10,
      cubagem: [{ comprimento: 0.67, largura: 0.67, altura: 0.46, volumes: 10 }],
    },
  });

  // Auto-preenche CNPJ Remetente com o usuário selecionado (usuario = CNPJ + sufixo _PRD)
  useEffect(() => {
    if (cred?.usuario) {
      const cnpj = cred.usuario.split("_")[0].replace(/\D/g, "");
      if (cnpj.length === 14) setValue("cnpjRemetente", cnpj, { shouldValidate: true, shouldDirty: true });
    }
  }, [cred?.usuario, setValue]);

  const { fields, append, remove } = useFieldArray({ control, name: "cubagem" });
  const values = watch();

  const onSubmit = async (data: any) => {
    if (!basic) { alert("Selecione uma credencial primeiro"); return; }
    setLoading(true);
    try {
      const payload = { ...data, cnpjRemetente: String(data.cnpjRemetente).replace(/\D/g, ""), cnpjDestinatario: String(data.cnpjDestinatario).replace(/\D/g, ""), cepOrigem: String(data.cepOrigem).replace(/\D/g, ""), cepDestino: String(data.cepDestino).replace(/\D/g, "") };
      const res = (window as any).api ? await (window as any).api.callCotacao({ basic, payload, returnType }) : await fetch(`https://api.braspress.com/v1/cotacao/calcular/${returnType}`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, ok: r.ok, data: await r.json().catch(() => r.text()) }));
      setResult(res);
    } catch (e: any) { setResult({ status: 0, ok: false, data: { message: e.message } }); }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Cotação de Frete</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CNPJ Remetente *</Label><Input {...register("cnpjRemetente")} placeholder="60701190000104" />{errors.cnpjRemetente && <p className="text-xs text-red-600">{String(errors.cnpjRemetente.message)}</p>}</div>
              <div><Label>CNPJ Destinatário *</Label><Input {...register("cnpjDestinatario")} placeholder="CPF ou CNPJ" />{errors.cnpjDestinatario && <p className="text-xs text-red-600">{String(errors.cnpjDestinatario.message)}</p>}</div>
            </div>
            {watch("tipoFrete") === "3" && <div><Label>CNPJ Consignado *</Label><Input {...register("cnpjConsignado")} />{errors.cnpjConsignado && <p className="text-xs text-red-600">{String(errors.cnpjConsignado.message)}</p>}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Modal</Label><select {...register("modal")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="R">Rodoviário (R)</option><option value="A">Aéreo (A)</option></select></div>
              <div><Label>Tipo Frete</Label><select {...register("tipoFrete")} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="1">1 - CIF</option><option value="2">2 - FOB</option><option value="3">3 - Consignado</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CEP Origem *</Label><Input {...register("cepOrigem")} placeholder="02323000" />{errors.cepOrigem && <p className="text-xs text-red-600">{String(errors.cepOrigem.message)}</p>}</div>
              <div><Label>CEP Destino *</Label><Input {...register("cepDestino")} placeholder="07093090" />{errors.cepDestino && <p className="text-xs text-red-600">{String(errors.cepDestino.message)}</p>}</div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Vlr Mercadoria *</Label><Input type="number" step="0.01" {...register("vlrMercadoria")} />{errors.vlrMercadoria && <p className="text-xs text-red-600">{String(errors.vlrMercadoria.message)}</p>}</div>
              <div><Label>Peso *</Label><Input type="number" step="0.01" {...register("peso")} />{errors.peso && <p className="text-xs text-red-600">{String(errors.peso.message)}</p>}</div>
              <div><Label>Volumes *</Label><Input type="number" {...register("volumes")} />{errors.volumes && <p className="text-xs text-red-600">{String(errors.volumes.message)}</p>}</div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center"><Label>Cubagem (metros)</Label><Button type="button" variant="outline" size="sm" onClick={() => append({ comprimento: 0.5, largura: 0.5, altura: 0.5, volumes: 1 })}><Plus className="h-4 w-4 mr-1" />Add</Button></div>
              {fields.map((f, i) => (
                <div key={f.id} className="grid grid-cols-5 gap-2 items-end border p-2 rounded">
                  <div><Label className="text-xs">Comp.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.comprimento`)} /></div>
                  <div><Label className="text-xs">Larg.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.largura`)} /></div>
                  <div><Label className="text-xs">Alt.</Label><Input type="number" step="0.01" {...register(`cubagem.${i}.altura`)} /></div>
                  <div><Label className="text-xs">Vols</Label><Input type="number" {...register(`cubagem.${i}.volumes`)} /></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <Label>Retorno:</Label>
              <select value={returnType} onChange={(e) => setReturnType(e.target.value as any)} className="h-9 rounded-md border px-3 text-sm"><option value="json">json</option><option value="xml">xml</option></select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">{loading ? "Calculando..." : "Calcular Frete"}</Button>
            {!basic && <p className="text-xs text-amber-600 text-center">Selecione uma credencial no topo para habilitar.</p>}
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Preview JSON</CardTitle></CardHeader>
          <CardContent><pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[220px]">{JSON.stringify(values, null, 2)}</pre>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { if (!basic) return; const payload = values as any; navigator.clipboard.writeText(buildCurlCotacao(basic, payload, returnType)); }}><Copy className="h-4 w-4 mr-1" />Copiar cURL</Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2">Resultado <Badge className={result.ok ? "bg-green-50 text-green-700 border" : "bg-red-50 text-red-700 border"}>{result.status}</Badge></CardTitle></CardHeader>
            <CardContent>
              {result.ok && result.data && typeof result.data === "object" && "totalFrete" in result.data && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="p-3 border rounded text-center"><div className="text-xs text-muted-foreground">Total Frete</div><div className="font-bold">R$ {String(result.data.totalFrete)}</div></div>
                  <div className="p-3 border rounded text-center"><div className="text-xs text-muted-foreground">Prazo</div><div className="font-bold">{String(result.data.prazo)} dias</div></div>
                  <div className="p-3 border rounded text-center"><div className="text-xs text-muted-foreground">ID</div><div className="font-mono text-xs truncate">{String(result.data.id)}</div></div>
                </div>
              )}
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[400px]">{typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}</pre>
              {result.data?.errorList && <div className="mt-2 text-xs text-red-600">{JSON.stringify(result.data.errorList, null, 2)}</div>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
