import type { Backup } from "./core.ts";
export interface Prepared {
  backup: Backup;
  file: File;
  blob: Blob;
  filename: string;
  countsAsCurrent: boolean;
}
export type SaveResult =
  | { kind: "saved"; method: string }
  | { kind: "confirm"; method: string }
  | { kind: "cancelled" }
  | { kind: "retry"; message: string; canShare: boolean };
export function prepareBackup(
  backup: Backup,
  countsAsCurrent = true,
): Prepared {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(backup.exportedAt));
  const part = (name: string) => p.find((v) => v.type === name)!.value;
  const filename = `kakeibo_${countsAsCurrent ? "backup" : "snapshot"}_${part("year")}${part("month")}${part("day")}_${part("hour")}${part("minute")}${part("second")}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  if (blob.size > 64 * 1024 * 1024)
    throw new Error(
      "\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u304c64 MiB\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002",
    );
  return {
    backup,
    blob,
    filename,
    file: new File([blob], filename, { type: "application/json" }),
    countsAsCurrent,
  };
}
function shareSupported(p: Prepared) {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [p.file] })
    );
  } catch {
    return false;
  }
}
export function beginSave(
  p: Prepared,
  method: "auto" | "share" | "download" = "auto",
): Promise<SaveResult> {
  const cancelled = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";
  if (method === "auto" && typeof window.showSaveFilePicker === "function") {
    let picker: ReturnType<NonNullable<Window["showSaveFilePicker"]>>;
    try {
      picker = window.showSaveFilePicker({
        suggestedName: p.filename,
        types: [
          {
            description: "JSON backup",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    } catch (error) {
      return Promise.resolve(
        cancelled(error)
          ? { kind: "cancelled" }
          : {
              kind: "retry",
              message:
                "\u4ed6\u306e\u4fdd\u5b58\u65b9\u6cd5\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
              canShare: shareSupported(p),
            },
      );
    }
    return picker
      .then(async (handle) => {
        const stream = await handle.createWritable();
        await stream.write(p.blob);
        await stream.close();
        return {
          kind: "saved",
          method: "\u4fdd\u5b58\u5148\u9078\u629e",
        } as SaveResult;
      })
      .catch((error) =>
        cancelled(error)
          ? { kind: "cancelled" }
          : {
              kind: "retry",
              message:
                "\u3053\u306e\u4fdd\u5b58\u5148\u306b\u306f\u66f8\u304d\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u5171\u6709\u307e\u305f\u306f\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
              canShare: shareSupported(p),
            },
      );
  }
  if ((method === "auto" || method === "share") && shareSupported(p)) {
    return navigator
      .share({
        files: [p.file],
        title: "\u5bb6\u8a08\u7c3f\u30d0\u30c3\u30af\u30a2\u30c3\u30d7",
      })
      .then(
        () =>
          ({
            kind: "confirm",
            method: "\u30d5\u30a1\u30a4\u30eb\u5171\u6709",
          }) as SaveResult,
      )
      .catch((error) =>
        cancelled(error)
          ? { kind: "cancelled" }
          : {
              kind: "retry",
              message:
                "\u5171\u6709\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
              canShare: false,
            },
      );
  }
  const url = URL.createObjectURL(p.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = p.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return Promise.resolve({
    kind: "confirm",
    method: "\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9",
  });
}
