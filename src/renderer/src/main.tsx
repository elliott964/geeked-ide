import '@vscode/codicons/dist/codicon.css'
import 'highlight.js/styles/tokyo-night-dark.css'
import './styles/global.css'
import './styles/chat.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
