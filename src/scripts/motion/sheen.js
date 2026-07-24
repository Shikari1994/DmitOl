/* ─── Стеклянные карточки «между рейсами»: рассеянный свет по прогрессу скролла ───
   Не разовое появление (как .reveal) и не курсорный spotlight (тот приём
   уже отклонён выше по файлу как чуждый промышленному тону) — пятно ведёт
   исключительно scrub, честная функция от положения карточки в вьюпорте.
   Свет проходит слева направо ровно один раз за то время, что карточка
   видна: входит вместе с нижним краем экрана, выходит с верхним. Scrub
   заметно мягче, чем у прежней версии-полосы (0.3 → 0.6) — пятну положено
   дрейфовать, а не сканировать. */
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
