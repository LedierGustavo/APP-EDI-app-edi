import { net } from "electron";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Chaves embutidas diretamente no binário (compiladas no .exe via build).
// Não há cofre, .env, variáveis de ambiente do SO ou criptografia local:
// o backend é 100% autônomo em qualquer computador da equipe.
//
// Equivalente (em Rust/Tauri) a:
//   const SUPABASE_URL: &str = env!("SUPABASE_URL");
//   const SUPABASE_SERVICE_ROLE_KEY: &str = env!("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = "https://ynunxrvepaokkafxhzda.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludW54cnZlcGFva2thZnhoemRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjE0NjMyMSwiZXhwIjoyMDk3NzIyMzIxfQ.EGbbgfwNL3Ghh3K3lMj91Qej3TxGLa1qK3yJL4Ffjns";
const EMBEDDED_FERNET_SECRET = "RG4JmpnfFj+V0FTbZWIXHVzP/5Vyk2AcNO3VZax27j4=";

// backend Supabase (service_role) — usado por todo o main process.
class SecurityVaultImpl {
  supabaseUrl = SUPABASE_URL;
  serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY;
  fernetSecret = EMBEDDED_FERNET_SECRET;
  supabase: SupabaseClient | null = null;

  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    if (!/^https:\/\/[^\s/]+/.test(this.supabaseUrl)) {
      throw new Error(`URL do Supabase inválida (precisa começar com https://): ${this.supabaseUrl}`);
    }
    // Transporte Chromium (net.fetch): usa a trust store do Windows, evitando
    // "fetch failed / UNABLE_TO_VERIFY_LEAF_SIGNATURE" nas máquinas da equipe.
    this.supabase = createClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => net.fetch(input as string, init as RequestInit) },
    });
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && !!this.supabase;
  }

  // Mantido por compatibilidade com o código existente: chaves embutidas
  // estão sempre "persistidas" no binário.
  isPersisted(): boolean {
    return true;
  }
}

export const SecurityVault = new SecurityVaultImpl();
