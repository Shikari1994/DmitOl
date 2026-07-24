/* ─── Шапка перенимает тему секции, проходящей под ней ───
   rootMargin схлопывает область наблюдения до полоски у верхней
   кромки экрана: «видимой» считается ровно та секция, что сейчас
   под шапкой. Работает и при reduced-motion — это не анимация,
   а читаемость текста на меняющемся фоне.

   На стыке секций полоску на мгновение пересекают сразу две — верхняя
   из видимых берётся по DOM-порядку (последняя = рисуется поверх).
   Реагировать на каждое событие по отдельности здесь нельзя — секция,
   переставшая пересекать полоску, события не шлёт, и на обратном
   скролле шапка застревала бы в чужой теме. */
{
  const nav = document.querySelector('nav.nav')
  const themed = [...document.querySelectorAll('[data-theme]')]
  if (nav && themed.length && 'IntersectionObserver' in window) {
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)))
        for (let i = themed.length - 1; i >= 0; i--) {
          if (visible.has(themed[i])) {
            nav.setAttribute('data-theme', themed[i].dataset.theme)
            break
          }
        }
      },
      { rootMargin: '0px 0px -100% 0px', threshold: 0 },
    )
    themed.forEach((s) => io.observe(s))
  }
}
