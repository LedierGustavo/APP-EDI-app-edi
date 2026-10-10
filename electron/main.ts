import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { autoUpdater } from "electron-updater";
import { SecurityVault } from "./security";
import { resolvePassword, encryptFernet } from "./crypto";
import { parseSoapResponse } from "./soapParser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE_MAX = 200;

function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function escapeXml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Sanitiza termo de busca usado em filtros PostgREST OR/ilike.
function sanitizeSearch(v: unknown): string {
  return String(v ?? "").replace(/[%_,()*\\]/g, "").trim();
}

function clampPage(page: unknown): number {
  const n = Number(page);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function clampPageSize(size: unknown): number {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), PAGE_SIZE_MAX);
}

type IpcOk<T> = { ok: true; data: T; count?: number | null };
type IpcErr = { ok: false; error: string; errorCode?: string };
type VaultNotice = { ok: false; error: string; errorCode: "VAULT_NOT_READY" };
type ListResult<T> = IpcOk<T> | IpcErr;
type DetailResult<T> = IpcOk<T> | IpcErr | VaultNotice;

function err(e: unknown): IpcErr {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function vaultGuard(): VaultNotice | null {
  if (!SecurityVault.isReady()) {
    return {
      ok: false,
      error: "Cofre não inicializado: verifique SUPABASE_SERVICE_ROLE_KEY e SECRET_KEY.",
      errorCode: "VAULT_NOT_READY",
    };
  }
  return null;
}

async function findCnpjsByNome(nome: string): Promise<string[]> {
  const term = sanitizeSearch(nome);
  if (term.length < 2 || !SecurityVault.supabase) return [];
  const { data } = await SecurityVault.supabase
    .from("cliente_cache")
    .select("cnpj")
    .ilike("nome_cliente", `%${term}%`)
    .limit(50);
  return ((data as { cnpj: string }[] | null) ?? []).map((r) => r.cnpj);
}

function getRaw(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ---------------------------------------------------------------------------
// Janela
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// IPCs - Credenciais (cofre: list = sem segredo, get = sob demanda)
// ---------------------------------------------------------------------------

function registerCredenciaisLegado() {
  // Lista sem a coluna `senha`.
  ipcMain.handle("listar-credenciais", async (_e, args): Promise<ListResult<unknown[]>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { search = "", page, pageSize } = (args ?? {}) as Record<string, unknown>;
      const p = clampPage(page);
      const size = clampPageSize(pageSize);
      const from = p * size;
      const to = from + size - 1;

      let query = SecurityVault.supabase!.from("credenciais").select(
        "id,usuario,criado_em",
        { count: "exact" },
      );

      const term = sanitizeSearch(search);
      if (term) {
        const cnpjs = await findCnpjsByNome(term);
        const parts = [`usuario.ilike.%${term}%`];
        cnpjs.forEach((c) => parts.push(`usuario.ilike.${c}%`));
        query = query.or(parts.join(","));
      }

      const { data, error, count } = await query
        .order("usuario", { ascending: true })
        .range(from, to);
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: data ?? [], count };
    } catch (e) {
      return err(e);
    }
  });

  // Detalhe com senha descriptografada no main.
  ipcMain.handle("obter-credencial", async (_e, usuarioRaw): Promise<DetailResult<unknown>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const usuario = String(usuarioRaw ?? "").trim();
      if (!usuario) return { ok: false, error: "Usuário obrigatório" };
      const { data, error } = await SecurityVault.supabase!
        .from("credenciais")
        .select("usuario,senha")
        .eq("usuario", usuario)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      if (!data) return { ok: false, error: "Credencial não encontrada", errorCode: "NOT_FOUND" };
      const senha = resolvePassword(getRaw((data as { senha: string }).senha), SecurityVault.fernetSecret);
      if (senha === null) {
        return { ok: false, error: "Falha ao descriptografar a senha (chave incorreta).", errorCode: "DECRYPT_FAILED" };
      }
      return { ok: true, data: { usuario: (data as { usuario: string }).usuario, senha } };
    } catch (e) {
      return err(e);
    }
  });

  // Cria credencial criptografando no main (nunca grava texto puro).
  ipcMain.handle("criar-credencial", async (_e, args): Promise<IpcOk<unknown> | IpcErr> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { usuario = "", senha = "" } = (args ?? {}) as Record<string, string>;
      const u = String(usuario).trim();
      if (!/^\d{14}_[A-Z0-9]+$/.test(u)) {
        return { ok: false, error: "Usuário deve ser CNPJ_SUFIXO (ex: 60701190000104_PRD)" };
      }
      if (String(senha).length < 6) return { ok: false, error: "Senha mínimo 6 caracteres" };
      const senhaEnc = encryptFernet(String(senha), SecurityVault.fernetSecret);
      const { error } = await SecurityVault.supabase!
        .from("credenciais")
        .insert({ usuario: u, senha: senhaEnc });
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: { usuario: u } };
    } catch (e) {
      return err(e);
    }
  });
}

function registerEtiquetas() {
  ipcMain.handle("listar-etiquetas", async (_e, args): Promise<ListResult<unknown[]>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { search = "", page, pageSize } = (args ?? {}) as Record<string, unknown>;
      const p = clampPage(page);
      const size = clampPageSize(pageSize);
      const from = p * size;
      const to = from + size - 1;

      let query = SecurityVault.supabase!.from("credenciais_etiquetas").select(
        "cnpj,codigo_cliente,created_at",
        { count: "exact" },
      );

      const term = sanitizeSearch(search);
      if (term) {
        const digits = digitsOnly(term);
        const cnpjs = await findCnpjsByNome(term);
        const parts: string[] = [];
        if (digits) parts.push(`cnpj.ilike.%${digits}%`);
        cnpjs.forEach((c) => parts.push(`cnpj.eq.${c}`));
        if (parts.length === 0) return { ok: true, data: [], count: 0 };
        query = query.or(parts.join(","));
      }

      const { data, error, count } = await query
        .order("cnpj", { ascending: true })
        .range(from, to);
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: data ?? [], count };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("obter-etiqueta", async (_e, args): Promise<DetailResult<unknown>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const cnpj = digitsOnly((args ?? {}).cnpj);
      if (cnpj.length !== 14) return { ok: false, error: "CNPJ inválido" };
      const { data, error } = await SecurityVault.supabase!
        .from("credenciais_etiquetas")
        .select("cnpj,codigo_cliente,senha")
        .eq("cnpj", cnpj)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      if (!data) return { ok: false, error: "Credencial não encontrada", errorCode: "NOT_FOUND" };
      const row = data as { cnpj: string; codigo_cliente: string | null; senha: string };
      const senha = resolvePassword(getRaw(row.senha), SecurityVault.fernetSecret);
      if (senha === null) {
        return { ok: false, error: "Falha ao descriptografar a senha (chave incorreta).", errorCode: "DECRYPT_FAILED" };
      }
      return { ok: true, data: { cnpj: row.cnpj, codigo_cliente: row.codigo_cliente, senha } };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("upsert-etiqueta", async (_e, args): Promise<IpcOk<unknown> | IpcErr> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { cnpj: cnpjRaw = "", senha = "", codigo_cliente = "" } = (args ?? {}) as Record<string, string>;
      const cnpj = digitsOnly(cnpjRaw);
      if (cnpj.length !== 14) return { ok: false, error: "CNPJ deve ter 14 dígitos" };
      if (!String(senha).trim()) return { ok: false, error: "Senha obrigatória" };
      if (!String(codigo_cliente).trim()) return { ok: false, error: "Código do cliente obrigatório" };
      const senhaEnc = encryptFernet(String(senha).trim(), SecurityVault.fernetSecret);
      const { error } = await SecurityVault.supabase!
        .from("credenciais_etiquetas")
        .upsert({ cnpj, senha: senhaEnc, codigo_cliente: String(codigo_cliente).trim() }, { onConflict: "cnpj" });
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: { cnpj } };
    } catch (e) {
      return err(e);
    }
  });
}

function registerSoap() {
  ipcMain.handle("listar-soap", async (_e, args): Promise<ListResult<unknown[]>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { search = "", page, pageSize } = (args ?? {}) as Record<string, unknown>;
      const p = clampPage(page);
      const size = clampPageSize(pageSize);
      const from = p * size;
      const to = from + size - 1;

      let query = SecurityVault.supabase!.from("credenciais_soap").select(
        "cnpj,created_at",
        { count: "exact" },
      );

      const term = sanitizeSearch(search);
      if (term) {
        const digits = digitsOnly(term);
        const cnpjs = await findCnpjsByNome(term);
        const parts: string[] = [];
        if (digits) parts.push(`cnpj.ilike.%${digits}%`);
        cnpjs.forEach((c) => parts.push(`cnpj.eq.${c}`));
        if (parts.length === 0) return { ok: true, data: [], count: 0 };
        query = query.or(parts.join(","));
      }

      const { data, error, count } = await query
        .order("cnpj", { ascending: true })
        .range(from, to);
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: data ?? [], count };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("obter-token", async (_e, args): Promise<DetailResult<unknown>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const cnpj = digitsOnly((args ?? {}).cnpj);
      if (cnpj.length !== 14) return { ok: false, error: "CNPJ inválido" };
      const { data, error } = await SecurityVault.supabase!
        .from("credenciais_soap")
        .select("cnpj,token")
        .eq("cnpj", cnpj)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      if (!data) return { ok: false, error: "Token não encontrado", errorCode: "NOT_FOUND" };
      const row = data as { cnpj: string; token: string };
      const token = resolvePassword(getRaw(row.token), SecurityVault.fernetSecret);
      if (token === null) {
        return { ok: false, error: "Falha ao descriptografar o token (chave incorreta).", errorCode: "DECRYPT_FAILED" };
      }
      return { ok: true, data: { cnpj: row.cnpj, token } };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("upsert-token", async (_e, args): Promise<IpcOk<unknown> | IpcErr> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { cnpj: cnpjRaw = "", token = "" } = (args ?? {}) as Record<string, string>;
      const cnpj = digitsOnly(cnpjRaw);
      if (cnpj.length !== 14) return { ok: false, error: "CNPJ deve ter 14 dígitos" };
      if (!String(token).trim()) return { ok: false, error: "Token obrigatório" };
      const tokenEnc = encryptFernet(String(token).trim(), SecurityVault.fernetSecret);
      const { error } = await SecurityVault.supabase!
        .from("credenciais_soap")
        .upsert({ cnpj, token: tokenEnc }, { onConflict: "cnpj" });
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: { cnpj } };
    } catch (e) {
      return err(e);
    }
  });
}

function registerClienteCache() {
  ipcMain.handle("obter-cliente-nome", async (_e, args): Promise<ListResult<string | null>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const cnpj = digitsOnly((args ?? {}).cnpj);
      if (cnpj.length !== 14) return { ok: true, data: null };
      const { data, error } = await SecurityVault.supabase!
        .from("cliente_cache")
        .select("nome_cliente")
        .eq("cnpj", cnpj)
        .maybeSingle();
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: (data as { nome_cliente: string | null } | null)?.nome_cliente ?? null };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("listar-cliente-nomes", async (_e, args): Promise<ListResult<Record<string, string | null>>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const cnpjs = ((args ?? {}).cnpjs ?? []) as unknown[];
      const norm = [...new Set(cnpjs.map(digitsOnly).filter((c) => c.length === 14))];
      const map: Record<string, string | null> = {};
      if (norm.length === 0) return { ok: true, data: map };
      const { data, error } = await SecurityVault.supabase!
        .from("cliente_cache")
        .select("cnpj,nome_cliente")
        .in("cnpj", norm);
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      ((data as { cnpj: string; nome_cliente: string | null }[] | null) ?? []).forEach((r) => {
        map[r.cnpj] = r.nome_cliente;
      });
      return { ok: true, data: map };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("upsert-cliente-cache", async (_e, args): Promise<IpcOk<unknown> | IpcErr> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const { cnpj: cnpjRaw = "", nome = "" } = (args ?? {}) as Record<string, string>;
      const cnpj = digitsOnly(cnpjRaw);
      const clean = String(nome).trim().slice(0, 200);
      if (cnpj.length !== 14 || !clean) return { ok: true, data: null };
      const { error } = await SecurityVault.supabase!
        .from("cliente_cache")
        .upsert({ cnpj, nome_cliente: clean, atualizado_em: new Date().toISOString() }, { onConflict: "cnpj" });
      if (error) return { ok: false, error: error.message, errorCode: error.code };
      return { ok: true, data: { cnpj } };
    } catch (e) {
      return err(e);
    }
  });

  ipcMain.handle("buscar-cnpjs-por-nome", async (_e, args): Promise<ListResult<string[]>> => {
    const guard = vaultGuard();
    if (guard) return guard;
    try {
      const cnpjs = await findCnpjsByNome(String((args ?? {}).nome ?? ""));
      return { ok: true, data: cnpjs };
    } catch (e) {
      return err(e);
    }
  });
}

// ---------------------------------------------------------------------------
// IPCs - Integrações Braspress (proxy + parse no main)
// ---------------------------------------------------------------------------

function registerIntegracoes() {
  // Lookup CNPJ -> CEP/nome (BrasilAPI + publica.cnpj.ws) e upsert do nome no cache.
  ipcMain.handle("lookup-cnpj", async (_e, cnpjRaw) => {
    const digits = digitsOnly(cnpjRaw).slice(-14);
    if (digits.length !== 14) return { cep: null, nome: null };
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (r.ok) {
        const j = (await r.json()) as Record<string, unknown>;
        const cep = j?.cep ? digitsOnly(j.cep) : null;
        const nome = (j?.razao_social as string) || (j?.nome_fantasia as string) || null;
        if (cep || nome) {
          if (nome) await upsertClienteNomeSilent(digits, nome);
          return { cep, nome, source: "brasilapi" };
        }
      }
    } catch {
      /* tenta fallback */
    }
    try {
      const r2 = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
        headers: { Accept: "application/json" },
      });
      if (r2.ok) {
        const j2 = (await r2.json()) as Record<string, any>;
        const cepRaw = j2?.estabelecimento?.cep || j2?.cep;
        const cep = cepRaw ? digitsOnly(cepRaw) : null;
        const nome =
          j2?.razao_social || j2?.razaoSocial || j2?.estabelecimento?.nome_fantasia || null;
        if (cep || nome) {
          if (nome) await upsertClienteNomeSilent(digits, nome);
          return { cep, nome, source: "cnpj.ws" };
        }
      }
    } catch {
      /* ignore */
    }
    return { cep: null, nome: null };
  });

  // Cotação
  ipcMain.handle("call-cotacao", async (_e, args) => {
    try {
      const { basic, payload, returnType } = args as {
        basic: string;
        payload: unknown;
        returnType?: string;
      };
      const rt = returnType === "xml" ? "xml" : "json";
      const res = await fetch(`https://api.braspress.com/v1/cotacao/calcular/${rt}`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: unknown;
      let parsed: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        if (rt === "xml" && text.trim().startsWith("<")) {
          try {
            const { XMLParser } = await import("fast-xml-parser");
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
            parsed = parser.parse(text);
            const flat =
              (parsed as any)?.cotacao || (parsed as any)?.Cotacao || (parsed as any)?.response || parsed;
            if (flat && (flat.id || flat.prazo || flat.totalFrete)) {
              data = {
                id: String(flat.id ?? ""),
                prazo: Number(flat.prazo ?? 0),
                totalFrete: Number(flat.totalFrete ?? flat.valor ?? 0),
                _rawXml: text,
                _parsed: flat,
              };
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
      return {
        status: res.status,
        ok: res.ok,
        data,
        raw: text,
        parsed,
        headers: Object.fromEntries(res.headers.entries()),
      };
    } catch (e) {
      return { status: 0, ok: false, data: { message: e instanceof Error ? e.message : String(e) }, raw: "" };
    }
  });

  // Tracking v3
  ipcMain.handle("call-tracking", async (_e, args) => {
    try {
      const { basic, cnpj, valor, tipo, returnType } = args as {
        basic: string;
        cnpj: string;
        valor: string;
        tipo: "byNf" | "byNumPedido";
        returnType?: string;
      };
      const rt = returnType === "xml" ? "xml" : "json";
      const base = "https://api.braspress.com/v3/tracking";
      const url =
        tipo === "byNf"
          ? `${base}/byNf/${cnpj}/${valor}/${rt}`
          : `${base}/byNumPedido/${cnpj}/${valor}/${rt}`;
      const res = await fetch(url, { method: "GET", headers: { Authorization: `Basic ${basic}` } });
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: res.status, ok: res.ok, data, raw: text };
    } catch (e) {
      return { status: 0, ok: false, data: { message: e instanceof Error ? e.message : String(e) }, raw: "" };
    }
  });

  // SOAP (envelope montado com escape XML)
  ipcMain.handle("call-tracking-soap", async (_e, args) => {
    try {
      const p = (args ?? {}) as Record<string, string>;
      const soapEnvelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="http://xmlns.oracle.com/Braspress_Datapress/consultaLoteMultiplasOcorrenciasBraspress/consultaLoteMultiplasOcorrenciasBraspress">
  <soapenv:Header/>
  <soapenv:Body>
    <con:process>
      <con:cnpjCliente>${escapeXml(p.cnpjCliente)}</con:cnpjCliente>
      <con:token>${escapeXml(p.token)}</con:token>
      <con:tipoCliente>${escapeXml(p.tipoCliente || "1")}</con:tipoCliente>
      <con:numeroNotaFiscal>${escapeXml(p.numeroNotaFiscal)}</con:numeroNotaFiscal>
      <con:serieNotaFiscal>${escapeXml(p.serieNotaFiscal || "1")}</con:serieNotaFiscal>
      <con:numeroCTe>${escapeXml(p.numeroCTe)}</con:numeroCTe>
      <con:cnpjDestinatario>${escapeXml(p.cnpjDestinatario)}</con:cnpjDestinatario>
      <con:atributo01>${escapeXml(p.atributo01)}</con:atributo01>
      <con:atributo02>${escapeXml(p.atributo02)}</con:atributo02>
      <con:atributo03>${escapeXml(p.atributo03)}</con:atributo03>
      <con:atributo04>${escapeXml(p.atributo04)}</con:atributo04>
      <con:atributo05>${escapeXml(p.atributo05)}</con:atributo05>
    </con:process>
  </soapenv:Body>
</soapenv:Envelope>`;
      const res = await fetch(
        "https://soa.braspress.com.br/soa-infra/services/dataPress/consultaLoteMultiplasOcorrenciasBraspress/consultalotemultiplasocorrenciasbraspress_client_ep",
        {
          method: "POST",
          headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "consultaLoteMultiplasOcorrenciasBraspress" },
          body: soapEnvelope,
        },
      );
      const text = await res.text();
      const parsed = parseSoapResponse(text);
      return { status: res.status, ok: res.ok, data: parsed, raw: text, parsed };
    } catch (e) {
      return { status: 0, ok: false, data: { message: e instanceof Error ? e.message : String(e) }, raw: "" };
    }
  });

  // RotaCep - resolve a senha via cofre e usa HTTPS.
  ipcMain.handle("call-rota-cep", async (_e, args) => {
    const guard = vaultGuard();
    if (guard) return { status: 0, ok: false, data: { message: guard.error } };
    try {
      const { cep, cnpj: cnpjRaw } = args as { cep: string; cnpj: string };
      const cnpj = digitsOnly(cnpjRaw);
      const { data, error } = await SecurityVault.supabase!
        .from("credenciais_etiquetas")
        .select("cnpj,senha")
        .eq("cnpj", cnpj)
        .maybeSingle();
      if (error || !data) {
        return { status: 0, ok: false, data: { message: error?.message || "Credencial não encontrada" } };
      }
      const senha = resolvePassword(getRaw((data as { senha: string }).senha), SecurityVault.fernetSecret);
      if (senha === null) return { status: 0, ok: false, data: { message: "Falha ao descriptografar a credencial." } };
      const basic = Buffer.from(`${(data as { cnpj: string }).cnpj}:${senha}`).toString("base64");
      const res = await fetch("https://dataservices.braspress.com.br/dataservice/consultarotacep", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
        body: JSON.stringify({ cep: digitsOnly(cep) }),
      });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: res.status, ok: res.ok, data: parsed, raw: text };
    } catch (e) {
      return { status: 0, ok: false, data: { message: e instanceof Error ? e.message : String(e) } };
    }
  });
}

async function upsertClienteNomeSilent(cnpj: string, nome: string): Promise<void> {
  try {
    if (!SecurityVault.supabase) return;
    const clean = String(nome).trim().slice(0, 200);
    if (!clean) return;
    await SecurityVault.supabase
      .from("cliente_cache")
      .upsert({ cnpj, nome_cliente: clean, atualizado_em: new Date().toISOString() }, { onConflict: "cnpj" });
  } catch {
    /* cache é best-effort */
  }
}

// ---------------------------------------------------------------------------
// Auto-update
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  autoUpdater.on("update-available", () => win?.webContents.send("update-available"));
  autoUpdater.on("update-downloaded", () => win?.webContents.send("update-downloaded"));
  autoUpdater.on("error", (e) => console.error("[autoUpdater] erro:", e?.message || e));

  ipcMain.handle("check-for-updates", async () => {
    if (!app.isPackaged) return { available: false, dev: true };
    try {
      const res = await autoUpdater.checkForUpdates();
      return { available: !!res, version: res?.updateInfo?.version };
    } catch (e) {
      return { available: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  ipcMain.handle("restart-to-update", () => {
    autoUpdater.quitAndInstall();
  });

  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  try {
    SecurityVault.initialize();
    console.log("[vault] inicializado. persistido:", SecurityVault.isPersisted());
  } catch (e) {
    console.error("[vault] NÃO inicializado:", e instanceof Error ? e.message : e);
  }

  registerCredenciaisLegado();
  registerEtiquetas();
  registerSoap();
  registerClienteCache();
  registerIntegracoes();

  createWindow();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
