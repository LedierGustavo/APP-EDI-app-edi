import { app, safeStorage } from "electron";
import path from "path";
import fs from "fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cofre de segredos do main process.
// - Na 1ª execução: lê SUPABASE_SERVICE_ROLE_KEY e SECRET_KEY do ambiente da
//   máquina e persiste criptografado via safeStorage (DPAPI/Keychain/Secret
//   Service). Nunca grava segredo em claro e nunca loga.
// - Execuções seguintes: lê e descriptografa silenciosamente do userData.
// - Se safeStorage não estiver disponível, usa o ambiente em memória (fallback)
//   sem persistir, evitando quebrar o app.

type Secrets = { serviceRole: string; fernetSecret: string };

const VAULT_FILE = "secure_keys.enc";

class SecurityVaultImpl {
  supabaseUrl = "";
  serviceRoleKey = "";
  fernetSecret = "";
  supabase: SupabaseClient | null = null;

  private initialized = false;
  private persisted = false;

  initialize(): void {
    if (this.initialized) return;

    this.supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

    let secrets = this.load();

    if (!secrets) {
      const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const fernetSecret = process.env.SECRET_KEY || "";
      if (serviceRole && fernetSecret) {
        secrets = { serviceRole, fernetSecret };
        this.persist(secrets);
      }
    }

    if (!secrets) {
      throw new Error(
        "Chaves ausentes. Na primeira execução defina SUPABASE_SERVICE_ROLE_KEY e SECRET_KEY " +
          "como variáveis de ambiente da máquina.",
      );
    }
    if (!this.supabaseUrl) {
      throw new Error("SUPABASE_URL ausente (defina SUPABASE_URL no ambiente).");
    }

    this.serviceRoleKey = secrets.serviceRole;
    this.fernetSecret = secrets.fernetSecret;
    this.supabase = createClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.initialized = true;
  }

  isReady(): boolean {
    return this.initialized && !!this.supabase;
  }

  isPersisted(): boolean {
    return this.persisted;
  }

  private vaultPath(): string {
    return path.join(app.getPath("userData"), VAULT_FILE);
  }

  private load(): Secrets | null {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const p = this.vaultPath();
      if (!fs.existsSync(p)) return null;
      const decrypted = safeStorage.decryptString(fs.readFileSync(p));
      const parsed = JSON.parse(decrypted) as Secrets;
      if (parsed?.serviceRole && parsed?.fernetSecret) {
        this.persisted = true;
        return parsed;
      }
      return null;
    } catch (e) {
      console.error("[vault] falha ao ler cofre:", (e as Error).message);
      return null;
    }
  }

  private persist(secrets: Secrets): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn(
          "[vault] safeStorage indisponível; segredos ficarão apenas em memória (ambiente).",
        );
        return;
      }
      fs.writeFileSync(this.vaultPath(), safeStorage.encryptString(JSON.stringify(secrets)));
      this.persisted = true;
    } catch (e) {
      console.error("[vault] falha ao gravar cofre:", (e as Error).message);
    }
  }
}

export const SecurityVault = new SecurityVaultImpl();
