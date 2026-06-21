/**
 * Acompanhamento da Liberação — Web App (mesmo projeto do folha-servico-lancamento.gs)
 *
 * Planilha CIOP: 1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA
 *   - D.Operacionais de In.Linhas (gráficos): gid 751419807
 *   - ACOMPANHAMENTO LIBERAÇÃO (lançamentos): gid 753262285
 * Saída de carros: 1F9L3b2JZPOMyEixvkTIML_UNNkvPZTZyGI4g05H4ln0 — gid 1482156234
 *
 * GET  ?liberacao=1&recurso=operacionais[&data=YYYY-MM-DD]
 * GET  ?liberacao=1&recurso=acompanhamento[&data=YYYY-MM-DD][&limit=N]
 * GET  ?liberacao=1&recurso=saida_carros[&data=YYYY-MM-DD]
 * POST ?liberacao=1  action=create|update  (+ campos da aba acompanhamento)
 */

const LIBERACAO_VERSAO = "2026-06-21-liberacao-v1";
const LIBERACAO_SPREADSHEET_ID = "1zY_BFsidZyF4RnzKTZkZAlmo-Qiz6JEdIEb3E2xoIeA";
const LIBERACAO_OPERACIONAIS_GID = 751419807;
const LIBERACAO_ACOMPANHAMENTO_GID = 753262285;
const LIBERACAO_SAIDA_SPREADSHEET_ID = "1F9L3b2JZPOMyEixvkTIML_UNNkvPZTZyGI4g05H4ln0";
const LIBERACAO_SAIDA_GID = 1482156234;

function montarRespostaLiberacaoGet_(params) {
  const recurso = String(params.recurso || "operacionais").toLowerCase();
  const dataFiltro = normalizarDataIsoLiberacao_(params.data || "");

  if (recurso === "acompanhamento") {
    const limit = parseInt(params.limit || "0", 10);
    return {
      ok: true,
      dados: lerAcompanhamentoLiberacao_(dataFiltro, limit),
      meta: { versao: LIBERACAO_VERSAO, recurso: recurso }
    };
  }
  if (recurso === "saida_carros") {
    return {
      ok: true,
      dados: lerSaidaCarrosLiberacao_(dataFiltro),
      meta: { versao: LIBERACAO_VERSAO, recurso: recurso }
    };
  }
  return {
    ok: true,
    graficos: lerOperacionaisLiberacao_(dataFiltro),
    meta: { versao: LIBERACAO_VERSAO, recurso: "operacionais" }
  };
}

function montarRespostaLiberacaoPost_(params) {
  const action = String(params.action || "create").toLowerCase();
  if (action === "update") return atualizarAcompanhamentoLiberacao_(params);
  return criarAcompanhamentoLiberacao_(params);
}

function abrirAbaPorGid_(spreadsheetId, gid) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  throw new Error("Aba gid " + gid + " não encontrada.");
}

function lerOperacionaisLiberacao_(dataFiltro) {
  const sheet = abrirAbaPorGid_(LIBERACAO_SPREADSHEET_ID, LIBERACAO_OPERACIONAIS_GID);
  const valores = sheet.getDataRange().getValues();
  const historico = [];
  let resumo = null;
  let orientacoes = [];

  for (let r = 0; r < valores.length; r++) {
    const row = valores[r];
    const c0 = String(row[0] || "").trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(c0)) {
      const item = {
        data: normalizarDataIsoLiberacao_(c0),
        data_br: c0,
        qt_saidas: parseNumeroLiberacao_(row[1]),
        no_horario: parseNumeroLiberacao_(row[2]),
        pct_no_horario: parsePercentualLiberacao_(row[3]),
        atrasado: parseNumeroLiberacao_(row[4]),
        pct_atrasado: parsePercentualLiberacao_(row[5]),
        adiantado: parseNumeroLiberacao_(row[6]),
        pct_adiantado: parsePercentualLiberacao_(row[7]),
        total_pct: parsePercentualLiberacao_(row[8])
      };
      historico.push(item);
      if (!dataFiltro || item.data === dataFiltro) resumo = item;
    }
    if (normalizarChaveLiberacao_(c0) === "base_de_dados") {
      orientacoes = parseOrientacoesOperacionais_(valores, r);
    }
  }

  if (!resumo && historico.length) {
    resumo = historico[historico.length - 1];
  }

  return {
    resumo: resumo,
    historico: historico,
    orientacoes: orientacoes,
    situacao_saida: resumo ? [
      { label: "No horário", total: resumo.no_horario, pct: resumo.pct_no_horario },
      { label: "Atrasado", total: resumo.atrasado, pct: resumo.pct_atrasado },
      { label: "Adiantado", total: resumo.adiantado, pct: resumo.pct_adiantado }
    ] : [],
    historico_pct_no_horario: historico.map(function (h) {
      return { label: h.data_br, total: h.pct_no_horario };
    })
  };
}

function parseOrientacoesOperacionais_(valores, baseRow) {
  const categorias = [];
  const header = valores[baseRow] || [];
  const sub = valores[baseRow + 1] || [];
  const inicioDados = baseRow + 3;
  const mapa = [];

  for (let c = 0; c < header.length; c++) {
    const titulo = String(header[c] || "").trim();
    if (!titulo) continue;
    const gravidade = String(sub[c] || "").trim().toUpperCase();
    if (gravidade === "MOTORISTA" || gravidade === "QTD.") continue;
    if (titulo.length > 8) {
      mapa.push({ col: c, categoria: titulo, gravidade: gravidade || "ORIENTAR" });
    }
  }

  mapa.forEach(function (info) {
    let total = 0;
    for (let r = inicioDados; r < valores.length; r++) {
      const mot = String(valores[r][info.col] || "").trim();
      const qtdCol = info.col + 1;
      const qtdRaw = valores[r][qtdCol];
      if (/^\d+$/.test(String(mot)) && mot.length >= 3) {
        total += parseNumeroLiberacao_(qtdRaw);
      }
    }
    if (total > 0) {
      categorias.push({
        label: info.categoria,
        gravidade: info.gravidade,
        total: total
      });
    }
  });

  return categorias.sort(function (a, b) { return b.total - a.total; }).slice(0, 12);
}

function lerAcompanhamentoLiberacao_(dataFiltro, limit) {
  const sheet = abrirAbaPorGid_(LIBERACAO_SPREADSHEET_ID, LIBERACAO_ACOMPANHAMENTO_GID);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const cabecalho = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(normalizarChaveLiberacao_);
  const valores = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const dados = [];

  for (let i = 0; i < valores.length; i++) {
    const item = linhaAcompanhamentoParaObjeto_(cabecalho, valores[i], i + 2);
    if (dataFiltro && normalizarDataIsoLiberacao_(item.data) !== dataFiltro) continue;
    dados.push(item);
  }

  dados.reverse();
  if (limit > 0 && dados.length > limit) dados.splice(limit);
  return dados;
}

function lerSaidaCarrosLiberacao_(dataFiltro) {
  const sheet = abrirAbaPorGid_(LIBERACAO_SAIDA_SPREADSHEET_ID, LIBERACAO_SAIDA_GID);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const titulos = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const cabecalho = titulos.map(normalizarChaveLiberacao_);
  const valores = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const dados = [];

  for (let i = 0; i < valores.length; i++) {
    const bruto = {};
    cabecalho.forEach(function (chave, idx) {
      if (!chave) return;
      bruto[chave] = valorCelulaLiberacao_(valores[i][idx]);
    });
    const dataBr = bruto.data || bruto.dia || bruto.data_saida || "";
    const dataIso = normalizarDataIsoLiberacao_(dataBr);
    if (dataFiltro && dataIso !== dataFiltro) continue;
    dados.push(mapearSaidaCarrosParaAcompanhamento_(bruto, dataIso, dataBr));
  }

  return dados;
}

function mapearSaidaCarrosParaAcompanhamento_(bruto, dataIso, dataBr) {
  const dataExibir = dataBr || (dataIso ? formatarDataBrLiberacao_(dataIso) : "");
  return {
    data: dataExibir,
    maquina: pickCampoLiberacao_(bruto, ["maquina", "maquina_"]),
    linha: pickCampoLiberacao_(bruto, ["linha", "linha_"]),
    work_id: pickCampoLiberacao_(bruto, ["work_id", "workid", "work", "id_servico"]),
    carro: pickCampoLiberacao_(bruto, ["carro", "prefixo", "veiculo", "frota"]),
    motorista: pickCampoLiberacao_(bruto, ["motorista", "matricula", "mot", "registro"]),
    preparo: pickCampoLiberacao_(bruto, ["preparo", "tempo_preparo"]),
    horario_saida_da_garagem: pickCampoLiberacao_(bruto, ["horario_saida_da_garagem", "horario_saida", "saida_programada", "previsto", "horario"]),
    saida_real: pickCampoLiberacao_(bruto, ["saida_real", "realizado", "saida_efetiva", "hora_real"]),
    local_inicio: pickCampoLiberacao_(bruto, ["local_inicio", "local", "terminal"]),
    horario_de_inicio: pickCampoLiberacao_(bruto, ["horario_de_inicio", "horario_inicio", "inicio_programado"]),
    inicio_real: pickCampoLiberacao_(bruto, ["inicio_real", "inicio_efetivo"]),
    observacoes: pickCampoLiberacao_(bruto, ["observacoes", "obs", "observacao"]),
    _origem: "saida_carros"
  };
}

function formatarDataBrLiberacao_(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  if (p.length !== 3) return iso;
  return p[2] + "/" + p[1] + "/" + p[0];
}

function pickCampoLiberacao_(obj, chaves) {
  for (let i = 0; i < chaves.length; i++) {
    if (obj[chaves[i]]) return obj[chaves[i]];
  }
  return "";
}

function criarAcompanhamentoLiberacao_(params) {
  const sheet = abrirAbaPorGid_(LIBERACAO_SPREADSHEET_ID, LIBERACAO_ACOMPANHAMENTO_GID);
  const cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const chaves = cabecalho.map(normalizarChaveLiberacao_);
  const linha = chaves.map(function (chave) {
    return params[chave] != null ? String(params[chave]) : "";
  });
  sheet.appendRow(linha);
  return { ok: true, linha: sheet.getLastRow(), acao: "create" };
}

function atualizarAcompanhamentoLiberacao_(params) {
  const row = parseInt(params._row || params.row || "0", 10);
  if (!row || row < 2) throw new Error("Linha inválida para atualização.");
  const sheet = abrirAbaPorGid_(LIBERACAO_SPREADSHEET_ID, LIBERACAO_ACOMPANHAMENTO_GID);
  const lastCol = sheet.getLastColumn();
  const cabecalho = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const chaves = cabecalho.map(normalizarChaveLiberacao_);
  chaves.forEach(function (chave, idx) {
    if (!chave || params[chave] == null) return;
    sheet.getRange(row, idx + 1).setValue(params[chave]);
  });
  return { ok: true, linha: row, acao: "update" };
}

function linhaAcompanhamentoParaObjeto_(cabecalho, valores, rowNumber) {
  const item = { _row: rowNumber };
  cabecalho.forEach(function (chave, idx) {
    if (!chave) return;
    item[chave] = valorCelulaLiberacao_(valores[idx]);
  });
  if (item.data) item.data_iso = normalizarDataIsoLiberacao_(item.data);
  return item;
}

function valorCelulaLiberacao_(valor) {
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

function parseNumeroLiberacao_(valor) {
  if (valor == null || valor === "") return 0;
  const texto = String(valor).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const num = Number(texto);
  return isNaN(num) ? 0 : num;
}

function parsePercentualLiberacao_(valor) {
  return parseNumeroLiberacao_(valor);
}

function normalizarChaveLiberacao_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizarDataIsoLiberacao_(valor) {
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
