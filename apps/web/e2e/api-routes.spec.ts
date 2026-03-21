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
 * API route health checks — verifies correct status codes.
 * Tests both public access (should return 401) and authenticated access (should return 200).
 */
test.describe("API routes — Unauthenticated access returns 401", () => {
  // Use empty auth state — no cookies
  test.use({ storageState: { cookies: [], origins: [] } });

  test("POST /api/ai/generate-alerts without auth returns 401", async ({ request }) => {
    const response = await request.post("/api/ai/generate-alerts", {
      data: {},
    });
    expect(response.status()).toBe(401);
  });

  test("POST /api/ai/executive-summary without auth returns 401", async ({ request }) => {
    const response = await request.post("/api/ai/executive-summary", {
      data: {},
    });
    expect(response.status()).toBe(401);
  });

  test("GET /api/intelligence/stats without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/intelligence/stats");
    expect(response.status()).toBe(401);
  });

  test("GET /api/projects/list without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/projects/list");
    expect(response.status()).toBe(401);
  });

  test("GET /api/suppliers without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/suppliers");
    expect(response.status()).toBe(401);
  });

  test("GET /api/submissions without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/submissions");
    expect(response.status()).toBe(401);
  });

  test("GET /api/tasks without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/tasks");
    expect(response.status()).toBe(401);
  });

  test("GET /api/plans without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/plans");
    expect(response.status()).toBe(401);
  });

  test("GET /api/user/profile without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/user/profile");
    expect(response.status()).toBe(401);
  });

  test("GET /api/mail/decisions without auth returns 401", async ({ request }) => {
    const response = await request.get("/api/mail/decisions");
    expect(response.status()).toBe(401);
  });
});

test.describe("API routes — Public endpoints", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET /api/debug/supabase-test returns 200", async ({ request }) => {
    const response = await request.get("/api/debug/supabase-test");
    // This debug route should work without auth (it tests Supabase connectivity)
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("API routes — Authenticated access returns 200", () => {
  test.skip(() => !hasAuth(), "Skipping: no auth credentials");

  test("GET /api/projects/list with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/projects/list");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toBeTruthy();
  });

  test("GET /api/intelligence/stats with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/intelligence/stats");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  test("GET /api/suppliers with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/suppliers");
    expect(response.ok()).toBeTruthy();
  });

  test("GET /api/tasks with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/tasks");
    expect(response.ok()).toBeTruthy();
  });

  test("GET /api/submissions with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/submissions");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty("success");
  });

  test("GET /api/plans with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/plans");
    expect(response.ok()).toBeTruthy();
  });

  test("GET /api/user/profile with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/user/profile");
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toBeTruthy();
  });

  test("GET /api/mail/decisions with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/mail/decisions");
    // May return 200 (with data) or 200 (with empty buckets)
    expect(response.ok()).toBeTruthy();
  });

  test("GET /api/briefing/today with auth returns 200", async ({ request }) => {
    const response = await request.get("/api/briefing/today");
    // 200 with data or 200 with null/empty (no briefing today)
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("API routes — CRON routes require secret", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("POST /api/cron/briefing without CRON_SECRET returns 401", async ({ request }) => {
    const response = await request.post("/api/cron/briefing", { data: {} });
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/cron/aggregate-benchmarks without CRON_SECRET returns 401", async ({ request }) => {
    const response = await request.post("/api/cron/aggregate-benchmarks", { data: {} });
    expect([401, 403]).toContain(response.status());
  });
});
