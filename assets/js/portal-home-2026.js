(function () {
  if (!document.documentElement.classList.contains("portal-home-2026")) return;
  var homeCss = document.querySelector('link[href*="portal-home-2026.css"]');
  if (homeCss) document.head.appendChild(homeCss);

  function primeiroNome() {
    var el = document.getElementById("heroNomeUsuario");
    var t = el ? String(el.textContent || "").trim() : "";
    if (t && t.toLowerCase() !== "usuário" && t.toLowerCase() !== "usuario") return t;
    var u = window.portalUsuario && window.portalUsuario.nome;
    return String(u || "Odair").split(/\s+/)[0];
  }

  function ola() {
    var s = document.getElementById("heroSaudacao");
    var n = document.getElementById("heroNomeUsuario");
    if (s) s.textContent = "Olá,";
    if (n) n.textContent = primeiroNome();
  }

  function marcarNav(alvo) {
    document.querySelectorAll(".home-nav-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-home-nav") === alvo);
    });
  }

  function mostrarTodos() {
    document.querySelectorAll(".card-section").forEach(function (sec) {
      sec.hidden = false;
    });
    document.querySelectorAll(".portal-aba").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-alvo") === "todos" ? "true" : "false");
    });
    marcarNav("inicio");
  }

  function clicarAba(id) {
    var aba = document.querySelector('.portal-aba[data-alvo="' + id + '"]');
    if (aba) aba.click();
    marcarNav(id);
  }

  function montarNav() {
    var side = document.getElementById("sidebar");
    if (!side || side.querySelector(".home-nav")) return;
    var brand = document.createElement("div");
    brand.className = "home-brand";
    brand.innerHTML =
      '<img class="portal-brand-art" src="assets/img/logomarca-portalciop-tcgl-claro.png?v=20261022logo" alt="">' +
      '<span class="home-brand-copy"><b>Portal CIOP</b><small>TCGL · Operações</small></span>';
    var nav = document.createElement("nav");
    nav.className = "home-nav";
    nav.setAttribute("aria-label", "Áreas do portal");
    nav.innerHTML =
      '<button type="button" class="home-nav-btn is-active" data-home-nav="inicio">Início</button>' +
      '<button type="button" class="home-nav-btn" data-home-nav="secaoOperacao">Operação</button>' +
      '<button type="button" class="home-nav-btn" data-home-nav="secaoDashboards">Monitoramento</button>' +
      '<button type="button" class="home-nav-btn" data-home-nav="secaoRelatorios">Relatórios</button>' +
      '<a class="home-nav-btn" data-home-nav="admin" href="pages/admin-usuarios.html">Administração</a>';
    side.insertBefore(nav, side.firstChild);
    side.insertBefore(brand, nav);
    nav.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-home-nav]");
      if (!btn || btn.tagName === "A") return;
      var alvo = btn.getAttribute("data-home-nav");
      if (alvo === "inicio") mostrarTodos();
      else clicarAba(alvo);
    });
  }

  function montarAtalhos() {
    if (document.getElementById("homeQuick")) return;
    var abas = document.getElementById("portalAbas");
    if (!abas || !abas.parentNode) return;
    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="home-quick-head"><h2>Acessos rápidos</h2><button type="button" class="home-personalizar">Personalizar</button></div>' +
      '<section class="home-quick" id="homeQuick">' +
      '<a href="pages/monitoramento.html"><strong>Monitoramento</strong><span>Acompanhe a operação</span></a>' +
      '<a href="pages/Folhadeservico1.html"><strong>Lançar serviço</strong><span>Registre um novo serviço</span></a>' +
      '<a href="pages/liberacao-lancamento.html"><strong>Liberação</strong><span>Acompanhe as liberações</span></a>' +
      '<a href="pages/criar-relatorio.html"><strong>Criar relatório</strong><span>Gere relatórios operacionais</span></a>' +
      "</section>" +
      '<div class="home-mods-head"><h2>Módulos da operação</h2></div>';
    abas.parentNode.insertBefore(wrap, abas);
  }

  function montarAbaTodos() {
    var list = document.getElementById("portalAbas");
    if (!list || list.querySelector('[data-alvo="todos"]')) return;
    var dash = list.querySelector('[data-alvo="secaoDashboards"]');
    if (dash) dash.textContent = "Monitoramento";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "portal-aba";
    btn.setAttribute("role", "tab");
    btn.setAttribute("data-alvo", "todos");
    btn.setAttribute("aria-selected", "false");
    btn.textContent = "Todos";
    var ind = list.querySelector(".portal-aba-indicador");
    if (ind && ind.nextSibling) list.insertBefore(btn, ind.nextSibling);
    else list.insertBefore(btn, list.firstChild);
    btn.addEventListener("click", mostrarTodos);
  }

  function lead() {
    var copy = document.querySelector(".hero-pro-copy");
    if (!copy || copy.querySelector(".home-lead")) return;
    var p = document.createElement("p");
    p.className = "home-lead";
    p.textContent = "Sua operação em um só lugar.";
    copy.appendChild(p);
  }

  function kpiLabels() {
    var map = { ciopKpiModulos: "Módulos disponíveis", ciopKpiUsuarios: "Ativos agora", ciopKpiAvisos: "Avisos" };
    Object.keys(map).forEach(function (id) {
      var num = document.getElementById(id);
      var kpi = num && num.closest(".ciop-kpi");
      var lab = kpi && kpi.querySelector(".ciop-kpi-label");
      if (lab) lab.textContent = map[id];
    });
  }

  function iniciar() {
    montarNav();
    lead();
    montarAtalhos();
    montarAbaTodos();
    kpiLabels();
    ola();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
  window.addEventListener("portal:usuario-validado", ola);
  setTimeout(ola, 600);
  setTimeout(ola, 1600);
})();
