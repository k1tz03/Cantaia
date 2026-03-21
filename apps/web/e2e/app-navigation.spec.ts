import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

function hasAuth(): boolean {
  const authPath = path.join(__dirname, ".auth", "user.json");
  if (!fs.existsSync(authPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(authPath, "utf-8"));
    return (data.cookies?.length > 0 || data.origins?.length > 0);
  } catch {
    return false;
  }
}

/**
 * Sidebar navigation and app routing — requires authentication.
 */
test.describe("App navigation — Sidebar", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test.beforeEach(async ({ page }) => {
    // Start from dashboard to ensure sidebar is visible
    await page.goto("/fr/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });
  });

  test("sidebar renders with core navigation items", async ({ page }) => {
    // The sidebar should have links to main sections
    // These are the nav items defined in Sidebar.tsx
    const sidebarLinks = [
      { href: "/mail", text: /mail/i },
      { href: "/dashboard", text: /dashboard|tableau/i },
      { href: "/projects", text: /projet/i },
      { href: "/plans", text: /plans/i },
      { href: "/submissions", text: /soumission/i },
      { href: "/suppliers", text: /fournisseur/i },
      { href: "/tasks", text: /tâche|task/i },
    ];

    // Check sidebar is visible (it's the <aside> or nav element)
    const sidebar = page.locator("aside, nav").first();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    // At least some navigation links should be present
    for (const link of sidebarLinks) {
      const navLink = page.locator(`a[href*="${link.href}"]`).first();
      const exists = await navLink.count();
      // Sidebar might be collapsed — link should exist in DOM even if icon-only
      expect(exists).toBeGreaterThanOrEqual(1);
    }
  });

  test("clicking Mail navigates to /mail", async ({ page }) => {
    const mailLink = page.locator('a[href*="/mail"]').first();
    await mailLink.click();
    await page.waitForURL(/\/mail/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/mail/);
  });

  test("clicking Projects navigates to /projects", async ({ page }) => {
    const projectsLink = page.locator('a[href*="/projects"]').first();
    await projectsLink.click();
    await page.waitForURL(/\/projects/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/projects/);
  });

  test("clicking Plans navigates to /plans", async ({ page }) => {
    const plansLink = page.locator('a[href*="/plans"]').first();
    await plansLink.click();
    await page.waitForURL(/\/plans/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/plans/);
  });

  test("clicking Submissions navigates to /submissions", async ({ page }) => {
    const link = page.locator('a[href*="/submissions"]').first();
    await link.click();
    await page.waitForURL(/\/submissions/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/submissions/);
  });

  test("clicking Suppliers navigates to /suppliers", async ({ page }) => {
    const link = page.locator('a[href*="/suppliers"]').first();
    await link.click();
    await page.waitForURL(/\/suppliers/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/suppliers/);
  });

  test("clicking Tasks navigates to /tasks", async ({ page }) => {
    const link = page.locator('a[href*="/tasks"]').first();
    await link.click();
    await page.waitForURL(/\/tasks/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/tasks/);
  });

  test("clicking Settings navigates to /settings", async ({ page }) => {
    const link = page.locator('a[href*="/settings"]').first();
    await link.click();
    await page.waitForURL(/\/settings/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/settings/);
  });

  test("clicking Cantaia Prix navigates to /cantaia-prix", async ({ page }) => {
    const link = page.locator('a[href*="/cantaia-prix"]').first();
    await link.click();
    await page.waitForURL(/\/cantaia-prix/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/cantaia-prix/);
  });

  test("clicking Chat navigates to /chat", async ({ page }) => {
    const link = page.locator('a[href*="/chat"]').first();
    await link.click();
    await page.waitForURL(/\/chat/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/fr\/chat/);
  });
});

test.describe("App navigation — Command palette", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("Ctrl+K opens command palette", async ({ page }) => {
    await page.goto("/fr/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Press Ctrl+K (or Cmd+K on Mac)
    await page.keyboard.press("Control+k");

    // Command palette should appear — it's a dialog/modal with a search input
    const palette = page.locator("[role='dialog'], [data-cmdk-root], [cmdk-root]").first();
    const paletteInput = page.locator("input[placeholder*='cherch'], input[placeholder*='search'], [cmdk-input]").first();

    // Either the dialog or the input should be visible
    const dialogVisible = await palette.isVisible().catch(() => false);
    const inputVisible = await paletteInput.isVisible().catch(() => false);

    expect(dialogVisible || inputVisible).toBeTruthy();
  });
});

test.describe("App navigation — Mobile", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test.use({ viewport: { width: 375, height: 812 } });

  test("mobile view shows hamburger or bottom nav", async ({ page }) => {
    await page.goto("/fr/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // On mobile, sidebar collapses. Look for a menu button or bottom navigation
    const menuButton = page.locator("button").filter({ hasText: /menu/i });
    const moreButton = page.locator("button").filter({ hasText: /plus/i });
    const bottomNav = page.locator("nav").last();

    const hasMenu = await menuButton.count() > 0;
    const hasMore = await moreButton.count() > 0;
    const hasBottomNav = await bottomNav.isVisible().catch(() => false);

    // At least one mobile navigation pattern should exist
    expect(hasMenu || hasMore || hasBottomNav).toBeTruthy();
  });
});
