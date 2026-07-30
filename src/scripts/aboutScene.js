/* ─────────────────────────────────────────────
   СЦЕНА «О КОМПАНИИ» · оркестратор

   Одна сцена, всё движется одновременно по одному прогрессу прокрутки
   сквозь обёртку .atlas (0…1):

     факты      плашки выезжают из-за правой кромки по одной, сверху
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
  const services = wrap.querySelector('[data-atlas-services]')
  const facts = wrap.querySelector('.atlas-details')
  const deck = wrap.querySelector('.atlas-deck')
  const items = [...wrap.querySelectorAll('[data-atlas-item]')]
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
     LIST_IN…LIST_END — выезд плашек, по ломтю прокрутки на плашку.
     Первая трогается там же, где шар выходит из-за нижней кромки
     (RISE_END в globeCanvas.js — в этих координатах ≈0.29): колонка
     собирается вместе с ростом шара, а не после него. */
  const LIST_IN = 0.06
  const LIST_END = 0.86
  /* Услуги начинают въезжать только после того, как четвёртая плашка
     полностью встала на место. Конец оставляем в пределах активной части
     сцены, чтобы финальная выдержка по-прежнему была неподвижной. */
  const SERVICES_IN = LIST_IN + (LIST_END - LIST_IN) * ((n - 1 + 1 / 1.8) / n)
  const NIGHT_IN = 0.12
  /* Вплотную к завершению разворота шара (см. GEO_END ниже и GLOBE_END в
     globeCanvas.js): ночь дотемняется тем же кадром, что и финал шара.
     Ниже — и остаток прокрутки идёт без единого визуального изменения. */
  const NIGHT_FULL = 0.9
  const SERVICES_END = NIGHT_FULL
  const NIGHT_SWAP = 0.52   // порог перекраски заголовка в светлый
  /* ДЕРЖАТЬ В ПАРЕ с globeCanvas.js: 0.882 = GLOBE_END (0.98) × конец
     разворота в его координатах (0.9) — момент, когда шар уже полностью
     развёрнут и дальше просто держит кадр. Строка обязана дозаполниться
     добела ровно к нему, а не к концу выдержки. */
  const GEO_END = 0.882

  /* ── Мобильная сцена: три акта подряд, а не два параллельно ──
     В узкий кадр не помещается даже пара «заголовок + список»: на
     телефоне шириной 320–375 четыре факта занимают экран целиком, и
     прибитый сверху заголовок ложился прямо на них. Поэтому здесь по
     кадру на акт — заголовок дочитывается и уходит, затем приходят
     факты, затем услуги. Заливка строки сжата под первый акт (свой
     GEO_END): дозаполниться добела она обязана до ухода, иначе приём
     просто не будет виден. Соседние акты стыкуются с зазором, чтобы
     уходящее и приходящее не пересекались в одном кадре. */
  const M = {
    geoEnd:     0.24,
    headOut:   [0.26, 0.32],
    listIn:     0.34,
    listEnd:    0.60,
    factsOut:  [0.64, 0.70],
    servicesIn: 0.74,
    servicesEnd: 0.92,
  }

  const progress = makeProgress(wrap, stage)

  // Правая колонка должна начинаться точно с первой левой плашки, а не с
  // начала сцены. Считываем реальную геометрию: она учитывает переносы
  // заголовка, загруженный шрифт и текущий масштаб браузера.
  const syncDeckTop = () => {
    if (!facts || !deck) return
    const stageTop = stage.getBoundingClientRect().top
    const factsTop = facts.getBoundingClientRect().top
    stage.style.setProperty('--deck-top', `${Math.round(factsTop - stageTop)}px`)
  }
  /* ── Плашки обязаны вместить свой текст ──
     Высота плашки жёсткая: ряд считается от кадра (--card-row в
     atlas.css), обе колонки стоят на одной шкале, и переросшая плашка
     ломала бы горизонталь. Кегль тянется за высотой ряда, но у него
     есть пол — на низком кадре (мелкое окно, увеличенный масштаб
     браузера) шкала в него упирается, а текст в CSS-пикселях за кадром
     не сжимается, и самая длинная плашка вылезала за своё стекло.

     Дальше CSS не помогает: сколько строк выйдет после переноса, знает
     только layout. Поэтому меряем фактическое переполнение и общим
     множителем --card-fit ужимаем кегль ОБЕИХ колонок разом — шкала
     остаётся единой, плашки одного роста, меняется только кегль внутри.
     Множитель только уменьшает (потолок 1): вверх шкалу ведёт сам CSS.
     Считается редко — на ресайзе и после загрузки шрифтов, не в кадре
     прокрутки: каждая проба — синхронный пересчёт раскладки. */
  const cards = [...wrap.querySelectorAll('.atlas-item, .atlas-service')]
  const FIT_MIN = 0.78   // ниже кегль перестаёт читаться, ужимать дальше нечего

  /* Худшее отношение «место в плашке / нужная высота текста» по всем
     плашкам сцены. 1 — все влезают. */
  const worstFit = () => {
    let worst = 1
    for (const card of cards) {
      const text = card.querySelector('.ai-text, .as-text')
      if (!text) continue
      const cs = getComputedStyle(card)
      const room = card.getBoundingClientRect().height
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      const need = text.getBoundingClientRect().height
      // Полупиксель допуска: округления раскладки не повод ужимать сцену.
      if (room > 0 && need > room + 0.5) worst = Math.min(worst, room / need)
    }
    return worst
  }

  const fitCards = () => {
    if (!cards.length) return
    stage.style.setProperty('--card-fit', '1')
    const room = worstFit()
    if (room >= 1) return
    /* Высота блока текста падает примерно как КВАДРАТ кегля: строка
       становится ниже и строк переноса становится меньше — поэтому
       первый шаг берём корнем из нехватки, а не самой нехваткой (иначе
       он ужал бы вдвое сильнее нужного). Дальше добираем мелкими
       шагами: перенос строки дискретен, точной формулы для него нет. */
    let fit = Math.max(FIT_MIN, Math.sqrt(room))
    stage.style.setProperty('--card-fit', fit.toFixed(3))
    for (let i = 0; i < 6 && fit > FIT_MIN && worstFit() < 1; i++) {
      fit = Math.max(FIT_MIN, fit - 0.025)
      stage.style.setProperty('--card-fit', fit.toFixed(3))
    }
  }

  /* Обе меры — про геометрию, обе читают раскладку, поэтому идут одной
     парой и в одном кадре: сначала верх правой колонки, затем кегль
     (ряд плашки считается от --deck-top, порядок обязателен). */
  let fitRaf = 0
  const scheduleFit = () => {
    if (fitRaf) return
    fitRaf = requestAnimationFrame(() => { fitRaf = 0; syncDeckTop(); fitCards() })
  }

  syncDeckTop()
  fitCards()
  document.fonts?.ready.then(() => { syncDeckTop(); fitCards() })

  let night = null   // состояние класса .is-night, чтобы не дёргать DOM зря

  const draw = () => {
    const p = progress()
    // На планшете, как и на телефоне, в нижней зоне помещается только один
    // список: сначала факты о компании, затем услуги.
    const isMobileScene = window.matchMedia('(max-width: 1100px)').matches

    // синева наливается прозрачностью слоя, покадрово по прокрутке
    nightEl.style.opacity = span(p, NIGHT_IN, NIGHT_FULL).toFixed(3)

    /* Строка заливается белым тем же прогрессом, что доворачивает шар,
       но не вся разом, а по словам: у слова i свой ломоть общего фила,
       внутри него слово идёт от 0 до 1 буква за буквой (clip-path, см.
       .atlas-geo-word). Строго по порядку — предыдущее уже добело,
       следующее ещё не начато. */
    const fill = span(p, 0, isMobileScene ? M.geoEnd : GEO_END)
    const wn = geoWords.length
    geoWords.forEach((w, i) => {
      w.style.setProperty('--w-fill', clamp01(fill * wn - i).toFixed(3))
    })

    /* Уход заголовка — только на мобильной сцене (на desktop он стоит всю
       сцену, и переменная остаётся 1). Гасит его CSS: --mobile-head
       наследуется вниз к рубрике и строке, но НЕ к плашкам фактов, хотя
       те и лежат внутри той же .atlas-head (см. atlas.css). */
    stage.style.setProperty(
      '--mobile-head',
      isMobileScene ? (1 - smooth(span(p, M.headOut[0], M.headOut[1]))).toFixed(3) : '1',
    )

    // заголовок перекрашивается в светлый, когда синевы стало достаточно
    const isNight = p >= NIGHT_SWAP
    if (isNight !== night) {
      night = isNight
      stage.classList.toggle('is-night', isNight)
    }

    /* Факты о компании: у плашки i свой ломоть прокрутки [i/n … (i+1)/n], но едет
       она не всю его длину — множитель 1.8 укладывает выезд в первую
       половину, дальше плашка просто стоит. Иначе колонка ехала бы вся
       разом, без пауз между появлениями. smooth даёт торможение у цели.
       Приехавшее не уходит: к финалу сцены колонка стоит целиком. */
    // На планшете и телефоне в кадре помещается только один список: сначала полностью
    // раскрываем факты о компании, затем убираем их и только после паузы
    // выводим услуги. На desktop сохраняется параллельная сцена.
    const shown = isMobileScene
      ? span(p, M.listIn, M.listEnd) * n
      : span(p, LIST_IN, LIST_END) * n
    items.forEach((el, i) => {
      el.style.setProperty('--r', smooth(clamp01((shown - i) * 1.8)).toFixed(3))
    })
    // Услуги въезжают слева лишь после того, как на месте уже все факты
    // о компании. У них своя короткая фаза, но тот же scroll-driven easing.
    const servicesProgress = smooth(span(
      p,
      isMobileScene ? M.servicesIn : SERVICES_IN,
      isMobileScene ? M.servicesEnd : SERVICES_END,
    )).toFixed(3)
    if (services) services.style.setProperty('--r', servicesProgress)
    if (facts) {
      const factsProgress = isMobileScene ? 1 - smooth(span(p, M.factsOut[0], M.factsOut[1])) : 1
      facts.style.setProperty('--mobile-facts', factsProgress.toFixed(3))
      /* Общий прогресс всей колонки — для очень узкого телефона (<350px),
         где плашки собраны в одну коробку и выезжают вместе: каскада по
         плашкам там нет, вести его нечем. Ставим на обёртку, вниз к
         списку оно наследуется; у самих плашек свой --r стоит инлайном и
         это наследование перебивает. Множитель 1.6 укладывает выезд
         коробки в начало фазы — по смыслу тот же приём, что и 1.8 у
         отдельной плашки выше. */
      facts.style.setProperty('--r', smooth(clamp01((shown / n) * 1.6)).toFixed(3))
    }
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

  window.addEventListener('resize', () => { scheduleFit(); schedule() })

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
  window.addEventListener('load', () => { syncDeckTop(); fitCards(); schedule() })
}
