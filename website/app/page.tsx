import browserShot from '@/assets/browser.png'
import composer from '@/assets/composer.png'
import hero from '@/assets/hero.png'
import newProject from '@/assets/new-project.png'
import plan from '@/assets/plan.png'
import question from '@/assets/question.png'
import welcome from '@/assets/welcome.png'
import Image from 'next/image'
import { Chat, Check, Download, Folder, Gauge, Globe, Logo, MapIcon, Milestone, Question, Shield, Sparkle, Toolbox, Windows } from '@/components/icons'
import { EffortDemo, Faq, Feature, GitHubButton, HeroShot, Models, Motion, Nav, Reveal, Showcase } from '@/components/interactive'
import { DOWNLOAD_SIZE, DOWNLOAD_URL, GITHUB_URL, RELEASES_URL, VERSION } from '@/components/site'

const BROWSER_TOOLS = ['navigate', 'computer', 'read_page', 'find', 'form_input', 'get_page_text', 'javascript_tool', 'read_console_messages', 'read_network_requests', 'resize_window', 'browser_batch']

function DownloadButton() {
  return (
    <a className="btn btn-primary" href={DOWNLOAD_URL}>
      <Windows size={18} /> Download for Windows <small>{DOWNLOAD_SIZE}</small>
    </a>
  )
}

export default function Home() {
  return (
    <Motion>
      <Nav />
      <main id="top">
        <section className="hero">
          <div className="hero-bg" />
          <div className="hero-grid" />
          <div className="container">
            <div className="hero-copy">
              <Reveal y={12}>
                <a className="pill" href={RELEASES_URL} target="_blank" rel="noreferrer">
                  <span className="pill-dot">v{VERSION}</span> Built on the Claude Agent SDK
                </a>
              </Reveal>
              <Reveal delay={0.05}>
                <h1>
                  Describe it.
                  <br />
                  <span className="grad-text">GeekedGPT builds it.</span>
                </h1>
              </Reveal>
              <Reveal delay={0.12}>
                <p className="hero-sub">
                  Geeked IDE is an agent development environment for Windows. It looks like VS Code, but the editor is a chat, and the agent in it can
                  edit your files, run commands, and click through your app in a built-in browser.
                </p>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="hero-ctas">
                  <DownloadButton />
                  <GitHubButton />
                </div>
                <div className="hero-note">Windows 10 and 11, 64-bit · Free download · Uses your Claude account or an Anthropic API key</div>
              </Reveal>
            </div>
            <HeroShot src={hero} alt="Geeked IDE with a chat on the left where GeekedGPT tested a coffee shop site, and the built-in browser on the right showing the confirmed order" />
            <Reveal>
              <div className="stats">
                <div className="stat">
                  <b className="grad-text">3 + 1</b>
                  <span>GeekedGPT models, one of them hidden</span>
                </div>
                <div className="stat">
                  <b className="grad-text">6</b>
                  <span>effort levels, up to Ultracode</span>
                </div>
                <div className="stat">
                  <b className="grad-text">1 click</b>
                  <span>to start a new project</span>
                </div>
                <div className="stat">
                  <b className="grad-text">2</b>
                  <span>browsers it can drive</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <Reveal className="section-head">
              <span className="eyebrow grad-text">Everything in one window</span>
              <h2>An IDE where the editor is a conversation.</h2>
              <p>Explorer, tabs, command palette, status bar: the layout you already know. You talk, and GeekedGPT does the work you would have done by hand.</p>
            </Reveal>
            <div className="features">
              <Feature icon={<Chat />} title="Chat is the editor">
                Every chat is a tab. Streaming answers, tool cards with diffs, inline screenshots, and a todo list that ticks itself off as it works.
              </Feature>
              <Feature icon={<Toolbox />} title="The whole Claude Code toolset" delay={0.05}>
                File edits, terminal commands, web search, subagents, skills, plugins, MCP servers and slash commands, ready in every chat.
              </Feature>
              <Feature icon={<Globe />} title="A browser it can drive" delay={0.1}>
                GeekedGPT opens your site, clicks, types, reads the console and takes screenshots, right next to the chat where you can watch.
              </Feature>
              <Feature icon={<MapIcon />} title="Plan first, then build">
                Plan mode researches without touching anything. It asks clarifying questions, then shows a plan you approve before it codes.
              </Feature>
              <Feature icon={<Shield />} title="You stay in control" delay={0.05}>
                Approve each edit and command, auto-accept edits, or switch modes with Shift+Tab. File checkpoints let you roll changes back.
              </Feature>
              <Feature icon={<Folder />} title="Projects in one click" delay={0.1}>
                Hit New Project, type a name, start chatting. Pick your default folder, open any existing folder, and pick up any past chat.
              </Feature>
            </div>
          </div>
        </section>

        <section className="section" id="tour" style={{ paddingTop: 40 }}>
          <div className="container">
            <Reveal className="section-head center">
              <span className="eyebrow grad-text">See it work</span>
              <h2>From a name to a plan in a minute.</h2>
            </Reveal>
            <Reveal>
              <Showcase
                slides={[
                  { title: 'Start a project', body: 'Name it and you are in. Projects live wherever you choose.', icon: <Folder size={18} />, image: newProject, alt: 'The New Project dialog with a project name and folder' },
                  { title: 'Answer questions', body: 'When a choice matters, GeekedGPT asks instead of guessing.', icon: <Question size={18} />, image: question, alt: 'A question card asking whether coupon codes should stack, with three options' },
                  { title: 'Approve the plan', body: 'Read the plan, then let it code with or without asking first.', icon: <Milestone size={18} />, image: plan, alt: 'A plan approval card with options to approve and auto-accept edits' },
                  { title: 'Pick model and effort', body: 'Switch models and thinking effort any time, right in the composer.', icon: <Gauge size={18} />, image: composer, alt: 'The composer with the effort slider at Ultracode and the model menu open' },
                  { title: 'Come back anytime', body: 'Recent projects and chats are right where you left them.', icon: <Sparkle size={18} />, image: welcome, alt: 'The Geeked IDE welcome page with New Project and Open Project' }
                ]}
              />
            </Reveal>
          </div>
        </section>

        <section className="section" id="browser">
          <div className="container split">
            <Reveal>
              <span className="eyebrow grad-text">Built-in browser</span>
              <h2>It doesn&apos;t just write the code. It checks it works.</h2>
              <ul className="checks">
                <li>
                  <span className="check">
                    <Check />
                  </span>
                  <span>
                    <b>Opens your dev server or local files</b> in a browser pane next to the chat.
                  </span>
                </li>
                <li>
                  <span className="check">
                    <Check />
                  </span>
                  <span>
                    <b>Clicks, types, scrolls and fills forms</b> by reading the page, not guessing pixels.
                  </span>
                </li>
                <li>
                  <span className="check">
                    <Check />
                  </span>
                  <span>
                    <b>Reads the console and network</b> to track down what broke.
                  </span>
                </li>
                <li>
                  <span className="check">
                    <Check />
                  </span>
                  <span>
                    <b>Optional Claude in Chrome</b> lets it drive your own Chrome, with your sign-ins.
                  </span>
                </li>
              </ul>
              <div className="tool-chips">
                {BROWSER_TOOLS.map((t) => (
                  <span key={t} className="tool-chip">
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="frame">
                <Image src={browserShot} alt="GeekedGPT's screenshot of the coffee shop order confirmation inline in the chat, next to the live browser pane" sizes="(max-width: 1000px) 100vw, 620px" placeholder="blur" />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section" id="effort">
          <div className="container">
            <Reveal className="section-head center">
              <span className="eyebrow grad-text">Thinking effort</span>
              <h2>Dial how hard it thinks.</h2>
              <p>Drag the slider. Quick fixes stay fast; big jobs get deep reasoning, or Ultracode&apos;s multi-agent workflows.</p>
            </Reveal>
            <Reveal>
              <EffortDemo />
            </Reveal>
          </div>
        </section>

        <section className="section" id="models">
          <div className="container">
            <Reveal className="section-head center">
              <span className="eyebrow grad-text">Models</span>
              <h2>Pick your brain power.</h2>
              <p>Switch any time from the composer. Every GeekedGPT model is a Claude model.</p>
            </Reveal>
            <Models />
          </div>
        </section>

        <section className="section" id="start">
          <div className="container">
            <Reveal className="section-head center">
              <span className="eyebrow grad-text">Get started</span>
              <h2>Up and running in three steps.</h2>
            </Reveal>
            <div className="steps">
              <Reveal>
                <div className="step">
                  <div className="step-num">1</div>
                  <h3>Install</h3>
                  <p>Download the installer and run it. If SmartScreen appears, choose More info, then Run anyway.</p>
                </div>
              </Reveal>
              <Reveal delay={0.06}>
                <div className="step">
                  <div className="step-num">2</div>
                  <h3>Sign in</h3>
                  <p>
                    Already use Claude Code? You are set. Otherwise run <code>claude</code> and <code>/login</code> once, or paste an Anthropic API key in Settings.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <div className="step">
                  <div className="step-num">3</div>
                  <h3>Build something</h3>
                  <p>Press New Project, give it a name, and tell GeekedGPT what to make.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container">
            <Reveal className="section-head center">
              <span className="eyebrow grad-text">FAQ</span>
              <h2>Questions, answered.</h2>
            </Reveal>
            <Reveal>
              <Faq
                items={[
                  {
                    q: 'Is Geeked IDE free?',
                    a: <p>The app is a free download. Model usage counts against your Claude plan, or is billed to your Anthropic API key if you use one.</p>
                  },
                  {
                    q: 'Is it made by Anthropic?',
                    a: (
                      <p>
                        No. Geeked IDE is an independent app built on Anthropic&apos;s Claude Agent SDK. GeekedGPT mini, GeekedGPT and GeekedGPT Plus are Claude Haiku,
                        Sonnet and Opus.
                      </p>
                    )
                  },
                  {
                    q: 'What do I need to run it?',
                    a: <p>Windows 10 or 11 (64-bit), and either a Claude Code sign-in or an Anthropic API key. Everything else, including the agent engine, comes in the installer.</p>
                  },
                  {
                    q: 'Why does Windows warn me about the installer?',
                    a: <p>The installer isn&apos;t code-signed yet, so SmartScreen doesn&apos;t recognize it. Choose More info, then Run anyway. The release page lists the file&apos;s SHA-256 if you want to check it.</p>
                  },
                  {
                    q: 'Where do my projects go?',
                    a: <p>Into a Geeked Projects folder in Documents by default. Change it in Settings, pick a different folder per project, or open any folder you already have.</p>
                  },
                  {
                    q: 'Does the built-in browser see my logins?',
                    a: <p>No. It uses its own profile, separate from your everyday browser, and you can clear it in Settings. Claude in Chrome is the opt-in way to let GeekedGPT use your own Chrome.</p>
                  }
                ]}
              />
            </Reveal>
          </div>
        </section>

        <section className="container">
          <Reveal>
            <div className="cta">
              <Logo size={64} id="cta" />
              <h2>Your next project is one sentence away.</h2>
              <p>Tell GeekedGPT what you want, then watch it build it, click through it, and check that it works.</p>
              <div className="hero-ctas">
                <DownloadButton />
                <a className="btn btn-ghost" href={RELEASES_URL} target="_blank" rel="noreferrer">
                  <Download size={18} /> All releases
                </a>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div className="brand" style={{ fontSize: 15 }}>
            <Logo size={22} id="footer" /> Geeked IDE
          </div>
          <span>An independent project built on the Claude Agent SDK. Not affiliated with Anthropic.</span>
          <div className="footer-links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              Releases
            </a>
            <a href="https://yeahelliott.com">yeahelliott.com</a>
          </div>
        </div>
      </footer>
    </Motion>
  )
}
