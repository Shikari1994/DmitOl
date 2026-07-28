/* ─── Карточки «между рейсами»: рассеянный свет по прогрессу скролла ───
   Не разовое появление (как .reveal) и не курсорный spotlight — пятно
   ведёт scrub, честная функция от положения карточки в вьюпорте: свет
   проходит слева направо ровно один раз за то время, что она видна.
   Scrub мягкий (0.6): пятну положено дрейфовать, а не сканировать. */
import { gsap } from 'gsap'
import { reduce } from './env.js'

if (!reduce) {
  gsap.utils.toArray('.sw-life-sheen').forEach((sheen) => {
    const card = sheen.closest('.sw-life-item')
    if (!card) return
    gsap.fromTo(
      sheen,
      { xPercent: -70, opacity: 0.85 },
      {
        xPercent: 220,
        opacity: 0.85,
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.6,
        },
      },
    )
  })
}
