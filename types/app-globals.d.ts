/**
 * Browser globals declared by app/src/main.js.
 * These are functions attached to `window` for use from inline HTML event handlers.
 */

type LifelineMaintenanceState = {
  lastRunAt: number | null;
  lastResult: unknown;
  lastError: unknown;
  runs: number;
};

type BleManagerInstance = import("../bluetooth/ble-manager.js").BLEManager;

type LifelineTestHooks = {
  BLEManager: typeof import("../bluetooth/ble-manager.js").BLEManager;
  setBleManager(manager: BleManagerInstance | null): void;
  setBleManagerFactory(factory: (options?: {}) => BleManagerInstance): void;
  resetBle(): void;
  getMeshRuntimeSnapshot(): unknown;
  getMaintenanceState(): LifelineMaintenanceState;
  runMaintenanceNow(reason?: string): Promise<LifelineMaintenanceState>;
  simulateBleReceive(message: unknown): void;
};

interface Window {
  initOrLoad(): Promise<void>;
  resetAll(): Promise<void>;
  copyMyId(): Promise<void>;
  showQRCode(): Promise<void>;
  exportKeys(): Promise<void>;
  importKeys(): Promise<void>;
  addContact(): Promise<void>;
  scanQRCode(): Promise<void>;
  scanMessageQRCode(): Promise<void>;
  refreshContacts(): Promise<void>;
  refreshGroups(): Promise<void>;
  deleteSelectedContact(): Promise<void>;
  verifySelectedContact(): Promise<void>;
  markSelectedContactCompromised(): Promise<void>;
  createGroup(): Promise<void>;
  joinGroup(): Promise<void>;
  copyGroupOnboardingPayload(): Promise<void>;
  copySenderStateSyncPayload(): Promise<void>;
  addSelectedMemberToGroup(): Promise<void>;
  removeSelectedMemberFromGroup(): Promise<void>;
  encryptMsg(): Promise<void>;
  copyEncrypted(): Promise<void>;
  exportEncryptedFile(): Promise<void>;
  receiveFromClipboard(): Promise<void>;
  receiveFromFile(): void;
  handleDecryptFileSelected(file: File): Promise<void>;
  decryptMsg(): Promise<void>;
  bleScan(): Promise<void>;
  bleDisconnect(): void;
  bleSendEncrypted(): Promise<void>;
  flushOutboxNow(): Promise<void>;
  applyBleConfig(): void;
  resetBleConfig(): void;
  setMessageMode(mode: string): void;
  applyDisasterTemplate(): void;
  applyEmergencyTemplate(): void;
  confirmEmergencyTemplateOverwrite(): void;
  cancelEmergencyTemplateOverwrite(): void;
  setAppMode(mode: string): void;
  installPWA(): Promise<void>;
  dismissInstall(): void;
  closeQRModal(): void;
  closeQRScanner(): Promise<void>;
  // Test hook exposed in E2E/integration specs.
  __lifelineTest?: LifelineTestHooks;
}
