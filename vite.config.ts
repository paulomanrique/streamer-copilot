import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    // No hot reload: the app stays open while the streamer is live, and a
    // mid-session reload wipes UI state. Changes are picked up by closing
    // and reopening the app (or Ctrl+R).
    hmr: false,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
});
