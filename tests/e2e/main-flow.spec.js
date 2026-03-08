import { test, expect } from "@playwright/test";

test("main user flow: key generation -> encrypt -> decrypt -> BLE send/receive", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();

  await page.getByRole("button", { name: "🔑 Generate / Load Keys" }).click();
  await expect(page.locator("#status")).toContainText("Keys ready");

  const myIdText = await page.locator("#my-id").textContent();
  await page.locator("#contact-input").fill(myIdText ?? "");
  await page.getByRole("button", { name: "➕ Add Contact" }).click();
  await expect(page.locator("#status")).toContainText("Contact saved");

  await page.locator("#recipient-select").selectOption({ index: 1 });
  await page.locator("#content").fill("HELLO_LIFELINE_MESH_E2E");
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Encrypted for");

  const encryptedText = await page.locator("#encrypted").textContent();
  await page.locator("#input").fill(encryptedText ?? "");
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toContainText("HELLO_LIFELINE_MESH_E2E");

  await page.evaluate(() => {
    const mockManager = {
      isConnected: true,
      scan: () => Promise.resolve("scanned"),
      connect: () => Promise.resolve("connected"),
      disconnect: () => "disconnected",
      sendMessage: () => Promise.resolve("sent"),
      onMessageReceived: null
    };
    window.__lifelineTest.setBleManager(mockManager);
  });

  await page.getByRole("button", { name: "📡 Scan for Devices" }).click();
  await expect(page.locator("#status")).toContainText("Connected via Bluetooth");

  await page.getByRole("button", { name: "📤 Send Last Encrypted via Bluetooth" }).click();
  await expect(page.locator("#status")).toContainText("Message sent via Bluetooth");

  await page.evaluate((encrypted) => {
    const parsed = JSON.parse(encrypted);
    window.__lifelineTest.simulateBleReceive(parsed);
  }, encryptedText ?? "{}");

  await expect(page.locator("#status")).toContainText("Received message via Bluetooth");
  await expect(page.locator("#input")).toContainText("dmesh-msg");
});
