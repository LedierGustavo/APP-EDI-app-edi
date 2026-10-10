// Lookup CNPJ -> CEP/nome. No Electron, toda a consulta e o cache de nome são
// feitos no main (evita CORS e mantém o renderer sem acesso ao Supabase).
// O fallback direto via fetch existe apenas para o modo web de desenvolvimento.

import { getApi } from "@/lib/ipc";

export type CnpjLookupError = "not_found" | "rate_limited" | "timeout" | "invalid";

export type CnpjLookupResult = {
  cep: string | null;
  nome: string | null;
  source: string | null;
  error?: CnpjLookupError;
};

const CACHE_TTL = 5 * 60 * 1000;
const NEGATIVE_TTL = 5 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 5000;

type CacheEntry = { cep: string; nome: string | null; source: string | null; ts: number };
type SourceOutcome =
  | { kind: "found"; cep: string; nome: string | null; source: string }
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "unavailable" };

const cache = new Map<string, CacheEntry>();
const negative = new Map<string, { error: CnpjLookupError; ts: number }>();
const inflight = new Map<string, Promise<CnpjLookupResult>>();

// Normalização estrita: remove não-dígitos e NÃO fabrica zeros à esquerda
// (o antigo padStart criava CNPJs fantasmas). A validação de 14 dígitos é
// feita por quem consome.
export function normalizeCNPJ(cnpj: string): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

function ok(cep: string | null, nome: string | null, source: string | null): CnpjLookupResult {
  return { cep, nome, source };
}

function fail(error: CnpjLookupError): CnpjLookupResult {
  return { cep: null, nome: null, source: null, error };
}

// Rejeita com AbortError assim que o signal do chamador é abortado, sem esperar
// o IPC/fetch terminar. Permite "cancelar" rapidamente ao digitar um novo CNPJ.
function raceWithAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

function combinedSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
}

// --- Consulta via IPC (app desktop) ----------------------------------------

async function lookupViaElectron(cnpj: string): Promise<CnpjLookupResult> {
  const api = getApi();
  if (!api) return fail("timeout");

  const res = await api.lookupCnpj(cnpj);
  if (!res.ok) {
    if (res.error_type === "not_found") {
      negative.set(cnpj, { error: "not_found", ts: Date.now() });
    }
    return fail(res.error_type);
  }
  const cepDigits = res.data.cep ? res.data.cep.replace(/\D/g, "") : "";
  const cep = cepDigits.length === 8 ? cepDigits : null;
  const nome = res.data.nome ?? null;
  const source = res.data.source ?? null;
  if (cep) cache.set(cnpj, { cep, nome, source, ts: Date.now() });
  return ok(cep, nome, source);
}

// --- Fallback web/dev (sem Electron) ---------------------------------------

async function httpBrasilApi(cnpj: string, signal?: AbortSignal): Promise<SourceOutcome> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: combinedSignal(signal),
    });
    if (r.status === 429) return { kind: "rate_limited" };
    if (r.status === 404 || r.status === 400) return { kind: "not_found" };
    if (!r.ok) return { kind: "unavailable" };
    const j: any = await r.json().catch(() => null);
    const cepDigits = j?.cep ? String(j.cep).replace(/\D/g, "") : "";
    const cep = cepDigits.length === 8 ? cepDigits : null;
    const nome = j?.razao_social || j?.nome_fantasia || null;
    if (cep) return { kind: "found", cep, nome, source: "brasilapi" };
    return { kind: "not_found" };
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    return { kind: "unavailable" };
  }
}

async function httpCnpjWs(cnpj: string, signal?: AbortSignal): Promise<SourceOutcome> {
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, {
      headers: { Accept: "application/json" },
      signal: combinedSignal(signal),
    });
    if (r.status === 429) return { kind: "rate_limited" };
    if (r.status === 404 || r.status === 400) return { kind: "not_found" };
    if (!r.ok) return { kind: "unavailable" };
    const j: any = await r.json().catch(() => null);
    const est = j?.estabelecimento;
    const cepRaw = est?.cep || j?.endereco?.cep || j?.cep;
    const cepDigits = cepRaw ? String(cepRaw).replace(/\D/g, "") : "";
    const cep = cepDigits.length === 8 ? cepDigits : null;
    const nome = j?.razao_social || j?.razaoSocial || est?.nome_fantasia || null;
    if (cep) return { kind: "found", cep, nome, source: "cnpj.ws" };
    return { kind: "not_found" };
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    return { kind: "unavailable" };
  }
}

async function lookupViaFetch(cnpj: string, signal?: AbortSignal): Promise<CnpjLookupResult> {
  const first = await httpBrasilApi(cnpj, signal);
  if (first.kind === "found") {
    cache.set(cnpj, { cep: first.cep, nome: first.nome, source: first.source, ts: Date.now() });
    return ok(first.cep, first.nome, first.source);
  }
  const second = await httpCnpjWs(cnpj, signal);
  if (second.kind === "found") {
    cache.set(cnpj, { cep: second.cep, nome: second.nome, source: second.source, ts: Date.now() });
    return ok(second.cep, second.nome, second.source);
  }
  const error: CnpjLookupError =
    first.kind === "rate_limited" || second.kind === "rate_limited"
      ? "rate_limited"
      : first.kind === "unavailable" || second.kind === "unavailable"
        ? "timeout"
        : "not_found";
  if (error === "not_found") negative.set(cnpj, { error: "not_found", ts: Date.now() });
  return fail(error);
}

// --- API pública ------------------------------------------------------------

export async function lookupCepByCNPJ(cnpjRaw: string, signal?: AbortSignal): Promise<CnpjLookupResult> {
  const cnpj = normalizeCNPJ(cnpjRaw);
  if (cnpj.length !== 14) return fail("invalid");

  const cached = cache.get(cnpj);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return ok(cached.cep, cached.nome, cached.source);

  const neg = negative.get(cnpj);
  if (neg && Date.now() - neg.ts < NEGATIVE_TTL) return fail(neg.error);

  // Coalesce chamadas iguais em voo (evita rajadas no StrictMode/efeitos duplicados).
  const existing = inflight.get(cnpj);
  if (existing) return raceWithAbort(existing, signal);

  const run = (getApi() ? lookupViaElectron(cnpj) : lookupViaFetch(cnpj)).finally(() =>
    inflight.delete(cnpj),
  );
  inflight.set(cnpj, run);
  return raceWithAbort(run, signal);
}
