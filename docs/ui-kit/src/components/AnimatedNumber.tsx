import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

interface Props {
  value: number
  className?: string
  suffix?: string
  duration?: number
}

export function AnimatedNumber({ value, className, suffix = '', duration = 1 }: Props) {
  const [display, setDisplay] = useState(0)
  const prevValue = useRef<number | null>(null)
  const tweenRef = useRef<gsap.core.Tween | null>(null)

  useEffect(() => {
    const from = prevValue.current ?? 0
    const isFirst = prevValue.current === null
    prevValue.current = value

    tweenRef.current?.kill()

    const obj = { v: from }
    tweenRef.current = gsap.to(obj, {
      v: value,
      duration: isFirst ? duration : duration * 0.6,
      ease: 'power2.out',
      onUpdate() { setDisplay(Math.round(obj.v)) },
    })

    return () => { tweenRef.current?.kill() }
  }, [value, duration])

  return <span className={className}>{display}{suffix}</span>
}
