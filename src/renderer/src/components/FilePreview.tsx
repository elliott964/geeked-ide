import hljs from 'highlight.js/lib/common'
import { useEffect, useMemo, useState } from 'react'
import type { FilePreview as Preview } from '@shared/ipc'
import { fillComposer } from '../lib/composerBus'
import { bytes, relPath } from '../lib/format'
import { langForPath } from '../lib/tools'
import { useStore } from '../state/store'
import { Icon } from './ui'

const MAX_HIGHLIGHT = 300_000

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function FilePreview({ path }: { path: string }) {
  const project = useStore((s) => s.project)
  const fsVersion = useStore((s) => s.fsVersion)
  const [file, setFile] = useState<Preview | null>(null)

  useEffect(() => {
    let alive = true
    window.geeked.fs
      .readFile(path)
      .then((f) => alive && setFile(f))
      .catch(() => alive && setFile({ path, kind: 'missing', size: 0 }))
    return () => {
      alive = false
    }
  }, [path, fsVersion])

  const html = useMemo(() => {
    if (file?.kind !== 'text' || file.content === undefined) return ''
    const lang = langForPath(path)
    if (file.content.length > MAX_HIGHLIGHT || !lang || !hljs.getLanguage(lang)) return escapeHtml(file.content)
    try {
      return hljs.highlight(file.content, { language: lang, ignoreIllegals: true }).value
    } catch {
      return escapeHtml(file.content)
    }
  }, [file, path])

  const lineCount = file?.kind === 'text' ? (file.content ?? '').split('\n').length : 0
  const rel = relPath(path, project?.path)

  const mention = (): void => {
    const st = useStore.getState()
    const chatTab = [...st.tabs].reverse().find((t) => t.kind === 'chat')
    const chatId = chatTab ? chatTab.id : st.newChat()
    if (!chatId) return
    st.activateTab(chatId)
    setTimeout(() => fillComposer(chatId, /\s/.test(rel) ? `@"${rel}" ` : `@${rel} `, 'append'), 40)
  }

  return (
    <div className="file-preview">
      <div className="fp-header">
        <Icon name="file" className="sm" />
        <span className="selectable" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rel}
        </span>
        {file && file.kind !== 'missing' && <span style={{ color: 'var(--text-faint)' }}>{bytes(file.size)}</span>}
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={mention} title="Mention this file in chat">
          <Icon name="mention" className="sm" /> Ask about this file
        </button>
      </div>
      <div className="fp-body">
        {!file && <div className="empty-hint">Loading…</div>}
        {file?.kind === 'missing' && <div className="empty-hint">This file no longer exists.</div>}
        {file?.kind === 'binary' && <div className="empty-hint">Binary file ({bytes(file.size)}) — no preview.</div>}
        {file?.kind === 'too-large' && <div className="empty-hint">This file is too large to preview ({bytes(file.size)}).</div>}
        {file?.kind === 'image' && (
          <div className="image-view">
            <img src={file.dataUrl} alt={rel} />
          </div>
        )}
        {file?.kind === 'text' && (
          <div className="code-view">
            <pre className="ln" style={{ margin: 0 }}>
              {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
            </pre>
            <pre className="src selectable hljs" style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>
    </div>
  )
}
