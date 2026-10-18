import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ImageAttachment, SlashCommandInfo } from '@shared/ipc'
import { PERMISSION_MODES, type PermissionModeKey } from '@shared/models'
import { onComposerFill } from '../../lib/composerBus'
import { fileIcon } from '../../lib/tools'
import { useStore } from '../../state/store'
import { Icon } from '../ui'
import { EffortSlider, ModelPicker, ModePicker } from './Pickers'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_ATTACHMENTS = 10
const CYCLE: PermissionModeKey[] = ['default', 'acceptEdits', 'plan', 'auto']

const FALLBACK_COMMANDS: SlashCommandInfo[] = [
  { name: 'compact', description: 'Summarize the conversation to free up context', argumentHint: '[instructions]' },
  { name: 'context', description: 'Show what is using the context window', argumentHint: '' },
  { name: 'usage', description: 'Show cost and usage for this session', argumentHint: '' },
  { name: 'init', description: 'Create a CLAUDE.md guide for this project', argumentHint: '' },
  { name: 'review', description: 'Review the current changes', argumentHint: '' },
  { name: 'clear', description: 'Start the conversation over', argumentHint: '' }
]

function readImage(file: File): Promise<ImageAttachment | string> {
  return new Promise((resolve) => {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return resolve(`${file.name || 'That file'} isn't a PNG, JPEG, GIF or WebP image.`)
    if (file.size > MAX_IMAGE_BYTES) return resolve(`${file.name || 'That image'} is larger than 5 MB.`)
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const comma = url.indexOf(',')
      resolve({ mediaType: file.type as ImageAttachment['mediaType'], data: url.slice(comma + 1), name: file.name || 'pasted image' })
    }
    reader.onerror = () => resolve(`Couldn't read ${file.name || 'the image'}.`)
    reader.readAsDataURL(file)
  })
}

type MenuItem = { kind: 'command'; cmd: SlashCommandInfo } | { kind: 'file'; path: string }

export function Composer({ chatId, active }: { chatId: string; active: boolean }) {
  const c = useStore(
    useShallow((s) => {
      const ch = s.chats[chatId]
      return {
        status: ch?.status,
        model: ch?.model ?? 'standard',
        effort: ch?.effort ?? 'high',
        mode: ch?.permissionMode ?? 'default',
        commands: ch?.capabilities?.commands,
        suggestion: ch?.suggestion,
        projectPath: ch?.projectPath,
        lastUserText: [...(ch?.items ?? [])].reverse().find((i) => i.kind === 'user')?.text
      }
    })
  )
  const sendOnEnter = useStore((s) => s.settings?.sendOnEnter ?? true)
  const focusTick = useStore((s) => s.focusComposerTick)
  const { send, interrupt, setChatModel, setChatEffort, setChatPermissionMode, toast, dismissSuggestion } = useStore.getState()

  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [caret, setCaret] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [fileHits, setFileHits] = useState<string[]>([])
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const running = c.status === 'running'

  // Programmatic fills (starter cards, palette).
  useEffect(
    () =>
      onComposerFill(chatId, (text, mode) => {
        setDraft((cur) => {
          const next = mode === 'append' ? `${cur}${cur && !/\s$/.test(cur) ? ' ' : ''}${text}` : text
          requestAnimationFrame(() => {
            ta.current?.focus()
            ta.current?.setSelectionRange(next.length, next.length)
          })
          return next
        })
      }),
    [chatId]
  )

  useEffect(() => {
    if (active) requestAnimationFrame(() => ta.current?.focus())
  }, [active, focusTick])

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`
  }, [draft])

  // Which menu (slash command or @file) applies at the caret?
  const slashQuery = /^\/(\S*)$/.exec(draft)?.[1] ?? null
  const mention = useMemo(() => {
    const m = /(?:^|\s)@("?)([^\s@"]*)$/.exec(draft.slice(0, caret))
    return m ? { query: m[2], start: caret - m[2].length - 1 - m[1].length } : null
  }, [draft, caret])

  useEffect(() => {
    if (!mention || !c.projectPath) {
      setFileHits([])
      return
    }
    const t = setTimeout(() => {
      window.geeked.fs
        .searchFiles(c.projectPath!, mention.query)
        .then((hits) => setFileHits(hits.slice(0, 12)))
        .catch(() => setFileHits([]))
    }, 70)
    return () => clearTimeout(t)
  }, [mention?.query, mention !== null, c.projectPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const menu: MenuItem[] = useMemo(() => {
    if (menuDismissed) return []
    if (slashQuery !== null) {
      const all = c.commands?.length ? c.commands : FALLBACK_COMMANDS
      const q = slashQuery.toLowerCase()
      return all
        .filter((cmd) => cmd.name.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, 14)
        .map((cmd) => ({ kind: 'command', cmd }))
    }
    if (mention) return fileHits.map((path) => ({ kind: 'file', path }))
    return []
  }, [slashQuery, mention, fileHits, c.commands, menuDismissed])

  useEffect(() => setMenuIndex(0), [menu.length, slashQuery, mention?.query])

  const choose = (item: MenuItem): void => {
    if (item.kind === 'command') {
      const next = `/${item.cmd.name} `
      setDraft(next)
      setCaret(next.length)
    } else if (mention) {
      const token = /\s/.test(item.path) ? `@"${item.path}" ` : `@${item.path} `
      const next = draft.slice(0, mention.start) + token + draft.slice(caret)
      const pos = mention.start + token.length
      setDraft(next)
      requestAnimationFrame(() => {
        ta.current?.setSelectionRange(pos, pos)
        setCaret(pos)
      })
    }
    ta.current?.focus()
  }

  const addFiles = async (files: File[]): Promise<void> => {
    const results = await Promise.all(files.map(readImage))
    const ok = results.filter((r): r is ImageAttachment => typeof r !== 'string')
    const errors = results.filter((r): r is string => typeof r === 'string')
    if (errors.length) toast({ kind: 'warn', title: "Some files weren't attached", detail: errors.join(' ') })
    if (ok.length) {
      setAttachments((cur) => {
        const next = [...cur, ...ok]
        if (next.length > MAX_ATTACHMENTS) toast({ kind: 'warn', title: `Up to ${MAX_ATTACHMENTS} images per message` })
        return next.slice(0, MAX_ATTACHMENTS)
      })
    }
  }

  const submit = (): void => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    void send(chatId, text, attachments)
    setDraft('')
    setAttachments([])
    setMenuDismissed(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (menu.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuIndex((i) => (i + 1) % menu.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuIndex((i) => (i - 1 + menu.length) % menu.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        choose(menu[Math.min(menuIndex, menu.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuDismissed(true)
        return
      }
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      const i = CYCLE.indexOf(c.mode)
      const next = CYCLE[(i + 1) % CYCLE.length]
      setChatPermissionMode(chatId, next)
      return
    }
    if (e.key === 'Tab' && !draft && c.suggestion) {
      e.preventDefault()
      setDraft(c.suggestion)
      return
    }
    if (e.key === 'ArrowUp' && !draft && c.lastUserText) {
      e.preventDefault()
      setDraft(c.lastUserText)
      return
    }
    if (e.key === 'Escape' && running) {
      e.preventDefault()
      void interrupt(chatId)
      return
    }
    if (e.key === 'Enter') {
      const wantsSend = sendOnEnter ? !e.shiftKey : e.ctrlKey || e.metaKey
      if (wantsSend) {
        e.preventDefault()
        submit()
      }
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f)
    if (files.length) {
      e.preventDefault()
      void addFiles(files)
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    const files = [...e.dataTransfer.files]
    if (files.length) void addFiles(files)
  }

  const canSend = draft.trim().length > 0 || attachments.length > 0
  const modeDef = PERMISSION_MODES.find((m) => m.key === c.mode)

  return (
    <>
      <AnimatePresence>
        {c.suggestion && !draft && !running && (
          <motion.button
            className="suggestion"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={() => {
              setDraft(c.suggestion ?? '')
              ta.current?.focus()
            }}
          >
            <Icon name="sparkle" className="sm" />
            <span>{c.suggestion}</span>
            <span className="kbd" style={{ marginLeft: 4 }}>
              <kbd>Tab</kbd>
            </span>
            <span
              className="icon-btn"
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                dismissSuggestion(chatId)
              }}
            >
              <Icon name="close" className="xs" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      <div
        className={`composer ${focused ? 'focused' : ''} ${dragging ? 'dragging' : ''} ${c.effort === 'ultracode' ? 'ultra-mode' : ''}`}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <AnimatePresence>
          {menu.length > 0 && (
            <motion.div
              className="mention-menu"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 36 }}
            >
              <div className="dropdown-label">{menu[0].kind === 'command' ? 'Commands & skills' : 'Files'}</div>
              {menu.map((item, i) => (
                <div
                  key={item.kind === 'command' ? item.cmd.name : item.path}
                  className={`mention-item ${i === menuIndex ? 'active' : ''}`}
                  onMouseEnter={() => setMenuIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(item)
                  }}
                >
                  {item.kind === 'command' ? (
                    <>
                      <Icon name="symbol-misc" className="sm" />
                      <span className="mi-name">/{item.cmd.name}</span>
                      {item.cmd.argumentHint && <span className="mi-desc">{item.cmd.argumentHint}</span>}
                      <span className="mi-desc" style={{ marginLeft: 'auto', maxWidth: '55%' }}>
                        {item.cmd.description}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icon name={fileIcon(item.path).icon} className="sm" />
                      <span className="mi-name">{item.path.split('/').pop()}</span>
                      <span className="mi-desc">{item.path}</span>
                    </>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div className="attachments" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <AnimatePresence>
                {attachments.map((a, i) => (
                  <motion.div
                    key={`${a.name}-${i}-${a.data.length}`}
                    className="attachment"
                    title={a.name}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  >
                    <img src={`data:${a.mediaType};base64,${a.data}`} alt={a.name} />
                    <button onClick={() => setAttachments((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove image">
                      <Icon name="close" className="xs" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          ref={ta}
          rows={1}
          value={draft}
          placeholder={running ? 'Queue a follow-up… (Esc to stop)' : 'Ask GeekedGPT anything · @ to mention files · / for commands'}
          onChange={(e) => {
            setDraft(e.target.value)
            setCaret(e.target.selectionStart)
            setMenuDismissed(false)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          spellCheck
        />

        <div className="composer-toolbar">
          <button className="icon-btn" title="Attach images" onClick={() => fileInput.current?.click()}>
            <Icon name="attach" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            multiple
            hidden
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
          <ModePicker value={c.mode} onChange={(m) => setChatPermissionMode(chatId, m)} />
          <span className="grow" />
          <EffortSlider value={c.effort} onChange={(v) => setChatEffort(chatId, v)} />
          <ModelPicker value={c.model} onChange={(m) => setChatModel(chatId, m)} />
          <AnimatePresence mode="popLayout" initial={false}>
            {running && !canSend ? (
              <motion.button
                key="stop"
                className="send-btn stop"
                title="Stop (Esc)"
                onClick={() => void interrupt(chatId)}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 28 }}
              >
                <Icon name="primitive-square" className="sm" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                className="send-btn"
                title={running ? 'Queue message' : 'Send (Enter)'}
                disabled={!canSend}
                onClick={submit}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 28 }}
              >
                <Icon name="arrow-up" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="composer-hint">
        <span>{running ? 'Esc to stop · messages you send now are queued' : sendOnEnter ? 'Enter to send · Shift+Enter for a new line' : 'Ctrl+Enter to send'}</span>
        <span>{modeDef ? `${modeDef.label} · Shift+Tab to switch` : ''}</span>
      </div>
    </>
  )
}
