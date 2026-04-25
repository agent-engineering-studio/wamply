import { test, expect } from "@playwright/test";

/**
 * E2E: visibilità tab Twilio per ruolo.
 * Non eseguita in CI (Playwright non installato). Utile per regression locale.
 * Richiede 3 cookie Supabase auth pre-popolate in storage state.
 */

test.describe("AdminTwilioTab — role visibility", () => {
  test("admin sees Twilio tab in sidebar", async ({ page }) => {
    await page.goto("/admin?tab=overview");
    await expect(page.getByRole("link", { name: /Twilio/ })).toBeVisible();
  });

  test("collaborator cannot access /admin?tab=twilio", async ({ page }) => {
    await page.goto("/admin?tab=twilio");
    // tab non consentito → fallback a overview (o banner 403)
    await expect(page.getByText(/Pannello Admin/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Twilio/ })).toHaveCount(0);
  });

  test("admin can open master config and see masked token", async ({ page }) => {
    await page.goto("/admin?tab=twilio");
    await expect(page.getByText(/Configurazione master Twilio/i)).toBeVisible();
    // il token è mascherato (contiene bullet) o vuoto
    const tokenCell = page.locator("dd").filter({ hasText: /•|—/ }).first();
    await expect(tokenCell).toBeVisible();
  });
});
