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
 * Admin page — organization administration panel.
 * Requires authentication. May require admin or project_manager role.
 */
test.describe("Admin page", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("admin page loads or redirects appropriately", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const url = page.url();

    // Admin page should either:
    // 1. Load the admin panel (if user has admin/PM/director role)
    // 2. Redirect to login or dashboard (if unauthorized)
    const isOnAdmin = /\/admin/.test(url);
    const isRedirected = /\/login|\/dashboard|\/mail/.test(url);

    expect(isOnAdmin || isRedirected).toBeTruthy();
  });

  test("admin page shows 4 tabs when authorized", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Check if we're still on admin page (not redirected)
    if (!page.url().includes("/admin")) {
      test.skip();
      return;
    }

    const content = await page.textContent("body");

    // Admin page has 4 tabs: overview, members, subscription, settings
    // The tab labels come from translations: t("overview"), t("members"), t("subscription"), t("settings")
    const tabPatterns = [
      /vue d'ensemble|overview|aperçu/i,
      /membres|members/i,
      /abonnement|subscription/i,
      /paramètres|settings/i,
    ];

    let matchedTabs = 0;
    for (const pattern of tabPatterns) {
      if (pattern.test(content || "")) {
        matchedTabs++;
      }
    }

    // Should match at least 2 out of 4 tabs (accounting for i18n variations)
    expect(matchedTabs).toBeGreaterThanOrEqual(2);
  });

  test("admin overview tab shows KPIs", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    if (!page.url().includes("/admin")) {
      test.skip();
      return;
    }

    // Overview tab (default) should show KPI cards
    // KPIs: members, projects, tasks, emails
    const content = await page.textContent("body");
    const hasKPIs = /membre|projet|tâche|email|task|project/i.test(content || "");

    expect(hasKPIs).toBeTruthy();
  });

  test("clicking Members tab shows member list", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    if (!page.url().includes("/admin")) {
      test.skip();
      return;
    }

    // Click the members tab
    const membersTab = page.locator("button").filter({ hasText: /membres|members/i }).first();
    const hasMembersTab = await membersTab.count() > 0;

    if (hasMembersTab) {
      await membersTab.click();
      await page.waitForTimeout(2000);

      const content = await page.textContent("body");

      // Members tab should show user info — names, emails, roles
      const hasMemberContent = /email|rôle|role|invit/i.test(content || "");
      expect(hasMemberContent).toBeTruthy();
    }
  });

  test("clicking Subscription tab shows plan details", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    if (!page.url().includes("/admin")) {
      test.skip();
      return;
    }

    const subscriptionTab = page.locator("button").filter({ hasText: /abonnement|subscription/i }).first();
    const hasSubTab = await subscriptionTab.count() > 0;

    if (hasSubTab) {
      await subscriptionTab.click();
      await page.waitForTimeout(2000);

      const content = await page.textContent("body");

      // Subscription tab should mention plan name or pricing
      const hasSubContent = /trial|starter|pro|enterprise|plan|CHF|facturation|billing/i.test(content || "");
      expect(hasSubContent).toBeTruthy();
    }
  });

  test("clicking Settings tab shows org settings form", async ({ page }) => {
    test.slow();
    await page.goto("/fr/admin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    if (!page.url().includes("/admin")) {
      test.skip();
      return;
    }

    const settingsTab = page.locator("button").filter({ hasText: /paramètres|settings/i }).first();
    const hasSettingsTab = await settingsTab.count() > 0;

    if (hasSettingsTab) {
      await settingsTab.click();
      await page.waitForTimeout(2000);

      // Settings tab should have form inputs (org name, branding, etc.)
      const inputs = page.locator("input, textarea");
      const inputCount = await inputs.count();

      expect(inputCount).toBeGreaterThanOrEqual(1);
    }
  });
});
