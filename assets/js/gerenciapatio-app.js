/* Gerenciamento de Pátio — filas v3 (zonas operacionais) */
(function () {
  const STORAGE_KEY = "patio_tcgl_v3";
  const FILA_PREF_KEY = "patio_ultima_fila_v1";

  const GRUPOS_PATIO = [
    {
      id: "oficina",
      titulo: "Oficina",
      filas: [
        { key: "oficina_f1", label: "Fila 1", ordem: 1 },
        { key: "oficina_f2", label: "Fila 2", ordem: 2 }
      ]
    },
    {
      id: "latavador",
      titulo: "Latavador",
      filas: [{ key: "latavador_f1", label: "Fila 1", ordem: 1, saidaLivre: true }]
    },
    {
      id: "mistos",
      titulo: "Carros mistos",
      filas: [
        { key: "mistos_f1", label: "Fila 1", ordem: 1 },
        { key: "mistos_f2", label: "Fila 2", ordem: 2 },
        { key: "mistos_f3", label: "Fila 3", ordem: 3 },
        { key: "mistos_f4", label: "Fila 4", ordem: 4 }
      ]
    },
    {
      id: "pesados",
      titulo: "Carros Pesados",
      filas: [
        { key: "pesados_f1", label: "Fila 1", ordem: 1 },
        { key: "pesados_f2", label: "Fila 2", ordem: 2 },
        { key: "pesados_f3", label: "Fila 3", ordem: 3 },
        { key: "pesados_f4", label: "Fila 4", ordem: 4 }
      ]
    },
    {
      id: "especiais",
      titulo: "Áreas especiais",
      filas: [
        { key: "muro", label: "Muro", ordem: 1, saidaLivre: true },
        { key: "bomba", label: "Bomba", ordem: 1, saidaLivre: true },
        { key: "corujao", label: "Corujão", ordem: 1, saidaLivre: true }
      ]
    }
  ];

  const GRUPO_BLOQUEADOS = {
    id: "bloqueados",
    titulo: "Carros bloqueados",
    filas: [
      { key: "bloqueados_oficina", label: "Oficina", bloqueado: true },
      { key: "reforma", label: "Reforma", bloqueado: true }
    ]
  };

  const TODAS_FILAS = [
    ...GRUPOS_PATIO.flatMap((g) => g.filas),
    ...GRUPO_BLOQUEADOS.filas
  ];

  const FILA_MAP = Object.fromEntries(TODAS_FILAS.map((f) => [f.key, f]));
  const GRUPO_POR_FILA = {};
  GRUPOS_PATIO.forEach((g) => g.filas.forEach((f) => { GRUPO_POR_FILA[f.key] = g; }));
  GRUPO_BLOQUEADOS.filas.forEach((f) => { GRUPO_POR_FILA[f.key] = GRUPO_BLOQUEADOS; });

  const FILAS_OFICINA = new Set(["oficina_f1", "oficina_f2"]);

  function ehFilaOficina(filaKey) {
    return FILAS_OFICINA.has(filaKey);
  }

  function estaNaOficina(prefixo) {
    const loc = localizarVeiculo(prefixo);
    return loc ? ehFilaOficina(loc.filaKey) : false;
  }

  function limparPedidosDaOficina() {
    const naOficina = new Set([
      ...patio.filas.oficina_f1,
      ...patio.filas.oficina_f2
    ]);
    if (!naOficina.size) return;
    patio.pedidos = patio.pedidos.filter((p) => !naOficina.has(p));
  }

  function contarPedidos() {
    limparPedidosDaOficina();
    return patio.pedidos.length;
  }

  function criarFilasVazias() {
    const filas = {};
    TODAS_FILAS.forEach((f) => { filas[f.key] = []; });
    return filas;
  }

  function migrarEstado(raw) {
    if (raw?.versao === 3 && raw.filas) {
      const filas = criarFilasVazias();
      Object.keys(filas).forEach((k) => {
        if (Array.isArray(raw.filas[k])) filas[k] = raw.filas[k];
      });
      return {
        versao: 3,
        filas,
        analisados: Array.isArray(raw.analisados) ? raw.analisados : [],
        pedidos: Array.isArray(raw.pedidos) ? raw.pedidos : (raw.rpl || [])
      };
    }
    if (raw && !raw.versao) {
      const filas = criarFilasVazias();
      filas.muro = raw.filaMuro || [];
      filas.mistos_f1 = raw.fila1 || [];
      filas.mistos_f2 = raw.fila2 || [];
      filas.mistos_f3 = raw.fila3 || [];
      filas.mistos_f4 = raw.fila4 || [];
      filas.oficina_f1 = raw.oficina || [];
      return {
        versao: 3,
        filas,
        analisados: raw.analisados || [],
        pedidos: raw.rpl || []
      };
    }
    return { versao: 3, filas: criarFilasVazias(), analisados: [], pedidos: [] };
  }

  let patio = migrarEstado(
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
    || JSON.parse(localStorage.getItem("patio_tcgl_v2") || "null")
  );

  const frotaDados = window.FROTA_PATIO || [];
  const FROTA_SET = new Set(frotaDados.map((item) => String(item.veiculo)));
  let lancamentoEmAndamento = false;
  let pedidoEmAndamento = false;

  function veiculoExisteNaFrota(prefixo) {
    return FROTA_SET.has(String(prefixo));
  }

  function mostrarErroLancamento(msg) {
    const erro = document.getElementById("lancamentoErro");
    const ok = document.getElementById("lancamentoOk");
    if (ok) ok.textContent = "";
    if (erro) erro.textContent = msg;
  }

  function mostrarOkLancamento(msg) {
    const erro = document.getElementById("lancamentoErro");
    const ok = document.getElementById("lancamentoOk");
    if (erro) erro.textContent = "";
    if (ok) ok.textContent = msg;
  }

  function limparFeedbackLancamento() {
    const erro = document.getElementById("lancamentoErro");
    const ok = document.getElementById("lancamentoOk");
    if (erro) erro.textContent = "";
    if (ok) ok.textContent = "";
  }

  function mostrarErroPedido(msg) {
    const erro = document.getElementById("pedidoErro");
    const ok = document.getElementById("pedidoOk");
    if (ok) ok.textContent = "";
    if (erro) erro.textContent = msg;
  }

  function mostrarOkPedido(msg) {
    const erro = document.getElementById("pedidoErro");
    const ok = document.getElementById("pedidoOk");
    if (erro) erro.textContent = "";
    if (ok) ok.textContent = msg;
  }

  function limparFeedbackPedido() {
    const erro = document.getElementById("pedidoErro");
    const ok = document.getElementById("pedidoOk");
    if (erro) erro.textContent = "";
    if (ok) ok.textContent = "";
  }

  function validarPedido(prefixo) {
    if (!prefixo) return { ok: false, msg: "Digite o prefixo do veículo." };
    if (!veiculoExisteNaFrota(prefixo)) {
      return { ok: false, msg: `Veículo ${prefixo} não existe na frota.` };
    }
    const loc = localizarVeiculo(prefixo);
    if (!loc) {
      return { ok: false, msg: `Veículo ${prefixo} não está no pátio. Lance-o antes de marcar como Pedido.` };
    }
    if (ehFilaOficina(loc.filaKey)) {
      return { ok: false, msg: `Veículo ${prefixo} está na Oficina (pátio) — não é Pedido.` };
    }
    if (FILA_MAP[loc.filaKey]?.bloqueado) {
      return { ok: false, msg: `Veículo ${prefixo} está bloqueado — não é Pedido.` };
    }
    if (patio.pedidos.includes(prefixo)) {
      return { ok: false, msg: `Veículo ${prefixo} já está marcado como Pedido.` };
    }
    return { ok: true, loc };
  }

  function normalizarPrefixoInput(input) {
    if (!input) return "";
    const limpo = input.value.replace(/\D/g, "");
    if (input.value !== limpo) input.value = limpo;
    return limpo;
  }

  function salvarEstado() {
    limparPedidosDaOficina();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patio));
  }

  function obterTecnologia(prefixo) {
    const veiculo = frotaDados.find((item) => item.veiculo == prefixo);
    return veiculo ? veiculo.tecnologia : "—";
  }

  function obterNomeFila(key) {
    const fila = FILA_MAP[key];
    if (!fila) return key;
    const grupo = GRUPO_POR_FILA[key];
    return grupo ? `${grupo.titulo} · ${fila.label}` : fila.label;
  }

  function localizarVeiculo(prefixo) {
    for (const [key, lista] of Object.entries(patio.filas)) {
      const idx = lista.indexOf(prefixo);
      if (idx !== -1) return { filaKey: key, posicao: idx };
    }
    return null;
  }

  function totalAlocados() {
    return Object.values(patio.filas).reduce((s, arr) => s + arr.length, 0);
  }

  function removerVeiculoDeTudo(prefixo) {
    Object.keys(patio.filas).forEach((k) => {
      patio.filas[k] = patio.filas[k].filter((p) => p != prefixo);
    });
    patio.analisados = patio.analisados.filter((p) => p != prefixo);
    patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
  }

  function popularDatalist() {
    const datalist = document.getElementById("frotaList");
    if (!datalist) return;
    datalist.innerHTML = "";
    frotaDados.forEach((item) => {
      if (patio.analisados.includes(item.veiculo)) return;
      const option = document.createElement("option");
      option.value = item.veiculo;
      option.textContent = item.tecnologia;
      datalist.appendChild(option);
    });
  }

  function lerUltimaFila() {
    const saved = localStorage.getItem(FILA_PREF_KEY);
    return FILA_MAP[saved] ? saved : TODAS_FILAS[0].key;
  }

  function salvarUltimaFila(key) {
    if (!FILA_MAP[key]) return;
    localStorage.setItem(FILA_PREF_KEY, key);
  }

  function definirFilaSelecionada(key) {
    const select = document.getElementById("selectFila");
    if (!select || !FILA_MAP[key]) return;
    select.value = key;
    salvarUltimaFila(key);
  }

  function popularSelectFila() {
    const select = document.getElementById("selectFila");
    if (!select) return;
    const preferida = select.value && FILA_MAP[select.value] ? select.value : lerUltimaFila();
    select.innerHTML = "";

    const addGroup = (label, filas) => {
      const og = document.createElement("optgroup");
      og.label = label;
      filas.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.key;
        opt.textContent = `${f.label} (${patio.filas[f.key].length})`;
        og.appendChild(opt);
      });
      select.appendChild(og);
    };

    GRUPOS_PATIO.forEach((g) => addGroup(g.titulo, g.filas));
    addGroup(GRUPO_BLOQUEADOS.titulo, GRUPO_BLOQUEADOS.filas);

    select.value = FILA_MAP[preferida] ? preferida : TODAS_FILAS[0].key;
    salvarUltimaFila(select.value);
  }

  function atualizarResumo() {
    const el = document.getElementById("patioResumo");
    if (!el) return;
    const alocados = totalAlocados();
    const fora = frotaDados.length - alocados;
    el.innerHTML = `
      <span><b>${frotaDados.length}</b> na frota</span>
      <span><b>${alocados}</b> no pátio</span>
      <span><b>${fora}</b> sem alocação</span>
      <span><b>${contarPedidos()}</b> pedidos</span>
      <span><b>${patio.analisados.length}</b> utilizados</span>
    `;
  }

  function criarCardCarro(prefixo, index, filaKey) {
    const tech = obterTecnologia(prefixo);
    const filaCfg = FILA_MAP[filaKey] || {};
    const card = document.createElement("div");
    let statusClass = "";
    let texto = prefixo;

    if (ehFilaOficina(filaKey)) {
      statusClass = "oficina-status";
    } else if (filaCfg.bloqueado) {
      statusClass = "bloqueado-status";
    } else if (patio.analisados.includes(prefixo)) {
      statusClass = "analisado";
    } else if (patio.pedidos.includes(prefixo)) {
      statusClass = "pedidos-status";
      texto = `${prefixo} · Pedido`;
    }

    const btnPedido = ehFilaOficina(filaKey) || filaCfg.bloqueado
      ? ""
      : `<button type="button" class="btn-pedido" title="Marcar/desmarcar Pedido" data-prefixo="${prefixo}">P</button>`;

    card.className = `car-tag ${statusClass}`;
    card.innerHTML = `
      <div class="car-tag-main">
        <span class="car-pos">#${index + 1}</span>
        <span class="car-prefixo">${texto}</span>
      </div>
      <div class="car-tag-actions">
        <span class="tech" title="${tech}">${tech}</span>
        ${btnPedido}
        <button type="button" class="remove-btn" title="Remover" data-prefixo="${prefixo}">×</button>
      </div>
    `;
    return card;
  }

  function renderizarMapa() {
    const mapa = document.getElementById("patioMap");
    if (!mapa) return;
    mapa.innerHTML = "";

    const renderGrupo = (grupo, extraClass) => {
      const section = document.createElement("section");
      section.className = `patio-zona ${extraClass || ""}`;
      section.innerHTML = `<h3 class="patio-zona-titulo">${grupo.titulo}</h3>`;
      const row = document.createElement("div");
      row.className = "patio-filas-row";

      grupo.filas.forEach((filaCfg) => {
        const col = document.createElement("div");
        col.className = "fila-col";
        const qtd = patio.filas[filaCfg.key].length;
        const livre = filaCfg.saidaLivre ? " saida-livre" : "";
        const bloq = filaCfg.bloqueado ? " bloqueado-lane" : "";
        col.innerHTML = `
          <button type="button" class="fila-header fila-select-btn${livre}${bloq}" data-fila="${filaCfg.key}">
            ${filaCfg.label}<small>${qtd} carro${qtd !== 1 ? "s" : ""}</small>
          </button>
          <div class="fila-body" id="fila_${filaCfg.key}"></div>
        `;
        row.appendChild(col);
      });

      section.appendChild(row);
      mapa.appendChild(section);
    };

    GRUPOS_PATIO.forEach((g) => renderGrupo(g));
    renderGrupo(GRUPO_BLOQUEADOS, "zona-bloqueados");

    TODAS_FILAS.forEach((f) => {
      const container = document.getElementById(`fila_${f.key}`);
      if (!container) return;
      patio.filas[f.key].forEach((prefixo, i) => {
        container.appendChild(criarCardCarro(prefixo, i, f.key));
      });
    });

    mapa.querySelectorAll(".fila-select-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        definirFilaSelecionada(btn.dataset.fila);
        document.getElementById("inputFilaBus")?.focus();
      });
    });

    mapa.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => liberarCarro(btn.dataset.prefixo));
    });

    mapa.querySelectorAll(".btn-pedido").forEach((btn) => {
      btn.addEventListener("click", () => togglePedido(btn.dataset.prefixo));
    });
  }

  function renderizarPatio() {
    renderizarMapa();
    popularSelectFila();
    popularDatalist();
    atualizarResumo();
  }

  function alocarNaFila() {
    if (lancamentoEmAndamento) return;
    const input = document.getElementById("inputFilaBus");
    const select = document.getElementById("selectFila");
    const prefixo = normalizarPrefixoInput(input);
    const filaKey = select?.value;

    limparFeedbackLancamento();

    if (!prefixo) {
      mostrarErroLancamento("Digite o prefixo do veículo.");
      input?.focus();
      return;
    }
    if (!veiculoExisteNaFrota(prefixo)) {
      mostrarErroLancamento(`Veículo ${prefixo} não existe na frota.`);
      input?.select();
      return;
    }
    const loc = localizarVeiculo(prefixo);
    if (loc) {
      mostrarErroLancamento(`Veículo ${prefixo} já está em ${obterNomeFila(loc.filaKey)}. Remova antes de lançar de novo.`);
      input?.select();
      return;
    }
    if (!filaKey) {
      mostrarErroLancamento("Selecione a fila de destino.");
      return;
    }

    lancamentoEmAndamento = true;
    try {
      patio.filas[filaKey].push(prefixo);
      if (ehFilaOficina(filaKey) || FILA_MAP[filaKey]?.bloqueado) {
        patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
      }
      salvarUltimaFila(filaKey);
      salvarEstado();
      renderizarPatio();
      mostrarOkLancamento(`✓ ${prefixo} lançado em ${obterNomeFila(filaKey)}.`);
      if (input) {
        input.value = "";
        input.focus();
      }
    } finally {
      lancamentoEmAndamento = false;
    }
  }

  function togglePedido(prefixo) {
    if (!prefixo || estaNaOficina(prefixo)) return;
    if (patio.pedidos.includes(prefixo)) {
      patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
    } else {
      patio.pedidos.push(prefixo);
      patio.analisados = patio.analisados.filter((p) => p != prefixo);
    }
    salvarEstado();
    renderizarPatio();
  }

  function marcarPedido() {
    if (pedidoEmAndamento) return;
    const input = document.getElementById("pedidosBus");
    const prefixo = normalizarPrefixoInput(input);
    limparFeedbackPedido();

    const val = validarPedido(prefixo);
    if (!val.ok) {
      mostrarErroPedido(val.msg);
      input?.select();
      return;
    }

    pedidoEmAndamento = true;
    try {
      patio.pedidos.push(prefixo);
      patio.analisados = patio.analisados.filter((p) => p != prefixo);
      salvarEstado();
      renderizarPatio();
      mostrarOkPedido(`✓ ${prefixo} marcado como Pedido.`);
      if (input) {
        input.value = "";
        input.focus();
      }
    } finally {
      pedidoEmAndamento = false;
    }
  }

  function configurarAtalhosLancamento() {
    document.querySelectorAll("[data-atalho-fila]").forEach((btn) => {
      btn.addEventListener("click", () => {
        definirFilaSelecionada(btn.dataset.atalhoFila);
        limparFeedbackLancamento();
        document.getElementById("inputFilaBus")?.focus();
      });
    });
  }

  function liberarCarro(prefixo) {
    removerVeiculoDeTudo(prefixo);
    salvarEstado();
    renderizarPatio();
  }

  function limparTudo() {
    if (!confirm("Redefinir todo o pátio, pedidos e histórico de utilizados?")) return;
    patio = { versao: 3, filas: criarFilasVazias(), analisados: [], pedidos: [] };
    salvarEstado();
    renderizarPatio();
    const resultBox = document.getElementById("resultOutput");
    if (resultBox) {
      resultBox.className = "result-box";
      resultBox.innerHTML = "";
    }
    document.getElementById("inputFilaBus")?.focus();
  }

  function consultarFila() {
    const input = document.getElementById("searchBus");
    const resultBox = document.getElementById("resultOutput");
    const prefixo = normalizarPrefixoInput(input);

    if (!prefixo) {
      resultBox.className = "result-box";
      resultBox.innerHTML = "";
      return;
    }

    if (!veiculoExisteNaFrota(prefixo)) {
      resultBox.className = "result-box warning";
      resultBox.innerHTML = `Veículo <b>${prefixo}</b> não está na frota.`;
      input?.select();
      return;
    }

    const loc = localizarVeiculo(prefixo);
    if (!loc) {
      resultBox.className = "result-box";
      resultBox.innerHTML = `<b>${prefixo}</b> — sem alocação no pátio.`;
      input.value = "";
      return;
    }

    const nome = obterNomeFila(loc.filaKey);
    const tags = [];
    if (patio.pedidos.includes(prefixo)) tags.push("Pedido");
    if (ehFilaOficina(loc.filaKey)) tags.push("Oficina (pátio)");
    if (FILA_MAP[loc.filaKey]?.bloqueado) tags.push("Bloqueado");
    const tagsTxt = tags.length ? ` <span style="opacity:.85">(${tags.join(" · ")})</span>` : "";

    resultBox.className = "result-box success";
    resultBox.innerHTML = `<b>${prefixo}</b> está em <b>${nome}</b>, posição <b>#${loc.posicao + 1}</b>.${tagsTxt}`;
    input.value = "";
    input.focus();
  }

  function exportarExcel() {
    const headers = TODAS_FILAS.map((f) => obterNomeFila(f.key).toUpperCase());
    const maxLinhas = Math.max(...TODAS_FILAS.map((f) => patio.filas[f.key].length), 0);
    const dadosExcel = [
      ["GERENCIAMENTO DO PÁTIO — CIOP / TCGL"],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      ["Frota", frotaDados.length],
      [],
      headers
    ];

    for (let i = 0; i < maxLinhas; i++) {
      dadosExcel.push(
        TODAS_FILAS.map((f) => {
          const p = patio.filas[f.key][i];
          if (!p) return "";
          let tag = "";
          if (ehFilaOficina(f.key)) tag = " [OFICINA PÁTIO]";
          else if (FILA_MAP[f.key]?.bloqueado) tag = ` [BLOQUEADO — ${f.label.toUpperCase()}]`;
          else if (patio.pedidos.includes(p)) tag = " [PEDIDO]";
          else if (patio.analisados.includes(p)) tag = " [UTILIZADO]";
          return `${p} — ${obterTecnologia(p)}${tag}`;
        })
      );
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dadosExcel);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, "Patio");
    XLSX.writeFile(wb, "Gabarito_Patio_CIOP_TCGL.xlsx");
  }

  function configurarInputs() {
    const inputFila = document.getElementById("inputFilaBus");

    document.getElementById("selectFila")?.addEventListener("change", (e) => {
      salvarUltimaFila(e.target.value);
      limparFeedbackLancamento();
    });

    inputFila?.addEventListener("input", () => {
      normalizarPrefixoInput(inputFila);
      limparFeedbackLancamento();
    });

    inputFila?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      alocarNaFila();
    });
    const inputPedido = document.getElementById("pedidosBus");
    inputPedido?.addEventListener("input", () => {
      normalizarPrefixoInput(inputPedido);
      limparFeedbackPedido();
    });
    inputPedido?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      marcarPedido();
    });

    const searchBus = document.getElementById("searchBus");
    const resultBox = document.getElementById("resultOutput");
    if (searchBus) {
      searchBus.addEventListener("input", () => {
        normalizarPrefixoInput(searchBus);
        if (!searchBus.value.trim()) {
          resultBox.className = "result-box";
          resultBox.innerHTML = "";
        }
      });
      searchBus.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        consultarFila();
      });
    }
  }

  function inicializar() {
    popularSelectFila();
    configurarInputs();
    configurarAtalhosLancamento();
    renderizarPatio();
    document.getElementById("inputFilaBus")?.focus();
    if (window.portalLoading) window.portalLoading.hide();
  }

  window.alocarNaFila = alocarNaFila;
  window.marcarPedido = marcarPedido;
  window.liberarCarro = liberarCarro;
  window.limparTudo = limparTudo;
  window.exportarExcel = exportarExcel;
  window.togglePedido = togglePedido;

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof window.portalAguardarUsuario === "function") {
      window.portalAguardarUsuario(inicializar);
    } else {
      inicializar();
    }
  });
})();
