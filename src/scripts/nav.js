/* ─────────────────────────────────────────────
   Поведение шапки — ванильный порт Nav.jsx.

   Раньше ради этих двух вещей (класс .scrolled и
   бургер) на клиент уезжал весь React — 136 КБ
   на критическом пути ради ~15 строк логики.
   Разметку Nav по-прежнему рисует тот же .jsx,
   но на сервере: HTML выходит байт-в-байт тем же,
   что давал первый рендер React, поэтому вид и
   поведение не изменились.

   Скрипт отдельный, а не внутри motion.js: тот
   тянет Lenis и GSAP, и бургер ждал бы разбора
   137 КБ, прежде чем начать нажиматься.
   ───────────────────────────────────────────── */

const nav = document.querySelector('nav.nav')
const burger = document.querySelector('.nav-burger')
const menu = document.querySelector('.nav-mobile')

/* ─── Класс .scrolled после 40px ───
   Порог и момент срабатывания те же, что были в React-версии: класс
   ставится синхронно в обработчике. Откладывать его до кадра анимации
   пробовали — шапка меняла фон на кадр позже прокрутки, и на быстром
   жесте это было заметно; сама операция (чтение scrollY и toggle)
   несопоставимо дешевле перерисовки компонента, ради которой здесь
   раньше держался React. Слушатель пассивный — прокрутку не тормозит. */
if (nav) {
  /* Настоящая высота шапки → --nav-h (см. index.css): читаем её тут же,
     а не держим в CSS числом-догадкой на каждый брейкпоинт — на 1200px
     раскладка меняется (часы+кнопка ↔ бургер), и высота вместе с ней. */
  const setNavHeight = () => {
    document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px')
  }
  const apply = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40)
    setNavHeight()
  }
  window.addEventListener('scroll', apply, { passive: true })
  window.addEventListener('resize', setNavHeight)
  apply()
}

/* ─── Мобильное меню ───
   Состояние держим одной переменной и синхронизируем ровно те же
   атрибуты, что проставлял React: класс .open на бургере и на панели,
   .menu-open на body (его слушает CSS, блокируя прокрутку под меню),
   aria-expanded, aria-label и aria-hidden. */
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

  // клик в любом месте панели закрывает её — включая ссылки,
  // как и было в React-версии (onClick висел на всём контейнере)
  menu.addEventListener('click', () => {
    if (!open) return
    open = false
    sync()
  })

  // Esc закрывает меню: клавиатурный выход в React-версии отсутствовал,
  // но открытая панель на весь экран без него — ловушка для фокуса
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      open = false
      sync()
      burger.focus()
    }
  })
}

/* ─── Тумблер светлой/тёмной схемы ───
   Атрибут html[data-scheme] уже стоит — его синхронно поставил inline-
   скрипт в Layout.astro (см. там же, до первой отрисовки). Здесь только
   клик и синхронизация двух копий кнопки (шапка + мобильное меню, см.
   Nav.astro) через общий класс, без собственного состояния каждой. */
{
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
    const tick = () => {
      const t = new Date().toLocaleTimeString('ru-RU', {
        timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
      clock.textContent = 'МОСКВА · ' + t
    }
    tick()
    setInterval(tick, 1000)
  }
}

/* ─── Scrollspy: активный пункт меню под текущим разделом ───
   Тот же приём, что перекрашивает шапку под тему секции в motion.js:
   полоска наблюдения схлопнута к верхней кромке экрана — «активна»
   ровно та секция, что сейчас идёт под шапкой. Отдельный наблюдатель,
   а не переиспользование того же в motion.js: nav.js грузится первым,
   до разбора Lenis и GSAP, и бургер не должен ждать несвязанный модуль
   ради подсветки пункта меню. */
{
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')]
  const sections = []
  const linkFor = new Map()
  links.forEach((a) => {
    const el = document.getElementById(a.getAttribute('href').slice(1))
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
