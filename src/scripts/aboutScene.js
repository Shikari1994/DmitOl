/* ─────────────────────────────────────────────
   СЦЕНА «О КОМПАНИИ» · оркестратор

   Одна сцена, всё движется одновременно по одному прогрессу прокрутки
   сквозь обёртку .atlas (0…1):

     услуги     плашки выезжают из-за правой кромки по одной, сверху
                вниз, по ломтю прокрутки на плашку;
     ночь       заливка наливается прозрачностью слоя весь путь, а не в
                конце: шар «окрашивает» сцену по мере скролла;
     заголовок  перекрашивается тёмный→светлый классом .is-night, когда
                ночи достаточно, чтобы тёмный текст в ней потерялся.

   Земной шар живёт на том же прогрессе, но рисует его отдельный модуль
   (globeCanvas.js) — three.js тяжёлый, ему своя ленивая загрузка. Общий
   прогресс оба берут из scrollProgress.js, поэтому не разъезжаются.

   ХОЗЯИН ФОЛБЭКА — этот модуль: без WebGL, при reduced-motion или на
   экономном соединении он вешает .is-static (CSS разворачивает сцену в
   обычный поток), а globeCanvas.js по тому же классу не поднимает
   three.js вовсе.
   ───────────────────────────────────────────── */
import { makeProgress, span, smooth, clamp01 } from './scrollProgress.js'

const wrap = document.querySelector('[data-atlas]')
if (wrap) init(wrap)

function init(wrap) {
  const stage = wrap.querySelector('[data-atlas-stage]')
  const nightEl = wrap.querySelector('.atlas-night')
  const geoWords = [...wrap.querySelectorAll('[data-geo-word]')]
  const facts = [...wrap.querySelectorAll('[data-atlas-fact]')]
  const deck = wrap.querySelector('.atlas-deck')
  const items = [...wrap.querySelectorAll('[data-atlas-item]')]
  const copyEl = wrap.querySelector('.atlas-copy')
  const geoEl = wrap.querySelector('[data-atlas-geo]')
  const n = items.length
  const factsN = facts.length

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
     с этим классом. Пункты в потоке — все видимы (--r снимает CSS). */
  if (reduce || frugal || !hasWebGL()) {
    wrap.classList.add('is-static')
    return
  }

  /* ── Фазы, в долях общего прогресса ──
     LIST_IN…LIST_END — выезд плашек, по ломтю прокрутки на плашку.
     Первая трогается там же, где шар выходит из-за нижней кромки
     (RISE_END в globeCanvas.js — в этих координатах ≈0.29): колонка
     собирается вместе с ростом шара, а не после него. */
  const KICKER_IN = 0.02
  const KICKER_ON = 0.1
  const LIST_IN = 0.06
  const LIST_END = 0.86
  const NIGHT_IN = 0.12
  /* Вплотную к завершению разворота шара (см. GEO_END ниже и GLOBE_END в
     globeCanvas.js): ночь дотемняется тем же кадром, что и финал шара.
     Ниже — и остаток прокрутки идёт без единого визуального изменения. */
  const NIGHT_FULL = 0.9
  const NIGHT_SWAP = 0.52   // порог перекраски заголовка в светлый
  /* ДЕРЖАТЬ В ПАРЕ с globeCanvas.js: 0.882 = GLOBE_END (0.98) × конец
     разворота в его координатах (0.9) — момент, когда шар уже полностью
     развёрнут и дальше просто держит кадр. Строка обязана дозаполниться
     добела ровно к нему, а не к концу выдержки. */
  const GEO_END = 0.882

  const progress = makeProgress(wrap, stage)

  /* Верх колонки услуг = верхняя кромка ПРОПИСНЫХ в заголовке слева.
     Меряем живьём, а не константой в CSS: высота строки рубрики над ним
     складывается из кегля, интерлиньяжа и метрик шрифта, и любое число
     промахнётся при смене шкалы или веб-шрифта.

     Одного offsetTop мало — он даёт верх СТРОЧНОГО БОКСА, а у крупного
     заголовка над буквами остаётся полоса выносного пространства в
     полтора десятка пикселей. У мелкой подписи она почти нулевая, и
     подпись встаёт заметно выше первой строки заголовка. Поэтому обе
     строки приводим к верху прописной, считая метрики шрифта через
     canvas: у каждой гарнитуры своя высота выносных. */
  const capOffset = (el) => {
    const cs = getComputedStyle(el)
    const ctx = capOffset.ctx || (capOffset.ctx = document.createElement('canvas').getContext('2d'))
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const m = ctx.measureText('Н')
    const box = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent
    if (!box || !m.actualBoundingBoxAscent) return 0   // метрик нет — выравниваем по боксу
    const lh = cs.lineHeight === 'normal' ? box : parseFloat(cs.lineHeight)
    // базовая линия внутри строки, минус подъём прописной над ней
    return (lh - box) / 2 + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent
  }

  const syncDeckTop = () => {
    if (!copyEl || !geoEl || !deck) return
    const kicker = deck.querySelector('.atlas-deck-kicker')
    const shift = kicker ? capOffset(geoEl) - capOffset(kicker) : 0
    stage.style.setProperty('--deck-top', `${copyEl.offsetTop + geoEl.offsetTop + shift}px`)
  }
  syncDeckTop()
  document.fonts?.ready.then(syncDeckTop)

  let night = null   // состояние класса .is-night, чтобы не дёргать DOM зря

  const draw = () => {
    const p = progress()

    // синева наливается прозрачностью слоя, покадрово по прокрутке
    nightEl.style.opacity = span(p, NIGHT_IN, NIGHT_FULL).toFixed(3)

    /* Строка заливается белым тем же прогрессом, что доворачивает шар,
       но не вся разом, а по словам: у слова i свой ломоть общего фила,
       внутри него слово идёт от 0 до 1 буква за буквой (clip-path, см.
       .atlas-geo-word). Строго по порядку — предыдущее уже добело,
       следующее ещё не начато. */
    const fill = span(p, 0, GEO_END)
    const wn = geoWords.length
    geoWords.forEach((w, i) => {
      w.style.setProperty('--w-fill', clamp01(fill * wn - i).toFixed(3))
    })

    /* Факты слева — не отдельный таймлайн: их смена идёт по тому же
       прогрессу, что и выход правой колонки. Небольшое перекрытие делает
       переход читабельным и при прокрутке в любую сторону. */
    const FACTS_IN = 0.06
    const factStep = (LIST_END - FACTS_IN) / factsN
    facts.forEach((fact, i) => {
      const inAt = FACTS_IN + i * factStep
      const outAt = FACTS_IN + (i + 1) * factStep
      const entering = i === 0 ? 1 : smooth(span(p, inAt, inAt + 0.08))
      const leaving = i === factsN - 1 ? 1 : 1 - smooth(span(p, outAt - 0.08, outAt))
      fact.style.setProperty('--fact', Math.min(entering, leaving).toFixed(3))
    })

    // заголовок перекрашивается в светлый, когда синевы стало достаточно
    const isNight = p >= NIGHT_SWAP
    if (isNight !== night) {
      night = isNight
      stage.classList.toggle('is-night', isNight)
    }

    // подпись колонки встаёт первой и без выезда — к ней приезжают плашки
    if (deck) deck.style.setProperty('--in', span(p, KICKER_IN, KICKER_ON).toFixed(3))

    /* Услуги: у плашки i свой ломоть прокрутки [i/n … (i+1)/n], но едет
       она не всю его длину — множитель 1.8 укладывает выезд в первую
       половину, дальше плашка просто стоит. Иначе колонка ехала бы вся
       разом, без пауз между появлениями. smooth даёт торможение у цели.
       Приехавшее не уходит: к финалу сцены колонка стоит целиком. */
    const shown = span(p, LIST_IN, LIST_END) * n
    items.forEach((el, i) => {
      el.style.setProperty('--r', smooth(clamp01((shown - i) * 1.8)).toFixed(3))
    })
  }

  /* Один rAF на кадр, взведённый скроллом и ресайзом. Скролл ведёт
     Lenis, но он шлёт нативные scroll-события — слушаем их, не
     завязываясь на инстанс. Считать прямо в обработчике нельзя: на
     инерции событий десятки в кадр. */
  let raf = 0
  const schedule = () => {
    if (raf) return
    raf = requestAnimationFrame(() => { raf = 0; draw() })
  }

  window.addEventListener('resize', () => { syncDeckTop(); schedule() })

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

  draw()
  window.addEventListener('load', () => { syncDeckTop(); schedule() })
}
