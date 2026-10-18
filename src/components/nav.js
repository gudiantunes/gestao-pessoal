import { state } from "../state.js";
import { esc, HUES, LS, TEMPLATES } from "../utils.js";

export function renderNavigation() {
  const nav = document.querySelector("#nav");
  if (!nav) return;
  nav.innerHTML = '<button class="chip' + (state.currentView === "home" ? " on" : "") + '" data-act="home"><span>Início</span></button>' +
    (state.tools || []).map((tool) => '<button class="chip' + (state.currentView === tool.id ? " on" : "") + '" data-act="open" data-id="' + esc(tool.id) + '" style="--h:' + HUES[tool.hue || 0] + '"><i class="ico">' + esc(tool.icon || "📋") + '</i><span>' + esc(tool.name) + "</span></button>").join("") +
    '<button class="chip add" data-act="newtool" aria-label="Nova ferramenta">+</button>';
}

export function renderHome() {
  const main = document.querySelector("#main");
  if (!main) return;
  state.sig = null;
  const tools = state.tools;
  if (tools == null) {
    main.innerHTML = '<p class="muted pad">Carregando…</p>';
    return;
  }
  if (!tools.length) {
    main.innerHTML = '<section class="home"><h1 class="h">Comece pela sua primeira ferramenta</h1>' +
      '<p class="sub">Cada ferramenta é uma planilha com abas e colunas que você define. Escolha um modelo pronto ou comece em branco. Dá para mudar tudo depois.</p>' +
      '<div class="tplcards">' + TEMPLATES.map((template) => '<button class="tplcard" data-act="tpl" data-key="' + template.key + '" style="--h:' + HUES[template.hue] + '"><i class="ico lg">' + template.icon + '</i><b>' + esc(template.name) + '</b><small>' + esc(template.desc) + "</small></button>").join("") + "</div></section>";
    return;
  }
  main.innerHTML = '<section class="home"><h1 class="h">Suas ferramentas</h1><p class="sub">Toque em uma para abrir. Para criar outra, use o botão com o sinal de mais.</p><div class="tiles">' +
    tools.map((tool) => '<button class="tile" data-act="open" data-id="' + esc(tool.id) + '" style="--h:' + HUES[tool.hue || 0] + '"><i class="ico lg">' + esc(tool.icon || "📋") + '</i><b>' + esc(tool.name) + '</b><small>' + (tool.tabs || []).length + ((tool.tabs || []).length === 1 ? " aba" : " abas") + "</small></button>").join("") +
    '<button class="tile new" data-act="newtool"><span class="plus">+</span><b>Nova ferramenta</b></button></div></section>';
}

export function currentTab(tool) {
  const tabs = tool.tabs || [];
  const savedId = LS.get("mp.tab." + tool.id);
  return tabs.find((tab) => tab.id === savedId) || tabs[0] || { id: "none", name: "", cols: [] };
}

export function shellSignature(tool) {
  return [tool.id, state.isMobile, tool.name, tool.icon, tool.hue, (tool.tabs || []).map((tab) => tab.id + ":" + tab.name).join(","), currentTab(tool).id].join("|");
}

export function renderToolShell(tool) {
  const main = document.querySelector("#main");
  if (!main) return;
  const tab = currentTab(tool);
  const homeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';
  const dotsIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  main.innerHTML = '<div class="toolhead" style="--h:' + HUES[tool.hue || 0] + '"><i class="ico lg">' + esc(tool.icon || "📋") + '</i><h1>' + esc(tool.name) + '</h1><button class="ghost" data-act="toolset" aria-label="Ajustes da ferramenta">' + dotsIcon + "</button></div>" +
    '<div class="tabs" role="tablist">' + (tool.tabs || []).map((item) => '<button class="tab' + (item.id === tab.id ? " on" : "") + '" role="tab" data-act="tab" data-id="' + esc(item.id) + '">' + esc(item.name) + "</button>" + (item.id === tab.id ? '<button class="tabgear" data-act="tabset" aria-label="Ajustes da aba">' + dotsIcon + "</button>" : "")).join("") +
    '<button class="tab add" data-act="newtab">+ Aba</button></div>' +
    '<div class="bar"><label class="search"><input id="q" type="search" placeholder="Buscar nesta aba" value="' + esc(state.searchQuery) + '" autocomplete="off"></label><button class="btn" data-act="cols">Colunas</button><button class="btn pri desk" data-act="addrow">+ Nova linha</button></div>' +
    '<div id="sum"></div><div id="grid"></div><button class="fab" data-act="addrow" aria-label="Novo registro">+</button>';
}