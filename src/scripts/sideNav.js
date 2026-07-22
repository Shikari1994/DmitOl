/* ─────────────────────────────────────────────
   Боковая навигация (components/SideNav.astro):
   появление после hero + свой scrollspy.

   Отдельный файл, а не расширение scrollspy из
   nav.js: набор секций здесь другой (добавлены
   Mobile и Economics, которых нет в шапке), и
   общий Map «секция → ссылка» рассинхронизировал
   бы подсветку в обоих местах, если бы ссылки
   верхнего меню и боковой панели писали в одну
   и ту же секцию разными узлами.

   Клик по ссылкам ничего специального не требует:
   плавный скролл и офсет уже даёт общий делегат
   в motion.js (a[href^="#"] → lenis.scrollTo).
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

  /* Панель прячется на самом hero — там ей нечего подсвечивать и
     нечего перекрывать собой первый экран — и появляется, как только
     hero уходит за половину высоты вьюпорта. */
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
