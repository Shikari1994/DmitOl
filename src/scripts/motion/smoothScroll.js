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

  /* Шапка меняет свою высоту после первых 40px прокрутки. Фиксированный
     offset здесь рассинхронизировался с ней: ссылка, нажатая в верхнем
     hero, считалась по высокой шапке, а приезжала уже к компактной.
     Берём живую геометрию, а после завершения Lenis один раз выравниваем
     целевой элемент по фактической нижней кромке навигации. */
  const nav = document.querySelector('nav.nav')
  const navOffset = () => -(nav?.getBoundingClientRect().height ?? 0)
  const alignTargetWithNav = (target) => {
    if (!nav || !target) return

    const delta = target.getBoundingClientRect().top - nav.getBoundingClientRect().bottom
    if (Math.abs(delta) > 1) lenis.scrollTo(window.scrollY + delta, { immediate: true })
  }

  /* Ссылки шапки вида '/#about', а не голого '#about' (ради страниц
     товара), поэтому сравниваем pathname: Lenis перехватывает только
     якоря ТОГО ЖЕ документа, а переход со страницы товара на главную
     остаётся обычной навигацией браузера. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="#"]')
    if (!a) return
    const url = new URL(a.href, location.href)
    if (url.pathname !== location.pathname || url.hash.length <= 1) return
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)))
    if (!target) return

    e.preventDefault()
    lenis.scrollTo(target, {
      offset: navOffset(),
      onComplete: () => alignTargetWithNav(target),
    })
  })
}
