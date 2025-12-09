import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test("redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await expect(page).toHaveURL(/login/);
    await expect(page.getByText("Welcome back")).toBeVisible();
  });
});

