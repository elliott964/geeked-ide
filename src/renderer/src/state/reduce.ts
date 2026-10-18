// Pure reducers that fold Agent SDK messages into a Chat.
import { modelKeyFromId, type PermissionModeKey } from '@shared/models'
import type { StoredMessage } from '@shared/ipc'
import type { Chat, Item, LiveBlock, TodoItem, ToolResult } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Msg = Record<string, any>

let seq = 0
const uid = (p: string): string => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const FRIENDLY_ERRORS: Record<string, string> = {
  authentication_failed:
    'Not signed in. Add an Anthropic API key in Settings, or sign in once with the Claude Code CLI (run `claude`, then /login).',
  oauth_org_not_allowed: 'Your organization does not allow this sign-in method. Add an API key in Settings.',
  account_on_hold: 'Your Anthropic account is on hold.',
  verification_required: 'Your account needs verification before it can be used.',
  billing_error: 'There is a billing problem with your Anthropic account.',
  rate_limit: 'You hit a rate limit. Wait a moment and try again.',
  overloaded: 'The model is overloaded right now. Try again in a moment.',
  invalid_request: 'The request was rejected as invalid.',
  model_not_found: "This model isn't available on your account. Pick another GeekedGPT model.",
  server_error: 'The API had a server error. Try again.',
  max_output_tokens: 'The response hit the output token limit.',
  cloud_credential_error: 'Your cloud provider credentials failed.',
  unknown: 'Something went wrong talking to the model.'
}

export function friendlyError(code: string | undefined, fallback?: string): string {
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code]
  return fallback || FRIENDLY_ERRORS.unknown
}

function textOf(content: unknown): { text: string; images: string[] } {
  if (typeof content === 'string') return { text: content, images: [] }
  if (!Array.isArray(content)) return { text: '', images: [] }
  const parts: string[] = []
  const images: string[] = []
  for (const b of content as Msg[]) {
    if (b?.type === 'text' && typeof b.text === 'string') parts.push(b.text)
    else if (b?.type === 'image' && b.source?.type === 'base64') images.push(`data:${b.source.media_type};base64,${b.source.data}`)
    // MCP-shaped image content ({ data, mimeType }) as some tool results carry it.
    else if (b?.type === 'image' && typeof b.data === 'string' && typeof b.mimeType === 'string') images.push(`data:${b.mimeType};base64,${b.data}`)
  }
  return { text: parts.join('\n'), images }
}

function pushItem(d: Chat, item: Item): void {
  d.items = [...d.items, item]
}

function setResult(d: Chat, toolUseId: string, result: ToolResult): void {
  d.toolResults = { ...d.toolResults, [toolUseId]: result }
}

function applyTodoWrite(d: Chat, input: Msg): void {
  if (!Array.isArray(input?.todos)) return
  d.todos = (input.todos as Msg[]).map(
    (t, i): TodoItem => ({
      id: String(i),
      content: String(t.content ?? ''),
      activeForm: typeof t.activeForm === 'string' ? t.activeForm : undefined,
      status: t.status === 'in_progress' || t.status === 'completed' ? t.status : 'pending'
    })
  )
}

function applyTaskUpdate(d: Chat, input: Msg): void {
  const id = String(input?.taskId ?? '')
  if (!id) return
  if (input.status === 'deleted') {
    d.todos = d.todos.filter((t) => t.id !== id)
    return
  }
  d.todos = d.todos.map((t) =>
    t.id === id
      ? {
          ...t,
          content: typeof input.subject === 'string' ? input.subject : t.content,
          activeForm: typeof input.activeForm === 'string' ? input.activeForm : t.activeForm,
          status:
            input.status === 'in_progress' || input.status === 'completed' || input.status === 'pending'
              ? input.status
              : t.status
        }
      : t
  )
}

function onToolUse(d: Chat, block: Msg, parent: string | null): void {
  const input = (block.input ?? {}) as Msg
  pushItem(d, { kind: 'tool', id: String(block.id), name: String(block.name), input, parent })
  if (parent) return
  if (block.name === 'TodoWrite') applyTodoWrite(d, input)
  else if (block.name === 'TaskCreate')
    d.pendingTaskCreates = {
      ...d.pendingTaskCreates,
      [block.id]: { subject: String(input.subject ?? ''), activeForm: input.activeForm }
    }
  else if (block.name === 'TaskUpdate') applyTaskUpdate(d, input)
}

/** Remove the live (streaming) blocks that a completed assistant message now covers. */
function consumeLive(d: Chat, msg: Msg): void {
  if (!d.live || d.live.messageId !== msg.message?.id) return
  let blocks: LiveBlock[] = d.live.blocks
  for (const b of (msg.message?.content ?? []) as Msg[]) {
    const kind = b.type === 'text' ? 'text' : b.type === 'thinking' ? 'thinking' : b.type?.endsWith('tool_use') ? 'tool_use' : null
    if (!kind) continue
    const i = blocks.findIndex((lb) => lb.type === kind)
    if (i >= 0) blocks = [...blocks.slice(0, i), ...blocks.slice(i + 1)]
  }
  d.live = { ...d.live, blocks }
}

function onAssistant(d: Chat, msg: Msg): void {
  const parent: string | null = msg.parent_tool_use_id ?? null
  const content: Msg[] = Array.isArray(msg.message?.content) ? msg.message.content : []
  if (!parent) consumeLive(d, msg)

  if (msg.error) {
    const raw = textOf(content).text
    pushItem(d, { kind: 'notice', id: uid('err'), level: 'error', text: friendlyError(msg.error, raw) })
    return
  }

  content.forEach((b, i) => {
    const id = `${msg.uuid ?? uid('a')}:${i}`
    if (b.type === 'text') {
      if (b.text?.trim()) pushItem(d, { kind: 'text', id, text: b.text, parent })
    } else if (b.type === 'thinking') {
      if (b.thinking?.trim()) pushItem(d, { kind: 'thinking', id, text: b.thinking, parent })
    } else if (b.type === 'tool_use' || b.type === 'server_tool_use' || b.type === 'mcp_tool_use') {
      onToolUse(d, b, parent)
    } else if (typeof b.type === 'string' && b.type.endsWith('_tool_result') && b.tool_use_id) {
      // Server tool results (web search/fetch) arrive inside the assistant message.
      const r = Array.isArray(b.content)
        ? (b.content as Msg[])
            .map((c) => (c.title && c.url ? `${c.title} — ${c.url}` : c.text ?? ''))
            .filter(Boolean)
            .join('\n')
        : JSON.stringify(b.content ?? '')
      setResult(d, b.tool_use_id, { text: r, isError: !!b.content?.error_code, structured: b.content })
    }
  })

  const usage = msg.message?.usage
  if (!parent && usage) {
    const ctx = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
    if (ctx > 0) d.contextTokens = ctx
  }
}

function onUser(d: Chat, msg: Msg, fromHistory: boolean): void {
  const parent: string | null = msg.parent_tool_use_id ?? null
  const content = msg.message?.content
  if (Array.isArray(content) && content.some((b: Msg) => b?.type === 'tool_result')) {
    const results = (content as Msg[]).filter((b) => b?.type === 'tool_result')
    for (const b of results) {
      const { text, images } = textOf(b.content)
      const structured = results.length === 1 ? msg.tool_use_result : undefined
      setResult(d, String(b.tool_use_id), { text, isError: !!b.is_error, structured, images })
      const create = d.pendingTaskCreates[b.tool_use_id]
      if (create && !parent) {
        const task = (structured as Msg | undefined)?.task
        // Stored transcripts lack structured output; the result text reads "Task #3 created…".
        const id = String(task?.id ?? /Task #(\w+)/i.exec(text)?.[1] ?? b.tool_use_id)
        d.todos = [...d.todos, { id, content: String(task?.subject ?? create.subject), activeForm: create.activeForm, status: 'pending' }]
        const { [b.tool_use_id]: _done, ...rest } = d.pendingTaskCreates
        d.pendingTaskCreates = rest
      }
    }
    return
  }
  if (parent) return

  const { text, images } = textOf(content)
  if (/^\[Request interrupted by user/.test(text.trim())) {
    pushItem(d, { kind: 'notice', id: uid('int'), level: 'info', text: 'Interrupted' })
    return
  }
  // Live sessions don't echo our own prompts; synthetic and meta messages stay hidden.
  if (!fromHistory || msg.isSynthetic || msg.isMeta) return
  const cleaned = cleanHistoryText(text)
  if (cleaned.kind === 'skip') return
  if (cleaned.kind === 'output') {
    pushItem(d, { kind: 'command-output', id: uid('out'), text: cleaned.text })
    return
  }
  if (!cleaned.text && images.length === 0) return
  pushItem(d, { kind: 'user', id: msg.uuid ?? uid('u'), uuid: msg.uuid, text: cleaned.text, images })
}

function cleanHistoryText(raw: string): { kind: 'prompt' | 'output' | 'skip'; text: string } {
  const text = raw.trim()
  if (!text) return { kind: 'skip', text: '' }
  if (text.startsWith('Caveat: The messages below were generated by the user')) return { kind: 'skip', text: '' }
  const stdout = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)
  if (stdout) return stdout[1].trim() ? { kind: 'output', text: stdout[1].trim() } : { kind: 'skip', text: '' }
  const name = text.match(/<command-name>([\s\S]*?)<\/command-name>/)
  if (name) {
    const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim()
    const cmd = name[1].trim()
    return { kind: 'prompt', text: `${cmd.startsWith('/') ? cmd : `/${cmd}`}${args ? ` ${args}` : ''}` }
  }
  const stripped = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
  if (!stripped) return { kind: 'skip', text: '' }
  return { kind: 'prompt', text: stripped }
}

function onStreamEvent(d: Chat, msg: Msg): void {
  if (msg.parent_tool_use_id) return
  const ev = msg.event as Msg
  switch (ev?.type) {
    case 'message_start':
      d.live = { messageId: String(ev.message?.id ?? uid('m')), blocks: [] }
      break
    case 'content_block_start': {
      if (!d.live) return
      const cb = ev.content_block as Msg
      const type = cb?.type === 'text' ? 'text' : cb?.type === 'thinking' ? 'thinking' : cb?.type?.endsWith('tool_use') ? 'tool_use' : null
      if (!type) return
      d.live = {
        ...d.live,
        blocks: [...d.live.blocks, { index: ev.index, type, text: cb.text ?? cb.thinking ?? '', name: cb.name, id: cb.id }]
      }
      break
    }
    case 'content_block_delta': {
      if (!d.live) return
      const delta = ev.delta as Msg
      const add =
        delta?.type === 'text_delta' ? delta.text : delta?.type === 'thinking_delta' ? delta.thinking : delta?.type === 'input_json_delta' ? delta.partial_json : ''
      if (!add) return
      d.live = {
        ...d.live,
        blocks: d.live.blocks.map((b) => (b.index === ev.index ? { ...b, text: b.text + add } : b))
      }
      break
    }
    default:
      break
  }
}

function onSystem(d: Chat, msg: Msg): void {
  switch (msg.subtype) {
    case 'init': {
      d.init = {
        model: String(msg.model ?? ''),
        cwd: String(msg.cwd ?? ''),
        tools: msg.tools ?? [],
        mcpServers: (msg.mcp_servers ?? []).map((s: Msg) => ({ name: String(s.name), status: String(s.status) })),
        skills: msg.skills ?? [],
        plugins: msg.plugins ?? [],
        agents: msg.agents ?? [],
        slashCommands: msg.slash_commands ?? [],
        apiKeySource: String(msg.apiKeySource ?? ''),
        version: String(msg.claude_code_version ?? ''),
        outputStyle: String(msg.output_style ?? '')
      }
      d.persisted = true
      if (msg.permissionMode) d.permissionMode = msg.permissionMode as PermissionModeKey
      const key = modelKeyFromId(msg.model)
      if (key) d.model = key
      break
    }
    case 'status':
      d.statusText = msg.status === 'compacting' ? 'Compacting conversation…' : null
      if (msg.permissionMode) d.permissionMode = msg.permissionMode as PermissionModeKey
      if (msg.compact_result === 'failed') {
        pushItem(d, { kind: 'notice', id: uid('cmp'), level: 'warn', text: `Compaction failed${msg.compact_error ? `: ${msg.compact_error}` : ''}` })
      }
      break
    case 'compact_boundary':
      pushItem(d, { kind: 'compact', id: msg.uuid ?? uid('cb'), preTokens: msg.compact_metadata?.pre_tokens, trigger: msg.compact_metadata?.trigger ?? 'auto' })
      break
    case 'api_retry':
      d.statusText = `Retrying (attempt ${msg.attempt} of ${msg.max_retries})…`
      break
    case 'local_command_output':
      if (msg.content?.trim()) pushItem(d, { kind: 'command-output', id: msg.uuid ?? uid('lc'), text: String(msg.content) })
      break
    case 'informational':
      if ((msg.level === 'warning' || msg.level === 'suggestion') && msg.content) {
        pushItem(d, { kind: 'notice', id: msg.uuid ?? uid('inf'), level: msg.level === 'warning' ? 'warn' : 'info', text: String(msg.content) })
      }
      break
    case 'notification':
      if (msg.priority === 'high' || msg.priority === 'immediate') {
        pushItem(d, { kind: 'notice', id: msg.uuid ?? uid('ntf'), level: 'info', text: String(msg.text ?? '') })
      }
      break
    case 'model_refusal_fallback':
    case 'model_refusal_no_fallback':
      if (Array.isArray(msg.retracted_message_uuids) && msg.retracted_message_uuids.length) {
        const gone = new Set<string>(msg.retracted_message_uuids)
        d.items = d.items.filter((it) => !gone.has(it.id.split(':')[0]))
      }
      pushItem(d, { kind: 'notice', id: msg.uuid ?? uid('ref'), level: 'warn', text: String(msg.content ?? 'The model declined this request.') })
      if (msg.subtype === 'model_refusal_fallback' && msg.scope !== 'local') {
        const key = modelKeyFromId(msg.fallback_model)
        if (key) d.model = key
      }
      break
    case 'commands_changed':
      if (Array.isArray(msg.commands) && d.capabilities) {
        d.capabilities = {
          ...d.capabilities,
          commands: msg.commands.map((c: Msg) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint }))
        }
      }
      break
    case 'session_state_changed':
      if (msg.state === 'idle' && d.status === 'running') {
        d.status = 'ready'
        d.turnStartedAt = null
        d.statusText = null
        d.live = null
      } else if (msg.state === 'running' && d.status !== 'running') {
        d.status = 'running'
        d.turnStartedAt = d.turnStartedAt ?? Date.now()
      }
      break
    case 'task_started':
      if (msg.tool_use_id) {
        d.subagents = {
          ...d.subagents,
          [msg.tool_use_id]: { ...d.subagents[msg.tool_use_id], description: msg.description, status: 'running' }
        }
      }
      break
    case 'task_progress':
      if (msg.tool_use_id) {
        const prev = d.subagents[msg.tool_use_id] ?? { status: 'running' as const }
        d.subagents = {
          ...d.subagents,
          [msg.tool_use_id]: {
            ...prev,
            description: msg.description ?? prev.description,
            summary: msg.summary ?? prev.summary,
            lastTool: msg.last_tool_name ?? prev.lastTool,
            toolUses: msg.usage?.tool_uses ?? prev.toolUses,
            tokens: msg.usage?.total_tokens ?? prev.tokens
          }
        }
      }
      break
    case 'task_notification':
      if (msg.tool_use_id) {
        const prev = d.subagents[msg.tool_use_id] ?? { status: 'running' as const }
        d.subagents = {
          ...d.subagents,
          [msg.tool_use_id]: {
            ...prev,
            status: msg.status ?? 'completed',
            summary: msg.summary || prev.summary,
            toolUses: msg.usage?.tool_uses ?? prev.toolUses,
            tokens: msg.usage?.total_tokens ?? prev.tokens
          }
        }
      }
      break
    case 'background_tasks_changed':
      d.backgroundTasks = (msg.tasks ?? [])
        .filter((t: Msg) => !t.ambient)
        .map((t: Msg) => ({ taskId: String(t.task_id), type: String(t.task_type ?? ''), description: String(t.description ?? '') }))
      break
    case 'thinking_tokens':
      d.thinkingTokens = Number(msg.estimated_tokens ?? 0)
      break
    default:
      break
  }
}

function onResult(d: Chat, msg: Msg): void {
  d.live = null
  d.statusText = null
  d.thinkingTokens = 0
  if (typeof msg.total_cost_usd === 'number') {
    const turnCost = msg.total_cost_usd - d.costUsd
    d.costUsd = msg.total_cost_usd
    pushItem(d, {
      kind: 'turn-end',
      id: msg.uuid ?? uid('end'),
      durationMs: Number(msg.duration_ms ?? 0),
      costUsd: turnCost > 0 ? turnCost : undefined,
      isError: !!msg.is_error
    })
  }
  const usage = msg.modelUsage as Record<string, Msg> | undefined
  if (usage) {
    let out = 0
    let window = 0
    for (const u of Object.values(usage)) {
      out += u.outputTokens ?? 0
      window = Math.max(window, u.contextWindow ?? 0)
    }
    d.outputTokens = out
    if (window) d.contextWindow = window
  }
  if (msg.subtype !== 'success') {
    const why =
      msg.subtype === 'error_max_turns'
        ? 'Stopped: reached the maximum number of turns.'
        : msg.subtype === 'error_max_budget_usd'
          ? 'Stopped: reached the spending budget.'
          : (msg.errors as string[] | undefined)?.join('\n') || 'The turn ended with an error.'
    pushItem(d, { kind: 'notice', id: uid('res'), level: 'error', text: why })
  } else if (msg.is_error && typeof msg.result === 'string' && msg.result.trim()) {
    const last = d.items[d.items.length - 2]
    if (!(last?.kind === 'notice' && last.level === 'error')) {
      pushItem(d, { kind: 'notice', id: uid('res'), level: 'error', text: msg.result })
    }
  }
  if (!(msg.queued_turn_count > 0)) {
    d.status = 'ready'
    d.turnStartedAt = null
    d.items = d.items.map((it) => (it.kind === 'user' && it.queued ? { ...it, queued: false } : it))
  }
}

/** Apply one SDK message. Returns a new Chat object (never mutates the input). */
export function applyMessage(chat: Chat, msg: Msg, fromHistory = false): Chat {
  const d: Chat = { ...chat }
  switch (msg.type) {
    case 'assistant':
      onAssistant(d, msg)
      break
    case 'user':
      onUser(d, msg, fromHistory)
      break
    case 'stream_event':
      onStreamEvent(d, msg)
      break
    case 'system':
      onSystem(d, msg)
      break
    case 'result':
      onResult(d, msg)
      break
    case 'prompt_suggestion':
      if (typeof msg.suggestion === 'string') d.suggestion = msg.suggestion
      break
    case 'tool_progress':
      if (msg.tool_use_id) d.toolElapsed = { ...d.toolElapsed, [msg.tool_use_id]: Number(msg.elapsed_time_seconds ?? 0) }
      break
    case 'auth_status':
      if (msg.error) pushItem(d, { kind: 'notice', id: uid('auth'), level: 'error', text: String(msg.error) })
      break
    default:
      break
  }
  return d
}

/** Rebuild a transcript from a stored session. */
export function applyHistory(chat: Chat, messages: StoredMessage[]): Chat {
  let d = { ...chat, items: [] as Item[], toolResults: {}, todos: [] as TodoItem[] }
  for (const m of messages) {
    d = applyMessage(d, { type: m.type, uuid: m.uuid, message: m.message, parent_tool_use_id: m.parentToolUseId }, true)
  }
  return d
}
