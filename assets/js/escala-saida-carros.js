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
const HORA_LIMITE_RECOLHIMENTO_SUPER_BUS = "15:00";
const LINHAS_SUPER_BUS = new Set(["800", "801", "802", "803", "806", "913"]);

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
  carregando: false,
  aceites: new Set()
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

function normalizarLinhaServico(row) {
  const bruto = pickCampo(row, ["linha", "linha_"]);
  const match = bruto.match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function ehSuperBus(tecnologia) {
  const t = normalizarTecnologia(tecnologia);
  return t.includes("super bus") || t.includes("superbus");
}

function ehSuperBusPorPrefixo(prefixo, frotaRef) {
  return ehSuperBus(obterTecnologia(prefixo, frotaRef));
}

function validarSuperBusLinha(prefixo, linhaNorm, frotaRef) {
  const tech = obterTecnologia(prefixo, frotaRef);
  if (!ehSuperBus(tech)) return { ok: true };
  if (!linhaNorm) {
    return { ok: false, motivo: "SUPER BUS exige linha definida (800–806, 913)" };
  }
  if (!LINHAS_SUPER_BUS.has(linhaNorm)) {
    return {
      ok: false,
      motivo: `SUPER BUS só nas linhas 800, 801, 802, 803, 806 e 913 (linha ${linhaNorm})`
    };
  }
  return { ok: true };
}

function chaveServico(row, carroEscalado) {
  return [
    pickCampo(row, ["work_id", "work-id"]),
    pickCampo(row, ["horario_de_inicio", "horario_inicio"]),
    carroEscalado
  ].join("|");
}

function escHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
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

function situacaoCarroEscalado(prefixo, patio) {
  if (!prefixo) return { tipo: "vazio" };

  const saida = avaliarSaidaVeiculo(prefixo, patio);
  const loc = localizarVeiculo(prefixo, patio);

  if (saida.ok) {
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

function aplicarAlertasSuperBus(prefixos, horarioInicio, alertas, flags) {
  const vistos = new Set();
  prefixos.forEach((prefixo) => {
    const alvo = String(prefixo || "").trim();
    if (!alvo || vistos.has(alvo) || !ehSuperBusPorPrefixo(alvo, frota)) return;
    vistos.add(alvo);
    flags.temSuperBus = true;
    alertas.push(`SUPER BUS ${alvo}: recolher até ${HORA_LIMITE_RECOLHIMENTO_SUPER_BUS}`);
    if (horarioInicio && !dentroDoLimite(horarioInicio, HORA_LIMITE_RECOLHIMENTO_SUPER_BUS)) {
      alertas.push(
        `SUPER BUS ${alvo}: serviço/recolhimento após ${HORA_LIMITE_RECOLHIMENTO_SUPER_BUS}`
      );
    }
  });
}

function aplicarAlertasCarroSaida(carroSaida, alertas, flags, linhaNorm) {
  if (!carroSaida) return;

  const vSuper = validarSuperBusLinha(carroSaida, linhaNorm, frota);
  if (!vSuper.ok) {
    alertas.push(vSuper.motivo);
    flags.superBusAlerta = true;
    flags.aceitePendente = true;
  }
}

function buscarSubstituto(row, patio, ctx, tecnologia, carroEscalado, linhaNorm) {
  const { usados, escaladosReservados } = ctx;
  const excluirSubst = new Set([
    ...escaladosReservados,
    carroEscalado,
    normalizarPrefixo(pickCampo(row, ["f_carro", "f_carro_", "fcarro"]))
  ].filter(Boolean));

  const opcoesBase = {
    usados,
    excluir: [...excluirSubst],
    filtroCarro: (prefixo) => validarSuperBusLinha(prefixo, linhaNorm, frota).ok
  };

  let candidatos = listarCandidatosSubstituto(tecnologia, patio, frota, opcoesBase);
  if (candidatos.length) {
    return { candidato: candidatos[0], mudancaTecnologia: false };
  }

  candidatos = listarCandidatosSubstituto(tecnologia, patio, frota, {
    ...opcoesBase,
    incluirOutrasTecnologias: true
  }).filter((c) => !c.mesmaTecnologia);

  if (candidatos.length) {
    return { candidato: candidatos[0], mudancaTecnologia: true };
  }

  return null;
}

function processarLinha(row, patio, ctx) {
  const { usados } = ctx;
  const carroEscalado = extrairCarroEscalado(row);
  const fCarro = normalizarPrefixo(pickCampo(row, ["f_carro", "f_carro_", "fcarro"]));
  const horarioInicio = pickCampo(row, ["horario_de_inicio", "horario_inicio", "inicio_programado"]);
  const linhaNorm = normalizarLinhaServico(row);
  const tecnologia = obterTecnologia(carroEscalado, frota);
  const chave = chaveServico(row, carroEscalado);

  const alertas = [];
  const flags = {
    mudancaTecnologia: false,
    superBusAlerta: false,
    aceitePendente: false,
    temSuperBus: false
  };
  let carroSaida = "";
  let subst = "";
  let obsEscala = pickCampo(row, ["observacoes", "obs", "observacao"]);
  let tecnologiaExibicao = tecnologia;

  if (fCarro && ehPedido(fCarro, patio) && !dentroDoLimite(horarioInicio, HORA_LIMITE_RECOLHIMENTO_PEDIDO)) {
    alertas.push(`Pedido ${fCarro}: recolhimento após ${HORA_LIMITE_RECOLHIMENTO_PEDIDO}`);
  }

  const temPedido = Boolean(fCarro);

  const sitEscalado = situacaoCarroEscalado(carroEscalado, patio);

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
    const resultado = buscarSubstituto(row, patio, ctx, tecnologia, carroEscalado, linhaNorm);

    if (resultado) {
      const sub = resultado.candidato;
      carroSaida = sub.prefixo;
      subst = carroEscalado;
      obsEscala = formatarPosicaoPatio(sub.loc);
      if (resultado.mudancaTecnologia) {
        const techSaida = obterTecnologia(carroSaida, frota);
        flags.mudancaTecnologia = true;
        flags.aceitePendente = true;
        tecnologiaExibicao = tecnologia && techSaida ? `${tecnologia} → ${techSaida}` : (techSaida || tecnologia);
        alertas.push(`Tecnologia alternativa — aceitar substituto ${carroSaida}`);
      }
      if (sitEscalado.tipo !== "vazio" && sitEscalado.motivo) {
        alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
      }
    } else if (carroEscalado) {
      const loc = localizarVeiculo(carroEscalado, patio);
      obsEscala = loc ? formatarPosicaoPatio(loc) : "Fora do pátio";
      if (sitEscalado.motivo) {
        alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
      } else {
        alertas.push("Sem substituto disponível (mesma tecnologia ou alternativa).");
      }
    }
  }

  if (carroSaida) {
    aplicarAlertasCarroSaida(carroSaida, alertas, flags, linhaNorm);
    usados.add(carroSaida);
  }

  aplicarAlertasSuperBus([carroSaida, fCarro], horarioInicio, alertas, flags);

  return {
    ...row,
    carro_escalado: carroEscalado || row.carro_escalado || row.carro || "",
    f_carro: fCarro || row.f_carro || "",
    carro_saida: carroSaida,
    subst,
    tecnologia: tecnologiaExibicao,
    obs_escala: obsEscala,
    _alerta: alertas.join(" | "),
    _chave_servico: chave,
    _mudanca_tecnologia: flags.mudancaTecnologia,
    _super_bus_alerta: flags.superBusAlerta,
    _aceite_pendente: flags.aceitePendente,
    _tem_pedido: temPedido,
    _tem_super_bus: flags.temSuperBus
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

function classesLinha(row) {
  const aceito = state.aceites.has(row._chave_servico);
  const classes = [];

  if (row._tem_pedido) classes.push("linha-pedido");

  if (row._aceite_pendente && !aceito) {
    classes.push("linha-aceite-pendente");
  } else if (row._aceite_pendente && aceito) {
    classes.push("linha-aceita");
  } else if (row._mudanca_tecnologia) {
    classes.push("linha-tech-alternativa");
  } else if (row.subst) {
    classes.push("linha-subst");
  } else if (row._alerta) {
    classes.push("linha-alerta");
  }

  return classes.join(" ");
}

function renderCelulaAlerta(row) {
  const alerta = row._alerta || "";
  const chave = row._chave_servico;
  const pendente = row._aceite_pendente && !state.aceites.has(chave);
  let html = alerta ? escHtml(alerta) : "—";

  if (pendente) {
    html += ` <button type="button" class="btn-aceitar" data-chave="${escHtml(chave)}">Aceitar</button>`;
  } else if (row._aceite_pendente && state.aceites.has(chave)) {
    html += ` <span class="aceite-ok">Aceito</span>`;
  }

  return html;
}

function atualizarResumo() {
  const el = document.getElementById("escalaResumo");
  if (!el) return;
  const total = state.processado.length;
  const comSubst = state.processado.filter((r) => r.subst).length;
  const pedidos = state.processado.filter((r) => r._tem_pedido).length;
  const alertas = state.processado.filter((r) => r._alerta).length;
  const aceitesPendentes = state.processado.filter(
    (r) => r._aceite_pendente && !state.aceites.has(r._chave_servico)
  ).length;
  el.innerHTML = `
    <span><b>${total}</b> serviços até ${HORA_LIMITE_IMPORTE}</span>
    <span><b>${pedidos}</b> pedidos</span>
    <span><b>${comSubst}</b> com substituição</span>
    <span><b>${alertas}</b> com alerta</span>
    <span><b>${aceitesPendentes}</b> aguardando aceite</span>
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
    const cls = classesLinha(row);
    const cells = state.colunas.map((col) => {
      if (col.chave === "_alerta") {
        return `<td class="col-alerta">${renderCelulaAlerta(row)}</td>`;
      }
      const valor = row[col.chave] ?? "";
      const extraCls = row._tem_pedido && col.chave === "f_carro" && valor ? " celula-pedido" : "";
      return `<td class="${extraCls.trim()}" title="${escHtml(valor)}">${valor || "—"}</td>`;
    }).join("");
    return `<tr class="${cls}">${cells}</tr>`;
  }).join("");
}

function setStatus(msg, tipo) {
  const el = document.getElementById("escalaStatus");
  if (!el) return;
  el.textContent = msg || "";
  el.className = `status-pill escala-status${tipo ? ` escala-status--${tipo}` : ""}`;
}

function planilhaPareceSemCabecalho(colunas) {
  const lista = colunas || [];
  return lista.length <= 1 && lista.some((c) => {
    const t = `${c.chave || ""} ${c.rotulo || ""}`.toLowerCase();
    return t.includes("saida_de_carros") || t.includes("saída de carros") || t.includes("saida de carros");
  });
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
    state.aceites = new Set();
    state.processado = processarEscala(filtradas);

    atualizarResumo();
    renderTabela();
    if (filtradas.length) {
      setStatus(`${filtradas.length} linha(s) importada(s) — início até ${HORA_LIMITE_IMPORTE}.`, "ok");
    } else if (planilhaPareceSemCabecalho(json.colunas)) {
      setStatus(
        "Nenhuma linha importada. A planilha tem título na 1ª linha — reimplante o Apps Script escala-saida-carros.gs (versão v2).",
        "warn"
      );
    } else {
      setStatus("Nenhuma linha encontrada para esta data na planilha.", "warn");
    }
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

  document.getElementById("escalaTabelaBody")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-aceitar");
    if (!btn?.dataset.chave) return;
    state.aceites.add(btn.dataset.chave);
    atualizarResumo();
    renderTabela();
  });

  atualizarResumo();
  renderTabela();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
