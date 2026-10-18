import { useEffect, useRef, useState } from 'react'
import type { PermissionRequest, PermissionResponse } from '@shared/ipc'
import { relPath } from '../../lib/format'
import { browserAction, toolMeta } from '../../lib/tools'
import { Icon, Kbd } from '../ui'
import { Markdown } from './Markdown'
import { DiffView } from './ToolCard'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Input = Record<string, any>
type Respond = (r: PermissionResponse) => void

function ActionPreview({ req }: { req: PermissionRequest }) {
  const input = req.input as Input
  if (/__javascript_tool$/.test(req.toolName)) {
    return <div className="mono-box selectable">{String(input.text ?? '')}</div>
  }
  switch (req.toolName) {
    case 'Bash':
    case 'PowerShell':
      return (
        <div className="mono-box selectable">
          <div className="cmd-line">{String(input.command ?? '')}</div>
        </div>
      )
    case 'Edit':
      return <DiffView before={String(input.old_string ?? '')} after={String(input.new_string ?? '')} />
    case 'Write':
      return <DiffView before="" after={String(input.content ?? '').split('\n').slice(0, 60).join('\n')} />
    case 'WebFetch':
      return <div className="mono-box selectable">{String(input.url ?? '')}</div>
    default: {
      const keys = Object.keys(input)
      if (!keys.length) return null
      return <div className="mono-box selectable">{JSON.stringify(input, null, 2).slice(0, 4000)}</div>
    }
  }
}

export function PermissionCard({ req, respond, root }: { req: PermissionRequest; respond: Respond; root?: string }) {
  const [denying, setDenying] = useState(false)
  const [feedback, setFeedback] = useState('')
  const allowRef = useRef<HTMLButtonElement>(null)
  const denyRef = useRef<HTMLButtonElement>(null)
  const meta = toolMeta(req.toolName, req.input as Input, root)
  const dangerous = req.toolName === 'Bash' || req.toolName === 'PowerShell'

  useEffect(() => {
    ;(req.defaultToNo ? denyRef : allowRef).current?.focus()
  }, [req.defaultToNo])

  const browser = browserAction(req.toolName)
  const title = browser
    ? `Allow ${meta.active.toLowerCase()} in ${browser.chrome ? 'your Chrome' : 'the browser'}?`
    : req.title || `Allow ${req.displayName || meta.done}${meta.summary ? `: ${meta.summary}` : ''}?`
  const target = req.blockedPath ? relPath(req.blockedPath, root) : null

  return (
    <div className={`attn-card ${dangerous ? 'danger' : ''}`}>
      <div className="attn-head">
        <span className="ah-icon">
          <Icon name={dangerous ? 'terminal' : meta.icon} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ah-title">{title}</div>
          <div className="ah-sub">
            {req.description || req.decisionReason || (req.agentId ? 'Requested by a subagent' : 'GeekedGPT needs your permission to continue')}
            {target ? ` · ${target}` : ''}
          </div>
        </div>
      </div>
      <div className="attn-body">
        <ActionPreview req={req} />
        {denying && (
          <textarea
            className="input attn-feedback"
            style={{ height: 64, padding: 10, resize: 'none' }}
            autoFocus
            placeholder="Tell GeekedGPT what to do instead (optional)"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                respond({ behavior: 'deny', message: feedback.trim() || 'The user declined this action.' })
              }
            }}
          />
        )}
      </div>
      <div className="attn-actions">
        {denying ? (
          <>
            <button className="btn danger" onClick={() => respond({ behavior: 'deny', message: feedback.trim() || 'The user declined this action.' })}>
              <Icon name="close" className="sm" /> Deny
            </button>
            <button className="btn ghost" onClick={() => setDenying(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <button ref={allowRef} className="btn primary" onClick={() => respond({ behavior: 'allow' })}>
              <Icon name="check" className="sm" /> Allow once
            </button>
            {req.canAlwaysAllow && (
              <button className="btn" onClick={() => respond({ behavior: 'allow', always: true })}>
                <Icon name="check-all" className="sm" /> Always allow
              </button>
            )}
            <button ref={denyRef} className="btn ghost" onClick={() => setDenying(true)}>
              Deny…
            </button>
            <span className="grow" />
            <Kbd keys="Enter" />
          </>
        )}
      </div>
    </div>
  )
}

interface Question {
  question: string
  header: string
  multiSelect: boolean
  options: { label: string; description: string; preview?: string }[]
}

export function QuestionCard({ req, respond }: { req: PermissionRequest; respond: Respond }) {
  const input = req.input as Input
  const questions: Question[] = Array.isArray(input.questions) ? input.questions : []
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [other, setOther] = useState<Record<number, string>>({})
  const [focusPreview, setFocusPreview] = useState<Record<number, string | undefined>>({})

  const toggle = (qi: number, label: string, multi: boolean): void => {
    setPicked((p) => {
      const cur = p[qi] ?? []
      if (multi) return { ...p, [qi]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
      return { ...p, [qi]: [label] }
    })
  }

  const answerFor = (qi: number): string => {
    const labels = (picked[qi] ?? []).filter((l) => l !== '__other__')
    const otherText = other[qi]?.trim()
    if ((picked[qi] ?? []).includes('__other__') && otherText) labels.push(otherText)
    return labels.join(', ')
  }
  const complete = questions.every((_, i) => answerFor(i).length > 0)

  const submit = (): void => {
    const answers: Record<string, string> = {}
    questions.forEach((q, i) => (answers[q.question] = answerFor(i)))
    respond({ behavior: 'allow', updatedInput: { ...input, answers } })
  }

  return (
    <div className="attn-card">
      <div className="attn-head">
        <span className="ah-icon">
          <Icon name="question" />
        </span>
        <div>
          <div className="ah-title">GeekedGPT has {questions.length === 1 ? 'a question' : `${questions.length} questions`}</div>
          <div className="ah-sub">Pick an answer to keep going</div>
        </div>
      </div>
      <div className="attn-body" style={{ gap: 16 }}>
        {questions.map((q, qi) => (
          <div className="q-block" key={qi}>
            <div className="q-title">
              {q.header && <span className="q-chip">{q.header}</span>}
              {q.question}
            </div>
            <div className="q-options">
              {q.options.map((o) => {
                const sel = (picked[qi] ?? []).includes(o.label)
                return (
                  <button
                    key={o.label}
                    className={`q-option ${sel ? 'selected' : ''}`}
                    onClick={() => toggle(qi, o.label, q.multiSelect)}
                    onMouseEnter={() => o.preview && setFocusPreview((f) => ({ ...f, [qi]: o.preview }))}
                  >
                    <div className="qo-label">
                      <Icon name={q.multiSelect ? (sel ? 'pass-filled' : 'circle-large-outline') : sel ? 'circle-filled' : 'circle-large-outline'} className="xs" />
                      {o.label}
                    </div>
                    {o.description && <div className="qo-desc">{o.description}</div>}
                  </button>
                )
              })}
              <button className={`q-option ${(picked[qi] ?? []).includes('__other__') ? 'selected' : ''}`} onClick={() => toggle(qi, '__other__', q.multiSelect)}>
                <div className="qo-label">
                  <Icon name="edit" className="xs" /> Other…
                </div>
                <div className="qo-desc">Type your own answer</div>
              </button>
            </div>
            {(picked[qi] ?? []).includes('__other__') && (
              <input
                className="input"
                autoFocus
                placeholder="Your answer"
                value={other[qi] ?? ''}
                onChange={(e) => setOther((o) => ({ ...o, [qi]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && complete) submit()
                }}
              />
            )}
            {focusPreview[qi] && <div className="q-preview">{focusPreview[qi]}</div>}
          </div>
        ))}
      </div>
      <div className="attn-actions">
        <button className="btn primary" disabled={!complete} onClick={submit}>
          <Icon name="send" className="sm" /> Submit answer{questions.length > 1 ? 's' : ''}
        </button>
        <button className="btn ghost" onClick={() => respond({ behavior: 'deny', message: 'The user dismissed the question without answering.' })}>
          Skip
        </button>
      </div>
    </div>
  )
}

export function PlanCard({ req, respond }: { req: PermissionRequest; respond: Respond }) {
  const input = req.input as Input
  const [revising, setRevising] = useState(false)
  const [feedback, setFeedback] = useState('')
  const plan = typeof input.plan === 'string' ? input.plan : ''

  return (
    <div className="attn-card">
      <div className="attn-head">
        <span className="ah-icon">
          <Icon name="milestone" />
        </span>
        <div>
          <div className="ah-title">Ready to code?</div>
          <div className="ah-sub">Review the plan, then choose how GeekedGPT should proceed</div>
        </div>
      </div>
      <div className="attn-body">
        {plan ? (
          <div className="plan-box">
            <Markdown text={plan} />
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)' }}>The plan is in the conversation above.</div>
        )}
        {revising && (
          <textarea
            className="input"
            style={{ height: 72, padding: 10, resize: 'none' }}
            autoFocus
            placeholder="What should change in the plan?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        )}
      </div>
      <div className="attn-actions">
        {revising ? (
          <>
            <button
              className="btn primary"
              onClick={() => respond({ behavior: 'deny', message: feedback.trim() ? `Keep planning. Feedback: ${feedback.trim()}` : 'Keep planning; the user wants changes to the plan.' })}
            >
              <Icon name="send" className="sm" /> Send feedback
            </button>
            <button className="btn ghost" onClick={() => setRevising(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => respond({ behavior: 'allow', setMode: 'acceptEdits' })}>
              <Icon name="rocket" className="sm" /> Approve & auto-accept edits
            </button>
            <button className="btn" onClick={() => respond({ behavior: 'allow', setMode: 'default' })}>
              <Icon name="check" className="sm" /> Approve, ask before edits
            </button>
            <button className="btn ghost" onClick={() => setRevising(true)}>
              Keep planning…
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function AttentionCard({ req, respond, root }: { req: PermissionRequest; respond: Respond; root?: string }) {
  if (req.toolName === 'AskUserQuestion') return <QuestionCard req={req} respond={respond} />
  if (req.toolName === 'ExitPlanMode') return <PlanCard req={req} respond={respond} />
  return <PermissionCard req={req} respond={respond} root={root} />
}
