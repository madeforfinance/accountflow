import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Emits dist/precache.json listing every built asset so the service
 *  worker can precache the whole app shell on install (offline-first). */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /\.(js|css|html|svg|png|ico|json)$/.test(f) && f !== 'sw.js')
        .map((f) => `/${f}`);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
