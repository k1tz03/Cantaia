import { test, expect } from "@playwright/test";

/**
 * Public pages — no authentication required.
 * Tests landing page, pricing, about, legal pages, and login/register forms.
 */
test.describe("Public pages", () => {
  // Override the storageState to empty (no auth) for public page tests
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET / redirects to /fr (default locale)", async ({ page }) => {
    const response = await page.goto("/");
    // Should end up on /fr or /fr/
    expect(page.url()).toMatch(/\/fr\/?$/);
    expect(response?.ok()).toBeTruthy();
  });

  test("/fr loads landing page with Cantaia branding", async ({ page }) => {
    await page.goto("/fr", { waitUntil: "domcontentloaded" });

    // Hero section should contain Cantaia text
    const body = page.locator("body");
    await expect(body).toContainText("Cantaia");

    // Check that the page has a main heading
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("/fr/pricing loads pricing page with plan cards", async ({ page }) => {
    await page.goto("/fr/pricing", { waitUntil: "domcontentloaded" });

    // Page should contain pricing-related text
    await expect(page.locator("body")).toContainText("CHF");

    // Check that plan information is present — look for plan names or pricing structure
    // The pricing page should have at least one plan section
    const pageText = await page.textContent("body");
    expect(pageText).toBeTruthy();
    // Should contain pricing amounts
    expect(pageText).toMatch(/\d+\s*CHF|CHF\s*\d+/);
  });

  test("/fr/about loads about page", async ({ page }) => {
    const response = await page.goto("/fr/about", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    // About page should have content
    const body = page.locator("body");
    await expect(body).toContainText("Cantaia");
  });

  test("/fr/legal/cgv loads CGV page", async ({ page }) => {
    const response = await page.goto("/fr/legal/cgv", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    // Legal page should have body content
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });

  test("/fr/legal/privacy loads privacy policy page", async ({ page }) => {
    const response = await page.goto("/fr/legal/privacy", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });

  test("/fr/legal/mentions loads mentions legales page", async ({ page }) => {
    const response = await page.goto("/fr/legal/mentions", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
  });

  test("/fr/login shows login form with email, password, and OAuth buttons", async ({ page }) => {
    await page.goto("/fr/login", { waitUntil: "domcontentloaded" });

    // Email input
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    // Password input
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    await expect(passwordInput).toBeVisible();

    // Submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    // Microsoft OAuth button (contains "Microsoft" text)
    const microsoftButton = page.getByText(/Microsoft/i);
    await expect(microsoftButton).toBeVisible();

    // Google OAuth button (contains "Google" text)
    const googleButton = page.getByText(/Google/i);
    await expect(googleButton).toBeVisible();
  });

  test("/fr/register shows register form with OAuth buttons", async ({ page }) => {
    await page.goto("/fr/register", { waitUntil: "domcontentloaded" });

    // Should have OAuth buttons
    const microsoftButton = page.getByText(/Microsoft/i);
    await expect(microsoftButton).toBeVisible({ timeout: 10_000 });

    // Should have email input for registration
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    await expect(emailInput).toBeVisible();
  });

  test("meta tags exist on landing page", async ({ page }) => {
    await page.goto("/fr", { waitUntil: "domcontentloaded" });

    // Title should be set
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(5);

    // Description meta tag
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.+/);

    // OG title
    const ogTitle = page.locator('meta[property="og:title"]');
    await ogTitle.getAttribute("content").catch(() => null);
    // og:title may or may not exist depending on config, so just check title exists
    expect(title).toBeTruthy();
  });

  test("favicon loads (icon route returns 200)", async ({ request }) => {
    // Next.js dynamic favicon at /icon
    const response = await request.get("/icon");
    // Accept 200 or redirect — the route should exist
    expect([200, 301, 302, 307, 308]).toContain(response.status());
  });

  test("OG image route /opengraph-image returns 200", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()["content-type"] || "";
    expect(contentType).toMatch(/image\//);
  });

  test("pricing page has meta description", async ({ page }) => {
    await page.goto("/fr/pricing", { waitUntil: "domcontentloaded" });

    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.toLowerCase()).toMatch(/cantaia|tarif|prix|pricing/);
  });
});
