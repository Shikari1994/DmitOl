import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// site/base управляются env, чтобы один репозиторий собирался и под реальный
// домен (корень), и под GitHub Pages (под-путь /DmitOl/).
// Локально и для прод-домена: base='/'. Для Pages CI задаёт BASE_PATH=/DmitOl.
export default defineConfig({
  site: process.env.SITE || 'https://geo-tn.com',
  base: process.env.BASE_PATH || '/',
  integrations: [sitemap()],
  server: { host: true, port: 5173 },
  // three.js загружается лениво в сцене «О компании». Не пропускаем его через
  // Vite optimizeDeps: при пересборке кэша URL оптимизированного чанка меняется,
  // и уже открытая страница получает 504 «Outdated Optimize Dep» вместо глобуса.
  vite: {
    optimizeDeps: {
      exclude: ['three'],
    },
  },
})
