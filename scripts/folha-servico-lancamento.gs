/**
 * Folha de Serviço — Web App (leitura + lançamento)
 *
 * Planilha CIOP: https://docs.google.com/spreadsheets/d/1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA
 * Aba sugerida (gid 1013912232): ajuste ABA_NOME se o nome da aba for outro.
 *
 * Implantação:
 * 1. Extensões > Apps Script na planilha (ou projeto vinculado).
 * 2. Cole este código, ajuste ABA_NOME e SPREADSHEET_ID se necessário.
 * 3. Implantar > Nova implantação > App da Web.
 * 4. Executar como: Eu | Quem acessa: Qualquer pessoa
 * 5. Copie a URL /exec para URL_DO_SCRIPT_GOOGLE em pages/Folhadeservico1.html
 */

const SPREADSHEET_ID = "1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA";
const ABA_NOME = "FOLHA DE SERVIÇO"; // confira o nome exato da aba na planilha

const CAMPOS = [
  "data", "hora", "ocorrencia", "analista", "carro_sai", "mot_sai",
  "carro_entra", "mot_entra", "linha", "tabela", "servico",
  "motivo_oficina", "observacoes", "local", "mecanico", "situacao", "tempo_deslocamento"
];

const CAMPOS_OPCOES = [
  "ocorrencia", "analista", "carro_sai", "mot_sai", "carro_entra", "mot_entra",
  "linha", "motivo_oficina", "local", "mecanico", "situacao", "tempo_deslocamento"
];

function doGet(e) {
  return json_(montarRespostaLeitura_(e));
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

function montarRespostaLeitura_(e) {
  const filtroData = normalizarDataIso_(e && e.parameter ? e.parameter.data : "");
  const sheet = abrirAba_();
  const valores = sheet.getDataRange().getValues();
  if (valores.length < 2) {
    return { ok: true, dados: [], opcoes: montarOpcoes_([]) };
  }

  const cabecalho = valores[0].map(normalizarChave_);
  const dados = [];

  for (let i = 1; i < valores.length; i++) {
    const item = linhaParaObjeto_(cabecalho, valores[i], i + 1);
    if (filtroData && normalizarDataIso_(item.data) !== filtroData) continue;
    dados.push(item);
  }

  return { ok: true, dados: dados, opcoes: montarOpcoes_(dados) };
}

function criarRegistro_(params) {
  const sheet = abrirAba_();
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizarChave_);
  const linha = cabecalho.map(chave => params[chave] || "");
  sheet.appendRow(linha);
  return { ok: true, linha: sheet.getLastRow(), acao: "create" };
}

function atualizarRegistro_(params) {
  const row = Number(params._row || params.rowNumber || params.linhaPlanilha);
  if (!row || row < 2) throw new Error("Linha da planilha inválida para atualização.");

  const sheet = abrirAba_();
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizarChave_);
  const valoresAtuais = sheet.getRange(row, 1, row, cabecalho.length).getValues()[0];

  cabecalho.forEach((chave, idx) => {
    if (Object.prototype.hasOwnProperty.call(params, chave)) {
      valoresAtuais[idx] = params[chave] || "";
    }
  });

  sheet.getRange(row, 1, 1, cabecalho.length).setValues([valoresAtuais]);
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
  cabecalho.forEach((chave, idx) => {
    if (!chave) return;
    item[chave] = valores[idx] == null ? "" : String(valores[idx]).trim();
  });
  if (item.data) item.data = normalizarDataIso_(item.data) || item.data;
  return item;
}

function montarOpcoes_(dados) {
  const opcoes = {};
  CAMPOS_OPCOES.forEach(campo => { opcoes[campo] = []; });

  dados.forEach(item => {
    CAMPOS_OPCOES.forEach(campo => {
      const valor = String(item[campo] || "").trim();
      if (!valor) return;
      if (!opcoes[campo].includes(valor)) opcoes[campo].push(valor);
    });
  });

  CAMPOS_OPCOES.forEach(campo => {
    opcoes[campo].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  });

  return opcoes;
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
