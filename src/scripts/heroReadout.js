/* ─────────────────────────────────────────────
   Курсорный readout AZ/INC в hero.

   Положение курсора над видео читается как условные азимут и зенит —
   деталь приборного языка сайта. Данные НЕ настоящие, и подпись
   «Симуляция датчика» в разметке говорит это прямо. Показывается
   только на устройствах с указателем (см. .hero-readout в CSS).
   ───────────────────────────────────────────── */
const zone = document.querySelector('[data-hero-video]')
const readout = document.querySelector('[data-cursor-readout]')
const az = readout?.querySelector('[data-cursor-az]')
const inc = readout?.querySelector('[data-cursor-inc]')

if (zone && az && inc) {
  const target = zone.closest('.hero-intro') || zone.parentElement
  let raf = 0
  target.addEventListener('mousemove', (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const r = zone.getBoundingClientRect()
      const x = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
      const y = Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1)
      az.textContent = (x * 360).toFixed(1) + '°'
      inc.textContent = (y * 90).toFixed(1) + '°'
    })
  })
}
