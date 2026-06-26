import { ESCALA_SAIDA_API_URL } from "./escala-saida-dados-leitura.js";
import {
  avaliarSaidaVeiculo,
  carregarPatio,
  ehPedido,
  ehFilaNaoUtilizavelEscala,
  formatarPosicaoPatio,
  listarCandidatosSubstituto,
  localizarVeiculo,
  obterTecnologia,
  normalizarTecnologia
} from "./patio-core.js";

const HORA_LIMITE_IMPORTE = "07:00";
const HORA_LIMITE_RECOLHIMENTO_PEDIDO = "10:40";

const COLUNAS_PADRAO = [
  { chave: "horario_de_inicio", rotulo: "HORÁRIO DE INÍCIO" },
  { chave: "maquina", rotulo: "MÁQUINA" },
  { chave: "linha", rotulo: "LINHA" },
  { chave: "work_id", rotulo: "WORK-ID" },
  { chave: "carro_escalado", rotulo: "CARRO ESCALADO" },
  { chave: "f_carro", rotulo: "F.CARRO" },
  { chave: "carro_saida", rotulo: "CARRO SAÍDA" },
  { chave: "subst", rotulo: "SUBST" },
  { chave: "tecnologia", rotulo: "TECNOLOGIA" },
  { chave: "obs_escala", rotulo: "OBS" }
];

const CHAVES_IMPORTANTES = new Set([
  "data",
  "horario_de_inicio",
  "horario_saida_da_garagem",
  "maquina",
  "linha",
  "work_id",
  "carro",
  "carro_escalado",
  "f_carro",
  "motorista",
  "local_inicio",
  "preparo",
  "observacoes"
]);

const state = {
  data: "",
  colunas: COLUNAS_PADRAO,
  bruto: [],
  processado: [],
  carregando: false
};

const frota = window.FROTA_PATIO || [];

function hojeIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickCampo(row, chaves) {
  for (const chave of chaves) {
    const valor = row?.[chave];
    if (valor != null && String(valor).trim() !== "") return String(valor).trim();
  }
  return "";
}

function normalizarPrefixo(valor) {
  return String(valor || "").replace(/\D/g, "").trim();
}

export function horaParaMinutos(valor) {
  if (valor == null || valor === "") return null;
  if (typeof valor === "number" && isFinite(valor)) {
    const total = Math.round(valor * 24 * 60);
    return total % (24 * 60);
  }
  const texto = String(valor).trim();
  const match = texto.match(/(\d{1,2})[:h](\d{2})/);
  if (match) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  const soHora = texto.match(/^(\d{1,2})$/);
  if (soHora) return Number(soHora[1]) * 60;
  return null;
}

function dentroDoLimite(horario, limite) {
  const mins = horaParaMinutos(horario);
  const lim = horaParaMinutos(limite);
  if (mins == null || lim == null) return true;
  return mins <= lim;
}

function montarColunas(apiColunas, amostra) {
  const mapa = new Map();
  (apiColunas || []).forEach((c) => {
    if (!c?.chave) return;
    mapa.set(c.chave, { chave: c.chave, rotulo: c.rotulo || c.chave });
  });

  if (!mapa.size && amostra) {
    Object.keys(amostra).forEach((chave) => {
      if (chave.startsWith("_")) return;
      mapa.set(chave, { chave, rotulo: chave.toUpperCase().replace(/_/g, " ") });
    });
  }

  const extras = [
    { chave: "carro_saida", rotulo: "CARRO SAÍDA" },
    { chave: "subst", rotulo: "SUBST" },
    { chave: "tecnologia", rotulo: "TECNOLOGIA" },
    { chave: "obs_escala", rotulo: "OBS" },
    { chave: "_alerta", rotulo: "ALERTA" }
  ];
  extras.forEach((c) => mapa.set(c.chave, c));

  const ordem = [];
  const pushUnico = (chave) => {
    if (mapa.has(chave) && !ordem.includes(chave)) ordem.push(chave);
  };

  [
    "data",
    "horario_de_inicio",
    "horario_saida_da_garagem",
    "maquina",
    "linha",
    "work_id",
    "carro_escalado",
    "carro",
    "f_carro",
    "motorista",
    "local_inicio"
  ].forEach(pushUnico);

  [...mapa.keys()]
    .filter((k) => !ordem.includes(k) && CHAVES_IMPORTANTES.has(k))
    .sort()
    .forEach(pushUnico);

  extras.forEach((c) => pushUnico(c.chave));

  [...mapa.keys()]
    .filter((k) => !ordem.includes(k) && !k.startsWith("_"))
    .sort()
    .forEach(pushUnico);

  return ordem.map((chave) => mapa.get(chave));
}

function extrairCarroEscalado(row) {
  return normalizarPrefixo(
    pickCampo(row, ["carro_escalado", "carro", "prefixo", "veiculo"])
  );
}

function montarEscaladosReservados(linhas) {
  const reservados = new Set();
  linhas.forEach((row) => {
    const prefixo = extrairCarroEscalado(row);
    if (prefixo) reservados.add(prefixo);
  });
  return reservados;
}

function situacaoCarroEscalado(prefixo, patio, tecnologia) {
  if (!prefixo) return { tipo: "vazio" };

  const saida = avaliarSaidaVeiculo(prefixo, patio);
  const loc = localizarVeiculo(prefixo, patio);

  if (saida.ok) {
    const techCarro = obterTecnologia(prefixo, frota);
    if (tecnologia && techCarro && normalizarTecnologia(techCarro) !== normalizarTecnologia(tecnologia)) {
      return {
        tipo: "tech",
        prefixo,
        motivo: `Tecnologia divergente (${techCarro})`,
        loc: saida.loc || loc
      };
    }
    return { tipo: "ok", prefixo, loc: saida.loc };
  }

  if (loc && ehFilaNaoUtilizavelEscala(loc.filaKey)) {
    return { tipo: "nao_utilizavel", prefixo, motivo: saida.motivo, loc };
  }

  if (loc) {
    return { tipo: "aguardando", prefixo, motivo: saida.motivo, loc };
  }

  return { tipo: "ausente", prefixo, motivo: saida.motivo || "Fora do pátio" };
}

function processarLinha(row, patio, ctx) {
  const { usados, escaladosReservados } = ctx;
  const carroEscalado = extrairCarroEscalado(row);
  const fCarro = normalizarPrefixo(pickCampo(row, ["f_carro", "f_carro_", "fcarro"]));
  const horarioInicio = pickCampo(row, ["horario_de_inicio", "horario_inicio", "inicio_programado"]);
  const tecnologia = obterTecnologia(carroEscalado, frota);

  const alertas = [];
  let carroSaida = "";
  let subst = "";
  let obsEscala = pickCampo(row, ["observacoes", "obs", "observacao"]);

  if (fCarro && ehPedido(fCarro, patio) && !dentroDoLimite(horarioInicio, HORA_LIMITE_RECOLHIMENTO_PEDIDO)) {
    alertas.push(`Pedido ${fCarro}: recolhimento após ${HORA_LIMITE_RECOLHIMENTO_PEDIDO}`);
  }

  const sitEscalado = situacaoCarroEscalado(carroEscalado, patio, tecnologia);

  if (carroEscalado && !usados.has(carroEscalado)) {
    if (sitEscalado.tipo === "ok") {
      carroSaida = carroEscalado;
      obsEscala = formatarPosicaoPatio(sitEscalado.loc);
    } else if (sitEscalado.tipo === "aguardando") {
      carroSaida = carroEscalado;
      obsEscala = formatarPosicaoPatio(sitEscalado.loc);
      alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
    }
  } else if (carroEscalado && usados.has(carroEscalado)) {
    alertas.push(`Escalado ${carroEscalado} já alocado em outro serviço.`);
  }

  if (!carroSaida) {
    const excluirSubst = new Set([
      ...escaladosReservados,
      carroEscalado,
      fCarro
    ].filter(Boolean));

    const candidatos = listarCandidatosSubstituto(tecnologia, patio, frota, {
      usados,
      excluir: [...excluirSubst]
    });

    if (candidatos.length) {
      const sub = candidatos[0];
      carroSaida = sub.prefixo;
      subst = carroEscalado;
      obsEscala = formatarPosicaoPatio(sub.loc);
      if (sitEscalado.tipo !== "vazio" && sitEscalado.motivo) {
        alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
      }
    } else if (carroEscalado) {
      const loc = localizarVeiculo(carroEscalado, patio);
      obsEscala = loc ? formatarPosicaoPatio(loc) : "Fora do pátio";
      if (sitEscalado.motivo) {
        alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
      } else {
        alertas.push("Sem substituto disponível com a mesma tecnologia.");
      }
    }
  }

  if (carroSaida) usados.add(carroSaida);

  return {
    ...row,
    carro_escalado: carroEscalado || row.carro_escalado || row.carro || "",
    f_carro: fCarro || row.f_carro || "",
    carro_saida: carroSaida,
    subst,
    tecnologia,
    obs_escala: obsEscala,
    _alerta: alertas.join(" | ")
  };
}

function processarEscala(linhas) {
  const patio = carregarPatio();
  const ctx = {
    usados: new Set(),
    escaladosReservados: montarEscaladosReservados(linhas)
  };
  return linhas.map((row) => processarLinha(row, patio, ctx));
}

function filtrarAteHorario(linhas) {
  return linhas.filter((row) => {
    const hora = pickCampo(row, ["horario_de_inicio", "horario_inicio", "inicio_programado"]);
    if (!hora) return true;
    return dentroDoLimite(hora, HORA_LIMITE_IMPORTE);
  });
}

function ordenarPorInicio(linhas) {
  return [...linhas].sort((a, b) => {
    const ha = horaParaMinutos(pickCampo(a, ["horario_de_inicio"])) ?? 9999;
    const hb = horaParaMinutos(pickCampo(b, ["horario_de_inicio"])) ?? 9999;
    return ha - hb;
  });
}

function atualizarResumo() {
  const el = document.getElementById("escalaResumo");
  if (!el) return;
  const total = state.processado.length;
  const comSubst = state.processado.filter((r) => r.subst).length;
  const alertas = state.processado.filter((r) => r._alerta).length;
  el.innerHTML = `
    <span><b>${total}</b> serviços até ${HORA_LIMITE_IMPORTE}</span>
    <span><b>${comSubst}</b> com substituição</span>
    <span><b>${alertas}</b> com alerta</span>
  `;
}

function renderTabela() {
  const head = document.getElementById("escalaTabelaHead");
  const body = document.getElementById("escalaTabelaBody");
  const vazio = document.getElementById("escalaVazio");
  if (!head || !body) return;

  if (!state.processado.length) {
    head.innerHTML = "";
    body.innerHTML = "";
    if (vazio) vazio.hidden = false;
    return;
  }
  if (vazio) vazio.hidden = true;

  head.innerHTML = `<tr>${state.colunas.map((c) => `<th>${c.rotulo}</th>`).join("")}</tr>`;

  body.innerHTML = state.processado.map((row) => {
    const cls = row._alerta ? "linha-alerta" : (row.subst ? "linha-subst" : "");
    const cells = state.colunas.map((col) => {
      const valor = row[col.chave] ?? "";
      return `<td title="${String(valor).replace(/"/g, "&quot;")}">${valor || "—"}</td>`;
    }).join("");
    return `<tr class="${cls}">${cells}</tr>`;
  }).join("");
}

function setStatus(msg, tipo) {
  const el = document.getElementById("escalaStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `escala-status${tipo ? ` escala-status--${tipo}` : ""}`;
}

async function carregarPlanilha() {
  if (state.carregando) return;
  state.carregando = true;
  setStatus("Carregando planilha…", "loading");
  const btn = document.getElementById("btnImportar");
  if (btn) btn.disabled = true;

  try {
    const data = state.data || hojeIso();
    const url = `${ESCALA_SAIDA_API_URL}?recurso=saida_carros&data=${encodeURIComponent(data)}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.erro || "Falha ao carregar planilha.");

    const linhas = Array.isArray(json.dados) ? json.dados : [];
    const filtradas = ordenarPorInicio(filtrarAteHorario(linhas));
    state.bruto = filtradas;
    state.colunas = montarColunas(json.colunas, filtradas[0]);
    state.processado = processarEscala(filtradas);

    atualizarResumo();
    renderTabela();
    setStatus(
      filtradas.length
        ? `${filtradas.length} linha(s) importada(s) — início até ${HORA_LIMITE_IMPORTE}.`
        : "Nenhuma linha encontrada para esta data na planilha.",
      filtradas.length ? "ok" : "warn"
    );
  } catch (err) {
    setStatus(err.message || "Erro ao importar.", "erro");
  } finally {
    state.carregando = false;
    if (btn) btn.disabled = false;
  }
}

function reprocessarPatio() {
  if (!state.bruto.length) return;
  state.processado = processarEscala(state.bruto);
  atualizarResumo();
  renderTabela();
  setStatus("Escala reprocessada com o pátio atual.", "ok");
}

function exportarCsv() {
  if (!state.processado.length) return;
  const header = state.colunas.map((c) => c.rotulo);
  const linhas = state.processado.map((row) =>
    state.colunas.map((c) => {
      const v = String(row[c.chave] ?? "").replace(/"/g, '""');
      return `"${v}"`;
    }).join(";")
  );
  const blob = new Blob(["\uFEFF" + [header.join(";"), ...linhas].join("\n")], {
    type: "text/csv;charset=utf-8"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `escala-saida-${state.data || hojeIso()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function iniciar() {
  const inputData = document.getElementById("escalaData");
  if (inputData) {
    inputData.value = hojeIso();
    state.data = inputData.value;
    inputData.addEventListener("change", () => {
      state.data = inputData.value;
    });
  }

  document.getElementById("btnImportar")?.addEventListener("click", () => {
    if (inputData) state.data = inputData.value || hojeIso();
    carregarPlanilha();
  });

  document.getElementById("btnReprocessar")?.addEventListener("click", reprocessarPatio);
  document.getElementById("btnExportar")?.addEventListener("click", exportarCsv);

  atualizarResumo();
  renderTabela();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
