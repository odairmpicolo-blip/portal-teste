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
    filas: [{ key: "reforma", label: "Oficina — Reforma", bloqueado: true }]
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
    const input = document.getElementById("inputFilaBus");
    const select = document.getElementById("selectFila");
    const prefixo = input?.value.trim();
    const filaKey = select?.value;
    if (!prefixo || !filaKey) return;

    removerVeiculoDeTudo(prefixo);
    patio.filas[filaKey].push(prefixo);
    if (ehFilaOficina(filaKey)) {
      patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
    }
    salvarUltimaFila(filaKey);
    salvarEstado();
    renderizarPatio();
    input.value = "";
    input.focus();
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

  function marcarPedidoInput() {
    const input = document.getElementById("pedidosBus");
    const prefixo = input?.value.trim();
    if (!prefixo) return;
    if (estaNaOficina(prefixo)) {
      input.value = "";
      return;
    }
    if (!patio.pedidos.includes(prefixo)) patio.pedidos.push(prefixo);
    patio.analisados = patio.analisados.filter((p) => p != prefixo);
    salvarEstado();
    renderizarPatio();
    input.value = "";
    document.getElementById("inputFilaBus")?.focus();
  }

  function enviarParaReforma() {
    const input = document.getElementById("reformaBus");
    const prefixo = input?.value.trim();
    if (!prefixo) return;
    removerVeiculoDeTudo(prefixo);
    patio.filas.reforma.push(prefixo);
    salvarEstado();
    renderizarPatio();
    input.value = "";
    document.getElementById("inputFilaBus")?.focus();
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

  function avaliarSaida(grupo, filaKey, posicao) {
    const filaCfg = FILA_MAP[filaKey];
    if (filaCfg?.bloqueado) return { tipo: "bloqueado", msg: "Veículo em reforma — saída não permitida." };
    if (filaCfg?.saidaLivre) {
      return posicao === 0
        ? { tipo: "livre", msg: "Saída livre nesta área." }
        : { tipo: "parcial", msg: `Há ${posicao} veículo(s) à frente na fila.` };
    }

    const filasGrupo = [...grupo.filas].sort((a, b) => a.ordem - b.ordem);
    const idxFila = filasGrupo.findIndex((f) => f.key === filaKey);
    let bloqueio = 0;
    for (let i = 0; i < idxFila; i++) {
      bloqueio += patio.filas[filasGrupo[i].key].length;
    }
    if (bloqueio > 0) {
      return {
        tipo: "bloqueado",
        msg: `Filas anteriores do grupo têm ${bloqueio} veículo(s). Libere antes.`
      };
    }
    if (posicao === 0) return { tipo: "livre", msg: "Pronto para saída." };
    return { tipo: "parcial", msg: `Posição ${posicao + 1} — afastar ${posicao} veículo(s) à frente.` };
  }

  function verificarAcessibilidade() {
    const input = document.getElementById("searchBus");
    const resultBox = document.getElementById("resultOutput");
    const prefixo = input?.value.trim();
    if (!prefixo) {
      resultBox.className = "result-box danger";
      resultBox.innerHTML = "Digite o prefixo do veículo.";
      return;
    }

    const loc = localizarVeiculo(prefixo);

    if (!loc) {
      const naFrota = frotaDados.some((item) => item.veiculo == prefixo);
      resultBox.className = naFrota ? "result-box success" : "result-box warning";
      resultBox.innerHTML = naFrota
        ? `🟢 <b>${prefixo}</b> (${obterTecnologia(prefixo)}) — fora do pátio / sem alocação.`
        : `⚠️ Veículo <b>${prefixo}</b> não está na frota (${frotaDados.length} cadastrados).`;
      input.value = "";
      return;
    }

    if (FILA_MAP[loc.filaKey]?.bloqueado) {
      resultBox.className = "result-box danger";
      resultBox.innerHTML = `❌ <b>BLOQUEADO:</b> ${prefixo} está em <b>${obterNomeFila(loc.filaKey)}</b>.`;
      input.value = "";
      return;
    }

    if (!ehFilaOficina(loc.filaKey) && !patio.analisados.includes(prefixo)) {
      patio.analisados.push(prefixo);
      patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
      salvarEstado();
      renderizarPatio();
    }

    const grupo = GRUPO_POR_FILA[loc.filaKey];
    const aval = avaliarSaida(grupo, loc.filaKey, loc.posicao);
    const nome = obterNomeFila(loc.filaKey);
    const classes = { livre: "success", parcial: "warning", bloqueado: "danger" };
    const icones = { livre: "🟢", parcial: "⚠️", bloqueado: "🛑" };
    resultBox.className = `result-box ${classes[aval.tipo]}`;
    resultBox.innerHTML = `${icones[aval.tipo]} <b>${prefixo}</b> em <b>${nome}</b> (#${loc.posicao + 1}). ${aval.msg}`;
    input.value = "";
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
          if (ehFilaOficina(f.key)) tag = " [OFICINA]";
          else if (patio.pedidos.includes(p)) tag = " [PEDIDO]";
          else if (patio.analisados.includes(p)) tag = " [UTILIZADO]";
          if (FILA_MAP[f.key]?.bloqueado) tag = " [BLOQUEADO]";
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
    document.getElementById("selectFila")?.addEventListener("change", (e) => {
      salvarUltimaFila(e.target.value);
    });
    document.getElementById("inputFilaBus")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") alocarNaFila();
    });
    document.getElementById("pedidosBus")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") marcarPedidoInput();
    });
    document.getElementById("reformaBus")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") enviarParaReforma();
    });

    const searchBus = document.getElementById("searchBus");
    const resultBox = document.getElementById("resultOutput");
    if (searchBus) {
      searchBus.addEventListener("input", () => {
        if (!searchBus.value.trim()) {
          resultBox.className = "result-box";
          resultBox.innerHTML = "";
        } else if (searchBus.value.trim().length >= 4) {
          verificarAcessibilidade();
        }
      });
      searchBus.addEventListener("keypress", (e) => {
        if (e.key === "Enter") verificarAcessibilidade();
      });
    }
  }

  function inicializar() {
    popularSelectFila();
    configurarInputs();
    renderizarPatio();
    document.getElementById("inputFilaBus")?.focus();
    if (window.portalLoading) window.portalLoading.hide();
  }

  window.alocarNaFila = alocarNaFila;
  window.marcarPedidoInput = marcarPedidoInput;
  window.enviarParaReforma = enviarParaReforma;
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
