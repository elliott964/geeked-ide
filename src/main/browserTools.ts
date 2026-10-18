// MCP tools that let the agent drive Geeked IDE's built-in browser.
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { browser } from './browser'

export const BROWSER_SERVER = 'geeked_browser'

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
interface Result {
  content: Content[]
  isError?: boolean
  [key: string]: unknown
}

const ok = (text: string): Result => ({ content: [{ type: 'text', text }] })
const fail = (err: unknown): Result => ({
  content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
  isError: true
})

const tabId = z.string().optional().describe('Tab to act on. Omit for the active tab; get ids from tabs_context.')

const COMPUTER_ACTIONS = [
  'screenshot',
  'left_click',
  'right_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'scroll',
  'scroll_to',
  'hover',
  'left_click_drag',
  'wait',
  'zoom'
] as const

const computerShape = {
  action: z.enum(COMPUTER_ACTIONS).describe(
    'screenshot: capture the page. left_click/right_click/double_click/triple_click: click a coordinate or ref. type: type text at the focus. key: press keys, space-separated, e.g. "Enter" or "ctrl+a Backspace". scroll: wheel-scroll at a coordinate (or the center). scroll_to: scroll a ref into view. hover: move the mouse. left_click_drag: drag from start_coordinate to coordinate. wait: pause up to 10 s. zoom: capture a region at full detail.'
  ),
  coordinate: z.array(z.number()).length(2).optional().describe('[x, y] in the pixels of the most recent screenshot.'),
  start_coordinate: z.array(z.number()).length(2).optional().describe('Drag start [x, y] for left_click_drag.'),
  ref: z.string().optional().describe('Element ref from read_page or find (e.g. "ref_12"); an alternative to coordinate.'),
  text: z.string().optional().describe('Text to type, or the keys to press for the key action.'),
  modifiers: z.string().optional().describe('Modifier keys held during a click, e.g. "ctrl" or "ctrl+shift".'),
  scroll_direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  scroll_amount: z.number().int().min(1).max(10).optional().describe('Wheel ticks to scroll (default 3).'),
  repeat: z.number().int().min(1).max(100).optional().describe('Times to repeat the key sequence.'),
  duration: z.number().min(0).max(10).optional().describe('Seconds to wait (wait action).'),
  region: z.array(z.number()).length(4).optional().describe('[x0, y0, x1, y1] region to zoom into, in screenshot pixels.'),
  tabId
}
type ComputerInput = z.infer<z.ZodObject<typeof computerShape>>

async function shot(tab?: string, region?: number[]): Promise<Result> {
  const s = await browser.screenshot(tab, region)
  return {
    content: [
      { type: 'image', data: s.data, mimeType: 'image/jpeg' },
      { type: 'text', text: region ? `Zoomed region, ${s.width}×${s.height}.` : `Screenshot ${s.width}×${s.height}. Click coordinates use this image's pixels.` }
    ]
  }
}

async function computer(a: ComputerInput): Promise<Result> {
  switch (a.action) {
    case 'screenshot':
      return shot(a.tabId)
    case 'zoom':
      if (!a.region) throw new Error('zoom needs region [x0, y0, x1, y1].')
      return shot(a.tabId, a.region)
    case 'left_click':
      return ok(await browser.click({ coordinate: a.coordinate, ref: a.ref, modifiers: a.modifiers, tabId: a.tabId }))
    case 'right_click':
      return ok(await browser.click({ coordinate: a.coordinate, ref: a.ref, button: 'right', modifiers: a.modifiers, tabId: a.tabId }))
    case 'double_click':
      return ok(await browser.click({ coordinate: a.coordinate, ref: a.ref, clickCount: 2, modifiers: a.modifiers, tabId: a.tabId }))
    case 'triple_click':
      return ok(await browser.click({ coordinate: a.coordinate, ref: a.ref, clickCount: 3, modifiers: a.modifiers, tabId: a.tabId }))
    case 'type':
      if (a.text === undefined) throw new Error('type needs text.')
      return ok(await browser.type(a.text, a.tabId))
    case 'key':
      if (!a.text) throw new Error('key needs text, e.g. "Enter".')
      return ok(await browser.key(a.text, a.repeat, a.tabId))
    case 'scroll':
      return ok(await browser.scroll({ coordinate: a.coordinate, direction: a.scroll_direction, amount: a.scroll_amount, tabId: a.tabId }))
    case 'scroll_to':
      if (!a.ref) throw new Error('scroll_to needs ref.')
      return ok(await browser.scrollTo(a.ref, a.tabId))
    case 'hover':
      return ok(await browser.hover({ coordinate: a.coordinate, ref: a.ref, tabId: a.tabId }))
    case 'left_click_drag':
      return ok(await browser.drag(a.start_coordinate, a.coordinate, a.tabId))
    case 'wait': {
      const s = Math.max(0, Math.min(10, a.duration ?? 1))
      await new Promise((r) => setTimeout(r, s * 1000))
      return ok(`Waited ${s}s.`)
    }
  }
}

const COMPUTER_LABELS: Record<(typeof COMPUTER_ACTIONS)[number], string> = {
  screenshot: 'Taking a screenshot',
  left_click: 'Clicking',
  right_click: 'Right-clicking',
  double_click: 'Double-clicking',
  triple_click: 'Triple-clicking',
  type: 'Typing',
  key: 'Pressing keys',
  scroll: 'Scrolling',
  scroll_to: 'Scrolling',
  hover: 'Hovering',
  left_click_drag: 'Dragging',
  wait: 'Waiting',
  zoom: 'Zooming in'
}

/* ── Tool table: shared by the individual tools and browser_batch ── */

type Impl = (input: Record<string, unknown>) => Promise<Result>

const navigateShape = {
  url: z.string().describe('URL to open, or "back" / "forward". Bare hosts get https://, localhost gets http://, plain words become a web search. file:// and Windows paths open local files.'),
  tabId
}
const readPageShape = {
  filter: z.enum(['interactive', 'all']).optional().describe('"interactive" (default) lists only clickable/typable elements; "all" includes text and structure.'),
  ref_id: z.string().optional().describe('Only read inside this element.'),
  max_chars: z.number().int().min(500).max(200_000).optional().describe('Output limit (default 50000).'),
  tabId
}
const findShape = { query: z.string().describe('Text to look for in element roles, names, labels, placeholders, hrefs and ids (case-insensitive).'), tabId }
const pageTextShape = { max_chars: z.number().int().min(500).max(200_000).optional(), tabId }
const formInputShape = {
  ref: z.string().describe('Element ref from read_page or find.'),
  value: z.union([z.string(), z.number(), z.boolean()]).describe('Text for inputs, the option text/value for selects, true/false for checkboxes.'),
  tabId
}
const jsShape = { text: z.string().describe('JavaScript to run in the page. The last expression is returned; top-level await works.'), tabId }
const consoleShape = {
  onlyErrors: z.boolean().optional(),
  pattern: z.string().optional().describe('Only messages containing this text.'),
  limit: z.number().int().min(1).max(500).optional(),
  tabId
}
const networkShape = { urlPattern: z.string().optional(), limit: z.number().int().min(1).max(500).optional(), tabId }
const tabsCreateShape = { url: z.string().optional().describe('Page to open in the new tab.') }
const tabIdShape = { tabId: z.string().describe('Tab id from tabs_context.') }
const resizeShape = {
  preset: z.enum(['mobile', 'tablet', 'desktop']).optional().describe('mobile 375×812, tablet 768×1024, desktop clears emulation.'),
  width: z.number().int().min(200).max(4000).optional(),
  height: z.number().int().min(200).max(4000).optional(),
  tabId
}

const s = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const n = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

const IMPLS: Record<string, { label: string | ((i: Record<string, unknown>) => string); run: Impl }> = {
  navigate: { label: 'Opening page', run: async (i) => ok(await browser.navigate(String(i.url ?? ''), s(i.tabId))) },
  computer: {
    label: (i) => COMPUTER_LABELS[i.action as keyof typeof COMPUTER_LABELS] ?? 'Using the page',
    run: (i) => computer(z.object(computerShape).parse(i))
  },
  read_page: {
    label: 'Reading the page',
    run: async (i) => ok(await browser.readPage(i.filter === 'all' ? 'all' : 'interactive', s(i.ref_id), n(i.max_chars), s(i.tabId)))
  },
  find: { label: 'Finding elements', run: async (i) => ok(await browser.find(String(i.query ?? ''), s(i.tabId))) },
  get_page_text: { label: 'Reading the page', run: async (i) => ok(await browser.pageText(n(i.max_chars), s(i.tabId))) },
  form_input: {
    label: 'Filling a field',
    run: async (i) => ok(await browser.formInput(String(i.ref ?? ''), i.value as string | number | boolean, s(i.tabId)))
  },
  javascript_tool: { label: 'Running a script', run: async (i) => ok(await browser.evaluate(String(i.text ?? ''), s(i.tabId))) },
  read_console_messages: {
    label: 'Checking the console',
    run: async (i) => ok(browser.consoleMessages({ onlyErrors: i.onlyErrors === true, pattern: s(i.pattern), limit: n(i.limit), tabId: s(i.tabId) }))
  },
  read_network_requests: {
    label: 'Checking network requests',
    run: async (i) => ok(browser.networkRequests({ urlPattern: s(i.urlPattern), limit: n(i.limit), tabId: s(i.tabId) }))
  },
  tabs_context: { label: 'Listing tabs', run: async () => ok(browser.tabsContext()) },
  tabs_create: {
    label: 'Opening a tab',
    run: async (i) => {
      const t = browser.createTab(s(i.url), true)
      return ok(`Opened tab ${t.id}${s(i.url) ? ` at ${s(i.url)}` : ''}.`)
    }
  },
  tabs_select: {
    label: 'Switching tabs',
    run: async (i) => {
      browser.selectTab(String(i.tabId ?? ''))
      return ok(`Switched to tab ${String(i.tabId)}.\n${browser.tabsContext()}`)
    }
  },
  tabs_close: {
    label: 'Closing a tab',
    run: async (i) => {
      browser.closeTab(String(i.tabId ?? ''))
      return ok(`Closed tab ${String(i.tabId)}.\n${browser.tabsContext()}`)
    }
  },
  resize_window: {
    label: 'Resizing the viewport',
    run: async (i) =>
      ok(await browser.resize({ preset: i.preset as 'mobile' | 'tablet' | 'desktop' | undefined, width: n(i.width), height: n(i.height), tabId: s(i.tabId) }))
  }
}

function runImpl(name: string, input: Record<string, unknown>): Promise<Result> {
  const impl = IMPLS[name]
  if (!impl) return Promise.resolve(fail(new Error(`Unknown browser tool "${name}".`)))
  const label = typeof impl.label === 'function' ? impl.label(input) : impl.label
  return browser.run(label, () => impl.run(input)).catch(fail)
}

const handler =
  (name: string) =>
  (args: Record<string, unknown>): Promise<Result> =>
    runImpl(name, args)

const readOnly = { readOnlyHint: true, openWorldHint: true }
const acting = { readOnlyHint: false, openWorldHint: true }

const INSTRUCTIONS = [
  'Geeked IDE has a built-in browser pane that the user watches next to the chat. Use these tools to open and test web pages,',
  'including local dev servers (http://localhost:PORT) and local HTML files: navigate, read the page, click, type, and take screenshots.',
  'Prefer read_page/find/get_page_text to understand a page and act on elements by ref; take a screenshot when layout or visuals matter.',
  'Start a dev server with Bash (run_in_background) before opening it. Use browser_batch to chain several predictable steps in one call.'
].join(' ')

/** Tools allowed without a prompt (javascript_tool follows the chat's permission mode). */
export const BROWSER_AUTO_ALLOWED = Object.keys(IMPLS)
  .concat('browser_batch')
  .filter((name) => name !== 'javascript_tool')
  .map((name) => `mcp__${BROWSER_SERVER}__${name}`)

/** A fresh MCP server per chat session; all of them drive the one shared browser. */
export function createBrowserServer() {
  return createSdkMcpServer({
    name: BROWSER_SERVER,
    version: '1.0.0',
    instructions: INSTRUCTIONS,
    alwaysLoad: true,
    tools: [
      tool('navigate', 'Open a URL in the built-in browser (or go "back"/"forward"). Opens a tab if none exists. Returns the final URL and title.', navigateShape, handler('navigate'), { annotations: acting }),
      tool('computer', 'Mouse, keyboard and screenshots for the built-in browser. Coordinates refer to the most recent screenshot; refs come from read_page/find.', computerShape, handler('computer'), { annotations: acting }),
      tool('read_page', "Read the page as an accessibility-style tree. Each element gets a ref (e.g. ref_12) usable with computer, form_input and scroll_to; visible interactive elements show their screenshot coordinates as @(x,y).", readPageShape, handler('read_page'), { annotations: readOnly }),
      tool('find', 'Find elements whose role, name, label, placeholder, href or id contains the query. Returns up to 20 matches with refs.', findShape, handler('find'), { annotations: readOnly }),
      tool('get_page_text', "Get the page's visible text (main/article content first).", pageTextShape, handler('get_page_text'), { annotations: readOnly }),
      tool('form_input', 'Set a form field by ref: text inputs, textareas, selects, checkboxes, radios and contenteditable elements. Fires input and change events.', formInputShape, handler('form_input'), { annotations: acting }),
      tool('javascript_tool', 'Run JavaScript in the page for debugging and inspection. The value of the last expression is returned (JSON).', jsShape, handler('javascript_tool'), { annotations: acting }),
      tool('read_console_messages', "Read the page's console output (log, info, warning, error).", consoleShape, handler('read_console_messages'), { annotations: readOnly }),
      tool('read_network_requests', 'List recent network requests made by the page, with method, status and resource type.', networkShape, handler('read_network_requests'), { annotations: readOnly }),
      tool('tabs_context', 'List the open browser tabs and which one is active.', {}, handler('tabs_context'), { annotations: readOnly }),
      tool('tabs_create', 'Open a new browser tab, optionally at a URL, and make it active.', tabsCreateShape, handler('tabs_create'), { annotations: acting }),
      tool('tabs_select', 'Make a tab the active one.', tabIdShape, handler('tabs_select'), { annotations: acting }),
      tool('tabs_close', 'Close a browser tab.', tabIdShape, handler('tabs_close'), { annotations: acting }),
      tool('resize_window', 'Emulate a viewport size: mobile, tablet, a custom width/height, or desktop to clear it.', resizeShape, handler('resize_window'), { annotations: acting }),
      tool(
        'browser_batch',
        'Run several browser tool calls in order in one round trip, e.g. navigate, click, type, screenshot. Stops at the first error. Each item is {name, input} with the same input the tool takes on its own (browser_batch cannot be nested).',
        {
          actions: z
            .array(z.object({ name: z.string().describe('Tool name, e.g. "computer" or "navigate".'), input: z.record(z.string(), z.unknown()) }))
            .min(1)
            .max(30)
        },
        async (args) => {
          const content: Content[] = []
          for (const [idx, step] of args.actions.entries()) {
            if (step.name === 'browser_batch' || step.name === 'javascript_tool') {
              content.push({ type: 'text', text: `Step ${idx + 1}: ${step.name} can't run inside browser_batch; call it on its own.` })
              return { content, isError: true }
            }
            const r = await runImpl(step.name, step.input)
            content.push({ type: 'text', text: `Step ${idx + 1} (${step.name}):` }, ...r.content)
            if (r.isError) return { content, isError: true }
          }
          return { content }
        },
        { annotations: acting }
      )
    ]
  })
}
