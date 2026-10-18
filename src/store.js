import { clone } from './utils.js';

function createLocalStorageStore() {
  let data = { tools: {}, rows: {} };
  try {
    const saved = localStorage.getItem('mp.db');
    if (saved) data = JSON.parse(saved);
  } catch (error) {
    console.error('Erro ao ler localStorage', error);
  }
  data.tools ||= {};
  data.rows ||= {};

  const toolWatchers = new Set();
  const rowWatchers = new Map();
  const save = () => localStorage.setItem('mp.db', JSON.stringify(data));
  const tools = () =>
    Object.keys(data.tools).map((id) =>
      Object.assign({ id }, clone(data.tools[id])),
    );
  const rows = (toolId) =>
    Object.keys(data.rows[toolId] || {}).map((id) =>
      Object.assign({ id }, clone(data.rows[toolId][id])),
    );
  const notifyTools = () =>
    toolWatchers.forEach((callback) => callback(tools()));
  const notifyRows = (toolId) =>
    (rowWatchers.get(toolId) || new Set()).forEach((callback) =>
      callback(rows(toolId)),
    );

  return {
    kind: 'local',
    watchTools(callback) {
      toolWatchers.add(callback);
      callback(tools());
      return () => toolWatchers.delete(callback);
    },
    watchRows(toolId, callback) {
      if (!rowWatchers.has(toolId)) rowWatchers.set(toolId, new Set());
      rowWatchers.get(toolId).add(callback);
      callback(rows(toolId));
      return () => rowWatchers.get(toolId).delete(callback);
    },
    async setTool(id, value) {
      data.tools[id] = clone(value);
      save();
      notifyTools();
    },
    async patchTool(id, value) {
      data.tools[id] = Object.assign(data.tools[id] || {}, clone(value));
      save();
      notifyTools();
    },
    async delTool(id) {
      delete data.tools[id];
      delete data.rows[id];
      save();
      notifyTools();
    },
    async setRow(toolId, id, value) {
      (data.rows[toolId] ||= {})[id] = clone(value);
      save();
      notifyRows(toolId);
    },
    async patchCells(toolId, id, cells) {
      const row = (data.rows[toolId] || {})[id];
      if (!row) return;
      row.cells = Object.assign(row.cells || {}, clone(cells));
      save();
      notifyRows(toolId);
    },
    async delRow(toolId, id) {
      if (data.rows[toolId]) delete data.rows[toolId][id];
      save();
      notifyRows(toolId);
    },
  };
}

function createCloudStore(db, onError) {
  const queues = new Map();
  const run = (path, task) => {
    const promise = (queues.get(path) || Promise.resolve())
      .catch(() => {})
      .then(task);
    queues.set(path, promise);
    return promise;
  };
  const docsToArray = (snapshot) =>
    snapshot.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const rowPath = (toolId, rowId) => `tools/${toolId}/rows/${rowId}`;
  return {
    kind: 'cloud',
    watchTools(callback) {
      return db.collection('tools').onSnapshot(
        (snapshot) => callback(docsToArray(snapshot)),
        () => onError('Falha ao carregar as ferramentas.'),
      );
    },
    watchRows(toolId, callback) {
      return db.collection(`tools/${toolId}/rows`).onSnapshot(
        (snapshot) => callback(docsToArray(snapshot)),
        () => onError('Falha ao carregar os registros.'),
      );
    },
    setTool: (id, value) =>
      run(`tools/${id}`, () => db.doc(`tools/${id}`).set(value)),
    patchTool: (id, value) =>
      run(`tools/${id}`, () => db.doc(`tools/${id}`).update(value)),
    async delTool(id) {
      const snapshot = await db.collection(`tools/${id}/rows`).get();
      const ids = snapshot.docs.map((doc) => doc.id);
      for (let index = 0; index < ids.length; index += 10) {
        await Promise.all(
          ids
            .slice(index, index + 10)
            .map((rowId) => db.doc(rowPath(id, rowId)).delete()),
        );
      }
      await db.doc(`tools/${id}`).delete();
    },
    setRow: (toolId, id, value) =>
      run(rowPath(toolId, id), () => db.doc(rowPath(toolId, id)).set(value)),
    patchCells: (toolId, id, cells) =>
      run(rowPath(toolId, id), () =>
        db.doc(rowPath(toolId, id)).update({ cells }),
      ),
    delRow: (toolId, id) =>
      run(rowPath(toolId, id), () => db.doc(rowPath(toolId, id)).delete()),
  };
}

export function createStore(db = window.db || null, onError = console.error) {
  return db ? createCloudStore(db, onError) : createLocalStorageStore();
}

export { createLocalStorageStore };
