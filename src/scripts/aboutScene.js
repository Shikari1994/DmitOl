/* ─────────────────────────────────────────────
   СЦЕНА «О КОМПАНИИ» · оркестратор

   Одна сцена, всё движется одновременно по одному прогрессу прокрутки
   сквозь обёртку .atlas (0…1):

     услуги     плашки выезжают из-за правой кромки по одной, сверху
                вниз, по ломтю прокрутки на плашку;
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
   поток — заголовок и услуги списком), а globeCanvas.js по этому
   же классу не поднимает three.js вовсе.
   ───────────────────────────────────────────── */
import { makeProgress, span, smooth, clamp01 } from './scrollProgress.js'

const wrap = document.querySelector('[data-atlas]')
if (wrap) init(wrap)

function init(wrap) {
  const stage = wrap.querySelector('[data-atlas-stage]')
  const nightEl = wrap.querySelector('.atlas-night')
  const geoWords = [...wrap.querySelectorAll('[data-geo-word]')]
  const deck = wrap.querySelector('.atlas-deck')
  const items = [...wrap.querySelectorAll('[data-atlas-item]')]
  const copyEl = wrap.querySelector('.atlas-copy')
  const geoEl = wrap.querySelector('[data-atlas-geo]')
  const n = items.length

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
     LIST_IN…LIST_END — выезд плашек из-за правой кромки, по ломтю
     прокрутки на плашку. Первая трогается там же, где шар выходит из-за
     нижней кромки (RISE_END=0.3 от gp в globeCanvas.js, что в этих
     координатах ≈0.29): колонка собирается вместе с ростом шара, а не
     после него. Ночь наливается почти весь путь. Порог перекраски
     заголовка — там, где синевы уже достаточно, чтобы тёмный текст
     потерялся. */
  const KICKER_IN = 0.02
  const KICKER_ON = 0.1
  const LIST_IN = 0.06
  const LIST_END = 0.86
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

  /* Верх колонки услуг = верхняя кромка ПРОПИСНЫХ в «Реализуем проекты…».
     Меряем живьём, а не считаем в CSS: над заголовком стоит строка рубрики,
     её высота складывается из кегля, интерлиньяжа и метрик шрифта — любая
     константа промахнулась бы на пиксели при смене шкалы или веб-шрифта.
     .atlas-copy позиционирована, поэтому offsetTop заголовка отсчитывается
     от неё, а её собственный — от .atlas-stage, общего предка с колонкой.

     Одного offsetTop мало. Он даёт верх СТРОЧНОГО БОКСА, а у заголовка в
     47 пунктов над буквами остаётся полоса выносного пространства в
     полтора десятка пикселей — подпись «Услуги» кеглем в 12 пунктов, у
     которой эта полоса почти нулевая, вставала заметно выше первой строки
     (замечание пользователя со скриншотом). Поэтому обе строки приводим к
     верху прописной: сколько её от верха бокса, считаем метриками самого
     шрифта через canvas — по константам этого не сделать, у каждой
     гарнитуры своя высота выносных. */
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

    /* Услуги: у пункта i свой ломоть прокрутки [i/n … (i+1)/n], но
       проявляется он не всю его длину — множитель 1.8 укладывает проявление
       в первую половину ломтя, дальше пункт просто стоит. Иначе строка
       «дотягивала» бы прозрачность до самого прихода следующей и весь
       список читался бы полупрозрачным. Показанное не прячется обратно:
       к финалу сцены перечень стоит целиком. */
    // подпись колонки встаёт первой и без выезда — к ней приезжают плашки
    if (deck) deck.style.setProperty('--in', span(p, KICKER_IN, KICKER_ON).toFixed(3))

    /* Услуги: у плашки i свой ломоть прокрутки [i/n … (i+1)/n], но едет она
       не всю его длину — множитель 1.8 укладывает выезд в первую половину
       ломтя, дальше плашка просто стоит. Иначе колонка ехала бы вся разом,
       без пауз между появлениями. smooth даёт торможение у цели: плашка
       приезжает, а не втыкается в кромку на постоянной скорости.
       Приехавшее не уходит: к финалу сцены колонка стоит целиком. */
    const shown = span(p, LIST_IN, LIST_END) * n
    items.forEach((el, i) => {
      el.style.setProperty('--r', smooth(clamp01((shown - i) * 1.8)).toFixed(3))
    })
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
