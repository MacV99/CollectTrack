// @ts-check
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

// Build estático (el backend es Google Sheets, no se necesita SSR).
export default defineConfig({
  output: 'static',
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      // Inyección manual del registro y del <link manifest> en Layout.astro
      // (más robusto con esta combinación Astro 5 + plugin).
      injectRegister: false,
      manifest: {
        name: 'CollectTrack',
        short_name: 'CollectTrack',
        description: 'Seguimiento de cobros y finanzas personales',
        lang: 'es',
        theme_color: '#13e7c3',
        background_color: '#080808',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precachea el shell estático generado por el build (assets hasheados).
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // Google Sheets / Apps Script siempre por red (no se cachean).
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('script.google.com') ||
              url.hostname.includes('googleusercontent.com') ||
              url.hostname.includes('googleapis.com'),
            handler: 'NetworkOnly',
          },
        ],
      },
      // En dev no generamos SW (evita ruido de HMR); se prueba en build/preview.
      devOptions: { enabled: false },
    }),
  ],
});
