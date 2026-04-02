import { test, expect } from "@playwright/test";

const PLAIN_TEXT = "MAIN_CI_CRITICAL_PATH";

test("main CI critical path: key generation -> contact add -> encrypt -> decrypt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();

  await page.getByRole("button", { name: "🔑 Generate / Load Keys" }).click();
  await expect(page.locator("#status")).toContainText("Keys ready");

  const myIdText = await page.locator("#my-id").textContent();
  const myIdentity = JSON.parse(myIdText || "{}");

  await page.locator("#contact-input").fill(JSON.stringify(myIdentity, null, 2));
  await page.getByRole("button", { name: "➕ Add Contact" }).click();
  await expect(page.locator("#status")).toContainText("Contact saved");

  await page.locator("#recipient-select").selectOption({ index: 1 });
  await page.locator("#content").fill(PLAIN_TEXT);
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Encrypted for");

  const encrypted = (await page.locator("#encrypted").textContent()) || "";
  const encryptedObj = JSON.parse(encrypted);
  expect(encryptedObj.kind).toBe("dmesh-msg");

  await page.locator("#input").fill(encrypted);
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);
});
