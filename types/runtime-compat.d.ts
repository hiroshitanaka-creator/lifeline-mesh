declare module "argon2-browser/dist/argon2-bundled.min.js" {
  const argon2: unknown;
  export default argon2;
}

declare module "@abandonware/bleno" {
  const bleno: any;
  export default bleno;
}

interface Navigator {
  bluetooth?: {
    requestDevice(options: unknown): Promise<any>;
  };
}

interface Window {
  argon2?: unknown;
  applyEmergencyTemplate?: () => void;
  confirmEmergencyTemplateOverwrite?: () => void;
  cancelEmergencyTemplateOverwrite?: () => void;
  setAppMode?: (mode: string) => void;
}

declare const refreshContacts: () => void;
declare const refreshGroups: () => void;
declare const initOrLoad: () => Promise<void>;
declare const closeQRScanner: () => void;
declare const closeQRModal: () => void;
declare const addContact: () => void;
declare const setMessageMode: (mode: string) => void;
declare const setAppMode: (mode: string) => void;

type UIElement = Element & {
  value?: any;
  checked?: boolean;
  disabled?: boolean;
  max?: any;
  placeholder?: string;
  title?: string;
  dataset?: DOMStringMap;
  files?: FileList | null;
  options?: HTMLOptionsCollection;
  selectedIndex?: number;
  tagName?: string;
};

interface Element extends UIElement {}
interface HTMLElement extends UIElement {}
interface EventTarget extends UIElement {}


type BluetoothDevice = any;
