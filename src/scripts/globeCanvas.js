/* ─────────────────────────────────────────────
   ГЛОБУС · финал раздела «О компании»

   Один прогресс скролла (0…1 по длине обёртки .atlas, см. aboutScene.js)
   ведёт всю сцену:
     0.00–0.88  строка сверху набирается по словам (см. GEO_END там же)
     0.00–0.30  земной шар выезжает снизу и подрастает (RISE_END ниже)
     0.30–0.90  шар отлетает от камеры и доворачивается к России —
                к концу виден целиком, не только шапкой

   Шар собран из точек, а не из фото-модели: маска суши
   (public/planet-mask.jpg, ч/б equirect, суша чёрная) и сама техника
   взяты из MIT-репозитория github.com/inverser-pro/threejs-webgl-planet-
   for-production и переписаны под эту сцену. Каждая точка — либо
   кандидат Фибоначчи-сферы (суша), либо один из городов-акцентов.

   Все цвета — токены темы, а не пиксели текстуры, поэтому светлая и
   тёмная схема красят шар нативно, без CSS-фильтра поверх канваса.

   three.js грузится динамически и только на подходе секции к экрану:
   на первый экран страницы этот вес не ложится.

   Шар выходит НЕ после карточек, а вместе с ними — с самого начала
   прокрутки из-за нижней кромки видна его шапка. Разворот кончается на
   90% прокрутки, последние 10% — выдержка на России.

   Поднимать ли three.js, решает aboutScene.js: он вешает .is-static (нет
   WebGL, reduced-motion, экономный трафик). Здесь мы только уважаем этот
   класс — своей проверки нет, чтобы вердикт был один на оба модуля.
   ───────────────────────────────────────────── */
import { asset } from '../lib/asset.js'
import { makeProgress, span, clamp01, smooth } from './scrollProgress.js'
/* Сцена собирается здесь, а её детали живут в globe/*: данные (реальные
   координаты городов и границы), geo (математика сферы, маска суши,
   склейка полилиний) и materials (патч шейдера, материал точек, три
   процедурные текстуры, чтение токенов темы). Разделение чисто
   читательское — все три модуля не знают ни про скролл, ни про DOM, а
   THREE им передаётся параметром, потому что грузится динамически. */
import { CITIES, BORDER_RINGS } from './globe/data.js'
import { latLonToVec3, loadMask, buildDotCloud, mergeLines } from './globe/geo.js'
import { createCityLabels } from './globe/labels.js'
import {
  themeColor,
  cullBackface,
  makeSurfaceMaterial,
  makeDotTexture,
  makeHaloTexture,
  makeAtmosphereTexture,
} from './globe/materials.js'

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
   При 0.85 верх шара уже у центра кадра с первого кадра секции, дальше
   он только дорастает и уходит в разворот.
   ДЕРЖАТЬ СТРОГО ≤ 1: rise едет к цели 1.0, и большее значение
   разворачивает подъём в проседание — шар вжимается вниз и сжимается,
   пока поворот уже идёт, и это читается как «крутится на месте». */
const RISE_START = 0.85

/* Разворот и завал полюса, в радианах. Углы не подобраны на глаз, а
   решены численно: точка-цель (центр территории России, lat 63/lon 95)
   прогонялась через матрицу three.js для Euler-порядка 'XYZ' в поиске
   (x, y), при которых цель развёрнута к камере. Держать в паре с CITIES
   (globe/data.js) и latLonToVec3 (globe/geo.js) — при их смене
   пересчитать. TILT_FROM/SPIN_FROM — не точка решения, а только старт,
   откуда мы в неё приходим. */
const SPIN_FROM = -0.35
const SPIN_TO = 2.79
const TILT_FROM = 0.51
const TILT_TO = 1.01

/* Подписи городов (globe/labels.js) проявляются только на подходе к
   финалу: раньше шар ещё разворачивается, точки едут через полкадра, и
   выноски за ними мотало бы вместе с перекладкой. К LABELS_END разворот
   уже кончился (0.9 акта), подписи стоят на устоявшихся местах. */
const LABELS_IN = 0.62
const LABELS_END = 0.9

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
     (см. makeSurfaceMaterial в globe/materials.js и updateHoverPoint
     ниже): uHoverDir — точка на единичной сфере под курсором в локальных
     координатах шара, uHoverStrength — 0…1, плавно едет к цели каждый
     кадр в render(), а не скачет по pointerenter/leave. */
  const hoverUniforms = {
    uHoverDir: { value: new THREE.Vector3(0, 0, 1) },
    uHoverStrength: { value: 0 },
  }

  /* ── Суша: облако точек, радиус сферы = 1 (масштабируют holder/globe) ──
     Сплошным шар делают ДВА механизма, и оба нужны. depthWrite:true —
     иначе ближняя и дальняя стороны рисуются вперемешку (сортировки
     точек внутри одного draw call нет). Но там, где на луче камеры нет
     ближней точки вообще (пусто между спрайтами), depth-тест дальнюю
     ничем не блокирует, и сквозь шар просвечивает узор с изнанки —
     этот случай закрывает патч шейдера в makeSurfaceMaterial(). */
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
     Радиус 1.02 — минимальный запас снаружи самой дальней точки
     (маркеры городов на 1.012). Меньше — и точки торчат наружу за
     ореол; заметно больше (пробовали 1.05) — ореол отрывается от них
     отдельным кольцом. Нужен тонкий запас, а не зазор.

     FrontSide + depthTest против уже отрисованных точек: там, где перед
     оболочкой есть точка, свечение перекрыто, видно только кромку и
     промежутки.

     Коэффициент в `1.0 - dot` держать РОВНО 1.0: pow() с отрицательным
     основанием в GLSL — undefined, и драйвер рисует что угодно. С
     BackSide и коэффициентом 0.68 основание уходило в минус почти по
     всей полусфере, давая сплошную синюю заливку вместо ободка. */
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
  // SphereGeometry, не Icosahedron: у сферы нет фасеток на нормали, а
  // любая огранка на fresnel-градиенте видна сразу.
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.02, 64, 40), glowMat)
  glow.renderOrder = 1
  globe.add(glow)

  /* ── Внешняя атмосфера: мягкое сияние у кромки шара ──
     Свет должен выходить ЗА силуэт и угасать наружу без геометрической
     границы, поэтому спрайт с КОЛЬЦЕВЫМ градиентом, а не сфера: у сферы
     жёсткий внешний край, и свет обрывается на нём дешёвым двойным
     кольцом. Масштаб подобран так, чтобы пик градиента (радиус ~0.72
     текстуры) лёг ровно на кромку шара: 2 / 0.72 ≈ 2.8. */
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
     Fresnel выше обрисовывает только кромку силуэта и сцену вокруг шара
     не заполняет. Это большое билборд-пятно: спрайт всегда развёрнут на
     камеру, вращение holder/globe его не касается — он наследует только
     позицию и масштаб. Рисуется раньше всего остального и без записи в
     depth, просто мягкая заливка на заднем плане. */
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
     Единственный слой без привязки к реальным координатам, чистая
     декорация. Крутится своим темпом, независимым от SPIN_FROM→SPIN_TO:
     иначе доворот к России читался бы вперемешку с фоновым дрейфом.
     Culling задней стороны здесь не нужен — частицы не лежат на
     поверхности. Разброс размера (aScale) и примесь акцента (aMix)
     дают живой неоднородный слой: мелкая нейтральная пыль плюс редкие
     крупные искры, а не ровная сыпь одинаковых точек. */
  const AMBIENT_COUNT = isMobile ? 220 : 520
  const ambientPos = new Float32Array(AMBIENT_COUNT * 3)
  const ambientPhase = new Float32Array(AMBIENT_COUNT)
  const ambientScale = new Float32Array(AMBIENT_COUNT)
  const ambientMix = new Float32Array(AMBIENT_COUNT)
  for (let i = 0; i < AMBIENT_COUNT; i++) {
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const rXZ = Math.sqrt(1 - u * u)
    // Степень >1 тянет радиус к нижней границе: большинство частиц
    // ложится плотной оболочкой у поверхности шара, немногие залетают
    // дальше — вокруг планеты читается корона, а не ровная россыпь
    // звёзд по всему фону.
    const r = 1.12 + Math.pow(Math.random(), 2.4) * 1.5
    ambientPos.set([r * rXZ * Math.cos(theta), r * u, r * rXZ * Math.sin(theta)], i * 3)
    ambientPhase[i] = Math.random() * Math.PI * 2
    // Та же степень и с тем же смыслом: у большинства частиц масштаб
    // мал, крупные искры редки. То же для примеси акцента.
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
  // aIndex — номер города: по нему шейдер (globe/materials.js) сдвигает
  // фазу пульса, чтобы города не мигали в такт друг другу.
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

  /* ── Подписи городов ──
     DOM-слой поверх канваса, не текст в сцене: см. шапку globe/labels.js.
     На телефоне не поднимаем вовсе — кадр там делят заголовок сверху и
     колонка услуг снизу, свободного поля под выноски не остаётся, а сам
     шар вдвое мельче (fit в render()).

     В препятствия отдаются блоки, которые реально закрашены, а не их
     общая обёртка: у .atlas-copy бокс идёт до трети ширины кадра, но
     подзаголовок в нём узкий (max-width 30ch), а кнопка и того короче —
     справа от них остаётся широкая пустая полоса, и подписям Москвы с
     Петербургом больше некуда встать. Строки .atlas-head поштучно эту
     полосу освобождают. */
  const pinHost = wrap.querySelector('[data-atlas-pins]')
  const labels = !isMobile && pinHost
    ? createCityLabels(THREE, {
      host: pinHost,
      camera,
      globe,
      obstacles: [...wrap.querySelectorAll('.atlas-head > *'), wrap.querySelector('.atlas-deck')],
    })
    : null

  /* ── Подсветка под курсором ──
     Луч пересекает не облако точек, а аналитическую сферу того же
     мирового радиуса: облако решётчатое (~29% сферы), и курсор
     постоянно проваливался бы в пустоту между точками.

     Точка попадания переводится в ЛОКАЛЬНЫЕ координаты globe — ту же
     систему, в которой лежит сырой атрибут position в шейдере. Поэтому
     подсветку можно сравнивать прямо там как cos угла между вершиной и
     точкой под курсором, и пятно облегает кривизну шара, а не рисуется
     плоским кругом поверх. */
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

  /* ── Меридианы и параллели ──
     Декоративная сетка: в отличие от границы и городов не привязана ни
     к каким данным, только равномерные широты и долготы. Меридианы —
     открытые дуги от полюса до полюса, параллели — замкнутые кольца.
     Радиус между сушей (1) и границей (1.006): не тонуть в точках земли
     и не спорить по глубине с контуром России.

     cullBackface() обязателен — у THREE.Line нет своего backface-culling,
     и дальняя половина сетки просвечивала бы сквозь ближнюю. Все дуги
     собраны в ОДИН LineSegments (mergeLines): 17 объектов — это 17 draw
     call'ов на кадр.

     renderOrder МЕНЬШЕ dotCloud: сетка рисуется раньше суши, поэтому
     видна в океане и перекрыта континентами, а не режет их поверх. */
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
     Радиус 1.006 — выше суши (1) и ниже маркеров (1.012). Все кольца
     BORDER_RINGS склеены в ОДИН LineSegments: на каждое кольцо своим
     объектом приходилось 25 draw call'ов на кадр.

     depthTest выключен НАРОЧНО. Точки суши — плоские billboard-квады, и
     при наведении их gl_PointSize растёт; увеличенный квад закрывает
     своей ОДНОЙ глубиной вершины экранные пиксели соседних сегментов
     границы. Геометрически те на сфере дальше, но тест сравнивает не
     истинную кривизну, а плоскую глубину квада, и граница проигрывает.
     Для корректности depth-test здесь не нужен: заднюю половину контура
     и так отсекает cullBackface, а border рисуется последним. */
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
     Тумблер (nav.js) меняет html[data-scheme] без своего события,
     поэтому ловим атрибут MutationObserver'ом: иначе шар держал бы
     старую тему до первого движения колеса. */
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
    labels?.resize()
  }
  resize()

  /* ─── Кадры ───
     Положение и разворот шара — чистая функция прогресса скролла, но
     пульс городов и подсветка под курсором требуют ВРЕМЕНИ: без
     непрерывного цикла точки не «дышали» бы, пока колесо не шевелится.
     Цикл самоподдерживающийся (render сам ставит себе следующий кадр) и
     живёт только пока секция в вьюпорте и вкладка активна — цена rAF
     ограничена временем, когда шар и так на экране. */
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
    // Пыль дрейфует своим темпом, независимо от доворота шара. По
    // ВРЕМЕНИ, а не по кадрам — иначе скорость плывёт вместе с fps.
    ambient.rotation.y = t * 0.025
    ambient.rotation.x = t * 0.008
    // Лёгкое «дыхание» ореола и внешней атмосферы поверх базовой
    // непрозрачности — в противофазе, чтобы свет не пульсировал в такт, а
    // мягко перетекал между кромкой и рассеянным пятном.
    haloMat.opacity = 0.4 + 0.08 * Math.sin(t * 0.5)
    atmoMat.opacity = 0.36 + 0.06 * Math.sin(t * 0.5 + Math.PI)
    // Плавный переход силы подсветки к цели: рывком по pointerenter/
    // leave пятно хлопало бы, а не проступало под курсором.
    hoverUniforms.uHoverStrength.value += (hoverTarget - hoverUniforms.uHoverStrength.value) * 0.15
    renderer.render(scene, camera)

    /* Строго ПОСЛЕ рендера: проекция городов читает globe.matrixWorld, а
       его обновляет сам renderer.render(). До вызова матрица отстаёт на
       кадр, и выноски тянулись бы за точками с задержкой. */
    labels?.update(smooth(span(gp, LABELS_IN, LABELS_END)))

    if (visible && !document.hidden) raf = requestAnimationFrame(render)
  }

  window.addEventListener('scroll', schedule, { passive: true })

  /* Первый кадр рисуем сразу, не дожидаясь наблюдателя: облако могло
     догрузиться уже после того, как секция вошла в экран, и до первого
     колебания скролла шар остался бы непоказанным. */
  visible = true
  schedule()
}

/* Вердикт «поднимать ли three.js» один на оба модуля: .is-static вешает
   aboutScene.js синхронно на загрузке, здесь мы только сверяемся.

   Если маска или облако не загрузятся — сцену не роняем: ночь и строку
   ведёт aboutScene, шара просто не будет. Уронить всю сцену в статику
   посреди прокрутки хуже, чем показать её без планеты. */
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
