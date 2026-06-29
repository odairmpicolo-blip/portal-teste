/**
 * Painel de escalação automática integrado ao Gerenciamento do Pátio.
 * Recalcula a escala ao lançar/mover carros no pátio.
 */
import { carregarEscalaSaidaPlanilha } from "./escala-saida-dados-leitura.js";
import {
  processarEscala,
  filtrarHorarioInicio,
  ordenarPorInicio,
  resumirEscala,
  HORA_INICIO_MIN,
  HORA_INICIO_MAX
} from "./escala-saida-carros.js";

const hubState = {
  data: "",
  resultados: [],
  carregando: false,
  debounce: null
};

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esc(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function pickInicio(row) {
  return row.inicio || row.horario_de_inicio || row.horario_inicio || "";
}

function setHubStatus(msg, tipo = "") {
  const el = document.getElementById("hubEscalaStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = `hub-status${tipo ? ` hub-status--${tipo}` : ""}`;
}

function renderStats(resumo) {
  const el = document.getElementById("hubEscalaStats");
  if (!el) return;
  el.innerHTML = `
    <div class="hub-stat"><span class="hub-stat-val">${resumo.total}</span><span class="hub-stat-lbl">Serviços</span></div>
    <div class="hub-stat"><span class="hub-stat-val">${resumo.comSubst}</span><span class="hub-stat-lbl">Subst.</span></div>
    <div class="hub-stat"><span class="hub-stat-val">${resumo.pedidos}</span><span class="hub-stat-lbl">Pedidos</span></div>
    <div class="hub-stat hub-stat--warn"><span class="hub-stat-val">${resumo.aceitesPendentes}</span><span class="hub-stat-lbl">Aceites</span></div>
  `;
}

function renderTimeline(resultados) {
  const el = document.getElementById("hubEscalaTimeline");
  if (!el) return;

  if (!resultados.length) {
    el.innerHTML = `<p class="hub-empty">Importe a planilha do dia para ver a escalação automática.</p>`;
    return;
  }

  el.innerHTML = resultados.map((row, idx) => {
    const inicio = pickInicio(row) || "—";
    const linha = row.linha || "—";
    const escalado = row.carro_escalado || row.carro || "—";
    const saida = row.carro_saida || "—";
    const subst = row.subst || "";
    const cls = [
      "hub-timeline-item",
      row._tem_substituicao ? "hub-timeline-item--subst" : "",
      row._aceite_pendente ? "hub-timeline-item--aceite" : "",
      row._tem_pedido ? "hub-timeline-item--pedido" : "",
      idx === 0 ? "hub-timeline-item--next" : ""
    ].filter(Boolean).join(" ");

    const troca = row._tem_substituicao
      ? `<span class="hub-timeline-subst">${esc(escalado)} → <b>${esc(saida)}</b></span>`
      : `<span class="hub-timeline-saida"><b>${esc(saida)}</b></span>`;

    const alerta = row._alerta
      ? `<p class="hub-timeline-alerta">${esc(row._alerta.split(" | ")[0])}</p>`
      : "";

    return `
      <article class="${cls}">
        <div class="hub-timeline-time">${esc(inicio)}</div>
        <div class="hub-timeline-body">
          <div class="hub-timeline-head">
            <span class="hub-timeline-linha">L${esc(linha)}</span>
            ${troca}
            ${subst && subst !== saida ? `<span class="hub-timeline-badge">SUBST ${esc(subst)}</span>` : ""}
          </div>
          ${alerta}
        </div>
      </article>
    `;
  }).join("");
}

function aplicarHighlights() {
  document.querySelectorAll(".garagem-slot[data-prefixo]").forEach((slot) => {
    slot.classList.remove("hub-slot-proxima", "hub-slot-subst", "hub-slot-fila");
  });

  const proximas = new Set();
  const substitutos = new Set();
  const escalados = new Set();

  hubState.resultados.slice(0, 12).forEach((row, idx) => {
    if (row.carro_saida) proximas.add(String(row.carro_saida));
    if (row._tem_substituicao) {
      substitutos.add(String(row.carro_saida));
      if (row.carro_escalado) escalados.add(String(row.carro_escalado));
    }
    if (idx === 0 && row.carro_saida) proximas.add(String(row.carro_saida));
  });

  document.querySelectorAll(".garagem-slot[data-prefixo]").forEach((slot) => {
    const p = slot.dataset.prefixo;
    if (substitutos.has(p)) slot.classList.add("hub-slot-subst");
    else if (proximas.has(p)) slot.classList.add("hub-slot-proxima");
    else if (escalados.has(p)) slot.classList.add("hub-slot-fila");
  });
}

async function rodarEscalaAutomatica() {
  if (hubState.carregando) return;
  const inputData = document.getElementById("hubEscalaData");
  const data = inputData?.value || hubState.data || hojeIso();
  hubState.data = data;
  if (inputData) inputData.value = data;

  hubState.carregando = true;
  setHubStatus("Calculando escalação…", "loading");

  try {
    const { json, origem, aviso } = await carregarEscalaSaidaPlanilha(data);
    const linhas = ordenarPorInicio(filtrarHorarioInicio(Array.isArray(json.dados) ? json.dados : []));
    hubState.resultados = processarEscala(linhas);
    const resumo = resumirEscala(hubState.resultados);

    renderStats(resumo);
    renderTimeline(hubState.resultados);
    aplicarHighlights();

    const origemLabel = origem === "json" ? "cache" : origem === "liberacao" ? "liberação" : "API";
    if (linhas.length) {
      setHubStatus(
        `${linhas.length} serviços · ${HORA_INICIO_MIN}–${HORA_INICIO_MAX} · ${origemLabel}${aviso ? ` — ${aviso}` : ""}`,
        aviso ? "warn" : "ok"
      );
    } else {
      setHubStatus(aviso || `Sem serviços para ${data}.`, "warn");
    }
  } catch (err) {
    setHubStatus(err.message || "Erro na escalação.", "erro");
    hubState.resultados = [];
    renderTimeline([]);
    renderStats({ total: 0, comSubst: 0, pedidos: 0, aceitesPendentes: 0, proxima: null });
  } finally {
    hubState.carregando = false;
  }
}

function agendarEscala() {
  clearTimeout(hubState.debounce);
  hubState.debounce = setTimeout(rodarEscalaAutomatica, 350);
}

function montarPainel() {
  const host = document.getElementById("hubEscalaPanel");
  if (!host || host.dataset.montado) return;
  host.dataset.montado = "1";
  host.innerHTML = `
    <div class="hub-escala-inner">
      <header class="hub-escala-head">
        <div>
          <h2 class="hub-escala-title">Escalação automática</h2>
          <p class="hub-escala-sub">Atualiza ao lançar no pátio · simulação 1 a 1</p>
        </div>
        <span class="hub-live-dot" title="Ao vivo"></span>
      </header>
      <div class="hub-escala-toolbar">
        <label class="hub-field">
          <span>Data</span>
          <input type="date" id="hubEscalaData" class="hub-input">
        </label>
        <button type="button" id="hubBtnRecalcular" class="hub-btn">Recalcular</button>
        <a href="escala-saida-carros.html" class="hub-btn hub-btn--ghost">Detalhes</a>
      </div>
      <div id="hubEscalaStatus" class="hub-status"></div>
      <div id="hubEscalaStats" class="hub-stats"></div>
      <div id="hubEscalaTimeline" class="hub-timeline"></div>
    </div>
  `;

  const inputData = document.getElementById("hubEscalaData");
  if (inputData) {
    inputData.value = hojeIso();
    inputData.addEventListener("change", () => {
      hubState.data = inputData.value;
      rodarEscalaAutomatica();
    });
  }
  document.getElementById("hubBtnRecalcular")?.addEventListener("click", rodarEscalaAutomatica);
}

function iniciarHub() {
  montarPainel();
  window.PatioHub = { aplicarHighlights, rodarEscala: rodarEscalaAutomatica, getResultados: () => hubState.resultados };
  document.addEventListener("patio:changed", agendarEscala);
  rodarEscalaAutomatica();
}

if (document.getElementById("hubEscalaPanel")) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarHub);
  } else {
    iniciarHub();
  }
}
