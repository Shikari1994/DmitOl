/* ─── HERO: запуск видео-фона ───
   Плитки справа (ноутбук+телефон, снаряд из двух модулей) в покое
   пустые и выезжают по наведению — это чистый CSS (:hover/:focus-visible
   на .hero-tile-art в hero.css), JS им не нужен.

   Видео явно запускаем из JS, а не атрибутом autoplay в разметке — тогда
   при reduced-motion ролик ни на кадр не тронется, а не «поиграл и
   встал»: play() просто не вызывается. */
import { reduce } from './env.js'

const heroVideo = document.querySelector('[data-hero-video]')
if (heroVideo && !reduce) {
  heroVideo.play?.().catch(() => {})

  /* ─── Пауза, когда первый экран ушёл ───
     Ролик тяжёлый (hero_back.mp4), и без этого он декодировался ВСЮ
     прокрутку страницы — одновременно с глобусом «О компании», фоном
     продукции и роликом активной вкладки Drill Monitor. Четыре
     параллельных видеопотока ради одного видимого и есть та самая
     причина рывков на слабой графике.
     Тот же приём уже носят ленивые ролики (см. lazyVideo.js), здесь он
     не был применён только потому, что hero стартует сразу и лениво
     грузиться ему незачем. Пока секция на экране, поведение прежнее:
     видео играет с первого кадра и по кругу. */
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
