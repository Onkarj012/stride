import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './index.css'
import { Shell } from './app/Shell'
import { MobileApp } from './mobile/MobileApp'

gsap.registerPlugin(ScrollTrigger)

function Root() {
  const [mobile, setMobile] = useState(true)
  return mobile
    ? <MobileApp onExit={() => setMobile(false)} />
    : (
      <div className="relative">
        <Shell />
        <button
          onClick={() => setMobile(true)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-ink text-white text-[13px] font-bold px-4 py-2.5 shadow-[0_12px_30px_rgba(13,16,27,0.3)] hover:scale-105 transition-transform"
        >
          📱 Mobile view
        </button>
      </div>
    )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
