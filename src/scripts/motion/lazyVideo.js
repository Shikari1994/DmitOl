/* ─── Ленивое видео в плитке (тяжёлый файл грузим только у вьюпорта) ───
   src проставляется при подходе к экрану, не на загрузке страницы.
   При reduced-motion видео не грузим — остаётся тёмная подложка кадра. */
import { reduce } from './env.js'

{
  const vids = document.querySelectorAll('video[data-lazy-video]')

  /* Ролики весят около 9,5 МБ на двоих — заметная плата за подложку,
     которая и так идёт под полупрозрачной заливкой. На экономном
     соединении вместо видео остаётся постер: тот же кадр, только
     статичный, раздел выглядит так же. */
  const conn = navigator.connection
  const frugal = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || ''))

  if (vids.length && !reduce && !frugal && 'IntersectionObserver' in window) {
    const load = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const v = e.target
        if (!v.src) { v.src = v.dataset.lazyVideo; v.load() }
        obs.unobserve(v)
      })
    }, { rootMargin: '300px' })

    /* Ролики с data-hold-frame (вкладки Drill Monitor) держат свой
       первый кадр и только через 3 секунды продолжают с него. Отдельный
       img-постер тут не годится: его кадр не совпадал 1-в-1 с реальным
       первым кадром ролика, и при старте была видна подмена картинки.
       play() → сразу pause() заставляет браузер отрисовать настоящий
       первый кадр, а поздний play() продолжает ровно с него. */
    const POSTER_DELAY = 3000
    const playTimers = new WeakMap()

    // играем только пока плитка видна — экономим CPU/батарею
    const play = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target
        if (e.isIntersecting) {
          if (v.dataset.holdFrame !== undefined && !v.dataset.posterShown) {
            if (!playTimers.has(v)) {
              v.play?.().then(() => v.pause?.()).catch(() => {})
              const t = setTimeout(() => {
                v.dataset.posterShown = 'true'
                v.play?.().catch(() => {})
              }, POSTER_DELAY)
              playTimers.set(v, t)
            }
          } else {
            v.play?.().catch(() => {})
          }
        } else {
          v.pause?.()
          if (playTimers.has(v)) { clearTimeout(playTimers.get(v)); playTimers.delete(v) }
        }
      })
    }, { threshold: 0.25 })

    vids.forEach((v) => { load.observe(v); play.observe(v) })
  }
}
