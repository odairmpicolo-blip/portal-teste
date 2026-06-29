/* Gerenciamento de Pátio — filas v3 (zonas operacionais) */
(function () {
  const STORAGE_KEY = "patio_tcgl_v3";
  const FILA_PREF_KEY = "patio_ultima_fila_v1";

  const HORA_MINIMA_CORUJAO = "06:00";

  const GRUPOS_PATIO = [
    {
      id: "oficina",
      titulo: "Oficina",
      filas: [
        { key: "oficina_f1", label: "Fila 1", ordem: 1, saidaLivre: true },
        { key: "oficina_f2", label: "Fila 2", ordem: 2 }
      ]
    },
    {
      id: "latavador",
      titulo: "Lavador",
      filas: [{ key: "latavador_f1", label: "Fila 1", ordem: 1, saidaLivre: true }]
    },
    {
      id: "mistos",
      titulo: "Carros mistos",
      filas: [
        { key: "mistos_f1", label: "Fila 1", ordem: 1, saidaLivre: true },
        { key: "mistos_f2", label: "Fila 2", ordem: 2 },
        { key: "mistos_f3", label: "Fila 3", ordem: 3 },
        { key: "mistos_f4", label: "Fila 4", ordem: 4 }
      ]
    },
    {
      id: "pesados",
      titulo: "Carros Pesados",
      filas: [
        { key: "pesados_f1", label: "Fila 1", ordem: 1, saidaLivre: true },
        { key: "pesados_f2", label: "Fila 2", ordem: 2 },
        { key: "pesados_f3", label: "Fila 3", ordem: 3 },
        { key: "pesados_f4", label: "Fila 4", ordem: 4 }
      ]
    },
    {
      id: "corredor",
      titulo: "Corredor",
      filas: [
        { key: "corredor_c1", label: "Cor. 1", ordem: 1, saidaLivre: true },
        { key: "corredor_c2", label: "Cor. 2", ordem: 2, saidaLivre: true },
        { key: "corredor_c3", label: "Cor. 3", ordem: 3, saidaLivre: true },
        { key: "corredor_c4", label: "Cor. 4", ordem: 4, saidaLivre: true },
        { key: "corredor_c5", label: "Cor. 5", ordem: 5, saidaLivre: true },
        { key: "corredor_c6", label: "Cor. 6", ordem: 6, saidaLivre: true }
      ]
    },
    {
      id: "cot",
      titulo: "COT",
      filas: [{ key: "cot", label: "COT", ordem: 1, saidaLivre: true }]
    },
    {
      id: "especiais",
      titulo: "Áreas especiais",
      filas: [
        { key: "muro", label: "Muro", ordem: 1, saidaLivre: true },
        { key: "bomba", label: "Bomba", ordem: 1, saidaLivre: true },
        { key: "corujao", label: "Corujão", ordem: 1, horarioMinimo: HORA_MINIMA_CORUJAO },
        { key: "caixa_dagua", label: "Caixa Dágua", ordem: 1, saidaLivre: true }
      ]
    }
  ];

  const GRUPO_BLOQUEADOS = {
    id: "bloqueados",
    titulo: "Carros bloqueados",
    filas: [
      { key: "bloqueados_oficina", label: "Bloq. oficina", bloqueado: true },
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

  /** Gabarito Garagem (PDF) — vista de cima; setas = saídas. */
  const PLANTA_GARAGEM = {
    saidas: {
      norte: "Norte · Messias Wilmar de Souza",
      oeste: "Oeste · José Dias Aro",
      sul: "Sul · Tietê",
      leste: "Leste · Duque de Caxias"
    },
    faixaPrincipal: [
      { key: "muro", label: "MURO" },
      { key: "corredor_c1", label: "Cor. 1" },
      { key: "corredor_c2", label: "Cor. 2" },
      { key: "corredor_c3", label: "Cor. 3" },
      { key: "corredor_c4", label: "Cor. 4" },
      { key: "corredor_c5", label: "Cor. 5" },
      { key: "corredor_c6", label: "Cor. 6" },
      { key: "mistos_f1", label: "Fila 1" },
      { key: "mistos_f2", label: "Fila 2" },
      { key: "mistos_f3", label: "Fila 3" },
      { key: "mistos_f4", label: "Fila 4" }
    ],
    oeste: [
      { key: "bomba", label: "Bomba" },
      { key: "corujao", label: "Corujão" }
    ],
    centro: [
      { key: "caixa_dagua", label: "Caixa Dágua" },
      { key: "latavador_f1", label: "Lavador" },
      { key: "cot", label: "COT" }
    ],
    operacao: [
      { key: "oficina_f1", label: "Ofic. F1" },
      { key: "oficina_f2", label: "Ofic. F2" },
      { key: "pesados_f1", label: "Pes. F1" },
      { key: "pesados_f2", label: "Pes. F2" },
      { key: "pesados_f3", label: "Pes. F3" },
      { key: "pesados_f4", label: "Pes. F4" },
      { key: "bloqueados_oficina", label: "Bloq. oficina" },
      { key: "reforma", label: "Reforma" }
    ]
  };

  function ehFilaBloqueada(filaKey) {
    return Boolean(FILA_MAP[filaKey]?.bloqueado);
  }

  function corujaoDisponivel() {
    const d = new Date();
    const agora = d.getHours() * 60 + d.getMinutes();
    const [h, m] = HORA_MINIMA_CORUJAO.split(":").map(Number);
    return agora >= h * 60 + m;
  }

  function classeSaidaFila(filaCfg) {
    if (filaCfg.horarioMinimo) {
      return corujaoDisponivel() ? " saida-livre" : " corujao-aguardando";
    }
    return filaCfg.saidaLivre ? " saida-livre" : "";
  }

  function contarPedidos() {
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
    if (ehFilaBloqueada(loc.filaKey)) {
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patio));
  }

  function obterTecnologia(prefixo) {
    const veiculo = frotaDados.find((item) => item.veiculo == prefixo);
    if (!veiculo) return "—";
    if (veiculo.rotulo) return veiculo.rotulo;
    return [veiculo.cor, veiculo.tecnologia, veiculo.climatizacao].filter(Boolean).join(" · ") || "—";
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
      const option = document.createElement("option");
      option.value = item.veiculo;
      option.textContent = item.rotulo || obterTecnologia(item.veiculo);
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

  function obterAlocadosSet() {
    const set = new Set();
    Object.values(patio.filas).forEach((arr) => {
      arr.forEach((p) => set.add(String(p)));
    });
    return set;
  }

  function listarCarrosNaoUtilizados() {
    const alocados = obterAlocadosSet();
    return frotaDados
      .filter((item) => !alocados.has(String(item.veiculo)))
      .sort((a, b) => Number(a.veiculo) - Number(b.veiculo));
  }

  function renderizarListaNaoUtilizados() {
    const lista = document.getElementById("listaNaoUtilizados");
    const qtd = document.getElementById("naoUtilizadosQtd");
    if (!lista) return;

    const carros = listarCarrosNaoUtilizados();
    if (qtd) qtd.textContent = String(carros.length);

    if (!carros.length) {
      lista.innerHTML = '<span class="patio-nao-util-vazio">Todos os veículos estão alocados no pátio.</span>';
      return;
    }

    lista.innerHTML = carros
      .map((item) => {
        const rotulo = item.rotulo || obterTecnologia(item.veiculo);
        return `<span class="patio-nao-util-chip" title="${rotulo}">${item.veiculo}</span>`;
      })
      .join("");
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
    `;
  }

  function criarQuadroCarro(prefixo, filaKey) {
    const tech = obterTecnologia(prefixo);
    const filaCfg = FILA_MAP[filaKey] || {};
    const slot = document.createElement("div");
    let statusClass = "";

    if (filaCfg.bloqueado) {
      statusClass = "bloqueado-status";
    } else if (patio.pedidos.includes(prefixo)) {
      statusClass = "pedidos-status";
    }

    const btnPedido = filaCfg.bloqueado
      ? ""
      : `<button type="button" class="btn-pedido" title="Marcar/desmarcar Pedido" data-prefixo="${prefixo}">P</button>`;

    slot.className = `garagem-slot car-tag ${statusClass}`;
    slot.title = `${prefixo} — ${tech}`;
    slot.innerHTML = `
      <span class="garagem-slot-prefixo">${prefixo}</span>
      <span class="garagem-slot-tech">${tech}</span>
      <div class="garagem-slot-actions">
        ${btnPedido}
        <button type="button" class="remove-btn" title="Remover" data-prefixo="${prefixo}">×</button>
      </div>
    `;
    return slot;
  }

  function criarSlotVazio() {
    const slot = document.createElement("div");
    slot.className = "garagem-slot garagem-slot-vazio";
    slot.setAttribute("aria-hidden", "true");
    slot.textContent = "—";
    return slot;
  }

  function criarColunaGaragem(filaKey, label, extraClass = "") {
    const filaCfg = FILA_MAP[filaKey] || {};
    const col = document.createElement("div");
    col.className = `garagem-col${extraClass ? ` ${extraClass}` : ""}`;

    const qtd = (patio.filas[filaKey] || []).length;
    const livre = classeSaidaFila(filaCfg);
    const bloq = filaCfg.bloqueado ? " bloqueado-lane" : "";
    const corujaoHint = filaCfg.horarioMinimo && !corujaoDisponivel()
      ? ` · após ${filaCfg.horarioMinimo}`
      : "";

    const head = document.createElement("button");
    head.type = "button";
    head.className = `garagem-col-head${livre}${bloq}`;
    head.dataset.fila = filaKey;
    head.innerHTML = `${label}<small>${qtd} carro${qtd !== 1 ? "s" : ""}${corujaoHint}</small>`;

    const slots = document.createElement("div");
    slots.className = "garagem-slots";
    slots.id = `fila_${filaKey}`;

    const carros = patio.filas[filaKey] || [];
    if (!carros.length) {
      slots.appendChild(criarSlotVazio());
    } else {
      carros.forEach((prefixo) => {
        slots.appendChild(criarQuadroCarro(prefixo, filaKey));
      });
    }

    col.append(head, slots);
    return col;
  }

  function montarLinhaColunas(cols, rowClass) {
    const row = document.createElement("div");
    row.className = rowClass;
    cols.forEach(({ key, label }) => {
      row.appendChild(criarColunaGaragem(key, label));
    });
    return row;
  }

  function renderizarMapa() {
    const mapa = document.getElementById("patioMap");
    if (!mapa) return;
    mapa.innerHTML = "";
    mapa.className = "patio-map garagem-planta";

    const planta = document.createElement("div");
    planta.className = "garagem-planta-inner";

    const saidaNorte = document.createElement("div");
    saidaNorte.className = "garagem-saida garagem-saida-norte";
    saidaNorte.innerHTML = `<span class="garagem-saida-icone" aria-hidden="true">↑</span> ${PLANTA_GARAGEM.saidas.norte}`;

    const corpo = document.createElement("div");
    corpo.className = "garagem-corpo";

    const saidaOeste = document.createElement("div");
    saidaOeste.className = "garagem-saida garagem-saida-oeste";
    saidaOeste.innerHTML = `<span class="garagem-saida-icone" aria-hidden="true">←</span><span>Oeste<small>José Dias Aro</small></span>`;

    const patioVisual = document.createElement("div");
    patioVisual.className = "garagem-patio";

    patioVisual.appendChild(
      montarLinhaColunas(PLANTA_GARAGEM.faixaPrincipal, "garagem-faixa-principal")
    );

    const meio = document.createElement("div");
    meio.className = "garagem-meio";

    const stackOeste = document.createElement("div");
    stackOeste.className = "garagem-stack-oeste";
    PLANTA_GARAGEM.oeste.forEach(({ key, label }) => {
      const linha = document.createElement("div");
      linha.className = "garagem-stack-linha";
      linha.appendChild(criarColunaGaragem(key, label, "garagem-col-larga"));
      stackOeste.appendChild(linha);
    });

    const centro = document.createElement("div");
    centro.className = "garagem-centro";
    centro.appendChild(
      montarLinhaColunas(PLANTA_GARAGEM.centro, "garagem-linha-centro")
    );

    meio.append(stackOeste, centro);
    patioVisual.appendChild(meio);

    const saidaLeste = document.createElement("div");
    saidaLeste.className = "garagem-saida garagem-saida-leste";
    saidaLeste.innerHTML = `<span>Leste<small>Duque de Caxias</small></span><span class="garagem-saida-icone" aria-hidden="true">→</span>`;

    corpo.append(saidaOeste, patioVisual, saidaLeste);

    const saidaSur = document.createElement("div");
    saidaSur.className = "garagem-saida garagem-saida-sur";
    saidaSur.innerHTML = `<span class="garagem-saida-icone" aria-hidden="true">↓</span> ${PLANTA_GARAGEM.saidas.sul}`;

    planta.append(saidaNorte, corpo, saidaSur);
    mapa.appendChild(planta);

    const operacao = document.createElement("section");
    operacao.className = "garagem-operacao";
    operacao.innerHTML = "<h3 class=\"garagem-operacao-titulo\">Oficina, pesados e bloqueados</h3>";
    operacao.appendChild(
      montarLinhaColunas(PLANTA_GARAGEM.operacao, "garagem-linha-operacao")
    );
    mapa.appendChild(operacao);

    mapa.querySelectorAll(".garagem-col-head").forEach((btn) => {
      btn.addEventListener("click", () => {
        definirFilaSelecionada(btn.dataset.fila);
        document.getElementById("inputFilaBus")?.focus();
      });
    });

    mapa.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        liberarCarro(btn.dataset.prefixo);
      });
    });

    mapa.querySelectorAll(".btn-pedido").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePedido(btn.dataset.prefixo);
      });
    });
  }

  function renderizarPatio() {
    renderizarMapa();
    popularSelectFila();
    popularDatalist();
    atualizarResumo();
    renderizarListaNaoUtilizados();
  }

  function removerVeiculoDasFilas(prefixo) {
    Object.keys(patio.filas).forEach((k) => {
      patio.filas[k] = patio.filas[k].filter((p) => p != prefixo);
    });
  }

  function aplicarAlocacao(prefixo, filaKey, input, mensagemOk) {
    lancamentoEmAndamento = true;
    try {
      removerVeiculoDasFilas(prefixo);
      patio.filas[filaKey].push(prefixo);
      if (ehFilaBloqueada(filaKey)) {
        patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
      }
      salvarUltimaFila(filaKey);
      salvarEstado();
      renderizarPatio();
      mostrarOkLancamento(mensagemOk || `✓ ${prefixo} lançado em ${obterNomeFila(filaKey)}.`);
      if (input) {
        input.value = "";
        input.focus();
      }
    } finally {
      lancamentoEmAndamento = false;
    }
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
    if (!filaKey) {
      mostrarErroLancamento("Selecione a fila de destino.");
      return;
    }

    const loc = localizarVeiculo(prefixo);
    if (loc) {
      const origem = obterNomeFila(loc.filaKey);
      const destino = obterNomeFila(filaKey);
      if (loc.filaKey === filaKey) {
        mostrarErroLancamento(`Veículo ${prefixo} já está em ${destino}.`);
        input?.select();
        return;
      }
      const mover = confirm(
        `Veículo ${prefixo} já está em ${origem}.\n\nDeseja mover para ${destino}?`
      );
      if (!mover) {
        mostrarErroLancamento(`Lançamento cancelado. ${prefixo} permanece em ${origem}.`);
        input?.select();
        return;
      }
      aplicarAlocacao(prefixo, filaKey, input, `✓ ${prefixo} movido de ${origem} para ${destino}.`);
      return;
    }

    aplicarAlocacao(prefixo, filaKey, input);
  }

  function togglePedido(prefixo) {
    if (!prefixo) return;
    const loc = localizarVeiculo(prefixo);
    if (loc && ehFilaBloqueada(loc.filaKey)) return;
    if (patio.pedidos.includes(prefixo)) {
      patio.pedidos = patio.pedidos.filter((p) => p != prefixo);
    } else {
      patio.pedidos.push(prefixo);
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
    if (ehFilaBloqueada(loc.filaKey)) tags.push("Bloqueado");
    const tagsTxt = tags.length ? ` <span style="opacity:.85">(${tags.join(" · ")})</span>` : "";

    resultBox.className = "result-box success";
    resultBox.innerHTML = `<b>${prefixo}</b> está em <b>${nome}</b>.${tagsTxt}`;
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
          if (ehFilaBloqueada(f.key)) tag = ` [BLOQUEADO — ${f.label.toUpperCase()}]`;
          else if (patio.pedidos.includes(p)) tag = " [PEDIDO]";
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
