/**
 * Folha de Serviço — Web App (leitura + lançamento)
 *
 * Planilha: https://docs.google.com/spreadsheets/d/1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA
 * Lançamentos (dados): gid 1013912232
 * Listas padronizadas: gid 665133219 (aba DADOS / referência)
 *
 * GET ?somente_opcoes=1  → { ok, opcoes }
 * GET ?data=YYYY-MM-DD   → filtra registros por data
 * POST action=create|update
 */

const SPREADSHEET_ID = "1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA";
const ABA_GID = 1013912232;
const ABA_NOME = "FOLHA DE SERVIÇO";
const LISTAS_GID = 665133219;

/** Colunas da aba de listas (gid 665133219) */
const COLUNAS_LISTAS = {
  analista: 1,            // A — RG
  mot_sai: 6,             // F — MOTORISTAS
  mot_entra: 6,           // F
  carro_sai: 7,           // G — CARROS
  carro_entra: 7,         // G
  linha: 8,               // H — LINHAS
  ocorrencia: 12,         // L — MOTIVOS SERVIÇOS
  local: 18,              // R — LOCAIS
  motivo_oficina: 23,     // W — INFORMAÇÕES DA OFICINA
  tempo_deslocamento: 24,   // X — TEMPO EM MIN DE SOS OFICINA
  mecanico: 25,           // Y — MECÂNICOS
  situacao: 26            // Z — SITUAÇAO
};

const CAMPOS_OPCOES = [
  "ocorrencia", "analista", "carro_sai", "mot_sai", "carro_entra", "mot_entra",
  "linha", "motivo_oficina", "local", "mecanico", "situacao", "tempo_deslocamento"
];

const ALIAS_COLUNAS = {
  ocorrencia: ["ocorrencia", "ocorrência"],
  analista: ["analista"],
  carro_sai: ["carro_sai", "carro sai", "carro que sai"],
  mot_sai: ["mot_sai", "mot sai", "mot que sai", "mot. que sai"],
  carro_entra: ["carro_entra", "carro entra", "carro que entra"],
  mot_entra: ["mot_entra", "mot entra", "mot que entra", "mot. que entra"],
  linha: ["linha"],
  motivo_oficina: ["motivo_oficina", "motivo oficina", "motivo somente oficina", "motivo"],
  local: ["local"],
  mecanico: ["mecanico", "mecânico"],
  situacao: ["situacao", "situação"],
  tempo_deslocamento: ["tempo_deslocamento", "tempo deslocamento", "tempo de deslocamento da oficina"]
};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  if (String(params.somente_opcoes || "") === "1") {
    return json_({ ok: true, opcoes: lerOpcoesPadronizadas_() });
  }
  return json_(montarRespostaLeitura_(params));
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || "create").toLowerCase();
    if (action === "update") return json_(atualizarRegistro_(params));
    return json_(criarRegistro_(params));
  } catch (err) {
    return json_({ ok: false, erro: err.message || String(err) });
  }
}

function montarRespostaLeitura_(params) {
  const filtroData = normalizarDataIso_(params.data || "");
  const limit = parseInt(params.limit || "0", 10);
  const sheet = abrirAba_();
  const valores = sheet.getDataRange().getValues();
  if (valores.length < 2) {
    return { ok: true, dados: [], opcoes: lerOpcoesPadronizadas_() };
  }

  const cabecalho = valores[0].map(normalizarChave_);
  const dados = [];

  for (let i = 1; i < valores.length; i++) {
    const item = linhaParaObjeto_(cabecalho, valores[i], i + 1);
    if (filtroData && normalizarDataIso_(item.data) !== filtroData) continue;
    dados.push(item);
  }

  if (limit > 0 && dados.length > limit) {
    dados.splice(0, dados.length - limit);
  }

  return { ok: true, dados: dados, opcoes: lerOpcoesPadronizadas_() };
}

function lerOpcoesPadronizadas_() {
  const sheet = abrirAbaListas_();
  const lastRow = sheet.getLastRow();
  const opcoes = {};
  const lidas = {};

  CAMPOS_OPCOES.forEach(function (campo) {
    const col = COLUNAS_LISTAS[campo];
    if (!col) {
      opcoes[campo] = [];
      return;
    }
    if (!lidas[col]) {
      lidas[col] = valoresUnicosColunaIndice_(sheet, col, lastRow);
    }
    opcoes[campo] = lidas[col].slice();
  });

  CAMPOS_OPCOES.forEach(function (campo) {
    opcoes[campo].sort(function (a, b) {
      return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
    });
  });

  return opcoes;
}

function abrirAbaListas_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === LISTAS_GID) return sheets[i];
  }
  throw new Error("Aba de listas gid " + LISTAS_GID + " não encontrada na planilha.");
}

function valoresUnicosColunaIndice_(sheet, colIndex, lastRow) {
  if (lastRow < 2) return [];
  const valores = sheet.getRange(2, colIndex, lastRow, colIndex).getValues().flat();
  const unicos = {};
  valores.forEach(function (v) {
    const t = String(v == null ? "" : v).trim();
    if (!t || t === "-") return;
    unicos[t] = true;
  });
  return Object.keys(unicos);
}

function mapearColunaParaCampo_(titulo) {
  const chave = normalizarChave_(titulo);
  for (let i = 0; i < CAMPOS_OPCOES.length; i++) {
    const campo = CAMPOS_OPCOES[i];
    const aliases = [campo].concat(ALIAS_COLUNAS[campo] || []).map(normalizarChave_);
    if (aliases.indexOf(chave) >= 0) return campo;
  }
  return "";
}

function criarRegistro_(params) {
  const sheet = abrirAba_();
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizarChave_);
  const linha = cabecalho.map(function (chave) { return params[chave] || ""; });
  sheet.appendRow(linha);
  return { ok: true, linha: sheet.getLastRow(), acao: "create" };
}

function atualizarRegistro_(params) {
  const row = Number(params._row || params.rowNumber || params.linhaPlanilha);
  if (!row || row < 2) throw new Error("Linha da planilha inválida para atualização.");

  const sheet = abrirAba_();
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizarChave_);
  const valoresAtuais = sheet.getRange(row, 1, row, cabecalho.length).getValues()[0];

  cabecalho.forEach(function (chave, idx) {
    if (Object.prototype.hasOwnProperty.call(params, chave)) {
      valoresAtuais[idx] = params[chave] || "";
    }
  });

  sheet.getRange(row, 1, row, cabecalho.length).setValues([valoresAtuais]);
  return { ok: true, linha: row, acao: "update" };
}

function abrirAba_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === ABA_GID) return sheets[i];
  }

  const porNome = ss.getSheetByName(ABA_NOME);
  if (porNome) return porNome;

  const nomes = sheets.map(function (s) { return s.getName(); }).join(", ");
  throw new Error('Aba gid ' + ABA_GID + ' / "' + ABA_NOME + '" não encontrada. Abas: ' + nomes);
}

function linhaParaObjeto_(cabecalho, valores, rowNumber) {
  const item = { _row: rowNumber };
  cabecalho.forEach(function (chave, idx) {
    if (!chave) return;
    item[chave] = valores[idx] == null ? "" : String(valores[idx]).trim();
  });
  if (item.data) item.data = normalizarDataIso_(item.data) || item.data;
  return item;
}

function normalizarChave_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizarDataIso_(valor) {
  if (!valor) return "";
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + "-" + br[2] + "-" + br[1];
  return "";
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
