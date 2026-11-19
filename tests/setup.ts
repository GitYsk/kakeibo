import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto)
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
if (!globalThis.CustomEvent)
  globalThis.CustomEvent = class<T> extends Event {
    detail: T;
    constructor(type: string, init?: CustomEventInit<T>) {
      super(type, init);
      this.detail = init?.detail as T;
    }
  } as unknown as typeof CustomEvent;
