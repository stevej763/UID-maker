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
  // Same goes for refresh. v3/v5 regenerate as the name is typed instead.
  $('refresh').disabled = isNameBased(v) || isSingleton(v);
  hintEl.textContent = HINTS[v];
  $('version-badge').textContent = versionEl.selectedOptions[0].textContent.replace(' (default)', '');
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
  $('copy-all').hidden = current.length < 2;
  resultsEl.replaceChildren();
  current.forEach((raw, i) => {
    const text = format(raw) + (opts.comma.checked && i < current.length - 1 ? ',' : '');
    // The UUID itself is the copy button.
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'uuid';
    btn.title = 'Click to copy';
    btn.setAttribute('aria-label', `Copy ${text}`);
    const code = document.createElement('code');
    code.textContent = text;
    btn.append(code);
    btn.addEventListener('click', () => copyOne(btn, format(raw)));
    li.append(btn);
    resultsEl.append(li);
  });
}

async function copyOne(btn, text) {
  if (!(await copy(text, 'Copied', { quiet: true }))) return;
  btn.classList.add('copied');
  clearTimeout(btn.copiedTimer);
  btn.copiedTimer = setTimeout(() => btn.classList.remove('copied'), 1200);
}

function copyAll() {
  if (current.length > 1) copy(allText(), `Copied ${current.length} UUIDs`);
  else if (current.length) copyOne(resultsEl.querySelector('button.uuid'), format(current[0]));
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

// Returns whether the copy worked. With quiet the toast is only announced to
// screen readers, for when the clicked element shows its own feedback.
async function copy(text, message, { quiet = false } = {}) {
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (ok) toast(message, quiet);
  else toast('Couldn\'t copy. Select the text and copy it manually.');
  return ok;
}

let toastTimer;
function toast(message, quiet = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('sr-only', quiet);
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
// Tabs. All panels start closed so the result stays front and centre;
// clicking the open tab again closes it.
// ---------------------------------------------------------------------------
const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab) {
  const opening = tab && tab.getAttribute('aria-selected') !== 'true';
  for (const t of tabs) {
    const on = opening && t === tab;
    t.setAttribute('aria-selected', String(on));
    $(t.getAttribute('aria-controls')).hidden = !on;
  }
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    if (tab.getAttribute('aria-selected') === 'true') selectTab(next);
  });
});

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  run();
  const icon = $('refresh').querySelector('svg');
  icon.classList.remove('spin');
  void icon.getBoundingClientRect(); // restart the animation on repeat clicks
  icon.classList.add('spin');
});
versionEl.addEventListener('change', () => { syncControls(); run(); });
// Regenerate as the count changes. Skip blank or out-of-range values while typing;
// they're clamped when the field loses focus.
const countIsValid = () => countEl.value !== '' && countEl.checkValidity();
countEl.addEventListener('input', () => { if (countIsValid()) run(); });
countEl.addEventListener('change', () => { if (!countIsValid()) run(); });
namespaceEl.addEventListener('change', () => { syncControls(); if (namespaceEl.value !== 'custom') run(); });
nameEl.addEventListener('input', run);
customNsEl.addEventListener('input', run);
Object.values(opts).forEach((el) => el.addEventListener('change', () => { render(); saveSettings(); }));
$('copy-all').addEventListener('click', copyAll);
$('download').addEventListener('click', () => {
  if (!current.length) return;
  const url = URL.createObjectURL(new Blob([allText() + '\n'], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'uuids.txt' });
  a.click();
  URL.revokeObjectURL(url);
});
$('inspect-input').addEventListener('input', renderInspect);

// Keyboard shortcuts: Space or R for new UUIDs, C to copy, Esc to close the open tab.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') {
    const open = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    if (open) { open.focus(); selectTab(null); }
    return;
  }
  if (e.target.closest('input, select, textarea')) return;
  const key = e.key.toLowerCase();
  // Space on a focused button should still press that button.
  if (key === ' ' && e.target.closest('button')) return;
  if (key === ' ' || key === 'r') {
    e.preventDefault();
    if (!$('refresh').disabled) form.requestSubmit();
  } else if (key === 'c') {
    copyAll();
  }
});

loadSettings();
syncControls();
run();
