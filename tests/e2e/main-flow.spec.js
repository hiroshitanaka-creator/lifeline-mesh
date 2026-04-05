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
  await expect(alice.locator("#contacts-view")).toContainText("\"verified\": \"unverified\"");

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

test("contact verification workflow: unverified -> verified -> compromised and compromised send guard", async ({ page }) => {
  await boot(page);
  const myIdentity = await getMyIdentity(page);
  await addContact(page, myIdentity);
  await selectFirstContact(page);

  await expect(page.locator("#recipient-select")).toContainText("unverified");
  await expect(page.locator("#contact-safety-number")).toContainText("-");

  await page.getByRole("button", { name: "✅ Mark Verified" }).click();
  await expect(page.locator("#status")).toContainText("Contact verified");
  await expect(page.locator("#recipient-select")).toContainText("verified");

  page.on("dialog", async (dialog) => {
    await dialog.accept("suspected key leak");
  });
  await page.getByRole("button", { name: "⚠️ Mark Compromised" }).click();
  await expect(page.locator("#status")).toContainText("Contact marked compromised");
  await expect(page.locator("#recipient-select")).toContainText("compromised");

  await page.locator("#content").fill("SHOULD_BE_BLOCKED");
  await page.getByRole("button", { name: "🔒 Encrypt" }).click();
  await expect(page.locator("#status")).toContainText("Blocked:");
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

test("delivery ops: queued outbox entry survives reload and flushes after reconnect", async ({ page }) => {
  await boot(page);

  const queuedMsgId = `reload-queue-${Date.now()}`;
  await page.evaluate(() => {
    window.__mockBleManager = {
      isConnected: false,
      sendMessage() {
        return null;
      },
      flushOutbox() {
        window.__reloadFlushCalls = (window.__reloadFlushCalls || 0) + 1;
      }
    };
    window.__reloadFlushCalls = 0;
    window.__lifelineTest.setBleManager(window.__mockBleManager);
  });

  await page.locator("#encrypted").evaluate((el, msgId) => {
    el.textContent = JSON.stringify({
      kind: "dmesh-msg",
      msgId,
      payload: "queued-before-reload"
    });
  }, queuedMsgId);

  await page.getByRole("button", { name: "📤 Send Last Encrypted via Bluetooth" }).click();
  await expect(page.locator("#status")).toContainText("queued in Outbox");

  await page.reload();
  await expect(page.getByRole("heading", { name: "🌐 Lifeline Mesh" })).toBeVisible();
  await expect(page.locator("#outbox-view")).toContainText(queuedMsgId);

  await page.evaluate(() => {
    window.__mockBleManager = {
      isConnected: true,
      sendMessage() {
        return null;
      },
      flushOutbox() {
        window.__reloadFlushCalls = (window.__reloadFlushCalls || 0) + 1;
      }
    };
    window.__reloadFlushCalls = 0;
    window.__lifelineTest.setBleManager(window.__mockBleManager);
  });

  await page.getByRole("button", { name: "🔁 Flush queued messages now" }).click();
  await expect(page.locator("#status")).toContainText("Outbox flush completed");
  const flushCalls = await page.evaluate(() => window.__reloadFlushCalls);
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

test("e2e: multi-device group onboarding + sender-state mismatch recovery", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const deviceA = await contextA.newPage();
  const deviceB = await contextB.newPage();

  await boot(deviceA);
  await boot(deviceB);

  // A creates group and exports onboarding payload.
  await deviceA.getByLabel("Group").check();
  await deviceA.locator("#group-name").fill("Ops-Multi-Device");
  await deviceA.getByRole("button", { name: "👥 Create Group" }).click();
  await expect(deviceA.locator("#status")).toContainText("Group created");
  await deviceA.locator("#group-select").selectOption({ index: 1 });
  await deviceA.getByRole("button", { name: "📋 Copy Onboarding Payload" }).click();
  const onboardingPayload = await deviceA.locator("#group-json").inputValue();
  expect(onboardingPayload).toContain("lifeline-group-onboarding-v1");

  // B joins from onboarding payload.
  await deviceB.getByLabel("Group").check();
  await deviceB.locator("#group-json").fill(onboardingPayload);
  await deviceB.getByRole("button", { name: "📥 Join Group" }).click();
  await expect(deviceB.locator("#status")).toContainText("Joined group");
  await deviceB.locator("#group-select").selectOption({ index: 1 });

  // A sends, B decrypts.
  await deviceA.locator("#content").fill("A_TO_B_GROUP_MESSAGE_1");
  await deviceA.getByRole("button", { name: "🔒 Encrypt" }).click();
  const firstEncrypted = (await deviceA.locator("#encrypted").textContent()) || "";
  await deviceB.locator("#input").fill(firstEncrypted);
  await deviceB.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(deviceB.locator("#decrypted")).toHaveText("A_TO_B_GROUP_MESSAGE_1");

  // A sends second message.
  await deviceA.locator("#content").fill("A_TO_B_GROUP_MESSAGE_2");
  await deviceA.getByRole("button", { name: "🔒 Encrypt" }).click();
  const secondEncrypted = (await deviceA.locator("#encrypted").textContent()) || "";
  const secondParsed = JSON.parse(secondEncrypted);

  // B gets stale sender-state on purpose and fails.
  const staleSyncPayload = {
    type: "lifeline-sender-state-sync-v1",
    groupId: secondParsed.groupId,
    senderSignPK: secondParsed.senderSignPK,
    senderKeyState: {
      version: 1,
      chainKey: JSON.parse(onboardingPayload).group.senderKey.chainKey
    }
  };
  await deviceB.locator("#group-json").fill(JSON.stringify(staleSyncPayload, null, 2));
  await deviceB.getByRole("button", { name: "📥 Join Group" }).click();
  await expect(deviceB.locator("#status")).toContainText("Sender state sync skipped");

  await deviceB.locator("#input").fill(secondEncrypted);
  await deviceB.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(deviceB.locator("#status")).toContainText("SenderKey version mismatch");

  // A exports current sender-state sync payload for recovery, B imports and decrypts again.
  await deviceA.getByRole("button", { name: "🔁 Copy Sender-State Sync" }).click();
  const freshSyncPayload = await deviceA.locator("#group-json").inputValue();
  await deviceB.locator("#group-json").fill(freshSyncPayload);
  await deviceB.getByRole("button", { name: "📥 Join Group" }).click();
  await expect(deviceB.locator("#status")).toContainText("Sender state synced");

  await deviceB.locator("#input").fill(secondEncrypted);
  await deviceB.getByRole("button", { name: "🔓 Decrypt" }).click();
  await expect(deviceB.locator("#decrypted")).toHaveText("A_TO_B_GROUP_MESSAGE_2");

  await contextA.close();
  await contextB.close();
});

test("emergency mode: simplified template flow + mode persistence", async ({ page }) => {
  await boot(page);
  const myIdentity = await getMyIdentity(page);
  await addContact(page, myIdentity);
  await selectFirstContact(page);

  await page.getByLabel("Emergency Mode (Simplified)").check();
  await expect(page.locator("#emergency-mode-section")).toBeVisible();
  await expect(page.locator("#advanced-mode-sections")).toBeHidden();

  await page.locator("#emergency-template").selectOption("shelter");
  await page.locator("#emergency-name").fill("Shelter Team A");
  await page.locator("#emergency-location").fill("District 4");
  await page.locator("#emergency-status").fill("Operational");
  await page.locator("#emergency-people").fill("120");
  await page.locator("#emergency-details").fill("Need water refill in 6 hours.");
  await page.getByRole("button", { name: "🆘 Create Emergency Message" }).click();

  await expect(page.locator("#content")).toContainText("Shelter Team A");
  await expect(page.locator("#content")).toContainText("District 4");
  await expect(page.locator("#content")).toContainText("Need water refill in 6 hours.");

  await page.reload();
  await expect(page.getByLabel("Emergency Mode (Simplified)")).toBeChecked();
  await expect(page.locator("#emergency-mode-section")).toBeVisible();
});
