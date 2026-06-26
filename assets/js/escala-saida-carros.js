import { carregarEscalaSaidaPlanilha, planilhaPareceSemCabecalho } from "./escala-saida-dados-leitura.js";
import {
  carregarPatio,
  clonarPatio,
  consultarSituacaoCarro,
  ehPedido,
  formatarConsultaFila,
  listarCandidatosSubstituto,
  obterNomeFila,
  mesmaCorVeiculo,
  obterPerfilTecnologia,
  obterTecnologia,
  normalizarTecnologia,
  registrarSaidaVeiculo
} from "./patio-core.js";

const HORA_INICIO_MIN = "04:10";
const HORA_INICIO_MAX = "07:00";
const HORA_LIMITE_RECOLHIMENTO_PEDIDO = "10:45";
const HORA_LIMITE_RECOLHIMENTO_SUPER_BUS = "15:00";
const LINHAS_SUPER_BUS = new Set(["800", "801", "802", "803", "806", "913"]);
const CHAVES_HORARIO_INICIO = ["inicio", "horario_de_inicio", "horario_inicio", "inicio_programado"];

/** Colunas oficiais — planilha + TECNOLOGIA, OBS, ALERTA. */
const COLUNAS_PLANILHA = [
  { chave: "data", rotulo: "Data" },
  { chave: "linha", rotulo: "LINHA" },
  { chave: "subst", rotulo: "SUBST" },
  { chave: "carro", rotulo: "CARRO", alias: ["carro", "carro_escalado"] },
  { chave: "h_real", rotulo: "H.REAL", alias: ["h_real", "h_real_", "saida_real"], tipo: "hora" },
  { chave: "inicio", rotulo: "INICIO", alias: ["inicio", "horario_de_inicio", "horario_inicio"], tipo: "hora" },
  { chave: "serv", rotulo: "SERV.", alias: ["serv", "serv_", "work_id"] },
  { chave: "fim", rotulo: "FIM MOT.", alias: ["fim_mot", "fim", "fim_motorista"], tipo: "hora" },
  { chave: "reg", rotulo: "REG.", alias: ["reg", "motorista", "matricula"] },
  { chave: "loc", rotulo: "LOCAL", alias: ["loc", "local_inicio", "local"] },
  { chave: "h_total", rotulo: "H.TOTAL", alias: ["h_total", "h_total_"], tipo: "hora" },
  { chave: "turno", rotulo: "TURNO", alias: ["turno"] },
  { chave: "f_carro", rotulo: "F. CARRO", alias: ["f_carro", "f_carro_"], tipo: "hora", titulo: "Fim do carro (HH:MM) — pedido: recolher até 10:45" },
  { chave: "tecnologia", rotulo: "TECNOLOGIA" },
  { chave: "obs", rotulo: "OBS", tipo: "obs" },
  { chave: "alerta", rotulo: "ALERTA", tipo: "alerta" }
];

const MAX_OPCOES_CARRO = 8;

const state = {
  data: "",
  colunas: COLUNAS_PLANILHA,
  bruto: [],
  processado: [],
  carregando: false,
  aceites: new Set(),
  escolhasCarro: new Map()
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

function extrairHorarioInicio(row) {
  return pickCampo(row, CHAVES_HORARIO_INICIO);
}

function minutosHorarioInicio(row) {
  return horaParaMinutos(extrairHorarioInicio(row));
}

function chaveServico(row, carroEscalado) {
  return [
    pickCampo(row, ["work_id", "work-id", "serv", "serv_"]),
    extrairHorarioInicio(row),
    carroEscalado
  ].join("|");
}

function escHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

export function formatarHoraHHMM(valor) {
  if (valor == null || valor === "") return "";
  if (typeof valor === "number" && isFinite(valor)) {
    if (valor >= 0 && valor < 1) {
      const total = Math.round(valor * 24 * 60);
      const h = Math.floor(total / 60) % 24;
      const m = total % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  const texto = String(valor).trim();
  if (!texto) return "";
  const iso = texto.match(/T(\d{1,2}):(\d{2})/);
  if (iso) {
    return `${String(Number(iso[1])).padStart(2, "0")}:${iso[2]}`;
  }
  const hhmm = texto.match(/^(\d{1,2})[:h](\d{2})$/);
  if (hhmm) {
    return `${String(Number(hhmm[1])).padStart(2, "0")}:${hhmm[2]}`;
  }
  const fracao = Number(texto.replace(",", "."));
  if (texto.includes(".") && isFinite(fracao) && fracao >= 0 && fracao < 1) {
    return formatarHoraHHMM(fracao);
  }
  return texto;
}

export function horaParaMinutos(valor) {
  if (valor == null || valor === "") return null;
  const normalizado = formatarHoraHHMM(valor);
  if (normalizado && normalizado.includes(":")) {
    const [h, m] = normalizado.split(":");
    return Number(h) * 60 + Number(m);
  }
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

function entreHorarios(horario, minimo, maximo) {
  const mins = horaParaMinutos(horario);
  const min = horaParaMinutos(minimo);
  const max = horaParaMinutos(maximo);
  if (mins == null || min == null || max == null) return true;
  return mins >= min && mins <= max;
}

function filtrarHorarioInicio(linhas) {
  return linhas.filter((row) => {
    const hora = extrairHorarioInicio(row);
    if (!hora) return true;
    return entreHorarios(hora, HORA_INICIO_MIN, HORA_INICIO_MAX);
  });
}

function pareceHora(valor) {
  return /^\d{2}:\d{2}$/.test(formatarHoraHHMM(valor));
}

function valorColuna(row, col) {
  if (col.tipo === "obs") return formatarObs(row);
  if (col.tipo === "alerta") return row._alerta || "";
  if (col.chave === "tecnologia") return row.tecnologia || pickCampo(row, ["tecnologia"]);
  const chaves = col.alias || [col.chave];
  if (col.chave === "subst") {
    const v = row.subst || pickCampo(row, chaves);
    return col.tipo === "hora" ? formatarHoraHHMM(v) : v;
  }
  const valor = pickCampo(row, chaves);
  return col.tipo === "hora" ? formatarHoraHHMM(valor) : valor;
}

function formatarLocalEscala(loc) {
  if (!loc) return "";
  return obterNomeFila(loc.filaKey);
}

function formatarObs(row) {
  return row.obs_escala || "";
}

function extrairCarroEscalado(row) {
  return normalizarPrefixo(
    pickCampo(row, ["carro_escalado", "carro", "prefixo", "veiculo"])
  );
}

/** Escalados de serviços posteriores (cronológicos) — não usar como substituto antes da hora. */
function montarEscaladosReservados(linhas, indiceAtual) {
  const reservados = new Set();
  linhas.forEach((row, i) => {
    if (i <= indiceAtual) return;
    const prefixo = extrairCarroEscalado(row);
    if (prefixo) reservados.add(prefixo);
  });
  return reservados;
}

function extrairFimCarro(row) {
  return formatarHoraHHMM(pickCampo(row, ["f_carro", "f_carro_"]));
}

function recolhimentoAposLimite(horaFimCarro, limite) {
  if (!horaFimCarro) return false;
  return !dentroDoLimite(horaFimCarro, limite);
}

function aplicarAlertasRecolhimentoPedido(carro, horaFimCarro, patio, alertas) {
  if (!carro || !ehPedido(carro, patio)) return;
  alertas.push(`Pedido ${carro}: recolher até ${HORA_LIMITE_RECOLHIMENTO_PEDIDO} (F. CARRO)`);
  if (!horaFimCarro) {
    alertas.push(`Pedido ${carro}: informar F. CARRO — recolhimento deve ser até ${HORA_LIMITE_RECOLHIMENTO_PEDIDO}`);
    return;
  }
  if (recolhimentoAposLimite(horaFimCarro, HORA_LIMITE_RECOLHIMENTO_PEDIDO)) {
    alertas.push(
      `Pedido ${carro}: recolhimento (F. CARRO ${horaFimCarro}) após ${HORA_LIMITE_RECOLHIMENTO_PEDIDO}`
    );
  }
}

function aplicarAlertasSuperBus(prefixos, horaFimCarro, alertas, flags) {
  const vistos = new Set();
  prefixos.forEach((prefixo) => {
    const alvo = String(prefixo || "").trim();
    if (!alvo || vistos.has(alvo) || !ehSuperBusPorPrefixo(alvo, frota)) return;
    vistos.add(alvo);
    flags.temSuperBus = true;
    alertas.push(`SUPER BUS ${alvo}: recolher até ${HORA_LIMITE_RECOLHIMENTO_SUPER_BUS} (F. CARRO)`);
    if (recolhimentoAposLimite(horaFimCarro, HORA_LIMITE_RECOLHIMENTO_SUPER_BUS)) {
      alertas.push(
        `SUPER BUS ${alvo}: recolhimento (F. CARRO ${horaFimCarro}) após ${HORA_LIMITE_RECOLHIMENTO_SUPER_BUS}`
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

function opcoesCarroLivre(ctx, carroEscalado, linhaNorm) {
  const { usados, escaladosReservados } = ctx;
  return {
    usados,
    excluir: [...escaladosReservados, carroEscalado].filter(Boolean),
    excluirPedidos: true,
    filtroCarro: (prefixo) => validarSuperBusLinha(prefixo, linhaNorm, frota).ok
  };
}

function montarAlertaTroca(tipo, carroEscalado, substituto, frotaRef) {
  const perfilEsc = obterPerfilTecnologia(carroEscalado, frotaRef);
  const perfilSub = obterPerfilTecnologia(substituto, frotaRef);
  if (tipo === "cor") {
    return `Sugestão: troca de cor — horário ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
  }
  if (tipo === "tecnologia") {
    return `Sugestão: troca de tecnologia — horário ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
  }
  return `Sugestão: troca de cor/tecnologia — horário ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
}

function montarOpcaoCarro(candidato, perfilEsc, carroEscalado, opcoes = {}) {
  const mudancaCor = Boolean(
    opcoes.mudancaCor ?? (perfilEsc.cor ? !mesmaCorVeiculo(carroEscalado, candidato.prefixo, frota) : false)
  );
  const mudancaTecnologia = opcoes.mudancaTecnologia !== false;
  const tech = obterTecnologia(candidato.prefixo, frota);
  return {
    prefixo: candidato.prefixo,
    loc: candidato.loc,
    tecnologia: tech,
    fila: formatarLocalEscala(candidato.loc),
    ordemFila: candidato.ordemFila,
    mudancaTecnologia,
    mudancaCor,
    semMesmaTecnologia: Boolean(opcoes.semMesmaTecnologia)
  };
}

const ORDENS_FILA_ESCALA = [1, 2, 3, 4];

function candidatosParaOpcoes(candidatos, perfilEsc, carroEscalado, meta) {
  return candidatos.map((c) => montarOpcaoCarro(c, perfilEsc, carroEscalado, meta));
}

/** Carros livres na ordem Fila 1 → 2 → 3 → 4 (por grupo), após esgotar a anterior. */
function listarCandidatosPorOrdemFila(tecnologia, patio, frota, base) {
  const resultado = [];
  const vistos = new Set();
  for (const ordem of ORDENS_FILA_ESCALA) {
    const lista = listarCandidatosSubstituto(tecnologia, patio, frota, {
      ...base,
      ordemFilaAlvo: ordem
    });
    lista.forEach((c) => {
      if (vistos.has(c.prefixo)) return;
      vistos.add(c.prefixo);
      resultado.push(c);
    });
  }
  return resultado;
}

function listarAlternativasPorOrdemFila(patio, base, perfilEsc, carroEscalado) {
  const opcoes = [];
  const vistos = new Set();

  const incluirOrdem = (ordem, meta, filtroPrefixo) => {
    const cands = listarCandidatosSubstituto(perfilEsc.completo || "", patio, frota, {
      ...base,
      ordemFilaAlvo: ordem,
      incluirOutrasTecnologias: true,
      filtroPrefixo
    });
    cands.forEach((c) => {
      if (vistos.has(c.prefixo)) return;
      vistos.add(c.prefixo);
      opcoes.push(montarOpcaoCarro(c, perfilEsc, carroEscalado, meta));
    });
  };

  for (const ordem of ORDENS_FILA_ESCALA) {
    if (perfilEsc.cor) {
      incluirOrdem(
        ordem,
        { mudancaTecnologia: true, mudancaCor: false, semMesmaTecnologia: true },
        (prefixo) => {
          const perfil = obterPerfilTecnologia(prefixo, frota);
          return perfil.cor === perfilEsc.cor && perfil.resto !== perfilEsc.resto;
        }
      );
    }
    if (perfilEsc.cor && perfilEsc.resto) {
      incluirOrdem(
        ordem,
        { mudancaTecnologia: false, mudancaCor: true, semMesmaTecnologia: true },
        (prefixo) => {
          const perfil = obterPerfilTecnologia(prefixo, frota);
          return perfil.resto === perfilEsc.resto && perfil.cor && perfil.cor !== perfilEsc.cor;
        }
      );
    }
    incluirOrdem(
      ordem,
      { semMesmaTecnologia: true },
      (prefixo) => {
        if (!perfilEsc.completo) return true;
        const tech = normalizarTecnologia(obterTecnologia(prefixo, frota));
        return tech !== perfilEsc.completo;
      }
    );
    if (opcoes.length >= MAX_OPCOES_CARRO) break;
  }

  return opcoes.slice(0, MAX_OPCOES_CARRO);
}

function buscarSubstitutoParaHorario(patio, ctx, carroEscalado, linhaNorm) {
  const perfilEsc = obterPerfilTecnologia(carroEscalado, frota);
  const base = opcoesCarroLivre(ctx, carroEscalado, linhaNorm);

  const mesmaTechCands = listarCandidatosPorOrdemFila(perfilEsc.completo, patio, frota, base);
  if (mesmaTechCands.length) {
    const opcoes = candidatosParaOpcoes(mesmaTechCands, perfilEsc, carroEscalado, {
      mudancaTecnologia: false,
      mudancaCor: false,
      semMesmaTecnologia: false
    }).slice(0, MAX_OPCOES_CARRO);
    return {
      tipo: "mesma_tech",
      opcoes
    };
  }

  const alternativas = listarAlternativasPorOrdemFila(patio, base, perfilEsc, carroEscalado);
  if (alternativas.length) {
    return {
      tipo: "alternativa",
      opcoes: alternativas
    };
  }

  return null;
}

function montarResultadoTroca(opcao, carroEscalado, tecnologiaHorario) {
  const perfilEsc = obterPerfilTecnologia(carroEscalado, frota);
  const perfilSaida = obterPerfilTecnologia(opcao.prefixo, frota);
  const techSaida = opcao.tecnologia || obterTecnologia(opcao.prefixo, frota);
  const flags = {
    mudancaTecnologia: Boolean(opcao.mudancaTecnologia),
    mudancaCor: Boolean(opcao.mudancaCor),
    aceitePendente: false,
    semMesmaTecnologia: Boolean(opcao.semMesmaTecnologia)
  };
  const alertas = [];
  let tecnologiaExibicao = tecnologiaHorario;

  if (flags.semMesmaTecnologia && tecnologiaHorario) {
    alertas.push(`Sem carro livre para tecnologia ${tecnologiaHorario} do horário.`);
    flags.aceitePendente = true;
  }

  if (flags.mudancaCor || flags.mudancaTecnologia) {
    flags.aceitePendente = true;
    tecnologiaExibicao = `${perfilEsc.rotulo || tecnologiaHorario} → ${perfilSaida.rotulo || techSaida}`;
    if (flags.mudancaCor && !flags.mudancaTecnologia) {
      alertas.push(montarAlertaTroca("cor", carroEscalado, opcao.prefixo, frota));
    } else if (flags.mudancaTecnologia && !flags.mudancaCor) {
      alertas.push(montarAlertaTroca("tecnologia", carroEscalado, opcao.prefixo, frota));
    } else {
      alertas.push(montarAlertaTroca("tecnologia_cor", carroEscalado, opcao.prefixo, frota));
    }
  } else if (perfilEsc.rotulo && perfilSaida.rotulo && perfilEsc.completo !== perfilSaida.completo) {
    tecnologiaExibicao = `${perfilEsc.rotulo} → ${perfilSaida.rotulo}`;
  }

  return { flags, alertas, tecnologiaExibicao };
}

function aplicarOpcaoCarroSaida(row, opcao, carroEscalado, tecnologia, linhaNorm, alertasBase = []) {
  const { flags, alertas, tecnologiaExibicao } = montarResultadoTroca(opcao, carroEscalado, tecnologia);
  const alertasFinais = [...alertasBase, ...alertas];
  const temSubstituicao = Boolean(opcao.prefixo && carroEscalado && opcao.prefixo !== carroEscalado);

  return {
    ...row,
    carro_saida: opcao.prefixo,
    subst: temSubstituicao ? opcao.prefixo : "",
    obs_escala: formatarLocalEscala(opcao.loc),
    tecnologia: tecnologiaExibicao,
    _alerta: alertasFinais.join(" | "),
    _mudanca_tecnologia: flags.mudancaTecnologia,
    _mudanca_cor: flags.mudancaCor,
    _aceite_pendente: flags.aceitePendente,
    _tem_substituicao: temSubstituicao
  };
}

function processarLinha(row, patio, ctx) {
  const { usados } = ctx;
  const carroEscalado = extrairCarroEscalado(row);
  const fCarroHora = extrairFimCarro(row);
  const linhaNorm = normalizarLinhaServico(row);
  const tecnologia = obterTecnologia(carroEscalado, frota);
  const chave = chaveServico(row, carroEscalado);

  const alertas = [];
  const flags = {
    mudancaTecnologia: false,
    mudancaCor: false,
    superBusAlerta: false,
    aceitePendente: false,
    temSuperBus: false
  };
  let carroSaida = "";
  let subst = "";
  let obsEscala = pickCampo(row, ["observacoes", "obs", "observacao"]);
  let tecnologiaExibicao = tecnologia;
  let opcoesCarro = [];
  let escolhaPendente = false;

  const temPedido = Boolean(carroEscalado && ehPedido(carroEscalado, patio));
  const fCarroAtrasadoPedido = temPedido && (
    !fCarroHora || recolhimentoAposLimite(fCarroHora, HORA_LIMITE_RECOLHIMENTO_PEDIDO)
  );
  const fCarroAtrasadoSuperBus = recolhimentoAposLimite(fCarroHora, HORA_LIMITE_RECOLHIMENTO_SUPER_BUS);

  aplicarAlertasRecolhimentoPedido(carroEscalado, fCarroHora, patio, alertas);

  if (carroEscalado) {
    const consultaEsc = consultarSituacaoCarro(carroEscalado, patio);
    const escaladoLivre = consultaEsc.tipo === "livre" && !usados.has(carroEscalado);

    if (escaladoLivre) {
      carroSaida = carroEscalado;
      obsEscala = formatarLocalEscala(consultaEsc.loc);
      alertas.push(`Consulta fila: ${formatarConsultaFila(consultaEsc)} — saída liberada.`);
    } else {
      if (consultaEsc.tipo === "indisponivel") {
        alertas.push(`Escalado ${formatarConsultaFila(consultaEsc)} — ${consultaEsc.motivo}`);
      } else if (consultaEsc.tipo === "ausente") {
        alertas.push(`Escalado ${consultaEsc.motivo}`);
      }
      if (usados.has(carroEscalado)) {
        alertas.push(`Escalado ${carroEscalado} já alocado em serviço anterior.`);
      }
      if (temPedido) {
        alertas.push(`Pedido ${carroEscalado}: buscar carro livre para saída.`);
      }

      const busca = buscarSubstitutoParaHorario(patio, ctx, carroEscalado, linhaNorm);
      if (busca?.opcoes?.length) {
        opcoesCarro = busca.opcoes;
        escolhaPendente = true;
        const opcaoPadrao = opcoesCarro[0];
        const aplicado = aplicarOpcaoCarroSaida(
          row,
          opcaoPadrao,
          carroEscalado,
          tecnologia,
          linhaNorm,
          alertas
        );
        carroSaida = aplicado.carro_saida;
        subst = aplicado.subst;
        obsEscala = aplicado.obs_escala;
        tecnologiaExibicao = aplicado.tecnologia;
        alertas.length = 0;
        alertas.push(...aplicado._alerta.split(" | ").filter(Boolean));
        flags.mudancaTecnologia = aplicado._mudanca_tecnologia;
        flags.mudancaCor = aplicado._mudanca_cor;
        flags.aceitePendente = aplicado._aceite_pendente;

        if (busca.tipo === "alternativa") {
          alertas.push(`Troca: ${opcoesCarro.length} veículo(s) livre(s) — escolha em SUBST.`);
        } else {
          alertas.push(
            `Troca: ${opcoesCarro.length} veículo(s) livre(s) (mesma tecnologia) — escolha em SUBST.`
          );
        }
      } else {
        alertas.push(
          tecnologia
            ? `Sem carro livre para tecnologia ${tecnologia} (horário escalado ${carroEscalado}).`
            : `Sem carro livre disponível (horário escalado ${carroEscalado}).`
        );
      }
    }
  } else {
    alertas.push("Serviço sem carro escalado — não é possível sugerir saída.");
  }

  if (carroSaida) {
    aplicarAlertasCarroSaida(carroSaida, alertas, flags, linhaNorm);
  }

  aplicarAlertasSuperBus([carroSaida || carroEscalado], fCarroHora, alertas, flags);

  const temSubstituicao = Boolean(carroSaida && carroEscalado && carroSaida !== carroEscalado);
  if (temSubstituicao && !subst) {
    subst = carroSaida;
  }
  if (!temSubstituicao) {
    escolhaPendente = false;
    opcoesCarro = [];
  }

  return {
    ...row,
    carro_escalado: carroEscalado || row.carro_escalado || row.carro || "",
    f_carro: fCarroHora || row.f_carro || "",
    carro_saida: carroSaida,
    subst,
    tecnologia: tecnologiaExibicao,
    obs_escala: obsEscala,
    _alerta: alertas.join(" | "),
    _chave_servico: chave,
    _mudanca_tecnologia: flags.mudancaTecnologia,
    _mudanca_cor: flags.mudancaCor,
    _super_bus_alerta: flags.superBusAlerta,
    _aceite_pendente: flags.aceitePendente,
    _tem_pedido: temPedido,
    _tem_substituicao: temSubstituicao,
    _tem_super_bus: flags.temSuperBus,
    _f_carro_atrasado: fCarroAtrasadoPedido || (flags.temSuperBus && fCarroAtrasadoSuperBus),
    _opcoes_carro: opcoesCarro,
    _escolha_pendente: escolhaPendente
  };
}

function processarEscala(linhas) {
  const ordenadas = ordenarPorInicio(linhas);
  const patio = clonarPatio(carregarPatio());
  const ctx = {
    usados: new Set(),
    total: ordenadas.length
  };
  const resultados = [];
  for (let indice = 0; indice < ordenadas.length; indice++) {
    const escaladosReservados = montarEscaladosReservados(ordenadas, indice);
    let row = processarLinha(ordenadas[indice], patio, { ...ctx, indice, escaladosReservados });
    const escolha = state.escolhasCarro.get(row._chave_servico);
    if (escolha && row._opcoes_carro?.length) {
      const opcao = row._opcoes_carro.find((op) => op.prefixo === escolha);
      if (opcao) {
        const carroEscalado = row.carro_escalado;
        const tecnologia = obterTecnologia(carroEscalado, frota);
        const linhaNorm = normalizarLinhaServico(row);
        const alertasBase = row._alerta.split(" | ").filter((a) =>
          !a.includes(" opções de carro")
          && !a.startsWith("Substituto ")
          && !a.startsWith("Sugestão em fila")
        );
        row = {
          ...aplicarOpcaoCarroSaida(row, opcao, carroEscalado, tecnologia, linhaNorm, alertasBase),
          _opcoes_carro: row._opcoes_carro,
          _escolha_pendente: false,
          _chave_servico: row._chave_servico,
          _tem_pedido: row._tem_pedido,
          _f_carro_atrasado: row._f_carro_atrasado,
          carro_escalado: row.carro_escalado,
          f_carro: row.f_carro
        };
        const alertasPos = row._alerta.split(" | ").filter(Boolean);
        const flagsPos = {
          mudancaTecnologia: row._mudanca_tecnologia,
          mudancaCor: row._mudanca_cor,
          superBusAlerta: false,
          aceitePendente: row._aceite_pendente,
          temSuperBus: false
        };
        aplicarAlertasCarroSaida(row.carro_saida, alertasPos, flagsPos, linhaNorm);
        aplicarAlertasSuperBus([row.carro_saida, row.carro_escalado], row.f_carro, alertasPos, flagsPos);
        alertasPos.push(`Carro escolhido: ${opcao.prefixo} (${opcao.tecnologia})`);
        row = {
          ...row,
          _alerta: alertasPos.join(" | "),
          _super_bus_alerta: flagsPos.superBusAlerta,
          _tem_super_bus: flagsPos.temSuperBus,
          _aceite_pendente: flagsPos.aceitePendente || row._aceite_pendente
        };
      }
    }
    if (row.carro_saida) {
      registrarSaidaVeiculo(row.carro_saida, patio);
      ctx.usados.add(row.carro_saida);
    }
    resultados.push(row);
  }
  return resultados;
}

function ordenarPorInicio(linhas) {
  return [...linhas].sort((a, b) => {
    const ha = minutosHorarioInicio(a) ?? 9999;
    const hb = minutosHorarioInicio(b) ?? 9999;
    if (ha !== hb) return ha - hb;
    const la = normalizarLinhaServico(a);
    const lb = normalizarLinhaServico(b);
    if (la !== lb) return Number(la || 9999) - Number(lb || 9999);
    const sa = pickCampo(a, ["serv", "serv_", "work_id", "work-id"]);
    const sb = pickCampo(b, ["serv", "serv_", "work_id", "work-id"]);
    return sa.localeCompare(sb, "pt-BR", { numeric: true });
  });
}

function classesLinha(row) {
  const aceito = state.aceites.has(row._chave_servico);
  const classes = [];

  if (row._tem_pedido) classes.push("linha-pedido");

  if (row._escolha_pendente) {
    classes.push("linha-escolha-pendente");
  } else if (row._aceite_pendente && !aceito) {
    classes.push("linha-aceite-pendente");
  } else if (row._aceite_pendente && aceito) {
    classes.push("linha-aceita");
  } else if (row._mudanca_cor) {
    classes.push("linha-troca-cor");
  } else if (row._mudanca_tecnologia) {
    classes.push("linha-tech-alternativa");
  } else if (row._tem_substituicao) {
    classes.push("linha-subst");
  } else if (row._alerta) {
    classes.push("linha-alerta");
  }

  return classes.join(" ");
}

function renderCelulaSubst(row) {
  const opcoes = row._opcoes_carro || [];
  const chave = row._chave_servico;
  const escolhido = state.escolhasCarro.get(chave) || row.carro_saida;

  if (row._escolha_pendente && opcoes.length) {
    return opcoes.map((op) => {
      const ativo = op.prefixo === escolhido ? " ativo" : "";
      const titulo = [op.tecnologia, op.fila].filter(Boolean).join(" · ");
      return `<button type="button" class="btn-opcao-carro${ativo}" data-chave="${escHtml(chave)}" data-prefixo="${escHtml(op.prefixo)}" title="${escHtml(titulo)}">${escHtml(op.prefixo)}</button>`;
    }).join("");
  }

  const valor = row.subst || row.carro_saida || "";
  return valor ? escHtml(valor) : "";
}

function renderCelulaAlerta(row) {
  const alerta = row._alerta || "";
  const chave = row._chave_servico;
  const pendente = row._aceite_pendente && !state.aceites.has(chave);
  let html = alerta ? escHtml(alerta) : "";

  if (pendente) {
    html += `${html ? " " : ""}<button type="button" class="btn-aceitar" data-chave="${escHtml(chave)}">Aceitar</button>`;
  } else if (row._aceite_pendente && state.aceites.has(chave)) {
    html += `${html ? " " : ""}<span class="aceite-ok">Aceito</span>`;
  }

  return html;
}

function contarPorTurno(linhas) {
  const map = {};
  linhas.forEach((row) => {
    const turno = pickCampo(row, ["turno"]) || "—";
    map[turno] = (map[turno] || 0) + 1;
  });
  return map;
}

function atualizarResumo() {
  const el = document.getElementById("escalaResumo");
  if (!el) return;
  const total = state.processado.length;
  const comSubst = state.processado.filter((r) => r._tem_substituicao).length;
  const pedidos = state.processado.filter((r) => r._tem_pedido).length;
  const alertas = state.processado.filter((r) => r._alerta).length;
  const aceitesPendentes = state.processado.filter(
    (r) => r._aceite_pendente && !state.aceites.has(r._chave_servico)
  ).length;
  const escolhasPendentes = state.processado.filter((r) => r._escolha_pendente).length;
  const turnos = contarPorTurno(state.processado);
  const turnoHtml = Object.entries(turnos)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([nome, qtd]) => `<span><b>${qtd}</b> ${escHtml(nome)}</span>`)
    .join("");
  el.innerHTML = `
    <span><b>${total}</b> serviços (${HORA_INICIO_MIN}–${HORA_INICIO_MAX})</span>
    ${turnoHtml}
    <span><b>${pedidos}</b> pedidos</span>
    <span><b>${comSubst}</b> com substituição</span>
    <span><b>${alertas}</b> com alerta</span>
    <span><b>${aceitesPendentes}</b> aguardando aceite</span>
    <span><b>${escolhasPendentes}</b> aguardando escolha</span>
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

  head.innerHTML = `<tr>${state.colunas.map((c) => {
    const title = c.titulo ? ` title="${escHtml(c.titulo)}"` : "";
    return `<th${title}>${c.rotulo}</th>`;
  }).join("")}</tr>`;

  body.innerHTML = state.processado.map((row) => {
    const cls = classesLinha(row);
    const cells = state.colunas.map((col) => {
      if (col.tipo === "obs") {
        const texto = formatarObs(row);
        return `<td class="col-obs">${texto ? escHtml(texto) : ""}</td>`;
      }
      if (col.tipo === "alerta") {
        return `<td class="col-alerta">${renderCelulaAlerta(row)}</td>`;
      }
      if (col.chave === "subst") {
        const html = renderCelulaSubst(row);
        const clsExtra = row._tem_substituicao || row._escolha_pendente ? " celula-subst" : "";
        return `<td class="col-subst${clsExtra}">${html}</td>`;
      }
      const valor = valorColuna(row, col);
      let clsExtra = col.tipo === "hora" || pareceHora(valor) ? " col-hora" : "";
      if (col.chave === "f_carro" && row._f_carro_atrasado && valor) {
        clsExtra += " celula-recolhimento-atrasado";
      }
      return `<td class="${clsExtra.trim()}" title="${escHtml(valor)}">${valor || ""}</td>`;
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

async function carregarPlanilha() {
  if (state.carregando) return;
  state.carregando = true;
  setStatus("Carregando planilha…", "loading");
  window.portalMostrarCarregando?.("Carregando planilha");
  const btn = document.getElementById("btnImportar");
  if (btn) btn.disabled = true;

  try {
    const data = state.data || hojeIso();
    const { json, origem, aviso } = await carregarEscalaSaidaPlanilha(data);

    const linhas = Array.isArray(json.dados) ? json.dados : [];
    const filtradas = ordenarPorInicio(filtrarHorarioInicio(linhas));
    state.bruto = filtradas;
    state.colunas = COLUNAS_PLANILHA;
    state.aceites = new Set();
    state.escolhasCarro = new Map();
    state.processado = processarEscala(filtradas);

    atualizarResumo();
    renderTabela();
    const origemLabel = origem === "json" ? "cache JSON" : origem === "liberacao" ? "API liberação" : "API escalação";
    if (filtradas.length) {
      const extra = aviso ? ` — ${aviso}` : "";
      setStatus(`${filtradas.length} linha(s) via ${origemLabel} — INÍCIO ${HORA_INICIO_MIN}–${HORA_INICIO_MAX}, ordem cronológica.${extra}`, aviso ? "warn" : "ok");
    } else if (aviso) {
      setStatus(aviso, "warn");
    } else if (planilhaPareceSemCabecalho(json.colunas)) {
      setStatus(
        "Nenhuma linha importada. Reimplante scripts/escala-saida-carros.gs (v3) no Apps Script da escalação.",
        "warn"
      );
    } else {
      setStatus(`Nenhuma linha para ${data} (${origemLabel}).`, "warn");
    }
  } catch (err) {
    setStatus(err.message || "Erro ao importar.", "erro");
  } finally {
    state.carregando = false;
    if (btn) btn.disabled = false;
    window.portalOcultarCarregando?.();
  }
}

function reprocessarPatio() {
  if (!state.bruto.length) return;
  state.bruto = ordenarPorInicio(state.bruto);
  state.processado = processarEscala(state.bruto);
  atualizarResumo();
  renderTabela();
  setStatus("Escala reprocessada com o pátio atual.", "ok");
}

function exportarCsv() {
  if (!state.processado.length) return;
  const header = state.colunas.map((c) => c.rotulo);
  const linhas = state.processado.map((row) =>
    state.colunas.map((col) => {
      const v = String(valorColuna(row, col) ?? "");
      return `"${v.replace(/"/g, '""')}"`;
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
    const btnAceitar = ev.target.closest(".btn-aceitar");
    if (btnAceitar?.dataset.chave) {
      state.aceites.add(btnAceitar.dataset.chave);
      atualizarResumo();
      renderTabela();
      return;
    }

    const btnOpcao = ev.target.closest(".btn-opcao-carro");
    if (!btnOpcao?.dataset.chave || !btnOpcao.dataset.prefixo) return;
    state.escolhasCarro.set(btnOpcao.dataset.chave, btnOpcao.dataset.prefixo);
    reprocessarPatio();
  });

  atualizarResumo();
  renderTabela();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
