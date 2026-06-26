/**
 * Escalação / Saída de Carros — Web App STANDALONE
 * (projeto separado da liberação e da folha de serviço)
 *
 * Planilha: 1F9L3b2JZPOMyEixvkTIML_UNNkvPZTZyGI4g05H4ln0 — gid 1482156234
 *
 * GET ?recurso=saida_carros&data=YYYY-MM-DD[&maquina=...]
 * GET ?liberacao=1&recurso=saida_carros&data=YYYY-MM-DD  (compatível com o portal)
 *
 * Implantar como App da Web: executar como Eu, acesso Qualquer pessoa.
 */

const ESCALA_VERSAO = "2026-06-25-escala-saida";
const ESCALA_SPREADSHEET_ID = "1F9L3b2JZPOMyEixvkTIML_UNNkvPZTZyGI4g05H4ln0";
const ESCALA_GID = 1482156234;

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    return json_(montarRespostaEscalaGet_(params));
  } catch (err) {
    return json_({ ok: false, erro: err.message || String(err) });
  }
}

function montarRespostaEscalaGet_(params) {
  const recurso = String(params.recurso || "saida_carros").toLowerCase();
  const dataFiltro = normalizarDataIso_(params.data || "");
  const maquinaFiltro = String(params.maquina || "").trim();

  if (recurso !== "saida_carros") {
    return { ok: false, erro: "Recurso não suportado: " + recurso };
  }
  if (!dataFiltro) {
    return { ok: false, erro: "Informe a data (data=YYYY-MM-DD)." };
  }

  return {
    ok: true,
    dados: lerSaidaCarros_(dataFiltro, maquinaFiltro),
    colunas: lerColunasSaidaCarros_(),
    meta: {
      versao: ESCALA_VERSAO,
      recurso: recurso,
      saida_ref: resolverSaidaCarrosPorData_(dataFiltro)
    }
  };
}

function resolverSaidaCarrosPorData_(dataIso) {
  return {
    spreadsheetId: ESCALA_SPREADSHEET_ID,
    gid: ESCALA_GID,
    origem: "semanal",
    data: dataIso || ""
  };
}

function abrirAbaEscala_() {
  const ss = SpreadsheetApp.openById(ESCALA_SPREADSHEET_ID);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === ESCALA_GID) return sheets[i];
  }
  throw new Error("Aba gid " + ESCALA_GID + " não encontrada.");
}

function lerSaidaCarros_(dataFiltro, maquinaFiltro) {
  if (!dataFiltro) return [];
  var sheet;
  try {
    sheet = abrirAbaEscala_();
  } catch (err) {
    return [];
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const titulos = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cabecalho = titulos.map(normalizarChave_);
  const valores = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const dados = [];

  for (let i = 0; i < valores.length; i++) {
    const bruto = {};
    cabecalho.forEach(function (chave, idx) {
      if (!chave) return;
      bruto[chave] = valorCelula_(valores[i][idx]);
    });
    const dataBr = pickCampo_(bruto, ["data", "dia", "data_saida", "data_dia", "dt", "date"]);
    const dataIso = normalizarDataIso_(dataBr);
    if (dataFiltro && dataIso !== dataFiltro) continue;
    const item = Object.assign({}, bruto, mapearSaidaCarros_(bruto, dataIso, dataBr));
    if (!filtrarMaquina_(item, maquinaFiltro)) continue;
    dados.push(item);
  }

  return dados;
}

function lerColunasSaidaCarros_() {
  var sheet;
  try {
    sheet = abrirAbaEscala_();
  } catch (err) {
    return [];
  }
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  const titulos = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colunas = [];
  titulos.forEach(function (titulo) {
    const chave = normalizarChave_(titulo);
    if (!chave) return;
    colunas.push({ chave: chave, rotulo: String(titulo || "").trim() });
  });
  return colunas;
}

function mapearSaidaCarros_(bruto, dataIso, dataBr) {
  const dataExibir = dataBr || (dataIso ? formatarDataBr_(dataIso) : "");
  const carroEscalado = pickCampo_(bruto, [
    "carro_escalado", "carro_esc", "veiculo_escalado", "prefixo_escalado"
  ]);
  const carro = pickCampo_(bruto, ["carro", "prefixo", "veiculo", "frota"]);
  return {
    data: dataExibir,
    maquina: pickCampo_(bruto, ["maquina", "maquina_", "maq", "equipamento"]),
    linha: pickCampo_(bruto, ["linha", "linha_"]),
    work_id: pickCampo_(bruto, ["work_id", "workid", "work", "id_servico"]),
    carro: carro,
    carro_escalado: carroEscalado || carro,
    f_carro: pickCampo_(bruto, ["f_carro", "f_carro_", "fcarro", "f_car"]),
    subst: pickCampo_(bruto, ["subst", "substituto", "substituicao"]),
    motorista: pickCampo_(bruto, ["motorista", "matricula", "mot", "registro"]),
    preparo: pickCampo_(bruto, ["preparo", "tempo_preparo"]),
    horario_saida_da_garagem: pickCampo_(bruto, [
      "horario_saida_da_garagem", "horario_de_saida_da_garagem", "horario_saida", "saida_programada", "previsto", "horario"
    ]),
    saida_real: pickCampo_(bruto, ["saida_real", "realizado", "saida_efetiva", "hora_real"]),
    local_inicio: pickCampo_(bruto, ["local_inicio", "local", "terminal"]),
    horario_de_inicio: pickCampo_(bruto, ["horario_de_inicio", "horario_inicio", "inicio_programado"]),
    inicio_real: pickCampo_(bruto, ["inicio_real", "inicio_efetivo"]),
    observacoes: pickCampo_(bruto, ["observacoes", "obs", "observacao"]),
    _origem: "saida_carros"
  };
}

function pickCampo_(obj, chaves) {
  for (let i = 0; i < chaves.length; i++) {
    if (obj[chaves[i]]) return obj[chaves[i]];
  }
  return "";
}

function normalizarMaquina_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function filtrarMaquina_(item, maquinaFiltro) {
  if (!maquinaFiltro) return true;
  return normalizarMaquina_(item.maquina) === normalizarMaquina_(maquinaFiltro);
}

function formatarDataBr_(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  if (p.length !== 3) return iso;
  return p[2] + "/" + p[1] + "/" + p[0];
}

function valorCelula_(valor) {
  if (valor == null || valor === "") return "";
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor)) {
    const tz = Session.getScriptTimeZone();
    if (valor.getHours() === 0 && valor.getMinutes() === 0 && valor.getSeconds() === 0) {
      return Utilities.formatDate(valor, tz, "dd/MM/yyyy");
    }
    return Utilities.formatDate(valor, tz, "HH:mm");
  }
  return String(valor).trim();
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
