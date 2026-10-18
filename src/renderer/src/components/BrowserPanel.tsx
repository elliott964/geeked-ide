import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { hostOf } from '../lib/format'
import { useStore } from '../state/store'
import { Icon, Logo } from './ui'

const api = window.geeked
const QUICK = ['localhost:3000', 'localhost:5173', 'localhost:8080']

function open(input: string): void {
  if (!input.trim()) return
  void api.browser.navigate(input).then((r) => {
    if (!r.ok) useStore.getState().toast({ kind: 'warn', title: "Can't open that", detail: r.error })
  })
}

function StartPage() {
  const [q, setQ] = useState('')
  const go = open
  return (
    <div className="browser-start">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
        <Logo size={52} />
      </motion.div>
      <h3>Geeked Browser</h3>
      <p>GeekedGPT can open pages here, click, type, read and take screenshots while you watch.</p>
      <form
        className="browser-start-form"
        onSubmit={(e) => {
          e.preventDefault()
          go(q)
        }}
      >
        <Icon name="search" className="sm" />
        <input className="selectable" placeholder="Search or enter a URL" value={q} onChange={(e) => setQ(e.target.value)} autoFocus spellCheck={false} />
      </form>
      <div className="browser-quick">
        {QUICK.map((u) => (
          <button key={u} className="chip" onClick={() => go(u)}>
            <Icon name="server-process" className="xs" /> {u}
          </button>
        ))}
      </div>
    </div>
  )
}

export function BrowserPanel() {
  const st = useStore((s) => s.browserState)
  const occluded = useStore((s) => !!s.dialog || !!s.palette || s.resizing)
  const setUi = useStore((s) => s.setUi)
  const surface = useRef<HTMLDivElement>(null)
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const active = st.tabs.find((t) => t.id === st.activeId)
  const hasTab = !!active

  useEffect(() => {
    if (!editing) setAddress(active?.url && active.url !== 'about:blank' ? active.url : '')
  }, [active?.url, editing])

  // Keep the native browser view glued to the surface element. Bounds are also
  // sent with no tab yet, so the previous session's tabs can be restored.
  useLayoutEffect(() => {
    const el = surface.current
    if (!el || occluded) {
      void api.browser.setBounds(null)
      return
    }
    let frame = 0
    const sync = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        void api.browser.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height })
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [occluded, hasTab])

  useEffect(() => () => void api.browser.setBounds(null), [])

  const secure = active?.url.startsWith('https://')

  return (
    <div className="browser">
      <div className="browser-head">
        <div className="browser-tabs">
          <AnimatePresence initial={false}>
            {st.tabs.map((t) => (
              <motion.div
                key={t.id}
                className={`browser-tab ${t.id === st.activeId ? 'active' : ''}`}
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                onMouseDown={(e) => {
                  if (e.button === 0) void api.browser.selectTab(t.id)
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) void api.browser.closeTab(t.id)
                }}
                title={t.url}
              >
                {t.loading ? <Icon name="loading" spin className="xs" /> : t.favicon ? <img src={t.favicon} alt="" /> : <Icon name="globe" className="xs" />}
                <span className="bt-title">{t.title || hostOf(t.url) || 'New tab'}</span>
                <button
                  className="icon-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    void api.browser.closeTab(t.id)
                  }}
                  title="Close tab"
                >
                  <Icon name="close" className="xs" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <button className="icon-btn" title="New tab" onClick={() => void api.browser.newTab()}>
            <Icon name="add" className="sm" />
          </button>
        </div>
        <button className="icon-btn" title="Hide browser (Ctrl+Shift+B)" onClick={() => setUi({ browserVisible: false })}>
          <Icon name="close" className="sm" />
        </button>
      </div>

      <div className="browser-bar">
        <button className="icon-btn" disabled={!active?.canGoBack} title="Back" onClick={() => void api.browser.command('back')}>
          <Icon name="arrow-left" className="sm" />
        </button>
        <button className="icon-btn" disabled={!active?.canGoForward} title="Forward" onClick={() => void api.browser.command('forward')}>
          <Icon name="arrow-right" className="sm" />
        </button>
        <button className="icon-btn" disabled={!active} title={active?.loading ? 'Stop' : 'Reload'} onClick={() => void api.browser.command(active?.loading ? 'stop' : 'reload')}>
          <Icon name={active?.loading ? 'close' : 'refresh'} className="sm" />
        </button>
        <form
          className={`browser-address ${editing ? 'editing' : ''}`}
          onSubmit={(e) => {
            e.preventDefault()
            open(address)
            ;(document.activeElement as HTMLElement | null)?.blur()
          }}
        >
          <Icon name={secure ? 'lock' : 'globe'} className={`xs ${secure ? 'secure' : ''}`} />
          <input
            className="selectable"
            value={address}
            placeholder="Search or enter a URL"
            spellCheck={false}
            onFocus={(e) => {
              setEditing(true)
              e.currentTarget.select()
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAddress(active?.url ?? '')
                e.currentTarget.blur()
              }
            }}
          />
          {st.emulation && <span className="browser-badge">{st.emulation}</span>}
        </form>
        <AnimatePresence>
          {st.busy && (
            <motion.div
              className="browser-agent-chip"
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.8, width: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              title={`GeekedGPT is ${st.busy.toLowerCase()}`}
            >
              <span className="orbit" style={{ width: 12, height: 12 }}>
                <span />
                <span />
              </span>
              <span className="bac-text">{st.busy}…</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button className="icon-btn" disabled={!active} title="Inspect (DevTools)" onClick={() => void api.browser.command('devtools')}>
          <Icon name="inspect" className="sm" />
        </button>
        <button className="icon-btn" disabled={!active || !/^https?:/.test(active.url)} title="Open in your browser" onClick={() => void api.browser.command('external')}>
          <Icon name="link-external" className="sm" />
        </button>
      </div>

      <div className="browser-progress">{active?.loading && <span className="bp-bar" />}</div>

      <div className={`browser-viewport ${st.busy ? 'agent' : ''}`}>
        <div className="browser-surface" ref={surface}>
          {!hasTab && <StartPage />}
          {hasTab && occluded && (
            <div className="browser-paused">
              <Icon name="globe" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
