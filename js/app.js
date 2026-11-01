import { v1, v3, v4, v5, v6, v7, inspect, isValid, NAMESPACES, NIL, MAX } from './uuid.js';

const $ = (id) => document.getElementById(id);
const form = $('generator');
const versionEl = $('version');
const countEl = $('count');
const nameFields = $('name-fields');
const namespaceEl = $('namespace');
const customNsField = $('custom-ns-field');
const customNsEl = $('custom-ns');
const nameEl = $('name');
const hintEl = $('version-hint');
const resultsEl = $('results');
const errorEl = $('error');
const toastEl = $('toast');
const opts = {
  upper: $('opt-upper'),
  noHyphen: $('opt-nohyphen'),
  braces: $('opt-braces'),
  quotes: $('opt-quotes'),
  comma: $('opt-comma'),
};

const HINTS = {
  4: 'Fully random. The right choice for almost everything.',
  7: 'Starts with a millisecond timestamp, so values sort by creation time. Great for database keys.',
  1: 'Timestamp plus a node ID. Browsers can\'t read a MAC address, so a random node ID is used.',
  6: 'Same data as v1, reordered so values sort by creation time.',
  5: 'Always gives the same UUID for the same namespace and name. Preferred over v3.',
  3: 'Like v5 but uses MD5. Only use it for compatibility with older systems.',
  nil: 'The special all-zero UUID.',
  max: 'The special all-ones UUID.',
};

const isNameBased = (v) => v === '3' || v === '5';
const isSingleton = (v) => v === 'nil' || v === 'max';

let current = [];

function syncControls() {
  const v = versionEl.value;
  nameFields.hidden = !isNameBased(v);
  customNsField.hidden = namespaceEl.value !== 'custom';
  // Name based and special UUIDs are deterministic, so "how many" is meaningless.
  countEl.disabled = isNameBased(v) || isSingleton(v);
  hintEl.textContent = HINTS[v];
}

function format(uuid) {
  let s = opts.noHyphen.checked ? uuid.replace(/-/g, '') : uuid;
  if (opts.upper.checked) s = s.toUpperCase();
  if (opts.braces.checked) s = `{${s}}`;
  if (opts.quotes.checked) s = `"${s}"`;
  return s;
}

async function generate() {
  const v = versionEl.value;
  if (isNameBased(v)) {
    const ns = namespaceEl.value === 'custom' ? customNsEl.value.trim() : NAMESPACES[namespaceEl.value];
    if (!isValid(ns)) throw new Error('Custom namespace must be a valid UUID.');
    const name = nameEl.value;
    if (!name) throw new Error('Enter a name to hash.');
    return [v === '5' ? await v5(name, ns) : v3(name, ns)];
  }
  if (v === 'nil') return [NIL];
  if (v === 'max') return [MAX];

  const count = Math.min(1000, Math.max(1, parseInt(countEl.value, 10) || 1));
  countEl.value = count;
  const fn = { 1: v1, 4: v4, 6: v6, 7: v7 }[v];
  return Array.from({ length: count }, () => fn());
}

function render() {
  resultsEl.replaceChildren();
  current.forEach((raw, i) => {
    const text = format(raw) + (opts.comma.checked && i < current.length - 1 ? ',' : '');
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', `Copy ${text}`);
    btn.addEventListener('click', () => copy(format(raw), 'Copied'));
    li.append(code, btn);
    resultsEl.append(li);
  });
}

function allText() {
  const lines = current.map(format);
  return opts.comma.checked ? lines.join(',\n') : lines.join('\n');
}

async function run() {
  errorEl.hidden = true;
  try {
    current = await generate();
    render();
    saveSettings();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1400);
}

// ---------------------------------------------------------------------------
// Format options persist in localStorage so they stick between visits.
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'uuid-maker-settings';

function saveSettings() {
  const data = {
    count: countEl.value,
    namespace: namespaceEl.value,
    customNs: customNsEl.value,
    name: nameEl.value,
    opts: Object.fromEntries(Object.entries(opts).map(([k, el]) => [k, el.checked])),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

function loadSettings() {
  // The page always opens on v4 unless a link asks for another version with ?v=7 etc.
  const version = new URLSearchParams(location.search).get('v');
  if (version && HINTS[version]) versionEl.value = version;
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { /* ignore */ }
  if (data.count) countEl.value = data.count;
  if (data.namespace) namespaceEl.value = data.namespace;
  if (data.customNs) customNsEl.value = data.customNs;
  if (data.name) nameEl.value = data.name;
  for (const [k, el] of Object.entries(opts)) el.checked = Boolean(data.opts?.[k]);
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
function renderInspect() {
  const out = $('inspect-output');
  out.replaceChildren();
  const value = $('inspect-input').value;
  if (!value.trim()) return;
  const info = inspect(value);
  const rows = info.valid
    ? [
      ['Valid', 'Yes'],
      ['Normalised', info.uuid],
      ['Version', typeof info.version === 'number' ? `v${info.version}` : info.version],
      ...(info.variant ? [['Variant', info.variant]] : []),
      ...(info.timestamp ? [['Created', `${info.timestamp.toISOString()} (${info.timestamp.toLocaleString()})`]] : []),
    ]
    : [['Valid', 'No, that isn\'t a UUID']];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    out.append(dt, dd);
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
versionEl.addEventListener('change', () => { syncControls(); run(); });
namespaceEl.addEventListener('change', () => { syncControls(); if (namespaceEl.value !== 'custom') run(); });
Object.values(opts).forEach((el) => el.addEventListener('change', () => { render(); saveSettings(); }));
$('copy-all').addEventListener('click', () => current.length && copy(allText(), `Copied ${current.length}`));
$('download').addEventListener('click', () => {
  if (!current.length) return;
  const url = URL.createObjectURL(new Blob([allText() + '\n'], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'uuids.txt' });
  a.click();
  URL.revokeObjectURL(url);
});
$('inspect-input').addEventListener('input', renderInspect);

loadSettings();
syncControls();
run();
