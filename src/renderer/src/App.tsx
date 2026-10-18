import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { COMMANDS, comboOf } from './lib/commands'
import { clamp } from './lib/format'
import { startAgentEventPump, useStore } from './state/store'
import { BrowserPanel } from './components/BrowserPanel'
import { CommandPalette } from './components/CommandPalette'
import { AboutDialog, NewProjectDialog, ShortcutsDialog } from './components/Dialogs'
import { EditorArea } from './components/EditorArea'
import { Panel } from './components/Panel'
import { ActivityBar, SideBar } from './components/SideBar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { Logo } from './components/ui'

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
let booted = false

function useGlobalKeys(): void {
  useEffect(() => {
    let seq: string[] = []
    const onKey = (e: KeyboardEvent): void => {
      seq = [...seq, e.key.toLowerCase()].slice(-KONAMI.length)
      if (seq.length === KONAMI.length && seq.every((k, i) => k === KONAMI[i])) {
        seq = []
        useStore.getState().unlockUltra()
        return
      }
      if (e.repeat && e.key !== 'Tab') return
      const combo = comboOf(e)
      const cmd = COMMANDS.find((c) => c.keys === combo)
      if (!cmd) return
      // Leave Ctrl+Z/C/V etc. to inputs; only our registered combos are handled.
      e.preventDefault()
      e.stopPropagation()
      if (cmd.enabled?.() ?? true) cmd.run()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

function useDragResize(onMove: (e: PointerEvent) => void, onEnd: () => void) {
  const [dragging, setDragging] = useState(false)
  const start = (e: RPointerEvent): void => {
    e.preventDefault()
    setDragging(true)
    useStore.getState().setResizing(true)
    const move = (ev: PointerEvent): void => onMove(ev)
    const up = (): void => {
      setDragging(false)
      useStore.getState().setResizing(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      onEnd()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { dragging, start }
}

function Splash() {
  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg-editor)', zIndex: 2000 }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
    >
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
        <Logo size={88} />
      </motion.div>
    </motion.div>
  )
}

export default function App() {
  const ready = useStore((s) => s.ready)
  const reduceMotion = useStore((s) => s.settings?.reduceMotion ?? false)
  const project = useStore((s) => s.project)
  const sidebarVisible = useStore((s) => s.sidebarVisible)
  const storedSidebarWidth = useStore((s) => s.sidebarWidth)
  const panelVisible = useStore((s) => s.panelVisible)
  const storedPanelHeight = useStore((s) => s.panelHeight)
  const browserVisible = useStore((s) => s.browserVisible)
  const storedBrowserWidth = useStore((s) => s.browserWidth)
  const setUi = useStore((s) => s.setUi)
  const [browserWidth, setBrowserWidth] = useState(storedBrowserWidth)
  const browserRef = useRef(browserWidth)
  const [winWidth, setWinWidth] = useState(window.innerWidth)
  useEffect(() => {
    const on = (): void => setWinWidth(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [sidebarWidth, setSidebarWidth] = useState(storedSidebarWidth)
  const [panelHeight, setPanelHeight] = useState(storedPanelHeight)
  const mainCol = useRef<HTMLDivElement>(null)
  const widthRef = useRef(sidebarWidth)
  const heightRef = useRef(panelHeight)

  useGlobalKeys()

  useEffect(() => {
    const stop = startAgentEventPump()
    if (!booted) {
      booted = true
      void useStore.getState().init()
    }
    // Don't let stray file drops navigate the window.
    const block = (e: DragEvent): void => e.preventDefault()
    document.addEventListener('dragover', block)
    document.addEventListener('drop', block)
    return () => {
      stop()
      document.removeEventListener('dragover', block)
      document.removeEventListener('drop', block)
    }
  }, [])

  useEffect(() => {
    document.title = project ? `${project.name} — Geeked IDE` : 'Geeked IDE'
  }, [project])

  useEffect(() => setSidebarWidth(storedSidebarWidth), [storedSidebarWidth])
  useEffect(() => setPanelHeight(storedPanelHeight), [storedPanelHeight])
  useEffect(() => setBrowserWidth(storedBrowserWidth), [storedBrowserWidth])

  const sideDrag = useDragResize(
    (e) => {
      const w = clamp(e.clientX - 50, 200, Math.min(640, window.innerWidth - 500))
      widthRef.current = w
      setSidebarWidth(w)
    },
    () => setUi({ sidebarWidth: widthRef.current })
  )
  const panelDrag = useDragResize(
    (e) => {
      const rect = mainCol.current?.getBoundingClientRect()
      if (!rect) return
      const h = clamp(rect.bottom - e.clientY, 120, rect.height - 200)
      heightRef.current = h
      setPanelHeight(h)
    },
    () => setUi({ panelHeight: heightRef.current })
  )

  const browserDrag = useDragResize(
    (e) => {
      const w = clamp(window.innerWidth - e.clientX, 360, Math.max(360, window.innerWidth - 520))
      browserRef.current = w
      setBrowserWidth(w)
    },
    () => setUi({ browserWidth: browserRef.current })
  )

  // Never let the browser squeeze the chat below a usable width.
  const maxBrowser = Math.max(340, winWidth - 50 - (sidebarVisible ? sidebarWidth : 0) - 440)
  const shownBrowserWidth = Math.min(browserWidth, maxBrowser)

  const instant = { duration: 0 }
  const smooth = { type: 'spring' as const, stiffness: 420, damping: 40 }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <div className="app">
        <TitleBar />
        <div className="workbench">
          <ActivityBar />
          <AnimatePresence initial={false}>
            {sidebarVisible && (
              <motion.div
                className="sidebar"
                style={{ position: 'relative' }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: sidebarWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={sideDrag.dragging ? instant : smooth}
              >
                <div style={{ width: sidebarWidth, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <SideBar />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {sidebarVisible && (
            <div
              className={`resizer v ${sideDrag.dragging ? 'dragging' : ''}`}
              style={{ left: 50 + sidebarWidth }}
              onPointerDown={sideDrag.start}
              onDoubleClick={() => setUi({ sidebarWidth: 280 })}
            />
          )}
          <div className="main-col" ref={mainCol}>
            <EditorArea />
            <AnimatePresence initial={false}>
              {panelVisible && (
                <motion.div
                  className="panel"
                  initial={{ height: 0 }}
                  animate={{ height: panelHeight }}
                  exit={{ height: 0 }}
                  transition={panelDrag.dragging ? instant : smooth}
                >
                  <div className={`resizer h ${panelDrag.dragging ? 'dragging' : ''}`} style={{ top: 0 }} onPointerDown={panelDrag.start} />
                  <Panel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {browserVisible && (
            <div
              className={`resizer v right ${browserDrag.dragging ? 'dragging' : ''}`}
              style={{ right: shownBrowserWidth }}
              onPointerDown={browserDrag.start}
              onDoubleClick={() => setUi({ browserWidth: 560 })}
            />
          )}
          <AnimatePresence initial={false}>
            {browserVisible && (
              <motion.div
                className="browser-panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: shownBrowserWidth, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={browserDrag.dragging ? instant : smooth}
              >
                <BrowserPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <StatusBar />
      </div>
      <NewProjectDialog />
      <AboutDialog />
      <ShortcutsDialog />
      <CommandPalette />
      <Toasts />
      <AnimatePresence>{!ready && <Splash key="splash" />}</AnimatePresence>
    </MotionConfig>
  )
}
