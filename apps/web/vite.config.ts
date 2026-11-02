import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Same-origin /api proxy, so the session cookie is first-party (docs/02 §7).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 4000}`, changeOrigin: false, xfwd: true } },
  },
});
