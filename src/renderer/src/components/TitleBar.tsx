import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { command, runCommand } from '../lib/commands'
import type { MenuRole } from '@shared/ipc'
import { useStore } from '../state/store'
import { Icon, Logo } from './ui'

type Entry =
  | { type: 'cmd'; id: string }
  | { type: 'role'; label: string; role: MenuRole; keys?: string }
  | { type: 'sep' }
  | { type: 'label'; label: string }
  | { type: 'recent' }

const MENUS: { label: string; items: Entry[] }[] = [
  {
    label: 'File',
    items: [
      { type: 'cmd', id: 'chat.new' },
      { type: 'cmd', id: 'project.new' },
      { type: 'cmd', id: 'project.open' },
      { type: 'recent' },
      { type: 'sep' },
      { type: 'cmd', id: 'project.reveal' },
      { type: 'cmd', id: 'project.close' },
      { type: 'sep' },
      { type: 'cmd', id: 'settings.open' },
      { type: 'sep' },
      { type: 'cmd', id: 'app.quit' }
    ]
  },
  {
    label: 'Edit',
    items: [
      { type: 'role', label: 'Undo', role: 'undo', keys: 'Ctrl+Z' },
      { type: 'role', label: 'Redo', role: 'redo', keys: 'Ctrl+Y' },
      { type: 'sep' },
      { type: 'role', label: 'Cut', role: 'cut', keys: 'Ctrl+X' },
      { type: 'role', label: 'Copy', role: 'copy', keys: 'Ctrl+C' },
      { type: 'role', label: 'Paste', role: 'paste', keys: 'Ctrl+V' },
      { type: 'sep' },
      { type: 'role', label: 'Select All', role: 'selectAll', keys: 'Ctrl+A' }
    ]
  },
  {
    label: 'View',
    items: [
      { type: 'cmd', id: 'palette.commands' },
      { type: 'cmd', id: 'palette.files' },
      { type: 'sep' },
      { type: 'cmd', id: 'view.explorer' },
      { type: 'cmd', id: 'view.chats' },
      { type: 'cmd', id: 'view.capabilities' },
      { type: 'sep' },
      { type: 'cmd', id: 'view.sidebar' },
      { type: 'cmd', id: 'view.panel' },
      { type: 'sep' },
      { type: 'cmd', id: 'view.zoomIn' },
      { type: 'cmd', id: 'view.zoomOut' },
      { type: 'cmd', id: 'view.zoomReset' },
      { type: 'cmd', id: 'view.fullscreen' },
      { type: 'sep' },
      { type: 'cmd', id: 'dev.tools' },
      { type: 'cmd', id: 'dev.reload' }
    ]
  },
  {
    label: 'Chat',
    items: [
      { type: 'cmd', id: 'chat.new' },
      { type: 'cmd', id: 'chat.stop' },
      { type: 'sep' },
      { type: 'cmd', id: 'chat.model' },
      { type: 'cmd', id: 'chat.effort' },
      { type: 'cmd', id: 'chat.mode' },
      { type: 'sep' },
      { type: 'cmd', id: 'chat.compact' },
      { type: 'cmd', id: 'chat.context' },
      { type: 'cmd', id: 'chat.init' }
    ]
  },
  {
    label: 'Help',
    items: [
      { type: 'cmd', id: 'view.welcome' },
      { type: 'cmd', id: 'help.shortcuts' },
      { type: 'sep' },
      { type: 'cmd', id: 'help.about' }
    ]
  }
]

function MenuDropdown({ entries, left, close }: { entries: Entry[]; left: number; close: () => void }) {
  const recents = useStore((s) => s.settings?.recentProjects ?? [])
  const project = useStore((s) => s.project)
  const openProjectPath = useStore((s) => s.openProjectPath)
  return (
    <motion.div
      className="dropdown"
      style={{ left, top: 34 }}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {entries.map((e, i) => {
        if (e.type === 'sep') return <div key={i} className="dropdown-sep" />
        if (e.type === 'label') return <div key={i} className="dropdown-label">{e.label}</div>
        if (e.type === 'recent') {
          const list = recents.filter((r) => r.path !== project?.path).slice(0, 6)
          if (!list.length) return null
          return (
            <div key={i}>
              <div className="dropdown-sep" />
              <div className="dropdown-label">Recent</div>
              {list.map((r) => (
                <button
                  key={r.path}
                  className="dropdown-item"
                  title={r.path}
                  onClick={() => {
                    close()
                    void openProjectPath(r.path)
                  }}
                >
                  <Icon name="folder" className="sm" />
                  <span>{r.name}</span>
                  <span className="kbd-hint" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.path}
                  </span>
                </button>
              ))}
            </div>
          )
        }
        if (e.type === 'role') {
          return (
            <button
              key={i}
              className="dropdown-item"
              onClick={() => {
                close()
                void window.geeked.app.menuRole(e.role)
              }}
            >
              <span style={{ width: 14 }} />
              <span>{e.label}</span>
              {e.keys && <span className="kbd-hint">{e.keys}</span>}
            </button>
          )
        }
        const c = command(e.id)
        if (!c) return null
        const enabled = c.enabled?.() ?? true
        return (
          <button
            key={i}
            className="dropdown-item"
            disabled={!enabled}
            onClick={() => {
              close()
              runCommand(c.id)
            }}
          >
            {c.icon ? <Icon name={c.icon} className="sm" /> : <span style={{ width: 14 }} />}
            <span>{c.title}</span>
            {c.keys && <span className="kbd-hint">{c.keys}</span>}
          </button>
        )
      })}
    </motion.div>
  )
}

export function TitleBar() {
  const project = useStore((s) => s.project)
  const setPalette = useStore((s) => s.setPalette)
  const [open, setOpen] = useState<number | null>(null)
  const [left, setLeft] = useState(0)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const onDown = (e: MouseEvent): void => {
      if (!(e.target as HTMLElement).closest('.dropdown') && !bar.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', () => setOpen(null), { once: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openMenu = (i: number): void => {
    const b = btns.current[i]
    if (b) setLeft(b.getBoundingClientRect().left)
    setOpen(i)
  }

  return (
    <div className="titlebar" ref={bar}>
      <Logo size={20} className="logo-mark" />
      <div className="menus">
        {MENUS.map((m, i) => (
          <button
            key={m.label}
            ref={(el) => {
              btns.current[i] = el
            }}
            className={`menu-btn ${open === i ? 'open' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              if (open === i) setOpen(null)
              else openMenu(i)
            }}
            onMouseEnter={() => {
              if (open !== null && open !== i) openMenu(i)
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button className="command-center" onClick={() => setPalette('commands')} title="Search commands (Ctrl+Shift+P)">
        <Icon name="search" className="xs" />
        <span>{project ? `${project.name} — Geeked IDE` : 'Geeked IDE'}</span>
      </button>
      <AnimatePresence>{open !== null && <MenuDropdown key={open} entries={MENUS[open].items} left={left} close={() => setOpen(null)} />}</AnimatePresence>
    </div>
  )
}
