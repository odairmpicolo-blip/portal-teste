/**
 * Importa arquivos Excel da pasta local para JSON do portal.
 *
 * 1. Copie da pasta local do Google Drive (recomendado):
 *    python scripts/baixar-tabelas-horarias-drive.py --local
 * 2. Execute: node scripts/importar-tabelas-horarias.mjs
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

function parseDataBr(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function cel(v) {
  if (v == null) return "";
  if (typeof v === "number" && v > 0) {
    const frac = v >= 1 ? v % 1 : v;
    if (frac > 0) {
      const totalMin = Math.round(frac * 24 * 60);
      const h = Math.floor(totalMin / 60) % 24;
      const m = totalMin % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return String(v).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function valorSignificativo(v) {
  const s = cel(v);
  return s && s !== "--:--" && s !== "|";
}

function linhaVazia(row) {
  return !(row || []).some(c => valorSignificativo(c));
}

function ehSeparadorColuna(rows, linhasCab, col) {
  return linhasCab.some(i => cel(rows[i]?.[col]) === "|");
}

function ehInicioSecaoVertical(row) {
  const texto = (row || []).map(cel).join(" ");
  return /^Carro\s+\d+/i.test(texto) && (row || []).some(c => cel(c) === "|");
}

function extrairMeta(rows) {
  const meta = {
    linha: "",
    dia_semana: "",
    data_execucao: "",
    titulo: "TABELA HORÁRIA",
    subtitulo: ""
  };
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
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

function acharCabecalhos(slice) {
  for (let i = 0; i < slice.length; i++) {
    const cells = (slice[i] || []).map(cel);
    const subs = cells.filter(c => /^(cheg\.?|sa[ií]da)$/i.test(c));
    if (subs.length >= 2) {
      return {
        idxSub: i,
        idxHead: Math.max(0, i - 1),
        idxTitulo: Math.max(0, i - 2)
      };
    }
  }
  for (let i = 0; i < slice.length; i++) {
    const labels = (slice[i] || []).map(cel).filter(Boolean);
    if (labels.length >= 2 && labels.some(l => /hor|viagem|sa[ií]da|chegada|in[ií]cio/i.test(l))) {
      return { idxSub: i, idxHead: i, idxTitulo: Math.max(0, i - 1) };
    }
  }
  return null;
}

function montarRotuloColuna(rows, linhasCab, col) {
  const partes = [];
  for (const i of linhasCab) {
    const v = cel(rows[i]?.[col]);
    if (!v || v === "|") continue;
    if (!partes.includes(v)) partes.push(v);
  }
  return partes.join("\n");
}

function tituloSecao(rows, linhasCab) {
  const i = linhasCab[0];
  const rotulos = [];
  for (let c = 0; c < (rows[i] || []).length; c++) {
    if (ehSeparadorColuna(rows, linhasCab, c)) continue;
    const v = cel(rows[i]?.[c]);
    if (v && !rotulos.includes(v)) rotulos.push(v);
  }
  if (rotulos.length === 1) return rotulos[0];
  if (rotulos.length > 1) return rotulos.slice(0, 3).join(" · ");
  const head = montarRotuloColuna(rows, linhasCab, 0);
  return head || "Horários";
}

function podarColunas(colunas, linhas) {
  return colunas.filter(col => linhas.some(row => valorSignificativo(row[col.chave])));
}

function extrairGrade(rows, ini, fim) {
  const slice = rows.slice(ini, fim);
  const cab = acharCabecalhos(slice);
  if (!cab) return null;

  const linhasCab = [cab.idxTitulo, cab.idxHead, cab.idxSub].filter((v, i, a) => a.indexOf(v) === i);
  let maxCol = 0;
  for (const r of slice) maxCol = Math.max(maxCol, ((r || []).length || 1) - 1);

  const colunas = [];
  for (let c = 0; c <= maxCol; c++) {
    if (ehSeparadorColuna(slice, linhasCab, c)) continue;
    const rotulo = montarRotuloColuna(slice, linhasCab, c);
    if (!rotulo) continue;
    colunas.push({
      chave: `c_${c}`,
      idx: c,
      rotulo,
      largura: Math.max(52, Math.min(160, rotulo.split("\n").reduce((m, l) => Math.max(m, l.length), 0) * 8 + 20)),
      alinhamento: /obs|local|ponto|terminal|via|carro|aurora|articulado/i.test(rotulo) ? "esquerda" : "centro"
    });
  }

  const linhas = [];
  for (let r = cab.idxSub + 1; r < slice.length; r++) {
    const row = slice[r] || [];
    if (ehInicioSecaoVertical(row)) break;
    if (linhaVazia(row)) continue;
    const item = {};
    colunas.forEach(col => { item[col.chave] = cel(row[col.idx]); });
    if (!colunas.some(col => valorSignificativo(item[col.chave]))) continue;
    linhas.push(item);
  }

  const colunasFinais = podarColunas(colunas, linhas);
  if (!colunasFinais.length) return null;

  return {
    titulo: tituloSecao(slice, linhasCab),
    colunas: colunasFinais,
    linhas
  };
}

function indicesSecoes(rows) {
  const idx = [];
  for (let i = 0; i < rows.length; i++) {
    if (ehInicioSecaoVertical(rows[i])) idx.push(i);
  }
  if (!idx.length) {
    const cab = acharCabecalhos(rows);
    if (cab) idx.push(cab.idxTitulo);
  }
  return idx;
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

  const inicios = indicesSecoes(rows);
  const secoes = [];

  for (let s = 0; s < inicios.length; s++) {
    const ini = inicios[s];
    const fim = s + 1 < inicios.length ? inicios[s + 1] : rows.length;
    const grade = extrairGrade(rows, ini, fim);
    if (grade && grade.linhas.length) secoes.push(grade);
  }

  if (!secoes.length) {
    const grade = extrairGrade(rows, 0, rows.length);
    if (grade) secoes.push(grade);
  }

  if (secoes.length === 1) {
    return { meta, colunas: secoes[0].colunas, linhas: secoes[0].linhas, secoes };
  }

  return { meta, secoes };
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
    console.log("Pastas criadas. Rode: python scripts/baixar-tabelas-horarias-drive.py --local");
    return;
  }

  const tabelasDir = path.join(outputRoot, "tabelas");
  fs.mkdirSync(tabelasDir, { recursive: true });

  const manifest = {
    versao: "2026-06-23-tabelas-v2",
    atualizadoEm: new Date().toISOString(),
    drivePastaId: "1TKryDACuyao1v2wE9GGSM0rws2oOnQu5",
    tipos: {
      uteis: { rotulo: "Dias úteis", total: 84 },
      sabado: { rotulo: "Sábado", total: 70 },
      domingo: { rotulo: "Domingo", total: 57 }
    },
    tabelas: []
  };

  const vistos = new Set();
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
      if (!vistos.has(id)) {
        vistos.add(id);
        manifest.tabelas.push({
          id,
          tipo,
          linha: String(linha),
          titulo: `LINHA ${linha}`,
          arquivo: rel,
          ordem: ++ordem
        });
      }
      const qtd = payload.secoes?.length || 1;
      const linhas = payload.linhas?.length || payload.secoes?.reduce((n, s) => n + s.linhas.length, 0) || 0;
      console.log(`  -> ${rel} (${qtd} seção(ões), ${linhas} linhas)`);
    }
  }

  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Manifest atualizado com ${manifest.tabelas.length} tabela(s).`);
}

main();
