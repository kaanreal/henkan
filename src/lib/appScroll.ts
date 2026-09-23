export function scrollAppToTop() {
  const scroll = () => {
    document.getElementById('root')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }

  scroll()
  window.requestAnimationFrame(scroll)
}
