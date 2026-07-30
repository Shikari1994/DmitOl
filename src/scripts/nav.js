/* ─────────────────────────────────────────────
   Поведение шапки: класс .scrolled, бургер,
   тумблер схемы, часы и scrollspy.

   Скрипт отдельный, а не внутри motion.js: тот
   тянет Lenis и GSAP, и бургер ждал бы разбора
   137 КБ, прежде чем начать нажиматься.
   ───────────────────────────────────────────── */

import { ENABLE_LIGHT_THEME } from '../lib/flags.js'

const nav = document.querySelector('nav.nav')
const burger = document.querySelector('.nav-burger')
const menu = document.querySelector('.nav-mobile')

/* ─── Класс .scrolled после 40px ───
   Ставится синхронно в обработчике, а не в кадре анимации: с rAF шапка
   меняет фон на кадр позже прокрутки, и на быстром жесте это заметно.
   Слушатель пассивный, прокрутку не тормозит. */
if (nav) {
  /* Настоящая высота шапки → --nav-h: читаем живьём, а не держим в CSS
     числом на каждый брейкпоинт — на 1200px раскладка меняется
     (часы+кнопка ↔ бургер), и высота вместе с ней.

     НЕ НА КАЖДЫЙ СКРОЛЛ: пара «читаем offsetHeight → пишем свойство в
     documentElement» — это принудительный layout плюс инвалидация
     стилей ВСЕГО документа (--nav-h читают и section[id], и .hero-intro,
     и боковая панель). На скролле это полный recalc дерева 60–144 раза
     в секунду. Замеры нужны только при ресайзе и те 0.4 секунды, пока
     идёт transition паддинга шапки. */
  const root = document.documentElement
  let navH = -1
  const setNavHeight = () => {
    const h = nav.offsetHeight
    if (h === navH) return
    navH = h
    root.style.setProperty('--nav-h', h + 'px')
  }

  /* Пока шапка сжимается, высоту читаем каждый кадр: от --nav-h зависит
     верхний отступ hero, и обнови мы свойство разом по окончании
     перехода — контент первого экрана дёрнулся бы на всю разницу
     паддингов вместо того, чтобы ехать вместе с шапкой. Цикл живёт
     ровно длительность перехода и гаснет. */
  const TRACK_MS = 480
  let trackUntil = 0
  let trackRaf = 0
  const track = () => {
    setNavHeight()
    trackRaf = performance.now() < trackUntil ? requestAnimationFrame(track) : 0
  }

  /* На скролле — только чтение scrollY и сравнение с прошлым состоянием.
     Ни layout, ни записи в стили: класс переключается лишь в момент
     перехода через порог (toggle тем же значением всё равно
     инвалидировал бы стили шапки). */
  let scrolled = window.scrollY > 40
  nav.classList.toggle('scrolled', scrolled)
  setNavHeight()

  const apply = () => {
    const on = window.scrollY > 40
    if (on === scrolled) return
    scrolled = on
    nav.classList.toggle('scrolled', on)
    trackUntil = performance.now() + TRACK_MS
    if (!trackRaf) trackRaf = requestAnimationFrame(track)
  }
  window.addEventListener('scroll', apply, { passive: true })
  window.addEventListener('resize', setNavHeight)
}

/* ─── Мобильное меню ───
   Состояние — одна переменная, sync() держит по ней всё разом: .open на
   бургере и панели, .menu-open на body (его слушает CSS, блокируя
   прокрутку под меню), aria-expanded, aria-label и aria-hidden. */
if (burger && menu) {
  let open = false

  const sync = () => {
    burger.classList.toggle('open', open)
    burger.setAttribute('aria-expanded', String(open))
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню')
    menu.classList.toggle('open', open)
    menu.setAttribute('aria-hidden', String(!open))
    document.body.classList.toggle('menu-open', open)
  }

  burger.addEventListener('click', () => {
    open = !open
    sync()
  })

  // клик в любом месте панели закрывает её, включая ссылки
  menu.addEventListener('click', () => {
    if (!open) return
    open = false
    sync()
  })

  // без Esc открытая панель на весь экран — ловушка для фокуса
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      open = false
      sync()
      burger.focus()
    }
  })
}

/* ─── Тумблер светлой/тёмной схемы ───
   Сам атрибут html[data-scheme] уже стоит: его синхронно поставил inline-
   скрипт в Layout.astro до первой отрисовки. Здесь только клик и
   синхронизация обеих копий кнопки (шапка + мобильное меню) через общий
   класс, без своего состояния у каждой.

   Под флагом (см. lib/flags.js): с выключенной светлой схемой кнопок в
   разметке нет, и блок отработал бы впустую — а так Vite выкидывает его
   из бандла целиком по константе. */
if (ENABLE_LIGHT_THEME) {
  const KEY = 'gtn-theme'
  const root = document.documentElement
  const buttons = [...document.querySelectorAll('.theme-toggle')]
  const metaThemeColor = document.getElementById('theme-color-meta')
  const COLOR = { dark: '#141414', light: '#eef0f3' }

  const reflect = () => {
    const scheme = root.getAttribute('data-scheme') === 'light' ? 'light' : 'dark'
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(scheme === 'light')))
    if (metaThemeColor) metaThemeColor.setAttribute('content', COLOR[scheme])
  }
  reflect()

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-scheme') === 'light' ? 'dark' : 'light'
      root.setAttribute('data-scheme', next)
      try {
        localStorage.setItem(KEY, next)
      } catch (e) {}
      reflect()
    })
  })
}

/* ─── Часы (МСК) в шапке ───
   Реальное время, не заглушка: буровая, диспетчерская и офис в разных
   часовых поясах, единый ориентир на шапке экономит вопрос «сколько
   там сейчас». Формат совпадает с остальными readout'ами сайта —
   табличные цифры, чтобы строка не «дышала» посекундно. */
{
  const clock = document.getElementById('nav-clock')
  if (clock) {
    /* Форматтер строится ОДИН раз, а не на каждый тик: у
       toLocaleTimeString с теми же опциями разбор локали и часового
       пояса повторяется ежесекундно. Строка на выходе та же. */
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const tick = () => {
      clock.textContent = 'МОСКВА · ' + fmt.format(new Date())
    }
    tick()
    setInterval(tick, 1000)
  }
}

/* ─── Scrollspy: активный пункт меню под текущим разделом ───
   Тот же приём, что перекрашивает шапку под тему секции
   (motion/navTheme.js): полоска наблюдения схлопнута к верхней кромке
   экрана — «активна» ровно та секция, что сейчас идёт под шапкой.
   Живёт здесь, а не в motion/*: nav.js грузится первым, до разбора
   Lenis и GSAP, и подсветка пункта меню не должна ждать несвязанный
   модуль.

   2026-07-28: это ЕДИНСТВЕННЫЙ scrollspy шапки. Раньше рядом работал
   второй, на ScrollTrigger с порогом 45%, и оба тоглили .active на одних
   ссылках — подсветка доставалась тому, кто сработал последним.

   Хэш читаем через a.href (свойство, браузер отдаёт абсолютный URL), а
   не getAttribute: ссылки шапки вида '/#about', а не голого '#about'.
   На страницах товара этих секций в DOM нет — sections останется пустым
   и обсервер не запустится, это ожидаемо. */
{
  const links = [...document.querySelectorAll('.nav-links a[href*="#"]')]
  const sections = []
  const linkFor = new Map()
  links.forEach((a) => {
    const el = document.getElementById(a.href.split('#')[1])
    if (el) {
      sections.push(el)
      linkFor.set(el, a)
    }
  })

  if (sections.length && 'IntersectionObserver' in window) {
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
        // последняя по DOM среди видимых — секция под шапкой прямо сейчас
        for (let i = sections.length - 1; i >= 0; i--) {
          if (visible.has(sections[i])) {
            links.forEach((a) => a.classList.remove('active'))
            linkFor.get(sections[i]).classList.add('active')
            break
          }
        }
      },
      { rootMargin: '0px 0px -100% 0px', threshold: 0 },
    )
    sections.forEach((s) => io.observe(s))
  }
}
