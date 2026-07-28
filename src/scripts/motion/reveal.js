/* ─── Появление .reveal + шаги и прогресс-линия «Как работает» ───
   Финальный ScrollTrigger.refresh() и слушатель load намеренно стоят в
   КОНЦЕ этого модуля: они обязаны идти после создания триггеров
   .reveal/How, но до модулей sheen/mobile ниже по barrel. */
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE, reduce } from './env.js'

if (reduce) {
  gsap.set('.reveal', { opacity: 1, y: 0 })
} else {
  // сдержанное появление: короткий сдвиг и почти синхронный выход группы
  ScrollTrigger.batch('.reveal', {
    start: 'top 85%',
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: EASE,
        stagger: 0.05,
        overwrite: true,
      }),
  })

  // Прогресс-линия «Как работает»: высота заливки = прогресс скролла
  // сквозь блок шагов. Узел загорается НЕ своим триггером, а в момент,
  // когда конец заливки поравнялся с его центром — одна точка отсчёта на
  // оба эффекта, поэтому подсветка не может разъехаться с линией.
  const fill = document.querySelector('.how-line-fill')
  const line = document.querySelector('.how-line')
  const steps = document.querySelector('.steps')
  const done = document.querySelector('.how-done')
  const stepEls = steps ? Array.from(steps.querySelectorAll('.step')) : []
  const nodes = steps ? steps.querySelectorAll('.step-node') : []
  if (fill && line && steps && nodes.length) {
    // трек и заливка идут от центра первого узла до центра последнего
    let topY = 0
    let span = 0
    let offsets = []
    const layout = () => {
      const sr = steps.getBoundingClientRect()
      const first = nodes[0].getBoundingClientRect()
      const last = nodes[nodes.length - 1].getBoundingClientRect()
      topY = first.top - sr.top + first.height / 2
      span = last.top - sr.top + last.height / 2 - topY
      offsets = Array.from(nodes).map((n) => {
        const r = n.getBoundingClientRect()
        return r.top - sr.top + r.height / 2 - topY
      })
      gsap.set(line, { top: topY, bottom: 'auto', height: span })
      gsap.set(fill, { top: topY })
    }
    layout()
    ScrollTrigger.create({
      trigger: steps,
      // «линия сканирования» на 60% экрана: 0 — когда верх шагов на ней,
      // 1 — когда низ шагов её прошёл
      start: 'top 60%',
      end: 'bottom 60%',
      onRefresh: layout,
      onUpdate: (self) => {
        const fillHeight = span * self.progress
        gsap.set(fill, { height: fillHeight })
        stepEls.forEach((step, i) => {
          step.classList.toggle('is-visible', fillHeight >= offsets[i])
        })
        // достигли низа блока → состояние «цель достигнута»
        const complete = self.progress > 0.985
        steps.classList.toggle('is-complete', complete)
        if (done) done.classList.toggle('show', complete)
      },
    })
  }

  ScrollTrigger.refresh()
  // пересчёт после загрузки изображений, чтобы триггеры не съезжали
  window.addEventListener('load', () => ScrollTrigger.refresh())
}
