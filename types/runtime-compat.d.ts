declare module "argon2-browser/dist/argon2-bundled.min.js" {
  const argon2: unknown;
  export default argon2;
}

declare module "@abandonware/bleno" {
  const bleno: any;
  export default bleno;
}

declare module "qrcode" {
  const QRCode: any;
  export default QRCode;
}

interface Navigator {
  bluetooth?: {
    requestDevice(options: unknown): Promise<unknown>;
  };
}

interface Window {
  argon2?: unknown;
  applyEmergencyTemplate?: () => void;
  confirmEmergencyTemplateOverwrite?: () => void;
  cancelEmergencyTemplateOverwrite?: () => void;
  setAppMode?: (mode: string) => void;
}

interface BluetoothDevice {
  id?: string;
  name?: string;
  gatt?: {
    connected?: boolean;
    connect(): Promise<unknown>;
    disconnect(): void;
  };
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}
