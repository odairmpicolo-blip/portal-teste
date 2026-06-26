/** Regras compartilhadas do pátio (leitura do localStorage patio_tcgl_v3). */
export const STORAGE_KEY = "patio_tcgl_v3";

export const GRUPOS_PATIO = [
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
      { key: "corujao", label: "Corujão", ordem: 1 }
    ]
  }
];

export const GRUPO_BLOQUEADOS = {
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

export const FILA_MAP = Object.fromEntries(TODAS_FILAS.map((f) => [f.key, f]));

const GRUPO_POR_FILA = {};
GRUPOS_PATIO.forEach((g) => g.filas.forEach((f) => { GRUPO_POR_FILA[f.key] = g; }));
GRUPO_BLOQUEADOS.filas.forEach((f) => { GRUPO_POR_FILA[f.key] = GRUPO_BLOQUEADOS; });

/** Filas com saída livre (sem depender de filas anteriores no grupo). */
const FILAS_SAIDA_LIVRE = new Set([
  "oficina_f1",
  "latavador_f1",
  "mistos_f1",
  "pesados_f1",
  "muro",
  "bomba",
  "corredor_c1",
  "corredor_c2",
  "corredor_c3",
  "corredor_c4",
  "corredor_c5",
  "corredor_c6",
  "cot"
]);

/** Carros em bloqueio (bloq. oficina / reforma) não entram na escalação. */
const FILAS_NAO_UTILIZAVEIS = new Set([
  "bloqueados_oficina",
  "reforma"
]);

export function ehFilaNaoUtilizavelEscala(filaKey) {
  return FILAS_NAO_UTILIZAVEIS.has(filaKey);
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

export function carregarPatio() {
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
    || JSON.parse(localStorage.getItem("patio_tcgl_v2") || "null");
  return migrarEstado(raw);
}

export function localizarVeiculo(prefixo, patio) {
  const alvo = String(prefixo || "").trim();
  if (!alvo) return null;
  for (const [key, lista] of Object.entries(patio.filas)) {
    const idx = lista.findIndex((p) => String(p) === alvo);
    if (idx !== -1) return { filaKey: key, posicao: idx };
  }
  return null;
}

export function obterNomeFila(key) {
  const fila = FILA_MAP[key];
  if (!fila) return key;
  const grupo = GRUPO_POR_FILA[key];
  return grupo ? `${grupo.titulo} · ${fila.label}` : fila.label;
}

export function formatarPosicaoPatio(loc) {
  if (!loc) return "";
  return `${obterNomeFila(loc.filaKey)} · posição ${loc.posicao + 1}`;
}

export function normalizarTecnologia(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function obterTecnologia(prefixo, frota) {
  const alvo = String(prefixo || "").trim();
  const item = (frota || []).find((f) => String(f.veiculo) === alvo);
  return item ? item.tecnologia : "";
}

export function ehPedido(prefixo, patio) {
  return patio.pedidos.includes(String(prefixo || "").trim());
}

function filasAnterioresBloqueando(patio, filaKey) {
  const filaCfg = FILA_MAP[filaKey];
  const grupo = GRUPO_POR_FILA[filaKey];
  if (!filaCfg || !grupo || !filaCfg.ordem || filaCfg.ordem <= 1) return [];
  const bloqueadas = [];
  grupo.filas.forEach((f) => {
    if (f.ordem < filaCfg.ordem && patio.filas[f.key]?.length) {
      bloqueadas.push(f);
    }
  });
  return bloqueadas;
}

/** Verifica se o veículo pode sair do pátio conforme fila e posição. */
export function avaliarSaidaVeiculo(prefixo, patio) {
  const alvo = String(prefixo || "").trim();
  if (!alvo) {
    return { ok: false, motivo: "Sem prefixo informado." };
  }

  const loc = localizarVeiculo(alvo, patio);
  if (!loc) {
    return { ok: false, motivo: "Veículo não está no pátio." };
  }

  if (FILAS_NAO_UTILIZAVEIS.has(loc.filaKey)) {
    return { ok: false, motivo: "Carro bloqueado — não utilizável.", loc };
  }

  if (loc.posicao !== 0) {
    return {
      ok: false,
      motivo: `Aguardando na fila (posição ${loc.posicao + 1}).`,
      loc
    };
  }

  const filaCfg = FILA_MAP[loc.filaKey];
  if (filaCfg?.saidaLivre || FILAS_SAIDA_LIVRE.has(loc.filaKey)) {
    return { ok: true, loc };
  }

  const bloqueadas = filasAnterioresBloqueando(patio, loc.filaKey);
  if (bloqueadas.length) {
    const nomes = bloqueadas.map((f) => `${f.label} (${patio.filas[f.key].length})`).join(", ");
    return { ok: false, motivo: `Saída bloqueada — filas anteriores com veículos: ${nomes}.`, loc };
  }

  return { ok: true, loc };
}

export function listarCandidatosSubstituto(tecnologia, patio, frota, opcoes = {}) {
  const techAlvo = normalizarTecnologia(tecnologia);
  const incluirOutras = opcoes.incluirOutrasTecnologias === true;
  if (!techAlvo && !incluirOutras) return [];

  const usados = opcoes.usados || new Set();
  const excluir = new Set((opcoes.excluir || []).map(String));
  const filtroCarro = opcoes.filtroCarro;
  const candidatos = [];

  Object.entries(patio.filas).forEach(([filaKey, lista]) => {
    lista.forEach((prefixo, posicao) => {
      const p = String(prefixo);
      if (excluir.has(p) || usados.has(p)) return;

      const techCarro = normalizarTecnologia(obterTecnologia(p, frota));
      const mesmaTecnologia = Boolean(techAlvo && techCarro === techAlvo);
      if (techAlvo && !mesmaTecnologia && !incluirOutras) return;

      const saida = avaliarSaidaVeiculo(p, patio);
      if (!saida.ok) return;
      if (typeof filtroCarro === "function" && !filtroCarro(p, saida.loc)) return;

      const livre = FILAS_SAIDA_LIVRE.has(filaKey) || FILA_MAP[filaKey]?.saidaLivre;
      candidatos.push({
        prefixo: p,
        loc: saida.loc,
        posicao,
        livre: livre ? 1 : 0,
        mesmaTecnologia: mesmaTecnologia ? 1 : 0
      });
    });
  });

  candidatos.sort((a, b) => {
    if (b.mesmaTecnologia !== a.mesmaTecnologia) return b.mesmaTecnologia - a.mesmaTecnologia;
    if (b.livre !== a.livre) return b.livre - a.livre;
    if (a.posicao !== b.posicao) return a.posicao - b.posicao;
    return Number(a.prefixo) - Number(b.prefixo);
  });

  return candidatos;
}
