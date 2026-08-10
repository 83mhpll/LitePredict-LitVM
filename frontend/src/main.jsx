import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SimplePredict from './SimplePredict.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SimplePredict />
  </StrictMode>,
)
