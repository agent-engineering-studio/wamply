// NOTE: Playwright is not installed in this repo yet. To run these tests:
//   cd frontend && npm init playwright@latest
//   (then seed three test users in the DB with the env emails below)
//
// Requires env vars:
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PW
//   E2E_COLLAB_EMAIL / E2E_COLLAB_PW
//   E2E_SALES_EMAIL / E2E_SALES_PW

import { test, expect, type Page } from "@playwright/test";

const ADMIN = { email: process.env.E2E_ADMIN_EMAIL!, password: process.env.E2E_ADMIN_PW! };
const COLLAB = { email: process.env.E2E_COLLAB_EMAIL!, password: process.env.E2E_COLLAB_PW! };
const SALES = { email: process.env.E2E_SALES_EMAIL!, password: process.env.E2E_SALES_PW! };

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname.startsWith("/admin") || url.pathname.startsWith("/dashboard"));
}

test.describe("Admin area — role-based visibility", () => {
  test("admin sees all 8 tabs", async ({ page }) => {
    await login(page, ADMIN);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Staff", "Campagne", "Pratiche WhatsApp", "Claude API", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
  });

  test("collaborator sees 4 tabs, no Staff / AI Costs / AI Revenue / Claude API", async ({ page }) => {
    await login(page, COLLAB);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Campagne", "Pratiche WhatsApp"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
    for (const tab of ["Staff", "Claude API", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toHaveCount(0);
    }
  });

  test("sales sees 6 tabs including AI Costs / AI Revenue, no Staff / Claude API", async ({ page }) => {
    await login(page, SALES);
    await page.goto("/admin");
    for (const tab of ["Overview", "Utenti", "Campagne", "Pratiche WhatsApp", "AI Costs", "AI Revenue"]) {
      await expect(page.getByRole("link", { name: tab })).toBeVisible();
    }
    for (const tab of ["Staff", "Claude API"]) {
      await expect(page.getByRole("link", { name: tab })).toHaveCount(0);
    }
  });

  test("no staff role shows 'Torna alla dashboard' link", async ({ page }) => {
    for (const user of [ADMIN, COLLAB, SALES]) {
      await login(page, user);
      await page.goto("/admin");
      await expect(page.getByText("Torna alla dashboard")).toHaveCount(0);
      await page.context().clearCookies();
    }
  });

  test("logout button signs out and redirects to /login", async ({ page }) => {
    await login(page, COLLAB);
    await page.goto("/admin");
    await page.getByRole("button", { name: /esci|logout/i }).first().click();
    await page.waitForURL("**/login");
    expect(page.url()).toMatch(/\/login$/);
  });
});
