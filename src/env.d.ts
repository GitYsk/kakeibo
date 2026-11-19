/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
interface Window {
  showSaveFilePicker?: (
    options?: Record<string, unknown>,
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}
