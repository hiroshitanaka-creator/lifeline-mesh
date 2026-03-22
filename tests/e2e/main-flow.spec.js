import { test, expect } from "@playwright/test";

const PLAIN_TEXT = "HELLO_LIFELINE_MESH_E2E_REAL_DATA";

async function boot(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();
  await page.getByRole("button", { name: "🔑 Generate / Load Keys" }).click();
  await expect(page.locator("#status")).toContainText("Keys ready");
}

async function getMyIdentity(page) {
  const myIdText = await page.locator("#my-id").textContent();
  return JSON.parse(myIdText || "{}");
}

async function addContact(page, identity) {
  await page.locator("#contact-input").fill(JSON.stringify(identity, null, 2));
  await page.getByRole("button", { name: "➕ Add Contact" }).click();
  await expect(page.locator("#status")).toContainText("Contact saved");
}

async function selectFirstContact(page) {
  await page.locator("#recipient-select").selectOption({ index: 1 });
}

async function encryptMessage(page, content) {
  await page.locator("#content").fill(content);
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Encrypted for");
  return (await page.locator("#encrypted").textContent()) || "";
}

test("main flow: key generation -> contact add -> encrypt -> decrypt with clipboard/file handoff", async ({ page, context }) => {
  await boot(page);
  const myIdentity = await getMyIdentity(page);
  await addContact(page, myIdentity);
  await selectFirstContact(page);

  const encryptedText = await encryptMessage(page, PLAIN_TEXT);

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((payload) => navigator.clipboard.writeText(payload), encryptedText);
  const fromClipboard = await page.evaluate(() => navigator.clipboard.readText());
  await page.locator("#input").fill(fromClipboard);
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);

  // file handoff simulation (save/read JSON payload)
  const fromFile = JSON.stringify(JSON.parse(encryptedText));
  await page.locator("#input").fill(fromFile);
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);

  const encryptedObj = JSON.parse((await page.locator("#encrypted").textContent()) || "{}");
  const decryptedText = (await page.locator("#decrypted").textContent()) || "";
  expect(encryptedObj.kind).toBe("dmesh-msg");
  expect(decryptedText).toBe(PLAIN_TEXT);
});

test("decrypt sender policy branches: TOFU off reject unknown, TOFU on accept unknown, known sender accept", async ({ browser }) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  await boot(alice);
  await boot(bob);

  const aliceIdentity = await getMyIdentity(alice);
  const bobIdentity = await getMyIdentity(bob);

  await addContact(bob, aliceIdentity);
  await selectFirstContact(bob);

  const encryptedFromBob = await encryptMessage(bob, "TOFU_BRANCH_MESSAGE");

  // Unknown sender + TOFU off => reject
  await alice.locator("#tofu").uncheck();
  await alice.locator("#input").fill(encryptedFromBob);
  await alice.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(alice.locator("#status")).toContainText("Unknown sender");
  await expect(alice.locator("#decrypted")).toHaveText("");

  // Unknown sender + TOFU on => accept
  await alice.locator("#tofu").check();
  await alice.locator("#input").fill(encryptedFromBob);
  await alice.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(alice.locator("#status")).toContainText("Decrypted from TOFU-");
  await expect(alice.locator("#decrypted")).toContainText("TOFU_BRANCH_MESSAGE");

  // Known sender already learned => accept even with TOFU off
  const bobSenderOnly = {
    name: bobIdentity.name,
    signPK: bobIdentity.signPK,
    boxPK: bobIdentity.boxPK
  };

  await alice.locator("#contact-input").fill(JSON.stringify(bobSenderOnly, null, 2));
  await alice.getByRole("button", { name: "➕ Add Contact" }).click();

  const encryptedFromBobKnown = await encryptMessage(bob, "KNOWN_SENDER_MESSAGE");

  await alice.locator("#tofu").uncheck();
  await alice.locator("#input").fill(encryptedFromBobKnown);
  await alice.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(alice.locator("#status")).toContainText("Decrypted from");
  await expect(alice.locator("#decrypted")).toContainText("KNOWN_SENDER_MESSAGE");

  await aliceContext.close();
  await bobContext.close();
});

test("pseudo-e2e BLE: mock BLEManager I/O boundary", async ({ page }) => {
  await boot(page);
  const myIdentity = await getMyIdentity(page);
  await addContact(page, myIdentity);
  await selectFirstContact(page);

  const encryptedText = await encryptMessage(page, "BLE_MOCK_BOUNDARY_MESSAGE");

  await page.evaluate(() => {
    const ioMock = {
      hasBluetooth: () => true,
      requestDevice: () => Promise.resolve({
        id: "mock-device-id",
        name: "Mock BLE Device",
        gatt: {
          connected: true,
          connect: () => Promise.resolve({
            getPrimaryService: () => Promise.resolve({
              getCharacteristic: () => Promise.resolve({
                startNotifications: () => Promise.resolve("ok"),
                addEventListener: () => "listener-added",
                writeValue: () => Promise.resolve("written")
              })
            })
          }),
          disconnect: () => "disconnected"
        },
        addEventListener: () => "disconnect-listener-added"
      }),
      connectGatt: (device) => Promise.resolve(device.gatt.connect()),
      getPrimaryService: (server, uuid) => Promise.resolve(server.getPrimaryService(uuid)),
      getCharacteristic: (service, uuid) => Promise.resolve(service.getCharacteristic(uuid)),
      startNotifications: (characteristic) => Promise.resolve(characteristic.startNotifications()),
      addCharacteristicListener: (characteristic, eventName, handler) =>
        characteristic.addEventListener(eventName, handler),
      addDisconnectListener: (device, handler) =>
        device.addEventListener("gattserverdisconnected", handler),
      disconnectGatt: (device) => device.gatt.disconnect()
    };

    window.__lifelineTest.setBleManagerFactory(() => new window.__lifelineTest.BLEManager({ io: ioMock }));
    window.__lifelineTest.resetBle();
  });

  await page.getByRole("button", { name: "📡 Scan for Devices" }).click();
  await expect(page.locator("#status")).toContainText("Connected via Bluetooth");

  await page.evaluate((encrypted) => {
    const parsed = JSON.parse(encrypted);
    window.__lifelineTest.simulateBleReceive(parsed);
  }, encryptedText);

  await expect(page.locator("#status")).toContainText("Received message via Bluetooth");
  await expect(page.locator("#input")).toContainText("dmesh-msg");
});

test("delivery ops: manual outbox flush action follows connected/offline state", async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    window.__flushCalls = 0;
    window.__mockBleManager = {
      isConnected: false,
      sendMessage() {
        return null;
      },
      flushOutbox() {
        window.__flushCalls += 1;
      }
    };
    window.__lifelineTest.setBleManager(window.__mockBleManager);
  });

  await page.locator("#encrypted").evaluate((el) => {
    el.textContent = JSON.stringify({
      kind: "dmesh-msg",
      msgId: "e2e-queued-msg",
      payload: "queued"
    });
  });

  await page.getByRole("button", { name: "📤 Send Last Encrypted via Bluetooth" }).click();
  await expect(page.locator("#status")).toContainText("queued in Outbox");

  await page.getByRole("button", { name: "🔁 Flush queued messages now" }).click();
  await expect(page.locator("#status")).toContainText("Bluetooth is offline");

  await page.evaluate(() => {
    window.__mockBleManager.isConnected = true;
  });

  await page.getByRole("button", { name: "🔁 Flush queued messages now" }).click();
  await expect(page.locator("#status")).toContainText("Outbox flush completed");

  const flushCalls = await page.evaluate(() => window.__flushCalls);
  expect(flushCalls).toBe(1);
});

test("e2e: group create -> encrypt -> decrypt roundtrip", async ({ page }) => {
  await boot(page);
  const myIdentity = await getMyIdentity(page);
  await addContact(page, myIdentity);

  await page.getByLabel("Group").check();
  await page.locator("#group-name").fill("Team-A");
  await page.getByRole("button", { name: "👥 Create Group" }).click();
  await expect(page.locator("#status")).toContainText("Group created");

  await page.locator("#group-select").selectOption({ index: 1 });
  await page.locator("#content").fill("GROUP_ROUNDTRIP_MESSAGE");
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Group encrypted");

  const encrypted = (await page.locator("#encrypted").textContent()) || "";
  await page.locator("#input").fill(encrypted);
  await page.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(page.locator("#decrypted")).toHaveText("GROUP_ROUNDTRIP_MESSAGE");
});
