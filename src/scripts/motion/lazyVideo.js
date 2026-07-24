/* ─── Ленивое видео в плитке (тяжёлый файл грузим только у вьюпорта) ───
   src проставляется при подходе к экрану, не на загрузке страницы.
   При reduced-motion видео не грузим — остаётся постер-скриншот. */
import { reduce } from './env.js'

{
  const vids = document.querySelectorAll('video[data-lazy-video]')

  /* Ролики фактурой весят около 9,5 МБ на двоих. На экономии трафика и на
     медленном соединении это заметная плата за подложку, которая идёт под
     заливкой с прозрачностью 0.22: вместо видео там остаётся постер —
     тот же кадр, только статичный, и раздел выглядит так же. */
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

    /* Ролики с постером (вкладки Drill Monitor — Инклинометрия, Каротаж)
       сперва показывают статичный скриншот и только через 3 секунды
       переключаются на видео: сравнение «скрин → ролик» читается лучше,
       чем ролик, стартующий мгновенно поверх ещё не увиденного кадра. */
    const POSTER_DELAY = 3000
    const playTimers = new WeakMap()

    // играем только пока плитка видна — экономим CPU/батарею
    const play = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target
        if (e.isIntersecting) {
          if (v.poster && !v.dataset.posterShown) {
            if (!playTimers.has(v)) {
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
