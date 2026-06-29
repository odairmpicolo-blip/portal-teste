/**
 * Gera assets/js/gabarito-garagem-data.js a partir do Gabarito Garagem.xlsx
 * Uso: node scripts/gerar-gabarito-garagem.mjs [caminho.xlsx]
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const defaultXlsx =
  "/Users/odairpicolo/Library/CloudStorage/OneDrive-Pessoal/Documentos/03 - Doc. TCGL/Gabarito Garagem.xlsx";
const xlsxPath = process.argv[2] || defaultXlsx;

const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets["Planilha1"] || wb.Sheets[wb.SheetNames[0]];
const merges = ws["!merges"] || [];

function inMerge(r, c) {
  for (const m of merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      return m.s.r === r && m.s.c === c ? m : "skip";
    }
  }
  return null;
}

function parseVaga(text) {
  const m = String(text).match(/vag[aá]?\s*\.?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Mapeia célula "Vaga N" para filaKey + slotIndex (0 = Vaga 1). */
function mapearVaga(r, c, vagaNum) {
  // Corujão — col A, linhas 4–8
  if (c === 0 && r >= 3 && r <= 7) {
    return { filaKey: "corujao", slotIndex: vagaNum - 1 };
  }
  // Lavador — topo (linha 2: Vag.35/32) e faixa muro (linha 4, cols AN–BR)
  if (r === 1 && (c === 39 || c === 40)) {
    return { filaKey: "latavador_f1", slotIndex: c === 39 ? 0 : 1 };
  }
  if (r === 3 && c >= 39 && c <= 69) {
    return { filaKey: "latavador_f1", slotIndex: 2 + (c - 39) };
  }
  // Bomba — linha 7, cols X–AJ
  if (r === 6 && c >= 23 && c <= 35) {
    return { filaKey: "bomba", slotIndex: vagaNum - 1 };
  }
  // Corredor Cor. 1–6 — cols BP–BR, linhas 5–10
  if (c >= 67 && c <= 69 && r >= 4 && r <= 9) {
    const cor = r - 4 + 1;
    return { filaKey: `corredor_c${cor}`, slotIndex: vagaNum - 1 };
  }
  // Carros mistos — esquerda, filas 1–4 (linhas 11–14)
  if (r === 10 && c >= 28 && c <= 42) {
    return { filaKey: "mistos_f1", slotIndex: vagaNum - 1 };
  }
  if (r === 11 && c >= 21 && c <= 42) {
    return { filaKey: "mistos_f2", slotIndex: vagaNum - 1 };
  }
  if (r === 12 && c >= 13 && c <= 42) {
    return { filaKey: "mistos_f3", slotIndex: vagaNum - 1 };
  }
  if (r === 13 && c >= 5 && c <= 42 && c !== 18) {
    return { filaKey: "mistos_f4", slotIndex: vagaNum - 1 };
  }
  // Pesados — direita, filas 1–4
  if (r >= 10 && r <= 13 && c >= 46 && c <= 69) {
    const txt = ws[XLSX.utils.encode_cell({ r, c })]?.v;
    if (txt && String(txt).trim().toLowerCase() === "x") return null;
    const filaOrdem = r - 10 + 1;
    return { filaKey: `pesados_f${filaOrdem}`, slotIndex: vagaNum - 1 };
  }
  return null;
}

const ROWS = 15;
const COLS = 74;
const cells = [];
const maxSlot = {};

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const merge = inMerge(r, c);
    if (merge === "skip") continue;

    const addr = XLSX.utils.encode_cell({ r, c });
    const raw = ws[addr]?.v;
    const text = raw != null ? String(raw).trim() : "";
    const cell = { r, c };

    if (merge && merge !== "skip") {
      cell.rowSpan = merge.e.r - merge.s.r + 1;
      cell.colSpan = merge.e.c - merge.s.c + 1;
    }

    let vagaNum = parseVaga(text);
    if (vagaNum == null && /^vag\.\s*\d+$/i.test(text)) {
      vagaNum = parseVaga(text.replace("Vag.", "Vaga "));
    }
    if (vagaNum != null) {
      const map = mapearVaga(r, c, vagaNum);
      if (map) {
        cell.type = "slot";
        cell.label = text.replace(/^Vag\./i, "Vaga");
        cell.filaKey = map.filaKey;
        cell.slotIndex = map.slotIndex;
        maxSlot[map.filaKey] = Math.max(maxSlot[map.filaKey] || 0, map.slotIndex + 1);
      } else {
        cell.type = "label";
        cell.label = text;
      }
    } else if (text.toLowerCase() === "x") {
      cell.type = "sep";
      cell.label = "×";
    } else if (text) {
      cell.type = "label";
      cell.label = text;
      const low = text.toLowerCase();
      if (low.includes("reforma")) cell.areaKey = "reforma";
      else if (low.includes("oficina")) cell.areaKey = "oficina";
      else if (low === "cot") cell.areaKey = "cot";
      else if (low.includes("lavador")) cell.areaKey = "latavador_f1";
      else if (low === "muro") cell.areaKey = "muro";
      else if (low.includes("bomba")) cell.areaKey = "bomba";
      else if (low.includes("corujão") || low.includes("corujao")) cell.areaKey = "corujao";
      else if (/^cor\s*\d/i.test(text)) cell.areaKey = `corredor_c${text.replace(/\D/g, "")}`;
      else if (low.includes("caixa")) cell.areaKey = "caixa_dagua";
    } else {
      cell.type = "empty";
    }
    cells.push(cell);
  }
}

const gabarito = {
  version: 1,
  source: path.basename(xlsxPath),
  rows: ROWS,
  cols: COLS,
  capacidades: maxSlot,
  saidas: {
    norte: "Messias Wilmar de Souza",
    oeste: "José Dias Aro",
    sul: "Rua Tietê",
    leste: "Duque de Caxias"
  },
  cells
};

const outJs = `/** Gerado por scripts/gerar-gabarito-garagem.mjs — não editar manualmente */\nwindow.GABARITO_GARAGEM = ${JSON.stringify(gabarito)};\n`;
const outPath = path.join(process.cwd(), "assets/js/gabarito-garagem-data.js");
fs.writeFileSync(outPath, outJs);

console.log("Capacidades detectadas:", maxSlot);
console.log("Escrito:", outPath, `(${cells.length} células)`);
