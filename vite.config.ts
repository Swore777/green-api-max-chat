import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // относительные пути — сборку можно положить в любую папку или на GitHub Pages
  base: './',
  server: { host: true },
});
