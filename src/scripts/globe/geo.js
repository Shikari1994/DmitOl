/* ─────────────────────────────────────────────
   ГЛОБУС · геометрия и маска суши

   Чистые функции: широта/долгота → точка на сфере, чтение ч/б маски
   суши, построение облака точек и склейка полилиний в одну геометрию.
   Ни одна из них не знает про сцену, скролл и тему — им передают
   объект THREE (он грузится динамически, см. globeCanvas.js) и данные,
   они возвращают геометрию.
   ───────────────────────────────────────────── */

/* Широта/долгота → точка на сфере радиуса r. Конвенция держится в паре
   с planet-mask.jpg (стандартный equirect, меридиан 0° по центру
   изображения): u=(lon+180)/360, v=(90-lat)/180 — см. isLand() ниже,
   она обязана читать маску той же формулой, иначе города разъедутся
   с континентами под ними. */
export function latLonToVec3(THREE, lat, lon, r) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

/* Загружает ч/б маску суши и один раз растеризует её в ImageData —
   дальше точки сферы читают пиксель на CPU при построении облака
   (buildDotCloud), не в шейдере: проще и одинаково быстро на любом
   устройстве, вертексных текстур не требует. Даунскейл до 400px по
   ширине — точности пикселя не нужно, точек на сфере на порядок меньше. */
export function loadMask(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = 400
      const h = Math.round((w * img.height) / img.width)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h })
    }
    img.onerror = reject
    img.src = url
  })
}

// суша на маске тёмная (чёрный силуэт на белом океане) — порог по середине шкалы
function isLand(mask, lat, lon) {
  const u = (lon + 180) / 360
  const v = (90 - lat) / 180
  const x = Math.min(mask.w - 1, Math.max(0, Math.floor(u * mask.w)))
  const y = Math.min(mask.h - 1, Math.max(0, Math.floor(v * mask.h)))
  return mask.data[(y * mask.w + x) * 4] < 128
}

/* Точечное облако суши: кандидаты раскладываются по сфере методом
   золотого угла (Фибоначчи-сфера — равномернее, чем случайный сэмплинг
   или широта/долгота сеткой, которая сгущается у полюсов), и каждый
   проверяется по маске — остаются только точки на суше (~29% Земли,
   поэтому итоговых точек заметно меньше tries). */
export function buildDotCloud(THREE, mask, tries) {
  const positions = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < tries; i++) {
    const y = 1 - (i / (tries - 1)) * 2
    const rXZ = Math.sqrt(Math.max(0, 1 - y * y))
    const psi = golden * i
    const x = Math.cos(psi) * rXZ
    const z = Math.sin(psi) * rXZ
    const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, y))) * 180) / Math.PI
    /* atan2 отдаёт угол в (-180°, 180°], а нужен разворот в [0°, 360°) ДО
       вычитания 180 — иначе для половины точек (там, где atan2 уходит в
       минус) долгота проваливается в (-360°, 0°] вместо (-180°, 180°],
       isLand() клинит в левый край маски, и вместо материков на сфере
       остаётся узкая кривая полоса. +360/%360 держит вход всегда
       положительным (θ+360 ∈ (180, 540]), поэтому JS-модуль не путает
       знак, как бывает при `%` на отрицательных числах. */
    const lon = (((Math.atan2(z, -x) * 180) / Math.PI + 360) % 360) - 180
    if (isLand(mask, lat, lon)) positions.push(x, y, z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  return geo
}

/* ─── Полилинии одного материала — в ОДНУ геометрию ───
   Сетка меридианов/параллелей (17 дуг) и контур границы (25 колец)
   строились каждая своим THREE.Line/LineLoop, то есть 42 draw call'а
   на каждом кадре непрерывного рендера. Здесь они склеиваются в один
   LineSegments: при linewidth = 1 цепочка отрезков GL_LINES даёт
   попиксельно тот же результат, что GL_LINE_STRIP, — рисуется ровно
   та же ломаная теми же вершинами, меняется только число вызовов.
   Патч cullBackface тоже работает без изменений: он смотрит на позицию
   вершины (она у сегментов та же) и отбрасывает фрагмент во фрагментном
   шейдере, а не на уровне примитива.
   closed: true дописывает замыкающий сегмент — эквивалент LineLoop. */
export function mergeLines(THREE, rings) {
  const pos = []
  rings.forEach(({ points, closed }) => {
    const n = points.length
    if (n < 2) return
    const segments = closed ? n : n - 1
    for (let i = 0; i < segments; i++) {
      const a = points[i]
      const b = points[(i + 1) % n]
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  return geo
}
