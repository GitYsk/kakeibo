import { afterEach, it, expect, vi } from "vitest";
import { beginSave, prepareBackup } from "../src/backup.ts";
import { defaults, type Backup } from "../src/core.ts";
const backup: Backup = {
  format: "kakeibo-web",
  schemaVersion: 1,
  exportedAt: "2024-04-08T00:00:00Z",
  appVersion: "test",
  transactions: [],
  recurringPayments: [],
  stores: [],
  settings: defaults(),
  snapshots: [],
};
const prepared = () => prepareBackup(backup);
afterEach(() => vi.unstubAllGlobals());
it("prepares the complete File before the save tap and invokes the picker synchronously", async () => {
  let closed = false;
  const write = vi.fn(async () => undefined);
  const picker = vi.fn(() =>
    Promise.resolve({
      createWritable: async () => ({
        write,
        close: async () => {
          closed = true;
        },
      }),
    }),
  );
  vi.stubGlobal("window", { showSaveFilePicker: picker });
  vi.stubGlobal("navigator", {});
  const p = prepared();
  const promise = beginSave(p);
  expect(picker).toHaveBeenCalledTimes(1);
  expect(p.file.name).toMatch(/^kakeibo_backup_/);
  expect(closed).toBe(false);
  expect(await promise).toMatchObject({ kind: "saved" });
  expect(write).toHaveBeenCalledWith(p.blob);
  expect(closed).toBe(true);
});
it("does not fall through to sharing after picker cancellation", async () => {
  const share = vi.fn();
  vi.stubGlobal("window", {
    showSaveFilePicker: () =>
      Promise.reject(new DOMException("cancelled", "AbortError")),
  });
  vi.stubGlobal("navigator", { share, canShare: () => true });
  expect(await beginSave(prepared())).toEqual({ kind: "cancelled" });
  expect(share).not.toHaveBeenCalled();
});
it("requires another tap after asynchronous picker failure", async () => {
  const share = vi.fn(async () => undefined);
  vi.stubGlobal("window", {
    showSaveFilePicker: () => Promise.reject(new Error("write failed")),
  });
  vi.stubGlobal("navigator", { share, canShare: () => true });
  const p = prepared();
  expect(await beginSave(p)).toMatchObject({ kind: "retry", canShare: true });
  expect(share).not.toHaveBeenCalled();
  expect(await beginSave(p, "share")).toMatchObject({ kind: "confirm" });
  expect(share).toHaveBeenCalledTimes(1);
});
it("offers an explicit fallback after synchronous picker rejection", async () => {
  vi.stubGlobal("window", {
    showSaveFilePicker: () => {
      throw new Error("unsupported");
    },
  });
  vi.stubGlobal("navigator", {});
  expect(await beginSave(prepared())).toMatchObject({
    kind: "retry",
    canShare: false,
  });
});
it("sharing requests confirmation and cancellation remains incomplete", async () => {
  vi.stubGlobal("window", {});
  const share = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { canShare: () => true, share });
  expect(await beginSave(prepared())).toMatchObject({ kind: "confirm" });
  share.mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
  expect(await beginSave(prepared())).toEqual({ kind: "cancelled" });
});
it("historical snapshots cannot count as a current backup", () => {
  expect(prepareBackup(backup, false).countsAsCurrent).toBe(false);
  expect(prepareBackup(backup, false).filename).toContain("snapshot");
});
it("does not report an external save when file sharing is unsupported", async () => {
  const click = vi.fn();
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", { canShare: () => false });
  vi.stubGlobal("document", { createElement: () => ({ click }) });
  vi.stubGlobal("setTimeout", vi.fn());
  expect(await beginSave(prepared())).toMatchObject({ kind: "confirm" });
  expect(click).toHaveBeenCalledTimes(1);
});
