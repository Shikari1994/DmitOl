/* ─────────────────────────────────────────────
   ГЛОБУС · финал раздела «О компании»

   Один прогресс скролла (0…1 по длине обёртки .atlas, см. aboutScene.js)
   ведёт всю сцену:
     0.00–0.88  строка сверху набирается по словам (см. GEO_END там же)
     0.00–0.30  земной шар выезжает снизу и подрастает (RISE_END ниже)
     0.30–0.90  шар отлетает от камеры и доворачивается к России —
                к концу виден целиком, не только шапкой

   Модель (globe.glb) несёт собственные точки аэропортов, запечённые
   в геометрию отдельными мешами с оранжевым материалом — в отличие от
   прежней earth_orbit1.glb, здесь нет ни орбитального спутника, ни
   анимационных клипов, скрывать/останавливать нечего.

   Цвет модели не трогаем: материалы идут как есть из .glb, сцена даёт
   только свет.

   three.js и .glb (~4.7 МБ) грузятся динамически и только когда секция
   подходит к экрану: на первый экран страницы этот вес не ложится.

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
   с самого старта (при gp=0 шар уже приподнят на сливер, см. rise ниже) —
   раньше сливер не читался (сам подъём растягивался на 60% акта, то есть
   больше двух высот экрана прокрутки, прежде чем шар становился заметен —
   ощущалось мёртвой зоной). Подъём теперь укладывается в RISE_END.

   Было 0.9, потом сжато до 0.675 (разворот заканчивался слишком рано
   относительно длины всей обёртки .atlas — от конца разворота до конца
   скролла оставалось ещё ~40% высоты .atlas, где ничего не менялось:
   шар уже развёрнут, карточки и текст уже показаны, а листать ещё
   нужно было, стоя на месте). Вместо возврата к 0.9 (это опять растянуло
   бы сам разворот) высота .atlas в index.css уменьшена пропорционально,
   а GLOBE_END поднят обратно к концу шкалы — абсолютная длина скролла на
   разворот та же, но теперь он оканчивается у самого конца обёртки,
   держать в паре с GEO_END в aboutScene.js и NIGHT_FULL там же. */
const GLOBE_END = 0.98

/* Доля gp, за которую шар успевает подняться и подрасти (см. rise ниже).
   Раньше подъём растягивался до 0.6 — на секции высотой несколько экранов
   это добрых два экрана прокрутки, прежде чем шар становился заметно
   виден. Сжато втрое: шар читается почти сразу после того, как сцена
   прилипла к экрану, а не после долгого мёртвого участка. */
const RISE_END = 0.3

/* Разворот и завал полюса, в радианах.

   Отправная точка бралась не на глаз: в сцену временно ставились метки
   в координатах Москвы, Новосибирска и Якутска, и перебором искалось
   положение, где все три выходят на ближнюю к зрителю сторону шара.
   Дальше значения доводились по кадру (SPIN_TO/TILT_TO — по обратной связи
   «Россия должна смотреть на нас», довёрнуты сильнее исходной находки).

   Одной долготы тут мало. Пока шар подрастает (rise), в кадр попадает
   только верхняя шапка — его лицевая сторона лежит ниже нижней кромки
   экрана, — и без завала полюса Россия при любой долготе оставалась бы на дальней
   кромке, сплюснутой полосой. */
const SPIN_FROM = -4.4
const SPIN_TO = 0.25
const TILT_FROM = 0.28
const TILT_TO = 0.82

/* Прогресс всей сцены (0…1) считает общий модуль. gp — тот же прогресс,
   поджатый к диапазону выхода шара [0 … GLOBE_END]; по нему идут выход,
   рост и разворот. */
const progress = wrap ? makeProgress(wrap, stage) : () => 0
const globeProgress = () => span(progress(), 0, GLOBE_END)

async function start() {
  const [THREE, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ])

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  /* Плотность буфера на телефоне режем до 1.5: у сцены дорогой пиксель
     (PBR-материалы шара с текстурой 1024×1024), и на экране с
     dpr 3 полный ×2 означал вчетверо больше работы на закраску, чем
     на десктопе. Разницы на глаз при такой мелкой картинке нет —
     шар занимает нижнюю треть экрана, — а кадры перестают проседать. */
  const dprCap = window.matchMedia('(max-width: 900px)').matches ? 1.5 : 2
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 0, 3.2)

  /* Свет нейтральный (белый): материал поверхности не зеркальный
     (KHR_materials_specular с specularFactor 0), красит шар только
     собственная текстура — цветной свет её тонировал бы. */
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(-2.4, 2.2, 2.6)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xffffff, 0.5)
  rim.position.set(2.6, -1.2, -1.8)
  scene.add(rim)

  // группа-обёртка: скролл двигает её, вращение живёт на globe
  const holder = new THREE.Group()
  scene.add(holder)
  const globe = new THREE.Group()
  holder.add(globe)

  const gltf = await new GLTFLoader().loadAsync(asset('/globe.glb'))
  const model = gltf.scene

  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  // радиус берём как половину габарита, а не описанной сферы: у Box3
  // getBoundingSphere возвращает сферу вокруг КУБА, то есть R·√3 —
  // от этого шар выходил в полтора раза мельче
  const radius = Math.max(...box.getSize(new THREE.Vector3()).toArray()) / 2
  model.position.sub(center)
  const norm = new THREE.Group()
  norm.add(model)
  norm.scale.setScalar(1 / radius)
  globe.add(norm)


  const resize = () => {
    const w = canvas.clientWidth || wrap.clientWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()

  /* ─── Кадры считаются только по факту скролла/ресайза, не по таймеру ───
     Раньше здесь крутился свободный rAF-цикл: пока секция на экране (а это
     несколько высот вьюпорта из-за pin), браузер рисовал по 60 кадров в
     секунду даже когда пользователь стоит на месте и gp не меняется — сцена
     чистая функция прогресса скролла, кадр без движения строго идентичен
     предыдущему. WebGL-рендер вхолостую конкурировал за GPU/compositor
     с соседними стеклянными карточками (.atlas-deck, backdrop-filter) в
     той же сцене — заметный вклад в подтормаживание при скролле через
     блок «О компании». Теперь рендер идёт тем же приёмом, что и соседний
     aboutScene.js: по нативному scroll-событию (Lenis его шлёт) и по
     ресайзу, прижатый к кадру через rAF. */
  let visible = false
  let raf = 0

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

  function render() {
    raf = 0

    // gp — прогресс акта с шаром (0 на GLOBE_START, 1 в конце сцены)
    const gp = globeProgress()

    /* Выезд снизу: за первые RISE_END акта шар поднимается и подрастает.
       Всё — и масштаб, и высота — умножается на fit: на узком вертикальном
       экране шар радиуса 1 не влезает в кадр по ширине и превращается
       в безориентирную заливку, поэтому там он мельче. */
    const fit = Math.min(1, Math.max(0.42, camera.aspect / 1.6))
    const rise = smooth(clamp01(gp / RISE_END))
    /* Конечная высота подобрана по России: на меньшем подъёме её южная
       граница уходила под нижнюю кромку экрана — страна упиралась в край
       кадра вместо того, чтобы поместиться целиком. Стартовая высота —
       не «с нуля», а уже с приподнятым на сливер шаром (см. заметку у
       RISE_END): у самой sticky-кромки должно быть видно, что сцена
       ожила, а не полотно с пустым низом. */
    const riseY = fit * (-1.7 + rise * 0.65)

    /* Добор после подъёма: пока шар доворачивается к России (см. turn
       ниже), он ещё и отлетает от камеры и садится ближе к центру кадра —
       так к концу разворота в кадре умещается вся планета целиком, а не
       только верхняя шапка. Окно [RISE_END…0.9] — сразу после подъёма и
       вместе с разворотом, чтобы оба движения читались одним слитным
       жестом. */
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

    renderer.render(scene, camera)
  }

  window.addEventListener('scroll', schedule, { passive: true })

  /* Первый кадр рисуем сразу, не дожидаясь наблюдателя: модель могла
     догрузиться уже после того, как секция вошла в экран, и до первого
     колебания скролла шар остался бы непоказанным. */
  visible = true
  schedule()
}

/* Поднимать ли three.js — решено в aboutScene.js: он вешает .is-static в
   тех же случаях (нет WebGL, reduced-motion, экономный трафик), и делает
   это синхронно на загрузке модуля. Здесь просто сверяемся с классом,
   вердикт один на оба модуля.

   Если модель не загрузится на живой сети — оставляем сцену как есть:
   ночь и строку ведёт aboutScene, шара просто не будет. Ронять всю
   сцену в статику посреди прокрутки хуже, чем показать её без планеты. */
if (wrap && canvas && !wrap.classList.contains('is-static')) {
  // подгружаем three и модель только на подходе к секции
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
