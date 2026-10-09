import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import crypto from "crypto";
import * as Fernet from "fernet";
import { autoUpdater } from "electron-updater";

// SECRET_KEY apenas no main process (nunca no renderer)
const SECRET_KEY_RAW = process.env.SECRET_KEY || "4hG7@89Kx#pLmN2zQ!vR5sT8";

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function deriveFernetKey(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest().toString("base64");
}

function tryDecryptFernet(token: string, secret: string): string | null {
  try {
    const fernetKey = deriveFernetKey(secret);
    const secretObj = new (Fernet as any).Secret(fernetKey);
    const tokenObj = new (Fernet as any).Token({ secret: secretObj, token, ttl: 0 });
    return tokenObj.decode();
  } catch {
    // fallback manual (caso lib falhe com base64url)
    try {
      const fernetKeyUrl = crypto.createHash("sha256").update(secret, "utf8").digest().toString("base64url");
      const secretObj2 = new (Fernet as any).Secret(fernetKeyUrl);
      const tokenObj2 = new (Fernet as any).Token({ secret: secretObj2, token, ttl: 0 });
      return tokenObj2.decode();
    } catch {
      return null;
    }
  }
}

function tryDecryptAESGCM(encryptedBase64: string, secret: string): string | null {
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
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    title: "APP EDI",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  // Auto-update: GitHub Releases privado, canal latest, silent download + modal confirmação
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    // Para repo privado, GH_TOKEN deve estar no env no momento do publish e também para check (via requestHeaders se necessário)
    // autoUpdater.requestHeaders = { Authorization: `token ${process.env.GH_TOKEN}` }; // descomente se usar token runtime
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    // Checa a cada 4h em background
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// AutoUpdater events -> envia para renderer exibir modal (não interrompe cotação)
autoUpdater.on("update-available", () => {
  win?.webContents.send("update-available");
});
autoUpdater.on("update-downloaded", () => {
  win?.webContents.send("update-downloaded");
});
autoUpdater.on("error", (err) => {
  console.error("[autoUpdater] erro:", err?.message || err);
});
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged) return { available: false, dev: true };
  try {
    const res = await autoUpdater.checkForUpdates();
    return { available: !!res, version: res?.updateInfo?.version };
  } catch (e: any) {
    return { available: false, error: e?.message };
  }
});
ipcMain.handle("restart-to-update", () => {
  autoUpdater.quitAndInstall();
});

// IPC: encrypt senha (Fernet) - usado no Dialog Nova Credencial antes do INSERT
ipcMain.handle("encrypt-senha", async (_e, senhaBruta: string) => {
  if (!senhaBruta) return "";
  try {
    const fernetKey = deriveFernetKey(SECRET_KEY_RAW);
    const secretObj = new (Fernet as any).Secret(fernetKey);
    const token = new (Fernet as any).Token({ secret: secretObj, time: Date.now(), ttl: 0 });
    // Fernet Token encode precisa de Uint8Array ou string
    const encrypted = token.encode(senhaBruta);
    return encrypted;
  } catch {
    try {
      const fernetKeyUrl = crypto.createHash("sha256").update(SECRET_KEY_RAW, "utf8").digest().toString("base64url");
      const secretObj2 = new (Fernet as any).Secret(fernetKeyUrl);
      const token2 = new (Fernet as any).Token({ secret: secretObj2, time: Date.now(), ttl: 0 });
      return token2.encode(senhaBruta);
    } catch {
      return "";
    }
  }
});

// IPC: resolve senha (heurística: Fernet -> AES-GCM -> plain)
ipcMain.handle("resolve-senha", async (_e, senhaBruta: string) => {
  if (!senhaBruta) return "";
  const trimmed = senhaBruta.trim();
  // Fernet tokens começam com gAAAAA e são base64url
  if (trimmed.startsWith("gAAAAA")) {
    const f = tryDecryptFernet(trimmed, SECRET_KEY_RAW);
    if (f !== null) return f;
  }
  const isBase64 = /^[A-Za-z0-9+/=_-]+$/.test(trimmed) && trimmed.length >= 20;
  if (isBase64) {
    const f = tryDecryptFernet(trimmed, SECRET_KEY_RAW);
    if (f !== null) return f;
    const g = tryDecryptAESGCM(trimmed, SECRET_KEY_RAW);
    if (g !== null) return g;
  }
  return trimmed;
});

// IPC: lookup CNPJ -> CEP (BrasilAPI + fallback publica.cnpj.ws) - evita CORS/firewall no renderer
ipcMain.handle("lookup-cnpj", async (_e, cnpj: string) => {
  const digits = cnpj.replace(/\D/g, "").padStart(14, "0").slice(-14);
  if (digits.length !== 14) return { cep: null, nome: null };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (r.ok) {
      const j: any = await r.json();
      const cep = j?.cep ? String(j.cep).replace(/\D/g, "") : null;
      const nome = j?.razao_social || j?.nome_fantasia || null;
      if (cep || nome) return { cep, nome, source: "brasilapi" };
    }
  } catch {}
  try {
    const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, { headers: { Accept: "application/json" } });
    if (r2.ok) {
      const j2: any = await r2.json();
      const cepRaw = j2?.estabelecimento?.cep || j2?.cep;
      const cep = cepRaw ? String(cepRaw).replace(/\D/g, "") : null;
      const nome = j2?.razao_social || j2?.razaoSocial || j2?.estabelecimento?.nome_fantasia || null;
      if (cep || nome) return { cep, nome, source: "cnpj.ws" };
    }
  } catch {}
  return { cep: null, nome: null };
});

// IPC: proxy Braspress - Cotação (com parser XML -> JSON normalizado para cards)
ipcMain.handle("call-cotacao", async (_e, { basic, payload, returnType }: { basic: string; payload: any; returnType: string }) => {
  const url = `https://api.braspress.com/v1/cotacao/calcular/${returnType || "json"}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any;
  let parsed: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    // XML: tenta normalizar para objeto {id, prazo, totalFrete} para reusar cards
    if (returnType === "xml" && text.trim().startsWith("<")) {
      try {
        const { XMLParser } = await import("fast-xml-parser");
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
        parsed = parser.parse(text);
        // Braspress XML costuma ser <cotacao><id>..</id><prazo>..</prazo><totalFrete>..</totalFrete></cotacao> ou similar
        const flat = parsed?.cotacao || parsed?.Cotacao || parsed?.response || parsed;
        if (flat && (flat.id || flat.prazo || flat.totalFrete)) {
          data = { id: String(flat.id ?? ""), prazo: Number(flat.prazo ?? 0), totalFrete: Number(flat.totalFrete ?? flat.valor ?? 0), _rawXml: text, _parsed: flat };
        } else {
          data = text;
        }
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }
  return { status: res.status, ok: res.ok, data, raw: text, parsed, headers: Object.fromEntries(res.headers.entries()) };
});

// IPC: proxy Braspress - Tracking v3
ipcMain.handle("call-tracking", async (_e, { basic, cnpj, valor, tipo, returnType }: { basic: string; cnpj: string; valor: string; tipo: "byNf" | "byNumPedido"; returnType: string }) => {
  const rt = returnType || "json";
  const base = "https://api.braspress.com/v3/tracking";
  const url = tipo === "byNf" ? `${base}/byNf/${cnpj}/${valor}/${rt}` : `${base}/byNumPedido/${cnpj}/${valor}/${rt}`;
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Basic ${basic}` } });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
});

// IPC: proxy Braspress SOAP - consultaLoteMultiplasOcorrenciasBraspress
ipcMain.handle("call-tracking-soap", async (_e, payload: { cnpjCliente: string; token: string; tipoCliente: string; numeroNotaFiscal: string; serieNotaFiscal: string; numeroCTe: string; cnpjDestinatario: string; atributo01: string; atributo02: string; atributo03: string; atributo04: string; atributo05: string }) => {
  const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="http://xmlns.oracle.com/Braspress_Datapress/consultaLoteMultiplasOcorrenciasBraspress/consultaLoteMultiplasOcorrenciasBraspress">
  <soapenv:Header/>
  <soapenv:Body>
    <con:process>
      <con:cnpjCliente>${payload.cnpjCliente || ""}</con:cnpjCliente>
      <con:token>${payload.token || ""}</con:token>
      <con:tipoCliente>${payload.tipoCliente || "1"}</con:tipoCliente>
      <con:numeroNotaFiscal>${payload.numeroNotaFiscal || ""}</con:numeroNotaFiscal>
      <con:serieNotaFiscal>${payload.serieNotaFiscal || "1"}</con:serieNotaFiscal>
      <con:numeroCTe>${payload.numeroCTe || ""}</con:numeroCTe>
      <con:cnpjDestinatario>${payload.cnpjDestinatario || ""}</con:cnpjDestinatario>
      <con:atributo01>${payload.atributo01 || ""}</con:atributo01>
      <con:atributo02>${payload.atributo02 || ""}</con:atributo02>
      <con:atributo03>${payload.atributo03 || ""}</con:atributo03>
      <con:atributo04>${payload.atributo04 || ""}</con:atributo04>
      <con:atributo05>${payload.atributo05 || ""}</con:atributo05>
    </con:process>
  </soapenv:Body>
</soapenv:Envelope>`;
  try {
    const res = await fetch("http://soa.braspress.com.br:80/soa-infra/services/dataPress/consultaLoteMultiplasOcorrenciasBraspress/consultalotemultiplasocorrenciasbraspress_client_ep", {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "consultaLoteMultiplasOcorrenciasBraspress" },
      body: soapEnvelope,
    });
    const text = await res.text();
    let parsed: any = null;
    let data: any = text;
    try {
      const { parseSoapResponse } = await import("../src/lib/soapParser");
      parsed = await parseSoapResponse(text);
      data = parsed;
    } catch {}
    return { status: res.status, ok: res.ok, data, raw: text, parsed };
  } catch (e: any) {
    return { status: 0, ok: false, data: { message: e.message }, raw: "" };
  }
});

// IPC: proxy Braspress RotaCep - consulta de rota por CEP
ipcMain.handle("call-rota-cep", async (_e, { cep, cnpj }: { cep: string; cnpj: string }) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.VITE_SUPABASE_URL || "";
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
    const supabase = createClient(url, anonKey);
    const { data: cred, error: credErr } = await supabase.from("credenciais_etiquetas").select("cnpj,senha").eq("cnpj", cnpj).maybeSingle();
    if (credErr || !cred) return { status: 0, ok: false, data: { message: credErr?.message || "Credencial não encontrada" } };
    const senha = tryDecryptFernet((cred as any).senha, SECRET_KEY_RAW) ?? tryDecryptAESGCM((cred as any).senha, SECRET_KEY_RAW) ?? (cred as any).senha;
    const basic = Buffer.from(`${(cred as any).cnpj}:${senha}`).toString("base64");
    const res = await fetch("http://dataservices.braspress.com.br/dataservice/consultarotacep", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
      body: JSON.stringify({ cep }),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  } catch (e: any) {
    return { status: 0, ok: false, data: { message: e.message } };
  }
});
