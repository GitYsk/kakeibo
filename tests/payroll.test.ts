import { describe, it, expect, vi } from "vitest";
import Dexie from "dexie";
import { BudgetDB } from "../src/db.ts";
import {
  LEGACY_SCHEMA,
  protectBeforeMigration,
  recoveryBackup,
} from "../src/migration.ts";
import {
  emptyPayslip,
  payslipTotals,
  annualSalary,
  assets,
  totals,
  defaults,
  parseBackup,
  missingSalaryEntries,
  salaryCsv,
  type Payslip,
  type Entry,
} from "../src/core.ts";
const now = "2024-05-08T01:02:03.000Z";
const slip = (extra: Partial<Payslip> = {}): Payslip => ({
  ...emptyPayslip("2024-05-25"),
  employerId: 1,
  basePay: 120003,
  overtimePay: 4001,
  otherTaxablePay: 502,
  commuteAllowance: 805,
  otherNonTaxablePay: 109,
  healthInsurance: 1503,
  pensionInsurance: 2607,
  employmentInsurance: 203,
  incomeTax: 503,
  residentTax: 907,
  otherDeductions: 101,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
const income = (extra: Partial<Entry> = {}): Entry => ({
  date: "2024-05-25",
  type: "INCOME",
  amount: 10000,
  description: "Synthetic payroll",
  storeId: null,
  installments: 1,
  paymentMethod: "NOW",
  recurringId: null,
  createdAt: now,
  updatedAt: now,
  ...extra,
});
async function database() {
  const db = new BudgetDB("payroll-" + crypto.randomUUID());
  await db.initialize();
  await db.addEmployer("Synthetic employer");
  return db;
}
describe("payroll calculations", () => {
  it("calculates taxable, non-taxable, gross, social, deductions and net exactly", () => {
    expect(payslipTotals(slip())).toEqual({
      taxable: 124506,
      nonTaxable: 914,
      gross: 125420,
      social: 4313,
      deductions: 5824,
      net: 119596,
    });
  });
  it("groups by payment date year, independent of the work period and income date", () => {
    const rows = [
      slip({ id: 1, payDate: "2025-01-25", workPeriod: "2024-12" }),
      slip({ id: 2, payDate: "2024-12-25" }),
    ];
    const employers = [
      { id: 1, name: "Synthetic employer", sortOrder: 0, hidden: false },
    ];
    expect(annualSalary(rows, employers, 2024).taxable).toBe(124506);
    const value = annualSalary(rows, employers, 2025);
    expect(value.months[0].taxable).toBe(124506);
    expect(value.months[11].taxable).toBe(0);
    expect(value.employers[0].incomeTax).toBe(503);
    expect(value.gross - value.taxable).toBe(914);
  });
  it("detects only exact known payroll descriptions or linked employer names and exports summaries", () => {
    const rows = [
      income({ id: 1 }),
      income({ id: 2 }),
      income({ id: 3, description: "Synthetic employer" }),
      income({ id: 4, description: "Other income" }),
      income({ id: 5, date: "2023-05-25" }),
    ];
    const slips = [slip({ id: 1, transactionId: 1 })];
    const employers = [
      { id: 1, name: "Synthetic employer", sortOrder: 0, hidden: false },
    ];
    expect(
      missingSalaryEntries(rows, slips, employers, 2024).map((e) => e.id),
    ).toEqual([2, 3]);
    const csv = salaryCsv(slips, employers, 2024);
    expect(csv).toContain("124506");
    expect(csv).toContain('"Employer"');
    expect(csv).toContain('"2024-05"');
  });
});
describe("atomic payroll storage", () => {
  it("adds standalone slips without changing assets or household income", async () => {
    const db = await database();
    try {
      await db.saveEntry(income(), "2024-05-25", now);
      const before = assets((await db.state()).entries);
      await db.saveStandalonePayslip(slip(), now);
      const state = await db.state();
      expect(assets(state.entries)).toBe(before);
      expect(totals(state.entries, "2024-05", "PAYMENT").income).toBe(10000);
      expect(annualSalary(state.payslips, state.employers, 2024).taxable).toBe(
        124506,
      );
      expect(state.payslips[0].transactionId).toBeNull();
    } finally {
      await db.delete();
    }
  });
  it("attaches to an existing income, allows a net mismatch and never silently overwrites income", async () => {
    const db = await database();
    try {
      const id = await db.saveEntry(income(), "2024-05-25", now);
      const original = await db.transactions.get(id);
      await db.saveEntry(original!, "2024-05-25", now, slip());
      expect((await db.payslips.toArray())[0].transactionId).toBe(id);
      expect((await db.transactions.get(id))?.amount).toBe(10000);
      const current = (await db.payslips.toArray())[0];
      await db.saveEntry({ ...original!, amount: 119596 }, "2024-05-25", now, {
        ...current,
        basePay: 120003,
      });
      expect(await db.payslips.count()).toBe(1);
      await db.saveEntry(
        { ...original!, type: "EXPENSE" },
        "2024-05-25",
        now,
        null,
      );
      expect(await db.payslips.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
  it("rejects invalid references and negative/fractional inputs without partially adding an income", async () => {
    const db = await database();
    try {
      await expect(
        db.saveEntry(income(), "2024-05-25", now, slip({ employerId: 999 })),
      ).rejects.toThrow();
      expect(await db.transactions.count()).toBe(0);
      await expect(
        db.saveStandalonePayslip(slip({ incomeTax: -1 })),
      ).rejects.toThrow();
      await expect(
        db.saveStandalonePayslip(slip({ basePay: 1.5 })),
      ).rejects.toThrow();
      expect(await db.payslips.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
  it("requires an explicit linked-slip deletion choice, preserves or deletes it atomically", async () => {
    const db = await database();
    try {
      const id = await db.saveEntry(income(), "2024-05-25", now, slip());
      await expect(db.deleteEntry(id)).rejects.toThrow();
      expect(await db.transactions.count()).toBe(1);
      await db.deleteEntry(id, "KEEP");
      expect(await db.transactions.count()).toBe(0);
      expect((await db.payslips.toArray())[0].transactionId).toBeNull();
      const second = await db.saveEntry(income(), "2024-05-25", now, slip());
      await db.deleteEntry(second, "DELETE");
      expect(await db.payslips.count()).toBe(1);
    } finally {
      await db.delete();
    }
  });
  it("keeps stable employer references and validates named user targets", async () => {
    const db = await database();
    try {
      expect(await db.addEmployer(" Synthetic employer ")).toBe(1);
      await db.saveStandalonePayslip(slip(), now);
      await db.renameEmployer(1, "Renamed employer");
      await db.toggleEmployer(1);
      await expect(db.deleteEmployer(1)).rejects.toThrow();
      expect((await db.payslips.toArray())[0].employerId).toBe(1);
      await db.patchSettings({
        salaryTargets: [
          { id: "synthetic-target", name: "Personal target", amount: 222222 },
        ],
      });
      expect((await db.prefs()).salaryTargets[0].amount).toBe(222222);
      await expect(
        db.patchSettings({
          salaryTargets: [{ id: "bad", name: "", amount: 3 }],
        }),
      ).rejects.toThrow();
    } finally {
      await db.delete();
    }
  });
  it("round-trips payroll, employers, user targets and flat snapshots; accepts legacy backups", async () => {
    const db = await database();
    try {
      await db.saveStandalonePayslip(slip(), now);
      await db.patchSettings({
        salaryTargets: [
          { id: "target", name: "Synthetic target", amount: 222222 },
        ],
      });
      await db.snapshot("MANUAL", "test", "2024-05-25", now);
      const backup = await db.backup("test", now);
      const parsed = parseBackup(JSON.stringify(backup));
      expect(parsed.schemaVersion).toBe(2);
      expect(parsed.payslips).toHaveLength(1);
      expect(parsed.snapshots![0].data.payslips).toHaveLength(1);
      await db.replace(parsed, "test", "2024-05-25", now);
      expect(await db.payslips.count()).toBe(1);
      const legacy = {
        ...backup,
        schemaVersion: 1,
        payslips: undefined,
        employers: undefined,
        settings: { ...defaults(), salaryTargets: undefined },
        snapshots: [],
      };
      await db.replace(
        parseBackup(JSON.stringify(legacy)),
        "test",
        "2024-05-25",
        now,
      );
      expect(await db.payslips.count()).toBe(0);
      expect((await db.prefs()).salaryTargets).toEqual([]);
      expect(
        (await db.snapshots.toArray()).some(
          (s) => s.reason === "BEFORE_IMPORT" && s.data.payslips?.length === 1,
        ),
      ).toBe(true);
    } finally {
      await db.delete();
    }
  });
  it("rejects corrupt payroll inside a snapshot before changing any table", async () => {
    const db = await database();
    try {
      await db.saveStandalonePayslip(slip(), now);
      await db.snapshot("MANUAL", "test", "2024-05-25", now);
      const backup = await db.backup("test", now);
      backup.snapshots![0].data.payslips![0].employerId = 999;
      await expect(
        db.replace(backup, "test", "2024-05-25", now),
      ).rejects.toThrow();
      expect(await db.payslips.count()).toBe(1);
    } finally {
      await db.delete();
    }
  });
});
async function seedLegacy(name: string) {
  const db = new Dexie(name);
  db.version(1).stores(LEGACY_SCHEMA);
  await db.open();
  const settings = defaults();
  const { salaryTargets: _, ...oldSettings } = settings;
  await db.table("transactions").add(income({ id: 7, amount: 73 }));
  await db
    .table("stores")
    .add({ id: 3, name: "Synthetic legacy shop", sortOrder: 0, hidden: true });
  await db.table("settings").put({ id: "preferences", value: oldSettings });
  const prior = {
    transactions: await db.table("transactions").toArray(),
    stores: await db.table("stores").toArray(),
    settings: await db.table("settings").toArray(),
  };
  db.close();
  return prior;
}
describe("schema migration protection", () => {
  it("retains every legacy object and ID while adding empty tables and one pre-migration snapshot", async () => {
    const name = "migration-" + crypto.randomUUID();
    const prior = await seedLegacy(name);
    const db = new BudgetDB(name);
    try {
      await db.prepareOpen("test");
      expect(db.verno).toBe(2);
      expect(await db.transactions.toArray()).toEqual(prior.transactions);
      expect(await db.stores.toArray()).toEqual(prior.stores);
      expect(await db.settings.toArray()).toEqual(prior.settings);
      expect(await db.payslips.count()).toBe(0);
      expect(await db.employers.count()).toBe(0);
      const copies = await db.snapshots
        .where("reason")
        .equals("BEFORE_MIGRATION")
        .toArray();
      expect(copies).toHaveLength(1);
      expect(copies[0].data.transactions).toEqual(prior.transactions);
      expect(copies[0].data.schemaVersion).toBe(1);
    } finally {
      await db.delete();
    }
  });
  it("leaves legacy financial data and the committed snapshot intact when upgrade aborts, enabling recovery export", async () => {
    const name = "failed-migration-" + crypto.randomUUID();
    const prior = await seedLegacy(name);
    const db = new BudgetDB(name);
    db.version(2).upgrade(() => {
      throw new Error("Synthetic migration failure");
    });
    try {
      await expect(db.prepareOpen("test")).rejects.toThrow(
        "Synthetic migration failure",
      );
      const legacy = new Dexie(name);
      await legacy.open();
      expect(legacy.verno).toBe(1);
      expect(await legacy.table("transactions").toArray()).toEqual(
        prior.transactions,
      );
      expect(
        await legacy
          .table("snapshots")
          .where("reason")
          .equals("BEFORE_MIGRATION")
          .count(),
      ).toBe(1);
      legacy.close();
      const recovery = await recoveryBackup(name, "test", now);
      expect(recovery?.transactions).toEqual(prior.transactions);
      expect(parseBackup(JSON.stringify(recovery)).schemaVersion).toBe(1);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });
  it("deduplicates identical preflight copies but captures new legacy writes before retry", async () => {
    const name = "migration-retry-" + crypto.randomUUID();
    await seedLegacy(name);
    try {
      await Promise.all([
        protectBeforeMigration(name, "test", now),
        protectBeforeMigration(name, "test", now),
      ]);
      const legacy = new Dexie(name);
      await legacy.open();
      expect(await legacy.table("snapshots").count()).toBe(1);
      await legacy.table("transactions").add(income({ id: 8, amount: 87 }));
      legacy.close();
      await protectBeforeMigration(name, "test", "2024-05-09T00:00:00Z");
      const db = new BudgetDB(name);
      await db.prepareOpen("test");
      expect(
        await db.snapshots.where("reason").equals("BEFORE_MIGRATION").count(),
      ).toBe(2);
      expect(await db.transactions.count()).toBe(2);
      db.close();
    } finally {
      await Dexie.delete(name);
    }
  });
});

it("keeps schema v1 when committing the migration copy fails", async () => {
  const name = "copy-failure-" + crypto.randomUUID();
  const prior = await seedLegacy(name);
  const db = new BudgetDB(name);
  const original = IDBObjectStore.prototype.add;
  const spy = vi
    .spyOn(IDBObjectStore.prototype, "add")
    .mockImplementation(function (
      this: IDBObjectStore,
      value: any,
      key?: IDBValidKey,
    ) {
      if (this.name === "snapshots" && value.reason === "BEFORE_MIGRATION")
        throw new DOMException("Synthetic quota error", "QuotaExceededError");
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    });
  try {
    await expect(db.prepareOpen("test")).rejects.toThrow();
    spy.mockRestore();
    const legacy = new Dexie(name);
    await legacy.open();
    expect(legacy.verno).toBe(1);
    expect(await legacy.table("transactions").toArray()).toEqual(
      prior.transactions,
    );
    legacy.close();
    expect((await recoveryBackup(name, "test", now))?.transactions).toEqual(
      prior.transactions,
    );
  } finally {
    spy.mockRestore();
    db.close();
    await Dexie.delete(name);
  }
});
it("captures a final boundary copy if legacy writes arrive after preflight", async () => {
  const name = "boundary-" + crypto.randomUUID();
  await seedLegacy(name);
  try {
    await protectBeforeMigration(name, "test", now);
    const legacy = new Dexie(name);
    await legacy.open();
    await legacy.table("transactions").add(income({ id: 9, amount: 97 }));
    legacy.close();
    const db = new BudgetDB(name);
    await db.open();
    const snapshots = await db.snapshots
      .where("reason")
      .equals("BEFORE_MIGRATION")
      .toArray();
    expect(snapshots).toHaveLength(2);
    expect(snapshots.some((s) => s.data.transactions.length === 2)).toBe(true);
    db.close();
  } finally {
    await Dexie.delete(name);
  }
});

it("reopens a closed database instance through the protected startup path", async () => {
  const db = await database();
  try {
    await db.saveStandalonePayslip(slip(), now);
    db.close();
    await db.prepareOpen("test");
    expect((await db.state()).payslips).toHaveLength(1);
  } finally {
    await db.delete();
  }
});
