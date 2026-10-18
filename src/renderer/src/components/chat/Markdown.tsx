import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Icon } from '../ui'

interface HastNode {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function hastText(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(hastText).join('')
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="icon-btn"
      title={copied ? 'Copied!' : (label ?? 'Copy')}
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        })
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} className="sm" />
    </button>
  )
}

function CodeBlock({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const code = node?.children?.find((c) => c.tagName === 'code')
  const classes = (code?.properties?.className as string[] | undefined) ?? []
  const lang = classes.find((c) => c.startsWith('language-'))?.slice(9) ?? ''
  const text = hastText(code).replace(/\n$/, '')
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{lang || 'text'}</span>
        <CopyButton text={text} label="Copy code" />
      </div>
      <pre>{children}</pre>
    </div>
  )
}

const components: Components = {
  pre: ({ node, children }) => <CodeBlock node={node as unknown as HastNode}>{children}</CodeBlock>,
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href) void window.geeked.app.openExternal(href)
      }}
      title={href}
    >
      {children}
    </a>
  )
}

const remarkPlugins = [remarkGfm]
const rehypeFull = [[rehypeHighlight, { detect: false }]] as never
const rehypeNone: never[] = []

/** Markdown with GFM and syntax highlighting. Highlighting is skipped while streaming for speed. */
export const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="md selectable">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={streaming ? rehypeNone : rehypeFull} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
