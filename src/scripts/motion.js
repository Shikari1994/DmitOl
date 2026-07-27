/* ─────────────────────────────────────────────
   Глобальная анимация страницы (вне React) — BARREL.
   Прежде один файл на 389 строк; теперь по одному
   модулю на приём в motion/*, а здесь — только
   порядок их запуска.

   Порядок @import НИЖЕ повторяет прежнюю очерёдность
   блоков в монолите один-в-один и МЕНЯТЬ ЕГО НЕЛЬЗЯ:
   env ставит ScrollTrigger.config и общий reduce для
   всех; reveal в конце делает ScrollTrigger.refresh(),
   который в исходнике шёл до sheen/scrollspy/mobile —
   очерёдность модулей это сохраняет.

   Скролл-приём на странице один — прибитая сцена
   «О компании». Hero статичный: выезд предметов
   в его плитках идёт разово на загрузке, без
   привязки к скроллу (см. motion/heroVideo.js). */
import './motion/env.js'
import './motion/smoothScroll.js'
import './motion/reveal.js'
import './motion/lazyVideo.js'
import './motion/sheen.js'
import './motion/scrollspy.js'
import './motion/heroVideo.js'
import './motion/mobileStage.js'
import './motion/navTheme.js'

/* Разворот «Ключевые цифры» больше не отдельная сцена: он слился с
   глобусом в единую прибитую сцену «О компании». Её ведёт собственный
   модуль scripts/aboutScene.js (карточки, ночь, набор строки) вместе
   с scripts/globeCanvas.js (земной шар) — оба на одном прогрессе. */
