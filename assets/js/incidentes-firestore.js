import { db } from "./portal-firestore.js";
import {
  collection,
  doc,
  getDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const COLECAO_INCIDENTES_DIAS = "incidentesDias";
export const SUBCOLECAO_LINHAS = "linhas";

export function normalizarDataIsoIncidente(row) {
  if (row?.data_iso) return row.data_iso;
  const br = String(row?.data || "").trim();
  const p = br.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (p) return `${p[3]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(br) ? br.slice(0, 10) : "";
}

export function idIncidente(row) {
  return String(row?.incidentId || row?.id || "").trim();
}

function docParaLinha(item, dataIso) {
  const data = item.data();
  return Object.assign({}, data, {
    incidentId: data?.incidentId || data?.id || item.id,
    id: data?.id || data?.incidentId || item.id,
    data_iso: normalizarDataIsoIncidente(data) || dataIso
  });
}

export async function carregarHistoricoIncidentesFirestore({ onProgress } = {}) {
  const diasSnap = await getDocs(collection(db, COLECAO_INCIDENTES_DIAS));
  if (diasSnap.empty) return { dados: [], total: 0, diasComDados: 0, origem: "firestore" };

  const dados = [];
  const docs = diasSnap.docs.sort((a, b) => a.id.localeCompare(b.id));
  const LOTE = 20;

  for (let i = 0; i < docs.length; i += LOTE) {
    onProgress?.(`Firestore: ${Math.min(i + LOTE, docs.length)}/${docs.length} dias`);
    const chunk = docs.slice(i, i + LOTE);
    const partes = await Promise.all(
      chunk.map((diaDoc) => getDocs(collection(diaDoc.ref, SUBCOLECAO_LINHAS)).catch(() => null))
    );
    partes.forEach((linhasSnap, idx) => {
      if (!linhasSnap) return;
      const dataIso = chunk[idx].id;
      linhasSnap.forEach((item) => {
        const linha = docParaLinha(item, dataIso);
        if (linha && idIncidente(linha)) dados.push(linha);
      });
    });
  }

  return {
    ok: dados.length > 0,
    dados,
    total: dados.length,
    diasComDados: docs.length,
    origem: "firestore"
  };
}
