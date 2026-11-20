import { it, expect } from "vitest";
import {
  importCsv,
  mergeIncomeSources,
  defaults,
  type Backup,
} from "../src/core.ts";
it("maps and merges synthetic income sources while ignoring income payment columns", () => {
  const r = importCsv(
    "total,,,,,,,,,\n\u65e5\u4ed8,\u5206\u985e,\u91d1\u984d,\u5185\u5bb9,\u8cfc\u5165\u5148,\u5206\u5272\u56de\u6570,G,H,\u652f\u6255\u65b9\u6cd5,uuid\n2024/1/1,\u5165\u91d1,101,Synthetic A,,bad,,,unknown,x\n2024/1/2,\u5165\u91d1,102,Synthetic B,\u305d\u306e\u4ed6,,,,,\n2024/1/3,\u5165\u91d1,103,Refund,Synthetic shop,,,,,",
  );
  expect(r.skipped).toEqual([]);
  expect(r.incomeSources.map((s) => s.name)).toEqual([
    "Synthetic A",
    "Synthetic B",
    "Synthetic shop",
  ]);
  expect(r.transactions.map((e) => e.description)).toEqual(["", "", "Refund"]);
  expect(
    r.transactions.every(
      (e) =>
        e.storeId === null &&
        e.installments === 1 &&
        e.paymentMethod === "NOW" &&
        e.recurringId === null,
    ),
  ).toBe(true);
  const b: Backup = {
    ...r,
    format: "kakeibo-web",
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    appVersion: "test",
    payslips: [],
    settings: defaults(),
  };
  b.incomeSources![1].name = "Synthetic A";
  const merged = mergeIncomeSources(b);
  expect(merged.incomeSources).toHaveLength(2);
  expect(merged.transactions[1].incomeSourceId).toBe(
    merged.transactions[0].incomeSourceId,
  );
});
