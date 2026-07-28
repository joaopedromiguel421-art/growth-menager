import { defineConfig, devices } from "@playwright/test";

const webPort = 3100;
const apiPort = 4310;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: process.env.CI === undefined ? "list" : "github",
  use: {
    baseURL: `http://localhost:${String(webPort)}`,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] }
    }
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-api.mjs",
      port: apiPort,
      reuseExistingServer: false
    },
    {
      command: `pnpm --filter @growth-manager/web exec next dev --port ${String(webPort)}`,
      port: webPort,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_BASE_URL: `http://127.0.0.1:${String(apiPort)}`,
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "synthetic-e2e"
      }
    }
  ]
});
