/**
 * Folha de Serviço — Web App (leitura + lançamento)
 *
 * Planilha CIOP: https://docs.google.com/spreadsheets/d/1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA
 * gid: 1013912232
 *
 * GET ?somente_opcoes=1  → { ok, opcoes } (listas padronizadas da validação de dados)
 * GET ?data=YYYY-MM-DD   → filtra registros por data
 * POST action=create|update
 */

const SPREADSHEET_ID = "1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA";
const ABA_NOME = "FOLHA DE SERVIÇO";

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
  const sheet = abrirAba_();
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const opcoes = {};
  CAMPOS_OPCOES.forEach(function (campo) { opcoes[campo] = []; });

  for (let col = 0; col < cabecalho.length; col++) {
    const chaveColuna = mapearColunaParaCampo_(cabecalho[col]);
    if (!chaveColuna || !CAMPOS_OPCOES.includes(chaveColuna)) continue;
    const lista = lerValidacaoColuna_(sheet, col + 1);
    if (lista.length > 0) opcoes[chaveColuna] = lista;
  }

  CAMPOS_OPCOES.forEach(function (campo) {
    if (opcoes[campo].length === 0) {
      opcoes[campo] = valoresUnicosColuna_(sheet, campo);
    }
    opcoes[campo].sort(function (a, b) {
      return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
    });
  });

  return opcoes;
}

function lerValidacaoColuna_(sheet, colIndex) {
  const cell = sheet.getRange(2, colIndex);
  const rule = cell.getDataValidation();
  if (!rule) return [];

  const tipo = rule.getCriteriaType();
  const valores = rule.getCriteriaValues();
  if (!valores || valores.length === 0) return [];

  if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return valores[0].map(String).map(function (v) { return v.trim(); }).filter(Boolean);
  }

  if (tipo === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
    const range = valores[0];
    if (!range) return [];
    return range.getValues().flat().map(String).map(function (v) { return v.trim(); }).filter(Boolean);
  }

  return [];
}

function valoresUnicosColuna_(sheet, campo) {
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let colIndex = -1;
  for (let i = 0; i < cabecalho.length; i++) {
    if (mapearColunaParaCampo_(cabecalho[i]) === campo) {
      colIndex = i + 1;
      break;
    }
  }
  if (colIndex < 0) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const inicio = Math.max(2, lastRow - 500);
  const valores = sheet.getRange(inicio, colIndex, lastRow - inicio + 1, 1).getValues().flat();
  const unicos = {};
  valores.forEach(function (v) {
    const t = String(v || "").trim();
    if (t) unicos[t] = true;
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
  const sheet = ss.getSheetByName(ABA_NOME);
  if (!sheet) throw new Error('Aba "' + ABA_NOME + '" não encontrada na planilha.');
  return sheet;
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
