import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ChatSummary, DirEntry } from '@shared/ipc'
import { getModel } from '@shared/models'
import { fillComposer } from '../lib/composerBus'
import { relPath, timeAgo } from '../lib/format'
import { fileIcon } from '../lib/tools'
import { useActiveChat, useStore } from '../state/store'
import type { SidebarView } from '../state/types'
import { Collapse, Icon } from './ui'

const api = window.geeked

/* ───────────── Activity bar ───────────── */

const VIEWS: { id: SidebarView; icon: string; title: string }[] = [
  { id: 'explorer', icon: 'files', title: 'Explorer (Ctrl+Shift+E)' },
  { id: 'chats', icon: 'comment-discussion', title: 'Chats (Ctrl+Shift+H)' },
  { id: 'capabilities', icon: 'extensions', title: 'Agent capabilities (Ctrl+Shift+X)' }
]

export function ActivityBar() {
  const view = useStore((s) => s.sidebarView)
  const visible = useStore((s) => s.sidebarVisible)
  const setUi = useStore((s) => s.setUi)
  const openTab = useStore((s) => s.openTab)
  const running = useStore((s) => Object.values(s.chats).filter((c) => c.status === 'running').length)
  const waiting = useStore((s) => Object.values(s.chats).reduce((n, c) => n + c.permissions.length, 0))

  return (
    <div className="activitybar">
      {VIEWS.map((v) => {
        const active = visible && view === v.id
        return (
          <button
            key={v.id}
            className={`activity-btn ${active ? 'active' : ''}`}
            title={v.title}
            onClick={() => setUi(active ? { sidebarVisible: false } : { sidebarView: v.id, sidebarVisible: true })}
          >
            {active && <motion.span layoutId="activity-indicator" className="activity-indicator" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <Icon name={v.icon} />
            {v.id === 'chats' && (waiting > 0 || running > 0) && (
              <motion.span className="activity-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} style={waiting ? { background: 'var(--warn)', color: '#2b1d00' } : undefined}>
                {waiting || running}
              </motion.span>
            )}
          </button>
        )
      })}
      <div className="activity-spacer" />
      <button className="activity-btn" title="Settings (Ctrl+,)" onClick={() => openTab({ kind: 'settings', id: 'settings' })}>
        <Icon name="settings-gear" />
      </button>
    </div>
  )
}

/* ───────────── Explorer ───────────── */

function TreeNode({ entry, depth, expanded, toggle, selected, onOpen, version, root }: {
  entry: DirEntry
  depth: number
  expanded: Set<string>
  toggle: (p: string) => void
  selected: string | null
  onOpen: (p: string) => void
  version: number
  root: string
}) {
  const open = entry.isDir && expanded.has(entry.path)
  const [children, setChildren] = useState<DirEntry[] | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    api.fs
      .listDir(entry.path)
      .then((c) => alive && setChildren(c))
      .catch(() => alive && setChildren([]))
    return () => {
      alive = false
    }
  }, [open, entry.path, version])

  const fi = fileIcon(entry.path)
  return (
    <>
      <div
        className={`tree-row ${selected === entry.path ? 'selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => (entry.isDir ? toggle(entry.path) : onOpen(entry.path))}
        title={relPath(entry.path, root)}
        draggable={!entry.isDir}
      >
        <span className={`twist ${open ? 'open' : ''}`}>{entry.isDir && <Icon name="chevron-right" className="sm" />}</span>
        <Icon name={entry.isDir ? (open ? 'folder-opened' : 'folder') : fi.icon} className="sm" />
        <span className="name" style={entry.isDir ? undefined : { color: undefined }}>
          {entry.name}
        </span>
        {!entry.isDir && (
          <span className="row-actions">
            <button
              className="icon-btn"
              title="Mention in chat"
              onClick={(e) => {
                e.stopPropagation()
                const st = useStore.getState()
                const tab = st.tabs.find((t) => t.id === st.activeTabId)
                const chatId = tab?.kind === 'chat' ? tab.id : st.newChat()
                const rel = relPath(entry.path, root)
                if (chatId) setTimeout(() => fillComposer(chatId, /\s/.test(rel) ? `@"${rel}" ` : `@${rel} `, 'append'), 30)
              }}
            >
              <Icon name="mention" className="xs" />
            </button>
          </span>
        )}
      </div>
      {open &&
        children?.map((c) => (
          <TreeNode key={c.path} entry={c} depth={depth + 1} expanded={expanded} toggle={toggle} selected={selected} onOpen={onOpen} version={version} root={root} />
        ))}
    </>
  )
}

function ExplorerView() {
  const project = useStore((s) => s.project)
  const fsVersion = useStore((s) => s.fsVersion)
  const activeTabId = useStore((s) => s.activeTabId)
  const { openTab, setDialog, openProjectDialog, newChat } = useStore.getState()
  const [rootEntries, setRootEntries] = useState<DirEntry[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [refreshTick, setRefreshTick] = useState(0)
  const [collapsedRoot, setCollapsedRoot] = useState(false)

  useEffect(() => {
    setExpanded(new Set())
    setRootEntries(null)
  }, [project?.path])

  useEffect(() => {
    if (!project) return
    let alive = true
    api.fs
      .listDir(project.path)
      .then((e) => alive && setRootEntries(e))
      .catch(() => alive && setRootEntries([]))
    return () => {
      alive = false
    }
  }, [project, fsVersion, refreshTick])

  const toggle = useCallback((p: string) => {
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }, [])

  const selected = activeTabId?.startsWith('file:') ? activeTabId.slice(5) : null

  return (
    <>
      <div className="sidebar-header">
        Explorer
        <span className="actions">
          <button className="icon-btn" title="New Chat (Ctrl+N)" onClick={() => newChat()}>
            <Icon name="comment-discussion" className="sm" />
          </button>
          <button className="icon-btn" title="New Project (Ctrl+Shift+N)" onClick={() => setDialog('newProject')}>
            <Icon name="new-folder" className="sm" />
          </button>
          <button className="icon-btn" title="Open Project (Ctrl+O)" onClick={() => void openProjectDialog()}>
            <Icon name="folder-opened" className="sm" />
          </button>
        </span>
      </div>
      <div className="sidebar-body">
        {!project ? (
          <div style={{ padding: '8px 20px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0 }}>No project is open yet. Start a new one with just a name, or open a folder you already have.</p>
            <button className="btn primary" onClick={() => setDialog('newProject')}>
              <Icon name="add" className="sm" /> New Project
            </button>
            <button className="btn" onClick={() => void openProjectDialog()}>
              <Icon name="folder-opened" className="sm" /> Open Project
            </button>
          </div>
        ) : (
          <>
            <div className={`section-header ${collapsedRoot ? 'collapsed' : ''}`} onClick={() => setCollapsedRoot((c) => !c)}>
              <Icon name="chevron-down" className="sm chev" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title="Refresh" onClick={() => setRefreshTick((t) => t + 1)}>
                  <Icon name="refresh" className="sm" />
                </button>
                <button className="icon-btn" title="Collapse folders" onClick={() => setExpanded(new Set())}>
                  <Icon name="collapse-all" className="sm" />
                </button>
                <button className="icon-btn" title="Reveal in File Explorer" onClick={() => void api.projects.reveal(project.path)}>
                  <Icon name="link-external" className="sm" />
                </button>
              </span>
            </div>
            <Collapse open={!collapsedRoot}>
              <div style={{ paddingBottom: 12 }}>
                {rootEntries?.length === 0 && (
                  <div style={{ padding: '6px 24px', color: 'var(--text-faint)' }}>This project is empty. Ask GeekedGPT to build something!</div>
                )}
                {rootEntries?.map((e) => (
                  <TreeNode
                    key={e.path}
                    entry={e}
                    depth={0}
                    expanded={expanded}
                    toggle={toggle}
                    selected={selected}
                    onOpen={(p) => openTab({ kind: 'file', id: `file:${p}`, path: p })}
                    version={fsVersion + refreshTick}
                    root={project.path}
                  />
                ))}
              </div>
            </Collapse>
          </>
        )}
      </div>
    </>
  )
}

/* ───────────── Chats ───────────── */

function groupOf(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ms >= startToday) return 'Today'
  if (ms >= startToday - 86_400_000) return 'Yesterday'
  if (ms >= startToday - 6 * 86_400_000) return 'Previous 7 days'
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleString(undefined, { month: 'long' })
  return String(d.getFullYear())
}

function ChatRow({ summary, open, running, waiting }: { summary: ChatSummary; open: boolean; running: boolean; waiting: boolean }) {
  const { openHistoryChat, renameChat, deleteChat } = useStore.getState()
  const active = useStore((s) => s.activeTabId === summary.sessionId)
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [title, setTitle] = useState(summary.title)

  return (
    <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
      <div className={`tree-row ${active ? 'selected' : ''}`} style={{ paddingLeft: 14, height: 28 }} onClick={() => !renaming && void openHistoryChat(summary)} title={summary.title}>
        {running ? <Icon name="loading" spin className="sm" /> : waiting ? <Icon name="bell" className="sm" /> : <Icon name={open ? 'comment-discussion' : 'comment'} className="sm" />}
        {renaming ? (
          <input
            className="rename"
            autoFocus
            value={title}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false)
              if (title.trim() && title !== summary.title) void renameChat(summary.sessionId, title)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setTitle(summary.title)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <span className="name">{summary.title}</span>
        )}
        {!renaming && <span className="muted hide-on-hover">{timeAgo(summary.lastModified)}</span>}
        {!renaming && (
          <span className="row-actions" onClick={(e) => e.stopPropagation()}>
            {confirming ? (
              <>
                <button className="btn danger sm" style={{ height: 20, padding: '0 6px' }} onClick={() => void deleteChat(summary.sessionId)}>
                  Delete
                </button>
                <button className="icon-btn" title="Cancel" onClick={() => setConfirming(false)}>
                  <Icon name="close" className="xs" />
                </button>
              </>
            ) : (
              <>
                <button className="icon-btn" title="Rename" onClick={() => setRenaming(true)}>
                  <Icon name="edit" className="xs" />
                </button>
                <button className="icon-btn" title="Delete chat" onClick={() => setConfirming(true)}>
                  <Icon name="trash" className="xs" />
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </motion.div>
  )
}

function ChatsView() {
  const project = useStore((s) => s.project)
  const history = useStore((s) => s.history)
  const chats = useStore((s) => s.chats)
  const loading = useStore((s) => s.historyLoading)
  const { newChat, refreshHistory } = useStore.getState()
  const [q, setQ] = useState('')

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  // Open chats that aren't on disk yet still show up first.
  const merged = useMemo(() => {
    const byId = new Map(history.map((h) => [h.sessionId, h]))
    for (const c of Object.values(chats)) {
      if (!byId.has(c.id) && c.items.length > 0) byId.set(c.id, { sessionId: c.id, title: c.title, lastModified: Date.now() })
      else if (byId.has(c.id) && c.title !== 'New chat' && c.title !== 'Chat') byId.set(c.id, { ...byId.get(c.id)!, title: c.title })
    }
    const list = [...byId.values()].sort((a, b) => b.lastModified - a.lastModified)
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((h) => h.title.toLowerCase().includes(needle)) : list
  }, [history, chats, q])

  const groups = useMemo(() => {
    const out: { label: string; items: ChatSummary[] }[] = []
    for (const h of merged) {
      const g = groupOf(h.lastModified)
      const last = out[out.length - 1]
      if (last?.label === g) last.items.push(h)
      else out.push({ label: g, items: [h] })
    }
    return out
  }, [merged])

  return (
    <>
      <div className="sidebar-header">
        Chats
        <span className="actions">
          <button className="icon-btn" title="Refresh" onClick={() => void refreshHistory()}>
            <Icon name="refresh" className={`sm ${loading ? 'spin' : ''}`} />
          </button>
          <button className="icon-btn" title="New Chat (Ctrl+N)" onClick={() => newChat()}>
            <Icon name="add" className="sm" />
          </button>
        </span>
      </div>
      {project && (
        <div style={{ padding: '0 12px 8px' }}>
          <input className="input" style={{ height: 28, fontSize: 12.5 }} placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="sidebar-body">
        {!project && <div className="empty-hint">Open a project to see its chats.</div>}
        {project && merged.length === 0 && !loading && (
          <div className="empty-hint">
            <Icon name="comment-discussion" />
            {q ? 'No chats match.' : 'No chats yet in this project.'}
            {!q && (
              <button className="btn primary sm" onClick={() => newChat()}>
                Start a chat
              </button>
            )}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 6 }}>
            <div className="dropdown-label" style={{ paddingLeft: 16 }}>
              {g.label}
            </div>
            <AnimatePresence initial={false}>
              {g.items.map((h) => {
                const c = chats[h.sessionId]
                return <ChatRow key={h.sessionId} summary={h} open={!!c} running={c?.status === 'running'} waiting={(c?.permissions.length ?? 0) > 0} />
              })}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </>
  )
}

/* ───────────── Capabilities ───────────── */

function CapSection({ title, count, children, defaultOpen = false }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <div className={`section-header ${open ? '' : 'collapsed'}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="chevron-down" className="sm chev" />
        {title}
        {count !== undefined && <span style={{ marginLeft: 6, color: 'var(--text-faint)', fontWeight: 500 }}>{count}</span>}
      </div>
      <Collapse open={open}>
        <div style={{ padding: '2px 0 10px' }}>{children}</div>
      </Collapse>
    </div>
  )
}

function CapRow({ icon, name, detail, dot }: { icon: string; name: string; detail?: string; dot?: string }) {
  return (
    <div className="tree-row" style={{ paddingLeft: 22, height: 'auto', minHeight: 24, alignItems: 'flex-start', paddingTop: 3, paddingBottom: 3, cursor: 'default' }} title={detail}>
      <Icon name={icon} className="sm" />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="name">{name}</span>
        {detail && <span style={{ color: 'var(--text-faint)', fontSize: 11.5, whiteSpace: 'normal', lineHeight: 1.35 }}>{detail}</span>}
      </span>
      {dot && <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: 4, background: dot, flex: 'none', marginTop: 5 }} />}
    </div>
  )
}

function authLabel(source: string | undefined, hasAccount: boolean): string {
  if (source === 'ANTHROPIC_API_KEY') return 'API key'
  if (source === 'apiKeyHelper') return 'API key helper'
  if (source === '/login managed key') return 'Console API key'
  if (hasAccount) return 'Claude account sign-in'
  return source && source !== 'none' ? source : 'Checking…'
}

function CapabilitiesView() {
  const chat = useActiveChat()
  const ensureStarted = useStore((s) => s.ensureStarted)
  const caps = chat?.capabilities
  const init = chat?.init

  return (
    <>
      <div className="sidebar-header">Agent</div>
      <div className="sidebar-body">
        {!chat ? (
          <div className="empty-hint">
            <Icon name="extensions" />
            Open a chat to see what GeekedGPT can do in it.
          </div>
        ) : (
          <>
            <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-dim)', fontSize: 12.5 }}>
              <div>
                <b style={{ color: 'var(--text)' }}>{getModel(chat.model).name}</b> · {chat.status === 'idle' ? 'not started' : chat.status}
              </div>
              {init?.version && <div>Claude Code engine {init.version}</div>}
              {caps?.account?.email && <div>Signed in as {caps.account.email}</div>}
              {(caps || init) && <div>Auth: {authLabel(caps?.account?.apiKeySource || init?.apiKeySource, !!caps?.account?.email)}</div>}
              {(chat.status === 'idle' || chat.status === 'closed') && (
                <button className="btn sm" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={() => void ensureStarted(chat.id)}>
                  <Icon name="play" className="sm" /> Start session
                </button>
              )}
            </div>
            {!caps && !init && chat.status !== 'idle' && chat.status !== 'closed' && <div className="empty-hint">Loading capabilities…</div>}
            {init && (
              <CapSection title="Tools" count={init.tools.length} defaultOpen>
                {init.tools.map((t) => (
                  <CapRow key={t} icon={t.startsWith('mcp__') ? 'plug' : 'tools'} name={t} />
                ))}
              </CapSection>
            )}
            {init && (
              <CapSection title="MCP servers" count={init.mcpServers.length}>
                {init.mcpServers.length === 0 && <div style={{ padding: '2px 24px', color: 'var(--text-faint)' }}>None configured</div>}
                {init.mcpServers.map((m) => (
                  <CapRow key={m.name} icon="plug" name={m.name} detail={m.status} dot={m.status === 'connected' ? 'var(--success)' : m.status === 'failed' ? 'var(--danger)' : 'var(--warn)'} />
                ))}
              </CapSection>
            )}
            {caps && (
              <CapSection title="Subagents" count={caps.agents.length}>
                {caps.agents.map((a) => (
                  <CapRow key={a.name} icon="hubot" name={a.name} detail={a.description} />
                ))}
              </CapSection>
            )}
            {init && (
              <CapSection title="Skills" count={init.skills.length}>
                {init.skills.length === 0 && <div style={{ padding: '2px 24px', color: 'var(--text-faint)' }}>No skills installed</div>}
                {init.skills.map((s) => (
                  <CapRow key={s} icon="book" name={s} />
                ))}
              </CapSection>
            )}
            {init && init.plugins.length > 0 && (
              <CapSection title="Plugins" count={init.plugins.length}>
                {init.plugins.map((p) => (
                  <CapRow key={p.path} icon="package" name={p.name} detail={p.version ? `v${p.version}` : p.path} />
                ))}
              </CapSection>
            )}
            {caps && (
              <CapSection title="Slash commands" count={caps.commands.length}>
                {caps.commands.map((c) => (
                  <CapRow key={c.name} icon="symbol-misc" name={`/${c.name}`} detail={c.description} />
                ))}
              </CapSection>
            )}
          </>
        )}
      </div>
    </>
  )
}

export function SideBar() {
  const view = useStore((s) => s.sidebarView)
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6, transition: { duration: 0.08 } }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      >
        {view === 'explorer' ? <ExplorerView /> : view === 'chats' ? <ChatsView /> : <CapabilitiesView />}
      </motion.div>
    </AnimatePresence>
  )
}
