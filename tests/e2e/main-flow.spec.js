import { test, expect } from "@playwright/test";

test("main user flow: generate keys and encrypt/decrypt controls are available", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();
  await page.getByRole("button", { name: "🔑 Generate / Load Keys" }).click();
  await expect(page.locator("#status")).toContainText("Keys ready");

  await expect(page.getByRole("button", { name: "🔒 Encrypt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "🔓 Decrypt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "📡 Scan for Devices" })).toBeVisible();
});
