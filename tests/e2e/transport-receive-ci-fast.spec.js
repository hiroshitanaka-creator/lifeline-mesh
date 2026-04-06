import { test, expect } from "@playwright/test";

const PLAIN_TEXT = "CI_FAST_TRANSPORT_RECEIVE";

test("fast gate: transport receive UX (clipboard + file) decrypts encrypted payload", async ({ page, context }) => {
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

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((payload) => navigator.clipboard.writeText(payload), encrypted);
  await page.getByRole("button", { name: "📥 Receive from Clipboard" }).click();
  await expect(page.locator("#input")).toContainText("dmesh-msg");
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "📂 Receive from File" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "encrypted-message.dmesh",
    mimeType: "application/json",
    buffer: Buffer.from(encrypted, "utf-8")
  });
  await expect(page.locator("#input")).toContainText("dmesh-msg");
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);
});
