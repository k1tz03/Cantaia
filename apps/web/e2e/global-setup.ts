import { chromium, type FullConfig } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

/**
 * Global setup: authenticate once, save state for all tests.
 * Uses email/password auth against the local dev server or production.
 */
async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL || config.projects[0].use.baseURL || "http://localhost:3000";

  // If auth file already exists and is fresh (< 1 hour), skip re-auth
  const fs = await import("fs");
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < 3600_000) {
      console.log("[global-setup] Reusing existing auth state (< 1h old)");
      return;
    }
  }

  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[global-setup] E2E_USER_EMAIL / E2E_USER_PASSWORD not set. Creating empty auth state — tests requiring login will be skipped."
    );
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  console.log(`[global-setup] Authenticating as ${email} on ${baseURL}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/fr/login`, { waitUntil: "networkidle", timeout: 30_000 });

    // Fill login form
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for redirect to app (mail or dashboard)
    await page.waitForURL(
      (url) => url.pathname.includes("/mail") || url.pathname.includes("/dashboard"),
      { timeout: 30_000 }
    );

    console.log("[global-setup] Auth successful, saving state");
    await context.storageState({ path: AUTH_FILE });
  } catch (err) {
    console.error("[global-setup] Auth failed:", err);
    // Save empty state so tests can still run (public pages)
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }
}

export default globalSetup;
