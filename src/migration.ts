import Dexie, { type Transaction } from "dexie";
import {
  defaults,
  tokyoDate,
  weekKey,
  type Backup,
  type CoreBackup,
  type Snapshot,
} from "./core.ts";
export const LEGACY_SCHEMA = {
  transactions:
    "++id,date,type,storeId,paymentMethod,recurringId,&generatedKey,[recurringId+monthKey]",
  recurringPayments: "&id,storeId,lastGeneratedMonth",
  stores: "++id,&name,sortOrder",
  snapshots: "++id,createdAt,weekKey,reason,&weeklyKey",
  settings: "&id",
};
async function rawCore(
  database: Dexie,
  appVersion: string,
  now: string,
): Promise<CoreBackup> {
  const names = new Set(database.tables.map((t) => t.name));
  return {
    format: "kakeibo-web",
    schemaVersion: database.verno >= 3 ? 3 : database.verno >= 2 ? 2 : 1,
    exportedAt: now,
    appVersion,
    transactions: await database.table("transactions").toArray(),
    recurringPayments: await database.table("recurringPayments").toArray(),
    stores: await database.table("stores").toArray(),
    settings:
      (await database.table("settings").get("preferences"))?.value ??
      defaults(),
    ...(names.has("payslips")
      ? {
          payslips: await database.table("payslips").toArray(),
          ...(names.has("incomeSources")
            ? { incomeSources: await database.table("incomeSources").toArray() }
            : { employers: await database.table("employers").toArray() }),
        }
      : {}),
  };
}
export async function protectBeforeMigration(
  name: string,
  appVersion: string,
  now = new Date().toISOString(),
): Promise<void> {
  if (!(await Dexie.exists(name))) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    const legacy = new Dexie(name, { autoOpen: false });
    try {
      await legacy.open();
      if (legacy.verno >= 3) return;
      await legacy.transaction("rw", legacy.tables, async () => {
        const snapshots = legacy.table<Snapshot, number>("snapshots");
        const data = await rawCore(legacy, appVersion, now);
        const signature = migrationSignature;
        const protectedCopy = (
          await snapshots.where("reason").equals("BEFORE_MIGRATION").toArray()
        ).some((s) => signature(s.data) === signature(data));
        if (!protectedCopy) {
          await snapshots.add({
            createdAt: now,
            weekKey: weekKey(tokyoDate(new Date(now))),
            reason: "BEFORE_MIGRATION",
            data,
          });
        }
      });
      return;
    } catch (e) {
      if (
        attempt === 0 &&
        e instanceof Error &&
        ["DatabaseClosedError", "VersionError", "InvalidStateError"].includes(
          e.name,
        )
      )
        continue;
      throw e;
    } finally {
      legacy.close();
    }
  }
}
export async function recoveryBackup(
  name: string,
  appVersion: string,
  now = new Date().toISOString(),
): Promise<Backup | null> {
  if (!(await Dexie.exists(name))) return null;
  const legacy = new Dexie(name, { autoOpen: false });
  try {
    await legacy.open();
    return await legacy.transaction("r", legacy.tables, async () => {
      const snapshots = await legacy
        .table<Snapshot, number>("snapshots")
        .toArray();
      const latest = snapshots
        .filter((s) => s.reason === "BEFORE_MIGRATION")
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || (b.id ?? 0) - (a.id ?? 0),
        )[0];
      const current = await rawCore(legacy, appVersion, now);
      const signature = migrationSignature;
      return latest && signature(latest.data) === signature(current)
        ? { ...latest.data, snapshots: [] }
        : { ...current, snapshots: [] };
    });
  } finally {
    legacy.close();
  }
}

export async function captureMigrationBoundary(
  tx: Transaction,
  appVersion: string,
  now = new Date().toISOString(),
  from: 1 | 2 = 1,
) {
  const data: CoreBackup = {
    format: "kakeibo-web",
    schemaVersion: from,
    ...(from === 2
      ? {
          payslips: await tx.table("payslips").toArray(),
          employers: await tx.table("employers").toArray(),
        }
      : {}),
    exportedAt: now,
    appVersion,
    transactions: await tx.table("transactions").toArray(),
    recurringPayments: await tx.table("recurringPayments").toArray(),
    stores: await tx.table("stores").toArray(),
    settings:
      (await tx.table("settings").get("preferences"))?.value ?? defaults(),
  };
  const signature = migrationSignature;
  const table = tx.table<Snapshot, number>("snapshots");
  if (
    !(await table.where("reason").equals("BEFORE_MIGRATION").toArray()).some(
      (s) => signature(s.data) === signature(data),
    )
  )
    await table.add({
      createdAt: now,
      weekKey: weekKey(tokyoDate(new Date(now))),
      reason: "BEFORE_MIGRATION",
      data,
    });
}

function migrationSignature(core: CoreBackup) {
  return JSON.stringify([
    core.transactions,
    core.recurringPayments,
    core.stores,
    core.settings,
    core.payslips ?? [],
    (core as any).employers ?? [],
    core.incomeSources ?? [],
  ]);
}
