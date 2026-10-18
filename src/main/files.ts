import { BrowserWindow } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import type { DirEntry, FilePreview } from '@shared/ipc'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'out', 'build', '.venv', 'venv', '__pycache__', '.cache', 'release', 'target'])
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}
const MAX_TEXT = 2 * 1024 * 1024
const MAX_IMAGE = 10 * 1024 * 1024
const MAX_INDEX = 25_000

let projectRoot: string | null = null
let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null
let index: { root: string; files: string[] } | null = null

export function setProjectRoot(root: string | null): void {
  projectRoot = root ? resolve(root) : null
  index = null
}

/** Only paths inside the open project may be read by the renderer. */
function assertInProject(p: string): string {
  const full = resolve(p)
  if (!projectRoot) throw new Error('No project is open.')
  const rel = relative(projectRoot, full)
  if (rel.startsWith('..') || resolve(projectRoot, rel) !== full) throw new Error('Path is outside the open project.')
  return full
}

export async function listDir(dir: string): Promise<DirEntry[]> {
  const full = assertInProject(dir)
  const entries = await readdir(full, { withFileTypes: true })
  const out: DirEntry[] = []
  for (const e of entries) {
    if (e.name === '.git') continue
    let isDir = e.isDirectory()
    if (e.isSymbolicLink()) {
      try {
        isDir = (await stat(join(full, e.name))).isDirectory()
      } catch {
        isDir = false
      }
    }
    out.push({ name: e.name, path: join(full, e.name), isDir })
  }
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return out.sort((a, b) => (a.isDir === b.isDir ? collator.compare(a.name, b.name) : a.isDir ? -1 : 1))
}

export async function readPreview(path: string): Promise<FilePreview> {
  let full: string
  try {
    full = assertInProject(path)
  } catch {
    return { path, kind: 'missing', size: 0 }
  }
  let size = 0
  try {
    const st = await stat(full)
    if (!st.isFile()) return { path: full, kind: 'missing', size: 0 }
    size = st.size
  } catch {
    return { path: full, kind: 'missing', size: 0 }
  }
  const imageType = IMAGE_TYPES[extname(full).toLowerCase()]
  if (imageType) {
    if (size > MAX_IMAGE) return { path: full, kind: 'too-large', size }
    const buf = await readFile(full)
    return { path: full, kind: 'image', dataUrl: `data:${imageType};base64,${buf.toString('base64')}`, size }
  }
  if (size > MAX_TEXT) return { path: full, kind: 'too-large', size }
  const buf = await readFile(full)
  const sample = buf.subarray(0, 8000)
  if (sample.includes(0)) return { path: full, kind: 'binary', size }
  return { path: full, kind: 'text', content: buf.toString('utf8'), size }
}

async function buildIndex(root: string): Promise<string[]> {
  const files: string[] = []
  const queue: string[] = [root]
  while (queue.length && files.length < MAX_INDEX) {
    const dir = queue.shift()!
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) queue.push(join(dir, e.name))
      } else if (e.isFile()) {
        files.push(relative(root, join(dir, e.name)).split(sep).join('/'))
        if (files.length >= MAX_INDEX) break
      }
    }
  }
  return files
}

function score(path: string, q: string): number {
  const lower = path.toLowerCase()
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (base === q) return 1000
  if (base.startsWith(q)) return 800 - base.length
  if (base.includes(q)) return 600 - base.length
  if (lower.includes(q)) return 400 - lower.length
  // Subsequence match.
  let i = 0
  for (const ch of lower) if (ch === q[i]) i++
  return i === q.length ? 100 - lower.length : -1
}

export async function searchFiles(root: string, query: string): Promise<string[]> {
  const full = assertInProject(root)
  if (!index || index.root !== full) index = { root: full, files: await buildIndex(full) }
  const q = query.trim().toLowerCase().replace(/\\/g, '/')
  if (!q) return index.files.slice(0, 50)
  return index.files
    .map((f) => ({ f, s: score(f, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 50)
    .map((x) => x.f)
}

export function watchProject(root: string | null): void {
  watcher?.close()
  watcher = null
  if (!root) return
  const full = assertInProject(root)
  try {
    watcher = watch(full, { recursive: true }, (_event, filename) => {
      const name = filename ? filename.toString() : ''
      if (/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(name)) return
      index = null
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('fs:changed', full)
      }, 250)
    })
    watcher.on('error', () => {
      watcher?.close()
      watcher = null
    })
  } catch {
    watcher = null
  }
}
