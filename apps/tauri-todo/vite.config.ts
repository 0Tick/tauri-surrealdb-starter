import { defineConfig } from "vite";

export default defineConfig({
  // Vite dev server for Tauri
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Tell Vite to ignore watching the Rust side (Tauri handles it)
      ignored: ["**/src-tauri/**"],
    },
  },
  // Prevent Vite from obscuring Rust panics
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri targets Chromium on desktop and WKWebView on iOS/macOS
    target: "chrome105",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
