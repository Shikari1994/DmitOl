/* ── Развёрнутое видео вкладок (Software.astro) ──
   Клик по кадру открывает тот же ролик — тот же src и currentTime, НЕ
   рестарт — почти во весь экран. Переход не кросс-фейд, а FLIP: элемент
   растёт из своего прямоугольника и на закрытии сжимается туда же,
   откуда взялся. Кнопка «назад» и клик по фону закрывают одинаково. */
const triggers = [...document.querySelectorAll('[data-video-lightbox-trigger]')]
const overlay = document.querySelector('[data-video-lightbox]')
const stage = overlay?.querySelector('[data-video-lightbox-stage]')
const lbVideo = overlay?.querySelector('[data-video-lightbox-video]')
const closeEls = overlay ? [...overlay.querySelectorAll('[data-video-lightbox-close]')] : []
const closeBtn = overlay?.querySelector('.video-lightbox-close')

if (triggers.length && overlay && stage && lbVideo) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let sourceTrigger = null
  let sourceVideo = null
  let lastFocus = null

  /* Дельта между прямоугольником-источником и уже посчитанным лейаутом
     сцены: она всегда по центру фикс-оверлея, transform на поток не
     влияет. */
  const flipDelta = (rect) => {
    const target = stage.getBoundingClientRect()
    const sx = rect.width / target.width
    const sy = rect.height / target.height
    const dx = rect.left + rect.width / 2 - (target.left + target.width / 2)
    const dy = rect.top + rect.height / 2 - (target.top + target.height / 2)
    return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
  }

  const open = (trigger) => {
    const video = trigger.querySelector('video')
    if (!video) return

    sourceTrigger = trigger
    sourceVideo = video
    lastFocus = trigger

    lbVideo.src = video.currentSrc || video.src
    lbVideo.currentTime = video.currentTime || 0

    overlay.classList.add('is-open')
    overlay.setAttribute('aria-hidden', 'false')
    document.body.classList.add('menu-open')
    video.pause?.()

    if (reduce) {
      stage.style.transform = 'none'
    } else {
      const rect = trigger.getBoundingClientRect()
      stage.style.transition = 'none'
      stage.style.transform = flipDelta(rect)
      stage.offsetHeight // force reflow, чтобы старт-transform применился до анимации
      stage.style.transition = ''
      requestAnimationFrame(() => { stage.style.transform = 'none' })
    }

    lbVideo.play?.().catch(() => {})
    closeBtn?.focus?.()
  }

  const close = () => {
    if (!overlay.classList.contains('is-open')) return
    overlay.setAttribute('aria-hidden', 'true')
    document.body.classList.remove('menu-open')

    if (sourceTrigger && !reduce) {
      stage.style.transform = flipDelta(sourceTrigger.getBoundingClientRect())
    }
    overlay.classList.remove('is-open')

    lbVideo.pause?.()
    sourceVideo?.play?.().catch(() => {})
    sourceVideo = null
    sourceTrigger = null
    lastFocus?.focus?.()
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => open(trigger))
    trigger.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      open(trigger)
    })
  })
  closeEls.forEach((el) => el.addEventListener('click', close))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close()
  })
}
