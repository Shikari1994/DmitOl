/* ─────────────────────────────────────────────
   Глобальная анимация страницы — BARREL: по одному
   модулю на приём в motion/*, здесь только порядок
   их запуска.

   ПОРЯДОК МЕНЯТЬ НЕЛЬЗЯ: env ставит ScrollTrigger.
   config и общий reduce для всех, а reveal в конце
   делает ScrollTrigger.refresh(), который обязан
   пройти до sheen/mobile.

   Скролл-приём на странице один — прибитая сцена
   «О компании». Hero статичный: выезд предметов
   в его плитках идёт разово, без привязки к скроллу. */
import './motion/env.js'
import './motion/smoothScroll.js'
import './motion/reveal.js'
import './motion/lazyVideo.js'
import './motion/sheen.js'
import './motion/heroVideo.js'
import './motion/mobileStage.js'
import './motion/navTheme.js'

/* Разворот «Ключевые цифры» больше не отдельная сцена: он слился с
   глобусом в единую прибитую сцену «О компании». Её ведёт собственный
   модуль scripts/aboutScene.js (карточки, ночь, набор строки) вместе
   с scripts/globeCanvas.js (земной шар) — оба на одном прогрессе. */
