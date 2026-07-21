/* ─────────────────────────────────────────────
   Глобальная анимация страницы (вне React):
   инерционный скролл Lenis, синхронизация со
   ScrollTrigger, появление .reveal, активация
   шагов и прогресс-линия в How, разворот
   «Ключевые цифры».

   ЕДИНЫЙ ЯЗЫК ДВИЖЕНИЯ (одна шкала на весь сайт):
     ease   — power3.out и только он; ничего
              упругого, никаких bounce/elastic
     0.3 c  — микро-отклик (подмена значения)
     0.6 c  — появление элемента
     1.0 c  — крупный жест
   Скролл-приём на странице один — прибитая сцена
   «О компании». Hero статичный: выезд предметов
   в его плитках идёт разово на загрузке, без
   привязки к скроллу (см. блок HERO ниже).
   ───────────────────────────────────────────── */
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/* ─── Мобильный ресайз не считаем ресайзом ───
   Показ и скрытие адресной строки в мобильном браузере шлют resize, хотя
   раскладка не изменилась ни на пиксель. Без этого флага каждый такой
   жест вызывает пересчёт всех триггеров ПОСРЕДИ прокрутки, и липкая
   сцена «О компании» (карточки, глобус) дёргается. */
ScrollTrigger.config({ ignoreMobileResize: true })

const EASE = 'power3.out'

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ─── Инерционный скролл + якорные ссылки ─── */
if (!reduce) {
  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  })

  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]')
    if (!a) return
    const id = a.getAttribute('href')
    if (id.length > 1) {
      e.preventDefault()
      lenis.scrollTo(id, { offset: -70 })
    }
  })
}

/* ─── Появление .reveal + шаги + прогресс ─── */
if (reduce) {
  gsap.set('.reveal', { opacity: 1, y: 0 })
} else {
  // сдержанное появление: короткий сдвиг и почти синхронный выход группы
  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: EASE,
        stagger: 0.05,
        overwrite: true,
      }),
  })

  // прогресс-линия "Как работает": высота заливки = прогресс скролла сквозь
  // блок шагов (start..end), привязанный к ScrollTrigger — устойчиво к pin
  // соседних секций, ресайзу и дозагрузке картинок.
  // Узел «загорается» не по своему отдельному триггеру, а строго в момент,
  // когда точка на конце заливки поравнялась с его центром — одна точка
  // отсчёта на оба эффекта, поэтому подсветка не может разъехаться с линией.
  const fill = document.querySelector('.how-line-fill')
  const line = document.querySelector('.how-line')
  const steps = document.querySelector('.steps')
  const done = document.querySelector('.how-done')
  const stepEls = steps ? Array.from(steps.querySelectorAll('.step')) : []
  const nodes = steps ? steps.querySelectorAll('.step-node') : []
  if (fill && line && steps && nodes.length) {
    // трек и заливка идут от центра первого узла до центра последнего
    let topY = 0
    let span = 0
    let offsets = []
    const layout = () => {
      const sr = steps.getBoundingClientRect()
      const first = nodes[0].getBoundingClientRect()
      const last = nodes[nodes.length - 1].getBoundingClientRect()
      topY = first.top - sr.top + first.height / 2
      span = last.top - sr.top + last.height / 2 - topY
      offsets = Array.from(nodes).map((n) => {
        const r = n.getBoundingClientRect()
        return r.top - sr.top + r.height / 2 - topY
      })
      gsap.set(line, { top: topY, bottom: 'auto', height: span })
      gsap.set(fill, { top: topY })
    }
    layout()
    ScrollTrigger.create({
      trigger: steps,
      // «линия сканирования» на 60% экрана: 0 — когда верх шагов на ней,
      // 1 — когда низ шагов её прошёл
      start: 'top 60%',
      end: 'bottom 60%',
      onRefresh: layout,
      onUpdate: (self) => {
        const fillHeight = span * self.progress
        gsap.set(fill, { height: fillHeight })
        stepEls.forEach((step, i) => {
          step.classList.toggle('is-visible', fillHeight >= offsets[i])
        })
        // достигли низа блока → состояние «цель достигнута»
        const complete = self.progress > 0.985
        steps.classList.toggle('is-complete', complete)
        if (done) done.classList.toggle('show', complete)
      },
    })
  }

  ScrollTrigger.refresh()
  // пересчёт после загрузки изображений, чтобы триггеры не съезжали
  window.addEventListener('load', () => ScrollTrigger.refresh())
}

/* ─── Ленивое видео в плитке (тяжёлый файл грузим только у вьюпорта) ───
   src проставляется при подходе к экрану, не на загрузке страницы.
   При reduced-motion видео не грузим — остаётся постер-скриншот. */
{
  const vids = document.querySelectorAll('video[data-lazy-video]')

  /* Ролики фактурой весят около 9,5 МБ на двоих. На экономии трафика и на
     медленном соединении это заметная плата за подложку, которая идёт под
     заливкой с прозрачностью 0.22: вместо видео там остаётся постер —
     тот же кадр, только статичный, и раздел выглядит так же. */
  const conn = navigator.connection
  const frugal = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || ''))

  if (vids.length && !reduce && !frugal && 'IntersectionObserver' in window) {
    const load = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const v = e.target
        if (!v.src) { v.src = v.dataset.lazyVideo; v.load() }
        obs.unobserve(v)
      })
    }, { rootMargin: '300px' })

    /* Ролики с постером (вкладки Drill Monitor — Инклинометрия, Каротаж)
       сперва показывают статичный скриншот и только через 3 секунды
       переключаются на видео: сравнение «скрин → ролик» читается лучше,
       чем ролик, стартующий мгновенно поверх ещё не увиденного кадра. */
    const POSTER_DELAY = 3000
    const playTimers = new WeakMap()

    // играем только пока плитка видна — экономим CPU/батарею
    const play = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target
        if (e.isIntersecting) {
          if (v.poster && !v.dataset.posterShown) {
            if (!playTimers.has(v)) {
              const t = setTimeout(() => {
                v.dataset.posterShown = 'true'
                v.play?.().catch(() => {})
              }, POSTER_DELAY)
              playTimers.set(v, t)
            }
          } else {
            v.play?.().catch(() => {})
          }
        } else {
          v.pause?.()
          if (playTimers.has(v)) { clearTimeout(playTimers.get(v)); playTimers.delete(v) }
        }
      })
    }, { threshold: 0.25 })

    vids.forEach((v) => { load.observe(v); play.observe(v) })
  }
}

/* ─── scrollspy ───
   Магнитные CTA и spotlight-граница убраны: игривая микро-механика
   спорит с промышленным тоном. Отклик на нажатие остался, но чисто
   на CSS (:active) — без слежения за курсором. */
if (!reduce) {
  document.querySelectorAll('section[id]').forEach((sec) => {
    const link = document.querySelector(`.nav-links a[href="#${sec.id}"]`)
    if (!link) return
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 45%',
      end: 'bottom 45%',
      onToggle: (self) => link.classList.toggle('active', self.isActive),
    })
  })
}

/* ─── HERO: запуск видео-фона ───
   Плитки справа (ноутбук+телефон, снаряд из двух модулей) в покое
   пустые и выезжают по наведению — это чистый CSS (:hover/:focus-visible
   на .hero-tile-art в index.css), JS им не нужен.

   Видео явно запускаем из JS, а не атрибутом autoplay в разметке — тогда
   при reduced-motion ролик ни на кадр не тронется, а не «поиграл и
   встал»: play() просто не вызывается. */
const heroVideo = document.querySelector('[data-hero-video]')
if (heroVideo && !reduce) heroVideo.play?.().catch(() => {})

/* ─── Мобильный клиент: ряд аппаратов выходит снизу ───
   Приём первоисточника: не общий сдвиг ряда, а РАЗНАЯ скорость у среднего
   и боковых. Одна скорость на всех дала бы картинку, которая просто едет;
   разная — сцену, которая собирается по мере подхода.

   Окно — подход секции к экрану: старт, когда верх сцены входит снизу,
   финиш, когда её низ садится на нижнюю кромку. К моменту, когда ряд
   прочитан целиком, движение уже закончено — дальше он стоит.

   scrub с задержкой, а не жёсткий: ряд идёт чуть мягче колеса, и это
   единственное место на странице, где инерция уместна — предметы
   тяжёлые и должны догонять скролл, а не быть приклеенными к нему. */
if (!reduce) {
  const stage = document.querySelector('[data-mob-stage]')
  const phones = stage ? gsap.utils.toArray('[data-mob-phone]', stage) : []
  /* На узком экране ряд стоит веером внахлёст (боковые заходят за средний
     отрицательными полями). Разводить их там ещё и по горизонтали нельзя —
     перекрытие, на котором держится вся композиция, разъедется. Поэтому
     широкий экран получает полный сбор веера, узкий — только вертикаль. */
  const fan = window.matchMedia('(min-width: 601px)').matches

  phones.forEach((el, i) => {
    // 0 — средний (ближний план, короткий ход), 1 — боковые
    const depth = Number(el.dataset.depth) || 0
    // −1 левый, 0 средний, +1 правый: знак разводит боковые в свои стороны
    const side = depth === 0 ? 0 : i === 0 ? -1 : 1

    /* Ряд не просто едет вверх — он СОБИРАЕТСЯ. Боковые стартуют ниже,
       ближе к центру, чуть завалены на средний и мельче: пока идёт скролл,
       веер раскрывается, аппараты выравниваются и выходят на свой размер.
       Средний почти на месте с самого начала — он ось сцены, вокруг него
       и происходит сборка.

       Пивот у основания корпуса: аппараты стоят на полу сцены и клонятся
       как предметы, а не крутятся вокруг своей середины. */
    gsap.fromTo(
      el,
      {
        yPercent: 8 + depth * 26,
        xPercent: fan ? side * -9 : 0,
        rotate: fan ? side * -5 : 0,
        scale: 1 - depth * 0.07,
      },
      {
        yPercent: 0,
        xPercent: 0,
        rotate: 0,
        scale: 1,
        transformOrigin: '50% 100%',
        /* Средний приходит раньше боковых и притормаживает у места, боковые
           дособираются линейно — отсюда ощущение, что ряд живой, а не едет
           одним куском. */
        ease: depth === 0 ? 'power2.out' : 'none',
        scrollTrigger: {
          trigger: stage,
          start: 'top bottom',
          end: 'bottom bottom',
          /* разный scrub — разная инерция: боковые тяжелее и заметнее
             догоняют колесо, средний держится ближе к скроллу */
          scrub: depth === 0 ? 0.45 : 1,
          invalidateOnRefresh: true,
        },
      },
    )

    /* Второй такт: когда секция уходит вверх, ряд не замирает намертво —
       средний чуть отстаёт от скролла, боковые чуть обгоняют. Расхождение
       мелкое (единицы процентов), но пока сцена на экране, она продолжает
       дышать, а не превращается в статичный кадр.

       Цель — картинка внутри figure, а не сама figure: два scrub-твина на
       одном yPercent спорили бы на стыке окон (у обоих своя задержка), а
       так сборка живёт на обёртке, дрейф — на вложенном узле, и они друг
       друга не трогают. */
    gsap.to(el.querySelector('img'), {
      yPercent: depth === 0 ? 4 : -5,
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: 'bottom bottom',
        end: 'bottom top',
        scrub: depth === 0 ? 0.45 : 1,
        invalidateOnRefresh: true,
      },
    })
  })
}

/* ─── Шапка перенимает тему секции, проходящей под ней ───
   rootMargin схлопывает область наблюдения до полоски у верхней
   кромки экрана: «видимой» считается ровно та секция, что сейчас
   под шапкой. Работает и при reduced-motion — это не анимация,
   а читаемость текста на меняющемся фоне.

   На стыке секций полоску на мгновение пересекают сразу две — верхняя
   из видимых берётся по DOM-порядку (последняя = рисуется поверх).
   Реагировать на каждое событие по отдельности здесь нельзя — секция,
   переставшая пересекать полоску, события не шлёт, и на обратном
   скролле шапка застревала бы в чужой теме. */
{
  const nav = document.querySelector('nav.nav')
  const themed = [...document.querySelectorAll('[data-theme]')]
  if (nav && themed.length && 'IntersectionObserver' in window) {
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
        for (let i = themed.length - 1; i >= 0; i--) {
          if (visible.has(themed[i])) {
            nav.setAttribute('data-theme', themed[i].dataset.theme)
            break
          }
        }
      },
      { rootMargin: '0px 0px -100% 0px', threshold: 0 },
    )
    themed.forEach((s) => io.observe(s))
  }
}

/* ─── Бесконечные ленты (.marquee) ───
   Список клонируется, обе копии едут встык — шов не виден.
   Скорость привязана к ширине, чтобы длинные и короткие ленты
   двигались одинаково; за пределами экрана анимация на паузе. */
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

/* Разворот «Ключевые цифры» больше не отдельная сцена: он слился с
   глобусом в единую прибитую сцену «О компании». Её ведёт собственный
   модуль scripts/aboutScene.js (карточки, ночь, набор строки) вместе
   с scripts/globeCanvas.js (земной шар) — оба на одном прогрессе. */
