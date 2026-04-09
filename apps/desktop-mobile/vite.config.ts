import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

declare const process: {
  env: Record<string, string | undefined>;
};

const tauriDevHost = process.env.TAURI_DEV_HOST || "0.0.0.0";
const isAndroid = process.env.TAURI_ENV_PLATFORM === "android";

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: {
      "@starter/surrealdb-js-tauri": fileURLToPath(
        new URL(
          "../../packages/surrealdb-js-tauri/src/index.ts",
          import.meta.url,
        ),
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost,
    hmr: {
          host: tauriDevHost,
          port: 1421,
          protocol: "ws",
        },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
