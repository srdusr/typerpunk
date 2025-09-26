import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@typerpunk/wasm': path.resolve(__dirname, '../crates/wasm/pkg')
    }
  },
  server: {
    port: 3000,
    fs: {
      allow: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../crates/wasm/pkg'),
        path.resolve(__dirname, '../crates/wasm/target'),
      ]
    }
  },
  optimizeDeps: {
    exclude: ['@typerpunk/wasm']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'wasm': ['@typerpunk/wasm']
        }
      }
    }
  }
}); 