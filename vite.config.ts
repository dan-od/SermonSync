import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
    server: {
      // Tauri's devUrl is fixed at 1420. Do not silently move Vite to another
      // port, which makes the Tauri window load a stale/404 page.
      strictPort: true,
      watch: {
      ignored: ["**/src-tauri/**"],
    },
    port: 1420,
  },
})
