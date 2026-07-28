/* ─────────────────────────────────────────────
   Боковая навигация: появление после hero и свой
   scrollspy.

   Отдельный файл, а не расширение scrollspy из
   nav.js: набор секций здесь другой (добавлена
   Mobile, которой нет в шапке), а общий Map
   «секция → ссылка» рассинхронизировал бы
   подсветку в обоих местах.

   Клик ничего специального не требует: плавный
   скролл и офсет даёт общий делегат в
   motion/smoothScroll.js.
   ───────────────────────────────────────────── */

const side = document.querySelector('.side-nav')

if (side) {
  const links = [...side.querySelectorAll('a[href^="#"]')]
  const sections = []
  const linkFor = new Map()
  links.forEach((a) => {
    const el = document.getElementById(a.getAttribute('href').slice(1))
    if (el) {
      sections.push(el)
      linkFor.set(el, a)
    }
  })

  if (sections.length && 'IntersectionObserver' in window) {
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
        for (let i = sections.length - 1; i >= 0; i--) {
          if (visible.has(sections[i])) {
            const active = linkFor.get(sections[i])
            links.forEach((a) => {
              const isActive = a === active
              a.classList.toggle('active', isActive)
              if (isActive) a.setAttribute('aria-current', 'true')
              else a.removeAttribute('aria-current')
            })
            break
          }
        }
      },
      { rootMargin: '0px 0px -100% 0px', threshold: 0 },
    )
    sections.forEach((s) => io.observe(s))
  }

  /* На hero панель прячется: подсвечивать там нечего, а первый экран
     она бы перекрывала. Появляется, когда hero уходит за половину
     высоты вьюпорта. */
  const hero = document.getElementById('hero')
  if (hero && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => side.classList.toggle('visible', !entry.isIntersecting),
      { rootMargin: '-50% 0px 0px 0px' },
    )
    io.observe(hero)
  } else {
    side.classList.add('visible')
  }
}
