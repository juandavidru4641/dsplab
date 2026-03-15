import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Prism from 'prismjs'
;(window as any).Prism = Prism
import 'prismjs/themes/prism-tomorrow.css'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-javascript'
import './styles/reset.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/components.css'
import './styles/legacy.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
