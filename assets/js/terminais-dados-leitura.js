import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./portal-firestore.js";
import {
  carregarSnapshotTerminaisFirestore,
  reidratarSnapshotTerminais
} from "./terminais-firestore.js";

export const TERMINAIS_JSON_URL = "../assets/data/terminais-agora.json";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), ms);
    })
  ]);
}

async function aguardarAuthFirestore() {
  const auth = getAuth(app);
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  return auth.currentUser;
}

async function carregarJsonSnapshot() {
  try {
    const res = await fetch(`${TERMINAIS_JSON_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const payload = await res.json();
    return reidratarSnapshotTerminais(payload);
  } catch (_) {
    return null;
  }
}

async function carregarFirestore() {
  await aguardarAuthFirestore();
  const res = await carregarSnapshotTerminaisFirestore();
  if (!res.ok || !res.payload) return null;
  return reidratarSnapshotTerminais(res.payload);
}

function escolherSnapshot(candidatos) {
  const validos = candidatos.filter((item) => item?.REGISTROS?.length);
  if (!validos.length) return null;
  validos.sort((a, b) => {
    const ta = new Date(a.atualizadoEm || 0).getTime();
    const tb = new Date(b.atualizadoEm || 0).getTime();
    return tb - ta;
  });
  return validos[0];
}

/** Fluxo único de leitura: Firestore → JSON. */
export async function carregarDadosTerminais({ onProgress } = {}) {
  onProgress?.("Consultando Firestore e JSON...");
  const [fsRes, jsonRes] = await Promise.allSettled([
    withTimeout(carregarFirestore(), 30000),
    withTimeout(carregarJsonSnapshot(), 15000)
  ]);

  const firestore = fsRes.status === "fulfilled" ? fsRes.value : null;
  const json = jsonRes.status === "fulfilled" ? jsonRes.value : null;
  const snapshot = escolherSnapshot([
    firestore ? { ...firestore, _origem: "Firestore" } : null,
    json ? { ...json, _origem: "JSON" } : null
  ]);

  const origens = [];
  if (firestore?.REGISTROS?.length) origens.push("Firestore");
  if (json?.REGISTROS?.length) origens.push("JSON");

  return {
    payload: snapshot,
    origem: snapshot?._origem || origens.join(" · ") || "",
    tentativas: [
      `Firestore: ${firestore?.REGISTROS?.length || 0}`,
      `JSON: ${json?.REGISTROS?.length || 0}`
    ]
  };
}

export { reidratarSnapshotTerminais, mapTerminalTelefoneFromPlain } from "./terminais-firestore.js";
