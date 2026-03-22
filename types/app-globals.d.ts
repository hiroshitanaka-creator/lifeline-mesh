/**
 * Browser globals declared by app/src/main.js.
 * These are functions attached to `window` for use from inline HTML event handlers.
 */


interface Window {
  initOrLoad(): Promise<void>;
  resetAll(): Promise<void>;
  copyMyId(): Promise<void>;
  showQRCode(): void;
  exportKeys(): Promise<void>;
  importKeys(): Promise<void>;
  addContact(): void;
  scanQRCode(): void;
  refreshContacts(): void;
  refreshGroups(): void;
  deleteSelectedContact(): void;
  createGroup(): void;
  joinGroup(): void;
  addSelectedMemberToGroup(): void;
  removeSelectedMemberFromGroup(): void;
  encryptMsg(): Promise<void>;
  copyEncrypted(): Promise<void>;
  exportEncryptedFile(): void;
  decryptMsg(): Promise<void>;
  bleScan(): Promise<void>;
  bleDisconnect(): void;
  bleSendEncrypted(): Promise<void>;
  flushOutboxNow(): Promise<void>;
  applyBleConfig(): void;
  resetBleConfig(): void;
  setMessageMode(mode: string): void;
  applyDisasterTemplate(): void;
  installPWA(): void;
  dismissInstall(): void;
  closeQRModal(): void;
  closeQRScanner(): void;
  // Test hook exposed in E2E specs
  __lifelineTest?: Record<string, unknown>;
}
