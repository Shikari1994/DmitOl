// Префиксует путь к статике значением base (import.meta.env.BASE_URL),
// чтобы ассеты работали и в корне (реальный домен), и на под-пути GitHub Pages (/DmitOl/).
export const asset = (p) =>
  import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + String(p).replace(/^\//, '')
