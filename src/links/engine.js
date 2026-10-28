import { parseNum, todayISO, uid } from '../utils.js';
import { allLinks, mappingSourceIds } from './registry.js';

function fixedValue(mapping, column) {
  const value = mapping.fixedValue;
  if (value == null || value === '') return null;
  if (column.type === 'number' || column.type === 'money') {
    return parseNum(value);
  }
  if (column.type === 'check') return value === true || value === 'true';
  return value;
}

function calculateValue(mapping, targetColumn, sourceCells) {
  if (mapping.valueMode === 'fixed') return fixedValue(mapping, targetColumn);
  const sourceIds = mappingSourceIds(mapping);
  const operation =
    mapping.operation || (sourceIds.length > 1 ? 'concat' : 'copy');
  const values = sourceIds
    .filter((columnId) => Object.hasOwn(sourceCells, columnId))
    .map((columnId) => sourceCells[columnId]);

  if (operation === 'copy') return values[0] ?? null;
  if (operation === 'concat') {
    const nonEmpty = values
      .filter((value) => value != null && String(value).trim() !== '')
      .map(String);
    return nonEmpty.length ? nonEmpty.join(mapping.separator ?? ' ') : null;
  }

  const numbers = values.map(parseNum).filter((value) => value != null);
  if (!numbers.length) return null;
  let result = numbers[0];
  if (operation === 'sum') {
    result = numbers.reduce((sum, value) => sum + value, 0);
  } else if (operation === 'subtract') {
    result = numbers.slice(1).reduce((total, value) => total - value, result);
  } else if (operation === 'multiply') {
    result = numbers.reduce((product, value) => product * value, 1);
  } else if (operation === 'divide') {
    if (numbers.slice(1).some((value) => value === 0)) return null;
    result = numbers.slice(1).reduce((total, value) => total / value, result);
  }
  return Number.isFinite(result) ? result : null;
}

function mappingOrigin(mapping, sourceTool, sourceTab) {
  return sourceTool.name;
}

function markDetached(linkedColumns) {
  return Object.fromEntries(
    Object.entries(linkedColumns || {}).map(([columnId, origin]) => [
      columnId,
      { ...origin, live: false },
    ]),
  );
}

export async function syncLinkedRows(
  store,
  tools,
  sourceToolId,
  sourceTabId,
  sourceRowId,
  sourceCells,
  previousReferences = [],
) {
  const sourceTool = tools.find((tool) => tool.id === sourceToolId);
  const sourceTab = sourceTool?.tabs?.find((tab) => tab.id === sourceTabId);
  if (!sourceTool || !sourceTab) return [];

  const links = allLinks(tools).filter(
    (link) =>
      link.sourceToolId === sourceToolId && link.sourceTabId === sourceTabId,
  );
  const activeIds = new Set(links.map((link) => link.id));
  const references = (previousReferences || []).filter(
    (reference) => !activeIds.has(reference.linkId),
  );

  for (const link of links) {
    const targetTool = tools.find((tool) => tool.id === link.targetToolId);
    const targetTab = targetTool?.tabs?.find(
      (tab) => tab.id === link.targetTabId,
    );
    if (!targetTool || !targetTab) continue;

    const previous = (previousReferences || []).find(
      (reference) => reference.linkId === link.id,
    );
    const existingTargetRow =
      previous?.targetToolId === targetTool.id
        ? (await store.readRows(targetTool.id)).find(
            (row) => row.id === previous.targetRowId,
          )
        : null;
    const targetRowId = existingTargetRow ? previous.targetRowId : uid();
    if (previous && previous.targetToolId !== targetTool.id) {
      const previousTool = tools.find(
        (tool) => tool.id === previous.targetToolId,
      );
      const previousRow = previousTool
        ? (await store.readRows(previousTool.id)).find(
            (row) => row.id === previous.targetRowId,
          )
        : null;
      if (previousRow) {
        await store.patchRow(previousTool.id, previous.targetRowId, {
          linkedColumns: markDetached(previousRow.linkedColumns),
          sourceLink: { ...previousRow.sourceLink, live: false },
        });
      }
    }

    const cells = {};
    if (!previous) {
      targetTab.cols.forEach((column) => {
        if (column.type === 'date') cells[column.id] = todayISO();
      });
    }
    const linkedColumns = {};
    (link.mappings || []).forEach((mapping) => {
      const targetColumn = targetTab.cols.find(
        (column) => column.id === mapping.targetColumnId,
      );
      if (!targetColumn || targetColumn.type === 'formula') return;
      cells[targetColumn.id] = calculateValue(
        mapping,
        targetColumn,
        sourceCells,
      );
      linkedColumns[targetColumn.id] = {
        label: mappingOrigin(mapping, sourceTool, sourceTab),
        live: true,
      };
    });

    const reference = {
      linkId: link.id,
      targetToolId: targetTool.id,
      targetRowId,
      targetTabId: targetTab.id,
    };
    if (existingTargetRow) {
      (previous.targetColumnIds || []).forEach((columnId) => {
        if (!Object.hasOwn(linkedColumns, columnId)) cells[columnId] = null;
      });
      await store.patchCells(targetTool.id, targetRowId, cells);
      await store.patchRow(targetTool.id, targetRowId, {
        linkedColumns,
        sourceLink: {
          sourceToolId,
          sourceToolName: sourceTool.name,
          sourceTabId,
          sourceRowId,
          linkId: link.id,
          live: true,
        },
      });
    } else {
      await store.setRow(targetTool.id, targetRowId, {
        tab: targetTab.id,
        ord: Date.now(),
        cells,
        linkedColumns,
        sourceLink: {
          sourceToolId,
          sourceToolName: sourceTool.name,
          sourceTabId,
          sourceRowId,
          linkId: link.id,
          live: true,
        },
      });
    }
    references.push({
      ...reference,
      targetColumnIds: Object.keys(linkedColumns),
    });
  }

  await store.patchRow(sourceToolId, sourceRowId, { linkedRows: references });
  return references;
}

export async function detachLinkedRows(store, tools, references = []) {
  for (const reference of references) {
    const targetTool = tools.find((tool) => tool.id === reference.targetToolId);
    if (!targetTool) continue;
    const row = (await store.readRows(targetTool.id)).find(
      (item) => item.id === reference.targetRowId,
    );
    if (!row) continue;
    await store.patchRow(targetTool.id, row.id, {
      linkedColumns: markDetached(row.linkedColumns),
      sourceLink: { ...row.sourceLink, live: false },
    });
  }
}

export const createLinkedRows = syncLinkedRows;
