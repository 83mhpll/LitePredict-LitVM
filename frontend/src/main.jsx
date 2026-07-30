import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import SimplePredict from './SimplePredict.jsx'

function Root() {
  const [view, setView] = useState('simple'); // 'simple' | 'classic'
  if (view === 'classic') return <App />;
  return <SimplePredict onSwitchToClassic={() => setView('classic')} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
