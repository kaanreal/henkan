import { useEffect, useRef } from 'react'

const IMAGES = ['arrow1.png', 'arrow2.png']

export function FallingArrows() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let mounted = true
    const elements: HTMLImageElement[] = []

    function createArrow() {
      if (!mounted) return
      const img = document.createElement('img')
      img.src = IMAGES[Math.floor(Math.random() * IMAGES.length)]
      img.className = 'falling-arrow'
      img.style.left = `${Math.random() * 100}%`
      img.style.top = '-80px'
      const size = Math.random() * 80 + 40
      img.style.width = `${size}px`
      img.style.height = `${size}px`
      const duration = Math.random() * 4 + 5
      img.style.animationDuration = `${duration}s`
      img.style.animationDelay = `${Math.random() * 2}s`
      container!.appendChild(img)
      elements.push(img)
      const lifetime = (duration + 2) * 1000
      setTimeout(() => {
        if (img.parentNode) img.remove()
        const idx = elements.indexOf(img)
        if (idx !== -1) elements.splice(idx, 1)
      }, lifetime)
    }

    const interval = setInterval(createArrow, 500)
    for (let i = 0; i < 3; i++) setTimeout(createArrow, i * 400)

    return () => {
      mounted = false
      clearInterval(interval)
      for (const el of elements) el.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none -z-5"
    />
  )
}
