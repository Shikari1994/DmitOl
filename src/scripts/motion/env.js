/* ─────────────────────────────────────────────
   Общая среда движения (импортируется первой).
   Регистрирует ScrollTrigger и держит ЕДИНЫЙ ЯЗЫК
   ДВИЖЕНИЯ на весь сайт:
     EASE   — power3.out и только он; ничего
              упругого, никаких bounce/elastic
     reduce — уважение к prefers-reduced-motion:
              один расчёт на все модули motion/*
   Значения времени (0.3/0.6/1.0 c) живут по месту
   в модулях — здесь только то, что общее всем.
   ───────────────────────────────────────────── */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ─── Мобильный ресайз не считаем ресайзом ───
   Показ и скрытие адресной строки шлют resize, хотя раскладка не
   изменилась ни на пиксель. Без этого флага каждый такой жест
   пересчитывает все триггеры ПОСРЕДИ прокрутки, и липкая сцена
   «О компании» дёргается. */
ScrollTrigger.config({ ignoreMobileResize: true })

export const EASE = 'power3.out'

export const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
