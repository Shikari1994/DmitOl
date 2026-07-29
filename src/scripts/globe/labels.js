/* ─────────────────────────────────────────────
   ГЛОБУС · подписи городов

   На каждый город (globe/data.js) — короткая линия от его точки на шаре
   и название на конце линии. Ничего сложнее: список городов для того и
   оставлен коротким, чтобы каждому хватило своей выноски и не пришлось
   сводить соседей в общий столбик.

   Подписи — DOM, а не текст в канвасе: так они берут гарнитуру, кегль и
   цвета темы из тех же токенов, что и остальной сайт, и остаются резкими
   на любом devicePixelRatio. Линии — один <svg> в пиксельных координатах
   сцены (viewBox равен её размеру), поэтому геометрия считается прямо в
   тех числах, что дала проекция.

   Слой aria-hidden: то же, что канвас шара. Заголовок сцены уже говорит
   «Реализуем проекты по всей России», а список городов без карты под ним
   для скринридера — просто перечисление без контекста.

   ── Где подпись имеет право стоять ──
   Кадр сцены занят не только шаром: слева заголовок с фактами, справа
   колонка услуг, и обе лежат ВЫШЕ этого слоя по z-index. Точка города
   вполне может оказаться прямо под плашкой, поэтому side/nudge из
   data.js — начало раскладки, а не приговор: подпись выталкивается по
   горизонтали за кромку мешающей колонки, к свободной середине кадра
   (clearOfBlocks ниже). Не спаслась ни своей стороной, ни зеркальной —
   гаснет: пустое место честнее обрезанного хвоста из-под панели.

   Взаимное расхождение подписей держится на nudge из data.js, а не на
   переборе: города подобраны так, что каждому хватает своей выноски.

   Сторона запоминается в placement и меняется только когда прежняя
   перестала работать: пока шар доворачивается, точки ползут вдоль
   колонок, и без этого подпись перекидывало бы туда-обратно.
   ───────────────────────────────────────────── */
import { CITIES } from './data.js'
import { latLonToVec3 } from './geo.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/* Сдвиги подписи по вертикали при перекладке: сперва на своём месте (то
   есть на nudge из data.js), потом всё дальше поочерёдно вверх и вниз.
   Шаги в пикселях: строка одна, доли её высоты не хватило бы, чтобы
   выбраться из-под соседа. */
// Подпись остаётся в локальной зоне города. Дальние ±84/±120 px превращали
// карту в легенду и заставляли диагонали пересекать весь глобус.
// Последний шаг — запас для плотных групп вроде Поволжья в финальном ракурсе.
// Он всё ещё оставляет подпись рядом с её точкой, но не заставляет скрывать
// город, когда ближайшие пять позиций заняты соседними выносками.
// поля: от кромки кадра и запас вокруг чужих прямоугольников
const EDGE = 12
const CLEAR = 8

// половина «пятна» точки города на экране: маркер рисуется мягким
// спрайтом примерно этого радиуса, накрывать его подписью нельзя
const DOT_R = 7

const overlaps = (a, b) =>
  a.x0 < b.x1 + CLEAR && a.x1 > b.x0 - CLEAR && a.y0 < b.y1 + CLEAR && a.y1 > b.y0 - CLEAR

const pointInBox = (x, y, box) => x >= box.x0 - CLEAR && x <= box.x1 + CLEAR && y >= box.y0 - CLEAR && y <= box.y1 + CLEAR

const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

const segmentsIntersect = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const abC = orient(ax, ay, bx, by, cx, cy)
  const abD = orient(ax, ay, bx, by, dx, dy)
  const cdA = orient(cx, cy, dx, dy, ax, ay)
  const cdB = orient(cx, cy, dx, dy, bx, by)
  return abC * abD < 0 && cdA * cdB < 0
}

const segmentHitsBox = (ax, ay, bx, by, box) => {
  if (pointInBox(ax, ay, box) || pointInBox(bx, by, box)) return true
  return segmentsIntersect(ax, ay, bx, by, box.x0 - CLEAR, box.y0 - CLEAR, box.x1 + CLEAR, box.y0 - CLEAR)
    || segmentsIntersect(ax, ay, bx, by, box.x1 + CLEAR, box.y0 - CLEAR, box.x1 + CLEAR, box.y1 + CLEAR)
    || segmentsIntersect(ax, ay, bx, by, box.x1 + CLEAR, box.y1 + CLEAR, box.x0 - CLEAR, box.y1 + CLEAR)
    || segmentsIntersect(ax, ay, bx, by, box.x0 - CLEAR, box.y1 + CLEAR, box.x0 - CLEAR, box.y0 - CLEAR)
}

/* Радиус, на котором берётся точка для выноски: чуть выше маркеров
   города (1.012 в globeCanvas.js), чтобы линия начиналась от их кромки,
   а не из-под них. */
const PIN_R = 1.02

/**
 * @param {object} THREE — грузится динамически, поэтому приходит параметром
 * @param {HTMLElement} host — слой .atlas-pins поверх канваса
 * @param {THREE.Camera} camera
 * @param {THREE.Object3D} globe — группа, в чьих локальных координатах лежат города
 * @param {HTMLElement[]} obstacles — блоки сцены, которые подписи обязаны обходить
 */
export function createCityLabels(THREE, { host, camera, globe, obstacles = [] }) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'atlas-pins-svg')
  svg.setAttribute('preserveAspectRatio', 'none')
  host.appendChild(svg)

  const items = CITIES.map((city) => {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('class', 'atlas-pin-line')
    svg.appendChild(path)

    const el = document.createElement('div')
    el.className = 'atlas-pin'
    const name = document.createElement('span')
    name.className = 'atlas-pin-name'
    name.textContent = city.name
    el.appendChild(name)
    host.appendChild(el)

    /* Перебор мест у города постоянный (сторона задана в data.js) —
       собираем его здесь, один раз. В update() он крутится каждый кадр, и
       пересобирать три десятка объектов по 60 раз в секунду на город
       значило бы кормить сборщик мусора ради ровно тех же чисел. */
    return {
      el,
      name,
      path,
      // Место у города одно: подпись едет за своей точкой и меняет сторону
      // только когда прежняя ушла под колонку (см. update).
      placement: { side: city.side, dy: 0, mul: 1 },
      nudge: city.nudge || 0,
      // локальные координаты точки — считаются один раз
      point: latLonToVec3(THREE, city.lat, city.lon, PIN_R),
      width: 0,
      alpha: -1,      // последняя записанная прозрачность, чтобы не дёргать стиль зря
      x: 0, y: 0, facing: 0,   // сюда проекция складывает экранное место точки
    }
  })

  // ── замеры, зависящие от вьюпорта: обновляются на resize, не на кадре ──
  let W = 0
  let H = 0
  let rowH = 20
  let lead = 58
  let tick = 9
  let blocks = []   // заголовок сцены и колонка услуг в координатах слоя

  function measure() {
    const rect = host.getBoundingClientRect()
    W = rect.width
    H = rect.height
    const cs = getComputedStyle(host)
    const num = (prop, fallback) => {
      const v = parseFloat(cs.getPropertyValue(prop))
      return Number.isFinite(v) ? v : fallback
    }
    rowH = num('--pin-row', 20)
    lead = num('--pin-lead', 58)
    tick = num('--pin-tick', 9)
    // ширину подписи меряем по факту: она зависит от гарнитуры и кегля
    items.forEach((it) => { it.width = it.name.offsetWidth })
    blocks = obstacles
      .filter((el) => el && el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { x0: r.left - rect.left, y0: r.top - rect.top, x1: r.right - rect.left, y1: r.bottom - rect.top }
      })
  }
  // resize() ниже делает первый замер сам; веб-шрифт может доехать позже
  // и сменить ширину подписей — тогда перебор мест начинается заново
  document.fonts?.ready.then(() => resize())

  // ── рабочие объекты проекции: заводятся один раз, а не на каждый кадр ──
  const world = new THREE.Vector3()
  const centre = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const normal = new THREE.Vector3()

  /* Прямоугольники точек городов (чужая подпись не должна их накрывать) и
     уже разложенных подписей. Оба массива переиспользуются между кадрами:
     счётчик сбрасывается в ноль, объекты внутри переписываются на месте. */
  const dotBoxes = []
  const placed = []
  const takeBox = (pool, used) => pool[used] || (pool[used] = { x0: 0, y0: 0, x1: 0, y1: 0, owner: -1 })
  const leaders = []
  const takeLeader = (used) => leaders[used] || (leaders[used] = {
    ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, dx: 0, dy: 0, owner: -1,
  })
  let dotCount = 0
  let placedCount = 0

  // один общий черновик места: кандидатов десятки на город, и каждому
  // свой объект — это мусор на ровном месте
  const draft = { railX: 0, cy: 0, x0: 0, y0: 0, x1: 0, y1: 0 }
  const draftLeader = { ax: 0, ay: 0, bx: 0, by: 0, cx: 0, cy: 0, dx: 0, dy: 0 }

  function boxFor(item, side, leadMul, dy) {
    // nudge задан в строках — переводим в пиксели с той же добавкой
    // воздуха, чтобы фиксированный веер шёл ровным шагом
    draft.railX = item.x + side * lead * leadMul
    draft.cy = item.y + item.nudge * (rowH + 6) + dy
    draft.x0 = side < 0 ? draft.railX - item.width : draft.railX
    draft.x1 = draft.x0 + item.width
    draft.y0 = draft.cy - rowH / 2
    draft.y1 = draft.cy + rowH / 2
    return draft
  }

  function leaderFor(item, side) {
    draftLeader.ax = item.x
    draftLeader.ay = item.y
    draftLeader.bx = draft.railX
    draftLeader.by = draft.cy
    draftLeader.cx = draft.railX
    draftLeader.cy = draft.cy
    draftLeader.dx = draft.railX + side * tick
    draftLeader.dy = draft.cy
    return draftLeader
  }

  /* ── Вывод подписи из-под колонок ──
     Точка города вполне может оказаться под плашкой: колонки лежат выше
     этого слоя, и подпись, вставшая по своей стороне из data.js, уходит
     под панель — на кадре от неё торчит обрезанный хвост вроде «БУРГ».

     Поэтому сторона и длина выноски здесь не приговор, а начало: подпись
     выталкивается по горизонтали за кромку мешающего блока, к середине
     кадра, где свободно. Выталкивание непрерывное (край блока — величина
     постоянная, а точка едет), поэтому при доворачивании шара подпись не
     прыгает между дискретными вариантами, а плавно упирается в кромку и
     отходит от неё.

     Сторону меняем только когда своя не спаслась и выталкиванием —
     иначе на силуэте, где точка ползёт вдоль колонки, подпись
     перекидывало бы туда-обратно каждый кадр. */
  /* Предел выталкивания. Щедрый намеренно: у городов европейской части
     точка в финальном ракурсе сидит глубоко под колонкой фактов, и
     дотянуть подпись до свободной середины — это как раз несколько сотен
     пикселей. Линию туда ведёт выноска, так что связь с точкой не
     теряется. Дальше — уже не выноска, а легенда, и подпись гаснет. */
  const MAX_PUSH = 420

  const shiftRail = (item, side, railX) => {
    draft.railX = railX
    draft.x0 = side < 0 ? railX - item.width : railX
    draft.x1 = draft.x0 + item.width
  }

  /* Ставит draft на сторону side и, если он попал под колонку, выталкивает
     за её кромку. true — место найдено (draft и есть ответ). */
  const clearOfBlocks = (item, side, spot) => {
    boxFor(item, side, spot.mul, spot.dy)
    const base = draft.railX
    /* Блоков единицы, но вытолкнутый из-под одного может попасть под
       соседний — отсюда повтор, а не один проход. */
    for (let pass = 0; pass < blocks.length + 1; pass++) {
      let hit = null
      for (const b of blocks) if (overlaps(draft, b)) { hit = b; break }
      if (!hit) {
        return draft.x0 >= EDGE && draft.x1 <= W - EDGE
          && draft.y0 >= EDGE && draft.y1 <= H - EDGE
          && Math.abs(draft.railX - base) <= MAX_PUSH
      }
      shiftRail(item, side, side > 0
        ? hit.x1 + CLEAR
        : hit.x0 - CLEAR)
    }
    return false
  }

  const leaderHits = (leader, box) =>
    segmentHitsBox(leader.ax, leader.ay, leader.bx, leader.by, box)
    || segmentHitsBox(leader.cx, leader.cy, leader.dx, leader.dy, box)

  const leadersCross = (a, b) =>
    segmentsIntersect(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by)
    || segmentsIntersect(a.ax, a.ay, a.bx, a.by, b.cx, b.cy, b.dx, b.dy)
    || segmentsIntersect(a.cx, a.cy, a.dx, a.dy, b.ax, b.ay, b.bx, b.by)
    || segmentsIntersect(a.cx, a.cy, a.dx, a.dy, b.cx, b.cy, b.dx, b.dy)

  const fits = (box, leader, index) => {
    if (box.x0 < EDGE || box.x1 > W - EDGE || box.y0 < EDGE || box.y1 > H - EDGE) return false
    for (const b of blocks) if (overlaps(box, b) || leaderHits(leader, b)) return false
    for (let i = 0; i < dotCount; i++) {
      if (dotBoxes[i].owner !== index && overlaps(box, dotBoxes[i])) return false
    }
    for (let i = 0; i < placedCount; i++) {
      if (overlaps(box, placed[i]) || leaderHits(leaders[i], box) || leadersCross(leader, leaders[i])) return false
    }
    return true
  }

  /**
   * @param {number} reveal — 0…1, проявление подписей по прокрутке
   */
  function update(reveal) {
    if (reveal <= 0) {
      if (host.style.visibility !== 'hidden') host.style.visibility = 'hidden'
      return
    }
    if (host.style.visibility) host.style.visibility = ''

    centre.setFromMatrixPosition(globe.matrixWorld)

    // 1. Проекция: экранное место точки и её «лицевость»
    dotCount = 0
    items.forEach((item, index) => {
      world.copy(item.point).applyMatrix4(globe.matrixWorld)
      normal.subVectors(world, centre).normalize()
      toCam.subVectors(camera.position, world).normalize()
      item.facing = normal.dot(toCam)
      world.project(camera)
      item.x = (world.x * 0.5 + 0.5) * W
      item.y = (0.5 - world.y * 0.5) * H
      // точка занимает место: чужая подпись не должна её накрывать
      if (item.facing > 0) {
        const b = takeBox(dotBoxes, dotCount++)
        b.x0 = item.x - DOT_R; b.y0 = item.y - DOT_R
        b.x1 = item.x + DOT_R; b.y1 = item.y + DOT_R
        b.owner = index
      }
    })

    // 2. Раскладка: каждому городу — первое место, куда он влез
    placedCount = 0
    const last = items.length - 1
    items.forEach((item, index) => {
      /* Проявление: общий прогресс, лёгкая лесенка по списку и уход в
         ноль, когда точка заходит за кромку шара. 0.10…0.34 — не «видно /
         не видно», а плавная зона: без неё подпись мигала бы ровно на
         силуэте, где facing дрожит около нуля. */
      const stagger = last > 0 ? (index / last) * 0.45 : 0
      const alpha = clamp01(reveal * 1.45 - stagger) * smoothstep(0.1, 0.34, item.facing)

      if (alpha <= 0) {
        if (item.alpha !== 0) {
          item.alpha = 0
          item.el.style.opacity = '0'
          item.path.style.opacity = '0'
        }
        return
      }

      /* Своя сторона, потом зеркальная. Обе — с выталкиванием из-под
         колонок; если не спаслась ни одна, подпись гаснет: обрезанный
         хвост из-под панели читается хуже, чем её отсутствие. */
      const spot = item.placement
      if (!clearOfBlocks(item, spot.side, spot)) {
        if (clearOfBlocks(item, -spot.side, spot)) {
          spot.side = -spot.side
        } else {
          if (item.alpha !== 0) {
            item.alpha = 0
            item.el.style.opacity = '0'
            item.path.style.opacity = '0'
          }
          return
        }
      }
      leaderFor(item, spot.side)

      /* draft здесь ещё хранит принятое место: clearOfBlocks() оставляет
         его на том варианте, за который вернул true. */
      const { railX, cy } = draft
      const keep = takeBox(placed, placedCount++)
      keep.x0 = draft.x0; keep.y0 = draft.y0; keep.x1 = draft.x1; keep.y1 = draft.y1
      keep.owner = index
      const leader = takeLeader(placedCount - 1)
      leader.ax = draftLeader.ax; leader.ay = draftLeader.ay
      leader.bx = draftLeader.bx; leader.by = draftLeader.by
      leader.cx = draftLeader.cx; leader.cy = draftLeader.cy
      leader.dx = draftLeader.dx; leader.dy = draftLeader.dy
      leader.owner = index

      /* Линия и засечка — одной ломаной: наклонный отрезок от точки к
         месту подписи и короткий горизонтальный хвост под ней. Хвост
         нужен всегда: без него у подписи, вставшей вровень со своей
         точкой, линия и так горизонтальна, а у смещённой название
         висело бы на конце наклонной. */
      const rail = railX.toFixed(1)
      item.path.setAttribute(
        'd',
        `M${item.x.toFixed(1)} ${item.y.toFixed(1)}L${rail} ${cy.toFixed(1)}h${spot.side * tick}`,
      )

      item.el.dataset.side = spot.side < 0 ? 'left' : 'right'
      item.el.style.transform = `translate(${rail}px, ${(cy - rowH / 2).toFixed(1)}px)`
      if (item.alpha !== alpha) {
        item.alpha = alpha
        const v = alpha.toFixed(3)
        item.el.style.opacity = v
        item.path.style.opacity = v
      }
    })
  }

  function resize() {
    measure()
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  }
  resize()

  return { update, resize }
}
