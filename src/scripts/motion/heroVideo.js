/* ─── HERO: запуск видео-фона ───
   Запускаем из JS, а не атрибутом autoplay: при reduced-motion play()
   просто не вызывается, и ролик не трогается ни на кадр — с autoplay он
   бы «поиграл и встал».

   Плиткам справа JS не нужен, их выезд по наведению — чистый CSS. */
import { reduce } from './env.js'

const heroVideo = document.querySelector('[data-hero-video]')
if (heroVideo && !reduce) {
  heroVideo.play?.().catch(() => {})

  /* ─── Пауза, когда первый экран ушёл ───
     Без неё тяжёлый hero_back.mp4 декодируется ВСЮ прокрутку страницы —
     одновременно с глобусом, фоном продукции и роликом активной вкладки
     Drill Monitor. Четыре параллельных видеопотока ради одного видимого
     и есть причина рывков на слабой графике. Тот же приём у ленивых
     роликов, см. lazyVideo.js. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) heroVideo.play?.().catch(() => {})
        else heroVideo.pause?.()
      },
      { threshold: 0 },
    ).observe(heroVideo)
  }
}
