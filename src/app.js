import { state } from './state.js';
import { createStore } from './store.js';
import {
  currentTab,
  renderHome,
  renderNavigation,
  renderToolShell,
  shellSignature,
} from './components/nav.js';
import { readCellInput, renderGrid, sortedColumn } from './components/grid.js';
import {
  closeModal,
  createTemplateTool,
  handleModalAction,
  handleModalChange,
  handleModalInput,
  handleModalSubmit,
  openColumnsModal,
  openNewTabModal,
  openNewToolModal,
  openRowModal,
  openTabSettings,
  openToolSettings,
} from './components/modals.js';
import { clone, fmtNum, fmtRaw, LS, todayISO, uid } from './utils.js';
import { detachLinkedRows, syncLinkedRows } from './links/engine.js';
import {
  handleLinkAction,
  handleLinkChange,
  renderLinksPage,
} from './links/links_editor.js';
import './style.css';

let unsubscribeRows = null;
let deferLinkRender = false;
const main = document.querySelector('#main');
const layer = document.querySelector('#layer');
const mediaQuery = window.matchMedia('(max-width: 720px)');

function toast(message, action) {
  const element = document.querySelector('#toast');
  if (!element) return;
  element.innerHTML =
    '<span>' +
    message +
    '</span>' +
    (action
      ? '<button type="button" id="toastbtn">' + action.label + '</button>'
      : '');
  element.classList.add('on');
  const button = document.querySelector('#toastbtn');
  if (button) {
    button.onclick = () => {
      element.classList.remove('on');
      action.fn();
    };
  }
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => element.classList.remove('on'),
    action ? 7000 : 3500,
  );
}

async function safe(task) {
  try {
    await task();
    return true;
  } catch (error) {
    console.error(error);
    toast('Não foi possível salvar. Confira a conexão e tente de novo.');
    return false;
  }
}

function currentTool() {
  return (state.tools || []).find((tool) => tool.id === state.currentView);
}

function editingNow() {
  const active = document.activeElement;
  return !!(
    active &&
    main.contains(active) &&
    active.matches &&
    active.matches(
      '.gridwrap input,.gridwrap select,.link-map-entry input,.link-map-entry select',
    )
  );
}

function render() {
  if (deferLinkRender) {
    state.dirty = true;
    return;
  }
  renderNavigation();
  if (editingNow()) {
    state.dirty = true;
    return;
  }
  if (state.currentView === 'home' || state.tools == null) {
    renderHome();
    return;
  }
  if (state.currentView === 'links') {
    state.sig = null;
    main.innerHTML = renderLinksPage(state.tools);
    return;
  }
  const tool = currentTool();
  if (!tool) {
    main.innerHTML = '<p class="muted pad">Carregando…</p>';
    return;
  }
  const signature = shellSignature(tool);
  if (signature !== state.sig) {
    renderToolShell(tool);
    state.sig = signature;
  }
  renderGrid();
}

function setView(view) {
  state.currentView = view;
  state.searchQuery = '';
  state.sig = null;
  state.rows = null;
  state.dirty = false;
  LS.set('mp.view', view);
  if (unsubscribeRows) {
    unsubscribeRows();
    unsubscribeRows = null;
  }
  if (view !== 'home' && view !== 'links') {
    unsubscribeRows = state.store.watchRows(view, (rows) => {
      if (state.currentView === view) {
        state.rows = rows;
        render();
      }
    });
  }
  render();
  document.querySelector('.chip.on')?.scrollIntoView?.({
    inline: 'center',
    block: 'nearest',
  });
  window.scrollTo(0, 0);
}

async function addRow() {
  const tool = currentTool();
  if (!tool) return;
  const tab = currentTab(tool);
  if (!tab.cols.length) {
    openColumnsModal();
    return;
  }
  if (state.isMobile) {
    openRowModal();
    return;
  }
  const id = uid();
  const cells = {};
  tab.cols.forEach((column) => {
    if (column.type === 'date') cells[column.id] = todayISO();
  });
  state.focusRow = id;
  const saved = await safe(() =>
    state.store.setRow(tool.id, id, { tab: tab.id, ord: Date.now(), cells }),
  );
  if (saved) {
    await safe(() =>
      syncLinkedRows(state.store, state.tools, tool.id, tab.id, id, cells),
    );
  }
}

async function deleteRow(id) {
  const tool = currentTool();
  if (!tool || !state.rows) return;
  const row = state.rows.find((item) => item.id === id);
  if (!row) return;
  const backup = clone(row);
  delete backup.id;
  await safe(async () => {
    await detachLinkedRows(state.store, state.tools, row.linkedRows || []);
    await state.store.delRow(tool.id, id);
  });
  toast('Registro excluído', {
    label: 'Desfazer',
    fn: () =>
      safe(async () => {
        await state.store.setRow(tool.id, id, backup);
        await syncLinkedRows(
          state.store,
          state.tools,
          tool.id,
          backup.tab,
          id,
          backup.cells || {},
          backup.linkedRows || [],
        );
      }),
  });
}

function confirmDelete(button, label) {
  if (!state.modal.armed) {
    state.modal.armed = true;
    button.textContent = 'Toque de novo para excluir';
    setTimeout(() => {
      if (state.modal && button.isConnected) {
        state.modal.armed = false;
        button.textContent = label;
      }
    }, 4000);
    return false;
  }
  return true;
}

function deleteTool(button) {
  const tool = currentTool();
  if (!tool || !state.modal || !confirmDelete(button, 'Excluir ferramenta')) {
    return;
  }
  const sourceRows = clone(state.rows || []);
  const tools = state.tools || [];
  closeModal();
  setView('home');
  safe(async () => {
    for (const row of sourceRows) {
      await detachLinkedRows(state.store, tools, row.linkedRows || []);
    }
    await state.store.delTool(tool.id);
  }).then(() => toast('Ferramenta excluída'));
}

function deleteTab(button) {
  const tool = currentTool();
  if (!tool || !state.modal || !confirmDelete(button, 'Excluir aba')) return;
  const tab = currentTab(tool);
  const deletedRows = (state.rows || []).filter((row) => row.tab === tab.id);
  const rowIds = deletedRows.map((row) => row.id);
  const tabs = tool.tabs.filter((item) => item.id !== tab.id);
  closeModal();
  safe(async () => {
    for (const row of deletedRows) {
      await detachLinkedRows(
        state.store,
        state.tools || [],
        row.linkedRows || [],
      );
    }
    await state.store.patchTool(tool.id, { tabs: clone(tabs) });
    for (const id of rowIds) await state.store.delRow(tool.id, id);
  }).then(() => toast('Aba excluída'));
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-act]');
  if (
    !button ||
    (button.classList.contains('scrim') && event.target !== button)
  ) {
    return;
  }
  const action = button.dataset.act;
  const tool = currentTool();

  if (handleModalAction(action, button)) return;
  if (action.startsWith('link-')) {
    deferLinkRender = true;
    let handled;
    try {
      handled = await handleLinkAction(action, button, {
        safe,
        store: state.store,
        tools: state.tools || [],
      });
    } finally {
      deferLinkRender = false;
    }
    if (handled) {
      state.dirty = false;
      render();
      return;
    }
  }
  switch (action) {
    case 'home':
      setView('home');
      break;
    case 'links':
      setView('links');
      break;
    case 'open':
      setView(button.dataset.id);
      break;
    case 'newtool':
      openNewToolModal();
      break;
    case 'tpl':
      createTemplateTool(button.dataset.key, { safe, setView });
      break;
    case 'toolset':
      openToolSettings();
      break;
    case 'newtab':
      openNewTabModal();
      break;
    case 'tab':
      if (!tool) break;
      LS.set('mp.tab.' + tool.id, button.dataset.id);
      state.searchQuery = '';
      state.sig = null;
      render();
      break;
    case 'tabset':
      openTabSettings();
      break;
    case 'cols':
      openColumnsModal();
      break;
    case 'addrow':
      addRow();
      break;
    case 'editrow':
      openRowModal(button.dataset.id);
      break;
    case 'delrow':
      deleteRow(button.dataset.id);
      break;
    case 'sort':
      if (tool) {
        sortedColumn(currentTab(tool).id, button.dataset.col);
        renderGrid();
      }
      break;
    case 'close':
      closeModal();
      break;
    case 'deltool':
      deleteTool(button);
      break;
    case 'deltab':
      deleteTab(button);
      break;
    case 'delrowform': {
      const id = state.modal?.rowId;
      closeModal();
      if (id) deleteRow(id);
      break;
    }
  }
});

layer.addEventListener('change', handleModalChange);
layer.addEventListener('input', handleModalInput);
layer.addEventListener('submit', (event) =>
  handleModalSubmit(event, { safe, setView }),
);

main.addEventListener('change', async (event) => {
  if (event.target.dataset.linkId) {
    deferLinkRender = true;
    try {
      await handleLinkChange(event, {
        safe,
        store: state.store,
        tools: state.tools || [],
      });
    } finally {
      deferLinkRender = false;
      state.dirty = false;
      render();
    }
    return;
  }
  const element = event.target;
  const rowElement = element.closest && element.closest('tr[data-id]');
  if (!rowElement || !element.dataset.col) return;
  const tool = currentTool();
  if (!tool) return;
  const column = currentTab(tool).cols.find(
    (item) => item.id === element.dataset.col,
  );
  if (!column) return;
  const value = readCellInput(column, element);
  const rowId = rowElement.dataset.id;
  const row = (state.rows || []).find((item) => item.id === rowId);
  const cells = Object.assign({}, row?.cells || {}, { [column.id]: value });
  const saved = await safe(() =>
    state.store.patchCells(tool.id, rowId, {
      [column.id]: value,
    }),
  );
  if (saved && row) {
    await safe(() =>
      syncLinkedRows(
        state.store,
        state.tools,
        tool.id,
        currentTab(tool).id,
        rowId,
        cells,
        row.linkedRows || [],
      ),
    );
  }
  if (
    ['number', 'money'].includes(column.type) &&
    document.activeElement !== element
  ) {
    element.value = fmtNum(column.type, value);
  }
});

main.addEventListener('focusin', (event) => {
  const element = event.target;
  if (!element.dataset?.t) return;
  const rowElement = element.closest('tr[data-id]');
  const tool = currentTool();
  if (!rowElement || !tool || !state.rows) return;
  const row = state.rows.find((item) => item.id === rowElement.dataset.id);
  const column = currentTab(tool).cols.find(
    (item) => item.id === element.dataset.col,
  );
  if (!row || !column) return;
  element.value = fmtRaw(row.cells ? row.cells[column.id] : null);
  element.select();
});

main.addEventListener('focusout', () => {
  setTimeout(() => {
    if (state.dirty && !editingNow()) {
      state.dirty = false;
      render();
    }
  }, 0);
});

main.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const element = event.target;
  if (!element.dataset?.col || element.tagName === 'SELECT') return;
  const rowElement = element.closest('tr[data-id]');
  if (!rowElement) return;
  event.preventDefault();
  const nextRow = rowElement.nextElementSibling;
  const columnId = element.dataset.col;
  element.blur();
  nextRow?.querySelector('[data-col="' + CSS.escape(columnId) + '"]')?.focus();
});

main.addEventListener('input', (event) => {
  if (event.target.id === 'q') {
    state.searchQuery = event.target.value;
    renderGrid();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && layer.firstChild) closeModal();
});

mediaQuery.addEventListener('change', () => {
  state.isMobile = mediaQuery.matches;
  state.sig = null;
  render();
});

function init() {
  state.store = createStore(window.db || null, toast);
  const sync = document.querySelector('#sync');
  sync.dataset.k = state.store.kind;
  sync.textContent =
    state.store.kind === 'cloud' ? 'Sincronizado' : 'Só neste aparelho';
  state.store.watchTools((tools) => {
    tools.sort((left, right) => (left.ord || 0) - (right.ord || 0));
    tools.forEach((tool) => {
      tool.tabs = tool.tabs || [];
      state.known.add(tool.id);
    });
    state.tools = tools;
    if (!state.initialized) {
      state.initialized = true;
      const savedView = LS.get('mp.view');
      if (
        savedView === 'links' ||
        (savedView && tools.some((tool) => tool.id === savedView))
      ) {
        setView(savedView);
        return;
      }
    }
    if (
      state.currentView !== 'home' &&
      state.currentView !== 'links' &&
      !tools.some((tool) => tool.id === state.currentView) &&
      state.known.has(state.currentView)
    ) {
      setView('home');
      return;
    }
    render();
  });
}

render();
init();
