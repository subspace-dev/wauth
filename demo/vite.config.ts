import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from "vite-plugin-node-polyfills"
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  base: "./",
  server: {
    port: 5174
  },
  resolve: {
    alias: {
      // Resolve to source files instead of built packages
      '@wauth/strategy': path.resolve(__dirname, '../strategy/src/index.ts'),
      '@wauth/sdk': path.resolve(__dirname, '../sdk/src/index.ts'),
    }
  },
  // optimizeDeps: {
  // Include these packages in dependency pre-bundling
  // include: ['@wauth/strategy', '@wauth/sdk']
  // }
})
