// Bridges chats in the UI to Claude Agent SDK sessions (one CLI process per open chat).
import {
  deleteSession,
  getSessionMessages,
  listSessions,
  query,
  renameSession,
  type CanUseTool,
  type Options,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { sep } from 'node:path'
import type {
  AgentEvent,
  ChatCapabilities,
  ChatSummary,
  PermissionResponse,
  RewindResult,
  SendOptions,
  StartChatOptions,
  StoredMessage
} from '@shared/ipc'
import { getModel, toSdkEffort, type EffortKey, type ModelKey, type PermissionModeKey } from '@shared/models'
import { BROWSER_AUTO_ALLOWED, BROWSER_SERVER, createBrowserServer } from './browserTools'
import { getApiKey, getPublicSettings } from './settings'

type UUID = SDKUserMessage['uuid'] & string

/** Async iterable the SDK pulls user messages from (streaming-input mode). */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private done = false

  push(msg: SDKUserMessage): void {
    if (this.done) return
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: msg, done: false })
    } else {
      this.items.push(msg)
    }
  }

  close(): void {
    this.done = true
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false })
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiter = resolve))
      },
      return: () => {
        this.close()
        return Promise.resolve({ value: undefined, done: true })
      }
    }
  }
}

interface PendingPermission {
  finish: (r: PermissionResult) => void
  suggestions?: PermissionUpdate[]
  input: Record<string, unknown>
  toolUseID: string
}

interface ChatSession {
  chatId: string
  q: Query
  queue: InputQueue
  pending: Map<string, PendingPermission>
  closed: boolean
}

const sessions = new Map<string, ChatSession>()

const SYSTEM_APPEND = [
  'You are running inside Geeked IDE, a desktop agent development environment.',
  'The app labels its models as GeekedGPT tiers, all built on Claude: GeekedGPT mini is Claude Haiku, GeekedGPT is Claude Sonnet, GeekedGPT Plus is Claude Opus, and GeekedGPT Ultra is Claude Fable.',
  'The user sees your tool calls as cards, your todo list in a panel, and answers permission prompts and questions in the UI.',
  'A built-in browser pane is available through the geeked_browser tools: use it to open, click through, and screenshot web pages and local dev servers.'
].join(' ')

/** Variables that only exist when launched from inside another Claude Code session. */
const HOST_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_HOST_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SIMPLE',
  'CLAUDE_AGENT_SDK_VERSION',
  'CLAUDE_PID',
  'ELECTRON_RUN_AS_NODE'
]

function emit(event: AgentEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('agent:event', event)
  }
}

function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const k of HOST_SESSION_VARS) delete env[k]
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `geeked-ide/${app.getVersion()}`
  env.CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL = 'true'
  // Headless sessions leave the task-list (todo) tools off unless asked for.
  env.CLAUDE_CODE_ENABLE_TODO_TOOLS = 'true'
  const key = getApiKey()
  if (key) env.ANTHROPIC_API_KEY = key
  return env
}

/** The native CLI ships in a platform package; inside a packaged app it lives in app.asar.unpacked. */
function claudeExecutable(): string | undefined {
  const pkg = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
  const bin = process.platform === 'win32' ? 'claude.exe' : 'claude'
  try {
    const require = createRequire(import.meta.url)
    return require.resolve(`${pkg}/${bin}`).replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
  } catch {
    return undefined
  }
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function makeCanUseTool(chatId: string): CanUseTool {
  return (toolName, input, opts) =>
    new Promise<PermissionResult>((resolve) => {
      const s = sessions.get(chatId)
      if (!s) {
        resolve({ behavior: 'deny', message: 'The chat was closed.', toolUseID: opts.toolUseID })
        return
      }
      const requestId = opts.requestId || randomUUID()
      const onAbort = (): void => {
        finish({ behavior: 'deny', message: 'Cancelled.', toolUseID: opts.toolUseID })
        emit({ chatId, type: 'permission-cancelled', requestId })
      }
      const finish = (r: PermissionResult): void => {
        if (!s.pending.has(requestId)) return
        s.pending.delete(requestId)
        opts.signal.removeEventListener('abort', onAbort)
        resolve(r)
      }
      s.pending.set(requestId, { finish, suggestions: opts.suggestions, input, toolUseID: opts.toolUseID })
      opts.signal.addEventListener('abort', onAbort, { once: true })
      emit({
        chatId,
        type: 'permission',
        request: {
          chatId,
          requestId,
          toolName,
          toolUseId: opts.toolUseID,
          input,
          title: opts.title,
          displayName: opts.displayName,
          description: opts.description,
          decisionReason: opts.decisionReason,
          blockedPath: opts.blockedPath,
          agentId: opts.agentID,
          canAlwaysAllow: !!opts.suggestions?.length && !opts.suppressAlwaysAllowRule,
          defaultToNo: !!opts.defaultToNo
        }
      })
    })
}

async function readCapabilities(q: Query): Promise<ChatCapabilities | null> {
  try {
    const init = await Promise.race([
      q.initializationResult(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000))
    ])
    return {
      commands: init.commands.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
      agents: init.agents.map((a) => ({ name: a.name, description: a.description })),
      account: init.account
        ? {
            email: init.account.email,
            organization: init.account.organization,
            subscriptionType: init.account.subscriptionType,
            apiKeySource: init.account.apiKeySource
          }
        : undefined,
      outputStyle: init.output_style
    }
  } catch {
    return null
  }
}

export function startChat(opts: StartChatOptions): { ok: boolean; error?: string } {
  if (sessions.has(opts.chatId)) return { ok: true }
  const queue = new InputQueue()
  const model = getModel(opts.model)
  const chrome = getPublicSettings().claudeInChrome
  const options: Options = {
    cwd: opts.cwd,
    model: model.id,
    effort: toSdkEffort(opts.effort),
    thinking: { type: 'adaptive', display: 'summarized' },
    permissionMode: opts.permissionMode,
    allowDangerouslySkipPermissions: true,
    tools: { type: 'preset', preset: 'claude_code' },
    systemPrompt: { type: 'preset', preset: 'claude_code', append: SYSTEM_APPEND },
    settingSources: ['user', 'project', 'local'],
    skills: 'all',
    mcpServers: { [BROWSER_SERVER]: createBrowserServer() },
    allowedTools: BROWSER_AUTO_ALLOWED,
    // Claude in Chrome: the same --chrome integration as the Claude Code CLI.
    ...(chrome ? { extraArgs: { chrome: null } } : {}),
    settings: { enableWorkflows: true, ultracode: opts.effort === 'ultracode' },
    includePartialMessages: true,
    agentProgressSummaries: true,
    promptSuggestions: true,
    enableFileCheckpointing: true,
    perTaskStopAffordance: true,
    canUseTool: makeCanUseTool(opts.chatId),
    env: buildEnv(),
    pathToClaudeCodeExecutable: claudeExecutable(),
    stderr: (text) => emit({ chatId: opts.chatId, type: 'stderr', text }),
    ...(opts.resume ? { resume: opts.chatId } : { sessionId: opts.chatId })
  }

  let q: Query
  try {
    q = query({ prompt: queue, options })
  } catch (err) {
    return { ok: false, error: errorText(err) }
  }
  const session: ChatSession = { chatId: opts.chatId, q, queue, pending: new Map(), closed: false }
  sessions.set(opts.chatId, session)

  void readCapabilities(q).then((capabilities) => {
    if (!session.closed) emit({ chatId: opts.chatId, type: 'started', capabilities })
  })

  void (async () => {
    try {
      for await (const message of q) {
        emit({ chatId: opts.chatId, type: 'message', message: message as AgentEventMessage })
      }
      finishSession(session, { reason: 'ended' })
    } catch (err) {
      finishSession(session, { reason: 'error', error: errorText(err) })
    }
  })()
  return { ok: true }
}

type AgentEventMessage = Extract<AgentEvent, { type: 'message' }>['message']

function finishSession(session: ChatSession, result: { reason: 'ended' | 'error'; error?: string }): void {
  if (sessions.get(session.chatId) === session) sessions.delete(session.chatId)
  if (session.closed) return
  session.closed = true
  for (const [requestId, p] of session.pending) {
    p.finish({ behavior: 'deny', message: 'The session ended.', toolUseID: p.toolUseID })
    emit({ chatId: session.chatId, type: 'permission-cancelled', requestId })
  }
  emit({ chatId: session.chatId, type: 'closed', ...result })
}

export function sendMessage(chatId: string, opts: SendOptions): { ok: boolean; error?: string } {
  const s = sessions.get(chatId)
  if (!s || s.closed) return { ok: false, error: 'The chat is not running.' }
  const text = opts.text
  const content =
    opts.images.length === 0
      ? text
      : [
          ...opts.images.map((img) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.mediaType, data: img.data }
          })),
          ...(text ? [{ type: 'text' as const, text }] : [])
        ]
  s.queue.push({
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    origin: { kind: 'human' },
    uuid: opts.uuid as UUID
  })
  return { ok: true }
}

function withSession<T>(chatId: string, fn: (s: ChatSession) => Promise<T>): Promise<T | undefined> {
  const s = sessions.get(chatId)
  if (!s || s.closed) return Promise.resolve(undefined)
  return fn(s)
}

export async function interrupt(chatId: string): Promise<void> {
  await withSession(chatId, async (s) => {
    await s.q.interrupt()
  })
}

export async function setModel(chatId: string, model: ModelKey): Promise<void> {
  await withSession(chatId, (s) => s.q.setModel(getModel(model).id))
}

export async function setEffort(chatId: string, effort: EffortKey): Promise<void> {
  // Always send both keys: an effortLevel change without `ultracode` turns ultracode off.
  await withSession(chatId, (s) =>
    s.q.applyFlagSettings({ effortLevel: toSdkEffort(effort), ultracode: effort === 'ultracode' })
  )
}

export async function setPermissionMode(chatId: string, mode: PermissionModeKey): Promise<void> {
  await withSession(chatId, (s) => s.q.setPermissionMode(mode))
}

export function respondPermission(chatId: string, requestId: string, response: PermissionResponse): void {
  const s = sessions.get(chatId)
  const p = s?.pending.get(requestId)
  if (!p) return
  if (response.behavior === 'allow') {
    const updates: PermissionUpdate[] = []
    if (response.always && p.suggestions) updates.push(...p.suggestions)
    if (response.setMode) updates.push({ type: 'setMode', mode: response.setMode, destination: 'session' })
    p.finish({
      behavior: 'allow',
      updatedInput: response.updatedInput ?? p.input,
      updatedPermissions: updates.length ? updates : undefined,
      toolUseID: p.toolUseID
    })
  } else {
    p.finish({
      behavior: 'deny',
      message: response.message || 'The user declined this action.',
      interrupt: response.interrupt,
      toolUseID: p.toolUseID
    })
  }
}

export async function stopTask(chatId: string, taskId: string): Promise<void> {
  await withSession(chatId, (s) => s.q.stopTask(taskId))
}

export async function rewindFiles(chatId: string, userMessageUuid: string): Promise<RewindResult> {
  const s = sessions.get(chatId)
  if (!s || s.closed) return { ok: false, error: 'Start the chat again to restore checkpoints.' }
  try {
    const res = await s.q.rewindFiles(userMessageUuid)
    if (!res.canRewind) return { ok: false, error: res.error ?? 'Nothing to restore for this message.' }
    return { ok: true, filesChanged: res.filesChanged?.length ?? 0 }
  } catch (err) {
    return { ok: false, error: errorText(err) }
  }
}

export function closeChat(chatId: string): void {
  const s = sessions.get(chatId)
  if (!s) return
  s.queue.close()
  try {
    s.q.close()
  } catch {
    // Already closed.
  }
  finishSession(s, { reason: 'ended' })
}

export function closeAllChats(): void {
  for (const id of [...sessions.keys()]) closeChat(id)
}

export async function listChats(projectPath: string): Promise<ChatSummary[]> {
  try {
    const list = await listSessions({ dir: projectPath, includeProgrammatic: true, limit: 300 })
    return list.map((s) => ({
      sessionId: s.sessionId,
      title: (s.customTitle || s.summary || s.firstPrompt || 'Untitled chat').trim(),
      lastModified: s.lastModified,
      createdAt: s.createdAt,
      gitBranch: s.gitBranch
    }))
  } catch {
    return []
  }
}

export async function loadChat(sessionId: string, projectPath: string): Promise<StoredMessage[]> {
  const msgs = await getSessionMessages(sessionId, { dir: projectPath })
  return msgs.map((m) => ({
    type: m.type,
    uuid: m.uuid,
    message: m.message,
    parentToolUseId: m.parent_tool_use_id
  }))
}

export async function renameChat(sessionId: string, title: string, projectPath: string): Promise<void> {
  await renameSession(sessionId, title, { dir: projectPath })
}

export async function removeChat(sessionId: string, projectPath: string): Promise<void> {
  closeChat(sessionId)
  await deleteSession(sessionId, { dir: projectPath })
}
