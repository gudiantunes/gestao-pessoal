import { state } from '../state.js';
import { currentTab } from './nav.js';
import {
  cellVal,
  clone,
  dispText,
  esc,
  fmtNum,
  fmtRaw,
  fmtTotal,
  isNumeric,
  LABELS,
  LS,
  sortRows,
  todayISO,
  totalOf,
} from '../utils.js';

function getSort(tabId) {
  try {
    return JSON.parse(LS.get('mp.sort.' + tabId));
  } catch {
    return null;
  }
}

function sourceToolName(row) {
  const sourceLink = row.sourceLink;
  if (!sourceLink) return '';
  return (
    state.tools?.find((tool) => tool.id === sourceLink.sourceToolId)?.name ||
    sourceLink.sourceToolName ||
    ''
  );
}

function cellHTML(column, row, tab) {
  const value = cellVal(column, row, tab);
  const linked = row.linkedColumns?.[column.id];
  if (linked?.live) {
    return (
      '<td class="t-linked"><div class="linked-value">' +
      esc(dispText(column, row, tab) || '—') +
      '</div></td>'
    );
  }
  const data =
    ' data-col="' + esc(column.id) + '" aria-label="' + esc(column.name) + '"';
  switch (column.type) {
    case 'number':
    case 'money':
      return (
        '<td class="t-' +
        column.type +
        '"><input class="num" inputmode="decimal" autocomplete="off" data-t="1"' +
        data +
        ' value="' +
        esc(fmtNum(column.type, value)) +
        '"></td>'
      );
    case 'date':
      return (
        '<td class="t-date"><input type="date"' +
        data +
        ' value="' +
        esc(value || '') +
        '"></td>'
      );
    case 'time':
      return (
        '<td class="t-time"><input type="time"' +
        data +
        ' value="' +
        esc(value || '') +
        '"></td>'
      );
    case 'check':
      return (
        '<td class="t-check"><label class="chkcell"><input type="checkbox"' +
        data +
        (value ? ' checked' : '') +
        '></label></td>'
      );
    case 'select': {
      const options = (column.opts || []).slice();
      if (value && !options.includes(value)) options.push(value);
      return (
        '<td class="t-select"><select' +
        data +
        '><option value=""></option>' +
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
        '</select></td>'
      );
    }
    case 'formula':
      return (
        '<td class="t-formula"><span class="fx">' +
        esc(fmtNum(column.fmt || 'number', value) || '—') +
        '</span></td>'
      );
    default:
      return (
        '<td class="t-text"><input type="text" autocomplete="off"' +
        data +
        ' value="' +
        esc(value == null ? '' : value) +
        '"></td>'
      );
  }
}

function tableHTML(tab, rows) {
  const sort = getSort(tab.id);
  const headers = tab.cols
    .map(
      (column) =>
        '<th scope="col" data-act="sort" data-col="' +
        esc(column.id) +
        '"' +
        (isNumeric(column) ? ' style="text-align:right"' : '') +
        '>' +
        esc(column.name) +
        (sort && sort.col === column.id ? (sort.dir > 0 ? ' ↑' : ' ↓') : '') +
        '</th>',
    )
    .join('');
  const body = rows
    .map((row, index) => {
      const sourceName = sourceToolName(row);
      return (
        '<tr data-id="' +
        esc(row.id) +
        '"><td class="rn"><span>' +
        (index + 1) +
        '</span>' +
        (sourceName
          ? '<small class="row-origin">Origem: ' + esc(sourceName) + '</small>'
          : '') +
        '</td>' +
        tab.cols.map((column) => cellHTML(column, row, tab)).join('') +
        '<td class="x"><button class="rx" data-act="delrow" data-id="' +
        esc(row.id) +
        '" aria-label="Excluir linha">×</button></td></tr>'
      );
    })
    .join('');
  const foot = tab.cols.some((column) => column.total)
    ? '<tfoot><tr><td class="rn"></td>' +
      tab.cols
        .map((column) =>
          column.total
            ? '<td class="tot"><small>' +
              LABELS[column.total] +
              '</small><b>' +
              fmtTotal(column, totalOf(column, rows, tab)) +
              '</b></td>'
            : '<td></td>',
        )
        .join('') +
      '<td></td></tr></tfoot>'
    : '';
  return (
    '<div class="gridwrap"><table class="grid"><thead><tr><th class="rn"></th>' +
    headers +
    '<th class="x"></th></tr></thead><tbody>' +
    body +
    '</tbody>' +
    foot +
    '</table></div>'
  );
}

function cardsHTML(tab, rows) {
  const titleColumn =
    tab.cols.find((column) => column.type !== 'check') || tab.cols[0];
  return (
    '<div class="cards">' +
    rows
      .map((row) => {
        const title = titleColumn ? dispText(titleColumn, row, tab) : '';
        const sourceName = sourceToolName(row);
        const rest = tab.cols
          .filter((column) => column !== titleColumn)
          .map((column) => {
            const display = dispText(column, row, tab);
            const origin = row.linkedColumns?.[column.id];
            if (!display && !origin) return '';
            if (column.type === 'check')
              return (
                '<span class="pill">' +
                (display ? '✓ ' + esc(column.name) : esc(column.name)) +
                '</span>'
              );
            return (
              '<span class="kv"><small>' +
              esc(column.name) +
              '</small><b class="' +
              (isNumeric(column) ? 'num' : '') +
              '">' +
              esc(display) +
              '</b></span>'
            );
          })
          .join('');
        return (
          '<button class="card" data-act="editrow" data-id="' +
          esc(row.id) +
          '"><div class="ct">' +
          esc(title || 'Sem título') +
          '</div>' +
          (sourceName
            ? '<small class="row-origin">Origem: ' +
              esc(sourceName) +
              '</small>'
            : '') +
          '<div class="kvs">' +
          rest +
          '</div></button>'
        );
      })
      .join('') +
    '</div>'
  );
}

function summaryHTML(tab, rows) {
  const parts = tab.cols
    .filter((column) => column.total)
    .map(
      (column) =>
        '<div class="sumchip"><small>' +
        LABELS[column.total] +
        ' · ' +
        esc(column.name) +
        '</small><b>' +
        fmtTotal(column, totalOf(column, rows, tab)) +
        '</b></div>',
    );
  return parts.length ? '<div class="sumrow">' + parts.join('') + '</div>' : '';
}

export function renderGrid() {
  const grid = document.querySelector('#grid');
  const summary = document.querySelector('#sum');
  const tool = (state.tools || []).find(
    (item) => item.id === state.currentView,
  );
  if (!grid || !tool) return;
  const tab = currentTab(tool);
  if (state.rows == null) {
    grid.innerHTML = '<p class="muted pad">Carregando…</p>';
    return;
  }

  const allRows = state.rows
    .filter((row) => row.tab === tab.id)
    .sort((left, right) => (left.ord || 0) - (right.ord || 0));
  const query = state.searchQuery.trim().toLowerCase();
  let rows = query
    ? allRows.filter((row) =>
        tab.cols.some((column) =>
          dispText(column, row, tab).toLowerCase().includes(query),
        ),
      )
    : allRows;
  const sort = getSort(tab.id);
  if (sort) {
    const column = tab.cols.find((item) => item.id === sort.col);
    if (column) rows = sortRows(rows, column, sort.dir, tab);
  }
  if (summary) summary.innerHTML = state.isMobile ? summaryHTML(tab, rows) : '';

  if (!tab.cols.length) {
    grid.innerHTML =
      '<div class="empty"><b>Esta aba ainda não tem colunas</b><p>Defina as colunas para começar a registrar.</p><button class="btn pri" data-act="cols">Criar colunas</button></div>';
  } else if (!allRows.length) {
    grid.innerHTML =
      '<div class="empty"><b>Nenhum registro nesta aba</b><p>' +
      (state.isMobile
        ? 'Toque no botão + para adicionar o primeiro.'
        : 'Clique em “Nova linha” e preencha com Tab entre as células.') +
      '</p></div>';
  } else if (!rows.length) {
    grid.innerHTML =
      '<p class="muted pad">Nada encontrado para essa busca.</p>';
  } else {
    grid.innerHTML = state.isMobile
      ? cardsHTML(tab, rows)
      : tableHTML(tab, rows);
  }

  if (state.focusRow) {
    const rowElement = grid.querySelector(
      'tr[data-id="' + CSS.escape(state.focusRow) + '"]',
    );
    if (rowElement) {
      const inputs = Array.from(
        rowElement.querySelectorAll('input:not([type=checkbox]),select'),
      );
      const target = inputs.find((input) => !input.value) || inputs[0];
      state.focusRow = null;
      if (target) {
        target.focus();
        rowElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }
}

export function readCellInput(column, element) {
  if (column.type === 'check') return !!element.checked;
  if (column.type === 'number' || column.type === 'money') {
    const value = element.value.trim().replace(/R\$|\s/g, '');
    if (!value) return null;
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (column.type === 'text') return element.value.trim() || null;
  return element.value || null;
}

export function sortedColumn(tabId, columnId) {
  let sort = null;
  try {
    sort = JSON.parse(LS.get('mp.sort.' + tabId));
  } catch {}
  if (!sort || sort.col !== columnId) sort = { col: columnId, dir: 1 };
  else if (sort.dir === 1) sort = { col: columnId, dir: -1 };
  else sort = null;
  LS.set('mp.sort.' + tabId, JSON.stringify(sort));
}
