import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EFFORTS, PERMISSION_MODES, getModel } from '@shared/models'
import { COMMANDS } from '../lib/commands'
import { fileIcon } from '../lib/tools'
import { useStore, type PaletteMode } from '../state/store'
import { MODEL_ICONS, useVisibleModels } from './chat/Pickers'
import { Icon } from './ui'

interface Entry {
  id: string
  label: ReactNode
  text: string
  detail?: string
  icon?: string
  keys?: string
  selected?: boolean
  run: () => void
}

function score(text: string, q: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i === 0) return 100
  if (i > 0) return 60 - i
  let k = 0
  for (const ch of t) if (ch === q[k]) k++
  return k === q.length ? 10 : -1
}

const PLACEHOLDERS: Record<Exclude<PaletteMode, null>, string> = {
  commands: 'Type a command',
  files: 'Search files by name (type > for commands)',
  model: 'Choose a model',
  effort: 'Choose thinking effort',
  mode: 'Choose a permission mode'
}

export function CommandPalette() {
  const mode = useStore((s) => s.palette)
  const setPalette = useStore((s) => s.setPalette)
  return createPortal(
    <AnimatePresence>
      {mode && (
        <motion.div
          className="modal-backdrop"
          style={{ background: 'rgba(5,6,10,0.35)', backdropFilter: 'blur(2px)', paddingTop: 60 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPalette(null)
          }}
        >
          <PaletteBody key={mode} mode={mode} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function PaletteBody({ mode }: { mode: Exclude<PaletteMode, null> }) {
  const { setPalette, setChatModel, setChatEffort, setChatPermissionMode, updateSettings, openTab } = useStore.getState()
  const project = useStore((s) => s.project)
  const activeChatId = useStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeTabId)
    return t?.kind === 'chat' ? t.id : null
  })
  const chat = useStore((s) => (activeChatId ? s.chats[activeChatId] : undefined))
  const settings = useStore((s) => s.settings)
  const models = useVisibleModels()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<string[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const close = (): void => setPalette(null)

  useEffect(() => {
    if (mode !== 'files' || !project) return
    const t = setTimeout(() => {
      window.geeked.fs.searchFiles(project.path, q).then(setFiles).catch(() => setFiles([]))
    }, 60)
    return () => clearTimeout(t)
  }, [q, mode, project])

  const entries: Entry[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (mode === 'commands') {
      return COMMANDS.filter((c) => c.enabled?.() ?? true)
        .map((c) => ({ c, s: score(`${c.category ?? ''}: ${c.title}`, needle) }))
        .filter((x) => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(({ c }) => ({
          id: c.id,
          label: (
            <>
              {c.category && <span style={{ color: 'var(--text-faint)' }}>{c.category}: </span>}
              {c.title}
            </>
          ),
          text: c.title,
          icon: c.icon,
          keys: c.keys,
          run: () => {
            close()
            setTimeout(() => c.run(), 0)
          }
        }))
    }
    if (mode === 'files') {
      return files.map((f) => ({
        id: f,
        label: f.split('/').pop() ?? f,
        text: f,
        detail: f,
        icon: fileIcon(f).icon,
        run: () => {
          close()
          if (project) {
            const full = `${project.path}${project.path.endsWith('\\') ? '' : '\\'}${f.replace(/\//g, '\\')}`
            openTab({ kind: 'file', id: `file:${full}`, path: full })
          }
        }
      }))
    }
    if (mode === 'model') {
      const current = chat?.model ?? settings?.defaultModel
      return models
        .filter((m) => score(m.name, needle) >= 0)
        .map((m) => ({
          id: m.key,
          label: m.key === 'ultra' ? <span className="ultra-text">{m.name}</span> : m.name,
          text: m.name,
          detail: m.tagline,
          icon: MODEL_ICONS[m.key],
          selected: m.key === current,
          run: () => {
            close()
            if (activeChatId) setChatModel(activeChatId, m.key)
            else void updateSettings({ defaultModel: m.key })
          }
        }))
    }
    if (mode === 'effort') {
      const current = chat?.effort ?? settings?.defaultEffort
      return EFFORTS.filter((e) => score(e.label, needle) >= 0).map((e) => ({
        id: e.key,
        label: e.key === 'ultracode' ? <span className="ultra-text">{e.label}</span> : e.label,
        text: e.label,
        detail: e.description,
        icon: e.key === 'ultracode' ? 'flame' : 'lightbulb',
        selected: e.key === current,
        run: () => {
          close()
          if (activeChatId) setChatEffort(activeChatId, e.key)
          else void updateSettings({ defaultEffort: e.key })
        }
      }))
    }
    const current = chat?.permissionMode ?? settings?.defaultPermissionMode
    return PERMISSION_MODES.filter((m) => score(m.label, needle) >= 0).map((m) => ({
      id: m.key,
      label: m.label,
      text: m.label,
      detail: m.description,
      icon: m.icon,
      selected: m.key === current,
      run: () => {
        close()
        if (activeChatId) setChatPermissionMode(activeChatId, m.key)
        else void updateSettings({ defaultPermissionMode: m.key })
      }
    }))
  }, [mode, q, files, models, chat, settings, activeChatId, project]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sel = entries.findIndex((e) => e.selected)
    setIndex(sel >= 0 && !q ? sel : 0)
  }, [entries.length, q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <motion.div
      className="palette"
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <input
        autoFocus
        placeholder={mode === 'model' ? `${PLACEHOLDERS.model}${chat ? ` (current: ${getModel(chat.model).name})` : ''}` : PLACEHOLDERS[mode]}
        value={q}
        onChange={(e) => {
          const v = e.target.value
          if (mode === 'files' && v.startsWith('>')) {
            setPalette('commands')
            return
          }
          setQ(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((i) => Math.min(entries.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            entries[index]?.run()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close()
          }
        }}
      />
      <div className="palette-list" ref={listRef}>
        {entries.length === 0 && <div className="empty-hint" style={{ padding: 18 }}>{mode === 'files' && !project ? 'Open a project first.' : 'No matches'}</div>}
        {entries.map((e, i) => (
          <div key={e.id} data-idx={i} className="palette-item" onMouseMove={() => setIndex(i)} onClick={() => e.run()}>
            {i === index && <motion.span layoutId="palette-hl" className="hl" transition={{ type: 'spring', stiffness: 700, damping: 45 }} />}
            {e.icon ? <Icon name={e.icon} className="sm" /> : <span style={{ width: 14 }} />}
            <span className="label">{e.label}</span>
            {e.detail && <span className="detail" style={{ maxWidth: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.detail}</span>}
            {e.selected && <Icon name="check" className="sm" />}
            {e.keys && <span className="detail">{e.keys}</span>}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
