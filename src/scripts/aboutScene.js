/* ─────────────────────────────────────────────
   СЦЕНА «О КОМПАНИИ» · оркестратор

   Одна сцена, всё движется одновременно по одному прогрессу прокрутки
   сквозь обёртку .atlas (0…1):

     карточка   листает три факта, по трети прокрутки на факт;
     ночь       0.12→0.85 — синяя заливка наливается прозрачностью слоя,
                весь путь, а не в самом конце: глобус «окрашивает» сцену
                по мере скролла, как в референсе;
     заголовок  на ~0.52 (ночь уже в силе) перекрашивается тёмный→светлый
                классом .is-night — иначе тёмный текст тонет в синеве.

   Земной шар живёт на том же прогрессе, но рисует его отдельный модуль
   (globeCanvas.js): three.js и .glb тяжёлые, им своя ленивая загрузка.
   Общий прогресс оба берут из scrollProgress.js — не разъезжаются.

   Хозяин фолбэка — этот модуль. Без WebGL, при reduced-motion или на
   экономном соединении прибивать сцену нечем: шар не рисуется. Тогда
   обёртка получает класс .is-static (CSS разворачивает её в обычный
   поток — заголовок и три факта списком), а globeCanvas.js по этому
   же классу не поднимает three.js вовсе.
   ───────────────────────────────────────────── */
import { makeProgress, span, offsetFor, clamp01 } from './scrollProgress.js'

const wrap = document.querySelector('[data-atlas]')
if (wrap) init(wrap)

function init(wrap) {
  const stage = wrap.querySelector('[data-atlas-stage]')
  const nightEl = wrap.querySelector('.atlas-night')
  const geoWords = [...wrap.querySelectorAll('[data-geo-word]')]
  const cards = [...wrap.querySelectorAll('[data-atlas-card]')]
  const countEl = wrap.querySelector('[data-atlas-count]')
  const prevBtn = wrap.querySelector('[data-atlas-prev]')
  const nextBtn = wrap.querySelector('[data-atlas-next]')
  const n = cards.length

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const conn = navigator.connection
  const frugal = !!conn && (conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || ''))

  const hasWebGL = () => {
    try {
      const c = document.createElement('canvas')
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
    } catch {
      return false
    }
  }

  /* Статичный режим. Класс ставится синхронно на загрузке модуля, до того
     как globeCanvas.js решит, поднимать ли three.js: тот сверяется именно
     с этим классом. Карточки в потоке — все видимы. */
  if (reduce || frugal || !hasWebGL()) {
    wrap.classList.add('is-static')
    cards.forEach((c) => { c.classList.add('is-on'); c.removeAttribute('inert'); c.removeAttribute('aria-hidden') })
    if (countEl) countEl.textContent = '01'
    return
  }

  /* ── Фазы, в долях общего прогресса ──
     CARD_END делит прокрутку на n равных ломтей — по ломтю на факт, во всю
     длину сцены (последний держится на финальной выдержке). Ночь наливается
     почти весь путь. Порог перекраски заголовка — там, где синевы уже
     достаточно, чтобы тёмный текст потерялся. */
  const CARD_END = 0.92
  const NIGHT_IN = 0.12
  /* Раньше 0.85: ночь догорала до полной темноты за 15% прогресса ДО
     конца .atlas, и весь этот хвост шёл без единого визуального
     изменения — шар и карточки уже показаны, текст уже добел, а скролл
     ещё оставался. Поднято к 0.9, вплотную к завершению разворота шара
     (см. GEO_END и GLOBE_END в globeCanvas.js) — ночь дотемняется тем же
     кадром, что и финал шара, и от него до конца обёртки остаётся только
     небольшая обоснованная пауза, а не мёртвая зона. */
  const NIGHT_FULL = 0.9
  const NIGHT_SWAP = 0.52   // порог перекраски заголовка в светлый
  /* Держать в паре с globeCanvas.js: там GLOBE_END=0.98 переводит общий
     прогресс p в свой gp (0…1), а разворот к России (turn) в этом gp
     заканчивается на 0.9. В координатах p это 0.98×0.9=0.882 — момент,
     когда шар зрительно уже полностью развёрнут и дальше просто держит
     кадр. Подпись должна дозаполниться добела ровно к этому кадру, а не
     к концу всей выдержки (дальше в p — уже пауза, в ней меняться нечему). */
  const GEO_END = 0.882

  const progress = makeProgress(wrap, stage)

  // индекс активного факта: [0..n-1], на финальной выдержке держим последний
  const indexAt = (p) => Math.min(n - 1, Math.max(0, Math.floor((p / CARD_END) * n)))

  let curIdx = -1
  let night = null   // состояние класса .is-night, чтобы не дёргать DOM зря

  const setCard = (i) => {
    if (i === curIdx) return
    curIdx = i
    cards.forEach((c, k) => {
      const on = k === i
      c.classList.toggle('is-on', on)
      c.toggleAttribute('inert', !on)
      c.setAttribute('aria-hidden', on ? 'false' : 'true')
    })
    if (countEl) countEl.textContent = String(i + 1).padStart(2, '0')
    if (prevBtn) prevBtn.disabled = i === 0
    if (nextBtn) nextBtn.disabled = i === n - 1
  }

  const draw = () => {
    const p = progress()

    // синева наливается прозрачностью слоя, покадрово по прокрутке
    nightEl.style.opacity = span(p, NIGHT_IN, NIGHT_FULL).toFixed(3)

    /* Строка про Россию заливается белым тем же прогрессом, что доворачивает
       шар — но не вся разом, а по словам: у слова i свой ломоть общего фила
       [i/n … (i+1)/n], внутри ломтя слово идёт от 0 до 1 (буква за буквой
       тем же clip-path, см. .atlas-geo-word). Слова строго по порядку —
       предыдущее уже добело, следующее ещё не начато. */
    const fill = span(p, 0, GEO_END)
    const wn = geoWords.length
    geoWords.forEach((w, i) => {
      w.style.setProperty('--w-fill', clamp01(fill * wn - i).toFixed(3))
    })

    // заголовок перекрашивается в светлый, когда синевы стало достаточно
    const isNight = p >= NIGHT_SWAP
    if (isNight !== night) {
      night = isNight
      stage.classList.toggle('is-night', isNight)
    }

    setCard(indexAt(p))
  }

  /* Один rAF на кадр, взведённый скроллом и ресайзом. Скролл ведёт Lenis
     (motion.js), но он шлёт нативные scroll-события — их и слушаем, не
     завязываясь на его инстанс. Считать в обработчике напрямую нельзя:
     на инерции событий десятки в кадр. */
  let raf = 0
  const schedule = () => {
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; draw() })
  }

  window.addEventListener('resize', schedule)

  /* Скролл слушаем только пока сцена на экране — обычная экономия на
     длинной странице: за её пределами прогресс всё равно упёрт в 0 или 1
     и пересчитывать нечего. */
  let listening = false
  const listen = (on) => {
    if (on === listening) return
    listening = on
    const m = on ? 'addEventListener' : 'removeEventListener'
    window[m]('scroll', schedule, { passive: true })
  }
  new IntersectionObserver(
    (entries) => entries.forEach((e) => { listen(e.isIntersecting); if (e.isIntersecting) schedule() }),
    { threshold: 0 },
  ).observe(wrap)

  /* ── Стрелки листания ──
     Кнопки не переключают факт сами: тогда на странице было бы два
     источника правды о текущем факте, и следующий сдвиг скролла вернул
     бы свой. Вместо этого они увозят страницу в середину нужного ломтя
     той же прокрутки — факт меняет всё тот же прогресс. */
  const goTo = (i) => {
    const target = Math.min(n - 1, Math.max(0, i))
    const p = (target + 0.5) / n * CARD_END
    const top = offsetFor(wrap, stage, p)
    window.scrollTo({ top, behavior: 'smooth' })
  }
  prevBtn?.addEventListener('click', () => goTo(curIdx - 1))
  nextBtn?.addEventListener('click', () => goTo(curIdx + 1))

  draw()
  window.addEventListener('load', schedule)
}
