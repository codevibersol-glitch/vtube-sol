import { defineConfig } from 'vite';

const wasmMimePlugin = () => ({
  name: 'wasm-mime',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [wasmMimePlugin()],
  assetsInclude: ['**/*.wasm'],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'esbuild',
  },
  server: {
    port: 3000,
    open: true,
    // COEP/COOP are only needed for SharedArrayBuffer (WASM threads).
    // MediaPipe Holistic v0.5 uses SIMD but NOT threads, so these headers
    // are not required and actually break XHR fetches of the .data bundle
    // (the packed-assets loader doesn't set CORS mode on its XHR request).
  },
  preview: {
    port: 4173,
  },
});
