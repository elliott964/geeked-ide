import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AgentEvent, BrowserState, GeekedApi } from '../shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: GeekedApi = {
  platform: process.platform,
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    menuRole: (role) => ipcRenderer.invoke('app:menuRole', role),
    setTitleBarTheme: (color, symbolColor) => ipcRenderer.invoke('app:titleBarTheme', color, symbolColor)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
    chooseProjectsDir: () => ipcRenderer.invoke('settings:chooseProjectsDir')
  },
  projects: {
    checkName: (name, parentDir) => ipcRenderer.invoke('projects:checkName', name, parentDir),
    create: (name, parentDir) => ipcRenderer.invoke('projects:create', name, parentDir),
    openDialog: () => ipcRenderer.invoke('projects:openDialog'),
    open: (path) => ipcRenderer.invoke('projects:open', path),
    removeRecent: (path) => ipcRenderer.invoke('projects:removeRecent', path),
    reveal: (path) => ipcRenderer.invoke('projects:reveal', path),
    chooseFolder: (defaultPath) => ipcRenderer.invoke('projects:chooseFolder', defaultPath)
  },
  fs: {
    listDir: (dir) => ipcRenderer.invoke('fs:listDir', dir),
    readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
    searchFiles: (root, q) => ipcRenderer.invoke('fs:searchFiles', root, q),
    watch: (root) => ipcRenderer.invoke('fs:watch', root),
    onChanged: (cb) => subscribe<string>('fs:changed', cb)
  },
  chats: {
    list: (projectPath) => ipcRenderer.invoke('chats:list', projectPath),
    load: (sessionId, projectPath) => ipcRenderer.invoke('chats:load', sessionId, projectPath),
    rename: (sessionId, title, projectPath) => ipcRenderer.invoke('chats:rename', sessionId, title, projectPath),
    remove: (sessionId, projectPath) => ipcRenderer.invoke('chats:remove', sessionId, projectPath)
  },
  browser: {
    getState: () => ipcRenderer.invoke('browser:getState'),
    setBounds: (rect) => ipcRenderer.invoke('browser:setBounds', rect),
    navigate: (input) => ipcRenderer.invoke('browser:navigate', input),
    command: (cmd) => ipcRenderer.invoke('browser:command', cmd),
    newTab: (url) => ipcRenderer.invoke('browser:newTab', url),
    selectTab: (id) => ipcRenderer.invoke('browser:selectTab', id),
    closeTab: (id) => ipcRenderer.invoke('browser:closeTab', id),
    clearData: () => ipcRenderer.invoke('browser:clearData'),
    onState: (cb) => subscribe<BrowserState>('browser:state', cb),
    onReveal: (cb) => subscribe<void>('browser:reveal', () => cb())
  },
  agent: {
    start: (opts) => ipcRenderer.invoke('agent:start', opts),
    send: (chatId, opts) => ipcRenderer.invoke('agent:send', chatId, opts),
    interrupt: (chatId) => ipcRenderer.invoke('agent:interrupt', chatId),
    setModel: (chatId, model) => ipcRenderer.invoke('agent:setModel', chatId, model),
    setEffort: (chatId, effort) => ipcRenderer.invoke('agent:setEffort', chatId, effort),
    setPermissionMode: (chatId, mode) => ipcRenderer.invoke('agent:setPermissionMode', chatId, mode),
    respond: (chatId, requestId, response) => ipcRenderer.invoke('agent:respond', chatId, requestId, response),
    stopTask: (chatId, taskId) => ipcRenderer.invoke('agent:stopTask', chatId, taskId),
    rewind: (chatId, uuid) => ipcRenderer.invoke('agent:rewind', chatId, uuid),
    close: (chatId) => ipcRenderer.invoke('agent:close', chatId),
    closeAll: () => ipcRenderer.invoke('agent:closeAll'),
    onEvent: (cb) => subscribe<AgentEvent>('agent:event', cb)
  }
}

contextBridge.exposeInMainWorld('geeked', api)
