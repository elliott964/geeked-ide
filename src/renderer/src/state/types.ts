import type { ChatCapabilities, PermissionRequest } from '@shared/ipc'
import type { EffortKey, ModelKey, PermissionModeKey } from '@shared/models'

export type Tab =
  | { kind: 'welcome'; id: 'welcome' }
  | { kind: 'settings'; id: 'settings' }
  | { kind: 'chat'; id: string }
  | { kind: 'file'; id: string; path: string }

export type Item =
  | { kind: 'user'; id: string; text: string; images: string[]; uuid?: string; queued?: boolean }
  | { kind: 'text'; id: string; text: string; parent: string | null }
  | { kind: 'thinking'; id: string; text: string; parent: string | null }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown>; parent: string | null }
  | { kind: 'notice'; id: string; level: 'info' | 'warn' | 'error'; text: string }
  | { kind: 'compact'; id: string; preTokens?: number; trigger: string }
  | { kind: 'turn-end'; id: string; durationMs: number; costUsd?: number; isError: boolean }
  | { kind: 'command-output'; id: string; text: string }

export interface ToolResult {
  text: string
  isError: boolean
  /** The tool's structured output (SDK `tool_use_result`), when the CLI provided one. */
  structured?: unknown
  images?: string[]
}

export interface LiveBlock {
  index: number
  type: 'text' | 'thinking' | 'tool_use'
  text: string
  name?: string
  id?: string
}

export interface LiveState {
  messageId: string
  blocks: LiveBlock[]
}

export interface TodoItem {
  id: string
  content: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface SubagentProgress {
  description?: string
  summary?: string
  lastTool?: string
  toolUses?: number
  tokens?: number
  status: 'running' | 'completed' | 'failed' | 'stopped'
}

export interface BackgroundTask {
  taskId: string
  type: string
  description: string
}

export interface InitInfo {
  model: string
  cwd: string
  tools: string[]
  mcpServers: { name: string; status: string }[]
  skills: string[]
  plugins: { name: string; path: string; version?: string }[]
  agents: string[]
  slashCommands: string[]
  apiKeySource: string
  version: string
  outputStyle: string
}

export type ChatStatus = 'idle' | 'starting' | 'ready' | 'running' | 'closed'

export interface Chat {
  id: string
  title: string
  projectPath: string
  model: ModelKey
  effort: EffortKey
  permissionMode: PermissionModeKey
  /** The session exists on disk, so restarting the process must resume it. */
  persisted: boolean
  status: ChatStatus
  loadingHistory: boolean
  items: Item[]
  live: LiveState | null
  toolResults: Record<string, ToolResult>
  toolElapsed: Record<string, number>
  permissions: PermissionRequest[]
  todos: TodoItem[]
  pendingTaskCreates: Record<string, { subject: string; activeForm?: string }>
  subagents: Record<string, SubagentProgress>
  backgroundTasks: BackgroundTask[]
  capabilities: ChatCapabilities | null
  init: InitInfo | null
  costUsd: number
  contextTokens: number
  contextWindow: number
  outputTokens: number
  suggestion: string | null
  statusText: string | null
  thinkingTokens: number
  turnStartedAt: number | null
  sentUuids: string[]
  error: string | null
}

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'warn' | 'error' | 'ultra'
  title: string
  detail?: string
  action?: { label: string; run: () => void }
}

export type SidebarView = 'explorer' | 'chats' | 'capabilities'
export type PanelTab = 'todos' | 'tasks' | 'output'
