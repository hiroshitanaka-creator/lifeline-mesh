interface Element {
  value?: any;
  checked?: boolean;
  disabled?: boolean;
  max?: any;
  placeholder?: string;
  title?: string;
  dataset?: DOMStringMap;
  options?: HTMLOptionsCollection;
  selectedIndex?: number;
}

interface EventTarget {
  dataset?: DOMStringMap;
  files?: FileList | null;
  tagName?: string;
  value?: any;
  checked?: boolean;
}
