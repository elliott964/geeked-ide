import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  EFFORTS,
  MODELS,
  PERMISSION_MODES,
  effortIndex,
  getModel,
  getPermissionMode,
  type EffortKey,
  type ModelKey,
  type PermissionModeKey
} from '@shared/models'
import { useStore } from '../../state/store'
import { Icon, Popover } from '../ui'

export const MODEL_ICONS: Record<ModelKey, string> = { mini: 'zap', standard: 'sparkle', plus: 'star-full', ultra: 'flame' }

export function useVisibleModels() {
  const settings = useStore((s) => s.settings)
  const showUltra = !!settings?.ultraUnlocked && !!settings?.showUltra
  return MODELS.filter((m) => !m.hidden || showUltra)
}

export function ModelName({ model }: { model: ModelKey }) {
  const def = getModel(model)
  return model === 'ultra' ? <span className="ultra-text">{def.name}</span> : <span>{def.name}</span>
}

export function ModelPicker({ value, onChange, placement = 'top' }: { value: ModelKey; onChange: (m: ModelKey) => void; placement?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const models = useVisibleModels()
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button ref={anchor} className={`chip ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} title="Choose model">
        <Icon name={MODEL_ICONS[value]} className="sm" />
        <span className="chip-text">
          <ModelName model={value} />
        </span>
        <Icon name="chevron-down" className="xs" />
      </button>
      <Popover open={open} anchor={anchor} onClose={close} placement={placement} align="end" width={320}>
        <div className="dropdown-label">Model</div>
        {models.map((m, i) => (
          <motion.button
            key={m.key}
            className={`pop-item ${m.key === value ? 'selected' : ''} ${m.key === 'ultra' ? 'ultra' : ''}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 34 }}
            onClick={() => {
              onChange(m.key)
              setOpen(false)
            }}
          >
            <span className="pi-icon">
              <Icon name={MODEL_ICONS[m.key]} />
            </span>
            <span>
              <div className="pi-title">
                <ModelName model={m.key} />
              </div>
              <div className="pi-desc">{m.tagline}</div>
            </span>
            {m.key === value && <Icon name="check" className="pi-check" />}
          </motion.button>
        ))}
      </Popover>
    </>
  )
}

export function ModePicker({ value, onChange }: { value: PermissionModeKey; onChange: (m: PermissionModeKey) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const def = getPermissionMode(value)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button ref={anchor} className={`chip mode-${value} ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} title="Permission mode (Shift+Tab)">
        <Icon name={def.icon} className="sm" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} className="chip-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
            {def.label}
          </motion.span>
        </AnimatePresence>
      </button>
      <Popover open={open} anchor={anchor} onClose={close} placement="top" align="start" width={330}>
        <div className="dropdown-label">Permissions</div>
        {PERMISSION_MODES.map((m) => (
          <button
            key={m.key}
            className={`pop-item ${m.key === value ? 'selected' : ''}`}
            onClick={() => {
              onChange(m.key)
              setOpen(false)
            }}
          >
            <span className="pi-icon" style={m.key === 'bypassPermissions' ? { color: 'var(--danger)' } : undefined}>
              <Icon name={m.icon} />
            </span>
            <span>
              <div className="pi-title">{m.label}</div>
              <div className="pi-desc">{m.description}</div>
            </span>
            {m.key === value && <Icon name="check" className="pi-check" />}
          </button>
        ))}
      </Popover>
    </>
  )
}

const TRACK = 118
const STOPS = EFFORTS.length - 1
const spring = { type: 'spring' as const, stiffness: 700, damping: 38, mass: 0.6 }

export function EffortSlider({ value, onChange }: { value: EffortKey; onChange: (e: EffortKey) => void }) {
  const [preview, setPreview] = useState<number | null>(null)
  const [hover, setHover] = useState(false)
  const dragging = useRef(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const idx = preview ?? effortIndex(value)
  const def = EFFORTS[idx]
  const ultra = def.key === 'ultracode'
  const x = (idx / STOPS) * TRACK

  const fromPointer = (clientX: number): number => {
    const r = trackRef.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * STOPS)
  }
  const commit = (i: number): void => {
    const key = EFFORTS[i].key
    if (key !== value) onChange(key)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>): void => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setPreview(fromPointer(e.clientX))
  }
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) setPreview(fromPointer(e.clientX))
  }
  const onUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return
    dragging.current = false
    const i = fromPointer(e.clientX)
    setPreview(null)
    commit(i)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const cur = effortIndex(value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commit(Math.min(STOPS, cur + 1))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commit(Math.max(0, cur - 1))
    } else if (e.key === 'Home') commit(0)
    else if (e.key === 'End') commit(STOPS)
  }

  return (
    <div className="effort" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title="">
      <Icon name={ultra ? 'flame' : 'lightbulb'} className={`sm e-icon`} />
      <div
        ref={trackRef}
        className="effort-track"
        role="slider"
        tabIndex={0}
        aria-label="Thinking effort"
        aria-valuemin={0}
        aria-valuemax={STOPS}
        aria-valuenow={idx}
        aria-valuetext={def.label}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          dragging.current = false
          setPreview(null)
        }}
        onKeyDown={onKey}
      >
        <div className="effort-rail" />
        <motion.div className={`effort-fill ${ultra ? 'ultra' : ''}`} animate={{ width: x }} transition={spring} />
        {EFFORTS.map((e, i) => (
          <div key={e.key} className={`effort-tick ${i <= idx ? 'on' : ''}`} style={{ left: (i / STOPS) * TRACK }} />
        ))}
        <motion.div className={`effort-thumb ${ultra ? 'ultra' : ''}`} animate={{ left: x, scale: preview !== null ? 1.2 : 1 }} transition={spring} />
        <AnimatePresence>
          {(hover || preview !== null) && (
            <motion.div
              className="effort-tip"
              style={{ left: x }}
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 34 }}
            >
              <div className={`et-title ${ultra ? 'ultra-text' : ''}`}>{def.label}</div>
              <div className="et-desc">{def.description}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="effort-label">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={def.key}
            className={ultra ? 'ultra-text' : ''}
            style={{ display: 'inline-block' }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
          >
            {def.label}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
