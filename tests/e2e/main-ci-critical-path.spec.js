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

test("main CI critical path: verification workflow keeps selection and blocks compromised recipient", async ({ page }) => {
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
  await expect(page.locator("#contact-safety-number")).toContainText("-");

  await page.getByRole("button", { name: "✅ Mark Verified" }).click();
  await expect(page.locator("#status")).toContainText("Contact verified");
  await expect(page.locator("#recipient-select")).toHaveValue(myIdentity.fp);

  page.once("dialog", async (dialog) => {
    await dialog.accept("main-ci compromised transition");
  });
  await page.getByRole("button", { name: "⚠️ Mark Compromised" }).click();
  await expect(page.locator("#status")).toContainText("Contact marked compromised");
  await expect(page.locator("#recipient-select")).toHaveValue(myIdentity.fp);
  await expect(page.locator("#encrypt-recipient")).toContainText("compromised");

  await page.locator("#content").fill("MAIN_CI_COMPROMISED_BLOCK");
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Blocked:");
});

test("main CI critical path: PWA share-target intake routes encrypted to decrypt and plain text to encrypt", async ({ page }) => {
  const encryptedPayload = {
    kind: "dmesh-msg",
    msgId: "main-ci-share-target-intake-msg",
    senderSignPK: "invalid-for-runtime-check",
    senderBoxPK: "invalid-for-runtime-check",
    nonce: "invalid",
    ephPK: "invalid",
    ciphertext: "invalid",
    sig: "invalid",
    ts: Date.now(),
    ttlMs: 60000
  };

  const encryptedQuery = encodeURIComponent(JSON.stringify(encryptedPayload));
  await page.goto(`/?title=From%20Alice&text=${encryptedQuery}#decrypt`);
  await expect(page.locator("#input")).toContainText("dmesh-msg");
  await expect(page.locator("#status")).toContainText("share target");
  await expect(page.evaluate(() => document.activeElement?.id)).resolves.toBe("input");

  await page.goto("/?title=Shelter%20Update&text=Bring%20water%20and%20batteries#encrypt");
  await expect(page.locator("#content")).toHaveValue("Shelter Update\nBring water and batteries");
  await expect(page.locator("#status")).toContainText("Ready to encrypt");
  await expect(page.evaluate(() => document.activeElement?.id)).resolves.toBe("content");
});

test("main CI critical path: PWA share-target POST file intake routes encrypted and group payloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker API unavailable in this browser context");
    }
    await navigator.serviceWorker.ready;
  });
  await page.reload();

  const encryptedPayload = {
    kind: "dmesh-msg",
    msgId: "main-ci-share-target-post-file-msg",
    senderSignPK: "invalid-for-runtime-check",
    senderBoxPK: "invalid-for-runtime-check",
    nonce: "invalid",
    ephPK: "invalid",
    ciphertext: "invalid",
    sig: "invalid",
    ts: Date.now(),
    ttlMs: 60000
  };

  await page.evaluate(async ({ fileText }) => {
    const formData = new globalThis.FormData();
    formData.append("title", "CI File Intake");
    formData.append("files", new globalThis.File([fileText], "ci-encrypted.dmesh", { type: "application/json" }));
    await globalThis.fetch("/share-target", { method: "POST", body: formData });
  }, { fileText: JSON.stringify(encryptedPayload) });

  await page.goto("/?share-target=1");
  await expect(page.locator("#input")).toContainText("dmesh-msg");
  await expect(page.locator("#status")).toContainText("ci-encrypted.dmesh");

  const onboardingPayload = {
    type: "lifeline-group-onboarding-v1",
    group: {
      id: "ci-group-payload",
      name: "CI Group",
      members: [],
      senderKey: { version: 1, chainKey: "AAAAAAAAAAAAAAAAAAAAAA==" }
    },
    senderStates: []
  };

  await page.evaluate(async ({ fileText }) => {
    const formData = new globalThis.FormData();
    formData.append("text", "group payload");
    formData.append("files", new globalThis.File([fileText], "ci-group.json", { type: "application/json" }));
    await globalThis.fetch("/share-target", { method: "POST", body: formData });
  }, { fileText: JSON.stringify(onboardingPayload) });

  await page.goto("/?share-target=1");
  await expect(page.locator("#group-json")).toContainText("lifeline-group-onboarding-v1");
  await expect(page.locator("#status")).toContainText("Join Group");
});


test("main CI critical path: offline fallback keeps app-shell share/deeplink intake reachable", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();

  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service Worker API unavailable in this browser context");
    }
    await navigator.serviceWorker.ready;
  });

  await page.reload();

  await context.setOffline(true);

  await page.goto("/?title=Offline%20Share&text=Need%20water%20now#encrypt");
  await expect(page.locator("#content")).toHaveValue("Offline Share\nNeed water now");
  await expect(page.locator("#status")).toContainText("Ready to encrypt");

  await page.goto("/?title=Offline%20Payload&text=%7B%22kind%22%3A%22dmesh-msg%22%7D#decrypt");
  await expect(page.locator("#input")).toContainText("dmesh-msg");
});
