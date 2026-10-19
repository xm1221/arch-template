import { defineConfig } from "vite";

const configuredBase = process.env.VITE_BASE?.trim() || "/arch-template/";
const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

// The public site is mounted at tools.xm1221.cn/arch-template.
// Asset URLs stay under that prefix. API calls use the same prefix unless
// VITE_GENERATE_API points a static host (GitHub Pages) at the Worker.
export default defineConfig({
  base,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/arch-template/api": "http://127.0.0.1:8788",
      "/api": "http://127.0.0.1:8788",
    },
  },
});
