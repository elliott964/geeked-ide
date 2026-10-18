import { create } from 'zustand'
import type { AgentEvent, AppSettings, BrowserState, ChatSummary, ImageAttachment, PermissionResponse, ProjectInfo, SettingsPatch } from '@shared/ipc'
import { getModel, type EffortKey, type ModelKey, type PermissionModeKey } from '@shared/models'
import { applyHistory, applyMessage } from './reduce'
import type { Chat, Item, PanelTab, SidebarView, Tab, Toast } from './types'

const api = window.geeked

interface PersistedTab {
  kind: Tab['kind']
  id: string
  path?: string
  title?: string
  model?: ModelKey
  effort?: EffortKey
  permissionMode?: PermissionModeKey
  persisted?: boolean
}

interface UiPrefs {
  sidebarVisible: boolean
  sidebarWidth: number
  sidebarView: SidebarView
  panelVisible: boolean
  panelHeight: number
  panelTab: PanelTab
  browserVisible: boolean
  browserWidth: number
}

export type DialogKind = 'newProject' | 'about' | 'shortcuts' | null
export type PaletteMode = 'commands' | 'files' | 'model' | 'effort' | 'mode' | null

interface State extends UiPrefs {
  ready: boolean
  version: string
  settings: AppSettings | null
  project: ProjectInfo | null
  tabs: Tab[]
  activeTabId: string | null
  chats: Record<string, Chat>
  history: ChatSummary[]
  historyLoading: boolean
  fsVersion: number
  output: string[]
  toasts: Toast[]
  dialog: DialogKind
  palette: PaletteMode
  focusComposerTick: number
  browserState: BrowserState
  /** True while a pane is being drag-resized (the native browser view hides meanwhile). */
  resizing: boolean

  init: () => Promise<void>
  updateSettings: (patch: SettingsPatch) => Promise<void>
  setSettings: (s: AppSettings) => void
  unlockUltra: () => void

  openProjectPath: (path: string) => Promise<boolean>
  openProjectDialog: () => Promise<void>
  createProject: (name: string, parentDir?: string) => Promise<{ ok: boolean; error?: string }>
  closeProject: () => Promise<void>
  refreshHistory: () => Promise<void>

  openTab: (tab: Tab) => void
  activateTab: (id: string) => void
  closeTab: (id: string) => void
  reorderTabs: (tabs: Tab[]) => void
  cycleTab: (dir: 1 | -1) => void

  newChat: () => string | null
  openHistoryChat: (summary: ChatSummary) => Promise<void>
  renameChat: (chatId: string, title: string) => Promise<void>
  deleteChat: (sessionId: string) => Promise<void>
  ensureStarted: (chatId: string) => Promise<boolean>
  send: (chatId: string, text: string, attachments?: ImageAttachment[]) => Promise<void>
  interrupt: (chatId: string) => Promise<void>
  setChatModel: (chatId: string, model: ModelKey) => void
  setChatEffort: (chatId: string, effort: EffortKey) => void
  setChatPermissionMode: (chatId: string, mode: PermissionModeKey) => void
  respondPermission: (chatId: string, requestId: string, response: PermissionResponse) => void
  stopBackgroundTask: (chatId: string, taskId: string) => void
  rewindTo: (chatId: string, uuid: string) => Promise<void>
  dismissSuggestion: (chatId: string) => void

  handleEvents: (events: AgentEvent[]) => void
  toast: (t: Omit<Toast, 'id'>, ms?: number) => void
  dismissToast: (id: string) => void
  setDialog: (d: DialogKind) => void
  setPalette: (p: PaletteMode) => void
  setUi: (patch: Partial<UiPrefs>) => void
  focusComposer: () => void
  clearOutput: () => void
  setResizing: (v: boolean) => void
}

const UI_KEY = 'geeked.ui'
const layoutKey = (path: string): string => `geeked.layout.${path.toLowerCase()}`

function loadUi(): UiPrefs {
  const d: UiPrefs = {
    sidebarVisible: true,
    sidebarWidth: 280,
    sidebarView: 'explorer',
    panelVisible: false,
    panelHeight: 240,
    panelTab: 'todos',
    browserVisible: false,
    browserWidth: 560
  }
  try {
    const raw = localStorage.getItem(UI_KEY)
    return raw ? { ...d, ...JSON.parse(raw) } : d
  } catch {
    return d
  }
}

function saveUi(p: UiPrefs): void {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(p))
  } catch {
    // Storage can be unavailable; prefs just won't persist.
  }
}

function makeChat(id: string, projectPath: string, settings: AppSettings | null, over: Partial<Chat> = {}): Chat {
  const model = settings?.defaultModel ?? 'standard'
  return {
    id,
    title: 'New chat',
    projectPath,
    model: model === 'ultra' && !settings?.ultraUnlocked ? 'standard' : model,
    effort: settings?.defaultEffort ?? 'high',
    permissionMode: settings?.defaultPermissionMode ?? 'default',
    persisted: false,
    status: 'idle',
    loadingHistory: false,
    items: [],
    live: null,
    toolResults: {},
    toolElapsed: {},
    permissions: [],
    todos: [],
    pendingTaskCreates: {},
    subagents: {},
    backgroundTasks: [],
    capabilities: null,
    init: null,
    costUsd: 0,
    contextTokens: 0,
    contextWindow: 0,
    outputTokens: 0,
    suggestion: null,
    statusText: null,
    thinkingTokens: 0,
    turnStartedAt: null,
    sentUuids: [],
    error: null,
    ...over
  }
}

function titleFrom(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 48 ? `${one.slice(0, 47)}…` : one || 'New chat'
}

let toastSeq = 0

export const useStore = create<State>()((set, get) => {
  const patchChat = (chatId: string, fn: (c: Chat) => Chat | Partial<Chat>): void => {
    set((s) => {
      const c = s.chats[chatId]
      if (!c) return s
      const next = fn(c)
      return { chats: { ...s.chats, [chatId]: { ...c, ...next } } }
    })
  }

  const persistLayout = (): void => {
    const { project, tabs, activeTabId, chats } = get()
    if (!project) return
    const out: PersistedTab[] = tabs.map((t) => {
      if (t.kind === 'chat') {
        const c = chats[t.id]
        return { kind: 'chat', id: t.id, title: c?.title, model: c?.model, effort: c?.effort, permissionMode: c?.permissionMode, persisted: c?.persisted }
      }
      return t.kind === 'file' ? { kind: 'file', id: t.id, path: t.path } : { kind: t.kind, id: t.id }
    })
    try {
      localStorage.setItem(layoutKey(project.path), JSON.stringify({ tabs: out, active: activeTabId }))
    } catch {
      // Ignore storage failures.
    }
  }

  const loadChatHistory = async (chatId: string): Promise<void> => {
    const c = get().chats[chatId]
    if (!c) return
    patchChat(chatId, () => ({ loadingHistory: true }))
    try {
      const msgs = await api.chats.load(chatId, c.projectPath)
      patchChat(chatId, (cur) => ({ ...applyHistory(cur, msgs), loadingHistory: false, persisted: true }))
    } catch {
      patchChat(chatId, () => ({ loadingHistory: false }))
    }
  }

  const activateProject = async (project: ProjectInfo): Promise<void> => {
    await api.agent.closeAll()
    const settings = get().settings
    set({ project, chats: {}, tabs: [], activeTabId: null, history: [] })
    await api.fs.watch(project.path)
    void get().refreshHistory()
    // Restore this project's tabs, or start with a fresh chat.
    let restored: { tabs: PersistedTab[]; active: string | null } | null = null
    try {
      const raw = localStorage.getItem(layoutKey(project.path))
      restored = raw ? JSON.parse(raw) : null
    } catch {
      restored = null
    }
    const tabs: Tab[] = []
    const chats: Record<string, Chat> = {}
    for (const t of restored?.tabs ?? []) {
      if (t.kind === 'chat') {
        const model = t.model === 'ultra' && !settings?.ultraUnlocked ? undefined : t.model
        chats[t.id] = makeChat(t.id, project.path, settings, {
          title: t.title ?? 'Chat',
          persisted: !!t.persisted,
          ...(model ? { model } : {}),
          ...(t.effort ? { effort: t.effort } : {}),
          ...(t.permissionMode ? { permissionMode: t.permissionMode } : {})
        })
        tabs.push({ kind: 'chat', id: t.id })
      } else if (t.kind === 'file' && t.path) {
        tabs.push({ kind: 'file', id: t.id, path: t.path })
      } else if (t.kind === 'settings' || t.kind === 'welcome') {
        tabs.push({ kind: t.kind, id: t.kind } as Tab)
      }
    }
    if (tabs.length) {
      const active = restored?.active && tabs.some((t) => t.id === restored!.active) ? restored.active : tabs[0].id
      set({ tabs, chats, activeTabId: active })
      for (const c of Object.values(chats)) if (c.persisted) void loadChatHistory(c.id)
    } else {
      get().newChat()
    }
    persistLayout()
  }

  return {
    ...loadUi(),
    ready: false,
    version: '',
    settings: null,
    project: null,
    tabs: [{ kind: 'welcome', id: 'welcome' }],
    activeTabId: 'welcome',
    chats: {},
    history: [],
    historyLoading: false,
    fsVersion: 0,
    output: [],
    toasts: [],
    dialog: null,
    palette: null,
    focusComposerTick: 0,
    browserState: { tabs: [], activeId: null, busy: null, emulation: null },
    resizing: false,

    init: async () => {
      const [settings, version, browserState] = await Promise.all([api.settings.get(), api.app.version(), api.browser.getState()])
      set({ settings, version, browserState })
      api.browser.onState((browserState) => set({ browserState }))
      // The agent started using the browser: bring the pane into view.
      api.browser.onReveal(() => {
        if (!get().browserVisible) get().setUi({ browserVisible: true })
      })
      if (settings.lastProjectPath) {
        const res = await api.projects.open(settings.lastProjectPath)
        if (res.ok) {
          set({ settings: await api.settings.get() })
          await activateProject(res.project)
        }
      }
      api.fs.onChanged(() => set((s) => ({ fsVersion: s.fsVersion + 1 })))
      set({ ready: true })
    },

    updateSettings: async (patch) => {
      const settings = await api.settings.update(patch)
      set({ settings })
    },
    setSettings: (settings) => set({ settings }),

    unlockUltra: () => {
      const s = get().settings
      if (s?.ultraUnlocked && s.showUltra) {
        get().toast({ kind: 'ultra', title: 'GeekedGPT Ultra is already unlocked', detail: 'Pick it from the model menu.' })
        return
      }
      void get().updateSettings({ ultraUnlocked: true, showUltra: true })
      get().toast({ kind: 'ultra', title: 'GeekedGPT Ultra unlocked', detail: 'Frontier reasoning is now in your model menu.' }, 7000)
    },

    openProjectPath: async (path) => {
      const res = await api.projects.open(path)
      if (!res.ok) {
        get().toast({ kind: 'error', title: "Couldn't open project", detail: res.error })
        set({ settings: await api.settings.get() })
        return false
      }
      set({ settings: await api.settings.get() })
      await activateProject(res.project)
      return true
    },

    openProjectDialog: async () => {
      const project = await api.projects.openDialog()
      if (!project) return
      set({ settings: await api.settings.get() })
      await activateProject(project)
    },

    createProject: async (name, parentDir) => {
      const res = await api.projects.create(name, parentDir)
      if (!res.ok) return { ok: false, error: res.error }
      set({ settings: await api.settings.get() })
      // Start from a clean layout for a brand-new project.
      try {
        localStorage.removeItem(layoutKey(res.project.path))
      } catch {
        // Ignore.
      }
      await activateProject(res.project)
      get().toast({ kind: 'success', title: `Created ${res.project.name}`, detail: 'Your project is ready. Tell GeekedGPT what to build.' })
      get().focusComposer()
      return { ok: true }
    },

    closeProject: async () => {
      await api.agent.closeAll()
      await api.fs.watch(null)
      await api.settings.update({ lastProjectPath: null })
      set({ project: null, chats: {}, history: [], tabs: [{ kind: 'welcome', id: 'welcome' }], activeTabId: 'welcome', settings: await api.settings.get() })
    },

    refreshHistory: async () => {
      const project = get().project
      if (!project) return
      set({ historyLoading: true })
      const history = await api.chats.list(project.path)
      if (get().project?.path === project.path) set({ history, historyLoading: false })
    },

    openTab: (tab) => {
      set((s) => (s.tabs.some((t) => t.id === tab.id) ? { activeTabId: tab.id } : { tabs: [...s.tabs, tab], activeTabId: tab.id }))
      persistLayout()
    },

    activateTab: (id) => {
      set({ activeTabId: id })
      persistLayout()
    },

    closeTab: (id) => {
      const { tabs, activeTabId, chats } = get()
      const idx = tabs.findIndex((t) => t.id === id)
      if (idx < 0) return
      const tab = tabs[idx]
      const nextTabs = tabs.filter((t) => t.id !== id)
      let active = activeTabId
      if (activeTabId === id) active = nextTabs[Math.min(idx, nextTabs.length - 1)]?.id ?? null
      const nextChats = { ...chats }
      if (tab.kind === 'chat') {
        void api.agent.close(id)
        delete nextChats[id]
      }
      set({ tabs: nextTabs, activeTabId: active, chats: nextChats })
      persistLayout()
      if (tab.kind === 'chat') void get().refreshHistory()
    },

    reorderTabs: (tabs) => {
      set({ tabs })
      persistLayout()
    },

    cycleTab: (dir) => {
      const { tabs, activeTabId } = get()
      if (tabs.length < 2) return
      const i = tabs.findIndex((t) => t.id === activeTabId)
      const next = tabs[(i + dir + tabs.length) % tabs.length]
      get().activateTab(next.id)
    },

    newChat: () => {
      const { project, settings } = get()
      if (!project) {
        set({ dialog: 'newProject' })
        return null
      }
      const id = crypto.randomUUID()
      set((s) => ({
        chats: { ...s.chats, [id]: makeChat(id, project.path, settings) },
        tabs: [...s.tabs, { kind: 'chat', id }],
        activeTabId: id
      }))
      persistLayout()
      get().focusComposer()
      return id
    },

    openHistoryChat: async (summary) => {
      const { project, chats, settings } = get()
      if (!project) return
      if (chats[summary.sessionId]) {
        get().activateTab(summary.sessionId)
        return
      }
      set((s) => ({
        chats: {
          ...s.chats,
          [summary.sessionId]: makeChat(summary.sessionId, project.path, settings, { title: summary.title, persisted: true })
        },
        tabs: [...s.tabs, { kind: 'chat', id: summary.sessionId }],
        activeTabId: summary.sessionId
      }))
      persistLayout()
      await loadChatHistory(summary.sessionId)
    },

    renameChat: async (chatId, title) => {
      const project = get().project
      const clean = title.trim()
      if (!project || !clean) return
      patchChat(chatId, () => ({ title: clean }))
      set((s) => ({ history: s.history.map((h) => (h.sessionId === chatId ? { ...h, title: clean } : h)) }))
      const known = get().history.some((h) => h.sessionId === chatId) || get().chats[chatId]?.persisted
      if (known) {
        try {
          await api.chats.rename(chatId, clean, project.path)
        } catch (err) {
          get().toast({ kind: 'error', title: "Couldn't rename chat", detail: (err as Error).message })
        }
      }
      persistLayout()
    },

    deleteChat: async (sessionId) => {
      const project = get().project
      if (!project) return
      if (get().tabs.some((t) => t.id === sessionId)) get().closeTab(sessionId)
      try {
        await api.chats.remove(sessionId, project.path)
        get().toast({ kind: 'info', title: 'Chat deleted' })
      } catch (err) {
        get().toast({ kind: 'error', title: "Couldn't delete chat", detail: (err as Error).message })
      }
      await get().refreshHistory()
    },

    ensureStarted: async (chatId) => {
      const c = get().chats[chatId]
      if (!c) return false
      if (c.status === 'ready' || c.status === 'running' || c.status === 'starting') return true
      patchChat(chatId, () => ({ status: 'starting', error: null }))
      const res = await api.agent.start({
        chatId,
        cwd: c.projectPath,
        model: c.model,
        effort: c.effort,
        permissionMode: c.permissionMode,
        resume: c.persisted
      })
      if (!res.ok) {
        patchChat(chatId, (cur) => ({
          status: 'closed',
          error: res.error ?? 'Failed to start',
          items: [...cur.items, { kind: 'notice', id: `start-${Date.now()}`, level: 'error', text: `Couldn't start the agent: ${res.error ?? 'unknown error'}` } as Item]
        }))
        return false
      }
      patchChat(chatId, (cur) => (cur.status === 'starting' ? { status: 'ready' } : {}))
      return true
    },

    send: async (chatId, rawText, attachments = []) => {
      const c = get().chats[chatId]
      if (!c) return
      const text = rawText.trim()
      if (!text && attachments.length === 0) return
      const uuid = crypto.randomUUID()
      const wasRunning = c.status === 'running'
      const firstMessage = !c.items.some((i) => i.kind === 'user')
      patchChat(chatId, (cur) => ({
        items: [
          ...cur.items,
          {
            kind: 'user',
            id: uuid,
            uuid,
            text,
            images: attachments.map((a) => `data:${a.mediaType};base64,${a.data}`),
            queued: wasRunning
          }
        ],
        suggestion: null,
        title: firstMessage && cur.title === 'New chat' ? titleFrom(text) : cur.title,
        sentUuids: [...cur.sentUuids, uuid]
      }))
      const started = await get().ensureStarted(chatId)
      if (!started) return
      const res = await api.agent.send(chatId, { text, images: attachments, uuid })
      if (!res.ok) {
        patchChat(chatId, (cur) => ({
          items: [...cur.items, { kind: 'notice', id: `send-${uuid}`, level: 'error', text: res.error ?? 'Failed to send.' } as Item]
        }))
        return
      }
      patchChat(chatId, (cur) => ({
        status: 'running',
        turnStartedAt: cur.turnStartedAt ?? Date.now(),
        persisted: true
      }))
      persistLayout()
      if (firstMessage) setTimeout(() => void get().refreshHistory(), 4000)
    },

    interrupt: async (chatId) => {
      await api.agent.interrupt(chatId)
    },

    setChatModel: (chatId, model) => {
      const c = get().chats[chatId]
      if (!c || c.model === model) return
      patchChat(chatId, () => ({ model }))
      if (c.status === 'ready' || c.status === 'running') void api.agent.setModel(chatId, model)
      persistLayout()
      get().toast({ kind: model === 'ultra' ? 'ultra' : 'info', title: `Switched to ${getModel(model).name}` }, 2200)
    },

    setChatEffort: (chatId, effort) => {
      const c = get().chats[chatId]
      if (!c || c.effort === effort) return
      patchChat(chatId, () => ({ effort }))
      if (c.status === 'ready' || c.status === 'running') void api.agent.setEffort(chatId, effort)
      persistLayout()
    },

    setChatPermissionMode: (chatId, mode) => {
      const c = get().chats[chatId]
      if (!c || c.permissionMode === mode) return
      patchChat(chatId, () => ({ permissionMode: mode }))
      if (c.status === 'ready' || c.status === 'running') void api.agent.setPermissionMode(chatId, mode)
      persistLayout()
    },

    respondPermission: (chatId, requestId, response) => {
      patchChat(chatId, (c) => ({ permissions: c.permissions.filter((p) => p.requestId !== requestId) }))
      if (response.behavior === 'allow' && response.setMode) {
        patchChat(chatId, () => ({ permissionMode: response.setMode }))
      }
      void api.agent.respond(chatId, requestId, response)
    },

    stopBackgroundTask: (chatId, taskId) => {
      void api.agent.stopTask(chatId, taskId)
    },

    rewindTo: async (chatId, uuid) => {
      const res = await api.agent.rewind(chatId, uuid)
      if (res.ok) get().toast({ kind: 'success', title: 'Files restored', detail: `${res.filesChanged ?? 0} file(s) rolled back to this point.` })
      else get().toast({ kind: 'warn', title: "Couldn't restore files", detail: res.error })
    },

    dismissSuggestion: (chatId) => patchChat(chatId, () => ({ suggestion: null })),

    handleEvents: (events) => {
      set((s) => {
        const chats = { ...s.chats }
        let output = s.output
        let touched = false
        for (const ev of events) {
          if (ev.type === 'stderr') {
            const lines = ev.text.split(/\r?\n/).filter(Boolean)
            if (lines.length) {
              output = [...output, ...lines].slice(-2000)
            }
            continue
          }
          const c = chats[ev.chatId]
          if (!c) continue
          touched = true
          switch (ev.type) {
            case 'message':
              chats[ev.chatId] = applyMessage(c, ev.message)
              break
            case 'started':
              chats[ev.chatId] = { ...c, capabilities: ev.capabilities ?? c.capabilities, status: c.status === 'starting' ? 'ready' : c.status }
              break
            case 'closed':
              chats[ev.chatId] = {
                ...c,
                status: 'closed',
                live: null,
                statusText: null,
                turnStartedAt: null,
                permissions: [],
                items:
                  ev.reason === 'error'
                    ? [...c.items, { kind: 'notice', id: `closed-${Date.now()}`, level: 'error', text: `The agent stopped: ${ev.error ?? 'unknown error'}` }]
                    : c.items
              }
              break
            case 'permission':
              if (!c.permissions.some((p) => p.requestId === ev.request.requestId)) {
                chats[ev.chatId] = { ...c, permissions: [...c.permissions, ev.request] }
              }
              break
            case 'permission-cancelled':
              chats[ev.chatId] = { ...c, permissions: c.permissions.filter((p) => p.requestId !== ev.requestId) }
              break
          }
        }
        return touched ? { chats, output } : { output }
      })
    },

    toast: (t, ms = 4500) => {
      const id = `t${++toastSeq}`
      set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }))
      if (ms > 0) setTimeout(() => get().dismissToast(id), ms)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setDialog: (dialog) => set({ dialog }),
    setPalette: (palette) => set({ palette }),
    setUi: (patch) => {
      set(patch)
      const s = get()
      saveUi({
        sidebarVisible: s.sidebarVisible,
        sidebarWidth: s.sidebarWidth,
        sidebarView: s.sidebarView,
        panelVisible: s.panelVisible,
        panelHeight: s.panelHeight,
        panelTab: s.panelTab,
        browserVisible: s.browserVisible,
        browserWidth: s.browserWidth
      })
    },
    focusComposer: () => set((s) => ({ focusComposerTick: s.focusComposerTick + 1 })),
    clearOutput: () => set({ output: [] }),
    setResizing: (resizing) => set({ resizing })
  }
})

/** Batch IPC events into one store update per animation frame for smooth streaming. */
export function startAgentEventPump(): () => void {
  let queue: AgentEvent[] = []
  let frame = 0
  // rAF pauses while the window is hidden, so a timer guarantees delivery.
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (frame) cancelAnimationFrame(frame)
    if (timer) clearTimeout(timer)
    frame = 0
    timer = null
    const batch = queue
    queue = []
    if (batch.length) useStore.getState().handleEvents(batch)
  }
  const off = api.agent.onEvent((ev) => {
    queue.push(ev)
    if (!frame) frame = requestAnimationFrame(flush)
    if (!timer) timer = setTimeout(flush, 100)
  })
  return () => {
    off()
    if (frame) cancelAnimationFrame(frame)
    if (timer) clearTimeout(timer)
  }
}

export function useActiveChat(): Chat | null {
  return useStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId)
    return tab?.kind === 'chat' ? (s.chats[tab.id] ?? null) : null
  })
}
