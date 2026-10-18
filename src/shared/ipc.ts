// The typed contract between the renderer (window.geeked) and the main process.
import type { EffortKey, ModelKey, PermissionModeKey } from './models'

export interface RecentProject {
  name: string
  path: string
  lastOpened: number
}

export interface ProjectInfo {
  name: string
  path: string
}

export interface AppSettings {
  projectsDir: string
  recentProjects: RecentProject[]
  defaultModel: ModelKey
  defaultEffort: EffortKey
  defaultPermissionMode: PermissionModeKey
  ultraUnlocked: boolean
  showUltra: boolean
  reduceMotion: boolean
  sendOnEnter: boolean
  /** Start sessions with Claude in Chrome (the --chrome integration) so the agent can drive the user's Chrome. */
  claudeInChrome: boolean
  /** Whether an API key is stored. The key itself never leaves the main process. */
  hasApiKey: boolean
  lastProjectPath: string | null
}

export type SettingsPatch = Partial<
  Pick<
    AppSettings,
    | 'projectsDir'
    | 'defaultModel'
    | 'defaultEffort'
    | 'defaultPermissionMode'
    | 'ultraUnlocked'
    | 'showUltra'
    | 'reduceMotion'
    | 'sendOnEnter'
    | 'claudeInChrome'
    | 'lastProjectPath'
  >
>

export interface NameCheck {
  ok: boolean
  error?: string
  fullPath: string
}

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FilePreview {
  path: string
  kind: 'text' | 'image' | 'binary' | 'too-large' | 'missing'
  content?: string
  dataUrl?: string
  size: number
}

export interface ChatSummary {
  sessionId: string
  title: string
  lastModified: number
  createdAt?: number
  gitBranch?: string
}

/** One message of a stored transcript (SDK SessionMessage, made serialisable). */
export interface StoredMessage {
  type: 'user' | 'assistant' | 'system'
  uuid: string
  message: unknown
  parentToolUseId: string | null
}

export interface ImageAttachment {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
  /** Base64 without the data: prefix. */
  data: string
  name: string
}

export interface StartChatOptions {
  chatId: string
  cwd: string
  model: ModelKey
  effort: EffortKey
  permissionMode: PermissionModeKey
  /** True when the session already exists on disk and should be resumed. */
  resume: boolean
}

export interface SendOptions {
  text: string
  images: ImageAttachment[]
  uuid: string
}

export interface PermissionRequest {
  chatId: string
  requestId: string
  toolName: string
  toolUseId: string
  input: Record<string, unknown>
  title?: string
  displayName?: string
  description?: string
  decisionReason?: string
  blockedPath?: string
  agentId?: string
  canAlwaysAllow: boolean
  defaultToNo: boolean
}

export type PermissionResponse =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown>; always?: boolean; setMode?: PermissionModeKey }
  | { behavior: 'deny'; message: string; interrupt?: boolean }

export interface SlashCommandInfo {
  name: string
  description: string
  argumentHint: string
}

export interface ChatCapabilities {
  commands: SlashCommandInfo[]
  agents: { name: string; description: string }[]
  account?: { email?: string; organization?: string; subscriptionType?: string; apiKeySource?: string }
  outputStyle?: string
}

/** Events pushed from main to renderer for a chat. `message` is a raw SDKMessage. */
export type AgentEvent =
  | { chatId: string; type: 'message'; message: Record<string, unknown> & { type: string } }
  | { chatId: string; type: 'started'; capabilities: ChatCapabilities | null }
  | { chatId: string; type: 'closed'; reason: 'ended' | 'error'; error?: string }
  | { chatId: string; type: 'permission'; request: PermissionRequest }
  | { chatId: string; type: 'permission-cancelled'; requestId: string }
  | { chatId: string; type: 'stderr'; text: string }

export interface BrowserTabState {
  id: string
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  favicon?: string
}

export interface BrowserState {
  tabs: BrowserTabState[]
  activeId: string | null
  /** What the agent is doing in the browser right now, if anything. */
  busy: string | null
  /** Emulated viewport like "375×812", or null. */
  emulation: string | null
}

export interface BrowserRect {
  x: number
  y: number
  width: number
  height: number
}

export type BrowserCommand = 'back' | 'forward' | 'reload' | 'stop' | 'devtools' | 'external'

export interface RewindResult {
  ok: boolean
  error?: string
  filesChanged?: number
}

export type MenuRole =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'zoomIn'
  | 'zoomOut'
  | 'resetZoom'
  | 'toggleFullScreen'
  | 'toggleDevTools'
  | 'reload'
  | 'quit'
  | 'minimize'

export interface GeekedApi {
  platform: string
  app: {
    version: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    menuRole: (role: MenuRole) => Promise<void>
    setTitleBarTheme: (color: string, symbolColor: string) => Promise<void>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: SettingsPatch) => Promise<AppSettings>
    setApiKey: (key: string | null) => Promise<AppSettings>
    chooseProjectsDir: () => Promise<string | null>
  }
  projects: {
    checkName: (name: string, parentDir?: string) => Promise<NameCheck>
    create: (name: string, parentDir?: string) => Promise<{ ok: true; project: ProjectInfo } | { ok: false; error: string }>
    openDialog: () => Promise<ProjectInfo | null>
    open: (path: string) => Promise<{ ok: true; project: ProjectInfo } | { ok: false; error: string }>
    removeRecent: (path: string) => Promise<AppSettings>
    reveal: (path: string) => Promise<void>
    chooseFolder: (defaultPath?: string) => Promise<string | null>
  }
  fs: {
    listDir: (dir: string) => Promise<DirEntry[]>
    readFile: (path: string) => Promise<FilePreview>
    searchFiles: (root: string, query: string) => Promise<string[]>
    watch: (root: string | null) => Promise<void>
    onChanged: (cb: (root: string) => void) => () => void
  }
  chats: {
    list: (projectPath: string) => Promise<ChatSummary[]>
    load: (sessionId: string, projectPath: string) => Promise<StoredMessage[]>
    rename: (sessionId: string, title: string, projectPath: string) => Promise<void>
    remove: (sessionId: string, projectPath: string) => Promise<void>
  }
  browser: {
    getState: () => Promise<BrowserState>
    setBounds: (rect: BrowserRect | null) => Promise<void>
    navigate: (input: string) => Promise<{ ok: boolean; error?: string }>
    command: (cmd: BrowserCommand) => Promise<void>
    newTab: (url?: string) => Promise<void>
    selectTab: (id: string) => Promise<void>
    closeTab: (id: string) => Promise<void>
    clearData: () => Promise<void>
    onState: (cb: (state: BrowserState) => void) => () => void
    onReveal: (cb: () => void) => () => void
  }
  agent: {
    start: (opts: StartChatOptions) => Promise<{ ok: boolean; error?: string }>
    send: (chatId: string, opts: SendOptions) => Promise<{ ok: boolean; error?: string }>
    interrupt: (chatId: string) => Promise<void>
    setModel: (chatId: string, model: ModelKey) => Promise<void>
    setEffort: (chatId: string, effort: EffortKey) => Promise<void>
    setPermissionMode: (chatId: string, mode: PermissionModeKey) => Promise<void>
    respond: (chatId: string, requestId: string, response: PermissionResponse) => Promise<void>
    stopTask: (chatId: string, taskId: string) => Promise<void>
    rewind: (chatId: string, userMessageUuid: string) => Promise<RewindResult>
    close: (chatId: string) => Promise<void>
    closeAll: () => Promise<void>
    onEvent: (cb: (event: AgentEvent) => void) => () => void
  }
}
