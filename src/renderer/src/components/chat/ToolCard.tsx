import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { diffLines, diffStats, type DiffLine } from '../../lib/diff'
import { duration, hostOf, tokens, truncate } from '../../lib/format'
import { browserAction, toolMeta } from '../../lib/tools'
import type { Chat, Item, TodoItem } from '../../state/types'
import { Collapse, Icon } from '../ui'
import { CopyButton, Markdown } from './Markdown'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Input = Record<string, any>
type ToolItem = Extract<Item, { kind: 'tool' }>

const MAX_OUTPUT = 20_000

export function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <div className="todo-list">
      {todos.map((t) => (
        <motion.div layout key={t.id + t.content} className={`todo ${t.status}`} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
          <span className="box">
            {t.status === 'completed' && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 700, damping: 20 }}>
                <Icon name="check" className="xs" />
              </motion.span>
            )}
            {t.status === 'in_progress' && <motion.span className="orbit" style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)' }} animate={{ scale: [1, 0.6, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} />}
          </span>
          <span className="txt">{t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}</span>
        </motion.div>
      ))}
    </div>
  )
}

export function DiffView({ before, after, maxContext = 3 }: { before: string; after: string; maxContext?: number }) {
  const lines = useMemo<DiffLine[]>(() => {
    if (!before) return after.replace(/\n$/, '').split('\n').map((text) => ({ type: 'add', text }))
    return diffLines(before, after)
  }, [before, after])

  // Collapse long runs of unchanged lines.
  const rows: (DiffLine | { type: 'gap'; count: number })[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'same') {
      rows.push(lines[i++])
      continue
    }
    let j = i
    while (j < lines.length && lines[j].type === 'same') j++
    const run = j - i
    const leading = i === 0
    const trailing = j === lines.length
    const keepStart = leading ? 0 : maxContext
    const keepEnd = trailing ? 0 : maxContext
    if (run > keepStart + keepEnd + 1) {
      for (let k = i; k < i + keepStart; k++) rows.push(lines[k])
      rows.push({ type: 'gap', count: run - keepStart - keepEnd })
      for (let k = j - keepEnd; k < j; k++) rows.push(lines[k])
    } else {
      for (let k = i; k < j; k++) rows.push(lines[k])
    }
    i = j
  }

  return (
    <div className="diff selectable">
      {rows.map((r, idx) =>
        r.type === 'gap' ? (
          <div key={idx} className="diff-line gap">
            <span className="sign" />⋯ {r.count} unchanged line{r.count === 1 ? '' : 's'}
          </div>
        ) : (
          <div key={idx} className={`diff-line ${r.type}`}>
            <span className="sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' '}</span>
            {r.text || ' '}
          </div>
        )
      )}
    </div>
  )
}

export function DiffStat({ before, after }: { before: string; after: string }) {
  const s = useMemo(() => (before ? diffStats(diffLines(before, after)) : { added: after.split('\n').length, removed: 0 }), [before, after])
  return (
    <span className="diff-stat">
      <span className="a">+{s.added}</span>
      <span className="r">−{s.removed}</span>
    </span>
  )
}

function Output({ text, error }: { text: string; error?: boolean }) {
  const [all, setAll] = useState(false)
  if (!text.trim()) return <div className="mono-box" style={{ color: 'var(--text-faint)' }}>(no output)</div>
  const shown = all || text.length <= MAX_OUTPUT ? text : `${text.slice(0, MAX_OUTPUT)}\n…`
  return (
    <div style={{ position: 'relative' }}>
      <div className={`mono-box selectable ${error ? 'err' : ''}`}>{shown}</div>
      <div style={{ position: 'absolute', top: 4, right: 4 }}>
        <CopyButton text={text} />
      </div>
      {!all && text.length > MAX_OUTPUT && (
        <button className="btn ghost sm" onClick={() => setAll(true)} style={{ marginTop: 4 }}>
          Show all ({Math.round(text.length / 1000)}k chars)
        </button>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="tool-section-label">{label}</div>
      {children}
    </div>
  )
}

function stripLineNumbers(text: string): string {
  // Read results are formatted "   12→content"; show plain content.
  const lines = text.split('\n')
  if (lines.length > 1 && lines.slice(0, 5).every((l) => /^\s*\d+[→\t]/.test(l) || !l)) {
    return lines.map((l) => l.replace(/^\s*\d+[→\t]/, '')).join('\n')
  }
  return text
}

function webResults(structured: any, text: string): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = []
  const results = structured?.results
  if (Array.isArray(results)) {
    for (const r of results) {
      if (r && typeof r === 'object' && Array.isArray(r.content)) {
        for (const c of r.content) if (c?.url) out.push({ title: String(c.title || c.url), url: String(c.url) })
      }
    }
  } else if (Array.isArray(structured)) {
    for (const c of structured) if (c?.url) out.push({ title: String(c.title || c.url), url: String(c.url) })
  }
  if (!out.length) {
    const re = /"title":"([^"]+)","url":"(https?:[^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && out.length < 20) out.push({ title: m[1], url: m[2] })
  }
  const seen = new Set<string>()
  return out.filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
}

function Screenshot({ src, tag }: { src: string; tag?: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <motion.div className={`shot-frame ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded((e) => !e)} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
      <img src={src} alt="Browser screenshot" />
      {tag && <span className="shot-tag">{tag}</span>}
    </motion.div>
  )
}

/** Browser tools (built-in browser and Claude in Chrome): screenshots inline, then any text. */
function BrowserBody({ item, chat }: { item: ToolItem; chat: Chat }) {
  const input = item.input as Input
  const result = chat.toolResults[item.id]
  const action = browserAction(item.name)?.action
  const text = (result?.text ?? '').trim()
  // Screenshot captions are noise next to the image itself.
  const shownText = text
    .split('\n')
    .filter((l) => !/^(Screenshot \d+×\d+|Zoomed region|\[Image: source:)/.test(l))
    .join('\n')
    .trim()
  return (
    <>
      {action === 'javascript_tool' && (
        <div className="mono-box selectable" style={{ color: '#d6dbe8' }}>
          {String(input.text ?? '')}
        </div>
      )}
      {action === 'navigate' && typeof input.url === 'string' && /^https?:/.test(input.url) && (
        <button className="link-chip" onClick={() => void window.geeked.app.openExternal(String(input.url))}>
          <Icon name="link-external" className="sm" />
          <span className="lc-title">{String(input.url)}</span>
        </button>
      )}
      {result?.images?.map((src, i) => <Screenshot key={i} src={src} tag={input.action === 'zoom' ? 'Zoomed' : undefined} />)}
      {result && shownText && <Output text={shownText} error={result.isError} />}
      {!result && chat.status !== 'running' && <div style={{ color: 'var(--text-faint)' }}>Not completed.</div>}
    </>
  )
}

function ToolBody({ item, chat, renderChildren }: { item: ToolItem; chat: Chat; renderChildren: (parent: string) => ReactNode }) {
  const input = item.input as Input
  const result = chat.toolResults[item.id]
  const text = result?.text ?? ''
  const err = !!result?.isError
  if (browserAction(item.name)) return <BrowserBody item={item} chat={chat} />

  switch (item.name) {
    case 'Bash':
    case 'PowerShell':
      return (
        <>
          <div className="mono-box selectable">
            <div className="cmd-line">{String(input.command ?? '')}</div>
          </div>
          {result && <Output text={text} error={err} />}
        </>
      )
    case 'Edit':
      return (
        <>
          {input.replace_all && <div className="tool-section-label">Replaced all occurrences</div>}
          <DiffView before={String(input.old_string ?? '')} after={String(input.new_string ?? '')} />
          {err && <Output text={text} error />}
        </>
      )
    case 'MultiEdit':
      return (
        <>
          {(Array.isArray(input.edits) ? input.edits : []).map((e: Input, i: number) => (
            <DiffView key={i} before={String(e.old_string ?? '')} after={String(e.new_string ?? '')} />
          ))}
          {err && <Output text={text} error />}
        </>
      )
    case 'Write':
      return (
        <>
          <DiffView before="" after={String(input.content ?? '')} />
          {err && <Output text={text} error />}
        </>
      )
    case 'Read':
      return result ? <Output text={stripLineNumbers(text)} error={err} /> : null
    case 'WebSearch':
    case 'web_search': {
      const links = webResults(result?.structured, text)
      return (
        <>
          {links.length > 0 ? (
            <div className="link-chips">
              {links.slice(0, 12).map((l) => (
                <button key={l.url} className="link-chip" onClick={() => void window.geeked.app.openExternal(l.url)} title={l.url}>
                  <Icon name="globe" className="sm" />
                  <span className="lc-title">{l.title}</span>
                  <span className="lc-host">{hostOf(l.url)}</span>
                </button>
              ))}
            </div>
          ) : (
            result && <Output text={text} error={err} />
          )}
        </>
      )
    }
    case 'WebFetch':
    case 'web_fetch':
      return (
        <>
          <button className="link-chip" onClick={() => void window.geeked.app.openExternal(String(input.url))}>
            <Icon name="link-external" className="sm" />
            <span className="lc-title">{String(input.url ?? '')}</span>
          </button>
          {input.prompt && (
            <Section label="Asked">
              <div style={{ color: 'var(--text-dim)' }}>{String(input.prompt)}</div>
            </Section>
          )}
          {result && (err ? <Output text={text} error /> : <Markdown text={truncate(text, MAX_OUTPUT)} />)}
        </>
      )
    case 'TodoWrite':
      return (
        <TodoList
          todos={(Array.isArray(input.todos) ? input.todos : []).map((t: Input, i: number) => ({
            id: String(i),
            content: String(t.content ?? ''),
            activeForm: t.activeForm,
            status: t.status
          }))}
        />
      )
    case 'Agent':
    case 'Task': {
      const progress = chat.subagents[item.id]
      return (
        <>
          {input.subagent_type && (
            <div className="subagent-summary">
              <Icon name="hubot" className="sm" /> {String(input.subagent_type)}
              {input.model ? ` · ${String(input.model)}` : ''}
              {progress?.toolUses ? ` · ${progress.toolUses} tool uses` : ''}
              {progress?.tokens ? ` · ${tokens(progress.tokens)} tokens` : ''}
            </div>
          )}
          <Section label="Task">
            <div className="mono-box selectable" style={{ fontFamily: 'var(--font)', fontSize: 12.5, maxHeight: 160 }}>
              {String(input.prompt ?? '')}
            </div>
          </Section>
          <div className="subagent-children">{renderChildren(item.id)}</div>
          {result && (
            <Section label="Result">
              {err ? <Output text={text} error /> : <Markdown text={truncate(text, MAX_OUTPUT)} />}
            </Section>
          )}
        </>
      )
    }
    case 'AskUserQuestion': {
      const answers: Record<string, string> = (result?.structured as Input)?.answers ?? input.answers ?? {}
      const qs: Input[] = Array.isArray(input.questions) ? input.questions : []
      return (
        <div className="q-block">
          {qs.map((q, i) => (
            <div key={i}>
              <div style={{ fontWeight: 600 }}>{String(q.question)}</div>
              <div style={{ color: answers[q.question] ? 'var(--accent-2)' : 'var(--text-faint)' }}>
                {answers[q.question] ? `→ ${answers[q.question]}` : result ? '(no answer)' : 'Waiting for your answer…'}
              </div>
            </div>
          ))}
        </div>
      )
    }
    case 'ExitPlanMode':
      return input.plan ? <Markdown text={String(input.plan)} /> : result ? <Output text={text} error={err} /> : null
    case 'Skill':
      return result ? <Output text={text} error={err} /> : null
    default:
      return (
        <>
          {Object.keys(input).length > 0 && (
            <Section label="Input">
              <div className="mono-box selectable">{JSON.stringify(input, null, 2)}</div>
            </Section>
          )}
          {result && (
            <Section label="Result">
              <Output text={text} error={err} />
            </Section>
          )}
          {result?.images?.map((src, i) => <img key={i} src={src} style={{ maxWidth: '100%', borderRadius: 8 }} />)}
        </>
      )
  }
}

function defaultOpen(name: string, input: Input): boolean {
  const b = browserAction(name)
  if (b) return (b.action === 'computer' && (input.action === 'screenshot' || input.action === 'zoom')) || b.action === 'browser_batch'
  return ['Edit', 'MultiEdit', 'TodoWrite', 'Agent', 'Task', 'AskUserQuestion', 'WebSearch', 'web_search'].includes(name)
}

export function ToolCard({
  item,
  chat,
  root,
  nested,
  renderChildren
}: {
  item: ToolItem
  chat: Chat
  root?: string
  nested?: boolean
  renderChildren: (parent: string) => ReactNode
}) {
  const [open, setOpen] = useState(() => defaultOpen(item.name, item.input as Input))
  const result = chat.toolResults[item.id]
  const running = !result && chat.status === 'running'
  const interrupted = !result && chat.status !== 'running'
  const meta = toolMeta(item.name, item.input as Input, root)
  const elapsed = chat.toolElapsed[item.id]
  const sub = chat.subagents[item.id]
  const isEdit = item.name === 'Edit' || item.name === 'Write'
  const input = item.input as Input

  return (
    <div className={`tool acc-${meta.accent ?? 'none'} ${running ? 'running' : ''} ${result?.isError ? 'error' : ''} ${nested ? 'nested' : ''}`}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="t-icon">
          <Icon name={meta.icon} />
        </span>
        <span className="t-label">{running ? meta.active : meta.done}</span>
        <span className="t-summary" title={meta.summary}>
          {running && sub?.summary ? sub.summary : meta.summary}
        </span>
        <span className="t-meta">
          {isEdit && result && !result.isError && (
            <DiffStat before={item.name === 'Edit' ? String(input.old_string ?? '') : ''} after={String(item.name === 'Edit' ? (input.new_string ?? '') : (input.content ?? ''))} />
          )}
          {running && elapsed ? <span>{duration(elapsed * 1000)}</span> : null}
        </span>
        <span className={`t-status ${result ? (result.isError ? 'err' : 'ok') : ''}`}>
          {running ? (
            <Icon name="loading" spin className="sm" />
          ) : result ? (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
              <Icon name={result.isError ? 'error' : 'pass-filled'} className="sm" />
            </motion.span>
          ) : interrupted ? (
            <Icon name="circle-slash" className="sm" title="Not completed" />
          ) : null}
        </span>
        <Icon name="chevron-right" className={`chev sm ${open ? 'open' : ''}`} />
      </button>
      <Collapse open={open}>
        <div className="tool-body">
          <ToolBody item={item} chat={chat} renderChildren={renderChildren} />
        </div>
      </Collapse>
    </div>
  )
}
