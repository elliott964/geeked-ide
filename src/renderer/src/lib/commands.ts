import { useStore } from '../state/store'
import { fillComposer } from './composerBus'

export interface Command {
  id: string
  title: string
  category?: string
  icon?: string
  keys?: string
  run: () => void
  enabled?: () => boolean
}

const api = window.geeked
const s = (): ReturnType<typeof useStore.getState> => useStore.getState()

function activeChatId(): string | null {
  const st = s()
  const tab = st.tabs.find((t) => t.id === st.activeTabId)
  return tab?.kind === 'chat' ? tab.id : null
}

const hasProject = (): boolean => !!s().project
const hasChat = (): boolean => !!activeChatId()

export const COMMANDS: Command[] = [
  { id: 'chat.new', title: 'New Chat', category: 'Chat', icon: 'comment-discussion', keys: 'Ctrl+N', run: () => s().newChat() },
  { id: 'project.new', title: 'New Project…', category: 'Project', icon: 'new-folder', keys: 'Ctrl+Shift+N', run: () => s().setDialog('newProject') },
  { id: 'project.open', title: 'Open Project…', category: 'Project', icon: 'folder-opened', keys: 'Ctrl+O', run: () => void s().openProjectDialog() },
  { id: 'project.close', title: 'Close Project', category: 'Project', icon: 'close', run: () => void s().closeProject(), enabled: hasProject },
  {
    id: 'project.reveal',
    title: 'Reveal Project in File Explorer',
    category: 'Project',
    icon: 'folder',
    run: () => {
      const p = s().project
      if (p) void api.projects.reveal(p.path)
    },
    enabled: hasProject
  },
  {
    id: 'project.copyPath',
    title: 'Copy Project Path',
    category: 'Project',
    icon: 'copy',
    run: () => {
      const p = s().project
      if (p) void navigator.clipboard.writeText(p.path).then(() => s().toast({ kind: 'success', title: 'Path copied' }, 1800))
    },
    enabled: hasProject
  },
  { id: 'palette.commands', title: 'Show All Commands', category: 'View', icon: 'symbol-misc', keys: 'Ctrl+Shift+P', run: () => s().setPalette('commands') },
  { id: 'palette.files', title: 'Go to File…', category: 'View', icon: 'go-to-file', keys: 'Ctrl+P', run: () => s().setPalette('files'), enabled: hasProject },
  { id: 'chat.model', title: 'Change Model…', category: 'Chat', icon: 'sparkle', keys: 'Ctrl+Shift+M', run: () => s().setPalette('model'), enabled: hasChat },
  { id: 'chat.effort', title: 'Change Thinking Effort…', category: 'Chat', icon: 'lightbulb', keys: 'Ctrl+Shift+T', run: () => s().setPalette('effort'), enabled: hasChat },
  { id: 'chat.mode', title: 'Change Permission Mode…', category: 'Chat', icon: 'shield', run: () => s().setPalette('mode'), enabled: hasChat },
  {
    id: 'chat.stop',
    title: 'Stop GeekedGPT',
    category: 'Chat',
    icon: 'debug-stop',
    run: () => {
      const id = activeChatId()
      if (id) void s().interrupt(id)
    },
    enabled: () => {
      const id = activeChatId()
      return !!id && s().chats[id]?.status === 'running'
    }
  },
  {
    id: 'chat.compact',
    title: 'Compact Conversation',
    category: 'Chat',
    icon: 'fold',
    run: () => {
      const id = activeChatId()
      if (id) void s().send(id, '/compact')
    },
    enabled: () => {
      const id = activeChatId()
      return !!id && !!s().chats[id]?.persisted
    }
  },
  {
    id: 'chat.context',
    title: 'Show Context Usage',
    category: 'Chat',
    icon: 'graph',
    run: () => {
      const id = activeChatId()
      if (id) void s().send(id, '/context')
    },
    enabled: hasChat
  },
  {
    id: 'chat.init',
    title: 'Create CLAUDE.md Project Guide',
    category: 'Chat',
    icon: 'book',
    run: () => {
      const id = activeChatId() ?? s().newChat()
      if (id) fillComposer(id, '/init')
    },
    enabled: hasProject
  },
  { id: 'chat.close', title: 'Close Tab', category: 'View', icon: 'close', keys: 'Ctrl+W', run: () => { const a = s().activeTabId; if (a) s().closeTab(a) } },
  { id: 'tab.next', title: 'Next Tab', category: 'View', keys: 'Ctrl+Tab', run: () => s().cycleTab(1) },
  { id: 'tab.prev', title: 'Previous Tab', category: 'View', keys: 'Ctrl+Shift+Tab', run: () => s().cycleTab(-1) },
  { id: 'view.sidebar', title: 'Toggle Side Bar', category: 'View', icon: 'layout-sidebar-left', keys: 'Ctrl+B', run: () => s().setUi({ sidebarVisible: !s().sidebarVisible }) },
  { id: 'view.panel', title: 'Toggle Panel', category: 'View', icon: 'layout-panel', keys: 'Ctrl+J', run: () => s().setUi({ panelVisible: !s().panelVisible }) },
  { id: 'view.explorer', title: 'Show Explorer', category: 'View', icon: 'files', keys: 'Ctrl+Shift+E', run: () => s().setUi({ sidebarView: 'explorer', sidebarVisible: true }) },
  { id: 'view.chats', title: 'Show Chat History', category: 'View', icon: 'history', keys: 'Ctrl+Shift+H', run: () => s().setUi({ sidebarView: 'chats', sidebarVisible: true }) },
  { id: 'view.capabilities', title: 'Show Agent Capabilities', category: 'View', icon: 'extensions', keys: 'Ctrl+Shift+X', run: () => s().setUi({ sidebarView: 'capabilities', sidebarVisible: true }) },
  { id: 'view.browser', title: 'Toggle Browser', category: 'View', icon: 'globe', keys: 'Ctrl+Shift+B', run: () => s().setUi({ browserVisible: !s().browserVisible }) },
  {
    id: 'browser.newTab',
    title: 'New Browser Tab',
    category: 'Browser',
    icon: 'add',
    run: () => {
      s().setUi({ browserVisible: true })
      void api.browser.newTab()
    }
  },
  { id: 'view.todos', title: 'Show Todos', category: 'View', icon: 'checklist', run: () => s().setUi({ panelVisible: true, panelTab: 'todos' }) },
  { id: 'view.output', title: 'Show Agent Output Log', category: 'View', icon: 'output', run: () => s().setUi({ panelVisible: true, panelTab: 'output' }) },
  { id: 'settings.open', title: 'Open Settings', category: 'Preferences', icon: 'settings-gear', keys: 'Ctrl+,', run: () => s().openTab({ kind: 'settings', id: 'settings' }) },
  { id: 'view.welcome', title: 'Show Welcome Page', category: 'Help', icon: 'home', run: () => s().openTab({ kind: 'welcome', id: 'welcome' }) },
  { id: 'help.shortcuts', title: 'Keyboard Shortcuts', category: 'Help', icon: 'keyboard', keys: 'Ctrl+/', run: () => s().setDialog('shortcuts') },
  { id: 'help.about', title: 'About Geeked IDE', category: 'Help', icon: 'info', run: () => s().setDialog('about') },
  { id: 'view.zoomIn', title: 'Zoom In', category: 'View', icon: 'zoom-in', keys: 'Ctrl+=', run: () => void api.app.menuRole('zoomIn') },
  { id: 'view.zoomOut', title: 'Zoom Out', category: 'View', icon: 'zoom-out', keys: 'Ctrl+-', run: () => void api.app.menuRole('zoomOut') },
  { id: 'view.zoomReset', title: 'Reset Zoom', category: 'View', keys: 'Ctrl+0', run: () => void api.app.menuRole('resetZoom') },
  { id: 'view.fullscreen', title: 'Toggle Full Screen', category: 'View', icon: 'screen-full', keys: 'F11', run: () => void api.app.menuRole('toggleFullScreen') },
  { id: 'dev.tools', title: 'Toggle Developer Tools', category: 'Developer', icon: 'tools', keys: 'Ctrl+Shift+I', run: () => void api.app.menuRole('toggleDevTools') },
  { id: 'dev.reload', title: 'Reload Window', category: 'Developer', icon: 'refresh', run: () => void api.app.menuRole('reload') },
  { id: 'app.quit', title: 'Exit', category: 'File', icon: 'sign-out', run: () => void api.app.menuRole('quit') }
]

export function command(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id)
}

export function runCommand(id: string): void {
  const c = command(id)
  if (c && (c.enabled?.() ?? true)) c.run()
}

/** Normalize a keyboard event to a "Ctrl+Shift+P" style combo. */
export function comboOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  let key = e.key
  if (key === '+') key = '='
  if (key === '_') key = '-'
  if (key === '?') key = '/'
  if (key === '<') key = ','
  if (key.length === 1) key = key.toUpperCase()
  parts.push(key)
  return parts.join('+')
}
