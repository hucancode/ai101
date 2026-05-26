import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  resolve: {
    alias: {
      mujoco_wasm: 'mujoco-js/dist/mujoco_wasm.js'
    }
  },
  optimizeDeps: {
    exclude: ['mujoco-js']
  }
});
