// ============================================================================
// Migração de chave Fernet das credenciais (APP EDI)
// ============================================================================
// Re-criptografa senha/token das tabelas:
//   public.credenciais           -> coluna `senha`  (chave: `usuario`)
//   public.credenciais_etiquetas -> coluna `senha`  (chave: `cnpj`)
//   public.credenciais_soap      -> coluna `token`  (chave: `cnpj`)
// da chave antiga (OLD_SECRET_KEY) para a chave nova (NEW_SECRET_KEY).
//
// SEGURANÇA: NENHUM segredo fica neste arquivo. Tudo vem do ambiente.
//
// Uso (PowerShell):
//   $env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role atual>"
//   $env:OLD_SECRET_KEY="<chave antiga/comprometida>"
//   $env:NEW_SECRET_KEY="<chave nova (base64 de 32 bytes)>"
//   node scripts/migracao-chaves.mjs            # DRY-RUN (não escreve nada)
//   node scripts/migracao-chaves.mjs --commit   # aplica de verdade
//
// Flags opcionais:
//   --commit            grava as alterações (sem isso é apenas simulação)
//   --limit=50          processa no máximo N linhas por tabela (teste rápido)
//   --only=credenciais_soap   processa apenas uma tabela
//
// Antes de escrever, gera um backup com os ciphertexts originais em
// scripts/_backups/migracao-<timestamp>.json (para rollback manual).
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Cripto (mesma implementação de electron/crypto.ts)
// ---------------------------------------------------------------------------
const FERNET_VERSION = 0x80;

function deriveKey(secret) {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}
function b64urlDecode(input) {
  let b = input.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  return Buffer.from(b, "base64");
}
function b64urlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decryptFernet(token, secret) {
  try {
    const key = deriveKey(secret);
    const signingKey = key.subarray(0, 16);
    const encryptionKey = key.subarray(16, 32);
    const data = b64urlDecode(token);
    if (data.length < 1 + 8 + 16 + 16 + 32) return null;
    if (data[0] !== FERNET_VERSION) return null;
    const hmacData = data.subarray(0, data.length - 32);
    const hmac = data.subarray(data.length - 32);
    const expected = crypto.createHmac("sha256", signingKey).update(hmacData).digest();
    if (hmac.length !== expected.length || !crypto.timingSafeEqual(hmac, expected)) return null;
    const iv = data.subarray(9, 25);
    const ciphertext = data.subarray(25, data.length - 32);
    const decipher = crypto.createDecipheriv("aes-128-cbc", encryptionKey, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
function encryptFernet(plain, secret) {
  const key = deriveKey(secret);
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const version = Buffer.from([FERNET_VERSION]);
  const hmacData = Buffer.concat([version, timestamp, iv, ciphertext]);
  const hmac = crypto.createHmac("sha256", signingKey).update(hmacData).digest();
  return b64urlEncode(Buffer.concat([hmacData, hmac]));
}
function decryptAESGCM(encryptedBase64, secret) {
  try {
    const key = deriveKey(secret);
    const data = Buffer.from(encryptedBase64, "base64");
    if (data.length < 28) return null;
    const nonce = data.subarray(0, 12);
    const rest = data.subarray(12);
    if (rest.length < 16) return null;
    const authTag = rest.subarray(rest.length - 16);
    const ciphertext = rest.subarray(0, rest.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Tenta recuperar o texto puro com uma chave (Fernet -> AES-GCM). null = não é
// um ciphertext dessa chave.
function recover(raw, secret) {
  const f = decryptFernet(raw, secret);
  if (f !== null) return f;
  return decryptAESGCM(raw, secret);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Carrega .env do projeto (se existir) para conveniência. process.env tem
// prioridade. O .env é ignorado pelo git, então não versiona segredos.
function loadDotEnv() {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="));
  return a ? Number(a.split("=")[1]) : 0;
})();
const ONLY = (() => {
  const a = args.find((x) => x.startsWith("--only="));
  return a ? a.split("=")[1] : null;
})();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_SECRET = process.env.OLD_SECRET_KEY;
const NEW_SECRET = process.env.NEW_SECRET_KEY;

const TABLES = [
  { table: "credenciais", key: "usuario", field: "senha" },
  { table: "credenciais_etiquetas", key: "cnpj", field: "senha" },
  { table: "credenciais_soap", key: "cnpj", field: "token" },
];

const missing = Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE,
  OLD_SECRET_KEY: OLD_SECRET,
  NEW_SECRET_KEY: NEW_SECRET,
}).filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`[erro] variáveis de ambiente ausentes: ${missing.join(", ")}`);
  process.exit(1);
}
if (OLD_SECRET === NEW_SECRET) {
  console.error("[erro] OLD_SECRET_KEY e NEW_SECRET_KEY são iguais — nada a migrar.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, key, field) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(`${key},${field}`)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    if (LIMIT && rows.length >= LIMIT) break;
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows;
}

async function run() {
  console.log(COMMIT ? "== MODO COMMIT (gravando) ==" : "== DRY-RUN (nada será gravado) ==");
  console.log(`Tabelas: ${(ONLY ? TABLES.filter((t) => t.table === ONLY) : TABLES).map((t) => t.table).join(", ")}`);
  if (LIMIT) console.log(`Limite por tabela: ${LIMIT}`);

  const backup = { timestamp: new Date().toISOString(), tables: {} };
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalPlaintext = 0;
  let totalUnknown = 0;

  for (const { table, key, field } of TABLES) {
    if (ONLY && table !== ONLY) continue;

    let rows;
    try {
      rows = await fetchAll(table, key, field);
    } catch (e) {
      console.error(`[erro] lendo ${table}: ${e.message}`);
      continue;
    }
    console.log(`\n--- ${table} (${rows.length} linhas) ---`);
    backup.tables[table] = [];
    let migrated = 0, skipped = 0, plaintext = 0, unknown = 0;

    for (const row of rows) {
      const id = row[key];
      const raw = row[field];
      if (raw == null || raw === "") continue;

      // Já migrado? (decrypta com a chave nova) -> pula
      if (recover(raw, NEW_SECRET) !== null) { skipped++; continue; }

      const plainOld = recover(raw, OLD_SECRET);

      if (plainOld !== null) {
        // Ciphertext da chave antiga -> re-criptografa com a nova.
        const encrypted = encryptFernet(plainOld, NEW_SECRET);
        backup.tables[table].push({ [key]: id, [field]: raw });
        if (COMMIT) {
          const { error } = await supabase.from(table).update({ [field]: encrypted }).eq(key, id);
          if (error) { console.error(`  [falha] ${table} ${id}: ${error.message}`); unknown++; continue; }
        }
        migrated++;
      } else if (raw.startsWith("gAAAAA")) {
        // Parece Fernet mas nenhuma chave abre -> NÃO toca (evita corromper).
        console.warn(`  [aviso] ${table} ${id}: Fernet não reconhecido (chave errada?) — ignorado.`);
        unknown++;
      } else {
        // Texto puro (ou senha em base64 legítima): criptografa com a chave nova.
        const encrypted = encryptFernet(raw.trim(), NEW_SECRET);
        backup.tables[table].push({ [key]: id, [field]: raw });
        if (COMMIT) {
          const { error } = await supabase.from(table).update({ [field]: encrypted }).eq(key, id);
          if (error) { console.error(`  [falha] ${table} ${id}: ${error.message}`); unknown++; continue; }
        }
        plaintext++;
      }
    }

    console.log(`  migradas (chave antiga -> nova): ${migrated}`);
    console.log(`  já na chave nova (puladas):      ${skipped}`);
    console.log(`  texto puro criptografado:        ${plaintext}`);
    console.log(`  não reconhecidas (ignoradas):    ${unknown}`);

    totalMigrated += migrated;
    totalSkipped += skipped;
    totalPlaintext += plaintext;
    totalUnknown += unknown;
  }

  // Backup local dos originais (para rollback manual)
  const dir = path.join(process.cwd(), "scripts", "_backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `migracao-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), "utf8");

  console.log("\n================ RESUMO ================");
  console.log(`migradas: ${totalMigrated} | já novas: ${totalSkipped} | texto puro: ${totalPlaintext} | ignoradas: ${totalUnknown}`);
  console.log(`backup dos originais: ${file}`);
  console.log(COMMIT ? "Alterações GRAVADAS no banco." : "DRY-RUN: rode novamente com --commit para aplicar.");
}

run().catch((e) => {
  console.error("[erro fatal]", e);
  process.exit(1);
});
