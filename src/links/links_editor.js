import {
  allLinks,
  mappingSourceIds,
  newLink,
  persistLink,
  removeLink,
} from './registry.js';
import { esc, isNumeric } from '../utils.js';

const SEPARATORS = [
  { value: ' ', label: 'Espaço' },
  { value: ', ', label: 'Vírgula' },
  { value: ' - ', label: 'Hífen' },
  { value: ' / ', label: 'Barra' },
  { value: '', label: 'Sem separador' },
];

const OPERATIONS = [
  { value: 'copy', label: 'Copiar valor' },
  { value: 'concat', label: 'Juntar texto' },
  { value: 'sum', label: 'Somar (+)' },
  { value: 'subtract', label: 'Subtrair (-)' },
  { value: 'multiply', label: 'Multiplicar (×)' },
  { value: 'divide', label: 'Dividir (÷)' },
];

function operationOf(mapping, sourceIds) {
  return mapping.operation || (sourceIds.length > 1 ? 'concat' : 'copy');
}

function sourcesForOperation(columns, operation) {
  return ['sum', 'subtract', 'multiply', 'divide'].includes(operation)
    ? columns.filter(isNumeric)
    : columns;
}

function targetsForOperation(columns, operation) {
  if (operation === 'concat')
    return columns.filter((column) => column.type === 'text');
  if (['sum', 'subtract', 'multiply', 'divide'].includes(operation)) {
    return columns.filter(isNumeric);
  }
  return columns;
}

function configureMapping(mapping, operation, sourceTab, targetTab) {
  const sourceColumns = sourcesForOperation(
    (sourceTab?.cols || []).filter((column) => column.type !== 'formula'),
    operation,
  );
  const targetColumns = targetsForOperation(
    (targetTab?.cols || []).filter((column) => column.type !== 'formula'),
    operation,
  );
  let sourceIds = mappingSourceIds(mapping).filter((id) =>
    sourceColumns.some((column) => column.id === id),
  );
  if (!sourceIds.length && sourceColumns.length)
    sourceIds = [sourceColumns[0].id];
  if (operation === 'copy') sourceIds = sourceIds.slice(0, 1);
  if (['sum', 'subtract', 'multiply', 'divide'].includes(operation)) {
    const secondSource = sourceColumns.find(
      (column) => !sourceIds.includes(column.id),
    );
    if (sourceIds.length < 2 && secondSource) sourceIds.push(secondSource.id);
  }
  mapping.operation = operation;
  mapping.sourceColumnIds = sourceIds;
  delete mapping.sourceColumnId;
  if (!targetColumns.some((column) => column.id === mapping.targetColumnId)) {
    mapping.targetColumnId = targetColumns[0]?.id || '';
  }
  if (operation === 'concat') mapping.separator ??= ' ';
}

function mappingSummary(mapping, sourceTab, target) {
  if (mapping.valueMode === 'fixed') {
    return `${mapping.fixedValue || 'Valor fixo'} → ${target?.name || 'Destino'}`;
  }
  const sourceIds = mappingSourceIds(mapping);
  const operation = operationOf(mapping, sourceIds);
  const sourceNames = sourceIds.map(
    (id) =>
      sourceTab?.cols?.find((column) => column.id === id)?.name || 'Coluna',
  );
  const symbols = {
    sum: ' + ',
    subtract: ' - ',
    multiply: ' × ',
    divide: ' ÷ ',
    concat: mapping.separator ?? ' ',
  };
  return `${sourceNames.join(symbols[operation] || ' + ')} → ${target?.name || 'Destino'}`;
}

function options(items, selectedId, label) {
  return items
    .map(
      (item) =>
        '<option value="' +
        esc(item.id) +
        '"' +
        (item.id === selectedId ? ' selected' : '') +
        '>' +
        esc(item[label]) +
        '</option>',
    )
    .join('');
}

function field(label, name, items, selectedId, linkId) {
  return (
    '<label class="link-field"><span>' +
    label +
    '</span><select data-link-id="' +
    esc(linkId) +
    '" data-link-field="' +
    name +
    '">' +
    options(items, selectedId, 'name') +
    '</select></label>'
  );
}

function fixedValueEditor(mapping, target, index, linkId) {
  if (!target) return '<p class="muted">Selecione a coluna de destino.</p>';
  const value = mapping.fixedValue == null ? '' : String(mapping.fixedValue);
  const attrs =
    ' data-link-map="fixed" data-map-index="' +
    index +
    '" data-link-id="' +
    esc(linkId) +
    '"';
  if (target.type === 'select') {
    return (
      '<label><span>Valor fixo</span><select' +
      attrs +
      '><option value=""></option>' +
      (target.opts || [])
        .map(
          (option) =>
            '<option value="' +
            esc(option) +
            '"' +
            (value === option ? ' selected' : '') +
            '>' +
            esc(option) +
            '</option>',
        )
        .join('') +
      '</select></label>'
    );
  }
  if (target.type === 'check') {
    return (
      '<label><span>Valor fixo</span><select' +
      attrs +
      '><option value=""></option><option value="true"' +
      (value === 'true' ? ' selected' : '') +
      '>Marcado</option><option value="false"' +
      (value === 'false' ? ' selected' : '') +
      '>Desmarcado</option></select></label>'
    );
  }
  const inputType = ['date', 'time'].includes(target.type)
    ? target.type
    : 'text';
  return (
    '<label><span>Valor fixo</span><input type="' +
    inputType +
    '"' +
    (['number', 'money'].includes(target.type) ? ' inputmode="decimal"' : '') +
    attrs +
    ' value="' +
    esc(value) +
    '"></label>'
  );
}

function mappingRows(link, sourceTab, targetTab) {
  const sourceColumns = (sourceTab?.cols || []).filter(
    (column) => column.type !== 'formula',
  );
  const targetColumns = (targetTab?.cols || []).filter(
    (column) => column.type !== 'formula',
  );
  return (
    (link.mappings || [])
      .map((mapping, index) => {
        const sourceIds = mappingSourceIds(mapping);
        const fixed = mapping.valueMode === 'fixed';
        const operation = operationOf(mapping, sourceIds);
        const target = targetColumns.find(
          (column) => column.id === mapping.targetColumnId,
        );
        const availableSources = sourcesForOperation(sourceColumns, operation);
        const availableTargets = fixed
          ? targetColumns
          : targetsForOperation(targetColumns, operation);
        const sourceRows = sourceIds
          .map(
            (sourceId, sourceIndex) =>
              '<div class="link-source-row"><label><span>' +
              (sourceIndex === 0 ? 'Colunas de origem' : 'Outra origem') +
              '</span><select data-link-map="source" data-map-index="' +
              index +
              '" data-source-index="' +
              sourceIndex +
              '" data-link-id="' +
              esc(link.id) +
              '">' +
              options(availableSources, sourceId, 'name') +
              '</select></label>' +
              (sourceIds.length > 1
                ? '<button class="btn link-remove-source" type="button" data-act="link-source-remove" data-link-id="' +
                  esc(link.id) +
                  '" data-map-index="' +
                  index +
                  '" data-source-index="' +
                  sourceIndex +
                  '" aria-label="Remover coluna de origem">×</button>'
                : '') +
              '</div>',
          )
          .join('');
        const separatorOptions = SEPARATORS.map(
          (separator) =>
            '<option value="' +
            esc(separator.value) +
            '"' +
            ((mapping.separator ?? ' ') === separator.value
              ? ' selected'
              : '') +
            '>' +
            separator.label +
            '</option>',
        ).join('');
        const controls =
          '<div class="link-map-entry-controls"><label class="link-operation"><span>Valor do destino</span><select data-link-map="value-mode" data-map-index="' +
          index +
          '" data-link-id="' +
          esc(link.id) +
          '"><option value="origin"' +
          (!fixed ? ' selected' : '') +
          '>Vinculado à origem</option><option value="fixed"' +
          (fixed ? ' selected' : '') +
          '>Valor fixo</option></select></label>' +
          (!fixed
            ? '<label class="link-operation"><span>Operação</span><select data-link-map="operation" data-map-index="' +
              index +
              '" data-link-id="' +
              esc(link.id) +
              '">' +
              OPERATIONS.map(
                (item) =>
                  '<option value="' +
                  item.value +
                  '"' +
                  (operation === item.value ? ' selected' : '') +
                  '>' +
                  item.label +
                  '</option>',
              ).join('') +
              '</select></label>'
            : '') +
          '<div class="link-map' +
          (fixed ? ' is-fixed' : '') +
          '" data-link-id="' +
          esc(link.id) +
          '"><div class="link-map-sources">' +
          (fixed
            ? '<p class="muted link-fixed-note">Este valor será usado em cada linha vinculada.</p>'
            : sourceRows +
              '<button class="btn link-add-source" type="button" data-act="link-source-add" data-link-id="' +
              esc(link.id) +
              '" data-map-index="' +
              index +
              '"' +
              (operation === 'copy' ||
              (operation === 'concat' && target?.type !== 'text') ||
              (['sum', 'subtract', 'multiply', 'divide'].includes(operation) &&
                !isNumeric(target || {})) ||
              sourceIds.length >= availableSources.length
                ? ' disabled'
                : '') +
              '>+ Coluna de origem</button>') +
          '</div>' +
          '<span class="link-arrow" aria-hidden="true">→</span>' +
          '<div class="link-map-target"><label><span>Coluna de destino</span><select data-link-map="target" data-map-index="' +
          index +
          '" data-link-id="' +
          esc(link.id) +
          '">' +
          options(availableTargets, mapping.targetColumnId, 'name') +
          '</select></label>' +
          (fixed
            ? fixedValueEditor(mapping, target, index, link.id)
            : operation === 'concat' && sourceIds.length > 1
              ? '<label class="link-separator"><span>Separador</span><select data-link-map="separator" data-map-index="' +
                index +
                '" data-link-id="' +
                esc(link.id) +
                '">' +
                separatorOptions +
                '</select></label>'
              : '') +
          '</div><button class="btn link-remove-map" type="button" data-act="link-map-remove" data-link-id="' +
          esc(link.id) +
          '" data-map-index="' +
          index +
          '" aria-label="Remover mapeamento">×</button></div></div>';
        const summary = esc(mappingSummary(mapping, sourceTab, target));
        return (
          '<section class="link-map-entry"><header class="link-map-head"><strong>' +
          summary +
          '</strong><button class="btn link-map-toggle" type="button" data-act="link-map-toggle" data-link-id="' +
          esc(link.id) +
          '" data-map-index="' +
          index +
          '" aria-expanded="' +
          !mapping.collapsed +
          '">' +
          (mapping.collapsed ? 'Expandir' : 'Recolher') +
          '</button></header>' +
          (mapping.collapsed ? '' : controls) +
          '</section>'
        );
      })
      .join('') ||
    '<p class="muted link-empty">Nenhum mapeamento. A ligação ainda não copiará colunas.</p>'
  );
}

export function renderLinksPage(tools) {
  const links = allLinks(tools);
  const cards = links
    .map((link) => {
      const source = tools.find((tool) => tool.id === link.sourceToolId);
      const target = tools.find((tool) => tool.id === link.targetToolId);
      const sourceTab = source?.tabs?.find(
        (tab) => tab.id === link.sourceTabId,
      );
      const targetTab = target?.tabs?.find(
        (tab) => tab.id === link.targetTabId,
      );
      const targetTools = tools.filter((tool) => tool.id !== source?.id);
      return (
        '<section class="link-card" data-link-card="' +
        esc(link.id) +
        '">' +
        '<div class="link-card-head"><div><h2>' +
        esc(source?.name || 'Ferramenta removida') +
        ' <span>→</span> ' +
        esc(target?.name || 'Escolha o destino') +
        '</h2><p>Cada linha da origem mantém uma linha vinculada no destino.</p></div>' +
        '<button class="btn danger" type="button" data-act="link-delete" data-link-id="' +
        esc(link.id) +
        '">Excluir ligação</button></div>' +
        '<div class="link-tools">' +
        field(
          'Ferramenta de origem',
          'sourceToolId',
          tools,
          source?.id,
          link.id,
        ) +
        field(
          'Aba de origem',
          'sourceTabId',
          source?.tabs || [],
          sourceTab?.id,
          link.id,
        ) +
        field(
          'Ferramenta de destino',
          'targetToolId',
          targetTools,
          target?.id,
          link.id,
        ) +
        field(
          'Aba de destino',
          'targetTabId',
          target?.tabs || [],
          targetTab?.id,
          link.id,
        ) +
        '</div><div class="link-mappings"><div class="link-mappings-head"><h3>Mapeamento de colunas</h3><button class="btn" type="button" data-act="link-map-add" data-link-id="' +
        esc(link.id) +
        '"' +
        (!sourceTab?.cols?.some((column) => column.type !== 'formula') ||
        !targetTab?.cols?.some((column) => column.type !== 'formula')
          ? ' disabled'
          : '') +
        '>+ Coluna</button></div>' +
        mappingRows(link, sourceTab, targetTab) +
        '</div></section>'
      );
    })
    .join('');
  const canAdd = tools.filter((tool) => tool.tabs?.length).length > 1;
  return (
    '<section class="links-page"><header class="links-heading"><div><p class="eyebrow">AUTOMAÇÕES</p><h1>Links entre ferramentas</h1><p class="sub">Mantenha colunas sincronizadas ou defina valores fixos em outra ferramenta.</p></div>' +
    (canAdd
      ? '<button class="btn pri" data-act="link-add">+ Nova ligação</button>'
      : '') +
    '</header>' +
    (cards ||
      (canAdd
        ? '<p class="links-empty">Nenhuma ligação configurada.</p>'
        : '<p class="links-empty">Crie pelo menos duas ferramentas com abas para configurar uma ligação.</p>')) +
    '</section>'
  );
}

export async function handleLinkAction(action, button, { safe, store, tools }) {
  const links = allLinks(tools);
  const link = links.find((item) => item.id === button.dataset.linkId);
  if (action === 'link-add') {
    const available = tools.filter((tool) => tool.tabs?.length);
    if (available.length < 2) return true;
    const created = newLink(available[0], available[1]);
    await safe(() => persistLink(store, tools, created));
    return true;
  }
  if (!link) return false;
  if (action === 'link-delete') {
    await safe(() => removeLink(store, tools, link));
    return true;
  }
  if (action === 'link-map-add') {
    const source = tools.find((tool) => tool.id === link.sourceToolId);
    const sourceTab = source?.tabs?.find((tab) => tab.id === link.sourceTabId);
    const target = tools.find((tool) => tool.id === link.targetToolId);
    const targetTab = target?.tabs?.find((tab) => tab.id === link.targetTabId);
    const sourceColumn = sourceTab?.cols?.find(
      (column) => column.type !== 'formula',
    );
    const targetColumn =
      targetTab?.cols?.find((column) => column.type === 'text') ||
      targetTab?.cols?.find((column) => column.type !== 'formula');
    if (sourceColumn && targetColumn) {
      link.mappings.push({
        sourceColumnIds: [sourceColumn.id],
        targetColumnId: targetColumn.id,
        operation: 'copy',
        separator: ' ',
      });
      await safe(() => persistLink(store, tools, link, link.sourceToolId));
    }
    return true;
  }
  if (action === 'link-source-add') {
    const source = tools.find((tool) => tool.id === link.sourceToolId);
    const sourceTab = source?.tabs?.find((tab) => tab.id === link.sourceTabId);
    const target = tools.find((tool) => tool.id === link.targetToolId);
    const mapping = link.mappings[Number(button.dataset.mapIndex)];
    const operation = mapping
      ? operationOf(mapping, mappingSourceIds(mapping))
      : 'copy';
    const targetColumn = target?.tabs
      ?.find((tab) => tab.id === link.targetTabId)
      ?.cols?.find((column) => column.id === mapping?.targetColumnId);
    if (
      !mapping ||
      operation === 'copy' ||
      (operation === 'concat' && targetColumn?.type !== 'text') ||
      (['sum', 'subtract', 'multiply', 'divide'].includes(operation) &&
        !isNumeric(targetColumn || {}))
    )
      return true;
    const sourceIds = mappingSourceIds(mapping);
    const availableSources = sourcesForOperation(
      (sourceTab?.cols || []).filter((column) => column.type !== 'formula'),
      operation,
    );
    const sourceColumn = sourceTab?.cols?.find(
      (column) =>
        availableSources.includes(column) && !sourceIds.includes(column.id),
    );
    if (sourceColumn) {
      mapping.sourceColumnIds = sourceIds.concat(sourceColumn.id);
      delete mapping.sourceColumnId;
      mapping.separator ??= ' ';
      await safe(() => persistLink(store, tools, link, link.sourceToolId));
    }
    return true;
  }
  if (action === 'link-source-remove') {
    const mapping = link.mappings[Number(button.dataset.mapIndex)];
    if (mapping) {
      mapping.sourceColumnIds = mappingSourceIds(mapping).filter(
        (_, index) => index !== Number(button.dataset.sourceIndex),
      );
      delete mapping.sourceColumnId;
      await safe(() => persistLink(store, tools, link, link.sourceToolId));
    }
    return true;
  }
  if (action === 'link-map-toggle') {
    const mapping = link.mappings[Number(button.dataset.mapIndex)];
    if (mapping) {
      mapping.collapsed = !mapping.collapsed;
      await safe(() => persistLink(store, tools, link, link.sourceToolId));
    }
    return true;
  }
  if (action === 'link-map-remove') {
    link.mappings.splice(Number(button.dataset.mapIndex), 1);
    await safe(() => persistLink(store, tools, link, link.sourceToolId));
    return true;
  }
  return false;
}

export async function handleLinkChange(event, { safe, store, tools }) {
  const element = event.target;
  const linkId = element.dataset.linkId;
  if (!linkId) return false;
  const link = allLinks(tools).find((item) => item.id === linkId);
  if (!link) return false;
  const oldSourceToolId = link.sourceToolId;

  if (element.dataset.linkMap) {
    const index = Number(element.dataset.mapIndex);
    const mapping = link.mappings[index];
    const source = tools.find((tool) => tool.id === link.sourceToolId);
    const sourceTab = source?.tabs?.find((tab) => tab.id === link.sourceTabId);
    const target = tools.find((tool) => tool.id === link.targetToolId);
    const targetTab = target?.tabs?.find((tab) => tab.id === link.targetTabId);
    const targetColumn = targetTab?.cols?.find(
      (column) => column.id === mapping.targetColumnId,
    );
    if (element.dataset.linkMap === 'value-mode') {
      mapping.valueMode = element.value;
      if (element.value === 'origin') {
        configureMapping(
          mapping,
          mapping.operation || 'copy',
          sourceTab,
          targetTab,
        );
      }
      if (element.value === 'fixed' && targetColumn?.type === 'select') {
        mapping.fixedValue = targetColumn.opts?.[0] || '';
      }
    } else if (element.dataset.linkMap === 'fixed') {
      mapping.fixedValue = element.value;
    } else if (element.dataset.linkMap === 'operation') {
      configureMapping(mapping, element.value, sourceTab, targetTab);
    } else if (element.dataset.linkMap === 'source') {
      mapping.sourceColumnIds = mappingSourceIds(mapping);
      mapping.sourceColumnIds[Number(element.dataset.sourceIndex)] =
        element.value;
      delete mapping.sourceColumnId;
    } else if (element.dataset.linkMap === 'separator') {
      mapping.separator = element.value;
    } else {
      mapping.targetColumnId = element.value;
      const selectedTarget = targetTab?.cols?.find(
        (column) => column.id === element.value,
      );
      if (mapping.valueMode === 'fixed' && selectedTarget?.type === 'select') {
        mapping.fixedValue = selectedTarget.opts?.[0] || '';
      }
    }
  } else {
    const fieldName = element.dataset.linkField;
    link[fieldName] = element.value;
    if (fieldName === 'sourceToolId') {
      const source = tools.find((tool) => tool.id === link.sourceToolId);
      link.sourceTabId = source?.tabs?.[0]?.id || '';
      link.mappings = [];
      if (link.targetToolId === link.sourceToolId) {
        link.targetToolId =
          tools.find((tool) => tool.id !== source?.id && tool.tabs?.length)
            ?.id || '';
        const target = tools.find((tool) => tool.id === link.targetToolId);
        link.targetTabId = target?.tabs?.[0]?.id || '';
      }
    } else if (fieldName === 'sourceTabId') {
      link.mappings = [];
    } else if (fieldName === 'targetToolId') {
      const target = tools.find((tool) => tool.id === link.targetToolId);
      link.targetTabId = target?.tabs?.[0]?.id || '';
      link.mappings = [];
    } else if (fieldName === 'targetTabId') {
      link.mappings = [];
    }
  }
  await safe(() => persistLink(store, tools, link, oldSourceToolId));
  return true;
}
