import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
export default defineConfig({
  base: "/kakeibo/",
  plugins: [
    {
      name: "dev-csp",
      transformIndexHtml(html, ctx) {
        return ctx.server
          ? html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]+>/, "")
          : html;
      },
    },
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "prompt",
      manifest: {
        name: "\u5bb6\u8a08\u7c3f",
        short_name: "\u5bb6\u8a08\u7c3f",
        lang: "ja",
        id: "/kakeibo/",
        start_url: "/kakeibo/",
        scope: "/kakeibo/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#075947",
        background_color: "#f5f8f7",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
      devOptions: { enabled: false },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { sourcemap: false },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
