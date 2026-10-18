'use client'

import { AnimatePresence, motion, MotionConfig, useScroll, useSpring, useTransform } from 'motion/react'
import Image, { type StaticImageData } from 'next/image'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { DOWNLOAD_URL, GITHUB_URL } from './site'
import { Bolt, Download, Flame, GitHub, Lock, Logo, Plus, Sparkle, Star } from './icons'

export function Motion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/* ───────── Nav ───────── */

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = (): void => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="#top" className="brand" aria-label="Geeked IDE home">
          <Logo size={30} id="nav" />
          Geeked IDE
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#browser">Browser</a>
          <a href="#effort">Effort</a>
          <a href="#models">Models</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-right">
          <a className="icon-link" href={GITHUB_URL} aria-label="Geeked IDE on GitHub" target="_blank" rel="noreferrer">
            <GitHub size={20} />
          </a>
          <a className="btn btn-primary btn-sm nav-download" href={DOWNLOAD_URL}>
            <Download size={16} /> Download
          </a>
        </div>
      </div>
    </header>
  )
}

/* ───────── Reveal on scroll ───────── */

export function Reveal({ children, delay = 0, y = 24, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ type: 'spring', stiffness: 120, damping: 22, delay }}
    >
      {children}
    </motion.div>
  )
}

/* ───────── Hero screenshot: tilts flat as you scroll ───────── */

export function HeroShot({ src, alt }: { src: StaticImageData; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 25%'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 26 })
  const rotateX = useTransform(p, [0, 1], [18, 0])
  const scale = useTransform(p, [0, 1], [0.92, 1])
  const glow = useTransform(p, [0, 1], [0.15, 0.4])
  return (
    <div className="shot-stage" ref={ref}>
      <motion.div className="shot-glow" style={{ opacity: glow }} />
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.35 }}
        style={{ rotateX, scale, transformOrigin: 'center top' }}
      >
        <div className="frame">
          <Image src={src} alt={alt} preload sizes="(max-width: 1160px) 100vw, 1120px" placeholder="blur" />
        </div>
      </motion.div>
    </div>
  )
}

/* ───────── Feature card with a glow that follows the pointer ───────── */

export function Feature({ icon, title, children, delay = 0 }: { icon: ReactNode; title: string; children: ReactNode; delay?: number }) {
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Reveal delay={delay}>
      <div className="feature" onPointerMove={onMove}>
        <div className="feature-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </Reveal>
  )
}

/* ───────── Screenshot showcase with auto-advancing tabs ───────── */

export interface Slide {
  title: string
  body: string
  icon: ReactNode
  image: StaticImageData
  alt: string
}

const SLIDE_MS = 6500

export function Showcase({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), SLIDE_MS)
    return () => clearTimeout(t)
  }, [i, paused, slides.length])
  const s = slides[i]
  return (
    <div className="showcase" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="tabs" role="tablist" aria-label="Geeked IDE in action">
        {slides.map((sl, idx) => (
          <button key={sl.title} role="tab" aria-selected={idx === i} className={`tab ${idx === i ? 'active' : ''}`} onClick={() => setI(idx)}>
            {idx === i && <motion.span layoutId="tab-bg" className="tab-bg" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
            <h3>
              {sl.icon}
              {sl.title}
            </h3>
            <p>{sl.body}</p>
            {idx === i && (
              <span className="tab-progress">
                <motion.span key={`${i}-${paused}`} initial={{ width: 0 }} animate={{ width: paused ? 0 : '100%' }} transition={{ duration: paused ? 0 : SLIDE_MS / 1000, ease: 'linear' }} />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="showcase-view" role="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="frame"
          >
            <Image src={s.image} alt={s.alt} sizes="(max-width: 1000px) 100vw, 720px" placeholder="blur" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ───────── Effort slider, the same six stops as the app ───────── */

const EFFORTS = [
  { label: 'Low', desc: 'Quick answers, minimal thinking.' },
  { label: 'Medium', desc: 'Balanced speed and depth.' },
  { label: 'High', desc: 'Thinks carefully before acting.' },
  { label: 'Extra high', desc: 'Deep reasoning for agentic coding.' },
  { label: 'Max', desc: 'Maximum thinking. Correctness over cost.' },
  { label: 'Ultracode', desc: 'Max effort plus dynamic multi-agent workflows for big jobs.' }
]

export function EffortDemo() {
  const [idx, setIdx] = useState(2)
  const [drag, setDrag] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const last = EFFORTS.length - 1
  const ultra = idx === last
  const pct = (idx / last) * 100

  const fromX = (x: number): number => {
    const r = track.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * last)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setIdx((n) => Math.min(last, n + 1))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setIdx((n) => Math.max(0, n - 1))
    else if (e.key === 'Home') setIdx(0)
    else if (e.key === 'End') setIdx(last)
    else return
    e.preventDefault()
  }
  const spring = { type: 'spring' as const, stiffness: 600, damping: 36, mass: 0.6 }

  return (
    <div className={`effort-card ${ultra ? 'ultra' : ''}`}>
      <motion.div className="effort-glow" animate={{ opacity: ultra ? 1 : 0.5 }} />
      <div className="effort-top">
        <div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={idx}
              className={`effort-name ${ultra ? 'ultra-text' : ''}`}
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -18, filter: 'blur(6px)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              {EFFORTS[idx].label}
            </motion.div>
          </AnimatePresence>
          <div className="effort-desc">{EFFORTS[idx].desc}</div>
        </div>
        {ultra ? <Flame size={44} style={{ color: '#ff9ce6' }} /> : <Sparkle size={40} style={{ color: '#b9a6ff' }} />}
      </div>
      <div
        ref={track}
        className="slider"
        role="slider"
        tabIndex={0}
        aria-label="Thinking effort"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={idx}
        aria-valuetext={EFFORTS[idx].label}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag(true)
          setIdx(fromX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (drag) setIdx(fromX(e.clientX))
        }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        <div className="slider-rail" />
        <motion.div className={`slider-fill ${ultra ? 'ultra' : ''}`} animate={{ width: `${pct}%` }} transition={spring} />
        {EFFORTS.map((e, n) => (
          <div key={e.label} className={`slider-tick ${n <= idx ? 'on' : ''}`} style={{ left: `${(n / last) * 100}%` }} />
        ))}
        <motion.div className={`slider-thumb ${ultra ? 'ultra' : ''}`} animate={{ left: `${pct}%`, scale: drag ? 1.18 : 1 }} transition={spring} />
      </div>
      <div className="slider-labels">
        {EFFORTS.map((e, n) => (
          <button key={e.label} className={n === idx ? 'on' : ''} onClick={() => setIdx(n)}>
            {n === last ? <span className={n === idx ? 'ultra-text' : ''}>{e.label}</span> : e.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────── Models, with the hidden one behind the Konami code ───────── */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
const KEY_LABELS = ['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A']

const MODELS = [
  { name: 'GeekedGPT mini', desc: 'Fastest and lightest, for quick tasks and quick questions.', under: 'Claude Haiku', icon: <Bolt size={22} /> },
  { name: 'GeekedGPT', desc: 'Smart and fast. The everyday pick for building things.', under: 'Claude Sonnet', icon: <Sparkle size={22} /> },
  { name: 'GeekedGPT Plus', desc: 'The most capable tier for complex, multi-step work.', under: 'Claude Opus', icon: <Star size={22} /> }
]

export function Models() {
  const [progress, setProgress] = useState(0)
  const [unlocked, setUnlocked] = useState(false)
  const taps = useRef<number[]>([])
  // Phones have no arrow keys: seven quick taps work too, like the app's logo trick.
  const onTap = (): void => {
    if (unlocked) return
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2500), now]
    if (taps.current.length >= 7) setUnlocked(true)
  }
  useEffect(() => {
    let seq: string[] = []
    const on = (e: globalThis.KeyboardEvent): void => {
      if (unlocked) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      seq = [...seq, key].slice(-KONAMI.length)
      // Longest prefix of the code that the recent keys end with.
      let best = 0
      for (let len = 1; len <= seq.length; len++) {
        if (seq.slice(-len).every((k, i) => k === KONAMI[i])) best = len
      }
      setProgress(best)
      if (best === KONAMI.length) setUnlocked(true)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [unlocked])

  return (
    <div className="models">
      {MODELS.map((m, i) => (
        <Reveal key={m.name} delay={i * 0.06}>
          <div className="model">
            <div className="model-icon">{m.icon}</div>
            <h3>{m.name}</h3>
            <p>{m.desc}</p>
            <div className="under">{m.under} under the hood</div>
          </div>
        </Reveal>
      ))}
      <Reveal delay={0.18}>
        <motion.div
          className={`model ${unlocked ? 'unlocked' : 'secret'}`}
          animate={unlocked ? { rotateY: [90, 0], scale: [0.96, 1] } : {}}
          transition={{ type: 'spring', stiffness: 160, damping: 16 }}
          title={unlocked ? undefined : 'Try the Konami code'}
          onClick={onTap}
        >
          <div className="model-icon" style={unlocked ? { color: '#ff9ce6', background: 'rgba(255,106,213,0.14)' } : undefined}>
            {unlocked ? <Flame size={22} /> : <Lock size={22} />}
          </div>
          {unlocked ? (
            <>
              <h3 className="ultra-text">GeekedGPT Ultra</h3>
              <p>Frontier reasoning for the hardest problems. Unlock it in the app the same way.</p>
              <div className="under">Claude Fable under the hood</div>
            </>
          ) : (
            <>
              <h3>A fourth model?</h3>
              <p>It is hidden in the app. Type the code on this page, or tap this card seven times.</p>
              <div className="konami" aria-label="Konami code">
                {KEY_LABELS.map((k, i) => (
                  <kbd key={i} className={i < progress ? 'hit' : ''}>
                    {k}
                  </kbd>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </Reveal>
    </div>
  )
}

/* ───────── FAQ ───────── */

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="faq">
      {items.map((it, i) => (
        <div key={it.q} className={`faq-item ${open === i ? 'open' : ''}`}>
          <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            {it.q}
            <span className="faq-plus">
              <Plus />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 34, opacity: { duration: 0.2 } }}
                style={{ overflow: 'hidden' }}
              >
                <div className="faq-a">{it.a}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function GitHubButton() {
  return (
    <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
      <GitHub size={18} /> View on GitHub
    </a>
  )
}
