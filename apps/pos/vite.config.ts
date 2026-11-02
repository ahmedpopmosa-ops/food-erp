import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

/**
 * Browser POS. The shared packages are built as CommonJS for Node; here they are compiled from their
 * TypeScript sources instead (ES modules). SQLite WASM runs in a worker with the OPFS pool VFS, which needs no
 * cross-origin isolation headers. `/api` is proxied to the API like the dashboard.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@ros/pos-core': pkg('pos-core'),
      '@ros/domain': pkg('domain'),
      '@ros/contracts': pkg('contracts'),
    },
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    port: 5174,
    strictPort: true,
    // The monorepo root (shared packages, hoisted node_modules with the SQLite WASM file), named explicitly
    // instead of relying on Vite finding the workspace root from the root package.json.
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    proxy: { '/api': { target: `http://localhost:${process.env.API_PORT ?? 4000}`, changeOrigin: false, xfwd: true } },
  },
});
