/* ─── Прогресс прокрутки сквозь прибитую сцену ───
   0 — сцена только прилипла к верхней кромке, 1 — обёртка кончилась.

   Модуль отдельный, потому что счётчиков два: перечень услуг с ночью
   ведёт aboutScene.js, шар — globeCanvas.js. Оба обязаны считать ОДНО
   число: разойдись они на пару процентов — и список кончится не там,
   где шар доворачивается.

   Вычитается высота САМОЙ сцены, а не окна: сцена стоит в 100svh (малый
   вьюпорт), а window.innerHeight на мобильном гуляет вместе с адресной
   строкой, и прогресс приходил к единице не в конце обёртки. */
export const clamp01 = (v) => Math.min(1, Math.max(0, v))

/* линейный ремап: доля пути между from и to, с обрезкой по краям.
   Им нарезаны все фазы сцены — перечень, ночь, набор строки, уход. */
export const span = (p, from, to) => clamp01((p - from) / (to - from))

export const smooth = (t) => t * t * (3 - 2 * t)

export function makeProgress(wrap, stage) {
  return () => {
    const r = wrap.getBoundingClientRect()
    const len = r.height - (stage?.offsetHeight || window.innerHeight)
    return len > 0 ? clamp01(-r.top / len) : 0
  }
}
