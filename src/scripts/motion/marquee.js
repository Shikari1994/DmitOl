/* ─── Бесконечные ленты (.marquee) ───
   Список клонируется, обе копии едут встык — шов не виден.
   Скорость привязана к ширине, чтобы длинные и короткие ленты
   двигались одинаково; за пределами экрана анимация на паузе. */
import { gsap } from 'gsap'
import { reduce } from './env.js'

if (!reduce) {
  document.querySelectorAll('.marquee').forEach((lane) => {
    const list = lane.querySelector('.marquee-list')
    if (!list) return
    list.after(list.cloneNode(true))

    const speed = Number(lane.dataset.marqueeSpeed) || 45 // px/сек
    const dir = lane.dataset.marqueeDir === 'right' ? 1 : -1
    const tweens = [...lane.querySelectorAll('.marquee-list')].map((el) =>
      gsap.to(el, {
        x: dir * el.scrollWidth,
        repeat: -1,
        paused: true,
        duration: el.scrollWidth / speed,
        ease: 'none',
      }),
    )

    new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => tweens.forEach((t) => (e.isIntersecting ? t.play() : t.pause())))
      },
      { threshold: 0 },
    ).observe(lane)
  })
}
