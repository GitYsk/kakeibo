import {
  LEGACY_SCHEMA,
  protectBeforeMigration,
  captureMigrationBoundary,
} from "./migration.ts";
import Dexie, { type Table } from "dexie";
import {
  addMonths,
  amount,
  assets,
  defaults,
  dueMonths,
  priceFor,
  reminderEligible,
  requireValue,
  tokyoDate,
  validateCore,
  parseBackup,
  safeSum,
  validateEntry,
  weekKey,
  type Backup,
  type CoreBackup,
  type Entry,
  type Recurring,
  type Settings,
  type Snapshot,
  type State,
  type Store,
  type Employer,
  type Payslip,
  validatePayslip,
  validateSalaryTargets,
  PAY_FIELDS,
} from "./core.ts";
export class BudgetDB extends Dexie {
  transactions!: Table<Entry, number>;
  recurringPayments!: Table<Recurring, string>;
  stores!: Table<Store, number>;
  snapshots!: Table<Snapshot, number>;
  settings!: Table<{ id: string; value: Settings }, string>;
  employers!: Table<Employer, number>;
  payslips!: Table<Payslip, number>;
  private opening?: Promise<void>;
  constructor(name = "kakeibo-local") {
    super(name, { autoOpen: false });
    this.version(1).stores(LEGACY_SCHEMA);
    this.version(2)
      .stores({
        employers: "++id,&name,sortOrder",
        payslips: "++id,&transactionId,employerId,payDate",
      })
      .upgrade(async (tx) => {
        await captureMigrationBoundary(tx, "0.2.0");
      });
  }
  async prepareOpen(version = "0.2.0") {
    if (this.isOpen()) return;
    if (!this.opening)
      this.opening = (async () => {
        await protectBeforeMigration(this.name, version);
        await this.open();
      })().finally(() => {
        this.opening = undefined;
      });
    await this.opening;
  }

  tablesForWrite() {
    return [
      this.transactions,
      this.recurringPayments,
      this.stores,
      this.snapshots,
      this.settings,
      this.payslips,
      this.employers,
    ];
  }
  async prefs(): Promise<Settings> {
    return {
      ...defaults(),
      ...(await this.settings.get("preferences"))?.value,
    };
  }
  async setPrefs(value: Settings) {
    await this.settings.put({ id: "preferences", value });
  }
  async state(): Promise<State> {
    if (!this.isOpen()) await this.prepareOpen();
    return this.transaction("r", this.tablesForWrite(), async () => ({
      payslips: await this.payslips.toArray(),
      employers: (await this.employers.toArray()).sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
      entries: await this.transactions.toArray(),
      recurring: await this.recurringPayments.toArray(),
      stores: (await this.stores.toArray()).sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
      snapshots: (await this.snapshots.toArray()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      settings: await this.prefs(),
    }));
  }
  async initialize() {
    await this.prepareOpen();
    await this.transaction("rw", this.tablesForWrite(), async () => {
      if (!(await this.settings.get("preferences"))) {
        if (!(await this.stores.count()))
          await this.stores.bulkAdd(
            [
              "Amazon",
              "\u8ab2\u91d1",
              "Steam\uff08\u30b2\u30fc\u30e0\u8cfc\u5165\uff09",
              "\u305d\u306e\u4ed6",
            ].map((name, sortOrder) => ({ name, sortOrder, hidden: false })),
          );
        await this.setPrefs(defaults());
      }
    });
  }
  async patchSettings(patch: Partial<Settings>) {
    await this.transaction("rw", this.settings, async () => {
      if (patch.salaryTargets !== undefined)
        patch.salaryTargets = validateSalaryTargets(patch.salaryTargets);
      await this.setPrefs({ ...(await this.prefs()), ...patch });
    });
  }
  async exportCore(version: string, now: string): Promise<CoreBackup> {
    return {
      format: "kakeibo-web",
      schemaVersion: 2,
      payslips: await this.payslips.toArray(),
      employers: await this.employers.toArray(),
      exportedAt: now,
      appVersion: version,
      transactions: await this.transactions.toArray(),
      recurringPayments: await this.recurringPayments.toArray(),
      stores: await this.stores.toArray(),
      settings: await this.prefs(),
    };
  }
  async backup(
    version: string,
    now = new Date().toISOString(),
  ): Promise<Backup> {
    return this.transaction("r", this.tablesForWrite(), async () => ({
      ...(await this.exportCore(version, now)),
      snapshots: await this.snapshots.toArray(),
    }));
  }
  async trimSnapshots(preserveId?: number) {
    const all = await this.snapshots.toArray();
    const weekly = all
      .filter((s) => s.reason === "WEEKLY")
      .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
    const other = all
      .filter((s) => s.reason !== "WEEKLY" && s.reason !== "BEFORE_MIGRATION")
      .sort((a, b) =>
        a.id === preserveId
          ? -1
          : b.id === preserveId
            ? 1
            : b.createdAt.localeCompare(a.createdAt),
      );
    const migrations = all
      .filter((s) => s.reason === "BEFORE_MIGRATION")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await this.snapshots.bulkDelete(
      [...weekly.slice(8), ...other.slice(5), ...migrations.slice(5)].map(
        (s) => s.id!,
      ),
    );
  }
  async snapshotLocked(
    reason: Snapshot["reason"],
    version: string,
    date: string,
    now: string,
  ) {
    const key = weekKey(date);
    if (
      reason === "WEEKLY" &&
      (await this.snapshots.where("weeklyKey").equals(key).count())
    )
      return null;
    const data = await this.exportCore(version, now);
    const id = await this.snapshots.add({
      createdAt: now,
      weekKey: key,
      reason,
      weeklyKey: reason === "WEEKLY" ? key : undefined,
      data,
    });
    await this.trimSnapshots(reason === "WEEKLY" ? undefined : id);
    return id;
  }
  async snapshot(
    reason: "MANUAL" | "BEFORE_IMPORT",
    version: string,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ) {
    return this.transaction("rw", this.tablesForWrite(), async () => {
      return await this.snapshotLocked(reason, version, date, now);
    });
  }
  async generateLocked(date: string, now: string) {
    const month = date.slice(0, 7);
    for (const r of await this.recurringPayments.toArray()) {
      if (!r.active) continue;
      const existing = new Set(
        (
          await this.transactions.where("recurringId").equals(r.id).toArray()
        ).map((e) => e.date.slice(0, 7)),
      );
      for (const m of dueMonths(r, month, existing)) {
        await this.transactions.add({
          date: m + "-01",
          monthKey: m,
          type: r.type,
          amount: priceFor(r, m),
          description: r.description,
          storeId: r.storeId,
          installments: 1,
          paymentMethod: "MONTHLY",
          recurringId: r.id,
          createdAt: now,
          updatedAt: now,
          generatedKey: `${r.id}:${m}`,
        });
      }
      if (month > r.lastGeneratedMonth)
        await this.recurringPayments.put({ ...r, lastGeneratedMonth: month });
    }
  }
  async startup(
    version: string,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ) {
    await this.initialize();
    return this.transaction("rw", this.tablesForWrite(), async () => {
      await this.generateLocked(date, now);
      safeSum((await this.transactions.toArray()).map((e) => e.amount));
      await this.snapshotLocked("WEEKLY", version, date, now);
    });
  }
  async claimReminder(
    version: string,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ): Promise<Backup | null> {
    return this.transaction("rw", this.tablesForWrite(), async () => {
      const settings = await this.prefs();
      if (!reminderEligible(settings, date)) return null;
      const week = weekKey(date);
      const count = settings.reminderWeek === week ? settings.reminderCount : 0;
      await this.setPrefs({
        ...settings,
        reminderWeek: week,
        reminderCount: count + 1,
        retryDate: null,
      });
      return {
        ...(await this.exportCore(version, now)),
        snapshots: await this.snapshots.toArray(),
      };
    });
  }
  async later(date = tokyoDate()) {
    await this.transaction("rw", this.settings, async () => {
      const s = await this.prefs();
      if (s.reminderWeek === weekKey(date) && s.reminderCount === 1)
        await this.setPrefs({ ...s, retryDate: date });
    });
  }
  async markExport(method: string, now = new Date().toISOString()) {
    await this.patchSettings({
      lastExportAt: now,
      lastExportMethod: method,
      retryDate: null,
    });
  }
  async addStore(rawName: string): Promise<number> {
    const name = rawName.trim();
    requireValue(
      name.length > 0 && name.length <= 200,
      "\u8cfc\u5165\u5148\u306f1\u304b\u3089200\u6587\u5b57\u3067\u3059\u3002",
    );
    return this.transaction("rw", this.stores, async () => {
      const existing = await this.stores.where("name").equals(name).first();
      if (existing) return existing.id!;
      const stores = await this.stores.toArray();
      return this.stores.add({
        name,
        sortOrder: Math.max(-1, ...stores.map((s) => s.sortOrder)) + 1,
        hidden: false,
      });
    });
  }
  async renameStore(id: number, rawName: string) {
    const name = rawName.trim();
    requireValue(
      name && name.length <= 200,
      "\u8cfc\u5165\u5148\u306f1\u304b\u3089200\u6587\u5b57\u3067\u3059\u3002",
    );
    await this.transaction("rw", this.stores, async () => {
      const duplicate = await this.stores.where("name").equals(name).first();
      requireValue(
        !duplicate || duplicate.id === id,
        "\u540c\u3058\u540d\u524d\u306e\u8cfc\u5165\u5148\u304c\u3042\u308a\u307e\u3059\u3002",
      );
      requireValue(
        await this.stores.get(id),
        "\u8cfc\u5165\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      await this.stores.update(id, { name });
    });
  }
  async moveStore(id: number, direction: -1 | 1) {
    await this.transaction("rw", this.stores, async () => {
      const stores = (await this.stores.toArray()).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const index = stores.findIndex((s) => s.id === id);
      const other = stores[index + direction];
      if (index < 0 || !other) return;
      await this.stores.update(id, { sortOrder: other.sortOrder });
      await this.stores.update(other.id!, {
        sortOrder: stores[index].sortOrder,
      });
    });
  }
  async toggleStore(id: number) {
    await this.transaction("rw", this.stores, async () => {
      const store = await this.stores.get(id);
      requireValue(
        store,
        "\u8cfc\u5165\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      await this.stores.update(id, { hidden: !store.hidden });
    });
  }
  async deleteStore(id: number) {
    await this.transaction(
      "rw",
      [this.transactions, this.recurringPayments, this.stores],
      async () => {
        requireValue(
          !(await this.transactions.where("storeId").equals(id).count()) &&
            !(await this.recurringPayments.where("storeId").equals(id).count()),
          "\u8a18\u9332\u307e\u305f\u306f\u5b9a\u671f\u652f\u6255\u3067\u4f7f\u7528\u4e2d\u3067\u3059\u3002\u524a\u9664\u305b\u305a\u975e\u8868\u793a\u306b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
        );
        await this.stores.delete(id);
      },
    );
  }
  async saveEntry(
    input: Entry,
    date = tokyoDate(),
    now = new Date().toISOString(),
    payroll?: Payslip | null,
  ) {
    return this.transaction("rw", this.tablesForWrite(), async () => {
      const prior = input.id
        ? await this.transactions.get(input.id)
        : undefined;
      requireValue(
        !input.id || prior,
        "\u8a18\u9332\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      const recurringId =
        input.recurringId ??
        (input.paymentMethod === "MONTHLY" ? crypto.randomUUID() : null);
      const template = recurringId
        ? await this.recurringPayments.get(recurringId)
        : undefined;
      const e = validateEntry({
        ...input,
        recurringId,
        paymentMethod:
          template?.active === false && input.paymentMethod === "MONTHLY"
            ? "MONTHLY_ENDED"
            : input.paymentMethod,
        monthKey: input.date.slice(0, 7),
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
        generatedKey: prior?.generatedKey,
      });
      if (e.storeId !== null)
        requireValue(
          await this.stores.get(e.storeId),
          "\u8cfc\u5165\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
        );
      const id = e.id
        ? await this.transactions.put(e)
        : await this.transactions.add(e);
      const linked = await this.payslips
        .where("transactionId")
        .equals(id)
        .first();
      if (payroll === null) {
        if (linked) await this.payslips.delete(linked.id!);
      } else if (payroll !== undefined) {
        requireValue(
          e.type === "INCOME",
          "\u7d66\u4e0e\u660e\u7d30\u306f\u5165\u91d1\u3060\u3051\u306b\u8ffd\u52a0\u3067\u304d\u307e\u3059\u3002",
        );
        requireValue(
          !payroll.id || payroll.id === linked?.id,
          "\u5225\u306e\u660e\u7d30\u3092\u4e0a\u66f8\u304d\u3067\u304d\u307e\u305b\u3093\u3002",
        );
        const slip = validatePayslip({
          ...payroll,
          id: linked?.id,
          transactionId: id,
          createdAt: linked?.createdAt ?? now,
          updatedAt: now,
        });
        requireValue(
          await this.employers.get(slip.employerId),
          "\u52e4\u52d9\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
        );
        if (slip.id) await this.payslips.put(slip);
        else await this.payslips.add(slip);
      } else
        requireValue(
          !linked || e.type === "INCOME",
          "\u7d66\u4e0e\u660e\u7d30\u306e\u7d10\u3065\u304f\u5165\u91d1\u306e\u5206\u985e\u306f\u5909\u66f4\u3067\u304d\u307e\u305b\u3093\u3002",
        );
      if (e.paymentMethod === "MONTHLY" && !template)
        await this.recurringPayments.add({
          id: recurringId!,
          description: e.description,
          amount: e.amount,
          storeId: e.storeId,
          startDate: e.date,
          active: true,
          lastGeneratedMonth: e.date.slice(0, 7),
          type: e.type,
        });
      await this.generateLocked(date, now);
      safeSum((await this.transactions.toArray()).map((e) => e.amount));
      assets(await this.transactions.toArray());
      safeSum(
        (await this.payslips.toArray()).flatMap((p) =>
          PAY_FIELDS.map((key) => p[key]),
        ),
      );
      return id;
    });
  }
  async deleteEntry(id: number, disposition?: "DELETE" | "KEEP") {
    await this.transaction(
      "rw",
      [this.transactions, this.payslips],
      async () => {
        const slip = await this.payslips
          .where("transactionId")
          .equals(id)
          .first();
        if (slip) {
          requireValue(
            disposition,
            "\u660e\u7d30\u3082\u524a\u9664\u3059\u308b\u304b\u3001\u660e\u7d30\u3060\u3051\u6b8b\u3059\u304b\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
          );
          if (disposition === "DELETE") await this.payslips.delete(slip.id!);
          else
            await this.payslips.update(slip.id!, {
              transactionId: null,
              updatedAt: new Date().toISOString(),
            });
        }
        await this.transactions.delete(id);
      },
    );
  }
  async changePrice(
    id: string,
    value: number,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ) {
    amount(value);
    await this.transaction("rw", this.tablesForWrite(), async () => {
      await this.generateLocked(date, now);
      const r = await this.recurringPayments.get(id);
      requireValue(
        r?.active,
        "\u7d42\u4e86\u3057\u305f\u5b9a\u671f\u652f\u6255\u3067\u3059\u3002",
      );
      await this.recurringPayments.put({
        ...r,
        amount: priceFor(r, date.slice(0, 7)),
        pendingAmount: value,
        effectiveMonth: addMonths(date.slice(0, 7), 1),
      });
    });
  }
  async stopRecurring(
    id: string,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ) {
    await this.transaction("rw", this.tablesForWrite(), async () => {
      await this.generateLocked(date, now);
      const r = await this.recurringPayments.get(id);
      requireValue(
        r,
        "\u5b9a\u671f\u652f\u6255\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      await this.recurringPayments.put({ ...r, active: false });
      await this.transactions
        .where("recurringId")
        .equals(id)
        .and((e) => e.paymentMethod === "MONTHLY")
        .modify({ paymentMethod: "MONTHLY_ENDED", updatedAt: now });
    });
  }
  async addEmployer(rawName: string): Promise<number> {
    const name = rawName.trim();
    requireValue(
      name.length > 0 && name.length <= 200,
      "\u52e4\u52d9\u5148\u306f1\u304b\u3089200\u6587\u5b57\u3067\u3059\u3002",
    );
    return this.transaction("rw", this.employers, async () => {
      const existing = await this.employers.where("name").equals(name).first();
      if (existing) return existing.id!;
      const rows = await this.employers.toArray();
      return this.employers.add({
        name,
        sortOrder: Math.max(-1, ...rows.map((e) => e.sortOrder)) + 1,
        hidden: false,
      });
    });
  }
  async renameEmployer(id: number, rawName: string) {
    const name = rawName.trim();
    requireValue(
      name.length > 0 && name.length <= 200,
      "\u52e4\u52d9\u5148\u306f1\u304b\u3089200\u6587\u5b57\u3067\u3059\u3002",
    );
    await this.transaction("rw", this.employers, async () => {
      const duplicate = await this.employers.where("name").equals(name).first();
      requireValue(
        !duplicate || duplicate.id === id,
        "\u540c\u3058\u540d\u524d\u306e\u52e4\u52d9\u5148\u304c\u3042\u308a\u307e\u3059\u3002",
      );
      requireValue(
        await this.employers.get(id),
        "\u52e4\u52d9\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      await this.employers.update(id, { name });
    });
  }
  async moveEmployer(id: number, direction: -1 | 1) {
    await this.transaction("rw", this.employers, async () => {
      const rows = (await this.employers.toArray()).sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const i = rows.findIndex((e) => e.id === id);
      const other = rows[i + direction];
      if (i < 0 || !other) return;
      await this.employers.update(id, { sortOrder: other.sortOrder });
      await this.employers.update(other.id!, { sortOrder: rows[i].sortOrder });
    });
  }
  async toggleEmployer(id: number) {
    await this.transaction("rw", this.employers, async () => {
      const row = await this.employers.get(id);
      requireValue(
        row,
        "\u52e4\u52d9\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      await this.employers.update(id, { hidden: !row.hidden });
    });
  }
  async deleteEmployer(id: number) {
    await this.transaction("rw", [this.employers, this.payslips], async () => {
      requireValue(
        !(await this.payslips.where("employerId").equals(id).count()),
        "\u660e\u7d30\u3067\u4f7f\u7528\u4e2d\u3067\u3059\u3002\u524a\u9664\u305b\u305a\u975e\u8868\u793a\u306b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      );
      await this.employers.delete(id);
    });
  }
  async saveStandalonePayslip(input: Payslip, now = new Date().toISOString()) {
    return this.transaction("rw", [this.payslips, this.employers], async () => {
      const prior = input.id ? await this.payslips.get(input.id) : undefined;
      requireValue(
        !input.id || prior,
        "\u660e\u7d30\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      requireValue(
        !prior || prior.transactionId === null,
        "\u95a2\u9023\u3059\u308b\u5165\u91d1\u306e\u753b\u9762\u3067\u7de8\u96c6\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      );
      const slip = validatePayslip({
        ...input,
        transactionId: null,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
      requireValue(
        await this.employers.get(slip.employerId),
        "\u52e4\u52d9\u5148\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
      );
      const id = slip.id
        ? await this.payslips.put(slip)
        : await this.payslips.add(slip);
      safeSum(
        (await this.payslips.toArray()).flatMap((p) =>
          PAY_FIELDS.map((key) => p[key]),
        ),
      );
      return id;
    });
  }
  async deletePayslip(id: number) {
    await this.payslips.delete(id);
  }
  async replace(
    input: Backup,
    version: string,
    date = tokyoDate(),
    now = new Date().toISOString(),
  ) {
    input = parseBackup(JSON.stringify(input));
    const core = validateCore(input);
    await this.transaction("rw", this.tablesForWrite(), async () => {
      const persistence = (await this.prefs()).persistence;
      const safetyId = await this.snapshotLocked(
        "BEFORE_IMPORT",
        version,
        date,
        now,
      );
      await this.payslips.clear();
      await this.employers.clear();
      await this.transactions.clear();
      await this.recurringPayments.clear();
      await this.stores.clear();
      await this.employers.bulkAdd(core.employers ?? []);
      await this.payslips.bulkAdd(core.payslips ?? []);
      await this.stores.bulkAdd(core.stores);
      await this.recurringPayments.bulkAdd(core.recurringPayments);
      await this.transactions.bulkAdd(
        core.transactions.map((e) => ({ ...e, monthKey: e.date.slice(0, 7) })),
      );
      await this.setPrefs({ ...core.settings, persistence });
      for (const s of input.snapshots ?? []) {
        if (
          s.reason === "WEEKLY" &&
          (await this.snapshots.where("weeklyKey").equals(s.weekKey).count())
        )
          continue;
        const { id: _, ...snapshot } = s;
        await this.snapshots.add({
          ...snapshot,
          weeklyKey: s.reason === "WEEKLY" ? s.weekKey : undefined,
        });
      }
      await this.trimSnapshots(safetyId ?? undefined);
    });
  }
}
export const db = new BudgetDB();
