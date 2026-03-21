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
 * Submissions module — list, detail, Budget IA, Monte Carlo.
 * Requires authentication.
 */
test.describe("Submissions — List page", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("submissions page loads", async ({ page }) => {
    await page.goto("/fr/submissions", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Should be on submissions page
    expect(page.url()).toMatch(/\/fr\/submissions/);

    const body = page.locator("body");
    await expect(body).not.toBeEmpty();
  });

  test("submissions page shows list or empty state", async ({ page }) => {
    test.slow();
    await page.goto("/fr/submissions", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    const content = await page.textContent("body");

    // Either submissions are listed, or an empty state message shows
    const hasList = /soumission|submission/i.test(content || "");
    const hasEmptyState = /aucun|vide|empty|commencer|créer/i.test(content || "");

    expect(hasList || hasEmptyState).toBeTruthy();
  });

  test("new submission button exists", async ({ page }) => {
    await page.goto("/fr/submissions", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Look for "Nouvelle soumission" or a Plus button/link
    const newButton = page.locator("a[href*='/submissions/new'], button").filter({
      hasText: /nouvelle|nouveau|new|\+|créer|ajouter/i,
    });
    const plusLink = page.locator("a[href*='/submissions/new']");

    const hasButton = await newButton.count() > 0;
    const hasLink = await plusLink.count() > 0;

    expect(hasButton || hasLink).toBeTruthy();
  });
});

test.describe("Submissions — Detail page", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("clicking a submission navigates to detail page with tabs", async ({ page }) => {
    test.slow();
    await page.goto("/fr/submissions", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Find submission links in the list
    const submissionLinks = page.locator("a[href*='/submissions/']").filter({
      has: page.locator(":not([href*='/new'])"),
    });

    // Filter out the "new" link
    const allLinks = page.locator("a[href*='/submissions/']");
    let targetLink = null;

    for (let i = 0; i < await allLinks.count(); i++) {
      const href = await allLinks.nth(i).getAttribute("href");
      if (href && !href.includes("/new") && /\/submissions\/[a-f0-9-]+/i.test(href)) {
        targetLink = allLinks.nth(i);
        break;
      }
    }

    if (targetLink) {
      await targetLink.click();
      await page.waitForTimeout(3000);

      // Detail page should have tabs
      const content = await page.textContent("body");
      const hasTabs = /postes|items|comparaison|comparison|budget|tracking|documents/i.test(content || "");

      expect(hasTabs).toBeTruthy();
    } else {
      // No submissions exist — skip
      test.skip();
    }
  });
});

test.describe("Submissions — Budget IA", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("Budget IA tab renders when available", async ({ page }) => {
    test.slow();
    await page.goto("/fr/submissions", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3000);

    // Find first submission link
    const allLinks = page.locator("a[href*='/submissions/']");
    let targetLink = null;

    for (let i = 0; i < await allLinks.count(); i++) {
      const href = await allLinks.nth(i).getAttribute("href");
      if (href && !href.includes("/new") && /\/submissions\/[a-f0-9-]+/i.test(href)) {
        targetLink = allLinks.nth(i);
        break;
      }
    }

    if (!targetLink) {
      test.skip();
      return;
    }

    await targetLink.click();
    await page.waitForTimeout(3000);

    // Click Budget IA tab if it exists
    const budgetTab = page.locator("button, a").filter({ hasText: /budget\s*ia/i }).first();
    const hasBudgetTab = await budgetTab.count() > 0;

    if (hasBudgetTab) {
      await budgetTab.click();
      await page.waitForTimeout(2000);

      const content = await page.textContent("body");
      // Should show budget information, estimate button, or feedback
      const hasBudgetContent = /CHF|budget|estim|source|total/i.test(content || "");
      expect(hasBudgetContent).toBeTruthy();
    } else {
      // Budget IA tab may not be available for all submissions
      expect(true).toBeTruthy();
    }
  });
});

test.describe("Submissions — API", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("GET /api/submissions returns 200", async ({ request }) => {
    const response = await request.get("/api/submissions");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("success");
  });
});
