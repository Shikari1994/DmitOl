/* ─────────────────────────────────────────────
   ГЛОБУС · материалы, текстуры и цвета темы

   Всё, из чего сделана поверхность шара: патч шейдера, отсекающий
   дальнюю сторону, материал точек (суша + города) и три процедурные
   текстуры — точка, ореол, атмосфера. Плюс themeColor(): единая точка
   чтения токенов CSS, через неё сцена берёт цвета текущей схемы.
   ───────────────────────────────────────────── */

/* Объект getComputedStyle живой — он отражает актуальные значения и после
   смены html[data-scheme], поэтому держим один на весь модуль вместо
   нового вызова на каждый из девяти цветов (сам вызов способен
   форсировать пересчёт стиля). Значения на выходе те же. */
let rootStyle = null
export const themeColor = (name) => {
  if (!rootStyle) rootStyle = getComputedStyle(document.documentElement)
  return rootStyle.getPropertyValue(name).trim()
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
export function cullBackface(material) {
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
export function makeSurfaceMaterial(THREE, { texture, color, size, opacity = 1, pulseUniforms, hoverUniforms }) {
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
export function makeDotTexture(THREE) {
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
export function makeHaloTexture(THREE) {
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
export function makeAtmosphereTexture(THREE) {
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
