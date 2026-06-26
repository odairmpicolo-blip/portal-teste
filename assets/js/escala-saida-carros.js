import { carregarEscalaSaidaPlanilha, planilhaPareceSemCabecalho } from "./escala-saida-dados-leitura.js";
import {
  avaliarSaidaVeiculo,
  carregarPatio,
  ehPedido,
  ehFilaNaoUtilizavelEscala,
  formatarPosicaoPatio,
  listarCandidatosSubstituto,
  localizarVeiculo,
  mesmaCorVeiculo,
  obterOrdemFilaSaida,
  obterNomeFila,
  obterPerfilTecnologia,
  obterTecnologia,
  normalizarTecnologia,
  ORDEM_MAXIMA_FILAS_SEQUENCIAIS
} from "./patio-core.js";

const HORA_INICIO_SAIDA = "04:10";
const HORA_LIMITE_RECOLHIMENTO_PEDIDO = "10:40";
const HORA_LIMITE_RECOLHIMENTO_SUPER_BUS = "15:00";
const LINHAS_SUPER_BUS = new Set(["800", "801", "802", "803", "806", "913"]);

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
  { chave: "f_carro", rotulo: "F. CARRO", alias: ["f_carro", "f_carro_"], tipo: "hora", titulo: "Fim do carro (HH:MM) — horário de recolhimento" },
  { chave: "tecnologia", rotulo: "TECNOLOGIA" },
  { chave: "obs", rotulo: "OBS", tipo: "obs" },
  { chave: "alerta", rotulo: "ALERTA", tipo: "alerta" }
];

const state = {
  data: "",
  colunas: COLUNAS_PLANILHA,
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
    pickCampo(row, ["work_id", "work-id", "serv"]),
    pickCampo(row, ["horario_de_inicio", "horario_inicio", "inicio"]),
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

function aPartirDoHorario(horario, limite) {
  const mins = horaParaMinutos(horario);
  const lim = horaParaMinutos(limite);
  if (mins == null || lim == null) return true;
  return mins >= lim;
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

function formatarObs(row) {
  const partes = [];
  if (row.carro_saida && row.carro_saida !== valorColuna(row, { chave: "carro", alias: ["carro", "carro_escalado"] })) {
    partes.push(`Saída: ${row.carro_saida}`);
  }
  if (row.obs_escala) partes.push(row.obs_escala);
  return partes.join(" · ");
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

function calcularOrdemFilaMaxima(indice, total) {
  const maxOrdem = ORDEM_MAXIMA_FILAS_SEQUENCIAIS;
  if (total <= 0) return maxOrdem;
  return Math.min(maxOrdem, Math.max(1, Math.ceil(((indice + 1) / total) * maxOrdem)));
}

function situacaoCarroEscalado(prefixo, patio, ordemFilaMax) {
  if (!prefixo) return { tipo: "vazio" };

  const saida = avaliarSaidaVeiculo(prefixo, patio);
  const loc = localizarVeiculo(prefixo, patio);

  if (saida.ok) {
    const ordem = obterOrdemFilaSaida(saida.loc.filaKey);
    if (ordemFilaMax != null && ordem > ordemFilaMax) {
      return {
        tipo: "aguardando",
        prefixo,
        motivo: `Horário inicial exige fila 1 ou livre — escalado em ${obterNomeFila(saida.loc.filaKey)}.`,
        loc: saida.loc
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

function extrairFimCarro(row) {
  return formatarHoraHHMM(pickCampo(row, ["f_carro", "f_carro_"]));
}

function recolhimentoAposLimite(horaFimCarro, limite) {
  if (!horaFimCarro) return false;
  return !dentroDoLimite(horaFimCarro, limite);
}

function aplicarAlertasRecolhimentoPedido(carro, horaFimCarro, patio, alertas) {
  if (!carro || !ehPedido(carro, patio)) return;
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

function opcoesSubstitutoBase(ctx, carroEscalado, linhaNorm) {
  const { usados, escaladosReservados } = ctx;
  return {
    usados,
    excluir: [...escaladosReservados, carroEscalado].filter(Boolean),
    filtroCarro: (prefixo) => validarSuperBusLinha(prefixo, linhaNorm, frota).ok
  };
}

function montarAlertaTroca(tipo, carroEscalado, substituto, frotaRef) {
  const perfilEsc = obterPerfilTecnologia(carroEscalado, frotaRef);
  const perfilSub = obterPerfilTecnologia(substituto, frotaRef);
  if (tipo === "cor") {
    return `Sugestão: troca de cor — escalado ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
  }
  if (tipo === "tecnologia") {
    return `Sugestão: troca de tecnologia — escalado ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
  }
  return `Sugestão: troca de cor/tecnologia — escalado ${perfilEsc.rotulo || carroEscalado}, saída ${substituto} (${perfilSub.rotulo})`;
}

function buscarSubstitutoInterno(row, patio, ctx, carroEscalado, linhaNorm, ordemMax) {
  const perfilEsc = obterPerfilTecnologia(carroEscalado, frota);
  const base = { ...opcoesSubstitutoBase(ctx, carroEscalado, linhaNorm), ordemMax };

  const candidatosExatos = listarCandidatosSubstituto(perfilEsc.completo, patio, frota, base);
  if (candidatosExatos.length) {
    return { candidato: candidatosExatos[0], mudancaTecnologia: false, mudancaCor: false };
  }

  if (perfilEsc.cor) {
    const mesmaCorMesmoResto = listarCandidatosSubstituto("", patio, frota, {
      ...base,
      incluirOutrasTecnologias: true,
      filtroPrefixo: (prefixo) => {
        const perfil = obterPerfilTecnologia(prefixo, frota);
        return perfil.cor === perfilEsc.cor && perfil.resto === perfilEsc.resto;
      }
    });
    if (mesmaCorMesmoResto.length) {
      return { candidato: mesmaCorMesmoResto[0], mudancaTecnologia: false, mudancaCor: false };
    }

    const mesmaCorTechDiferente = listarCandidatosSubstituto("", patio, frota, {
      ...base,
      incluirOutrasTecnologias: true,
      filtroPrefixo: (prefixo) => {
        const perfil = obterPerfilTecnologia(prefixo, frota);
        return perfil.cor === perfilEsc.cor && perfil.resto !== perfilEsc.resto;
      }
    });
    if (mesmaCorTechDiferente.length) {
      return {
        candidato: mesmaCorTechDiferente[0],
        mudancaTecnologia: true,
        mudancaCor: false,
        tipoTroca: "tecnologia"
      };
    }
  }

  if (perfilEsc.cor && perfilEsc.resto) {
    const mesmaTechCorDiferente = listarCandidatosSubstituto("", patio, frota, {
      ...base,
      incluirOutrasTecnologias: true,
      filtroPrefixo: (prefixo) => {
        const perfil = obterPerfilTecnologia(prefixo, frota);
        return perfil.resto === perfilEsc.resto && perfil.cor && perfil.cor !== perfilEsc.cor;
      }
    });
    if (mesmaTechCorDiferente.length) {
      return {
        candidato: mesmaTechCorDiferente[0],
        mudancaTecnologia: false,
        mudancaCor: true,
        tipoTroca: "cor"
      };
    }
  }

  const alternativos = listarCandidatosSubstituto(perfilEsc.completo, patio, frota, {
    ...base,
    incluirOutrasTecnologias: true
  }).filter((c) => !c.mesmaTecnologia);

  if (alternativos.length) {
    const cand = alternativos[0];
    const mudancaCor = perfilEsc.cor ? !mesmaCorVeiculo(carroEscalado, cand.prefixo, frota) : false;
    return {
      candidato: cand,
      mudancaTecnologia: true,
      mudancaCor,
      tipoTroca: mudancaCor ? "tecnologia_cor" : "tecnologia"
    };
  }

  return null;
}

function buscarSubstituto(row, patio, ctx, carroEscalado, linhaNorm) {
  const { ordemFilaMax } = ctx;
  let resultado = buscarSubstitutoInterno(row, patio, ctx, carroEscalado, linhaNorm, ordemFilaMax);

  if (!resultado && ordemFilaMax != null) {
    resultado = buscarSubstitutoInterno(row, patio, ctx, carroEscalado, linhaNorm, null);
    if (resultado) {
      resultado.foraOrdemFila = true;
    }
  }

  return resultado;
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
  let subst = pickCampo(row, ["subst"]);
  let obsEscala = pickCampo(row, ["observacoes", "obs", "observacao"]);
  let tecnologiaExibicao = tecnologia;

  const temPedido = Boolean(carroEscalado && ehPedido(carroEscalado, patio));
  const fCarroAtrasadoPedido = temPedido && recolhimentoAposLimite(fCarroHora, HORA_LIMITE_RECOLHIMENTO_PEDIDO);
  const fCarroAtrasadoSuperBus = recolhimentoAposLimite(fCarroHora, HORA_LIMITE_RECOLHIMENTO_SUPER_BUS);

  aplicarAlertasRecolhimentoPedido(carroEscalado, fCarroHora, patio, alertas);

  const sitEscalado = situacaoCarroEscalado(carroEscalado, patio, ctx.ordemFilaMax);

  if (carroEscalado && !usados.has(carroEscalado)) {
    if (sitEscalado.tipo === "ok") {
      carroSaida = carroEscalado;
      obsEscala = formatarPosicaoPatio(sitEscalado.loc);
    } else if (sitEscalado.tipo === "aguardando") {
      alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
    } else if (sitEscalado.motivo) {
      alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
    }
  } else if (carroEscalado && usados.has(carroEscalado)) {
    alertas.push(`Escalado ${carroEscalado} já alocado em outro serviço.`);
  }

  if (!carroSaida) {
    const resultado = buscarSubstituto(row, patio, ctx, carroEscalado, linhaNorm);

    if (resultado) {
      const sub = resultado.candidato;
      carroSaida = sub.prefixo;
      subst = carroEscalado;
      obsEscala = formatarPosicaoPatio(sub.loc);
      const techSaida = obterTecnologia(carroSaida, frota);
      const perfilEsc = obterPerfilTecnologia(carroEscalado, frota);
      const perfilSaida = obterPerfilTecnologia(carroSaida, frota);

      if (resultado.mudancaCor || resultado.mudancaTecnologia) {
        flags.mudancaCor = Boolean(resultado.mudancaCor);
        flags.mudancaTecnologia = Boolean(resultado.mudancaTecnologia);
        flags.aceitePendente = true;
        if (resultado.mudancaCor && !resultado.mudancaTecnologia) {
          tecnologiaExibicao = `${perfilEsc.rotulo || tecnologia} → ${perfilSaida.rotulo || techSaida}`;
          alertas.push(montarAlertaTroca("cor", carroEscalado, carroSaida, frota));
        } else if (resultado.mudancaTecnologia && !resultado.mudancaCor) {
          tecnologiaExibicao = `${perfilEsc.rotulo || tecnologia} → ${perfilSaida.rotulo || techSaida}`;
          alertas.push(montarAlertaTroca("tecnologia", carroEscalado, carroSaida, frota));
        } else {
          tecnologiaExibicao = `${perfilEsc.rotulo || tecnologia} → ${perfilSaida.rotulo || techSaida}`;
          alertas.push(montarAlertaTroca("tecnologia_cor", carroEscalado, carroSaida, frota));
        }
      } else if (perfilEsc.rotulo && perfilSaida.rotulo && perfilEsc.completo !== perfilSaida.completo) {
        tecnologiaExibicao = `${perfilEsc.rotulo} → ${perfilSaida.rotulo}`;
      }

      if (sitEscalado.tipo !== "vazio" && sitEscalado.motivo && sitEscalado.tipo !== "ok") {
        alertas.push(`Escalado ${carroEscalado}: ${sitEscalado.motivo}`);
      }

      if (resultado.foraOrdemFila) {
        alertas.push(
          `Sugestão: carro em fila posterior (${formatarPosicaoPatio(sub.loc)}) — horários iniciais preferem fila 1 ou livre.`
        );
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

  aplicarAlertasSuperBus([carroSaida || carroEscalado], fCarroHora, alertas, flags);

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
    _tem_super_bus: flags.temSuperBus,
    _f_carro_atrasado: fCarroAtrasadoPedido || (flags.temSuperBus && fCarroAtrasadoSuperBus)
  };
}

function processarEscala(linhas) {
  const patio = carregarPatio();
  const total = linhas.length;
  const ctx = {
    usados: new Set(),
    escaladosReservados: montarEscaladosReservados(linhas),
    total
  };
  return linhas.map((row, indice) => {
    const ordemFilaMax = calcularOrdemFilaMaxima(indice, total);
    return processarLinha(row, patio, { ...ctx, indice, ordemFilaMax });
  });
}

function filtrarAPartirHorario(linhas) {
  return linhas.filter((row) => {
    const hora = pickCampo(row, ["horario_de_inicio", "horario_inicio", "inicio_programado", "inicio"]);
    if (!hora) return true;
    return aPartirDoHorario(hora, HORA_INICIO_SAIDA);
  });
}

function ordenarPorInicio(linhas) {
  return [...linhas].sort((a, b) => {
    const ha = horaParaMinutos(pickCampo(a, ["horario_de_inicio", "inicio"])) ?? 9999;
    const hb = horaParaMinutos(pickCampo(b, ["horario_de_inicio", "inicio"])) ?? 9999;
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
  } else if (row._mudanca_cor) {
    classes.push("linha-troca-cor");
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
  const comSubst = state.processado.filter((r) => r.subst).length;
  const pedidos = state.processado.filter((r) => r._tem_pedido).length;
  const alertas = state.processado.filter((r) => r._alerta).length;
  const aceitesPendentes = state.processado.filter(
    (r) => r._aceite_pendente && !state.aceites.has(r._chave_servico)
  ).length;
  const turnos = contarPorTurno(state.processado);
  const turnoHtml = Object.entries(turnos)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([nome, qtd]) => `<span><b>${qtd}</b> ${escHtml(nome)}</span>`)
    .join("");
  el.innerHTML = `
    <span><b>${total}</b> serviços a partir de ${HORA_INICIO_SAIDA}</span>
    ${turnoHtml}
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
  const btn = document.getElementById("btnImportar");
  if (btn) btn.disabled = true;

  try {
    const data = state.data || hojeIso();
    const { json, origem, aviso } = await carregarEscalaSaidaPlanilha(data);

    const linhas = Array.isArray(json.dados) ? json.dados : [];
    const filtradas = ordenarPorInicio(filtrarAPartirHorario(linhas));
    state.bruto = filtradas;
    state.colunas = COLUNAS_PLANILHA;
    state.aceites = new Set();
    state.processado = processarEscala(filtradas);

    atualizarResumo();
    renderTabela();
    const origemLabel = origem === "json" ? "cache JSON" : origem === "liberacao" ? "API liberação" : "API escalação";
    if (filtradas.length) {
      const extra = aviso ? ` — ${aviso}` : "";
      setStatus(`${filtradas.length} linha(s) via ${origemLabel} — início a partir de ${HORA_INICIO_SAIDA}.${extra}`, aviso ? "warn" : "ok");
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
