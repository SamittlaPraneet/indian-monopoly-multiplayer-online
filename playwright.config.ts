import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
    headless: true,
    proxy: process.env.TEST_BROWSER_PROXY
      ? { server: process.env.TEST_BROWSER_PROXY }
      : undefined,
    launchOptions: process.env.TEST_CHROMIUM_PATH
      ? {
          executablePath: process.env.TEST_CHROMIUM_PATH,
          args: [
            "--no-sandbox",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        }
      : {},
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
});
