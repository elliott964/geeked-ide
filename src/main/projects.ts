import { dialog, shell, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { NameCheck, ProjectInfo } from '@shared/ipc'
import { addRecentProject, getPublicSettings } from './settings'
import { setProjectRoot } from './files'

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

export function checkProjectName(rawName: string, parentDir?: string): NameCheck {
  const dir = parentDir?.trim() || getPublicSettings().projectsDir
  const name = rawName.trim()
  const fullPath = name ? join(dir, name) : dir
  if (!name) return { ok: false, error: 'Give your project a name.', fullPath }
  if (name.length > 100) return { ok: false, error: 'That name is too long (100 characters max).', fullPath }
  if (INVALID_CHARS.test(name)) return { ok: false, error: 'Names can\'t contain < > : " / \\ | ? *', fullPath }
  if (name === '.' || name === '..') return { ok: false, error: 'That name is reserved.', fullPath }
  if (/[. ]$/.test(name)) return { ok: false, error: "Names can't end with a dot or a space.", fullPath }
  if (RESERVED.test(name)) return { ok: false, error: `"${name}" is a reserved name on Windows.`, fullPath }
  if (existsSync(fullPath)) return { ok: false, error: 'A folder with that name already exists here.', fullPath }
  return { ok: true, fullPath }
}

function activate(path: string): ProjectInfo {
  const full = resolve(path)
  const project = { name: basename(full) || full, path: full }
  addRecentProject(project.name, project.path)
  setProjectRoot(project.path)
  return project
}

export function createProject(
  name: string,
  parentDir?: string
): { ok: true; project: ProjectInfo } | { ok: false; error: string } {
  const check = checkProjectName(name, parentDir)
  if (!check.ok) return { ok: false, error: check.error ?? 'Invalid name.' }
  try {
    const dir = parentDir?.trim() || getPublicSettings().projectsDir
    mkdirSync(dir, { recursive: true })
    // Non-recursive so we never silently reuse a folder created in the meantime.
    mkdirSync(check.fullPath)
    return { ok: true, project: activate(check.fullPath) }
  } catch (err) {
    return { ok: false, error: `Couldn't create the folder: ${(err as Error).message}` }
  }
}

export function openProject(path: string): { ok: true; project: ProjectInfo } | { ok: false; error: string } {
  try {
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      return { ok: false, error: "That folder doesn't exist anymore." }
    }
    return { ok: true, project: activate(path) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function openProjectDialog(win: BrowserWindow | null): Promise<ProjectInfo | null> {
  const projectsDir = getPublicSettings().projectsDir
  const opts: Electron.OpenDialogOptions = {
    title: 'Open Project',
    buttonLabel: 'Open Project',
    defaultPath: existsSync(projectsDir) ? projectsDir : undefined,
    properties: ['openDirectory', 'createDirectory']
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return null
  const opened = openProject(res.filePaths[0])
  return opened.ok ? opened.project : null
}

export async function chooseFolder(win: BrowserWindow | null, title: string, defaultPath?: string): Promise<string | null> {
  const opts: Electron.OpenDialogOptions = {
    title,
    buttonLabel: 'Select Folder',
    defaultPath: defaultPath && existsSync(defaultPath) ? defaultPath : undefined,
    properties: ['openDirectory', 'createDirectory']
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || !res.filePaths[0]) return null
  return res.filePaths[0]
}

export async function revealPath(path: string): Promise<void> {
  if (existsSync(path)) await shell.openPath(path)
}
