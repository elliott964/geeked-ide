import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AppSettings, RecentProject, SettingsPatch } from '@shared/ipc'
import { EFFORTS, MODELS, PERMISSION_MODES } from '@shared/models'

interface StoredSettings extends Omit<AppSettings, 'hasApiKey'> {
  /** API key encrypted with the OS keychain (DPAPI on Windows), base64. */
  apiKeyEncrypted: string | null
  windowBounds: { x?: number; y?: number; width: number; height: number; maximized: boolean } | null
}

const MAX_RECENTS = 15

function settingsPath(): string {
  return join(app.getPath('userData'), 'geeked-settings.json')
}

function defaults(): StoredSettings {
  return {
    projectsDir: join(app.getPath('documents'), 'Geeked Projects'),
    recentProjects: [],
    defaultModel: 'standard',
    defaultEffort: 'high',
    defaultPermissionMode: 'default',
    ultraUnlocked: false,
    showUltra: true,
    reduceMotion: false,
    sendOnEnter: true,
    claudeInChrome: false,
    lastProjectPath: null,
    apiKeyEncrypted: null,
    windowBounds: null
  }
}

let cache: StoredSettings | null = null

function sanitize(raw: Partial<StoredSettings>): StoredSettings {
  const d = defaults()
  const s: StoredSettings = { ...d, ...raw }
  if (typeof s.projectsDir !== 'string' || !s.projectsDir.trim()) s.projectsDir = d.projectsDir
  else s.projectsDir = resolve(s.projectsDir.trim())
  if (!MODELS.some((m) => m.key === s.defaultModel)) s.defaultModel = d.defaultModel
  if (!EFFORTS.some((e) => e.key === s.defaultEffort)) s.defaultEffort = d.defaultEffort
  if (!PERMISSION_MODES.some((m) => m.key === s.defaultPermissionMode)) s.defaultPermissionMode = d.defaultPermissionMode
  // Ultra can't be the default while it is locked.
  if (s.defaultModel === 'ultra' && !s.ultraUnlocked) s.defaultModel = d.defaultModel
  if (!Array.isArray(s.recentProjects)) s.recentProjects = []
  s.recentProjects = s.recentProjects
    .filter((r): r is RecentProject => !!r && typeof r.path === 'string' && typeof r.name === 'string')
    .slice(0, MAX_RECENTS)
  for (const key of ['ultraUnlocked', 'showUltra', 'reduceMotion', 'sendOnEnter', 'claudeInChrome'] as const) {
    if (typeof s[key] !== 'boolean') s[key] = d[key]
  }
  return s
}

function load(): StoredSettings {
  if (cache) return cache
  try {
    const p = settingsPath()
    cache = existsSync(p) ? sanitize(JSON.parse(readFileSync(p, 'utf8'))) : defaults()
  } catch {
    cache = defaults()
  }
  return cache
}

function save(s: StoredSettings): void {
  cache = s
  const p = settingsPath()
  mkdirSync(app.getPath('userData'), { recursive: true })
  const tmp = `${p}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8')
  renameSync(tmp, p)
}

export function getPublicSettings(): AppSettings {
  const { apiKeyEncrypted, windowBounds: _wb, ...rest } = load()
  return { ...rest, hasApiKey: !!apiKeyEncrypted }
}

export function updateSettings(patch: SettingsPatch): AppSettings {
  const next = sanitize({ ...load(), ...patch })
  save(next)
  return getPublicSettings()
}

export function setApiKey(key: string | null): AppSettings {
  const s = { ...load() }
  const trimmed = key?.trim()
  if (!trimmed) {
    s.apiKeyEncrypted = null
  } else {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system, so the key was not saved.')
    }
    s.apiKeyEncrypted = safeStorage.encryptString(trimmed).toString('base64')
  }
  save(s)
  return getPublicSettings()
}

export function getApiKey(): string | null {
  const enc = load().apiKeyEncrypted
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

export function addRecentProject(name: string, path: string): AppSettings {
  const s = { ...load() }
  const lower = path.toLowerCase()
  s.recentProjects = [
    { name, path, lastOpened: Date.now() },
    ...s.recentProjects.filter((r) => r.path.toLowerCase() !== lower)
  ].slice(0, MAX_RECENTS)
  s.lastProjectPath = path
  save(s)
  return getPublicSettings()
}

export function removeRecentProject(path: string): AppSettings {
  const s = { ...load() }
  const lower = path.toLowerCase()
  s.recentProjects = s.recentProjects.filter((r) => r.path.toLowerCase() !== lower)
  if (s.lastProjectPath?.toLowerCase() === lower) s.lastProjectPath = null
  save(s)
  return getPublicSettings()
}

export function getWindowBounds(): StoredSettings['windowBounds'] {
  return load().windowBounds
}

export function setWindowBounds(bounds: StoredSettings['windowBounds']): void {
  save({ ...load(), windowBounds: bounds })
}
