/**
 * Liberação via Aurora DSQL (API AWS) — leitura e salvamento na planilha pelo servidor.
 */
import {
  awsFetch,
  awsApiEnabled,
  firebaseIdToken,
  initPortalAwsRuntime
} from "./portal-aws-config.js";

async function authHeaders() {
  await initPortalAwsRuntime();
  if (!awsApiEnabled()) throw new Error("API AWS não configurada");
  const headers = {};
  try {
    headers.token = await firebaseIdToken();
  } catch (_) {
    const devKey = typeof window !== "undefined" ? window.PORTAL_DEV_API_KEY : "";
    if (devKey) headers.apiKey = devKey;
    else throw new Error("Sessão expirada");
  }
  return headers;
}

export async function carregarJanelaLiberacaoAws(dataDe, dataAte) {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ de: dataDe, ate: dataAte });
  return awsFetch(`/liberacao?${qs}`, headers);
}

export async function salvarLinhaLiberacaoAws(dataIso, rowId, payload) {
  const headers = await authHeaders();
  return awsFetch(`/liberacao/${encodeURIComponent(dataIso)}/${encodeURIComponent(rowId)}`, {
    method: "PUT",
    body: payload,
    ...headers
  });
}

/** Salva na planilha Google via API AWS (POST direto do browser falha no redirect do Apps Script). */
export async function salvarLinhaPlanilhaAws(payload) {
  const headers = await authHeaders();
  return awsFetch("/liberacao/planilha-linha", {
    method: "POST",
    body: payload,
    ...headers
  });
}

export async function liberacaoAwsDisponivel() {
  await initPortalAwsRuntime();
  return awsApiEnabled();
}
