import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiTarget =
  process.env.VITE_API_BASE_URL ||
  process.env.BACKEND_TARGET ||
  `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || '8000'}`;

const wsTarget = apiTarget.replace(/^http/i, 'ws');

export default defineConfig({
  plugins: [react()],
  envPrefix: 'VITE_',
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
  },
});
