import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./portal-firestore.js";
import {
  carregarHistoricoIncidentesFirestore,
  idIncidente,
  normalizarDataIsoIncidente
} from "./incidentes-firestore.js";

export const INCIDENTES_JSON_URL = "../assets/data/incidentes-tcgl.json";

function chaveIncidente(row) {
  return idIncidente(row) || [
    normalizarDataIsoIncidente(row),
    row?.hora || "",
    row?.veiculo || "",
    row?.linha || ""
  ].join("|");
}

function mesclarIncidentes(listas) {
  const mapa = new Map();
  listas.forEach((lista) => {
    (lista || []).forEach((row) => {
      if (!row) return;
      mapa.set(chaveIncidente(row), row);
    });
  });
  return [...mapa.values()];
}

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
    const res = await fetch(`${INCIDENTES_JSON_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { payload: null, incidentes: [] };
    const payload = await res.json();
    const incidentes = Array.isArray(payload?.incidentes) ? payload.incidentes : [];
    return { payload, incidentes };
  } catch (_) {
    return { payload: null, incidentes: [] };
  }
}

async function carregarFirestore(onProgress) {
  await aguardarAuthFirestore();
  const res = await carregarHistoricoIncidentesFirestore({ onProgress });
  return res?.dados || [];
}

function montarPayload(basePayload, incidentes) {
  const payload = Object.assign({}, basePayload || {});
  payload.incidentes = incidentes;
  payload.totalExtraido = incidentes.length;
  if (!payload.atualizadoEm) payload.atualizadoEm = new Date().toISOString();
  payload.fonte = payload.fonte || "Gerenciamento de Incidentes";
  payload.empresa = payload.empresa || "TCGL";
  return payload;
}

/** Fluxo único de leitura: Firestore → JSON. */
export async function carregarDadosIncidentes({ onProgress } = {}) {
  onProgress?.("Consultando Firestore e JSON...");
  const [fsRes, jsonRes] = await Promise.allSettled([
    withTimeout(carregarFirestore(onProgress), 90000),
    withTimeout(carregarJsonSnapshot(), 20000)
  ]);

  const firestore = fsRes.status === "fulfilled" ? fsRes.value : [];
  const jsonPack = jsonRes.status === "fulfilled" ? jsonRes.value : { payload: null, incidentes: [] };
  const json = jsonPack.incidentes || [];
  const tentativas = [
    `Firestore: ${firestore.length}`,
    `JSON: ${json.length}`
  ];
  const origens = [];
  if (firestore.length) origens.push("Firestore");
  if (json.length) origens.push("JSON");

  const incidentes = mesclarIncidentes([json, firestore]);
  const payload = montarPayload(jsonPack.payload, incidentes);

  return {
    payload,
    origem: origens.join(" · ") || "",
    tentativas
  };
}

export { normalizarDataIsoIncidente, idIncidente };
