/**
 * Importa arquivos Excel da pasta local para JSON do portal.
 *
 * 1. Baixe os arquivos da pasta Drive:
 *    https://drive.google.com/drive/folders/1TKryDACuyao1v2wE9GGSM0rws2oOnQu5
 * 2. Organize em:
 *    assets/import/tabelas-horarias/uteis/*.xlsx
 *    assets/import/tabelas-horarias/sabado/*.xlsx
 *    assets/import/tabelas-horarias/domingo/*.xlsx
 * 3. Execute: npm install xlsx (na raiz do portal, uma vez)
 * 4. Execute: node scripts/importar-tabelas-horarias.mjs
 */

import fs from "node:fs";
import path from "node:path";

const portalRoot = process.env.PORTAL_ROOT || process.cwd();
const importRoot = path.join(portalRoot, "assets", "import", "tabelas-horarias");
const outputRoot = path.join(portalRoot, "assets", "data", "tabelas-horarias");
const TIPOS = ["uteis", "sabado", "domingo"];

let XLSX;
try {
  XLSX = (await import("xlsx")).default;
} catch {
  console.error("Pacote 'xlsx' não encontrado. Rode: npm install xlsx");
  process.exit(1);
}

function isoHoje() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

function normalizarChave(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDataBr(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function cel(v) {
  if (v == null) return "";
  if (typeof v === "number" && v > 0 && v < 1) {
    const totalMin = Math.round(v * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return String(v).trim();
}

function extrairMeta(rows) {
  const meta = {
    linha: "",
    dia_semana: "",
    data_execucao: "",
    titulo: "TABELA HORÁRIA",
    subtitulo: ""
  };
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] || [];
    const texto = row.map(cel).join(" ").toUpperCase();
    if (!meta.linha) {
      const mLinha = texto.match(/LINHA\s*[:#]?\s*(\d{2,4})/i) || texto.match(/\bLINHA\s+(\d{2,4})\b/i);
      if (mLinha) meta.linha = mLinha[1];
    }
    if (!meta.dia_semana && /(SEGUNDA|TERÇA|QUARTA|QUINTA|SEXTA|SÁBADO|SABADO|DOMINGO)/i.test(texto)) {
      meta.dia_semana = row.map(cel).find(c => /(segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo)/i.test(c)) || "";
    }
    if (!meta.data_execucao) {
      for (const cell of row) {
        const iso = parseDataBr(cell);
        if (iso) { meta.data_execucao = iso; break; }
      }
    }
  }
  return meta;
}

function acharLinhaCabecalho(rows) {
  for (let i = 0; i < rows.length; i++) {
    const labels = (rows[i] || []).map(cel).filter(Boolean);
    if (labels.length >= 2 && labels.some(l => /hor|viagem|sa[ií]da|chegada|in[ií]cio/i.test(l))) {
      return i;
    }
  }
  return -1;
}

function planilhaParaJson(sheet, tipo, nomeArquivo) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const meta = extrairMeta(rows);
  if (!meta.linha) {
    const base = path.basename(nomeArquivo, path.extname(nomeArquivo));
    const m = base.match(/(\d{2,4})/);
    if (m) meta.linha = m[1];
  }
  meta.tipo = tipo;
  if (!meta.data_execucao) meta.data_execucao = isoHoje();

  const idxHead = acharLinhaCabecalho(rows);
  if (idxHead < 0) {
    return { meta, colunas: [], linhas: [] };
  }

  const head = (rows[idxHead] || []).map(cel);
  const colunas = head.map((rotulo, idx) => ({
    chave: normalizarChave(rotulo) || `col_${idx + 1}`,
    rotulo: rotulo || `Coluna ${idx + 1}`,
    largura: Math.max(56, Math.min(180, String(rotulo || "").length * 9 + 24)),
    alinhamento: /obs|local|ponto|terminal/i.test(rotulo) ? "esquerda" : "centro"
  }));

  const linhas = [];
  for (let r = idxHead + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some(c => cel(c))) continue;
    const item = {};
    colunas.forEach((col, idx) => { item[col.chave] = cel(row[idx]); });
    if (Object.values(item).every(v => !v)) continue;
    linhas.push(item);
  }

  return { meta, colunas, linhas };
}

function listarArquivos(tipo) {
  const dir = path.join(importRoot, tipo);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.(xlsx|xls)$/i.test(f)).map(f => path.join(dir, f));
}

function main() {
  if (!fs.existsSync(importRoot)) {
    fs.mkdirSync(importRoot, { recursive: true });
    for (const tipo of TIPOS) fs.mkdirSync(path.join(importRoot, tipo), { recursive: true });
    console.log("Pastas criadas em assets/import/tabelas-horarias/{uteis,sabado,domingo}");
    console.log("Copie os Excel do Drive e execute novamente.");
    return;
  }

  const tabelasDir = path.join(outputRoot, "tabelas");
  fs.mkdirSync(tabelasDir, { recursive: true });

  const manifest = {
    versao: "2026-06-23-tabelas-v1",
    atualizadoEm: new Date().toISOString(),
    drivePastaId: "1TKryDACuyao1v2wE9GGSM0rws2oOnQu5",
    tipos: {
      uteis: { rotulo: "Dias úteis", total: 84 },
      sabado: { rotulo: "Sábado", total: 70 },
      domingo: { rotulo: "Domingo", total: 57 }
    },
    tabelas: []
  };

  let ordem = 0;
  for (const tipo of TIPOS) {
    const arquivos = listarArquivos(tipo);
    console.log(`${tipo}: ${arquivos.length} arquivo(s)`);
    for (const arquivo of arquivos) {
      const wb = XLSX.readFile(arquivo);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const payload = planilhaParaJson(sheet, tipo, arquivo);
      const linha = payload.meta.linha || path.basename(arquivo).replace(/\D/g, "") || String(ordem + 1);
      const id = `${linha}-${tipo}`;
      payload.id = id;
      const rel = `tabelas/${id}.json`;
      fs.writeFileSync(path.join(outputRoot, rel), JSON.stringify(payload));
      manifest.tabelas.push({
        id,
        tipo,
        linha: String(linha),
        titulo: `LINHA ${linha}`,
        arquivo: rel,
        ordem: ++ordem
      });
      console.log(`  -> ${rel} (${payload.linhas.length} linhas)`);
    }
  }

  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Manifest atualizado com ${manifest.tabelas.length} tabela(s).`);
}

main();
