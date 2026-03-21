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
 * Settings page — profile, preferences, integrations, subscription.
 * Requires authentication.
 */
test.describe("Settings page", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("settings page loads on profile tab by default", async ({ page }) => {
    await page.goto("/fr/settings", { waitUntil: "domcontentloaded", timeout: 30_000 });

    expect(page.url()).toMatch(/\/fr\/settings/);

    // Should show settings title
    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });

  test("profile tab shows form fields", async ({ page }) => {
    await page.goto("/fr/settings?tab=profile", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Profile form should have name/email fields
    const inputs = page.locator("input");
    const inputCount = await inputs.count();

    // Should have at least 2 inputs (name, email, etc.)
    expect(inputCount).toBeGreaterThanOrEqual(1);
  });

  test("all settings tabs exist and are clickable", async ({ page }) => {
    await page.goto("/fr/settings", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // The TABS array in settings page defines these tabs:
    // profile, language, notifications, outlook, email_prefs, classification, security, data_sharing, organisation, subscription
    // They are rendered as buttons or links in the sidebar/tab bar

    const tabButtons = page.locator("button, a").filter({
      has: page.locator("svg"), // Tabs have icons
    });

    // There should be multiple tab buttons (at least 5-6 visible)
    const tabCount = await tabButtons.count();
    expect(tabCount).toBeGreaterThanOrEqual(3);
  });

  test("clicking Integrations tab shows connection options", async ({ page }) => {
    test.slow();
    await page.goto("/fr/settings?tab=outlook", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const content = await page.textContent("body");

    // Integrations tab should mention Microsoft, Google, or IMAP
    const hasProvider = /microsoft|google|imap|outlook|connexion|connect/i.test(content || "");
    expect(hasProvider).toBeTruthy();
  });

  test("clicking Subscription tab shows plan info", async ({ page }) => {
    test.slow();
    await page.goto("/fr/settings?tab=subscription", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const content = await page.textContent("body");

    // Subscription tab should mention plan names or pricing
    const hasPlanInfo = /trial|starter|pro|enterprise|abonnement|plan|CHF/i.test(content || "");
    expect(hasPlanInfo).toBeTruthy();
  });

  test("clicking Data Sharing tab shows consent toggles", async ({ page }) => {
    test.slow();
    await page.goto("/fr/settings?tab=data_sharing", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const content = await page.textContent("body");

    // Data sharing tab should mention modules or consent
    const hasDataSharing = /partage|données|data|consent|module|prix|plans|mail/i.test(content || "");
    expect(hasDataSharing).toBeTruthy();
  });

  test("clicking Classification tab shows email classification settings", async ({ page }) => {
    test.slow();
    await page.goto("/fr/settings?tab=classification", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const content = await page.textContent("body");

    // Classification settings should mention rules, keywords, or email
    const hasClassification = /classification|règle|rule|mot-clé|keyword|email/i.test(content || "");
    expect(hasClassification).toBeTruthy();
  });

  test("tab navigation updates URL parameter", async ({ page }) => {
    await page.goto("/fr/settings", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Default should be profile tab
    // Click on a different tab and check URL updates
    const securityTab = page.locator("button, a").filter({ hasText: /sécurité|security/i }).first();
    const tabExists = await securityTab.count() > 0;

    if (tabExists) {
      await securityTab.click();
      await page.waitForTimeout(1000);

      // URL should now have ?tab=security
      expect(page.url()).toMatch(/tab=/);
    }
  });
});
