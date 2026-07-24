/* ─── HERO: запуск видео-фона ───
   Плитки справа (ноутбук+телефон, снаряд из двух модулей) в покое
   пустые и выезжают по наведению — это чистый CSS (:hover/:focus-visible
   на .hero-tile-art в hero.css), JS им не нужен.

   Видео явно запускаем из JS, а не атрибутом autoplay в разметке — тогда
   при reduced-motion ролик ни на кадр не тронется, а не «поиграл и
   встал»: play() просто не вызывается. */
import { reduce } from './env.js'

const heroVideo = document.querySelector('[data-hero-video]')
if (heroVideo && !reduce) heroVideo.play?.().catch(() => {})
