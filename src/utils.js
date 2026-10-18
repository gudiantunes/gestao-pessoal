export const HUES = [18, 45, 95, 160, 200, 240, 285, 330];
export const ICONS = [
  '📋',
  '🚕',
  '🔧',
  '🛒',
  '💰',
  '🚲',
  '🏠',
  '⛽',
  '✅',
  '📅',
  '📒',
  '🛠️',
  '📦',
  '🎯',
  '📈',
  '🍽️',
];
export const TYPES = {
  text: 'Texto',
  number: 'Número',
  money: 'Dinheiro (R$)',
  date: 'Data',
  time: 'Hora',
  check: 'Marcar (✓)',
  select: 'Lista de opções',
  formula: 'Fórmula',
};
export const LABELS = {
  sum: 'Soma',
  avg: 'Média',
  min: 'Mín',
  max: 'Máx',
  count: 'Contagem',
};

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const MF = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const PF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const uid = () =>
  'x' +
  Math.random().toString(36).slice(2, 9) +
  Date.now().toString(36).slice(-3);
export const generateId = uid;
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const esc = (value) =>
  String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
export const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const LS = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Erro ao salvar no localStorage', error);
    }
  },
};

function evalExpr(source, getRef) {
  const tokens = (
    String(source).match(/\{[^}]*\}|\d+(?:[.,]\d+)?|[()+\-*\/×÷]|\s+|./g) || []
  )
    .filter((token) => !/^\s+$/.test(token))
    .map((token) => (token === '×' ? '*' : token === '÷' ? '/' : token));
  let index = 0;
  const peek = () => tokens[index];
  function expr() {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[index++];
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  }
  function term() {
    let value = unary();
    while (peek() === '*' || peek() === '/') {
      const operator = tokens[index++];
      const right = unary();
      if (operator === '*') value *= right;
      else {
        if (right === 0) throw new Error('div0');
        value /= right;
      }
    }
    return value;
  }
  function unary() {
    if (peek() === '-') {
      index++;
      return -unary();
    }
    if (peek() === '+') {
      index++;
      return unary();
    }
    return atom();
  }
  function atom() {
    const token = tokens[index++];
    if (token === undefined) throw new Error('fim');
    if (token === '(') {
      const value = expr();
      if (tokens[index++] !== ')') throw new Error('parenteses');
      return value;
    }
    if (token[0] === '{') return getRef(token.slice(1, -1));
    if (/^\d/.test(token)) return parseFloat(token.replace(',', '.'));
    throw new Error('símbolo');
  }
  const value = expr();
  if (index !== tokens.length) throw new Error('sobra');
  return value;
}

export function parseNum(value) {
  if (typeof value === 'number') return isFinite(value) ? value : null;
  if (value == null) return null;
  let source = String(value).trim();
  if (!source) return null;
  try {
    if (source[0] === '=') {
      const result = evalExpr(source.slice(1), () => {
        throw new Error('ref');
      });
      return isFinite(result) ? Math.round(result * 1e6) / 1e6 : null;
    }
    source = source.replace(/R\$|\s/g, '');
    if (source.includes(','))
      source = source.replace(/\./g, '').replace(',', '.');
    const result = parseFloat(source);
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export const kindOf = (column) =>
  column.type === 'formula' ? column.fmt || 'number' : column.type;
export function fmtNum(kind, value) {
  if (
    value == null ||
    value === '' ||
    typeof value !== 'number' ||
    !isFinite(value)
  )
    return '';
  return kind === 'money'
    ? MF.format(value)
    : kind === 'percent'
      ? PF.format(value) + '%'
      : NF.format(value);
}
export const fmtRaw = (value) =>
  value == null || value === '' ? '' : String(value).replace('.', ',');
export const formatCurrency = (value) => fmtNum('money', Number(value)) || '';
export const formatNumber = (value, maxDigits = 2) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDigits }).format(
    Number(value),
  );
export function formatDate(value) {
  const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(value || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || '';
}

export function cellVal(column, row, tab, depth = 0) {
  if (column.type === 'formula') {
    if (!column.formula || depth > 4) return null;
    try {
      const value = evalExpr(column.formula, (name) => {
        const referenced = tab.cols.find(
          (item) =>
            item.name.trim().toLowerCase() === name.trim().toLowerCase(),
        );
        if (!referenced) throw new Error('ref');
        const result = cellVal(referenced, row, tab, depth + 1);
        return typeof result === 'number'
          ? result
          : result === true
            ? 1
            : parseNum(result) || 0;
      });
      return isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }
  const value = row.cells ? row.cells[column.id] : undefined;
  return value === undefined ? null : value;
}

export function dispText(column, row, tab) {
  const value = cellVal(column, row, tab);
  if (value == null || value === '') return '';
  switch (column.type) {
    case 'number':
    case 'money':
    case 'formula':
      return fmtNum(kindOf(column), value);
    case 'date':
      return formatDate(value);
    case 'check':
      return value ? '✓' : '';
    default:
      return String(value);
  }
}

export function totalOf(column, rows, tab) {
  const values = rows
    .map((row) => cellVal(column, row, tab))
    .filter((value) => value != null && value !== '' && value !== false);
  if (column.total === 'count') return values.length;
  const numbers = values
    .map((value) =>
      value === true ? 1 : typeof value === 'number' ? value : null,
    )
    .filter((value) => value != null);
  if (!numbers.length) return null;
  switch (column.total) {
    case 'sum':
      return numbers.reduce((sum, value) => sum + value, 0);
    case 'avg':
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    default:
      return null;
  }
}

export function fmtTotal(column, value) {
  if (value == null) return '—';
  if (column.total === 'count' || column.type === 'check')
    return NF0.format(value);
  return fmtNum(kindOf(column), value) || '—';
}

export const isNumeric = (column) =>
  ['number', 'money', 'formula'].includes(column.type);
export function sortRows(rows, column, direction, tab) {
  const getValue = (row) => {
    const value = cellVal(column, row, tab);
    return value == null || value === '' ? null : value;
  };
  return rows.slice().sort((left, right) => {
    const a = getValue(left);
    const b = getValue(right);
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const comparison =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
    return direction * comparison;
  });
}

export const col = (name, type, extra) =>
  Object.assign({ id: uid(), name, type }, extra || {});
export const TEMPLATES = [
  {
    key: 'blank',
    name: 'Em branco',
    icon: '📋',
    hue: 0,
    desc: 'Uma planilha simples para montar do seu jeito.',
    tabs: () => [
      {
        id: uid(),
        name: 'Planilha 1',
        cols: [col('Item', 'text'), col('Valor', 'money', { total: 'sum' })],
      },
    ],
  },
  {
    key: 'taxi',
    name: 'Corridas',
    icon: '🚕',
    hue: 1,
    desc: 'Data, cliente, trecho, km, valor e valor por km. Mais uma aba de gastos.',
    tabs: () => [
      {
        id: uid(),
        name: 'Corridas',
        cols: [
          col('Data', 'date'),
          col('Cliente', 'text'),
          col('Origem', 'text'),
          col('Destino', 'text'),
          col('Km', 'number', { total: 'sum' }),
          col('Valor', 'money', { total: 'sum' }),
          col('Passagem', 'money', { total: 'sum' }),
          col('Saída', 'time'),
          col('Chegada', 'time'),
          col('Valor/km', 'formula', {
            formula: '({Valor}+{Passagem})/{Km}',
            fmt: 'money',
            total: 'avg',
          }),
        ],
      },
      {
        id: uid(),
        name: 'Gastos',
        cols: [
          col('Data', 'date'),
          col('Tipo', 'select', {
            opts: ['Gasolina', 'Manutenção', 'Passagem', 'Outros'],
          }),
          col('Descrição', 'text'),
          col('Valor', 'money', { total: 'sum' }),
        ],
      },
    ],
  },
  {
    key: 'car',
    name: 'Manutenção do carro',
    icon: '🔧',
    hue: 4,
    desc: 'Serviços feitos, com km e valor, e as trocas periódicas.',
    tabs: () => [
      {
        id: uid(),
        name: 'Serviços',
        cols: [
          col('Data', 'date'),
          col('Serviço', 'text'),
          col('Categoria', 'select', {
            opts: [
              'Motor',
              'Pneus',
              'Suspensão',
              'Elétrica',
              'Documentos',
              'Outros',
            ],
          }),
          col('KM', 'number'),
          col('Valor', 'money', { total: 'sum' }),
          col('Local', 'text'),
        ],
      },
      {
        id: uid(),
        name: 'Periódicas',
        cols: [
          col('Serviço', 'text'),
          col('Último km', 'number'),
          col('A cada (km)', 'number'),
          col('Próxima troca', 'formula', {
            formula: '{Último km}+{A cada (km)}',
            fmt: 'number',
          }),
        ],
      },
    ],
  },
  {
    key: 'list',
    name: 'Lista de compras',
    icon: '🛒',
    hue: 2,
    desc: 'Itens, preço, prioridade, onde comprar e se já comprou.',
    tabs: () => [
      {
        id: uid(),
        name: 'Lista',
        cols: [
          col('Item', 'text'),
          col('Preço', 'money', { total: 'sum' }),
          col('Prioridade', 'select', { opts: ['Alta', 'Média', 'Baixa'] }),
          col('Local', 'text'),
          col('Comprado', 'check', { total: 'count' }),
        ],
      },
    ],
  },
  {
    key: 'money',
    name: 'Finanças',
    icon: '💰',
    hue: 3,
    desc: 'Entradas, gastos fixos e variáveis e quanto guardar.',
    tabs: () => [
      {
        id: uid(),
        name: 'Lançamentos',
        cols: [
          col('Data', 'date'),
          col('Descrição', 'text'),
          col('Tipo', 'select', {
            opts: ['Entrada', 'Gasto fixo', 'Gasto variável', 'Guardar'],
          }),
          col('Valor', 'money', { total: 'sum' }),
        ],
      },
    ],
  },
];
