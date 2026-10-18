import { app, BrowserWindow, ipcMain, Menu, screen, shell, type IpcMainInvokeEvent } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BrowserCommand, BrowserRect, MenuRole, PermissionResponse, SendOptions, SettingsPatch, StartChatOptions } from '@shared/ipc'
import type { EffortKey, ModelKey, PermissionModeKey } from '@shared/models'
import * as agent from './agent'
import { browser } from './browser'
import { listDir, readPreview, searchFiles, setProjectRoot, watchProject } from './files'
import { checkProjectName, chooseFolder, createProject, openProject, openProjectDialog, revealPath } from './projects'
import {
  getPublicSettings,
  getWindowBounds,
  removeRecentProject,
  setApiKey,
  setWindowBounds,
  updateSettings
} from './settings'

const here = dirname(fileURLToPath(import.meta.url))
const TITLEBAR_HEIGHT = 36
let mainWindow: BrowserWindow | null = null

app.setAppUserModelId('com.geeked.ide')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

function iconPath(): string | undefined {
  const p = join(app.getAppPath(), 'resources', 'icon.png')
  return existsSync(p) ? p : undefined
}

function restoredBounds(): { x?: number; y?: number; width: number; height: number; maximized: boolean } {
  const saved = getWindowBounds()
  const fallback = { width: 1440, height: 900, maximized: false }
  if (!saved) return fallback
  // Only restore a position that is still on a connected display.
  if (saved.x !== undefined && saved.y !== undefined) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return saved.x! < a.x + a.width - 100 && saved.x! + saved.width > a.x + 100 && saved.y! >= a.y - 20 && saved.y! < a.y + a.height - 100
    })
    if (!visible) return { width: saved.width, height: saved.height, maximized: saved.maximized }
  }
  return saved
}

function createWindow(): void {
  const bounds = restoredBounds()
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 920,
    minHeight: 600,
    show: false,
    title: 'Geeked IDE',
    backgroundColor: '#0c0d11',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0d11', symbolColor: '#c3c7d4', height: TITLEBAR_HEIGHT },
    icon: iconPath(),
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  mainWindow = win
  browser.attach(win)
  if (bounds.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  const saveBounds = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    const b = win.getNormalBounds()
    setWindowBounds({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() })
  }
  win.on('close', saveBounds)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Never navigate away from the app or open child windows; links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  win.webContents.on('context-menu', (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = []
    for (const s of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) })
    }
    if (params.misspelledWord) {
      items.push({
        label: 'Add to Dictionary',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
    }
    if (items.length) items.push({ type: 'separator' })
    if (params.isEditable) {
      items.push({ role: 'cut', enabled: params.editFlags.canCut })
      items.push({ role: 'copy', enabled: params.editFlags.canCopy })
      items.push({ role: 'paste', enabled: params.editFlags.canPaste })
      items.push({ type: 'separator' }, { role: 'selectAll' })
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' })
    }
    if (params.linkURL && /^https?:\/\//i.test(params.linkURL)) {
      items.push({ label: 'Open Link in Browser', click: () => void shell.openExternal(params.linkURL) })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(here, '../renderer/index.html'))
  }
}

function senderWindow(e: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

function handleMenuRole(e: IpcMainInvokeEvent, role: MenuRole): void {
  const win = senderWindow(e)
  if (!win) return
  const wc = win.webContents
  switch (role) {
    case 'undo': return wc.undo()
    case 'redo': return wc.redo()
    case 'cut': return wc.cut()
    case 'copy': return wc.copy()
    case 'paste': return wc.paste()
    case 'selectAll': return wc.selectAll()
    case 'zoomIn': return wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5))
    case 'zoomOut': return wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3))
    case 'resetZoom': return wc.setZoomLevel(0)
    case 'toggleFullScreen': return win.setFullScreen(!win.isFullScreen())
    case 'toggleDevTools': return wc.toggleDevTools()
    case 'reload': return wc.reload()
    case 'minimize': return win.minimize()
    case 'quit': return app.quit()
  }
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('app:menuRole', (e, role: MenuRole) => handleMenuRole(e, role))
  ipcMain.handle('app:titleBarTheme', (e, color: string, symbolColor: string) => {
    senderWindow(e)?.setTitleBarOverlay({ color, symbolColor, height: TITLEBAR_HEIGHT })
  })

  ipcMain.handle('settings:get', () => getPublicSettings())
  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) => updateSettings(patch))
  ipcMain.handle('settings:setApiKey', (_e, key: string | null) => setApiKey(key))
  ipcMain.handle('settings:chooseProjectsDir', async (e) => {
    const dir = await chooseFolder(senderWindow(e), 'Choose where new projects are created', getPublicSettings().projectsDir)
    if (dir) updateSettings({ projectsDir: dir })
    return dir
  })

  ipcMain.handle('projects:checkName', (_e, name: string, parentDir?: string) => checkProjectName(name, parentDir))
  ipcMain.handle('projects:create', (_e, name: string, parentDir?: string) => createProject(name, parentDir))
  ipcMain.handle('projects:openDialog', (e) => openProjectDialog(senderWindow(e)))
  ipcMain.handle('projects:open', (_e, path: string) => openProject(path))
  ipcMain.handle('projects:removeRecent', (_e, path: string) => removeRecentProject(path))
  ipcMain.handle('projects:reveal', (_e, path: string) => revealPath(path))
  ipcMain.handle('projects:chooseFolder', (e, defaultPath?: string) =>
    chooseFolder(senderWindow(e), 'Choose a folder for this project', defaultPath)
  )

  ipcMain.handle('fs:listDir', (_e, dir: string) => listDir(dir))
  ipcMain.handle('fs:readFile', (_e, path: string) => readPreview(path))
  ipcMain.handle('fs:searchFiles', (_e, root: string, q: string) => searchFiles(root, q))
  ipcMain.handle('fs:watch', (_e, root: string | null) => {
    if (!root) setProjectRoot(null)
    watchProject(root)
  })

  ipcMain.handle('chats:list', (_e, projectPath: string) => agent.listChats(projectPath))
  ipcMain.handle('chats:load', (_e, sessionId: string, projectPath: string) => agent.loadChat(sessionId, projectPath))
  ipcMain.handle('chats:rename', (_e, sessionId: string, title: string, projectPath: string) =>
    agent.renameChat(sessionId, title, projectPath)
  )
  ipcMain.handle('chats:remove', (_e, sessionId: string, projectPath: string) => agent.removeChat(sessionId, projectPath))

  ipcMain.handle('browser:getState', () => browser.getState())
  ipcMain.handle('browser:setBounds', (_e, rect: BrowserRect | null) => browser.setBounds(rect))
  ipcMain.handle('browser:navigate', (_e, input: string) => browser.uiNavigate(input))
  ipcMain.handle('browser:command', (_e, cmd: BrowserCommand) => browser.uiCommand(cmd))
  ipcMain.handle('browser:newTab', (_e, url?: string) => {
    browser.createTab(url, true)
  })
  ipcMain.handle('browser:selectTab', (_e, id: string) => browser.selectTab(id))
  ipcMain.handle('browser:closeTab', (_e, id: string) => browser.closeTab(id))
  ipcMain.handle('browser:clearData', () => browser.clearData())

  ipcMain.handle('agent:start', (_e, opts: StartChatOptions) => agent.startChat(opts))
  ipcMain.handle('agent:send', (_e, chatId: string, opts: SendOptions) => agent.sendMessage(chatId, opts))
  ipcMain.handle('agent:interrupt', (_e, chatId: string) => agent.interrupt(chatId))
  ipcMain.handle('agent:setModel', (_e, chatId: string, model: ModelKey) => agent.setModel(chatId, model))
  ipcMain.handle('agent:setEffort', (_e, chatId: string, effort: EffortKey) => agent.setEffort(chatId, effort))
  ipcMain.handle('agent:setPermissionMode', (_e, chatId: string, mode: PermissionModeKey) =>
    agent.setPermissionMode(chatId, mode)
  )
  ipcMain.handle('agent:respond', (_e, chatId: string, requestId: string, response: PermissionResponse) =>
    agent.respondPermission(chatId, requestId, response)
  )
  ipcMain.handle('agent:stopTask', (_e, chatId: string, taskId: string) => agent.stopTask(chatId, taskId))
  ipcMain.handle('agent:rewind', (_e, chatId: string, uuid: string) => agent.rewindFiles(chatId, uuid))
  ipcMain.handle('agent:close', (_e, chatId: string) => agent.closeChat(chatId))
  ipcMain.handle('agent:closeAll', () => agent.closeAllChats())
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => agent.closeAllChats())

app.on('window-all-closed', () => {
  agent.closeAllChats()
  if (process.platform !== 'darwin') app.quit()
})
