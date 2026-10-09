import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn("[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes. Configure no .env");
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Credencial = { id: number; usuario: string; senha: string; criado_em: string | null };
