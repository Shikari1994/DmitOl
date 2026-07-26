/* ─────────────────────────────────────────────
   ГЛОБУС · финал раздела «О компании»

   Один прогресс скролла (0…1 по длине обёртки .atlas, см. aboutScene.js)
   ведёт всю сцену:
     0.00–0.88  строка сверху набирается по словам (см. GEO_END там же)
     0.00–0.30  земной шар выезжает снизу и подрастает (RISE_END ниже)
     0.30–0.90  шар отлетает от камеры и доворачивается к России —
                к концу виден целиком, не только шапкой

   Шар больше не фото-модель (.glb с PBR-текстурами Земли) — он собран
   из точек: техника и маска суши (public/planet-mask.jpg, ч/б equirect-
   карта, суша чёрная/океан белый) взяты из MIT-репозитория
   github.com/inverser-pro/threejs-webgl-planet-for-production и
   переписаны под эту сцену. Каждая точка — это либо кандидат
   Фибоначчи-сферы (суша), либо один из 8 городов-акцентов (см. CITIES).
   Все цвета — не пиксели текстуры, а токены темы (--ink-faint для суши,
   --globe-accent для границы/городов/ореола — см. tokens.css), поэтому
   светлая/тёмная схема красит шар нативно, без CSS-фильтра-костыля,
   который раньше стоял в atlas.css.

   three.js грузится динамически и только когда секция подходит к экрану:
   на первый экран страницы этот вес не ложится.

   Шар — часть сцены «О компании» (см. About.astro, index.css .atlas), и
   выходит он НЕ после карточек, а вместе с ними: с самого начала прокрутки
   из-за нижней кромки выглядывает шапка шара, и по мере скролла он
   поднимается, подрастает и доворачивается Россией — одновременно с тем,
   как листаются факты и наливается синева. Это и есть «одна сцена, из
   которой выходит глобус». Разворот заканчивается на 90% прокрутки,
   последние 10% — выдержка на России.

   Решение «поднимать ли three.js» принимает aboutScene.js: он вешает на
   обёртку класс .is-static в тех же случаях (нет WebGL, reduced-motion,
   экономный трафик). Здесь мы просто уважаем этот класс — своей проверки
   больше не держим, чтобы вердикт был один на оба модуля.
   ───────────────────────────────────────────── */
import { asset } from '../lib/asset.js'
import { makeProgress, span, clamp01, smooth } from './scrollProgress.js'

const wrap = document.querySelector('[data-atlas]')
const canvas = wrap?.querySelector('[data-globe-canvas]')
const stage = wrap?.querySelector('[data-atlas-stage]')

/* Шар отрабатывает почти всю прокрутку; последние ~10% (от GLOBE_END) —
   выдержка на России, поэтому ремап идёт не к 1. Выход из-за кромки виден
   с самого старта: при gp=0 шар уже приподнят не с нуля, а с RISE_START
   (см. rise ниже) — иначе сцена в первом кадре читалась пустой. Подъём
   укладывается в RISE_END. */
const GLOBE_END = 0.98

/* Доля gp, за которую шар успевает подняться и подрасти (см. rise ниже). */
const RISE_END = 0.3

/* Стартовая доля подъёма при gp=0: секция не должна открываться пустой.
   0.25 → 0.5 → 0.7 всё ещё казалось поздним/низким. 0.85 — верх шара уже
   у вертикального центра кадра с самого первого кадра секции; дальше по
   RISE_END шар только дорастает и уходит в разворот (settle/turn), а не
   выезжает с нуля. Держать СТРОГО ≤ 1: rise едет к цели 1.0, и любое
   значение выше разворачивает подъём в проседание (шар вместо движения
   вверх слегка вжимался вниз и сжимался, пока поворот уже шёл полным
   ходом — читалось как «крутится на месте»). */
const RISE_START = 0.85

/* Разворот и завал полюса, в радианах. Не подбирались на глаз — решены
   численно: точка-цель (условный центр территории России, lat 63/lon 95)
   прогонялась через ТОЧНУЮ матрицу three.js для Euler-порядка 'XYZ'
   (Matrix4.makeRotationFromEuler) в поиске (x, y), при которых цель
   оказывается развёрнута к камере (+Z, x≈0); Москва по тем же углам
   тоже остаётся на ближней стороне. Держать в паре с CITIES/latLonToVec3
   выше — при их смене пересчитать (скрипт решения — разовый, в код не
   входит). TILT_FROM/SPIN_FROM — старт с заметным довортом, не сама
   точка решения, только откуда мы в неё приходим. */
const SPIN_FROM = -0.35
const SPIN_TO = 2.79
const TILT_FROM = 0.51
const TILT_TO = 1.01

/* Города-акценты: офис + крупные нефтегазовые центры по всей стране —
   ровно то, что доказывает заголовок сцены «Реализуем проекты по всей
   России». Координаты — реальные широта/долгота городов, не выдумка;
   единственный точно подтверждённый адрес (см. Footer.astro) — Москва,
   остальные — общеизвестные центры добычи (Ямал, Приобье, Восточная
   Сибирь), чтобы точки легли по всей карте, а не кучей в одном районе. */
const CITIES = [
  { name: 'Москва', lat: 55.75, lon: 37.62 },
  { name: 'Санкт-Петербург', lat: 59.94, lon: 30.31 },
  { name: 'Тюмень', lat: 57.15, lon: 65.53 },
  { name: 'Новый Уренгой', lat: 66.09, lon: 76.68 },
  { name: 'Нижневартовск', lat: 60.94, lon: 76.55 },
  { name: 'Оренбург', lat: 51.77, lon: 55.1 },
  { name: 'Якутск', lat: 62.03, lon: 129.73 },
  { name: 'Иркутск', lat: 52.29, lon: 104.3 },
]

/* Контур государственной границы РФ — массив замкнутых колец [[lon,lat],...]
   (материк + Калининград + Крым + острова + отдельное кольцо новых регионов).
   База — MultiPolygon России из datasets/geo-countries (Natural Earth),
   упрощённый алгоритмом Дугласа-Пекера (~0.3-0.5°, соразмерно масштабу
   самого шара — точность до километра здесь не нужна и не читалась бы).
   По прямому запросу пользователя граница проведена по факту действующего
   госустройства РФ: Крым — в исходных данных уже частью России; контур
   ДНР/ЛНР/Запорожской и Херсонской областей в готовых датасетах не нашёлся
   (Natural Earth его не выделяет), поэтому дорисован вручную по известным
   координатам админграниц этих областей и берега Азовского/Чёрного моря —
   восточный отрезок (стык с Ростовской/Воронежской обл. у Милово) взят из
   тех же реальных данных, что и материк. Это стилизованная картинка для
   витрины, не картографический источник. */
const BORDER_RINGS = [
  [[87.82,49.17],[86.75,49.78],[85.22,49.6],[83.43,50.99],[81.46,50.73],[80.68,51.3],[80.02,50.77],[77.87,53.27],[76.5,53.99],[76.9,54.46],[73.41,53.43],[73.74,54.06],[71.16,54.1],[70.82,55.29],[68.93,55.43],[65.18,54.31],[61,53.94],[61.56,53.51],[61.16,53.3],[62.09,52.99],[60.97,52.97],[61.04,52.33],[59.99,51.95],[61.47,51.43],[61.37,50.78],[59.52,50.47],[58.31,51.15],[56.48,51.07],[55.66,50.53],[54.64,51.03],[54.5,50.52],[53.41,51.48],[50.77,51.76],[48.57,50.64],[48.78,49.93],[47.47,50.41],[46.48,48.41],[48.17,47.71],[49.01,46.77],[48.46,46.66],[49.31,46.26],[47.38,45.75],[46.68,44.53],[47.4,43.51],[47.7,43.87],[47.46,43.02],[48.58,41.85],[47.87,41.21],[45.12,42.7],[39.96,43.39],[36.58,45.19],[38.56,46.03],[37.73,46.67],[39.39,47.12],[38.19,47.32],[39.76,47.83],[40.13,49.58],[37.42,50.43],[35.61,50.35],[35.08,51.21],[34.19,51.25],[34.41,51.78],[33.8,52.35],[31.76,52.1],[31.25,53.01],[32.72,53.44],[30.77,54.79],[30.91,55.57],[28.29,56.05],[27.63,56.84],[27.41,58.75],[28.18,59.36],[28.01,59.76],[30.25,59.97],[28.62,60.38],[28.69,60.74],[27.79,60.53],[31.57,62.91],[29.98,63.74],[30.56,64.22],[29.63,64.91],[30.11,65.71],[29.05,66.91],[30.01,67.69],[28.69,68.18],[28.41,68.9],[32.05,69.96],[33.13,69.73],[32.19,69.43],[33.52,69.43],[33.02,68.95],[35.87,69.19],[41.04,67.68],[41.18,66.81],[38.55,66.05],[31.85,67.15],[34.85,65.9],[34.3,65.39],[34.74,64.56],[37.53,63.8],[38.02,64.31],[36.44,64.92],[40.52,64.54],[39.75,65.55],[42.2,66.53],[44.18,65.86],[44.52,66.92],[43.77,67.28],[44.41,68.06],[43.32,68.67],[46.53,68.13],[46.7,67.82],[44.91,67.37],[46.41,66.75],[47.58,66.87],[47.85,67.6],[49.11,67.64],[48.59,67.93],[53.88,68.97],[54.56,69],[53.59,68.91],[53.94,68.41],[53.21,68.27],[58.88,69],[59.67,68.34],[60.97,68.91],[60.14,69.58],[60.93,69.87],[64.13,69.55],[68.29,68.19],[69.22,68.96],[66.8,69.59],[67.33,70.76],[66.62,71.06],[68.35,71.68],[69.35,72.95],[71.56,72.92],[72.84,72.71],[71.8,71.48],[72.84,70.86],[72.58,68.94],[73.65,68.46],[73.11,67.69],[71.3,66.95],[71.58,66.66],[68.97,66.81],[72.08,66.24],[74.73,67.69],[74.63,68.77],[76.58,68.98],[77.33,68.52],[77.08,67.79],[79.05,67.57],[77.49,67.75],[78.17,68.27],[77.65,68.91],[73.76,69.17],[73.52,69.75],[74.32,70.67],[73.02,71.43],[74.99,72.14],[74.75,72.82],[75.71,72.57],[75.26,71.37],[76.91,71.07],[79.11,71],[76,71.91],[78.11,71.88],[77.38,72.11],[78.5,72.41],[83.25,71.73],[82.27,71.28],[82.08,70.57],[82.35,70.2],[82.16,70.57],[82.9,71],[82.64,70.18],[83.11,70.07],[83.77,70.48],[83.12,71.11],[83.62,71.63],[80.7,72.55],[80.51,73.57],[87.08,73.87],[85.79,73.48],[86.78,73],[85.84,73.44],[87.66,73.89],[85.74,74.64],[87.79,75.03],[87.02,75.16],[94.16,75.94],[92.83,75.97],[93.69,76.13],[98.82,76.27],[99.57,75.78],[99.87,76.11],[98.82,76.49],[102.25,76.38],[100.86,76.87],[104.29,77.74],[106.29,77.37],[104.14,77.09],[107.5,76.92],[106.42,76.51],[111.09,76.76],[113.89,75.85],[112.34,75.85],[113.72,75.41],[105.07,72.77],[110.92,73.7],[109.53,73.78],[110.02,74.01],[112.85,73.99],[113.43,73.63],[113.18,72.73],[114.09,72.6],[113.16,72.82],[114.04,73.35],[113.47,73.5],[118.45,73.59],[119.72,72.96],[122.73,72.83],[122.31,72.94],[123.23,72.93],[123.67,73.2],[123.37,73.66],[124.38,73.81],[129.44,73.03],[127.91,72.67],[129.49,72.13],[127.67,72.43],[131.04,70.74],[132.72,71.95],[134.67,71.26],[140.03,71.47],[139.34,71.95],[140.2,72.21],[139.09,72.25],[141.11,72.59],[140.73,72.9],[146.85,72.35],[144.42,72.18],[146.93,72.31],[144.89,71.68],[147.2,72.33],[149.61,72.15],[150.07,71.89],[148.83,71.68],[152.54,70.79],[159.24,70.83],[160.09,70.31],[159.77,69.76],[161.01,69.58],[161.42,68.98],[160.82,68.53],[161.7,69.5],[164.03,69.77],[167.8,69.78],[170.63,68.75],[171.16,69.04],[170.16,69.61],[170.48,70.14],[176.13,69.89],[180,68.98],[180,65.07],[178.56,64.59],[176.94,65.08],[176.31,65.06],[177.3,64.82],[174.44,64.69],[177.49,64.77],[179.56,62.62],[179.07,62.29],[176.99,62.87],[177.27,62.59],[172.72,61.43],[170.27,59.92],[169.21,60.63],[167.02,60.43],[166.25,59.83],[166.37,60.5],[164.84,59.79],[163.63,60.05],[161.99,58.09],[163.33,57.71],[162.78,56.76],[163.37,56.18],[162.41,56.38],[161.76,55.55],[162.13,54.76],[160.05,54.18],[160.06,53.1],[158.44,53.03],[158.29,51.97],[156.67,50.86],[155.55,55.28],[155.95,56.62],[157,57.43],[156.75,57.73],[158.34,57.95],[161.94,60.42],[163.75,60.88],[164.13,62.26],[165.65,62.46],[163.4,62.58],[162.98,61.8],[163.33,61.66],[160.19,60.58],[160.44,61.04],[159.78,61.24],[160.35,61.94],[157.03,61.65],[154.22,59.87],[154.14,59.46],[155.19,59.18],[151.35,58.83],[151.09,59.1],[152.32,59.21],[149.38,59.77],[148.93,59.23],[143.16,59.38],[140.9,58.38],[135.17,54.82],[136.82,54.65],[136.78,53.77],[137.74,54.32],[137.34,53.53],[139.77,54.3],[141.41,53.3],[140.71,53.11],[141.56,52.16],[140.69,51.31],[140.18,48.46],[135.14,43.51],[133.16,42.69],[131.83,43.34],[130.7,42.3],[130.38,42.7],[131.28,43.38],[130.93,44.84],[131.85,45.34],[133.1,45.11],[134.72,48.26],[130.97,47.7],[130.67,48.87],[127.54,49.79],[126.09,52.78],[123.61,53.56],[120.03,52.76],[120.72,52.54],[120.71,51.98],[119.32,50.09],[117.87,49.51],[114.29,50.28],[110.73,49.14],[108.54,49.33],[106.66,50.33],[103.28,50.2],[102.3,50.56],[102.07,51.37],[98.93,52.13],[97.81,51],[98.26,50.28],[97.34,49.73],[92.36,50.87],[87.82,49.17]],
  [[22.77,54.36],[19.61,54.46],[21.37,55.29],[22.58,55.06],[22.77,54.36]], // Калининградская обл.
  [[33.63,46.12],[36.64,45.35],[33.72,44.4],[33.54,45.12],[32.48,45.41],[33.63,46.12]], // Крым
  [[-180,65.07],[-180,68.98],[-175.27,67.66],[-174.46,66.28],[-173.69,66.44],[-174.61,67.06],[-173.65,67.12],[-169.64,66.07],[-171.46,65.83],[-171.04,65.47],[-172.86,65.7],[-172.08,65.08],[-173.16,64.76],[-172.22,64.41],[-173.11,64.24],[-175.41,64.77],[-176.04,65.45],[-178.46,65.47],[-178.98,66.05],[-178.48,66.38],[-179.69,66.18],[-179.26,65.53],[-180,65.07]], // Чукотка (зап. часть, за линией перемены дат)
  [[180,71.54],[179.81,70.91],[178.62,71.04],[180,71.54]],
  [[-180,70.99],[-179.74,71.59],[-177.44,71.24],[-180,70.99]], // о. Врангеля
  [[142.53,54.3],[143.01,54.12],[143.22,51.52],[144.76,48.64],[143.26,49.39],[143.67,49.31],[143.01,49.12],[142.55,47.77],[143.63,46.37],[143.43,46.03],[143.37,46.56],[142.62,46.72],[142.09,45.9],[142.27,51.11],[141.64,52.32],[141.77,53.37],[142.8,53.71],[142.53,54.3]], // Сахалин
  [[51.41,71.81],[52.87,72.35],[53.22,72.65],[52.38,72.73],[53.32,73.22],[56.44,73.23],[55.12,72.45],[55.57,72.2],[55.23,71.93],[57.64,70.73],[53.54,70.8],[54.24,71.12],[53.45,71.26],[53.95,71.46],[51.41,71.81]], // Новая Земля (юж.)
  [[56.99,74.69],[55.73,75.08],[61.08,76.28],[67.59,77.01],[69.03,76.71],[58.19,74.58],[58.73,74.24],[57.26,74.08],[57.75,73.73],[56.56,73.89],[57.62,73.67],[56.74,73.68],[57.25,73.46],[56.73,73.24],[53.63,73.76],[56.29,74.49],[55.53,74.65],[56.99,74.69]], // Новая Земля (сев.)
  [[148.8,45.42],[146.86,44.45],[147.94,45.43],[148.8,45.42]], // Курилы (южн.)
  [[50.32,69.15],[48.22,68.9],[48.91,69.51],[50.32,69.15]], // Колгуев
  [[71.67,73.23],[69.87,73.04],[70.47,73.5],[71.67,73.23]],
  [[143.47,73.32],[139.77,73.42],[142.05,73.92],[143.47,73.32]],
  [[150.83,75.16],[149.21,74.76],[146.07,75.24],[146.44,75.6],[150.83,75.16]],
  [[135.99,75.53],[135.45,75.38],[135.69,75.87],[135.99,75.53]],
  [[145.37,75.54],[144,75.02],[142.34,75.73],[142.44,75.2],[143.71,74.95],[139.13,74.65],[136.86,75.36],[139.05,76.24],[140.48,75.64],[141.62,76.01],[141.31,76.18],[145.37,75.54]], // Новосибирские о-ва
  [[105.42,78.58],[99.27,78.04],[102.3,79.43],[103.15,79.31],[102.38,78.82],[103.62,79.17],[105.42,78.58]], // Северная Земля
  [[99.89,79.04],[97.44,78.82],[92.85,79.56],[97.59,80.17],[98.09,80.06],[97.19,79.71],[100.02,79.82],[99.03,79.3],[99.89,79.04]],
  [[46.69,80.53],[44.86,80.62],[48.76,80.66],[46.69,80.53]], // Земля Франца-Иосифа
  [[51.69,80.73],[48.37,80.09],[46.62,80.3],[51.69,80.73]],
  [[57.34,80.89],[56.1,81.09],[58.28,80.93],[57.34,80.89]],
  [[97.75,80.74],[97.13,80.67],[97.19,80.23],[93.75,80],[91.42,80.31],[95.55,81.22],[95.1,81.27],[97.75,80.74]],
  [[57.27,81.43],[56.74,81.45],[58.57,81.41],[57.27,81.43]],
  [[52.62,80.18],[52.18,80.28],[53.87,80.27],[52.62,80.18]],
  [[57.53,80.13],[56.95,80.48],[59.28,80.33],[57.53,80.13]],
  // ДНР, ЛНР, Запорожская и Херсонская обл. (см. комментарий выше) —
  // восточный край (Милово → побережье Азова) реальный, остальное дорисовано.
  [[40.13,49.58],[39.76,47.83],[38.19,47.32],[39.39,47.12],[38.09,47.12],[37.57,47.1],[36.79,46.76],[36.35,46.73],[35.68,46.61],[34.81,46.17],[34.35,46.05],[32.92,46.11],[31.85,46.58],[31.7,46.62],[32.6,46.85],[32.9,47.3],[33.4,47.6],[34,47.85],[35,48.05],[35.8,48.3],[36.3,48.4],[37,48.5],[37.6,48.7],[38.3,49],[39.2,49.3]],
]

/* Широта/долгота → точка на сфере радиуса r. Конвенция держится в паре
   с planet-mask.jpg (стандартный equirect, меридиан 0° по центру
   изображения): u=(lon+180)/360, v=(90-lat)/180 — см. isLand() ниже,
   она обязана читать маску той же формулой, иначе города разъедутся
   с континентами под ними. */
function latLonToVec3(THREE, lat, lon, r) {
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
function loadMask(url) {
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
function buildDotCloud(THREE, mask, tries) {
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

/* Точки на дальней стороне сферы (нормаль смотрит от камеры) по
   умолчанию всё равно растеризуются — PointsMaterial не умеет
   backface-culling для спрайтов (это не полигоны, культить нечего на
   уровне GPU). Из-за этого сквозь просветы между точками ближней
   стороны было видно зеркальный узор точек дальней — шар читался
   прозрачным, а не сплошным. Патчим шейдер через onBeforeCompile:
   геометрия — единичная сфера с центром в начале координат, поэтому
   направление вершины из центра ('transformed' до всех трансформаций)
   и есть её нормаль; сравниваем с направлением на камеру и отбрасываем
   фрагмент, если точка смотрит от зрителя. customProgramCacheKey нужен,
   чтобы three не перепутал этот патченный шейдер с обычным
   PointsMaterial где-то ещё в кэше программ. */
function cullBackface(material) {
  material.customProgramCacheKey = () => 'cull-backface'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vFacing;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\t\tvFacing = dot(normalize(normalMatrix * transformed), normalize(-mvPosition.xyz));',
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'varying float vFacing;\nvoid main() {\n\tif (vFacing < 0.0) discard;',
    )
  }
}

/* Материал «поверхности» шара — общий для облака суши и городов: та же
   техника патчинга шейдера, что и в cullBackface() выше (backface-cull
   входит сюда же, отдельно уже не навешиваем — three не даёт повесить на
   один материал два независимых onBeforeCompile, только переопределить).
   Сверху — два опциональных слоя, оба по общим для суши+городов
   uniform-объектам (передаются по ссылке, чтобы update ниже был один на
   оба материала и оба реагировали синхронно):
     - pulseUniforms — только у городов: точка «дышит» сама по себе,
       у каждой свой фазовый сдвиг (aIndex), не завязано на курсор;
     - hoverUniforms — подсветка под курсором, общая для суши и городов:
       uHoverDir — точка на единичной сфере (в локальных координатах
       шара) под курсором, её каждый кадр считает updateHoverPoint() в
       start(); glow — просто косинус угла между вершиной и этой точкой,
       поэтому пятно света физически облегает кривизну шара, а не
       рисуется плоским пятном поверх. */
function makeSurfaceMaterial(THREE, { texture, color, size, opacity = 1, pulseUniforms, hoverUniforms }) {
  const material = new THREE.PointsMaterial({
    size,
    map: texture,
    color,
    opacity,
    transparent: true,
    depthWrite: true,
    sizeAttenuation: true,
  })
  material.customProgramCacheKey = () => `surface-${pulseUniforms ? 'p' : '-'}${hoverUniforms ? 'h' : '-'}`
  material.onBeforeCompile = (shader) => {
    let head = 'varying float vFacing;\n'
    if (pulseUniforms) {
      shader.uniforms.uTime = pulseUniforms.uTime
      head += 'attribute float aIndex;\nuniform float uTime;\n'
    }
    if (hoverUniforms) {
      shader.uniforms.uHoverDir = hoverUniforms.uHoverDir
      shader.uniforms.uHoverStrength = hoverUniforms.uHoverStrength
      head += 'uniform vec3 uHoverDir;\nuniform float uHoverStrength;\nvarying float vGlow;\n'
    }

    let sizeExpr = 'size'
    const sizeLines = []
    if (hoverUniforms) {
      sizeLines.push('vGlow = smoothstep(0.86, 1.0, dot(normalize(position), uHoverDir)) * uHoverStrength;')
      sizeExpr += ' * (1.0 + vGlow * 0.4)'
    }
    if (pulseUniforms) sizeExpr += ' * (1.0 + 0.22 * sin(uTime * 1.6 + aIndex * 1.9))'
    sizeLines.push(`gl_PointSize = ${sizeExpr};`)

    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${head}void main() {`)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n\t\tvFacing = dot(normalize(normalMatrix * transformed), normalize(-mvPosition.xyz));',
      )
      .replace('gl_PointSize = size;', sizeLines.join('\n\t\t'))

    let fHead = 'varying float vFacing;\n'
    if (hoverUniforms) fHead += 'varying float vGlow;\n'
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `${fHead}void main() {\n\tif (vFacing < 0.0) discard;`,
    )
    if (hoverUniforms) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb *= 1.0 + vGlow * 0.35;\n\tdiffuseColor.a = min(1.0, diffuseColor.a * (1.0 + vGlow * 0.25));',
      )
    }
    material.userData.shader = shader
  }
  return material
}

// одна мягкая круглая текстура на все точки (сушу и города) — тонируется цветом материала
function makeDotTexture(THREE) {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// мягкое радиальное пятно на весь ореол/частицы — центр непрозрачный, к краю в ноль
function makeHaloTexture(THREE) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.6)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* Кольцевой градиент для атмосферы: центр прозрачный, узкий пик у кромки
   планеты (~0.72 радиуса текстуры), плавное угасание наружу в ноль.
   В отличие от makeHaloTexture (пятно ИЗ центра, рассеянная заливка за
   шаром) здесь свет собран в ободок у силуэта — «сияние с угасанием от
   краёв планеты», без резкой геометрической границы, которую давала бы
   сфера. Внутренний склон (0.58→0.72) короче внешнего (0.72→1.0), поэтому
   свечение прижато к кромке изнутри и мягко растворяется наружу. */
function makeAtmosphereTexture(THREE) {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,0)')
  g.addColorStop(0.6, 'rgba(255,255,255,0)')
  g.addColorStop(0.72, 'rgba(255,255,255,0.32)')
  g.addColorStop(0.82, 'rgba(255,255,255,0.08)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* Объект getComputedStyle живой — он отражает актуальные значения и после
   смены html[data-scheme], поэтому держим один на весь модуль вместо
   нового вызова на каждый из девяти цветов (сам вызов способен
   форсировать пересчёт стиля). Значения на выходе те же. */
let rootStyle = null
const themeColor = (name) => {
  if (!rootStyle) rootStyle = getComputedStyle(document.documentElement)
  return rootStyle.getPropertyValue(name).trim()
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
function mergeLines(THREE, rings) {
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

const progress = wrap ? makeProgress(wrap, stage) : () => 0
const globeProgress = () => span(progress(), 0, GLOBE_END)

async function start() {
  const THREE = await import('three')

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  /* Плотность буфера на телефоне режем до 1.5 — та же экономия, что была
     у PBR-версии, хотя точки дешевле в закраске, чем текстурный материал. */
  const isMobile = window.matchMedia('(max-width: 900px)').matches
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0, 3.2)

  // группа-обёртка: скролл двигает её, вращение живёт на globe
  const holder = new THREE.Group()
  scene.add(holder)
  const globe = new THREE.Group()
  holder.add(globe)

  const dotTex = makeDotTexture(THREE)
  const mask = await loadMask(asset('/planet-mask.jpg'))

  /* Подсветка под курсором — общий на облако суши и города uniform-объект
     (см. makeSurfaceMaterial выше и updateHoverPoint ниже): uHoverDir —
     точка на единичной сфере под курсором в локальных координатах шара,
     uHoverStrength — 0…1, плавно едет к цели каждый кадр в render(), а не
     скачет по pointerenter/leave. */
  const hoverUniforms = {
    uHoverDir: { value: new THREE.Vector3(0, 0, 1) },
    uHoverStrength: { value: 0 },
  }

  /* ── Суша: облако точек, радиус сферы = 1 (holder/globe масштабируют дальше) ──
     depthWrite: true — без записи в depth-buffer ближняя и дальняя стороны
     сферы рендерились бы друг поверх друга вперемешку (сортировки точек
     внутри одного draw call нет). Этого одного depthWrite мало: там, где
     на луче камеры вообще нет ближней точки (пусто между спрайтами),
     depth-тест дальнюю точку ничем не блокирует, и она всё равно видна —
     сквозь шар «просвечивает» узор с обратной стороны. Патч в
     makeSurfaceMaterial() закрывает именно этот случай: точка с нормалью
     от камеры не рисуется вовсе, независимо от того, что там на переднем
     плане. */
  const dotGeo = buildDotCloud(THREE, mask, isMobile ? 9000 : 16000)
  const dotMat = makeSurfaceMaterial(THREE, {
    texture: dotTex,
    color: new THREE.Color(themeColor('--ink-faint')),
    size: isMobile ? 0.024 : 0.018,
    opacity: 0.85,
    hoverUniforms,
  })
  const dotCloud = new THREE.Points(dotGeo, dotMat)
  dotCloud.renderOrder = 0
  globe.add(dotCloud)

  /* ── Атмосфера: fresnel-подсветка на грани силуэта ──
     Оболочка чуть БОЛЬШЕ облака точек (радиус 1.02 против радиуса точек
     ≤ 1.012, см. glow ниже) — раньше стояла 0.99, то есть МЕНЬШЕ и суши
     (радиус 1), и особенно городов-маркеров (радиус 1.012 + свой
     спрайт), из-за чего сами точки у края торчали наружу за пределы
     ореола (жалоба «точки выходят за границу ореола»). Отступ держим
     минимальным (0.008 сверх маркеров) — 1.05 пробовали первым, но
     тогда ореол оторвался от точек в отдельное кольцо (та же жалоба
     повторно, уже в обратную сторону); нужен именно тонкий запас, а не
     заметный зазор. Рендерится
     лицевой стороной (FrontSide — видимая, ближняя полусфера), и с
     depthTest против уже отрисованных точек (depthWrite:true у
     dotMat/markerMat) — там, где точка есть прямо перед ней, свечение
     корректно перекрыто, видно только у кромки и в промежутках между
     точками. dot(normal, viewDir) даёт 1 в центре диска (смотрит прямо
     на камеру) и 0 у самого края (силуэт, грань на просвет) —
     коэффициент держим РОВНО 1.0, чтобы `1.0 - dot` никогда не уходил в
     отрицательные числа: pow() с отрицательным основанием — undefined в
     GLSL, драйвер на такое может нарисовать что попало (так и вышло:
     BackSide + коэффициент 0.68 давали отрицательное основание почти по
     всей полусфере — отсюда сплошная синяя заливка вместо тонкого
     ободка). */
  const glowMat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(themeColor('--globe-accent')) },
      opacity: { value: 0.65 },
    },
    vertexShader: `
      varying float vIntensity;
      void main() {
        vec3 vNormal = normalize(normalMatrix * normal);
        vec3 vViewDir = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
        vIntensity = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.4);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float opacity;
      varying float vIntensity;
      void main() {
        gl_FragColor = vec4(glowColor, vIntensity * opacity);
      }
    `,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
  // SphereGeometry, не Icosahedron: у нормали сферы нет фасеток — важно для
  // плавного затухания к краю, любая огранка на fresnel-градиенте видна сразу.
  // Радиус 1.02 — минимальный запас снаружи самой дальней точки (маркер
  // города на 1.012), см. комментарий выше.
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 40), glowMat)
  glow.renderOrder = 1
  globe.add(glow)

  /* ── Внешняя атмосфера: мягкое сияние у самой кромки шара ──
     glowMat выше — тонкая fresnel-кромка на поверхности (радиус 1.02).
     Хочется, чтобы свет чуть выходил ЗА силуэт и плавно угасал наружу,
     без всякой геометрической границы. Сфера для этого не годится: у неё
     жёсткий внешний край (свет обрывается на кромке геометрии, читается
     дешёвым двойным кольцом). Поэтому это билборд-спрайт с КОЛЬЦЕВЫМ
     градиентом (makeAtmosphereTexture): alpha=0 в центре, пик у кромки
     планеты, плавно в 0 наружу — свечение обнимает силуэт и растворяется,
     нигде не обрезаясь. Спрайт — ребёнок holder (как halo): наследует
     позицию и масштаб шара, всегда развёрнут на камеру. Масштаб подобран
     так, чтобы пик градиента (нормализованный радиус ~0.72 текстуры)
     ложился ровно на кромку шара: 2 / 0.72 ≈ 2.8. */
  const atmoTex = makeAtmosphereTexture(THREE)
  const atmoMat = new THREE.SpriteMaterial({
    map: atmoTex,
    color: new THREE.Color(themeColor('--globe-accent')),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const atmo = new THREE.Sprite(atmoMat)
  atmo.scale.setScalar(2.6)
  atmo.renderOrder = -1
  holder.add(atmo)

  /* ── Ореол: рассеянное свечение позади шара ──
     Fresnel выше обрисовывает только тонкую кромку силуэта — сама сцена
     вокруг шара (просьба пользователя 2026-07-25 «чтобы сцена не была
     пустой») от него не заполняется. Это отдельное большое билборд-пятно
     (Sprite всегда развёрнут на камеру — вращение holder/globe его не
     касается, только позиция и масштаб, которые он наследует как ребёнок
     holder). Рисуется раньше всего остального (renderOrder ниже нуля) и
     без записи в depth — просто мягкая заливка на заднем плане. */
  const haloTex = makeHaloTexture(THREE)
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    color: new THREE.Color(themeColor('--globe-accent')),
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
  const halo = new THREE.Sprite(haloMat)
  halo.scale.setScalar(3.4)
  halo.renderOrder = -2
  holder.add(halo)

  /* ── Пыль: редкие частицы вокруг шара ──
     Чисто декоративный слой (в отличие от суши/городов/границы — те
     держатся реальных координат): равномерно раскиданы в сферическом
     слое вокруг планеты, крутятся своим темпом, независимым от
     SPIN_FROM→SPIN_TO — иначе довращение к России читалось бы вперемешку
     с фоновым дрейфом. aPhase — случайная фаза мерцания на частицу, тем
     же приёмом, что и пульс городов (см. makeSurfaceMaterial), но здесь
     проще: обычный PointsMaterial + свой onBeforeCompile, без culling
     задней стороны — частицы не лежат на поверхности, отбрасывать
     заднюю половину нечего. Помимо мерцания у частиц есть разброс размера
     (aScale) и примесь акцентного цвета (aMix): большинство — мелкая
     нейтральная пыль, редкие — крупные голубоватые искры-«звёзды», отсюда
     живой неоднородный слой вместо ровной сыпи одинаковых точек. */
  const AMBIENT_COUNT = isMobile ? 220 : 520
  const ambientPos = new Float32Array(AMBIENT_COUNT * 3)
  const ambientPhase = new Float32Array(AMBIENT_COUNT)
  const ambientScale = new Float32Array(AMBIENT_COUNT)
  const ambientMix = new Float32Array(AMBIENT_COUNT)
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const rXZ = Math.sqrt(1 - u * u)
    // Степень >1 тянет радиус к нижней границе (rMin): большинство частиц
    // ложится плотной оболочкой у самой поверхности шара, и лишь немногие
    // залетают дальше — так вокруг планеты читается объём/корона, а не
    // ровная россыпь звёзд по всему фону (просьба пользователя — сравнить
    // с референсом, где пыль сгущена именно у краёв планеты).
    const r = 1.12 + Math.pow(Math.random(), 2.4) * 1.5
    ambientPos.set([r * rXZ * Math.cos(theta), r * u, r * rXZ * Math.sin(theta)], i * 3)
    ambientPhase[i] = Math.random() * Math.PI * 2
    // Степень >1 тянет разброс к нижнему краю: у большинства частиц масштаб
    // мал, крупные искры редки — это и даёт «звёзды» среди пыли, а не ровный
    // слой. То же для примеси акцента: aMix ≈ 0 у большинства, у немногих → 1.
    ambientScale[i] = 0.45 + Math.pow(Math.random(), 2.2) * 2.6
    ambientMix[i] = Math.pow(Math.random(), 2.5)
  }
  const ambientGeo = new THREE.BufferGeometry()
  ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambientPos, 3))
  ambientGeo.setAttribute('aPhase', new THREE.BufferAttribute(ambientPhase, 1))
  ambientGeo.setAttribute('aScale', new THREE.BufferAttribute(ambientScale, 1))
  ambientGeo.setAttribute('aMix', new THREE.BufferAttribute(ambientMix, 1))
  const ambientUniforms = {
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(themeColor('--globe-accent')) },
  }
  const ambientMat = new THREE.PointsMaterial({
    size: isMobile ? 0.024 : 0.019,
    map: dotTex,
    color: new THREE.Color(themeColor('--ink-faint')),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  })
  ambientMat.customProgramCacheKey = () => 'ambient-twinkle'
  ambientMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ambientUniforms.uTime
    shader.uniforms.uAccent = ambientUniforms.uAccent
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float aPhase;\nattribute float aScale;\nattribute float aMix;\nuniform float uTime;\nvarying float vTwinkle;\nvarying float vMix;\nvoid main() {',
      )
      .replace(
        'gl_PointSize = size;',
        'vTwinkle = 0.5 + 0.5 * sin(uTime * 0.6 + aPhase);\n\t\tvMix = aMix;\n\t\tgl_PointSize = size * aScale * (0.5 + vTwinkle * 0.9);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uAccent;\nvarying float vTwinkle;\nvarying float vMix;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, uAccent, vMix);\n\tdiffuseColor.a *= 0.35 + vTwinkle * 0.65;',
      )
  }
  const ambient = new THREE.Points(ambientGeo, ambientMat)
  ambient.renderOrder = -1
  holder.add(ambient)

  // ── Города: акцентные точки поверх облака суши, крупнее и ярче ──
  const markerPos = new Float32Array(CITIES.length * 3)
  const markerIndex = new Float32Array(CITIES.length)
  CITIES.forEach((city, i) => {
    const v = latLonToVec3(THREE, city.lat, city.lon, 1.012)
    markerPos.set([v.x, v.y, v.z], i * 3)
    markerIndex[i] = i
  })
  const markerGeo = new THREE.BufferGeometry()
  markerGeo.setAttribute('position', new THREE.BufferAttribute(markerPos, 3))
  // aIndex — номер города для каждой вершины: по нему в шейдере (см.
  // makeSurfaceMaterial выше) сдвигается фаза пульса, свой сдвиг на
  // каждый город — чтобы не мигали в такт друг другу.
  markerGeo.setAttribute('aIndex', new THREE.BufferAttribute(markerIndex, 1))
  const pulseUniforms = { uTime: { value: 0 } }
  const markerMat = makeSurfaceMaterial(THREE, {
    texture: dotTex,
    color: new THREE.Color(themeColor('--globe-accent')),
    size: isMobile ? 0.062 : 0.048,
    pulseUniforms,
    hoverUniforms,
  })
  const markers = new THREE.Points(markerGeo, markerMat)
  markers.renderOrder = 2
  globe.add(markers)

  /* ── Подсветка под курсором: точка на сфере под мышью, а не по маркерам ──
     Луч из камеры пересекает НЕ облако точек (оно решётчатое, ~29% сферы,
     и мимо него курсор постоянно проваливался бы «в пустоту»), а
     аналитическую сферу того же мирового радиуса, что и сам шар
     (THREE.Ray.intersectSphere — готовый метод, без ручной квадратной
     формулы). Дальше точка попадания переводится в локальные координаты
     globe (globe.worldToLocal) — это та же система, в которой лежит
     сырой атрибут position в шейдере (до его собственных transform), так
     что подсветку можно сравнивать прямо в шейдере как cos угла между
     вершиной и точкой под курсором (см. uHoverDir/vGlow выше) — отсюда
     пятно физически облегает кривизну шара, а не рисуется плоским кругом. */
  const raycaster = new THREE.Raycaster()
  const pointerNDC = new THREE.Vector2()
  const hitSphere = new THREE.Sphere()
  const tmpHit = new THREE.Vector3()
  const tmpScale = new THREE.Vector3()
  let hoverTarget = 0
  function updateHoverPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) { hoverTarget = 0; return }
    pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointerNDC, camera)
    hitSphere.center.setFromMatrixPosition(globe.matrixWorld)
    hitSphere.radius = tmpScale.setFromMatrixScale(globe.matrixWorld).x
    if (!raycaster.ray.intersectSphere(hitSphere, tmpHit)) { hoverTarget = 0; return }
    globe.worldToLocal(tmpHit).normalize()
    hoverUniforms.uHoverDir.value.copy(tmpHit)
    hoverTarget = 1
    schedule()
  }
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return
    updateHoverPoint(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointerleave', () => { hoverTarget = 0; schedule() })

  /* ── Меридианы и параллели: широтно-долготная сетка поверх шара ──
     Чисто декоративная навигационная сетка (просьба пользователя
     2026-07-25) — в отличие от границы/городов не привязана ни к каким
     реальным данным, только равномерные широты/долготы. Меридианы —
     открытые дуги от полюса до полюса (не замкнутый круг: один меридиан —
     половина большого круга, вторая половина уходит на противоположную
     долготу отдельной дугой); параллели — замкнутые кольца на
     фиксированной широте. Радиус между сушей (1) и границей (1.006) —
     сетка не должна тонуть в точках земли, но и не спорить по глубине с
     контуром России. cullBackface() обязателен по той же причине, что и
     у border ниже: у THREE.Line нет собственного backface-culling,
     дальняя половина сетки иначе просвечивала бы сквозь ближнюю.
     Дуги и кольца собраны в один LineSegments (см. mergeLines() выше) —
     раньше это были 17 отдельных объектов, то есть 17 draw call'ов.
     renderOrder держим МЕНЬШЕ dotCloud (0): сетка рисуется раньше суши/
     городов/границы, поэтому в океане (где точек суши нет) она видна, а
     под континентами и маркерами — перекрыта ими, а не режет их поверх. */
  const gridMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(themeColor('--ink-faint')),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    depthTest: false,
  })
  cullBackface(gridMat)
  const GRID_R = 1.003
  const gridRings = []
  // меридианы — открытые дуги от полюса до полюса
  for (let lon = 0; lon < 360; lon += 30) {
    const points = []
    for (let lat = -88; lat <= 88; lat += 4) points.push(latLonToVec3(THREE, lat, lon, GRID_R))
    gridRings.push({ points, closed: false })
  }
  // параллели — замкнутые кольца на фиксированной широте
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = []
    for (let lon = 0; lon < 360; lon += 5) points.push(latLonToVec3(THREE, lat, lon, GRID_R))
    gridRings.push({ points, closed: true })
  }
  const grid = new THREE.LineSegments(mergeLines(THREE, gridRings), gridMat)
  grid.renderOrder = -0.5
  globe.add(grid)

  /* ── Контур границы: тонкая линия поверх облака суши ──
     Радиус 1.006 — чуть выше суши (1) и ниже маркеров (1.012), чтобы не
     тонуть в точках земли, но и не спорить с городами. cullBackface() тут
     так же обязателен, как и для точек: у THREE.Line нет собственного
     backface-culling, дальняя половина контура иначе просвечивала бы
     сквозь ближнюю. Все кольца BORDER_RINGS (материк, острова, эксклавы)
     склеены в ОДИН LineSegments — см. mergeLines() выше: раньше на
     каждое кольцо приходился свой draw call, и только контур границы
     стоил 25 вызовов на кадре.

     depthTest выключен нарочно (жалоба 2026-07-24: «свечение под
     курсором перекрывает границу по цвету»). Точки суши — плоские
     спрайты (billboard-квады): при наведении их gl_PointSize растёт
     (см. hoverUniforms/vGlow в makeSurfaceMaterial), и увеличенный квад
     одной точки закрывает своей ОДНОЙ глубиной вершины экранные пиксели
     соседних сегментов границы — геометрически они на сфере дальше, но
     тест глубины сравнивает не истинную кривизну, а плоскую глубину
     квада, и граница проигрывает. Задняя половина контура и так
     отсекается в фрагментном шейдере (cullBackface → vFacing<0 discard),
     поэтому обычный depth-test здесь не нужен для корректности — только
     мешает; border рисуется последним (renderOrder 3) и просто всегда
     поверх точек суши/городов на видимой стороне шара. */
  const borderMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(themeColor('--globe-accent')),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: false,
  })
  cullBackface(borderMat)
  const border = new THREE.LineSegments(
    mergeLines(
      THREE,
      BORDER_RINGS.map((ring) => ({
        points: ring.map(([lon, lat]) => latLonToVec3(THREE, lat, lon, 1.006)),
        closed: true,
      })),
    ),
    borderMat,
  )
  border.renderOrder = 3
  globe.add(border)

  /* ── Тема ──
     Тумблер (nav.js) просто меняет html[data-scheme], без своего события —
     ловим сам атрибут через MutationObserver и красим по факту клика, не
     дожидаясь следующего скролла (иначе шар держал бы старую тему до
     первого движения колеса). */
  const applyTheme = () => {
    dotMat.color.set(themeColor('--ink-faint'))
    markerMat.color.set(themeColor('--globe-accent'))
    borderMat.color.set(themeColor('--globe-accent'))
    glowMat.uniforms.glowColor.value.set(themeColor('--globe-accent'))
    atmoMat.color.set(themeColor('--globe-accent'))
    haloMat.color.set(themeColor('--globe-accent'))
    ambientMat.color.set(themeColor('--ink-faint'))
    gridMat.color.set(themeColor('--ink-faint'))
    ambientUniforms.uAccent.value.set(themeColor('--globe-accent'))
    schedule()
  }
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-scheme'],
  })

  const resize = () => {
    const w = canvas.clientWidth || wrap.clientWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()

  /* ─── Кадры: раньше строго по скроллу/ресайзу, теперь ещё и по таймеру ───
     Положение/разворот шара — по-прежнему чистая функция прогресса
     скролла, но пульс городов (см. makeMarkerMaterial) и подписи, что
     двигаются под курсором, требуют времени, а не только скролла: без
     непрерывного цикла точки не «дышали» бы, пока колесо не шевелится.
     Цикл самоподдерживающийся (render сам ставит себе следующий кадр) и
     живёт только пока секция в вьюпорте (visible) и вкладка активна —
     вне этого окна он не крутится вовсе, так что цена непрерывного rAF
     ограничена ровно временем, когда шар и так на экране. */
  let visible = false
  let raf = 0
  const clockStart = performance.now()

  const schedule = () => {
    if (raf || !visible || document.hidden) return
    raf = requestAnimationFrame(render)
  }

  window.addEventListener('resize', () => { resize(); schedule() })

  new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      visible = e.isIntersecting
      if (visible) schedule()
    }),
    { threshold: 0 },
  ).observe(wrap)

  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule() })

  function render(now) {
    raf = 0

    // gp — прогресс акта с шаром (0 на GLOBE_START, 1 в конце сцены)
    const gp = globeProgress()

    /* Выезд снизу: за первые RISE_END акта шар поднимается и подрастает.
       Всё — и масштаб, и высота — умножается на fit: на узком вертикальном
       экране шар радиуса 1 не влезает в кадр по ширине и превращается
       в безориентирную заливку, поэтому там он мельче. */
    const fit = Math.min(1, Math.max(0.42, camera.aspect / 1.6))
    const rise = RISE_START + (1 - RISE_START) * smooth(clamp01(gp / RISE_END))
    const riseY = fit * (-1.7 + rise * 0.65)

    /* Добор после подъёма: пока шар доворачивается к России (см. turn
       ниже), он ещё и отлетает от камеры и садится ближе к центру кадра —
       так к концу разворота в кадре умещается вся планета целиком, а не
       только верхняя шапка. */
    const settle = smooth(clamp01((gp - RISE_END) / (0.9 - RISE_END)))
    holder.position.y = riseY + settle * fit * 0.9
    holder.position.z = -settle * fit * 1.9
    holder.scale.setScalar(fit * (0.9 + rise * 0.22))

    /* Разворот заканчивается на 90% акта, последние 10% — выдержка
       на России: иначе кадр, ради которого всё затевалось, проскакивает. */
    const turn = smooth(clamp01(gp / 0.9))
    globe.rotation.y = SPIN_FROM + (SPIN_TO - SPIN_FROM) * turn
    globe.rotation.x = TILT_FROM + (TILT_TO - TILT_FROM) * turn
    globe.rotation.z = 0.14

    const t = ((now ?? performance.now()) - clockStart) / 1000
    pulseUniforms.uTime.value = t
    ambientUniforms.uTime.value = t
    // Пыль крутится своим темпом (не SPIN_FROM/SPIN_TO) — фоновый дрейф,
    // независимый от довортота шара к России, детерминирован по времени,
    // а не по кадрам, иначе скорость плыла бы вместе с fps.
    ambient.rotation.y = t * 0.025
    ambient.rotation.x = t * 0.008
    // Лёгкое «дыхание» ореола и внешней атмосферы поверх базовой
    // непрозрачности — в противофазе, чтобы свет не пульсировал в такт, а
    // мягко перетекал между кромкой и рассеянным пятном.
    haloMat.opacity = 0.4 + 0.08 * Math.sin(t * 0.5)
    atmoMat.opacity = 0.36 + 0.06 * Math.sin(t * 0.5 + Math.PI)
    // Плавный переход силы подсветки к цели (0 или 1, см. updateHoverPoint/
    // pointerleave выше) — рывком по pointerenter/leave пятно бы хлопало,
    // а не мягко проступало под курсором.
    hoverUniforms.uHoverStrength.value += (hoverTarget - hoverUniforms.uHoverStrength.value) * 0.15
    renderer.render(scene, camera)

    if (visible && !document.hidden) raf = requestAnimationFrame(render)
  }

  window.addEventListener('scroll', schedule, { passive: true })

  /* Первый кадр рисуем сразу, не дожидаясь наблюдателя: облако могло
     догрузиться уже после того, как секция вошла в экран, и до первого
     колебания скролла шар остался бы непоказанным. */
  visible = true
  schedule()
}

/* Поднимать ли three.js — решено в aboutScene.js: он вешает .is-static в
   тех же случаях (нет WebGL, reduced-motion, экономный трафик), и делает
   это синхронно на загрузке модуля. Здесь просто сверяемся с классом,
   вердикт один на оба модуля.

   Если маска/облако не загрузится на живой сети — оставляем сцену как
   есть: ночь и строку ведёт aboutScene, шара просто не будет. Ронять всю
   сцену в статику посреди прокрутки хуже, чем показать её без планеты. */
if (wrap && canvas && !wrap.classList.contains('is-static')) {
  // подгружаем three и маску только на подходе к секции
  const io = new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return
      obs.disconnect()
      start().catch((e) => console.warn('[globe] сцена шара не поднялась:', e))
    },
    { rootMargin: '600px' },
  )
  io.observe(wrap)
}
