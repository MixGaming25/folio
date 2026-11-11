'use strict';

const $ = (selector) => document.querySelector(selector);
const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v13m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  moon: '<path d="M20.5 13.4A8.5 8.5 0 0 1 10.6 3.5a8.5 8.5 0 1 0 9.9 9.9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 16h.01"/>',
  leaf: '<path d="M20 4c1 11-4 17-11 14C2 15 5 5 20 4ZM4 21 15 10"/>',
  coffee: '<path d="M4 8h13v6a6 6 0 0 1-12 0V8Zm13 1h2a3 3 0 0 1 0 6h-2M3 21h16M8 2v3m5-3v3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  print: '<path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

const defaults = { theme: 'light', size: 17, font: 'sans', width: 'comfortable', sidebar: true };
let settings = { ...defaults };
try { Object.assign(settings, JSON.parse(localStorage.getItem('folio-settings')) || {}); } catch { /* Storage may be disabled. */ }
let docs = [], activeId = null, database, welcome, nativePicker = false, sourceMode = false;
let matches = [], matchIndex = -1, saveTimer, toastTimer, dragDepth = 0, opening = false;
let diskAvailable = true;
const scroll = $('#reading-scroll');
const fonts = { sans: "'Folio Sans',sans-serif", serif: "Georgia,'Noto Serif',serif", mono: "'DejaVu Sans Mono',monospace" };
const activeDoc = () => docs.find(d => d.id === activeId);

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200);
}
function applySettings() {
  settings.size = Math.max(13, Math.min(24, Number(settings.size) || 17));
  document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light';
  document.documentElement.style.setProperty('--reading-size', `${settings.size}px`);
  document.documentElement.style.setProperty('--reading-font', fonts[settings.font] || fonts.sans);
  document.documentElement.style.setProperty('--page-width', settings.width === 'wide' ? '950px' : '730px');
  $('#highlight-theme').href = `/vendor/highlight-${settings.theme === 'dark' ? 'dark' : 'light'}.css`;
  $('#theme-toggle').innerHTML = icon(settings.theme === 'dark' ? 'sun' : 'moon');
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`);
  $('#size-value').textContent = settings.size;
  $('#font-select').value = settings.font;
  $('#width-select').value = settings.width;
  document.body.classList.toggle('sidebar-hidden', !settings.sidebar);
  $('#toggle-sidebar').setAttribute('aria-expanded', String(settings.sidebar));
  try { localStorage.setItem('folio-settings', JSON.stringify(settings)); } catch { /* Nonessential. */ }
}
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'X-Folio-Token': window.FOLIO_TOKEN } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not open the file.');
  return data;
}
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('folio-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local library is unavailable.'));
  });
}
async function restoreLibrary() {
  try {
    database = await openDatabase();
    const state = await new Promise((resolve, reject) => {
      const request = database.transaction('state').objectStore('state').get('library');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (state && Array.isArray(state.docs)) {
      docs = state.docs.filter(d => d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.content === 'string');
      activeId = state.activeId;
    }
  } catch { toast('Local history is unavailable. You can still open and read files.'); }
}
function persist() {
  if (!database) return;
  try {
    const transaction = database.transaction('state', 'readwrite');
    transaction.objectStore('state').put({ docs, activeId }, 'library');
    transaction.onerror = () => toast('Could not save reading history. Your original files are safe.');
  } catch { /* Reading should work even without persistent storage. */ }
}
function rememberPosition() {
  const doc = activeDoc();
  if (doc) doc.position = scroll.scrollTop;
}
function renderLibrary() {
  const filter = $('#library-filter').value.toLocaleLowerCase();
  const list = $('#documents');
  list.replaceChildren();
  $('#file-count').textContent = docs.length;
  for (const doc of docs.filter(d => d.name.toLocaleLowerCase().includes(filter))) {
    const row = document.createElement('div');
    row.className = `document-item${doc.id === activeId ? ' active' : ''}`;
    row.innerHTML = icon('file');
    const button = document.createElement('button');
    button.className = 'document-select';
    button.title = doc.path || doc.name;
    button.textContent = doc.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
    button.setAttribute('aria-current', doc.id === activeId ? 'page' : 'false');
    const sub = document.createElement('small');
    sub.textContent = doc.id === 'welcome' ? 'A good place to begin' : doc.path ? 'Local file · live refresh' : 'Imported document';
    button.append(sub);
    button.onclick = () => selectDoc(doc.id);
    const close = document.createElement('button');
    close.className = 'document-close';
    close.setAttribute('aria-label', `Remove ${doc.name} from library`);
    close.title = 'Remove from library';
    close.innerHTML = icon('close');
    close.onclick = () => {
      rememberPosition();
      docs = docs.filter(d => d.id !== doc.id);
      if (!docs.length) docs.push({ ...welcome });
      if (activeId === doc.id) { activeId = docs[0].id; renderDocument(); }
      renderLibrary(); persist();
    };
    row.append(button, close); list.append(row);
  }
  if (!list.children.length) {
    const empty = document.createElement('p');
    empty.className = 'no-documents'; empty.textContent = 'No matching documents.'; list.append(empty);
  }
}
function selectDoc(id) {
  rememberPosition(); activeId = id;
  document.body.classList.remove('mobile-library-open');
  renderLibrary(); renderDocument(); persist();
}
function addDocuments(incoming) {
  if (!incoming.length) return;
  rememberPosition();
  for (const doc of incoming) {
    const index = docs.findIndex(d => d.id === doc.id);
    if (index >= 0) docs[index] = { ...doc, position: docs[index].position || 0 };
    else docs.push({ ...doc, position: 0 });
  }
  activeId = incoming[incoming.length - 1].id;
  renderLibrary(); renderDocument(); persist();
  toast(incoming.length === 1 ? `Opened ${incoming[0].name}` : `Opened ${incoming.length} documents`);
}

function renderDocument(keepPosition = false) {
  const doc = activeDoc();
  if (!doc) return;
  const position = keepPosition ? scroll.scrollTop : doc.position || 0;
  $('#current-filename').textContent = doc.name;
  $('#current-filename').title = doc.path || doc.name;
  document.title = `${doc.name} — Folio`;
  $('#document-category').textContent = doc.id === 'welcome' ? 'A GOOD PLACE TO BEGIN' : 'YOUR WORDS, A LITTLE MORE BEAUTIFUL';
  const content = $('#content');
  content.innerHTML = DOMPurify.sanitize(marked.parse(doc.content, { gfm: true, breaks: false }), {
    USE_PROFILES: { html: true }, SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea', 'iframe', 'audio', 'video'],
    FORBID_ATTR: ['style', 'autofocus', 'srcset'],
  });
  content.querySelectorAll('input').forEach(input => { if (input.type === 'checkbox') input.disabled = true; else input.remove(); });
  content.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (/^(https?:)?\/\//i.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  });
  content.querySelectorAll('img').forEach(image => {
    const src = image.getAttribute('src') || '';
    image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    if (src && !/^(https?:|data:)/i.test(src)) {
      if (doc.path) image.src = `/api/asset?token=${encodeURIComponent(window.FOLIO_TOKEN)}&base=${encodeURIComponent(doc.path)}&path=${encodeURIComponent(decodeURI(src))}`;
      else { image.removeAttribute('src'); image.title = 'Use Open a file to load images relative to a document on disk.'; }
    }
  });
  content.querySelectorAll('pre > code').forEach(code => {
    const pre = code.parentElement;
    const language = [...code.classList].find(c => c.startsWith('language-'))?.slice(9) || 'text';
    if (code.textContent.length < 100000 && hljs.getLanguage(language)) hljs.highlightElement(code);
    const label = document.createElement('span'); label.className = 'code-language'; label.textContent = language;
    const copy = document.createElement('button'); copy.className = 'copy-code'; copy.innerHTML = icon('copy') + 'Copy';
    copy.setAttribute('aria-label', 'Copy code');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(code.textContent); copy.textContent = 'Copied!'; setTimeout(() => { copy.innerHTML = icon('copy') + 'Copy'; }, 1800); }
      catch { toast('Clipboard unavailable. Select the code to copy it.'); }
    };
    pre.append(label, copy);
  });
  content.querySelectorAll('table').forEach(table => {
    const wrap = document.createElement('div'); wrap.className = 'table-wrap';
    table.before(wrap); wrap.append(table);
  });
  const headings = [...content.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const usedIds = new Set();
  headings.forEach(h => {
    const base = h.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-') || 'section';
    let id = base, count = 1;
    while (usedIds.has(id)) id = `${base}-${count++}`;
    usedIds.add(id); h.id = id;
  });
  const toc = $('#toc'); toc.replaceChildren();
  const tocHeadings = headings.filter(h => h.tagName === 'H2' || h.tagName === 'H3');
  for (const h of tocHeadings.length ? tocHeadings : headings) {
    const a = document.createElement('a'); a.textContent = h.textContent; a.href = `#${h.id}`;
    a.className = `depth-${h.tagName.slice(1)}`;
    a.onclick = event => { event.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveHeading(h.id); };
    toc.append(a);
  }
  toc.firstElementChild?.classList.add('active');
  $('#source-view').textContent = doc.content;
  content.hidden = sourceMode; $('#source-view').hidden = !sourceMode;
  const words = content.textContent.trim().split(/\s+/u).filter(Boolean).length;
  $('#word-count').textContent = `${words.toLocaleString()} words`;
  $('#read-time').textContent = `${Math.max(1, Math.ceil(words / 220))} min read`;
  $('#document-status').textContent = sourceMode ? 'Source' : 'Markdown';
  $('#source-label').textContent = sourceMode ? 'View rendered document' : 'View Markdown source';
  if (!$('#find-bar').hidden) runSearch();
  requestAnimationFrame(() => { scroll.scrollTop = position; updateProgress(); });
}
function setActiveHeading(id) {
  $('#toc').querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
}
function updateProgress() {
  const total = scroll.scrollHeight - scroll.clientHeight;
  $('#scroll-progress').textContent = `${total > 1 ? Math.min(100, Math.round(scroll.scrollTop / total * 100)) : 100}%`;
  if (!sourceMode) {
    const links = [...$('#toc').querySelectorAll('a')];
    let current = links[0];
    const top = scroll.getBoundingClientRect().top + 100;
    for (const link of links) {
      const heading = document.getElementById(link.getAttribute('href').slice(1));
      if (heading && heading.getBoundingClientRect().top <= top) current = link;
    }
    if (current) setActiveHeading(current.getAttribute('href').slice(1));
  }
}
scroll.addEventListener('scroll', () => {
  updateProgress(); rememberPosition(); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400);
}, { passive: true });
window.addEventListener('resize', updateProgress);
window.addEventListener('pagehide', () => { rememberPosition(); persist(); });

async function openFiles() {
  if (opening) return;
  if (!nativePicker) { $('#file-input').click(); return; }
  opening = true; $('#open-file').disabled = true;
  try {
    const data = await api('/api/open', { method: 'POST' });
    if (data.fallback) $('#file-input').click();
    else { addDocuments(data.documents || []); if (data.errors?.length) toast(data.errors.join(' ')); }
  } catch (error) { toast(error.message); }
  finally { opening = false; $('#open-file').disabled = false; }
}
async function importFiles(files) {
  const imported = [], errors = [];
  for (const file of files) {
    if (!/\.(md|markdown|mdown|mkd|txt)$/i.test(file.name)) { errors.push(`${file.name}: choose a Markdown or text file.`); continue; }
    if (file.size > 20 * 1024 * 1024) { errors.push(`${file.name} is larger than 20 MB.`); continue; }
    imported.push({ id: `import:${file.name}:${file.lastModified}:${file.size}`, name: file.name, content: await file.text(), modified: file.lastModified });
  }
  addDocuments(imported);
  if (errors.length) toast(errors.join(' '));
}
$('#open-file').onclick = openFiles;
$('#file-input').onchange = async event => { try { await importFiles([...event.target.files]); } catch (error) { toast(error.message); } event.target.value = ''; };
$('#library-filter').oninput = renderLibrary;
$('#home').onclick = event => { event.preventDefault(); if (!docs.some(d => d.id === 'welcome')) docs.unshift({ ...welcome }); selectDoc('welcome'); };
$('#theme-toggle').onclick = () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(); };
function toggleSidebar() {
  if (window.matchMedia('(max-width:650px)').matches) {
    const open = document.body.classList.toggle('mobile-library-open');
    $('#toggle-sidebar').setAttribute('aria-expanded', String(open));
  } else { settings.sidebar = !settings.sidebar; applySettings(); }
}
$('#toggle-sidebar').onclick = toggleSidebar;
$('#size-minus').onclick = () => { settings.size--; applySettings(); };
$('#size-plus').onclick = () => { settings.size++; applySettings(); };
$('#font-select').onchange = event => { settings.font = event.target.value; applySettings(); };
$('#width-select').onchange = event => { settings.width = event.target.value; applySettings(); };
function closePopovers() {
  $('#appearance').hidden = true; $('#action-menu').hidden = true;
  $('#appearance-toggle').setAttribute('aria-expanded', 'false'); $('#more-toggle').setAttribute('aria-expanded', 'false');
}
for (const [buttonId, menuId] of [['appearance-toggle', 'appearance'], ['more-toggle', 'action-menu']]) {
  $(`#${buttonId}`).onclick = () => {
    const wasOpen = !$(`#${menuId}`).hidden; closePopovers();
    $(`#${menuId}`).hidden = wasOpen; $(`#${buttonId}`).setAttribute('aria-expanded', String(!wasOpen));
  };
}
document.addEventListener('click', event => { if (!event.target.closest('.popover,#appearance-toggle,#more-toggle')) closePopovers(); });
function toggleFocus(force) {
  if (typeof force === 'boolean') document.body.classList.toggle('focus-mode', force);
  else document.body.classList.toggle('focus-mode');
  $('#focus-toggle').innerHTML = icon('focus') + (document.body.classList.contains('focus-mode') ? 'Leave focus mode' : 'Enter focus mode') + '<kbd>F</kbd>';
  closePopovers(); updateProgress();
}
$('#focus-toggle').onclick = () => toggleFocus();
$('#source-toggle').onclick = () => { rememberPosition(); sourceMode = !sourceMode; renderDocument(true); closePopovers(); };
$('#download-md').onclick = () => {
  const doc = activeDoc(); if (!doc) return;
  const url = URL.createObjectURL(new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = doc.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000); closePopovers();
};
$('#print-document').onclick = () => { if (sourceMode) { sourceMode = false; renderDocument(true); } closePopovers(); window.print(); };
$('#clear-library').onclick = () => {
  docs = [{ ...welcome }]; activeId = 'welcome'; renderLibrary(); renderDocument(); persist(); closePopovers();
  toast('Library cleared. Your original files are untouched.');
};
$('#help').onclick = () => $('#shortcuts').showModal();
$('#help-close').onclick = () => $('#shortcuts').close();
$('#shortcuts').onclick = event => { if (event.target === $('#shortcuts') && (event.offsetX < 0 || event.offsetX > event.target.offsetWidth || event.offsetY < 0 || event.offsetY > event.target.offsetHeight)) $('#shortcuts').close(); };

function clearMatches() {
  for (const mark of document.querySelectorAll('mark.search-match')) mark.replaceWith(document.createTextNode(mark.textContent));
  $('#content').normalize(); $('#source-view').normalize(); matches = []; matchIndex = -1;
}
function runSearch() {
  clearMatches();
  const query = $('#find-input').value.toLocaleLowerCase();
  if (query) {
    const root = sourceMode ? $('#source-view') : $('#content');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement.closest('button,.code-language') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.textContent, lower = text.toLocaleLowerCase();
      let pos = 0, index = lower.indexOf(query), fragment;
      while (index >= 0 && matches.length < 2000) {
        fragment ||= document.createDocumentFragment();
        fragment.append(document.createTextNode(text.slice(pos, index)));
        const mark = document.createElement('mark'); mark.className = 'search-match'; mark.textContent = text.slice(index, index + query.length);
        matches.push(mark); fragment.append(mark); pos = index + query.length; index = lower.indexOf(query, pos);
      }
      if (fragment) { fragment.append(document.createTextNode(text.slice(pos))); node.replaceWith(fragment); }
    }
  }
  if (matches.length) moveMatch(1);
  else $('#find-count').textContent = query ? 'No matches' : '';
}
function moveMatch(delta) {
  if (!matches.length) return;
  matches[matchIndex]?.classList.remove('current');
  matchIndex = (matchIndex + delta + matches.length) % matches.length;
  matches[matchIndex].classList.add('current'); matches[matchIndex].scrollIntoView({ block: 'center', behavior: 'instant' });
  $('#find-count').textContent = `${matchIndex + 1} / ${matches.length}${matches.length === 2000 ? '+' : ''}`;
}
function openSearch() { $('#find-bar').hidden = false; $('#find-input').focus(); $('#find-input').select(); }
function closeSearch() { $('#find-bar').hidden = true; clearMatches(); }
$('#search-toggle').onclick = () => $('#find-bar').hidden ? openSearch() : closeSearch();
$('#find-input').oninput = runSearch;
$('#find-input').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); } };
$('#find-next').onclick = () => moveMatch(1);
$('#find-prev').onclick = () => moveMatch(-1);
$('#find-close').onclick = closeSearch;

document.addEventListener('keydown', event => {
  const typing = event.target.matches('input,textarea,select,[contenteditable=true]');
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'o') { event.preventDefault(); openFiles(); }
  else if (mod && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); }
  else if (mod && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
  else if (event.key === 'Escape') { closePopovers(); closeSearch(); toggleFocus(false); }
  else if (!typing && !mod && !event.altKey && !$('#shortcuts').open && event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFocus(); }
  else if (!typing && !mod && event.key === '/') { event.preventDefault(); settings.sidebar = true; applySettings(); if (window.innerWidth <= 650) document.body.classList.add('mobile-library-open'); $('#library-filter').focus(); }
});
document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; $('#drop-overlay').hidden = false; } });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
document.addEventListener('drop', async event => {
  event.preventDefault(); dragDepth = 0; $('#drop-overlay').hidden = true;
  try { await importFiles([...event.dataTransfer.files]); } catch (error) { toast(error.message); }
});
$('#content').addEventListener('click', async event => {
  const link = event.target.closest('a'); if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#')) {
    event.preventDefault();
    const id = decodeURIComponent(href.slice(1)); const target = document.getElementById(id);
    if (target && $('#content').contains(target)) target.scrollIntoView({ behavior: 'smooth' });
  } else if (href && !/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith('//')) {
    event.preventDefault();
    const doc = activeDoc();
    if (!doc?.path) { toast('Open the original file from disk to follow relative document links.'); return; }
    const relative = new URL(href, `http://local${doc.path}`);
    try {
      const data = await api(`/api/file?path=${encodeURIComponent(decodeURIComponent(relative.pathname))}`);
      addDocuments([data]);
      if (relative.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(relative.hash.slice(1)))?.scrollIntoView());
    } catch (error) { toast(error.message); }
  }
});

async function refreshDiskFile() {
  const doc = activeDoc();
  if (!doc?.path || document.hidden || opening) return;
  try {
    const data = await api(`/api/file?path=${encodeURIComponent(doc.path)}&modified=${encodeURIComponent(doc.modified)}`);
    diskAvailable = true;
    if (doc !== activeDoc() || data.unchanged) return;
    rememberPosition(); Object.assign(doc, data); renderDocument(true); persist(); toast('Updated from disk');
  } catch (error) {
    if (diskAvailable) toast('Live refresh paused. Check that the file and Folio server are still available.');
    diskAvailable = false;
  }
}
async function receiveFiles() {
  try {
    const data = await api('/api/pending');
    if (data.documents?.length) addDocuments(data.documents);
  } catch { /* Disk refresh reports a disconnected server when applicable. */ }
}
async function init() {
  applySettings();
  try {
    const response = await fetch('/welcome.md');
    if (!response.ok) throw new Error('Could not load the welcome document.');
    welcome = { id: 'welcome', name: 'Welcome to Folio.md', content: await response.text(), position: 0 };
    await restoreLibrary();
    let startup;
    try { startup = await api('/api/startup'); nativePicker = startup.nativePicker; } catch (error) { toast(error.message); }
    if (!docs.length) docs = [{ ...welcome }];
    // Refresh the built-in guide when the application is updated.
    docs = docs.map(d => d.id === 'welcome' ? { ...welcome, position: d.position || 0 } : d);
    if (!docs.some(d => d.id === activeId)) activeId = docs[0].id;
    if (startup?.documents?.length) addDocuments(startup.documents);
    else { renderLibrary(); renderDocument(); }
    persist(); refreshDiskFile(); setInterval(() => { refreshDiskFile(); receiveFiles(); }, 2000);
  } catch (error) { toast(`Folio could not start: ${error.message}`); }
}
init();
