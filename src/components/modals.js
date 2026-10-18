import { state } from '../state.js';
import { currentTab } from './nav.js';
import {
  clone,
  col,
  esc,
  fmtNum,
  fmtRaw,
  HUES,
  ICONS,
  LS,
  parseNum,
  todayISO,
  TEMPLATES,
  TYPES,
  LABELS,
  uid,
  isNumeric,
} from '../utils.js';
import { readCellInput } from './grid.js';

let columnModel = null;

export function openModal(html, options = {}) {
  const layer = document.querySelector('#layer');
  if (!layer) return;
  layer.innerHTML =
    '<div class="scrim" data-act="close"><div class="sheet' +
    (options.wide ? ' wide' : '') +
    '" role="dialog" aria-modal="true" aria-label="' +
    esc(options.label || '') +
    '">' +
    html +
    '</div></div>';
  document.body.classList.add('lock');
  layer.querySelector('[data-first]')?.focus();
}

export function closeModal() {
  const layer = document.querySelector('#layer');
  if (layer) layer.innerHTML = '';
  document.body.classList.remove('lock');
  state.modal = null;
  columnModel = null;
}

function pickersHTML(icon, hue) {
  return (
    '<div class="field"><span>Ícone</span><div class="icons" id="icons">' +
    ICONS.map(
      (item) =>
        '<button type="button" class="pickb' +
        (item === icon ? ' on' : '') +
        '" data-act="pickicon" data-v="' +
        esc(item) +
        '" aria-label="Ícone ' +
        esc(item) +
        '">' +
        item +
        '</button>',
    ).join('') +
    '</div></div><div class="field"><span>Cor</span><div class="swatches" id="swatches">' +
    HUES.map(
      (value, index) =>
        '<button type="button" class="sw' +
        (index === hue ? ' on' : '') +
        '" data-act="pickhue" data-v="' +
        index +
        '" style="--h:' +
        value +
        '" aria-label="Cor ' +
        (index + 1) +
        '"></button>',
    ).join('') +
    '</div></div>'
  );
}

export function openNewToolModal() {
  state.modal = { icon: '📋', hue: 0, template: 'blank' };
  const templates = TEMPLATES.map(
    (template) =>
      '<label class="tpl"><input type="radio" name="tpl" value="' +
      template.key +
      '"' +
      (template.key === 'blank' ? ' checked' : '') +
      '><span class="tpl-in"><i class="ico" style="--h:' +
      HUES[template.hue] +
      '">' +
      template.icon +
      '</i><b>' +
      esc(template.name) +
      '</b><small>' +
      esc(template.desc) +
      '</small></span></label>',
  ).join('');
  openModal(
    '<form data-form="newtool"><h2>Nova ferramenta</h2><div class="tplgrid">' +
      templates +
      '</div><label class="field"><span>Nome</span><input name="name" data-first autocomplete="off" required value="Em branco"></label>' +
      pickersHTML('📋', 0) +
      '<div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Criar</button></div></form>',
    { label: 'Nova ferramenta' },
  );
}

export function openToolSettings() {
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  if (!tool) return;
  state.modal = { icon: tool.icon || '📋', hue: tool.hue || 0, armed: false };
  openModal(
    '<form data-form="toolset"><h2>Ajustes da ferramenta</h2><label class="field"><span>Nome</span><input name="name" data-first autocomplete="off" required value="' +
      esc(tool.name) +
      '"></label>' +
      pickersHTML(state.modal.icon, state.modal.hue) +
      '<div class="actions"><button type="button" class="btn danger" data-act="deltool">Excluir ferramenta</button><span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',
    { label: 'Ajustes da ferramenta' },
  );
}

export function openNewTabModal() {
  openModal(
    '<form data-form="newtab"><h2>Nova aba</h2><label class="field"><span>Nome da aba</span><input name="name" data-first autocomplete="off" required placeholder="Ex.: Gastos"></label><p class="hint">A aba começa com duas colunas, Item e Valor. Ajuste em “Colunas”.</p><div class="actions"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Criar aba</button></div></form>',
    { label: 'Nova aba' },
  );
}

export function openTabSettings() {
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  if (!tool) return;
  const tab = currentTab(tool);
  state.modal = { armed: false };
  const deleteButton =
    tool.tabs.length > 1
      ? '<button type="button" class="btn danger" data-act="deltab">Excluir aba</button>'
      : '';
  openModal(
    '<form data-form="tabset"><h2>Ajustes da aba</h2><label class="field"><span>Nome da aba</span><input name="name" data-first autocomplete="off" required value="' +
      esc(tab.name) +
      '"></label><div class="actions">' +
      deleteButton +
      '<span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',
    { label: 'Ajustes da aba' },
  );
}

function totalOptions(column) {
  const options =
    isNumeric(column) || column.type === 'check'
      ? ['', 'sum', 'avg', 'min', 'max', 'count']
      : ['', 'count'];
  return options
    .map(
      (key) =>
        '<option value="' +
        key +
        '"' +
        ((column.total || '') === key ? ' selected' : '') +
        '>' +
        (key ? 'Total: ' + LABELS[key] : 'Sem total') +
        '</option>',
    )
    .join('');
}

function drawColumns() {
  const list = document.querySelector('#clist');
  if (!list || !columnModel) return;
  list.innerHTML =
    columnModel.cols
      .map(
        (column, index) =>
          '<div class="crow" data-i="' +
          index +
          '"><div class="crow-main"><input data-f="name" aria-label="Nome da coluna" value="' +
          esc(column.name) +
          '" placeholder="Nome"><select data-f="type" aria-label="Tipo">' +
          Object.keys(TYPES)
            .map(
              (key) =>
                '<option value="' +
                key +
                '"' +
                (column.type === key ? ' selected' : '') +
                '>' +
                TYPES[key] +
                '</option>',
            )
            .join('') +
          '</select></div>' +
          (column.type === 'select'
            ? '<input data-f="opts" aria-label="Opções" placeholder="Opções separadas por vírgula" value="' +
              esc((column.opts || []).join(', ')) +
              '">'
            : '') +
          (column.type === 'formula'
            ? '<input data-f="formula" aria-label="Fórmula" placeholder="Ex.: ({Valor}+{Passagem})/{Km}" value="' +
              esc(column.formula || '') +
              '"><select data-f="fmt" aria-label="Formato do resultado"><option value="number"' +
              ((column.fmt || 'number') === 'number' ? ' selected' : '') +
              '>Resultado: número</option><option value="money"' +
              (column.fmt === 'money' ? ' selected' : '') +
              '>Resultado: dinheiro</option><option value="percent"' +
              (column.fmt === 'percent' ? ' selected' : '') +
              '>Resultado: porcentagem</option></select><p class="hint">Escreva o nome de outra coluna entre chaves, como {Valor}, e use + - × ÷ e parênteses. Se renomear a coluna, ajuste aqui também.</p>'
            : '') +
          '<div class="crow-foot"><select data-f="total" aria-label="Total no rodapé">' +
          totalOptions(column) +
          '</select><button type="button" data-act="cup" data-i="' +
          index +
          '" aria-label="Mover para a esquerda">←</button><button type="button" data-act="cdown" data-i="' +
          index +
          '" aria-label="Mover para a direita">→</button><button type="button" class="dt" data-act="cdel" data-i="' +
          index +
          '">Excluir</button></div></div>',
      )
      .join('') || '<p class="muted">Nenhuma coluna ainda.</p>';
}

export function openColumnsModal() {
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  if (!tool) return;
  const tab = currentTab(tool);
  columnModel = { tabId: tab.id, cols: clone(tab.cols) };
  openModal(
    '<form data-form="cols"><h2>Colunas de “' +
      esc(tab.name) +
      '”</h2><div id="clist"></div><div class="actions"><button type="button" class="btn" data-act="caddcol">+ Coluna</button><span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',
    { wide: true, label: 'Colunas' },
  );
  drawColumns();
}

function fieldHTML(column, value, first) {
  const id = 'f_' + column.id;
  const firstAttribute = first ? ' data-first' : '';
  const label = '<span>' + esc(column.name) + '</span>';
  switch (column.type) {
    case 'check':
      return (
        '<label class="field chk"><input type="checkbox" id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '"' +
        (value ? ' checked' : '') +
        '>' +
        label +
        '</label>'
      );
    case 'select': {
      const options = (column.opts || []).slice();
      if (value && !options.includes(value)) options.push(value);
      return (
        '<label class="field">' +
        label +
        '<select id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '"><option value=""></option>' +
        options
          .map(
            (option) =>
              '<option value="' +
              esc(option) +
              '"' +
              (option === value ? ' selected' : '') +
              '>' +
              esc(option) +
              '</option>',
          )
          .join('') +
        '</select></label>'
      );
    }
    case 'number':
    case 'money':
      return (
        '<label class="field">' +
        label +
        '<input id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '" inputmode="decimal" autocomplete="off"' +
        firstAttribute +
        ' placeholder="' +
        (column.type === 'money' ? '0,00' : '0') +
        '" value="' +
        esc(fmtRaw(value)) +
        '"></label>'
      );
    case 'date':
      return (
        '<label class="field">' +
        label +
        '<input type="date" id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '" value="' +
        esc(value || '') +
        '"></label>'
      );
    case 'time':
      return (
        '<label class="field">' +
        label +
        '<input type="time" id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '" value="' +
        esc(value || '') +
        '"></label>'
      );
    default:
      return (
        '<label class="field">' +
        label +
        '<input type="text" id="' +
        esc(id) +
        '" data-col="' +
        esc(column.id) +
        '" autocomplete="off"' +
        firstAttribute +
        ' value="' +
        esc(value == null ? '' : value) +
        '"></label>'
      );
  }
}

export function openRowModal(rowId = null) {
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  if (!tool) return;
  const tab = currentTab(tool);
  const row =
    rowId && state.rows ? state.rows.find((item) => item.id === rowId) : null;
  state.modal = { rowId: rowId || null, tabId: tab.id };
  const columns = tab.cols.filter((column) => column.type !== 'formula');
  const firstColumn = columns.find((column) =>
    ['text', 'number', 'money'].includes(column.type),
  );
  const fields = columns
    .map((column) => {
      let value = row && row.cells ? row.cells[column.id] : null;
      if (!row && column.type === 'date') value = todayISO();
      return fieldHTML(column, value, column === firstColumn && !row);
    })
    .join('');
  const deleteButton = row
    ? '<button type="button" class="btn danger" data-act="delrowform">Excluir</button>'
    : '';
  openModal(
    '<form data-form="row"><h2>' +
      (row ? 'Editar registro' : 'Novo registro') +
      '</h2>' +
      fields +
      '<div class="actions">' +
      deleteButton +
      '<span class="sp"></span><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Salvar</button></div></form>',
    { label: 'Registro' },
  );
}

export function handleModalAction(action, button) {
  const layer = document.querySelector('#layer');
  if (action === 'pickicon') {
    state.modal.icon = button.dataset.v;
    layer
      .querySelectorAll('[data-act="pickicon"]')
      .forEach((item) => item.classList.toggle('on', item === button));
    return true;
  }
  if (action === 'pickhue') {
    state.modal.hue = Number(button.dataset.v);
    layer
      .querySelectorAll('[data-act="pickhue"]')
      .forEach((item) => item.classList.toggle('on', item === button));
    return true;
  }
  if (action === 'caddcol') {
    columnModel.cols.push({
      id: uid(),
      name: 'Coluna ' + (columnModel.cols.length + 1),
      type: 'text',
    });
    drawColumns();
    return true;
  }
  if (action === 'cup' || action === 'cdown') {
    const index = Number(button.dataset.i);
    const next = action === 'cup' ? index - 1 : index + 1;
    if (next >= 0 && next < columnModel.cols.length)
      [columnModel.cols[index], columnModel.cols[next]] = [
        columnModel.cols[next],
        columnModel.cols[index],
      ];
    drawColumns();
    return true;
  }
  if (action === 'cdel') {
    columnModel.cols.splice(Number(button.dataset.i), 1);
    drawColumns();
    return true;
  }
  return false;
}

export function handleModalChange(event) {
  const element = event.target;
  if (element.name === 'tpl') {
    const template = TEMPLATES.find((item) => item.key === element.value);
    if (!template) return;
    state.modal.template = template.key;
    state.modal.icon = template.icon;
    state.modal.hue = template.hue;
    const name = document.querySelector('#layer [name="name"]');
    if (name) name.value = template.name;
    document
      .querySelectorAll('#layer [data-act="pickicon"]')
      .forEach((item) =>
        item.classList.toggle('on', item.dataset.v === template.icon),
      );
    document
      .querySelectorAll('#layer [data-act="pickhue"]')
      .forEach((item) =>
        item.classList.toggle('on', Number(item.dataset.v) === template.hue),
      );
    return;
  }
  const row = element.closest('.crow');
  if (!row || !element.dataset.f || !columnModel) return;
  const column = columnModel.cols[Number(row.dataset.i)];
  const field = element.dataset.f;
  if (field === 'opts')
    column.opts = element.value
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  else if (field === 'total') column.total = element.value || undefined;
  else column[field] = element.value;
  if (field === 'type') {
    if (column.type === 'select' && !column.opts) column.opts = [];
    if (column.type === 'formula' && !column.fmt) column.fmt = 'number';
    drawColumns();
  }
}

export function handleModalInput(event) {
  const element = event.target;
  const row = element.closest('.crow');
  if (
    row &&
    element.dataset.f &&
    ['name', 'formula'].includes(element.dataset.f) &&
    columnModel
  ) {
    columnModel.cols[Number(row.dataset.i)][element.dataset.f] = element.value;
  }
}

export async function handleModalSubmit(event, { safe, setView }) {
  event.preventDefault();
  const form = event.target;
  const kind = form.dataset.form;
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  const values = new FormData(form);

  if (kind === 'newtool') {
    const template =
      TEMPLATES.find((item) => item.key === state.modal.template) ||
      TEMPLATES[0];
    const id = uid();
    const data = {
      name: (values.get('name') || '').trim() || template.name,
      icon: state.modal.icon,
      hue: state.modal.hue,
      ord: Date.now(),
      tabs: template.tabs(),
    };
    closeModal();
    await safe(() => state.store.setTool(id, data));
    setView(id);
    return;
  }
  if (!tool) return;

  if (kind === 'toolset') {
    const data = {
      name: (values.get('name') || '').trim() || tool.name,
      icon: state.modal.icon,
      hue: state.modal.hue,
    };
    closeModal();
    await safe(() => state.store.patchTool(tool.id, data));
  } else if (kind === 'newtab') {
    const name = (values.get('name') || '').trim();
    if (!name) return;
    const tab = {
      id: uid(),
      name,
      cols: [col('Item', 'text'), col('Valor', 'money', { total: 'sum' })],
    };
    LS.set('mp.tab.' + tool.id, tab.id);
    state.sig = null;
    closeModal();
    await safe(() =>
      state.store.patchTool(tool.id, {
        tabs: clone((tool.tabs || []).concat(tab)),
      }),
    );
  } else if (kind === 'tabset') {
    const name = (values.get('name') || '').trim();
    if (!name) return;
    const tabId = currentTab(tool).id;
    const tabs = clone(tool.tabs);
    tabs.forEach((tab) => {
      if (tab.id === tabId) tab.name = name;
    });
    closeModal();
    await safe(() => state.store.patchTool(tool.id, { tabs }));
  } else if (kind === 'cols') {
    const columns = columnModel.cols.map((column, index) => {
      const result = clone(column);
      result.name = (result.name || '').trim() || 'Coluna ' + (index + 1);
      if (result.type !== 'select') delete result.opts;
      if (result.type !== 'formula') {
        delete result.formula;
        delete result.fmt;
      }
      if (!result.total) delete result.total;
      return result;
    });
    const tabs = clone(tool.tabs);
    tabs.forEach((tab) => {
      if (tab.id === columnModel.tabId) tab.cols = columns;
    });
    state.sig = null;
    closeModal();
    await safe(() => state.store.patchTool(tool.id, { tabs }));
  } else if (kind === 'row') {
    const tab =
      (tool.tabs || []).find((item) => item.id === state.modal.tabId) ||
      currentTab(tool);
    const cells = {};
    tab.cols.forEach((column) => {
      if (column.type === 'formula') return;
      const element = form.querySelector(
        '[data-col="' + CSS.escape(column.id) + '"]',
      );
      if (element) cells[column.id] = readCellInput(column, element);
    });
    const rowId = state.modal.rowId;
    closeModal();
    if (rowId) await safe(() => state.store.patchCells(tool.id, rowId, cells));
    else
      await safe(() =>
        state.store.setRow(tool.id, uid(), {
          tab: tab.id,
          ord: Date.now(),
          cells,
        }),
      );
  }
}

export function createTemplateTool(key, { safe, setView }) {
  const template = TEMPLATES.find((item) => item.key === key);
  if (!template) return;
  const id = uid();
  return safe(() =>
    state.store.setTool(id, {
      name: template.name,
      icon: template.icon,
      hue: template.hue,
      ord: Date.now(),
      tabs: template.tabs(),
    }),
  ).then(() => setView(id));
}

export function modalColumns() {
  return columnModel;
}

export { parseNum, fmtNum };
