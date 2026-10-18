import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { NameCheck } from '@shared/ipc'
import { COMMANDS } from '../lib/commands'
import { useStore } from '../state/store'
import { Icon, Kbd, Logo, Modal } from './ui'
import { useLogoEasterEgg } from './WelcomePage'

export function NewProjectDialog() {
  const open = useStore((s) => s.dialog === 'newProject')
  const settings = useStore((s) => s.settings)
  const { setDialog, createProject } = useStore.getState()
  const [name, setName] = useState('')
  const [parent, setParent] = useState<string | null>(null)
  const [check, setCheck] = useState<NameCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setParent(null)
      setCheck(null)
      setError(null)
      setTouched(false)
      setBusy(false)
    }
  }, [open])

  const dir = parent ?? settings?.projectsDir ?? ''

  useEffect(() => {
    if (!open) return
    let alive = true
    const t = setTimeout(() => {
      window.geeked.projects.checkName(name, dir).then((c) => alive && setCheck(c))
    }, 90)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [name, dir, open])

  const close = (): void => setDialog(null)
  const submit = async (): Promise<void> => {
    setTouched(true)
    if (!check?.ok || busy) return
    setBusy(true)
    setError(null)
    const res = await createProject(name.trim(), parent ?? undefined)
    setBusy(false)
    if (res.ok) close()
    else setError(res.error ?? 'Something went wrong.')
  }

  const showError = (touched || name.length > 0) && check && !check.ok ? check.error : error

  return (
    <Modal open={open} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="modal-header">
          <motion.div initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <Logo size={34} />
          </motion.div>
          <div>
            <h2>New Project</h2>
            <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>Name it and you're ready to build.</div>
          </div>
        </div>
        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor="np-name">
              Project name
            </label>
            <input
              id="np-name"
              className={`input ${showError ? 'invalid' : ''}`}
              autoFocus
              placeholder="my-awesome-app"
              value={name}
              spellCheck={false}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              onBlur={() => setTouched(true)}
            />
            <div className="field-hint">
              <AnimatePresence mode="wait" initial={false}>
                {showError ? (
                  <motion.span key="err" className="field-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Icon name="error" className="xs" /> {showError}
                  </motion.span>
                ) : check?.ok ? (
                  <motion.span key="ok" style={{ color: 'var(--success)' }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Icon name="pass-filled" className="xs" /> Looks good
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
          <div>
            <label className="field-label">Location</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="path-preview" style={{ flex: 1, minWidth: 0 }} title={check?.fullPath ?? dir}>
                <Icon name="folder" className="sm" />
                <span>{check?.fullPath ?? dir}</span>
              </div>
              <button
                type="button"
                className="btn sm"
                onClick={async () => {
                  const picked = await window.geeked.projects.chooseFolder(dir)
                  if (picked) setParent(picked)
                }}
              >
                Change…
              </button>
            </div>
            <div className="field-hint">
              {parent ? (
                <button type="button" className="btn ghost sm" style={{ height: 20, padding: '0 6px' }} onClick={() => setParent(null)}>
                  Use default folder
                </button>
              ) : (
                <span>Change the default location any time in Settings.</span>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!check?.ok || busy}>
            {busy ? <Icon name="loading" spin className="sm" /> : <Icon name="rocket" className="sm" />}
            Create Project
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AboutDialog() {
  const open = useStore((s) => s.dialog === 'about')
  const version = useStore((s) => s.version)
  const setDialog = useStore((s) => s.setDialog)
  const onLogo = useLogoEasterEgg()
  return (
    <Modal open={open} onClose={() => setDialog(null)}>
      <div style={{ padding: '28px 28px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <motion.div whileHover={{ scale: 1.06, rotate: -4 }} whileTap={{ scale: 0.88, rotate: 10 }} onClick={onLogo} style={{ cursor: 'pointer' }}>
          <Logo size={72} />
        </motion.div>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Geeked IDE</h2>
        <div style={{ color: 'var(--text-dim)' }}>Version {version}</div>
        <div style={{ color: 'var(--text-dim)', maxWidth: 360 }}>An agent development environment built on the Claude Agent SDK, with the full Claude Code toolset.</div>
      </div>
      <div className="modal-footer" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => setDialog(null)}>
          Close
        </button>
      </div>
    </Modal>
  )
}

const EXTRA_SHORTCUTS = [
  { title: 'Send message', keys: 'Enter' },
  { title: 'New line', keys: 'Shift+Enter' },
  { title: 'Stop GeekedGPT', keys: 'Esc' },
  { title: 'Switch permission mode', keys: 'Shift+Tab' },
  { title: 'Accept suggestion', keys: 'Tab' },
  { title: 'Recall last message', keys: '↑' },
  { title: 'Mention a file', keys: '@' },
  { title: 'Slash commands & skills', keys: '/' }
]

export function ShortcutsDialog() {
  const open = useStore((s) => s.dialog === 'shortcuts')
  const setDialog = useStore((s) => s.setDialog)
  const list = [...EXTRA_SHORTCUTS, ...COMMANDS.filter((c) => c.keys).map((c) => ({ title: c.title, keys: c.keys! }))]
  return (
    <Modal open={open} onClose={() => setDialog(null)} className="modal">
      <div className="modal-header">
        <Icon name="keyboard" />
        <h2>Keyboard Shortcuts</h2>
      </div>
      <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto', gap: 2 }}>
        {list.map((s) => (
          <div key={s.title + s.keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{s.title}</span>
            <Kbd keys={s.keys} />
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={() => setDialog(null)}>
          Close
        </button>
      </div>
    </Modal>
  )
}
