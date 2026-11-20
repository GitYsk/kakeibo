import { it, expect } from "vitest";
import { assetPosition, assets, type Entry } from "../src/core.ts";
import { BudgetDB } from "../src/db.ts";
const now = "2024-01-15T00:00:00Z";
const entry = (p: Partial<Entry>): Entry => ({
  date: "2024-01-10",
  type: "EXPENSE",
  amount: 10001,
  description: "Synthetic",
  storeId: null,
  installments: 2,
  paymentMethod: "NEXT_MONTH",
  recurringId: null,
  createdAt: now,
  updatedAt: now,
  ...p,
});
it("shows paid installments in current assets and reconciles scheduled amounts", () => {
  const rows = [
    entry({}),
    entry({
      type: "INCOME",
      amount: 20000,
      installments: 1,
      paymentMethod: "NOW",
    }),
  ];
  const jan = assetPosition(rows, "2024-01-15");
  expect(jan.current).toBe(20000);
  expect(jan.full).toBe(9999);
  expect(jan.scheduled).toBe(10001);
  expect(jan.pending.map((p) => p.amount)).toEqual([5001, 5000]);
  const feb = assetPosition(rows, "2024-02-15");
  expect(feb.current).toBe(14999);
  expect(feb.current - feb.full).toBe(feb.scheduled);
});
it("excludes all future-dated rows from current assets and separately accounts for full-period impact", () => {
  const rows = [
    entry({
      date: "2024-01-20",
      paymentMethod: "NOW",
      installments: 1,
      amount: 41,
    }),
  ];
  const p = assetPosition(rows, "2024-01-15");
  expect(p.current).toBe(0);
  expect(p.full).toBe(-41);
  expect(p.futureImpact).toBe(-41);
  expect(p.current - p.scheduled + p.futureImpact).toBe(p.full);
});
it("rejects future income atomically", async () => {
  const db = new BudgetDB("future-" + crypto.randomUUID());
  try {
    await db.initialize();
    await expect(
      db.saveEntry(
        entry({ type: "INCOME", date: "2024-01-16" }),
        "2024-01-15",
        now,
      ),
    ).rejects.toThrow();
    expect(await db.transactions.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
