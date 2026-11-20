import { describe, it, expect } from "vitest";
import {
  assets,
  exportCsv,
  totals,
  charge,
  installment,
  weekKey,
  reminderEligible,
  defaults,
  importCsv,
  parseBackup,
  type Entry,
  type Backup,
} from "../src/core.ts";
import { BudgetDB } from "../src/db.ts";
const now = "2024-04-08T03:00:00.000Z";
const entry = (extra: Partial<Entry> = {}): Entry => ({
  date: "2024-01-12",
  type: "EXPENSE",
  amount: 10001,
  description: "Synthetic purchase",
  storeId: null,
  installments: 2,
  paymentMethod: "NEXT_MONTH",
  recurringId: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
async function database() {
  const db = new BudgetDB("test-" + crypto.randomUUID());
  await db.initialize();
  return db;
}
async function close(db: BudgetDB) {
  await db.delete();
}
describe("integer accounting", () => {
  it("puts the remainder in the first installment and shifts only payment mode", () => {
    const e = entry();
    expect(installment(10001, 2, 0)).toBe(5001);
    expect(charge(e, "2024-01", "PAYMENT")).toBeNull();
    expect(charge(e, "2024-02", "PAYMENT")?.amount).toBe(5001);
    expect(charge(e, "2024-03", "PAYMENT")?.amount).toBe(5000);
    expect(charge(e, "2024-04", "PAYMENT")).toBeNull();
    expect(charge(e, "2024-01", "PURCHASE")?.amount).toBe(5001);
  });
  it("includes adjustments only in assets and dates income without a shift", () => {
    const es = [
      entry({ amount: 300, installments: 1 }),
      entry({ type: "INCOME", amount: 1000 }),
      entry({ type: "ADJUST_INCOME", amount: 77 }),
    ];
    expect(assets(es)).toBe(777);
    expect(totals(es, "2024-01", "PAYMENT")).toEqual({
      expense: 0,
      income: 1000,
      balance: 1000,
    });
    expect(totals(es, "2024-02", "PAYMENT").expense).toBe(300);
  });
  it("carries December payments into January", () => {
    expect(
      charge(
        entry({ date: "2024-12-03", installments: 1 }),
        "2025-01",
        "PAYMENT",
      )?.amount,
    ).toBe(10001);
  });
});
describe("source CSV", () => {
  const header =
    "total,,,,,,,,,\r\n\u65e5\u4ed8,\u5206\u985e,\u91d1\u984d,\u5185\u5bb9,\u8cfc\u5165\u5148,\u5206\u5272\u56de\u6570,\u6708\u9593\u640d\u76ca,\u8a08\u7b97\u7528\u5217,\u652f\u6255\u65b9\u6cd5,uuid\r\n";
  it("handles BOM, yen, comma, quotes, empty cells and ignores formula-only rows", () => {
    const data = importCsv(
      "\uFEFF" +
        header +
        '2024/1/9,\u51fa\u8cbb,"\u00a510,001","A, B",,2,ignore,ignore,\u6765\u6708,\r\n,,,,,,9,8,,\r\n2024/2/30,\u51fa\u8cbb,20,B,,,,,,\r\n',
      now,
    );
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].amount).toBe(10001);
    expect(data.transactions[0].storeId).toBeNull();
    expect(data.transactions[0].description).toBe("A, B");
    expect(data.blankRows).toBe(1);
    expect(data.skipped[0].row).toBe(5);
  });
  it("builds templates from monthly UUIDs only, using latest status and amount", () => {
    const data = importCsv(
      header +
        "2024/1/3,\u51fa\u8cbb,111,Old,Shop,1,,,\u6bce\u6708,sub-a\n2024/3/3,\u51fa\u8cbb,222,New,Shop,1,,,\u5b9a\u671f\u652f\u6255\u7d42\u4e86,sub-a\n2024/3/3,\u51fa\u8cbb,8,Plain,,1,,,,other-id",
      now,
    );
    expect(data.recurringPayments).toHaveLength(1);
    expect(data.recurringPayments[0]).toMatchObject({
      active: false,
      amount: 222,
      description: "New",
      startDate: "2024-01-03",
      lastGeneratedMonth: "2024-03",
    });
  });
});
describe("weekly policy in Tokyo", () => {
  it("starts on Sunday and postpones once only on the same day", () => {
    const date = "2024-04-08";
    const s = defaults();
    expect(weekKey(date)).toBe("2024-04-07");
    expect(reminderEligible(s, date)).toBe(true);
    s.reminderWeek = "2024-04-07";
    s.reminderCount = 1;
    expect(reminderEligible(s, date)).toBe(false);
    s.retryDate = date;
    expect(reminderEligible(s, date)).toBe(true);
    expect(reminderEligible(s, "2024-04-09")).toBe(false);
    s.reminderCount = 2;
    expect(reminderEligible(s, date)).toBe(false);
    expect(reminderEligible(s, "2024-04-14")).toBe(true);
  });
  it("honors weekday and confirmed external export independently", () => {
    const s = { ...defaults(), reminderDay: 3 };
    expect(reminderEligible(s, "2024-04-08")).toBe(false);
    expect(reminderEligible(s, "2024-04-11")).toBe(true);
    s.lastExportAt = "2024-04-06T15:01:00Z";
    expect(reminderEligible(s, "2024-04-11")).toBe(false);
  });
});
describe("transactional persistence", () => {
  it("backfills missed months once across competing connections, preserves deletion, changes next month and stops", async () => {
    const db = await database();
    const peer = new BudgetDB(db.name);
    try {
      await db.saveEntry(
        entry({
          date: "2024-01-03",
          installments: 1,
          paymentMethod: "MONTHLY",
          amount: 111,
        }),
        "2024-01-03",
        now,
      );
      await Promise.all([
        db.startup("test", "2024-04-08", now),
        peer.startup("test", "2024-04-08", now),
      ]);
      expect(await db.transactions.count()).toBe(4);
      expect(await db.snapshots.where("reason").equals("WEEKLY").count()).toBe(
        1,
      );
      const r = (await db.recurringPayments.toArray())[0];
      const feb = (await db.transactions.toArray()).find((e) =>
        e.date.startsWith("2024-02"),
      )!;
      await db.deleteEntry(feb.id!);
      await db.startup("test", "2024-04-09", now);
      expect(await db.transactions.count()).toBe(3);
      await db.changePrice(r.id, 333, "2024-04-09", now);
      await db.startup("test", "2024-06-09", now);
      const es = await db.transactions.toArray();
      expect(es.find((e) => e.date.startsWith("2024-04"))?.amount).toBe(111);
      expect(es.find((e) => e.date.startsWith("2024-05"))?.amount).toBe(333);
      expect(es.find((e) => e.date.startsWith("2024-06"))?.amount).toBe(333);
      await db.stopRecurring(r.id, "2024-06-09", now);
      await db.startup("test", "2024-08-09", now);
      expect(await db.transactions.count()).toBe(5);
    } finally {
      peer.close();
      await close(db);
    }
  });
  it("atomically claims reminders once and allows a single same-day retry", async () => {
    const db = await database();
    try {
      const a = await Promise.all([
        db.claimReminder("test", "2024-04-08", now),
        db.claimReminder("test", "2024-04-08", now),
      ]);
      expect(a.filter(Boolean)).toHaveLength(1);
      await db.later("2024-04-08");
      expect(await db.claimReminder("test", "2024-04-09", now)).toBeNull();
      expect(await db.claimReminder("test", "2024-04-08", now)).not.toBeNull();
      await db.later("2024-04-08");
      expect(await db.claimReminder("test", "2024-04-08", now)).toBeNull();
    } finally {
      await close(db);
    }
  });
  it("retains eight weekly and five other snapshots without nested payloads", async () => {
    const db = await database();
    try {
      for (let i = 1; i <= 12; i++) {
        const day = new Date(Date.UTC(2024, 0, 1 + i * 7))
          .toISOString()
          .slice(0, 10);
        await db.startup("test", day, day + "T00:00:00Z");
      }
      for (let i = 0; i < 7; i++)
        await db.snapshot(
          "MANUAL",
          "test",
          "2024-04-08",
          `2024-04-08T00:00:0${i}Z`,
        );
      const es = await db.snapshots.toArray();
      expect(es.filter((s) => s.reason === "WEEKLY")).toHaveLength(8);
      expect(es.filter((s) => s.reason === "MANUAL")).toHaveLength(5);
      expect(es.every((s) => !("snapshots" in s.data))).toBe(true);
    } finally {
      await close(db);
    }
  });
  it("validates before replacing and retains recovery despite future snapshot timestamps", async () => {
    const db = await database();
    try {
      await db.saveEntry(
        entry({ amount: 44, installments: 1 }),
        "2024-01-12",
        now,
      );
      const original = await db.backup("test", now);
      const bad = structuredClone(original);
      bad.transactions[0].storeId = 999;
      await expect(
        db.replace(bad, "test", "2024-04-08", now),
      ).rejects.toThrow();
      expect(await db.transactions.count()).toBe(1);
      const incoming: Backup = {
        ...original,
        transactions: [],
        snapshots: Array.from({ length: 6 }, () => ({
          createdAt: "2099-01-01T00:00:00Z",
          weekKey: "2024-04-07",
          reason: "MANUAL",
          data: { ...original, transactions: [], snapshots: undefined } as any,
        })),
      };
      await db.replace(incoming, "test", "2024-04-08", now);
      expect(await db.transactions.count()).toBe(0);
      const recovery = (await db.snapshots.toArray()).find(
        (s) => s.reason === "BEFORE_IMPORT",
      );
      expect(recovery?.data.transactions[0].amount).toBe(44);
      expect(
        (await db.snapshots.toArray()).filter((s) => s.reason !== "WEEKLY"),
      ).toHaveLength(5);
      expect(
        parseBackup(JSON.stringify(await db.backup("test", now))).transactions,
      ).toHaveLength(0);
    } finally {
      await close(db);
    }
  });
  it("preserves store IDs through rename, rejects used deletion and selects trimmed duplicates", async () => {
    const db = await database();
    try {
      const id = await db.addStore(" Test shop ");
      expect(await db.addStore("Test shop")).toBe(id);
      await db.saveEntry(
        entry({ storeId: id, installments: 1 }),
        "2024-01-12",
        now,
      );
      await db.renameStore(id, "Renamed");
      expect((await db.transactions.toArray())[0].storeId).toBe(id);
      await expect(db.deleteStore(id)).rejects.toThrow();
    } finally {
      await close(db);
    }
  });
  it("keeps financial data and stable schema when reopening after a release", async () => {
    const db = await database();
    try {
      await db.saveEntry(
        entry({ amount: 19, installments: 1 }),
        "2024-01-12",
        now,
      );
      db.close();
      await db.open();
      await db.startup("new-release", "2024-04-08", now);
      expect((await db.transactions.toArray())[0].amount).toBe(19);
      expect(db.verno).toBe(3);
    } finally {
      await close(db);
    }
  });
});

it("exports quoted UTF-8 CSV while neutralizing spreadsheet formulas", () => {
  const text = exportCsv(
    [entry({ description: '=SYNTHETIC(1),"x"', installments: 1 })],
    [],
  );
  expect(text.startsWith("\uFEFFDate,Category")).toBe(true);
  expect(text).toContain("'=SYNTHETIC");
  expect(text).toContain('""x""');
});
