/* ── Вкладки модулей ПО (настольная версия) ──
   Клик по вкладке переключает активный слайд. Ролики останавливать и
   запускать здесь не нужно: неактивный слайд получает display:none и
   выпадает из пересечения вьюпорта, а дальше всё делают наблюдатели в
   motion/lazyVideo.js. */
const tabs = [...document.querySelectorAll('[data-sw-tab]')]
const slides = [...document.querySelectorAll('[data-sw-slide]')]

if (tabs.length && slides.length) {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const i = tab.dataset.index
      if (tab.classList.contains('is-active')) return

      tabs.forEach((t) => {
        const on = t === tab
        t.classList.toggle('is-active', on)
        t.setAttribute('aria-pressed', on ? 'true' : 'false')
      })
      slides.forEach((s) => s.classList.toggle('is-active', s.dataset.index === i))
    })
  })
}
