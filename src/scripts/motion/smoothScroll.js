/* ─── Инерционный скролл Lenis + якорные ссылки ─── */
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { reduce } from './env.js'

if (!reduce) {
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })

  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  /* 2026-07-25: ссылки шапки — теперь '/#about' (см. Nav.astro), не
     голый '#about', ради страниц товара. a.href — уже разрешённый
     браузером абсолютный URL; сравниваем его pathname с текущим —
     перехватываем и скроллим лениsom только «свои» якоря (тот же
     документ), а переход на другую страницу (со страницы товара на
     '/#products') оставляем браузеру как обычную навигацию. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]')
    if (!a) return
    const url = new URL(a.href, location.href)
    if (url.pathname !== location.pathname || url.hash.length <= 1) return
    e.preventDefault()
    lenis.scrollTo(url.hash, { offset: -70 })
  })
}
