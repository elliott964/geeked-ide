# Geeked IDE

An **Agent Development Environment**: a VS Code–style desktop app where the editor is an AI chat. It runs on the **Claude Agent SDK**, so every chat has the full Claude Code toolset: file read/write/edit, terminal commands, web search and fetch, todo lists, subagents, skills, plugins, MCP servers, slash commands, plan mode, permission prompts, file checkpoints, and Ultracode workflows.

## Models

| In Geeked IDE | Claude model | Model id |
| --- | --- | --- |
| GeekedGPT mini | Claude Haiku 5.5 | `claude-haiku-5-5` |
| GeekedGPT | Claude Sonnet 5.5 | `claude-sonnet-5-5` |
| GeekedGPT Plus | Claude Opus 5.5 | `claude-opus-5-5` |
| GeekedGPT Ultra *(hidden)* | Claude Fable 5.1 | `claude-fable-5-1` |

**Unlocking GeekedGPT Ultra:** type the Konami code anywhere in the app (↑ ↑ ↓ ↓ ← → ← → B A), or click the logo 7 times quickly on the Welcome page, in Settings → About, or in Help → About. You can hide it again in Settings.

## Thinking effort

The slider in the composer runs **Low → Medium → High → Extra high → Max → Ultracode**. Ultracode is Max effort plus Claude Code's standing dynamic-workflow orchestration (multi-agent workflows). It only takes effect where your plan and model support dynamic workflows.

## Browser

Geeked IDE has two browser options, matching Claude Code:

- **Built-in browser (always on).** A browser pane beside the chat (`Ctrl+Shift+B`, or the globe button). GeekedGPT drives it with the `geeked_browser` tools: `navigate`, `computer` (screenshot, click, type, key, scroll, hover, drag, zoom), `read_page`, `find`, `get_page_text`, `form_input`, `javascript_tool`, `read_console_messages`, `read_network_requests`, tab tools, `resize_window` (mobile/tablet emulation) and `browser_batch`. Screenshots appear inline in the chat, and the pane glows while the agent is acting. It works with local dev servers (`localhost:PORT`) and local HTML files. It uses its own browser profile; clear it in **Settings → Browser**. Browsing actions run without prompts, but running JavaScript in a page asks first, following the chat's permission mode. Open tabs come back after a restart.
- **Claude in Chrome (optional).** Turn it on in **Settings → Browser** to also let GeekedGPT drive your own Chrome, with your sign-ins, through the Claude in Chrome extension. This is the same integration as `claude --chrome`. It needs the extension and a claude.ai sign-in (not an API key), and applies to chats started after you change it.

## Projects

- **New project:** press **New Project** (Welcome page, Explorer, File menu, or `Ctrl+Shift+N`), type a name, press Enter. The folder is created and opened with a fresh chat.
- **Default location:** `Documents\Geeked Projects`. Change it in **Settings → Projects**, or choose a one-off location in the New Project dialog.
- **Open project:** `Ctrl+O` or **Open Project** to work in any existing folder. Recent projects appear on the Welcome page and in the File menu.

Chats are saved as Claude Code sessions, so the **Chats** view also shows sessions you started in the `claude` CLI for that folder, and you can pick up any of them.

## Sign-in

Geeked IDE uses, in order:

1. An API key saved in **Settings → Account**, encrypted with Windows credential protection.
2. The `ANTHROPIC_API_KEY` environment variable.
3. Your existing Claude Code sign-in. Run `claude` once and use `/login`.

## Run it

Requires Node.js 22 or later.

```bash
npm install
```

```bash
npm run dev
```

`npm run build` compiles to `out/`; `npm start` previews the build.

## Build an installer

```bash
npm run dist
```

This produces `release/Geeked IDE Setup <version>.exe`. The agent engine binary is unpacked from the asar archive so it can be executed.

## Keyboard shortcuts

| Action | Keys |
| --- | --- |
| New chat | `Ctrl+N` |
| New project | `Ctrl+Shift+N` |
| Open project | `Ctrl+O` |
| Command palette | `Ctrl+Shift+P` |
| Go to file | `Ctrl+P` |
| Change model / effort | `Ctrl+Shift+M` / `Ctrl+Shift+T` |
| Switch permission mode | `Shift+Tab` in the composer |
| Stop the agent | `Esc` in the composer |
| Toggle side bar / panel | `Ctrl+B` / `Ctrl+J` |
| Toggle browser | `Ctrl+Shift+B` |
| Settings | `Ctrl+,` |
| All shortcuts | `Ctrl+/` |

## Project layout

```
src/main/       Electron main process: windows, IPC, settings, projects, files
src/main/agent.ts   Claude Agent SDK bridge (one Claude Code session per chat)
src/main/browser.ts Built-in browser: native tabs, CDP input, page reading
src/main/browserTools.ts  geeked_browser MCP tools given to every chat
src/preload/    Typed, sandboxed bridge exposed as window.geeked
src/shared/     Model/effort catalogue and the IPC contract
src/renderer/   React UI: workbench, chat transcript, tool cards, composer
```
