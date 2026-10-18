// The built-in browser: native tabs (WebContentsView) shown in the IDE's browser
// pane and driven by the agent through the geeked_browser MCP tools.
import { app, BrowserWindow, WebContentsView, nativeImage, session, shell, type Session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserState, BrowserTabState } from '@shared/ipc'

const PARTITION = 'persist:geeked-browser'
const ISOLATED_WORLD = 1001
const MAX_SHOT_EDGE = 1280
const LOG_CAP = 500

export interface ConsoleEntry {
  level: string
  message: string
  source: string
  line: number
  time: number
}

export interface NetworkEntry {
  method: string
  url: string
  status: number | null
  type: string
  error?: string
  time: number
}

interface Tab {
  id: string
  view: WebContentsView
  favicon?: string
  console: ConsoleEntry[]
  network: NetworkEntry[]
  attached: boolean
  /** Multiply screenshot pixels by this to get CSS pixels. */
  shotScale: number
  emulation: string | null
}

export interface Shot {
  data: string
  width: number
  height: number
}

/* ───────────── Page scripts (run in an isolated world, sharing only the DOM) ───────────── */

const PRELUDE = String.raw`
var gk = window.__gk || (window.__gk = { next: 1, map: new Map(), byEl: new WeakMap() });
function gkRef(el) { var r = gk.byEl.get(el); if (!r) { r = 'ref_' + (gk.next++); gk.byEl.set(el, r); gk.map.set(r, new WeakRef(el)); } return r; }
function gkGet(ref) { var w = gk.map.get(ref); var el = w && w.deref(); if (!el || !el.isConnected) throw new Error('Element ' + ref + ' is no longer on the page. Call read_page or find again.'); return el; }
function gkVisible(el) { var s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; if (s.display === 'contents') return true; if (!el.getClientRects().length) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
function gkClean(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > (n || 120) ? s.slice(0, (n || 120) - 1) + '…' : s; }
function gkRole(el) {
  var r = el.getAttribute('role'); if (r) return r;
  var t = el.tagName.toLowerCase();
  if (t === 'a') return el.hasAttribute('href') ? 'link' : '';
  if (t === 'button' || t === 'summary') return 'button';
  if (t === 'input') { var ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (ty === 'checkbox') return 'checkbox'; if (ty === 'radio') return 'radio'; if (ty === 'range') return 'slider';
    if (ty === 'submit' || ty === 'button' || ty === 'reset' || ty === 'image') return 'button'; if (ty === 'hidden') return '';
    if (ty === 'search') return 'searchbox'; return 'textbox'; }
  if (t === 'textarea') return 'textbox'; if (t === 'select') return 'combobox'; if (t === 'option') return 'option';
  if (t === 'img') return 'img'; if (/^h[1-6]$/.test(t)) return 'heading'; if (t === 'nav') return 'navigation';
  if (t === 'main') return 'main'; if (t === 'header') return 'banner'; if (t === 'footer') return 'contentinfo';
  if (t === 'form') return 'form'; if (t === 'ul' || t === 'ol') return 'list'; if (t === 'li') return 'listitem';
  if (t === 'table') return 'table'; if (t === 'tr') return 'row'; if (t === 'td') return 'cell'; if (t === 'th') return 'columnheader';
  if (t === 'dialog') return 'dialog'; if (t === 'label') return 'label'; if (t === 'p') return 'paragraph';
  if (t === 'iframe') return 'iframe'; if (t === 'video') return 'video'; if (t === 'canvas') return 'canvas';
  if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return 'textbox';
  return '';
}
function gkName(el) {
  var a = el.getAttribute('aria-label'); if (a) return gkClean(a);
  var lb = el.getAttribute('aria-labelledby');
  if (lb) { var txt = lb.split(/\s+/).map(function (id) { var x = document.getElementById(id); return x ? x.innerText : ''; }).join(' '); if (txt.trim()) return gkClean(txt); }
  var t = el.tagName.toLowerCase();
  if (t === 'input' || t === 'textarea' || t === 'select') {
    if (el.labels && el.labels.length) return gkClean(el.labels[0].innerText);
    var ty = (el.getAttribute('type') || '').toLowerCase();
    if (ty === 'submit' || ty === 'button') return gkClean(el.value);
    return gkClean(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '');
  }
  if (t === 'img') return gkClean(el.getAttribute('alt') || el.getAttribute('title') || '');
  return gkClean(el.innerText || el.textContent || el.getAttribute('title') || '');
}
function gkInteractive(el) {
  var t = el.tagName.toLowerCase();
  if (t === 'a' && el.hasAttribute('href')) return true;
  if (['button', 'input', 'select', 'textarea', 'summary', 'option'].indexOf(t) >= 0) return !(t === 'input' && el.type === 'hidden');
  var r = el.getAttribute('role');
  if (r && /^(button|link|checkbox|radio|tab|menuitem|menuitemcheckbox|menuitemradio|option|switch|textbox|searchbox|combobox|slider|spinbutton|treeitem)$/.test(r)) return true;
  if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return true;
  if (el.hasAttribute('onclick')) return true;
  var ti = el.getAttribute('tabindex'); if (ti !== null && Number(ti) >= 0) return true;
  return false;
}
function gkDescribe(el, role) {
  var parts = ['- ' + (role || el.tagName.toLowerCase())];
  var name = gkName(el); if (name) parts.push(JSON.stringify(name));
  parts.push('[' + gkRef(el) + ']');
  var t = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(t)) parts.push('level=' + t[1]);
  if (t === 'a' && el.getAttribute('href')) parts.push('href=' + JSON.stringify(gkClean(el.getAttribute('href'), 80)));
  if (t === 'input' || t === 'textarea') {
    var ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (ty === 'checkbox' || ty === 'radio') parts.push(el.checked ? 'checked' : 'unchecked');
    else if (ty === 'password') parts.push(el.value ? 'value=(hidden)' : 'value=""');
    else parts.push('value=' + JSON.stringify(gkClean(el.value, 80)));
  }
  if (t === 'select') { var o = el.options[el.selectedIndex]; parts.push('selected=' + JSON.stringify(o ? gkClean(o.text, 60) : '')); }
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') parts.push('disabled');
  if (el.getAttribute('aria-expanded')) parts.push('expanded=' + el.getAttribute('aria-expanded'));
  if (gkInteractive(el) && gkVisible(el)) { var r = el.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) parts.push('@(' + Math.round((r.left + r.width / 2) / gkScale) + ',' + Math.round((r.top + r.height / 2) / gkScale) + ')'); }
  return parts.join(' ');
}
function gkHeader() {
  return 'Page: ' + document.title + '\nURL: ' + location.href + '\nViewport: ' + innerWidth + 'x' + innerHeight +
    ' · scrolled ' + Math.round(scrollY) + ' of ' + Math.max(0, document.documentElement.scrollHeight - innerHeight) + '\n';
}
`

/** Wraps a page script; `scale` converts CSS pixels to screenshot pixels for reported coordinates. */
function script(body: string, scale = 1): string {
  return `(function () { var gkScale = ${scale > 0 ? scale : 1};\n${PRELUDE}\n${body}\n})()`
}

const READ_PAGE = (filter: 'interactive' | 'all', refId: string | null, maxChars: number, scale: number): string =>
  script(String.raw`
  var filter = ${JSON.stringify(filter)}, maxChars = ${maxChars};
  var root = ${refId ? `gkGet(${JSON.stringify(refId)})` : 'document.body || document.documentElement'};
  var out = [gkHeader()], len = out[0].length, truncated = false;
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1 };
  function emit(line, depth) { if (truncated) return; var s = '  '.repeat(depth) + line; len += s.length + 1; if (len > maxChars) { truncated = true; return; } out.push(s); }
  function walk(el, depth) {
    if (truncated || SKIP[el.tagName]) return;
    if (el.tagName === 'svg') { if (el.getAttribute('aria-label')) emit('- img ' + JSON.stringify(gkClean(el.getAttribute('aria-label'))) + ' [' + gkRef(el) + ']', depth); return; }
    if (getComputedStyle(el).display === 'none') return;
    var next = depth;
    // Hidden wrappers are never listed, but their visible descendants still are.
    if (gkVisible(el) || el === root) {
      var role = gkRole(el), inter = gkInteractive(el);
      if (filter === 'interactive') {
        if (inter) { emit(gkDescribe(el, role), depth); if (el.tagName === 'SELECT' || el.tagName === 'A' || el.tagName === 'BUTTON') return; next = depth + 1; }
      } else if (role || inter) {
        emit(gkDescribe(el, role), depth);
        if (role === 'heading' || el.tagName === 'A' || el.tagName === 'BUTTON' || role === 'paragraph' || el.tagName === 'SELECT' || role === 'img') return;
        next = depth + 1;
      } else {
        var own = '';
        for (var i = 0; i < el.childNodes.length; i++) { var n = el.childNodes[i]; if (n.nodeType === 3) own += n.textContent; }
        own = gkClean(own, 200); if (own.length > 1) emit('- text ' + JSON.stringify(own), depth);
      }
    }
    var kids = el.shadowRoot ? Array.from(el.shadowRoot.children).concat(Array.from(el.children)) : el.children;
    for (var k = 0; k < kids.length; k++) walk(kids[k], next);
  }
  walk(root, 0);
  if (out.length === 1) out.push(filter === 'interactive' ? '(no interactive elements in view — try filter "all")' : '(empty page)');
  if (truncated) out.push('… (truncated at ' + maxChars + ' characters; pass ref_id to read a part, or a larger max_chars)');
  return out.join('\n');
`, scale)

const FIND = (query: string, scale: number): string =>
  script(String.raw`
  var q = ${JSON.stringify(query.toLowerCase())}, hits = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length && hits.length < 60; i++) {
    var el = all[i]; var role = gkRole(el), inter = gkInteractive(el);
    if (!role && !inter) continue;
    var line = (role + ' ' + gkName(el) + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('href') || '') + ' ' + (el.id || '')).toLowerCase();
    if (line.indexOf(q) < 0) continue;
    hits.push({ el: el, role: role, visible: gkVisible(el), inter: inter });
  }
  hits.sort(function (a, b) { return (b.visible - a.visible) || (b.inter - a.inter); });
  if (!hits.length) return 'No elements match ' + JSON.stringify(q) + '.';
  return hits.slice(0, 20).map(function (h) { return gkDescribe(h.el, h.role) + (h.visible ? '' : ' (hidden)'); }).join('\n');
`, scale)

const CENTER = (ref: string): string =>
  script(String.raw`
  var el = gkGet(${JSON.stringify(ref)});
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  var r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: innerWidth, h: innerHeight };
`)

const SCROLL_TO = (ref: string): string =>
  script(String.raw`
  var el = gkGet(${JSON.stringify(ref)}); el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  return 'Scrolled ' + ${JSON.stringify(ref)} + ' into view.';
`)

const FORM_INPUT = (ref: string, value: string | number | boolean): string =>
  script(String.raw`
  var el = gkGet(${JSON.stringify(ref)}), v = ${JSON.stringify(value)}, t = el.tagName.toLowerCase();
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  function fire(n) { el.dispatchEvent(new Event(n, { bubbles: true })); }
  if (t === 'select') {
    var opts = Array.from(el.options), s = String(v).toLowerCase();
    var o = opts.find(function (x) { return x.value === String(v); }) || opts.find(function (x) { return x.text.trim().toLowerCase() === s; }) || opts.find(function (x) { return x.text.toLowerCase().indexOf(s) >= 0; });
    if (!o) throw new Error('No option matches ' + JSON.stringify(v) + '. Options: ' + opts.map(function (x) { return x.text.trim(); }).join(', '));
    el.value = o.value; fire('input'); fire('change'); return 'Selected ' + JSON.stringify(o.text.trim());
  }
  if (t === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
    var want = v === true || v === 'true' || v === 'on' || v === 1 || v === '1';
    if (el.checked !== want) el.click(); return (el.checked ? 'Checked' : 'Unchecked') + ' ' + ${JSON.stringify(ref)};
  }
  if (t === 'input' || t === 'textarea') {
    el.focus();
    var proto = t === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    fire('input'); fire('change'); return 'Set ' + ${JSON.stringify(ref)} + ' to ' + JSON.stringify(String(v));
  }
  if (el.isContentEditable) {
    el.focus(); document.execCommand('selectAll', false); document.execCommand('insertText', false, String(v));
    return 'Set text of ' + ${JSON.stringify(ref)};
  }
  throw new Error(${JSON.stringify(ref)} + ' is a <' + t + '>, which is not a form field.');
`)

const PAGE_TEXT = (maxChars: number): string =>
  script(String.raw`
  var root = document.querySelector('main, article, [role=main]') || document.body || document.documentElement;
  var text = (root.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  var head = gkHeader();
  if (text.length > ${maxChars}) text = text.slice(0, ${maxChars}) + '\n… (truncated)';
  return head + '\n' + (text || '(no visible text)');
`)

const RIPPLE = (x: number, y: number): string =>
  `(function () { var d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:${Math.round(x) - 14}px;top:${Math.round(y) - 14}px;width:28px;height:28px;border-radius:50%;border:3px solid #8b6cff;box-shadow:0 0 16px #8b6cff;pointer-events:none;z-index:2147483647;transform:scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out';
  document.documentElement.appendChild(d); requestAnimationFrame(function () { d.style.transform = 'scale(1.7)'; d.style.opacity = '0'; });
  setTimeout(function () { d.remove(); }, 520); })()`

/* ───────────── Keyboard ───────────── */

interface KeyDef {
  key: string
  code: string
  vk: number
  text?: string
}

const NAMED_KEYS: Record<string, KeyDef> = {
  enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', vk: 9 },
  escape: { key: 'Escape', code: 'Escape', vk: 27 },
  esc: { key: 'Escape', code: 'Escape', vk: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  delete: { key: 'Delete', code: 'Delete', vk: 46 },
  space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  up: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  down: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  right: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  home: { key: 'Home', code: 'Home', vk: 36 },
  end: { key: 'End', code: 'End', vk: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', vk: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  insert: { key: 'Insert', code: 'Insert', vk: 45 }
}
for (let i = 1; i <= 12; i++) NAMED_KEYS[`f${i}`] = { key: `F${i}`, code: `F${i}`, vk: 111 + i }

const MOD_BITS: Record<string, number> = { alt: 1, option: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, super: 4, win: 4, shift: 8 }

function keyDef(name: string, shift: boolean): KeyDef {
  const lower = name.toLowerCase()
  if (NAMED_KEYS[lower]) return NAMED_KEYS[lower]
  if (name.length === 1) {
    const ch = shift ? name.toUpperCase() : name
    if (/[a-z]/i.test(name)) return { key: ch, code: `Key${name.toUpperCase()}`, vk: name.toUpperCase().charCodeAt(0), text: ch }
    if (/[0-9]/.test(name)) return { key: name, code: `Digit${name}`, vk: name.charCodeAt(0), text: name }
    return { key: name, code: '', vk: name.charCodeAt(0), text: name }
  }
  throw new Error(`Unknown key "${name}".`)
}

/* ───────────── Manager ───────────── */

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function normalizeUrl(raw: string): string {
  const input = raw.trim()
  if (!input) throw new Error('Give a URL to open.')
  if (/^(https?|file):/i.test(input)) return input
  if (/^about:blank$/i.test(input)) return input
  // Windows paths ("C:\…") come before the scheme check, since "C:" looks like a URL scheme.
  if (/^[A-Za-z]:[\\/]/.test(input)) return `file:///${input.replace(/\\/g, '/')}`
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(input)) return `http://${input}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) throw new Error(`Only http, https and file URLs can be opened (got "${input}").`)
  if (!/\s/.test(input) && /\.[a-z]{2,}(:\d+)?(\/|$)/i.test(input)) return `https://${input}`
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`
}

class BrowserManager {
  private win: BrowserWindow | null = null
  private ses: Session | null = null
  private tabs: Tab[] = []
  private activeId: string | null = null
  /** Placeholder rectangle in the main window (DIP), or null when the pane is hidden. */
  private bounds: { x: number; y: number; width: number; height: number } | null = null
  private lastSize = { width: 1024, height: 768 }
  private busy: string | null = null
  private emitTimer: NodeJS.Timeout | null = null
  private saveTimer: NodeJS.Timeout | null = null
  /** Tabs from the last run, reopened the first time the browser is shown or used. */
  private pendingRestore: { urls: string[]; active: number } | null = null

  private tabsFile(): string {
    return join(app.getPath('userData'), 'geeked-browser-tabs.json')
  }

  private loadSavedTabs(): void {
    try {
      const p = this.tabsFile()
      if (!existsSync(p)) return
      const raw = JSON.parse(readFileSync(p, 'utf8')) as { urls?: unknown; active?: unknown }
      const urls = Array.isArray(raw.urls) ? raw.urls.filter((u): u is string => typeof u === 'string' && /^(https?|file):/i.test(u)).slice(0, 12) : []
      if (urls.length) this.pendingRestore = { urls, active: typeof raw.active === 'number' ? raw.active : 0 }
    } catch {
      this.pendingRestore = null
    }
  }

  private scheduleSave(): void {
    if (this.pendingRestore || !this.win) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.saveNow(), 500)
  }

  private saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    // Nothing was restored yet: keep the saved list as it is.
    if (this.pendingRestore) return
    const open = this.tabs.filter((t) => !t.view.webContents.isDestroyed() && /^(https?|file):/i.test(t.view.webContents.getURL()))
    const data = { urls: open.map((t) => t.view.webContents.getURL()), active: Math.max(0, open.findIndex((t) => t.id === this.activeId)) }
    try {
      const p = this.tabsFile()
      writeFileSync(`${p}.tmp`, JSON.stringify(data), 'utf8')
      renameSync(`${p}.tmp`, p)
    } catch {
      // Not critical: tabs just won't be restored.
    }
  }

  private ensureRestored(): void {
    const r = this.pendingRestore
    if (!r || !this.win || this.win.isDestroyed()) return
    this.pendingRestore = null
    if (this.tabs.length) return
    const created = r.urls.map((u, i) => this.createTab(u, i === r.active))
    if (created[r.active]) this.selectTab(created[r.active].id)
  }

  attach(win: BrowserWindow): void {
    this.win = win
    this.loadSavedTabs()
    win.on('close', () => this.saveNow())
    win.on('closed', () => {
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.win = null
      this.tabs = []
      this.activeId = null
    })
  }

  private session(): Session {
    if (this.ses) return this.ses
    const ses = session.fromPartition(PARTITION)
    ses.setUserAgent(ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ geeked-ide\/\S+/i, ''))
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(['clipboard-sanitized-write', 'fullscreen'].includes(permission)))
    const log = (details: { webContentsId?: number; method: string; url: string; resourceType: string }, status: number | null, error?: string): void => {
      const tab = this.tabs.find((t) => t.view.webContents.id === details.webContentsId)
      if (!tab) return
      tab.network.push({ method: details.method, url: details.url, status, type: details.resourceType, error, time: Date.now() })
      if (tab.network.length > LOG_CAP) tab.network.splice(0, tab.network.length - LOG_CAP)
    }
    ses.webRequest.onCompleted((d) => log(d, d.statusCode))
    ses.webRequest.onErrorOccurred((d) => log(d, null, d.error))
    this.ses = ses
    return ses
  }

  /* ── state ── */

  getState(): BrowserState {
    return {
      tabs: this.tabs.map((t) => this.tabState(t)),
      activeId: this.activeId,
      busy: this.busy,
      emulation: this.active()?.emulation ?? null
    }
  }

  private tabState(t: Tab): BrowserTabState {
    const wc = t.view.webContents
    return {
      id: t.id,
      url: wc.getURL(),
      title: wc.getTitle() || wc.getURL() || 'New tab',
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      favicon: t.favicon
    }
  }

  private emit(): void {
    this.scheduleSave()
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.win?.webContents.send('browser:state', this.getState())
    }, 30)
  }

  /* ── layout ── */

  setBounds(rect: { x: number; y: number; width: number; height: number } | null): void {
    if (!this.win || this.win.isDestroyed()) return
    if (rect && rect.width > 4 && rect.height > 4) {
      this.ensureRestored()
      const z = this.win.webContents.getZoomFactor()
      this.bounds = {
        x: Math.round(rect.x * z),
        y: Math.round(rect.y * z),
        width: Math.round(rect.width * z),
        height: Math.round(rect.height * z)
      }
      this.lastSize = { width: this.bounds.width, height: this.bounds.height }
    } else {
      this.bounds = null
    }
    this.layout()
  }

  private layout(): void {
    for (const t of this.tabs) {
      const show = t.id === this.activeId && this.bounds !== null
      if (show) t.view.setBounds(this.bounds!)
      else t.view.setBounds({ x: 0, y: 0, ...this.lastSize })
      t.view.setVisible(show)
    }
  }

  private active(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId)
  }

  private tab(id?: string): Tab {
    const t = id ? this.tabs.find((x) => x.id === id) : this.active()
    if (!t) throw new Error(id ? `No browser tab with id ${id}. Call tabs_context to list tabs.` : 'No browser tab is open. Use navigate to open a page first.')
    return t
  }

  /* ── tabs ── */

  createTab(url?: string, activate = true): Tab {
    if (!this.win || this.win.isDestroyed()) throw new Error('The Geeked IDE window is not available.')
    const view = new WebContentsView({
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true }
    })
    this.session()
    view.setBackgroundColor('#ffffff')
    try {
      view.setBorderRadius(8)
    } catch {
      // Older Electron builds lack rounded views.
    }
    const tab: Tab = { id: randomUUID().slice(0, 8), view, console: [], network: [], attached: false, shotScale: 1, emulation: null }
    const wc = view.webContents
    wc.setWindowOpenHandler(({ url: target }) => {
      if (/^(https?|file):/i.test(target)) this.createTab(target, true)
      return { action: 'deny' }
    })
    wc.on('console-message', (e) => {
      // Electron's own dev-mode warnings are about the app, not the page.
      if (e.message.startsWith('Electron Security Warning')) return
      tab.console.push({ level: e.level, message: e.message, source: e.sourceId, line: e.lineNumber, time: Date.now() })
      if (tab.console.length > LOG_CAP) tab.console.splice(0, tab.console.length - LOG_CAP)
    })
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons.find((i) => /^(https:|data:)/.test(i))
      this.emit()
    })
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) {
      wc.on(ev as 'did-start-loading', () => this.emit())
    }
    wc.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) tab.favicon = undefined
    })
    wc.on('render-process-gone', () => {
      tab.console.push({ level: 'error', message: 'The page crashed.', source: '', line: 0, time: Date.now() })
      this.emit()
    })
    this.win.contentView.addChildView(view)
    this.tabs.push(tab)
    if (activate || !this.activeId) this.activeId = tab.id
    this.layout()
    if (url) void wc.loadURL(normalizeUrl(url)).catch(() => undefined)
    this.emit()
    return tab
  }

  selectTab(id: string): void {
    this.tab(id)
    this.activeId = id
    this.layout()
    this.emit()
  }

  closeTab(id: string): void {
    const i = this.tabs.findIndex((t) => t.id === id)
    if (i < 0) return
    const [t] = this.tabs.splice(i, 1)
    try {
      this.win?.contentView.removeChildView(t.view)
    } catch {
      // Window already gone.
    }
    t.view.webContents.close()
    if (this.activeId === id) this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? null
    this.layout()
    this.emit()
  }

  /** Sign out of everything: cookies, storage and cache of the built-in browser. */
  async clearData(): Promise<void> {
    const ses = this.session()
    await ses.clearStorageData()
    await ses.clearCache()
    for (const t of this.tabs) {
      t.console = []
      t.network = []
    }
  }

  /* ── UI controls ── */

  async uiNavigate(input: string): Promise<{ ok: boolean; error?: string }> {
    let url: string
    try {
      url = normalizeUrl(input)
    } catch (err) {
      return { ok: false, error: errorText(err) }
    }
    const t = this.active() ?? this.createTab()
    // Load failures show as the browser's own error page.
    await t.view.webContents.loadURL(url).catch(() => undefined)
    return { ok: true }
  }

  uiCommand(cmd: 'back' | 'forward' | 'reload' | 'stop' | 'devtools' | 'external'): void {
    const t = this.active()
    if (!t) return
    const wc = t.view.webContents
    if (cmd === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    else if (cmd === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    else if (cmd === 'reload') wc.reload()
    else if (cmd === 'stop') wc.stop()
    else if (cmd === 'devtools') wc.openDevTools({ mode: 'detach' })
    else if (cmd === 'external' && /^https?:/i.test(wc.getURL())) void shell.openExternal(wc.getURL())
  }

  /* ── agent plumbing ── */

  /** Marks the browser busy for the UI and makes sure the pane is visible. */
  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.ensureRestored()
    this.busy = label
    this.emit()
    if (!this.bounds && this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('browser:reveal')
      for (let i = 0; i < 20 && !this.bounds; i++) await sleep(50)
    }
    try {
      return await fn()
    } finally {
      this.busy = null
      this.emit()
    }
  }

  private async cdp<T = unknown>(t: Tab, method: string, params?: Record<string, unknown>): Promise<T> {
    const dbg = t.view.webContents.debugger
    if (!dbg.isAttached()) {
      dbg.attach('1.3')
      t.attached = true
    }
    return (await dbg.sendCommand(method, params)) as T
  }

  private iso<T = unknown>(t: Tab, code: string): Promise<T> {
    return t.view.webContents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code }], true) as Promise<T>
  }

  private async waitForLoad(wc: WebContents, timeoutMs = 20_000): Promise<void> {
    if (!wc.isLoading()) return
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer)
        wc.removeListener('did-stop-loading', done)
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      wc.once('did-stop-loading', done)
    })
  }

  private describe(t: Tab): string {
    const s = this.tabState(t)
    return `Tab ${t.id}: ${s.title}\nURL: ${s.url}`
  }

  /* ── agent actions ── */

  async navigate(url: string, tabId?: string): Promise<string> {
    let t = tabId ? this.tab(tabId) : this.active()
    if (!t) t = this.createTab()
    const wc = t.view.webContents
    if (url === 'back' || url === 'forward') {
      const h = wc.navigationHistory
      if (url === 'back' ? !h.canGoBack() : !h.canGoForward()) return `Can't go ${url}: no history.\n${this.describe(t)}`
      if (url === 'back') h.goBack()
      else h.goForward()
      await sleep(80)
      await this.waitForLoad(wc)
      return `Went ${url}.\n${this.describe(t)}`
    }
    const target = normalizeUrl(url)
    let note = ''
    try {
      await wc.loadURL(target)
    } catch (err) {
      note = `\nLoad reported: ${errorText(err)}`
    }
    await this.waitForLoad(wc)
    return `Opened ${target}${note}\n${this.describe(t)}`
  }

  async screenshot(tabId?: string, region?: number[]): Promise<Shot> {
    const t = this.tab(tabId)
    const wc = t.view.webContents
    const vp = await this.iso<{ w: number; h: number }>(t, '({ w: innerWidth, h: innerHeight })').catch(() => null)
    const cssW = vp?.w || this.lastSize.width
    const cssH = vp?.h || this.lastSize.height
    let rect: Electron.Rectangle | undefined
    if (region && region.length === 4) {
      const [x0, y0, x1, y1] = region.map((n) => n * t.shotScale)
      rect = { x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), width: Math.max(1, Math.round(Math.abs(x1 - x0))), height: Math.max(1, Math.round(Math.abs(y1 - y0))) }
    }
    // Emulated viewports are captured through CDP so the image matches the emulated size.
    let img = t.emulation
      ? nativeImage.createFromBuffer(
          Buffer.from((await this.cdp<{ data: string }>(t, 'Page.captureScreenshot', { format: 'png', ...(rect ? { clip: { ...rect, scale: 1 } } : {}) })).data, 'base64')
        )
      : await wc.capturePage(rect, { stayHidden: false })
    if (img.isEmpty()) throw new Error('The page could not be captured. Make sure the browser pane is open.')
    const baseW = rect ? rect.width : cssW
    const baseH = rect ? rect.height : cssH
    const scale = Math.min(1, MAX_SHOT_EDGE / Math.max(baseW, baseH))
    const outW = Math.max(1, Math.round(baseW * scale))
    const outH = Math.max(1, Math.round(baseH * scale))
    img = img.resize({ width: outW, height: outH, quality: 'best' })
    if (!rect) t.shotScale = baseW / outW
    return { data: img.toJPEG(82).toString('base64'), width: outW, height: outH }
  }

  private async point(t: Tab, coordinate?: number[], ref?: string): Promise<{ x: number; y: number }> {
    if (ref) {
      const c = await this.iso<{ x: number; y: number }>(t, CENTER(ref))
      return { x: c.x, y: c.y }
    }
    if (!coordinate || coordinate.length !== 2) throw new Error('Give a coordinate [x, y] from the latest screenshot, or a ref from read_page/find.')
    return { x: coordinate[0] * t.shotScale, y: coordinate[1] * t.shotScale }
  }

  private async mouse(t: Tab, type: string, x: number, y: number, extra: Record<string, unknown> = {}): Promise<void> {
    await this.cdp(t, 'Input.dispatchMouseEvent', { type, x, y, ...extra })
  }

  async click(opts: { coordinate?: number[]; ref?: string; button?: 'left' | 'right'; clickCount?: number; modifiers?: string; tabId?: string }): Promise<string> {
    const t = this.tab(opts.tabId)
    const { x, y } = await this.point(t, opts.coordinate, opts.ref)
    const mods = parseModifiers(opts.modifiers)
    const button = opts.button ?? 'left'
    const count = opts.clickCount ?? 1
    await this.mouse(t, 'mouseMoved', x, y, { modifiers: mods })
    for (let i = 1; i <= count; i++) {
      await this.mouse(t, 'mousePressed', x, y, { button, clickCount: i, modifiers: mods })
      await this.mouse(t, 'mouseReleased', x, y, { button, clickCount: i, modifiers: mods })
    }
    void this.iso(t, RIPPLE(x, y)).catch(() => undefined)
    await sleep(120)
    await this.waitForLoad(t.view.webContents, 8000)
    const what = count === 3 ? 'Triple-clicked' : count === 2 ? 'Double-clicked' : button === 'right' ? 'Right-clicked' : 'Clicked'
    return `${what} ${opts.ref ?? `at (${opts.coordinate?.join(', ')})`}.`
  }

  async hover(opts: { coordinate?: number[]; ref?: string; tabId?: string }): Promise<string> {
    const t = this.tab(opts.tabId)
    const { x, y } = await this.point(t, opts.coordinate, opts.ref)
    await this.mouse(t, 'mouseMoved', x, y)
    return `Hovered ${opts.ref ?? `at (${opts.coordinate?.join(', ')})`}.`
  }

  async drag(start: number[] | undefined, end: number[] | undefined, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    if (!start || !end) throw new Error('left_click_drag needs start_coordinate and coordinate.')
    const a = await this.point(t, start)
    const b = await this.point(t, end)
    await this.mouse(t, 'mouseMoved', a.x, a.y)
    await this.mouse(t, 'mousePressed', a.x, a.y, { button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      await this.mouse(t, 'mouseMoved', a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10, { button: 'left', buttons: 1 })
    }
    await this.mouse(t, 'mouseReleased', b.x, b.y, { button: 'left', clickCount: 1 })
    return `Dragged from (${start.join(', ')}) to (${end.join(', ')}).`
  }

  async type(text: string, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    await this.cdp(t, 'Input.insertText', { text })
    return `Typed ${JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}…` : text)}.`
  }

  async key(combos: string, repeat = 1, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    const list = combos.trim().split(/\s+/).filter(Boolean)
    if (!list.length) throw new Error('Give one or more keys, like "Enter" or "ctrl+a".')
    for (let r = 0; r < Math.max(1, Math.min(100, repeat)); r++) {
      for (const combo of list) {
        const parts = combo.split('+')
        const name = parts.pop()!
        let mods = 0
        for (const m of parts) {
          const bit = MOD_BITS[m.toLowerCase()]
          if (bit === undefined) throw new Error(`Unknown modifier "${m}".`)
          // On Windows and Linux, cmd/meta shortcuts map to ctrl.
          mods |= bit === 4 && process.platform !== 'darwin' ? 2 : bit
        }
        const def = keyDef(name, (mods & 8) !== 0)
        const typing = def.text !== undefined && (mods & (1 | 2 | 4)) === 0
        const base = { key: def.key, code: def.code, windowsVirtualKeyCode: def.vk, nativeVirtualKeyCode: def.vk, modifiers: mods }
        await this.cdp(t, 'Input.dispatchKeyEvent', { type: typing ? 'keyDown' : 'rawKeyDown', ...base, ...(typing ? { text: def.text, unmodifiedText: def.text } : {}) })
        await this.cdp(t, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base })
      }
    }
    await sleep(60)
    await this.waitForLoad(t.view.webContents, 8000)
    return `Pressed ${combos}${repeat > 1 ? ` ×${repeat}` : ''}.`
  }

  async scroll(opts: { coordinate?: number[]; direction?: string; amount?: number; tabId?: string }): Promise<string> {
    const t = this.tab(opts.tabId)
    const vp = await this.iso<{ w: number; h: number }>(t, '({ w: innerWidth, h: innerHeight })')
    const p = opts.coordinate ? await this.point(t, opts.coordinate) : { x: vp.w / 2, y: vp.h / 2 }
    const amount = Math.max(1, Math.min(10, opts.amount ?? 3)) * 100
    const dir = opts.direction ?? 'down'
    const deltaX = dir === 'left' ? -amount : dir === 'right' ? amount : 0
    const deltaY = dir === 'up' ? -amount : dir === 'down' ? amount : 0
    await this.mouse(t, 'mouseWheel', p.x, p.y, { deltaX, deltaY })
    await sleep(150)
    return `Scrolled ${dir} by ${amount / 100}.`
  }

  async scrollTo(ref: string, tabId?: string): Promise<string> {
    return this.iso<string>(this.tab(tabId), SCROLL_TO(ref))
  }

  async readPage(filter: 'interactive' | 'all', refId?: string, maxChars = 50_000, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    await this.waitForLoad(t.view.webContents, 8000)
    return this.iso<string>(t, READ_PAGE(filter, refId ?? null, maxChars, t.shotScale))
  }

  async find(query: string, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    return this.iso<string>(t, FIND(query, t.shotScale))
  }

  async pageText(maxChars = 50_000, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    await this.waitForLoad(t.view.webContents, 8000)
    return this.iso<string>(t, PAGE_TEXT(maxChars))
  }

  async formInput(ref: string, value: string | number | boolean, tabId?: string): Promise<string> {
    return this.iso<string>(this.tab(tabId), FORM_INPUT(ref, value))
  }

  async evaluate(code: string, tabId?: string): Promise<string> {
    const t = this.tab(tabId)
    const res = await this.cdp<{ result?: { value?: unknown; description?: string; type?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>(
      t,
      'Runtime.evaluate',
      { expression: code, replMode: true, awaitPromise: true, returnByValue: true, userGesture: true, timeout: 30_000 }
    )
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text ?? 'Script error')
    const r = res.result
    if (!r || r.type === 'undefined') return 'undefined'
    const value = r.value !== undefined ? JSON.stringify(r.value, null, 2) : (r.description ?? String(r.type))
    return value.length > 20_000 ? `${value.slice(0, 20_000)}\n… (truncated)` : value
  }

  consoleMessages(opts: { onlyErrors?: boolean; pattern?: string; limit?: number; tabId?: string }): string {
    const t = this.tab(opts.tabId)
    let list = t.console
    if (opts.onlyErrors) list = list.filter((m) => m.level === 'error')
    if (opts.pattern) {
      const p = opts.pattern.toLowerCase()
      list = list.filter((m) => m.message.toLowerCase().includes(p))
    }
    list = list.slice(-(opts.limit ?? 50))
    if (!list.length) return 'No console messages.'
    return list.map((m) => `[${m.level}] ${m.message}${m.source ? ` (${m.source}:${m.line})` : ''}`).join('\n')
  }

  networkRequests(opts: { urlPattern?: string; limit?: number; tabId?: string }): string {
    const t = this.tab(opts.tabId)
    let list = t.network
    if (opts.urlPattern) {
      const p = opts.urlPattern.toLowerCase()
      list = list.filter((r) => r.url.toLowerCase().includes(p))
    }
    list = list.slice(-(opts.limit ?? 50))
    if (!list.length) return 'No network requests recorded.'
    return list.map((r) => `${r.method} ${r.status ?? 'ERR'} ${r.type} ${r.url}${r.error ? ` — ${r.error}` : ''}`).join('\n')
  }

  tabsContext(): string {
    if (!this.tabs.length) return 'No browser tabs are open.'
    return this.tabs
      .map((t) => {
        const s = this.tabState(t)
        return `${t.id === this.activeId ? '* ' : '  '}${t.id}  ${s.title} — ${s.url || 'about:blank'}`
      })
      .join('\n')
  }

  async resize(opts: { preset?: 'mobile' | 'tablet' | 'desktop'; width?: number; height?: number; tabId?: string }): Promise<string> {
    const t = this.tab(opts.tabId)
    if (opts.preset === 'desktop' || (!opts.preset && !opts.width)) {
      await this.cdp(t, 'Emulation.clearDeviceMetricsOverride')
      await this.cdp(t, 'Emulation.setTouchEmulationEnabled', { enabled: false })
      t.emulation = null
      this.emit()
      return 'Cleared viewport emulation; the page fills the browser pane again.'
    }
    const dims = opts.preset === 'mobile' ? { width: 375, height: 812 } : opts.preset === 'tablet' ? { width: 768, height: 1024 } : { width: opts.width ?? 1280, height: opts.height ?? 800 }
    const mobile = opts.preset === 'mobile' || dims.width < 768
    await this.cdp(t, 'Emulation.setDeviceMetricsOverride', { ...dims, deviceScaleFactor: 0, mobile })
    await this.cdp(t, 'Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 })
    t.emulation = `${dims.width}×${dims.height}`
    this.emit()
    return `Viewport set to ${dims.width}×${dims.height}${mobile ? ' (mobile)' : ''}.`
  }
}

function parseModifiers(mods?: string): number {
  if (!mods) return 0
  let bits = 0
  for (const m of mods.split('+')) {
    const b = MOD_BITS[m.trim().toLowerCase()]
    if (b !== undefined) bits |= b === 4 && process.platform !== 'darwin' ? 2 : b
  }
  return bits
}

export const browser = new BrowserManager()
