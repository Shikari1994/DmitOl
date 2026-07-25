/* ─── scrollspy ───
   Магнитные CTA и spotlight-граница убраны: игривая микро-механика
   спорит с промышленным тоном. Отклик на нажатие остался, но чисто
   на CSS (:active) — без слежения за курсором.
   2026-07-25: селектор был точным совпадением href="#id" — ссылки
   шапки теперь '/#id' (см. Nav.astro), поэтому ищем по хвосту хэша
   ($=), не по всей строке. */
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { reduce } from './env.js'

if (!reduce) {
  document.querySelectorAll('section[id]').forEach((sec) => {
    const link = document.querySelector(`.nav-links a[href$="#${sec.id}"]`)
    if (!link) return
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 45%',
      end: 'bottom 45%',
      onToggle: (self) => link.classList.toggle('active', self.isActive),
    })
  })
}
