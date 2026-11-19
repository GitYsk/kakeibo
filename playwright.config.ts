import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.PWA_TEST_URL ?? "http://127.0.0.1:4173/kakeibo/",
    viewport: { width: 384, height: 824 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    launchOptions:
      process.env.PWA_TEST_EDGE === "1" ? { channel: "msedge" } : {},
  },
  webServer: process.env.PWA_TEST_URL
    ? undefined
    : {
        command:
          "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173/kakeibo/",
        reuseExistingServer: true,
      },
});
