import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { duration, money, tokens } from '../../lib/format'
import { toolMeta } from '../../lib/tools'
import { useSmoothText } from '../../hooks/useSmoothText'
import { useStore } from '../../state/store'
import type { Chat, Item, LiveBlock } from '../../state/types'
import { Collapse, Icon, Logo } from '../ui'
import { CopyButton, Markdown } from './Markdown'
import { ToolCard } from './ToolCard'

const enter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.8 }
}

function Thinking({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false)
  const shown = useSmoothText(text, !!streaming)
  return (
    <div className="thinking">
      <button className="thinking-head" onClick={() => setOpen((o) => !o)}>
        <Icon name="lightbulb" className="sm" />
        <span className={streaming ? 'shimmer-text' : ''}>{streaming ? 'Thinking…' : 'Thought process'}</span>
        <Icon name="chevron-right" className={`xs chev-rot ${open || streaming ? 'open' : ''}`} />
      </button>
      <Collapse open={open || !!streaming}>
        <div className="thinking-body">
          <Markdown text={shown} streaming={streaming} />
        </div>
      </Collapse>
    </div>
  )
}

const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])
type ToolItem = Extract<Item, { kind: 'tool' }>

/** A run of task-list tool calls, shown as compact inline events instead of cards. */
function TaskEvents({ items, chat }: { items: ToolItem[]; chat: Chat }) {
  const events = items.map((it) => {
    const input = it.input as Record<string, unknown>
    const id = String(input.taskId ?? '')
    const subject = String(input.subject ?? chat.todos.find((t) => t.id === id)?.content ?? (id ? `task ${id}` : 'task'))
    if (it.name === 'TaskCreate') return { icon: 'add', text: `Added “${subject}”`, tone: '' }
    if (it.name === 'TaskUpdate') {
      if (input.status === 'completed') return { icon: 'pass-filled', text: `Completed “${subject}”`, tone: 'ok' }
      if (input.status === 'in_progress') return { icon: 'play-circle', text: `Started “${subject}”`, tone: 'run' }
      if (input.status === 'deleted') return { icon: 'trash', text: `Removed “${subject}”`, tone: '' }
      return { icon: 'edit', text: `Updated “${subject}”`, tone: '' }
    }
    return { icon: 'checklist', text: 'Checked the task list', tone: '' }
  })
  return (
    <div className="task-events">
      <Icon name="checklist" className="sm" />
      {events.map((e, i) => (
        <motion.span key={i} className={`task-event ${e.tone}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
          <Icon name={e.icon} className="xs" />
          {e.text}
        </motion.span>
      ))}
    </div>
  )
}

function ToolSearchLine({ item, done }: { item: ToolItem; done: boolean }) {
  const q = String((item.input as Record<string, unknown>).query ?? '')
  const text = q.startsWith('select:') ? `Loaded ${q.slice(7).split(',').join(', ')}` : `Looked up tools for “${q}”`
  return (
    <div className="task-events faint">
      <Icon name={done ? 'tools' : 'loading'} spin={!done} className="sm" />
      <span>{text}</span>
    </div>
  )
}

const UserMessage = memo(function UserMessage({ item, chatId, canRewind }: { item: Extract<Item, { kind: 'user' }>; chatId: string; canRewind: boolean }) {
  return (
    <div className="msg-user">
      {item.images.length > 0 && (
        <div className="bubble-images">
          {item.images.map((src, i) => (
            <img key={i} src={src} alt="" />
          ))}
        </div>
      )}
      {item.text && <div className={`bubble selectable ${item.queued ? 'queued' : ''}`}>{item.text}</div>}
      {item.queued && (
        <span className="queued-tag">
          <Icon name="history" className="xs" /> Queued — sends when GeekedGPT is ready
        </span>
      )}
      <div className="msg-actions">
        <CopyButton text={item.text} label="Copy message" />
        {canRewind && item.uuid && (
          <button className="icon-btn" title="Restore files to before this message" onClick={() => void useStore.getState().rewindTo(chatId, item.uuid!)}>
            <Icon name="discard" className="sm" />
          </button>
        )}
      </div>
    </div>
  )
})

function AssistantText({ text, avatar, streaming }: { text: string; avatar: boolean; streaming?: boolean }) {
  const shown = useSmoothText(text, !!streaming)
  return (
    <div className={`msg-assistant ${avatar ? '' : 'continued'}`}>
      <Logo size={26} className="avatar" />
      <div className="body">
        <Markdown text={shown} streaming={streaming} />
        {streaming && <span className="cursor-blink" />}
      </div>
    </div>
  )
}

function LiveBlockView({ block, avatar, root }: { block: LiveBlock; avatar: boolean; root?: string }) {
  if (block.type === 'text') return <AssistantText text={block.text} avatar={avatar} streaming />
  if (block.type === 'thinking') return <Thinking text={block.text} streaming />
  const meta = toolMeta(block.name ?? 'Tool', {}, root)
  return (
    <div className="tool running">
      <div className="tool-head">
        <span className="t-icon">
          <Icon name={meta.icon} />
        </span>
        <span className="t-label shimmer-text">{meta.active}…</span>
        <span className="t-summary" />
        <span className="t-status">
          <Icon name="loading" spin className="sm" />
        </span>
      </div>
    </div>
  )
}

function WorkingIndicator({ chat }: { chat: Chat }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsed = chat.turnStartedAt ? Date.now() - chat.turnStartedAt : 0
  const label =
    chat.statusText ??
    (chat.thinkingTokens > 0 ? `Thinking · ${tokens(chat.thinkingTokens)} tokens` : chat.live?.blocks.length ? 'Working…' : 'Thinking…')
  return (
    <motion.div className="working" {...enter}>
      <span className="orbit">
        <span />
        <span />
      </span>
      <span className="shimmer-text">{label}</span>
      <span className="elapsed">{duration(Math.floor(elapsed / 1000) * 1000)}</span>
    </motion.div>
  )
}

export function Transcript({ chat, root, children }: { chat: Chat; root?: string; children?: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [showJump, setShowJump] = useState(false)
  // Items present on first render (e.g. loaded history) don't animate in.
  const initialIds = useRef<Set<string> | null>(null)
  if (initialIds.current === null) initialIds.current = new Set(chat.items.map((i) => i.id))
  useEffect(() => {
    if (chat.loadingHistory) initialIds.current = new Set()
    else if (initialIds.current && initialIds.current.size === 0) initialIds.current = new Set(chat.items.map((i) => i.id))
  }, [chat.loadingHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scroller.current
    const content = inner.current
    if (!el || !content) return
    const onScroll = (): void => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight
      stick.current = gap < 80
      setShowJump(gap > 400)
    }
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    el.addEventListener('scroll', onScroll, { passive: true })
    el.scrollTop = el.scrollHeight
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // Sending a message always snaps back to the bottom.
  const userCount = chat.items.filter((i) => i.kind === 'user').length
  useEffect(() => {
    stick.current = true
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [userCount])

  const topLevel = chat.items.filter((i) => !('parent' in i) || !i.parent)
  const childrenOf = (parent: string): ReactNode => {
    const kids = chat.items.filter((i) => 'parent' in i && i.parent === parent)
    if (!kids.length) {
      const sub = chat.subagents[parent]
      return sub?.summary ? (
        <div className="subagent-summary">
          <Icon name="pulse" className="sm" /> {sub.summary}
        </div>
      ) : null
    }
    return kids.map((k) => renderItem(k, false, true))
  }

  const canRewind = chat.status === 'ready' || chat.status === 'running'

  function renderItem(item: Item, avatar: boolean, nested = false): ReactNode {
    switch (item.kind) {
      case 'user':
        return <UserMessage item={item} chatId={chat.id} canRewind={canRewind} />
      case 'text':
        return nested ? <Markdown text={item.text} /> : <AssistantText text={item.text} avatar={avatar} />
      case 'thinking':
        return nested ? null : <Thinking text={item.text} />
      case 'tool':
        return <ToolCard item={item} chat={chat} root={root} nested={nested} renderChildren={childrenOf} />
      case 'notice':
        return (
          <div className={`notice ${item.level}`}>
            <Icon name={item.level === 'error' ? 'error' : item.level === 'warn' ? 'warning' : 'info'} className="sm" />
            <Markdown text={item.text} />
          </div>
        )
      case 'compact':
        return (
          <div className="divider-line">
            <Icon name="fold" className="xs" /> Conversation compacted{item.preTokens ? ` · was ${tokens(item.preTokens)} tokens` : ''}
          </div>
        )
      case 'turn-end':
        return (
          <div className="turn-end">
            <Icon name={item.isError ? 'error' : 'pass'} className={`xs ${item.isError ? '' : 'ok'}`} />
            {item.isError ? 'Stopped' : 'Done'} in {duration(item.durationMs)}
            {item.costUsd ? ` · ${money(item.costUsd)}` : ''}
          </div>
        )
      case 'command-output':
        return (
          <div className="cmd-output">
            <Markdown text={item.text} />
          </div>
        )
    }
  }

  // Group consecutive task-list tool calls into one compact row.
  const units: (Item | ToolItem[])[] = []
  for (const item of topLevel) {
    if (item.kind === 'tool' && TASK_TOOLS.has(item.name)) {
      const last = units[units.length - 1]
      if (Array.isArray(last)) last.push(item)
      else units.push([item])
    } else units.push(item)
  }

  let prevKind: string | null = null
  const rendered = units.map((unit) => {
    const first = Array.isArray(unit) ? unit[0] : unit
    const animate = !initialIds.current?.has(first.id)
    const motionProps = animate ? enter : { initial: false as const }
    if (Array.isArray(unit)) {
      prevKind = 'tool'
      return (
        <motion.div key={`tasks-${first.id}`} {...motionProps}>
          <TaskEvents items={unit} chat={chat} />
        </motion.div>
      )
    }
    const item = unit
    const avatar = item.kind === 'text' && prevKind !== 'text' && prevKind !== 'tool' && prevKind !== 'thinking'
    prevKind = item.kind
    return (
      <motion.div key={item.id} {...motionProps}>
        {item.kind === 'tool' && item.name === 'ToolSearch' ? <ToolSearchLine item={item} done={!!chat.toolResults[item.id] || chat.status !== 'running'} /> : renderItem(item, avatar)}
      </motion.div>
    )
  })
  const liveAvatarBase = prevKind !== 'text' && prevKind !== 'tool' && prevKind !== 'thinking'
  const showWorking = chat.status === 'running' && chat.permissions.length === 0 && !chat.live?.blocks.some((b) => b.type === 'text')

  return (
    <div className="transcript-wrap">
    <div className="transcript" ref={scroller}>
      <div className="transcript-inner" ref={inner}>
        {rendered}
        {chat.live?.blocks.map((b, i) => (
          <motion.div key={`live-${chat.live!.messageId}-${b.index}`} {...enter}>
            <LiveBlockView block={b} avatar={i === 0 && liveAvatarBase} root={root} />
          </motion.div>
        ))}
        <AnimatePresence>{showWorking && <WorkingIndicator key="working" chat={chat} />}</AnimatePresence>
        {children}
      </div>
    </div>
      <AnimatePresence>
        {showJump && (
          <motion.button
            className="scroll-fab"
            style={{ x: '-50%' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => {
              stick.current = true
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
            }}
          >
            <Icon name="arrow-down" className="sm" /> Jump to latest
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
