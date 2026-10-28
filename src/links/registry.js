import { clone, uid } from '../utils.js';

export function allLinks(tools) {
  return (tools || []).flatMap((tool) =>
    (tool.links || []).map((link) => ({
      ...clone(link),
      sourceToolId: tool.id,
    })),
  );
}

export function mappingSourceIds(mapping) {
  return (
    mapping.sourceColumnIds ||
    (mapping.sourceColumnId ? [mapping.sourceColumnId] : [])
  );
}

export async function persistLink(store, tools, link, previousSourceToolId) {
  const sourceToolId = link.sourceToolId;
  const next = clone(link);
  delete next.sourceToolId;

  if (previousSourceToolId && previousSourceToolId !== sourceToolId) {
    const previous = tools.find((tool) => tool.id === previousSourceToolId);
    if (previous) {
      await store.patchTool(previous.id, {
        links: (previous.links || []).filter((item) => item.id !== link.id),
      });
    }
  }

  const source = tools.find((tool) => tool.id === sourceToolId);
  if (!source) return;
  const links = (source.links || []).filter((item) => item.id !== next.id);
  links.push(next);
  await store.patchTool(sourceToolId, { links });
}

export async function removeLink(store, tools, link) {
  const source = tools.find((tool) => tool.id === link.sourceToolId);
  if (!source) return;
  await store.patchTool(source.id, {
    links: (source.links || []).filter((item) => item.id !== link.id),
  });

  const rows = await store.readRows(source.id);
  const targetRows = new Map();
  for (const row of rows) {
    const references = row.linkedRows || [];
    const reference = references.find((item) => item.linkId === link.id);
    if (!reference) continue;
    const targetTool = tools.find((tool) => tool.id === reference.targetToolId);
    if (!targetTool) continue;
    if (!targetRows.has(targetTool.id)) {
      targetRows.set(targetTool.id, await store.readRows(targetTool.id));
    }
    const targetRow = targetRows
      .get(targetTool.id)
      .find((item) => item.id === reference.targetRowId);
    if (targetRow) {
      const linkedColumns = Object.fromEntries(
        Object.entries(targetRow.linkedColumns || {}).map(
          ([columnId, origin]) => [columnId, { ...origin, live: false }],
        ),
      );
      await store.patchRow(targetTool.id, targetRow.id, {
        linkedColumns,
        sourceLink: { ...targetRow.sourceLink, live: false },
      });
    }
    await store.patchRow(source.id, row.id, {
      linkedRows: references.filter((item) => item.linkId !== link.id),
    });
  }
}

export function newLink(sourceTool, targetTool) {
  return {
    id: uid(),
    sourceToolId: sourceTool.id,
    sourceTabId: sourceTool.tabs[0].id,
    targetToolId: targetTool.id,
    targetTabId: targetTool.tabs[0].id,
    mappings: [],
  };
}
