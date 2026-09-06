import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    command === "serve" &&
      mode === "ui-preview" && {
        name: "harbor-ui-preview",
        enforce: "pre",
        transform(code, id) {
          const sourceRoot = normalizePath(path.resolve(__dirname, "src")) + "/";
          const normalizedId = normalizePath(id);
          if (!normalizedId.startsWith(sourceRoot) || normalizedId.startsWith(sourceRoot + "dev/"))
            return;
          const transformed = code.replace(
            /(["'])@tauri-apps\/api\/core\1/g,
            '"@/dev/preview-core"'
          );
          return transformed === code ? undefined : { code: transformed, map: null };
        },
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return html.replace('src="/src/main.tsx"', 'src="/src/dev/preview-main.ts"');
          },
        },
      },
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  worker: {
    format: "es",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
