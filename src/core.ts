export type EntryType =
  "INCOME" | "EXPENSE" | "ADJUST_INCOME" | "ADJUST_EXPENSE";
export type Payment = "NOW" | "NEXT_MONTH" | "MONTHLY" | "MONTHLY_ENDED";
export type Accounting = "PAYMENT" | "PURCHASE";
export interface Entry {
  id?: number;
  date: string;
  type: EntryType;
  amount: number;
  description: string;
  storeId: number | null;
  incomeSourceId?: number | null;
  installments: number;
  paymentMethod: Payment;
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
  generatedKey?: string;
  monthKey?: string;
}
export interface Recurring {
  id: string;
  description: string;
  amount: number;
  storeId: number | null;
  startDate: string;
  active: boolean;
  lastGeneratedMonth: string;
  type: EntryType;
  pendingAmount?: number;
  effectiveMonth?: string;
}
export interface Store {
  id?: number;
  name: string;
  sortOrder: number;
  hidden: boolean;
}
export interface RecordFilter {
  parties: string[];
  payments: string[];
  payroll: string[];
  installments: boolean;
  adjustments: boolean;
  from: string;
  to: string;
}
export interface Settings {
  recordView?: "EXPENSE" | "INCOME";
  recordFilters?: Record<string, RecordFilter>;
  accounting: Accounting;
  lastExportAt: string | null;
  lastExportMethod: string;
  remindersEnabled: boolean;
  reminderDay: number;
  reminderWeek: string;
  reminderCount: number;
  retryDate: string | null;
  persistence: "granted" | "denied" | "unsupported" | "unknown";
  salaryTargets: SalaryTarget[];
}
export interface CoreBackup {
  format: "kakeibo-web";
  schemaVersion: 1 | 2 | 3;
  exportedAt: string;
  appVersion: string;
  transactions: Entry[];
  recurringPayments: Recurring[];
  stores: Store[];
  payslips?: Payslip[];
  incomeSources?: IncomeSource[];
  settings: Settings;
}
export interface Snapshot {
  id?: number;
  createdAt: string;
  weekKey: string;
  reason: "WEEKLY" | "BEFORE_IMPORT" | "BEFORE_MIGRATION" | "MANUAL";
  weeklyKey?: string;
  data: CoreBackup;
}
export interface Backup extends CoreBackup {
  snapshots?: Snapshot[];
}
export interface State {
  payslips: Payslip[];
  incomeSources: IncomeSource[];
  entries: Entry[];
  recurring: Recurring[];
  stores: Store[];
  snapshots: Snapshot[];
  settings: Settings;
}
export interface Charge {
  entry: Entry;
  amount: number;
  installment: number;
}
export const TYPES: EntryType[] = [
  "INCOME",
  "EXPENSE",
  "ADJUST_INCOME",
  "ADJUST_EXPENSE",
];
export const PAYMENTS: Payment[] = [
  "NOW",
  "NEXT_MONTH",
  "MONTHLY",
  "MONTHLY_ENDED",
];
export const TYPE_LABEL: Record<EntryType, string> = {
  INCOME: "\u5165\u91d1",
  EXPENSE: "\u51fa\u8cbb",
  ADJUST_INCOME: "\u8abf\u6574\u7528\u5165\u91d1",
  ADJUST_EXPENSE: "\u8abf\u6574\u7528\u51fa\u8cbb",
};
export const PAYMENT_LABEL: Record<Payment, string> = {
  NOW: "\u5f53\u6708\u6255\u3044",
  NEXT_MONTH: "\u6765\u6708\u6255\u3044",
  MONTHLY: "\u6bce\u6708",
  MONTHLY_ENDED: "\u5b9a\u671f\u652f\u6255\u7d42\u4e86",
};
export const defaults = (): Settings => ({
  accounting: "PAYMENT",
  lastExportAt: null,
  lastExportMethod: "",
  remindersEnabled: true,
  reminderDay: 0,
  reminderWeek: "",
  reminderCount: 0,
  retryDate: null,
  persistence: "unknown",
  salaryTargets: [],
});
export function fail(message: string): never {
  throw new Error(message);
}
export function requireValue(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(message);
}
export function tokyoDate(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(date + "T00:00:00Z");
  return (
    Number.isFinite(value.valueOf()) &&
    value.toISOString().slice(0, 10) === date &&
    +date.slice(0, 4) >= 1900 &&
    +date.slice(0, 4) <= 2200
  );
}
export function validMonth(month: string): boolean {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    +month.slice(0, 4) >= 1800 &&
    +month.slice(0, 4) <= 2300
  );
}
export function monthNumber(month: string): number {
  requireValue(
    validMonth(month),
    "\u5e74\u6708\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  return +month.slice(0, 4) * 12 + +month.slice(5, 7) - 1;
}
export function addMonths(month: string, count: number): string {
  const n = monthNumber(month) + count;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekKey(date: string): string {
  requireValue(
    validDate(date),
    "\u65e5\u4ed8\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  return addDays(date, -new Date(date + "T00:00:00Z").getUTCDay());
}
export function weekComplete(settings: Settings, date: string): boolean {
  return (
    settings.lastExportAt !== null &&
    weekKey(tokyoDate(new Date(settings.lastExportAt))) === weekKey(date)
  );
}
export function reminderEligible(s: Settings, date: string): boolean {
  const week = weekKey(date);
  if (
    !s.remindersEnabled ||
    weekComplete(s, date) ||
    date < addDays(week, s.reminderDay)
  )
    return false;
  if (s.reminderWeek !== week || s.reminderCount === 0) return true;
  return s.reminderCount === 1 && s.retryDate === date;
}
export function amount(value: unknown): number {
  requireValue(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 1_000_000_000_000,
    "\u91d1\u984d\u306f0\u304b\u30891\u5146\u5186\u307e\u3067\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
  );
  return value;
}
export function safeSum(values: number[]): number {
  const n = values.reduce((s, v) => s + BigInt(v), 0n);
  requireValue(
    n <= BigInt(Number.MAX_SAFE_INTEGER) &&
      n >= BigInt(Number.MIN_SAFE_INTEGER),
    "\u96c6\u8a08\u984d\u304c\u6b63\u78ba\u306b\u6271\u3048\u308b\u7bc4\u56f2\u3092\u8d85\u3048\u3066\u3044\u307e\u3059\u3002",
  );
  return Number(n);
}
export function validateEntry(e: Entry): Entry {
  requireValue(
    validDate(e.date),
    "\u65e5\u4ed8\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  requireValue(
    TYPES.includes(e.type),
    "\u5206\u985e\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  amount(e.amount);
  requireValue(
    Number.isInteger(e.installments) &&
      e.installments >= 1 &&
      e.installments <= 1200,
    "\u5206\u5272\u56de\u6570\u306f1\u304b\u30891200\u56de\u3067\u3059\u3002",
  );
  requireValue(
    PAYMENTS.includes(e.paymentMethod),
    "\u652f\u6255\u65b9\u6cd5\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  requireValue(
    typeof e.description === "string" && e.description.length <= 10000,
    "\u5185\u5bb9\u306f1\u4e07\u6587\u5b57\u4ee5\u5185\u3067\u3059\u3002",
  );
  requireValue(
    e.storeId === null || (Number.isSafeInteger(e.storeId) && e.storeId > 0),
    "\u8cfc\u5165\u5148ID\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  requireValue(
    e.recurringId === null ||
      (typeof e.recurringId === "string" &&
        e.recurringId.length > 0 &&
        e.recurringId.length <= 200),
    "\u5b9a\u671f\u652f\u6255ID\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  if (e.paymentMethod === "MONTHLY" || e.paymentMethod === "MONTHLY_ENDED")
    requireValue(
      e.recurringId && e.installments === 1,
      "\u6bce\u6708\u306e\u652f\u6255\u306b\u306f\u5b9a\u671f\u652f\u6255ID\u3068\u5206\u52721\u56de\u306e\u6307\u5b9a\u304c\u5fc5\u8981\u3067\u3059\u3002",
    );
  return e;
}
export function installment(
  total: number,
  count: number,
  index: number,
): number {
  return Math.floor(total / count) + (index === 0 ? total % count : 0);
}
export function charge(
  e: Entry,
  month: string,
  mode: Accounting,
): Charge | null {
  if (e.type !== "EXPENSE") return null;
  const start =
    monthNumber(e.date.slice(0, 7)) +
    (mode === "PAYMENT" && e.paymentMethod === "NEXT_MONTH" ? 1 : 0);
  const index = monthNumber(month) - start;
  return index >= 0 && index < e.installments
    ? {
        entry: e,
        amount: installment(e.amount, e.installments, index),
        installment: index + 1,
      }
    : null;
}
export function charges(
  entries: Entry[],
  month: string,
  mode: Accounting,
): Charge[] {
  return entries
    .map((e) => charge(e, month, mode))
    .filter((v): v is Charge => v !== null)
    .sort(
      (a, b) =>
        a.entry.date.localeCompare(b.entry.date) ||
        (a.entry.id ?? 0) - (b.entry.id ?? 0),
    );
}
export function totals(entries: Entry[], month: string, mode: Accounting) {
  const expense = safeSum(charges(entries, month, mode).map((c) => c.amount));
  const income = safeSum(
    entries
      .filter((e) => e.type === "INCOME" && e.date.startsWith(month))
      .map((e) => e.amount),
  );
  return { expense, income, balance: safeSum([income, -expense]) };
}
export function assets(entries: Entry[]): number {
  return safeSum(
    entries.map(
      (e) =>
        e.amount * (e.type === "INCOME" || e.type === "ADJUST_INCOME" ? 1 : -1),
    ),
  );
}
export function firstCharges(
  entries: Entry[],
  purchaseMonth: string,
): Charge[] {
  return charges(
    entries.filter(
      (e) =>
        e.paymentMethod === "NEXT_MONTH" && e.date.startsWith(purchaseMonth),
    ),
    addMonths(purchaseMonth, 1),
    "PAYMENT",
  );
}
export function dueMonths(
  r: Recurring,
  through: string,
  existing: Set<string>,
): string[] {
  if (!r.active) return [];
  const out: string[] = [];
  let cursor = addMonths(r.startDate.slice(0, 7), 1);
  if (cursor <= r.lastGeneratedMonth)
    cursor = addMonths(r.lastGeneratedMonth, 1);
  while (cursor <= through) {
    if (!existing.has(cursor)) out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}
export function priceFor(r: Recurring, month: string): number {
  return r.pendingAmount !== undefined &&
    r.effectiveMonth &&
    month >= r.effectiveMonth
    ? r.pendingAmount
    : r.amount;
}
export function csvRows(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  const finishCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    out.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      requireValue(
        !cell && !closed,
        "CSV\u306e\u5f15\u7528\u7b26\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
      );
      quoted = true;
    } else if (c === ",") finishCell();
    else if (c === "\n" || c === "\r") {
      finishRow();
      if (c === "\r" && input[i + 1] === "\n") i++;
    } else {
      requireValue(
        !closed,
        "CSV\u306e\u5f15\u7528\u7b26\u306e\u5f8c\u306b\u4e0d\u6b63\u306a\u6587\u5b57\u304c\u3042\u308a\u307e\u3059\u3002",
      );
      cell += c;
    }
  }
  requireValue(
    !quoted,
    "CSV\u306e\u5f15\u7528\u7b26\u304c\u9589\u3058\u3089\u308c\u3066\u3044\u307e\u305b\u3093\u3002",
  );
  if (cell || row.length || closed) finishRow();
  return out;
}
export interface CsvResult {
  transactions: Entry[];
  recurringPayments: Recurring[];
  stores: Store[];
  incomeSources: IncomeSource[];
  skipped: { row: number; reason: string }[];
  blankRows: number;
}
export function importCsv(
  text: string,
  now = new Date().toISOString(),
): CsvResult {
  const rows = csvRows(text);
  requireValue(
    rows[1]?.[0]?.trim() === "\u65e5\u4ed8" &&
      rows[1]?.[1]?.trim() === "\u5206\u985e",
    "\u5143\u30b7\u30fc\u30c8\u306e1\u884c\u76ee\uff08\u7dcf\u8cc7\u7523\uff09\u30682\u884c\u76ee\uff08\u898b\u51fa\u3057\uff09\u3092\u6b8b\u3057\u305fCSV\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
  );
  const transactions: Entry[] = [];
  const stores: Store[] = [];
  const incomeSources: IncomeSource[] = [];
  const skipped: CsvResult["skipped"] = [];
  let blankRows = 0;
  const typeMap = new Map(TYPES.map((t) => [TYPE_LABEL[t], t]));
  const paymentMap = new Map(
    PAYMENTS.map((p) => [
      p === "NOW"
        ? ""
        : p === "NEXT_MONTH"
          ? "\u6765\u6708"
          : p === "MONTHLY"
            ? "\u6bce\u6708"
            : "\u5b9a\u671f\u652f\u6255\u7d42\u4e86",
      p,
    ]),
  );
  rows.slice(2).forEach((row, index) => {
    const col = (i: number) => (row[i] ?? "").trim();
    if ([0, 1, 2, 3, 4, 5, 8, 9].every((i) => !col(i))) {
      blankRows++;
      return;
    }
    try {
      const m = col(0).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      requireValue(
        m,
        "\u65e5\u4ed8\u306e\u5f62\u5f0f\u306fyyyy/MM/dd\u3067\u3059\u3002",
      );
      const clean = col(2).replace(/[\u00a5\uffe5,]/g, "");
      requireValue(
        /^\d+$/.test(clean),
        "\u91d1\u984d\u306f\u5186\u5358\u4f4d\u306e\u6574\u6570\u3067\u3059\u3002",
      );
      const type = typeMap.get(col(1));
      const paymentMethod = type === "INCOME" ? "NOW" : paymentMap.get(col(8));
      requireValue(type, "\u5206\u985e\u304c\u4e0d\u660e\u3067\u3059\u3002");
      requireValue(
        paymentMethod,
        "\u652f\u6255\u65b9\u6cd5\u304c\u4e0d\u660e\u3067\u3059\u3002",
      );
      const name =
        type === "EXPENSE" || type === "ADJUST_EXPENSE" ? col(4) : "";
      const sourceName =
        type === "INCOME"
          ? col(4) && col(4) !== "\u305d\u306e\u4ed6"
            ? col(4)
            : col(3)
          : "";
      let source = incomeSources.find((s) => s.name === sourceName);
      if (sourceName && !source) {
        source = {
          id: incomeSources.length + 1,
          name: sourceName,
          sortOrder: incomeSources.length,
          hidden: false,
        };
        incomeSources.push(source);
      }
      let store = stores.find((s) => s.name === name);
      if (name && !store) {
        store = {
          id: stores.length + 1,
          name,
          sortOrder: stores.length,
          hidden: false,
        };
        stores.push(store);
      }
      const entry: Entry = {
        id: transactions.length + 1,
        date: `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
        type,
        amount: Number(clean),
        description:
          type === "INCOME" && (!col(4) || col(4) === "\u305d\u306e\u4ed6")
            ? ""
            : col(3),
        incomeSourceId: source?.id ?? null,
        storeId: name ? store!.id! : null,
        installments: type === "INCOME" ? 1 : col(5) ? Number(col(5)) : 1,
        paymentMethod,
        recurringId: type === "INCOME" ? null : col(9) || null,
        createdAt: now,
        updatedAt: now,
      };
      if (entry.type === "INCOME" || entry.type === "ADJUST_INCOME")
        requireValue(
          entry.date <= tokyoDate(new Date(now)),
          "\u672a\u6765\u65e5\u4ed8\u306e\u5165\u91d1\u306f\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3002",
        );
      validateEntry(entry);
      transactions.push(entry);
    } catch (error) {
      skipped.push({
        row: index + 3,
        reason:
          error instanceof Error
            ? error.message
            : "\u8aad\u307f\u53d6\u308c\u306a\u3044\u884c\u3067\u3059\u3002",
      });
    }
  });
  requireValue(
    transactions.length <= 100000,
    "\u8a18\u9332\u306f10\u4e07\u4ef6\u307e\u3067\u3067\u3059\u3002",
  );
  const groups = new Map<string, Entry[]>();
  for (const e of transactions) {
    if (
      e.recurringId &&
      (e.paymentMethod === "MONTHLY" || e.paymentMethod === "MONTHLY_ENDED")
    )
      groups.set(e.recurringId, [...(groups.get(e.recurringId) ?? []), e]);
  }
  const recurringPayments: Recurring[] = [...groups].map(([id, es]) => {
    es.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0),
    );
    const latest = es.at(-1)!;
    return {
      id,
      description: latest.description,
      amount: latest.amount,
      storeId: latest.storeId,
      startDate: es[0].date,
      active: latest.paymentMethod !== "MONTHLY_ENDED",
      lastGeneratedMonth: latest.date.slice(0, 7),
      type: latest.type,
    };
  });
  safeSum(transactions.map((e) => e.amount));
  assets(transactions);
  return {
    transactions,
    recurringPayments,
    stores,
    incomeSources,
    skipped,
    blankRows,
  };
}
export function exportCsv(
  entries: Entry[],
  stores: Store[],
  incomeSources: IncomeSource[] = [],
): string {
  const escape = (v: string) =>
    '"' +
    (/^[\s]*[=+\-@\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') +
    '"';
  return (
    "\uFEFFDate,Category,AmountYen,Description,Store,Installments,Payment,RecurringId,IncomeSource\r\n" +
    entries
      .map((e) =>
        [
          e.date,
          e.type,
          String(e.amount),
          e.description,
          stores.find((s) => s.id === e.storeId)?.name ?? "",
          String(e.installments),
          e.paymentMethod,
          e.recurringId ?? "",
          incomeSources.find((s) => s.id === e.incomeSourceId)?.name ?? "",
        ]
          .map(escape)
          .join(","),
      )
      .join("\r\n")
  );
}
function array(value: unknown): unknown[] {
  requireValue(
    Array.isArray(value) && value.length <= 100000,
    "\u4e00\u89a7\u30c7\u30fc\u30bf\u306e\u5f62\u5f0f\u307e\u305f\u306f\u4ef6\u6570\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  return value;
}
function object(value: unknown): Record<string, any> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306e\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  return value as Record<string, any>;
}
const iso = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
export function validateCore(raw: unknown): CoreBackup {
  let o = object(raw);
  if (o.schemaVersion === 2) {
    const sources = o.incomeSources ?? o.employers ?? [];
    const slips = (o.payslips ?? []).map((p: any) => {
      const { employerId, ...rest } = p;
      return { ...rest, incomeSourceId: p.incomeSourceId ?? employerId };
    });
    o = { ...o, incomeSources: sources, payslips: slips };
  }
  requireValue(
    o.format === "kakeibo-web" && [1, 2, 3].includes(o.schemaVersion),
    "\u5bfe\u5fdc\u3057\u3066\u3044\u306a\u3044\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u5f62\u5f0f\u3067\u3059\u3002",
  );
  requireValue(
    iso(o.exportedAt),
    "\u66f8\u304d\u51fa\u3057\u65e5\u6642\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  const stores = array(o.stores).map((v) => {
    const s = object(v);
    requireValue(
      Number.isSafeInteger(s.id) &&
        s.id > 0 &&
        typeof s.name === "string" &&
        s.name.trim() === s.name &&
        s.name.length > 0 &&
        s.name.length <= 200 &&
        Number.isSafeInteger(s.sortOrder) &&
        s.sortOrder >= 0 &&
        typeof s.hidden === "boolean",
      "\u8cfc\u5165\u5148\u30c7\u30fc\u30bf\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    return {
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      hidden: s.hidden,
    } as Store;
  });
  requireValue(
    new Set(stores.map((s) => s.id)).size === stores.length &&
      new Set(stores.map((s) => s.name)).size === stores.length,
    "\u8cfc\u5165\u5148\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  const ids = new Set(stores.map((s) => s.id));
  const transactions = array(o.transactions).map((v) => {
    const e = object(v);
    requireValue(
      Number.isSafeInteger(e.id) &&
        e.id > 0 &&
        iso(e.createdAt) &&
        iso(e.updatedAt),
      "\u8a18\u9332ID\u307e\u305f\u306f\u65e5\u6642\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    requireValue(
      e.storeId === null || ids.has(e.storeId),
      "\u5b58\u5728\u3057\u306a\u3044\u8cfc\u5165\u5148\u3092\u53c2\u7167\u3057\u3066\u3044\u307e\u3059\u3002",
    );
    requireValue(
      e.generatedKey === undefined ||
        (typeof e.generatedKey === "string" && e.generatedKey.length <= 300),
      "\u81ea\u52d5\u8ffd\u52a0ID\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    return validateEntry({
      id: e.id,
      date: e.date,
      type: e.type,
      amount: e.amount,
      description: e.description,
      storeId: e.storeId,
      incomeSourceId:
        e.incomeSourceId ??
        (o.payslips ?? []).find((p: any) => p.transactionId === e.id)
          ?.incomeSourceId ??
        null,
      installments: e.installments,
      paymentMethod: e.paymentMethod,
      recurringId: e.recurringId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      generatedKey: e.generatedKey,
      monthKey: typeof e.date === "string" ? e.date.slice(0, 7) : "",
    });
  });
  requireValue(
    new Set(transactions.map((e) => e.id)).size === transactions.length,
    "\u8a18\u9332ID\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  const keys = transactions.flatMap((e) =>
    e.generatedKey ? [e.generatedKey] : [],
  );
  requireValue(
    new Set(keys).size === keys.length,
    "\u81ea\u52d5\u8ffd\u52a0ID\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  const recurringPayments = array(o.recurringPayments).map((v) => {
    const r = object(v);
    requireValue(
      typeof r.id === "string" &&
        r.id.length > 0 &&
        r.id.length <= 200 &&
        typeof r.description === "string" &&
        r.description.length <= 10000 &&
        validDate(r.startDate) &&
        validMonth(r.lastGeneratedMonth) &&
        r.lastGeneratedMonth >= r.startDate.slice(0, 7) &&
        typeof r.active === "boolean" &&
        TYPES.includes(r.type),
      "\u5b9a\u671f\u652f\u6255\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    requireValue(
      r.storeId === null || ids.has(r.storeId),
      "\u5b9a\u671f\u652f\u6255\u306e\u8cfc\u5165\u5148\u304c\u3042\u308a\u307e\u305b\u3093\u3002",
    );
    amount(r.amount);
    if (r.pendingAmount !== undefined) {
      amount(r.pendingAmount);
      requireValue(
        validMonth(r.effectiveMonth),
        "\u91d1\u984d\u5909\u66f4\u306e\u9069\u7528\u6708\u304c\u4e0d\u6b63\u3067\u3059\u3002",
      );
    } else
      requireValue(
        r.effectiveMonth === undefined,
        "\u91d1\u984d\u5909\u66f4\u304c\u4e0d\u6b63\u3067\u3059\u3002",
      );
    return {
      id: r.id,
      description: r.description,
      amount: r.amount,
      storeId: r.storeId,
      startDate: r.startDate,
      active: r.active,
      lastGeneratedMonth: r.lastGeneratedMonth,
      type: r.type,
      ...(r.pendingAmount !== undefined
        ? { pendingAmount: r.pendingAmount, effectiveMonth: r.effectiveMonth }
        : {}),
    } as Recurring;
  });
  requireValue(
    new Set(recurringPayments.map((r) => r.id)).size ===
      recurringPayments.length,
    "\u5b9a\u671f\u652f\u6255ID\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  const recurringIds = new Set(recurringPayments.map((r) => r.id));
  requireValue(
    transactions
      .filter(
        (e) =>
          e.paymentMethod === "MONTHLY" || e.paymentMethod === "MONTHLY_ENDED",
      )
      .every((e) => recurringIds.has(e.recurringId!)),
    "\u6bce\u6708\u306e\u8a18\u9332\u306b\u5b9a\u671f\u652f\u6255\u306e\u8a2d\u5b9a\u304c\u3042\u308a\u307e\u305b\u3093\u3002",
  );
  const s = object(o.settings);
  requireValue(
    s.accounting === "PAYMENT" || s.accounting === "PURCHASE",
    "\u8a08\u4e0a\u57fa\u6e96\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  const settings: Settings = {
    ...defaults(),
    accounting: s.accounting,
    recordView: s.recordView === "INCOME" ? "INCOME" : "EXPENSE",
    recordFilters: validateRecordFilters(s.recordFilters),
    lastExportAt: s.lastExportAt,
    lastExportMethod:
      typeof s.lastExportMethod === "string" ? s.lastExportMethod : "",
    remindersEnabled: s.remindersEnabled,
    reminderDay: s.reminderDay,
    salaryTargets:
      o.schemaVersion >= 2 ? validateSalaryTargets(s.salaryTargets ?? []) : [],
  };
  requireValue(
    settings.lastExportAt === null || iso(settings.lastExportAt),
    "\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u65e5\u6642\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  requireValue(
    typeof settings.remindersEnabled === "boolean" &&
      Number.isInteger(settings.reminderDay) &&
      settings.reminderDay >= 0 &&
      settings.reminderDay <= 6,
    "\u6848\u5185\u8a2d\u5b9a\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  const incomeSources =
    o.schemaVersion >= 2 ? validateIncomeSources(o.incomeSources) : [];
  requireValue(
    transactions.every(
      (e) =>
        e.incomeSourceId === null ||
        incomeSources.some((s) => s.id === e.incomeSourceId),
    ),
    "Unknown income source",
  );
  const payslips =
    o.schemaVersion >= 2
      ? validatePayroll(o.payslips, incomeSources, transactions)
      : [];
  settings.reminderWeek = "";
  settings.reminderCount = 0;
  settings.retryDate = null;
  settings.persistence = "unknown";
  safeSum(transactions.map((e) => e.amount));
  assets(transactions);
  return {
    format: "kakeibo-web",
    schemaVersion: 3,
    payslips,
    incomeSources,
    exportedAt: o.exportedAt,
    appVersion: typeof o.appVersion === "string" ? o.appVersion : "unknown",
    transactions,
    recurringPayments,
    stores,
    settings,
  };
}
export function parseBackup(text: string): Backup {
  requireValue(
    new TextEncoder().encode(text).byteLength <= 64 * 1024 * 1024,
    "\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f64 MiB\u307e\u3067\u3067\u3059\u3002",
  );
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    fail("JSON\u3092\u8aad\u307f\u53d6\u308c\u307e\u305b\u3093\u3002");
  }
  const o = object(raw);
  const core = validateCore(o);
  const snapshots =
    o.snapshots === undefined
      ? []
      : array(o.snapshots).map((v) => {
          const s = object(v);
          requireValue(
            iso(s.createdAt) &&
              validDate(s.weekKey) &&
              weekKey(s.weekKey) === s.weekKey &&
              [
                "WEEKLY",
                "BEFORE_IMPORT",
                "BEFORE_MIGRATION",
                "MANUAL",
              ].includes(s.reason),
            "\u9000\u907f\u30c7\u30fc\u30bf\u304c\u4e0d\u6b63\u3067\u3059\u3002",
          );
          return {
            createdAt: s.createdAt,
            weekKey: s.weekKey,
            reason: s.reason,
            weeklyKey: s.reason === "WEEKLY" ? s.weekKey : undefined,
            data: validateCore(s.data),
          } as Snapshot;
        });
  const weekly = snapshots
    .filter((s) => s.reason === "WEEKLY")
    .map((s) => s.weekKey);
  requireValue(
    new Set(weekly).size === weekly.length,
    "\u540c\u3058\u9031\u306e\u9000\u907f\u30c7\u30fc\u30bf\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  return { ...core, snapshots };
}

export type IncomeSource = Store;
export interface SalaryTarget {
  id: string;
  name: string;
  amount: number;
}
export interface Payslip {
  id?: number;
  transactionId: number | null;
  incomeSourceId: number;
  payDate: string;
  workPeriod: string;
  basePay: number;
  overtimePay: number;
  otherTaxablePay: number;
  commuteAllowance: number;
  otherNonTaxablePay: number;
  healthInsurance: number;
  pensionInsurance: number;
  employmentInsurance: number;
  incomeTax: number;
  residentTax: number;
  otherDeductions: number;
  memo: string;
  createdAt: string;
  updatedAt: string;
}
export const PAY_FIELDS = [
  "basePay",
  "overtimePay",
  "otherTaxablePay",
  "commuteAllowance",
  "otherNonTaxablePay",
  "healthInsurance",
  "pensionInsurance",
  "employmentInsurance",
  "incomeTax",
  "residentTax",
  "otherDeductions",
] as const;
export type PayField = (typeof PAY_FIELDS)[number];
export const PAY_LABEL: Record<PayField, string> = {
  basePay: "\u57fa\u672c\u7d66",
  overtimePay: "\u6b8b\u696d\u30fb\u6df1\u591c\u30fb\u4f11\u65e5\u624b\u5f53",
  otherTaxablePay: "\u305d\u306e\u4ed6\u306e\u8ab2\u7a0e\u652f\u7d66",
  commuteAllowance:
    "\u901a\u52e4\u624b\u5f53\uff08\u975e\u8ab2\u7a0e\u5206\uff09",
  otherNonTaxablePay: "\u305d\u306e\u4ed6\u306e\u975e\u8ab2\u7a0e\u652f\u7d66",
  healthInsurance: "\u5065\u5eb7\u4fdd\u967a\u6599",
  pensionInsurance: "\u539a\u751f\u5e74\u91d1\u4fdd\u967a\u6599",
  employmentInsurance: "\u96c7\u7528\u4fdd\u967a\u6599",
  incomeTax:
    "\u6240\u5f97\u7a0e\uff08\u6e90\u6cc9\u5fb4\u53ce\u7a0e\u984d\uff09",
  residentTax: "\u4f4f\u6c11\u7a0e",
  otherDeductions: "\u305d\u306e\u4ed6\u306e\u63a7\u9664",
};
export function emptyPayslip(date = tokyoDate()): Payslip {
  return {
    transactionId: null,
    incomeSourceId: 0,
    payDate: date,
    workPeriod: addMonths(date.slice(0, 7), -1),
    basePay: 0,
    overtimePay: 0,
    otherTaxablePay: 0,
    commuteAllowance: 0,
    otherNonTaxablePay: 0,
    healthInsurance: 0,
    pensionInsurance: 0,
    employmentInsurance: 0,
    incomeTax: 0,
    residentTax: 0,
    otherDeductions: 0,
    memo: "",
    createdAt: "",
    updatedAt: "",
  };
}
export function payslipTotals(p: Payslip) {
  const taxable = safeSum([p.basePay, p.overtimePay, p.otherTaxablePay]);
  const nonTaxable = safeSum([p.commuteAllowance, p.otherNonTaxablePay]);
  const gross = safeSum([taxable, nonTaxable]);
  const social = safeSum([
    p.healthInsurance,
    p.pensionInsurance,
    p.employmentInsurance,
  ]);
  const deductions = safeSum([
    social,
    p.incomeTax,
    p.residentTax,
    p.otherDeductions,
  ]);
  return {
    taxable,
    nonTaxable,
    gross,
    social,
    deductions,
    net: safeSum([gross, -deductions]),
  };
}
export function validatePayslip(input: Payslip): Payslip {
  requireValue(
    input.id === undefined || (Number.isSafeInteger(input.id) && input.id > 0),
    "\u660e\u7d30ID\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  requireValue(
    input.transactionId === null ||
      (Number.isSafeInteger(input.transactionId) && input.transactionId > 0),
    "\u5165\u91d1\u306e\u53c2\u7167\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  requireValue(
    Number.isSafeInteger(input.incomeSourceId) && input.incomeSourceId > 0,
    "\u5165\u91d1\u5143\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002",
  );
  requireValue(
    typeof input.payDate === "string" && validDate(input.payDate),
    "\u652f\u7d66\u65e5\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  requireValue(
    typeof input.workPeriod === "string" && input.workPeriod.length <= 200,
    "\u5bfe\u8c61\u671f\u9593\u306f200\u6587\u5b57\u4ee5\u5185\u3067\u3059\u3002",
  );
  requireValue(
    typeof input.memo === "string" && input.memo.length <= 10000,
    "\u30e1\u30e2\u306f1\u4e07\u6587\u5b57\u4ee5\u5185\u3067\u3059\u3002",
  );
  requireValue(
    iso(input.createdAt) && iso(input.updatedAt),
    "\u660e\u7d30\u306e\u4fdd\u5b58\u65e5\u6642\u304c\u4e0d\u6b63\u3067\u3059\u3002",
  );
  const out: Payslip = {
    id: input.id,
    transactionId: input.transactionId,
    incomeSourceId: input.incomeSourceId,
    payDate: input.payDate,
    workPeriod: input.workPeriod.trim(),
    memo: input.memo,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...Object.fromEntries(PAY_FIELDS.map((key) => [key, amount(input[key])])),
  } as Payslip;
  payslipTotals(out);
  return out;
}
export function validateIncomeSources(raw: unknown): IncomeSource[] {
  const incomeSources = array(raw).map((v) => {
    const o = object(v);
    requireValue(
      Number.isSafeInteger(o.id) &&
        o.id > 0 &&
        typeof o.name === "string" &&
        o.name.trim() === o.name &&
        o.name.length > 0 &&
        o.name.length <= 200 &&
        Number.isSafeInteger(o.sortOrder) &&
        o.sortOrder >= 0 &&
        typeof o.hidden === "boolean",
      "\u5165\u91d1\u5143\u30c7\u30fc\u30bf\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    return {
      id: o.id,
      name: o.name,
      sortOrder: o.sortOrder,
      hidden: o.hidden,
    } as IncomeSource;
  });
  requireValue(
    new Set(incomeSources.map((e) => e.id)).size === incomeSources.length &&
      new Set(incomeSources.map((e) => e.name)).size === incomeSources.length,
    "\u5165\u91d1\u5143\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  return incomeSources;
}
export function validatePayroll(
  raw: unknown,
  incomeSources: IncomeSource[],
  transactions: Entry[],
): Payslip[] {
  const es = new Set(incomeSources.map((e) => e.id));
  const entries = new Map(transactions.map((e) => [e.id, e]));
  const slips = array(raw).map((v) => {
    const p = validatePayslip(object(v) as unknown as Payslip);
    requireValue(
      p.id !== undefined,
      "\u660e\u7d30ID\u304c\u3042\u308a\u307e\u305b\u3093\u3002",
    );
    requireValue(
      es.has(p.incomeSourceId),
      "\u660e\u7d30\u306e\u5165\u91d1\u5143\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002",
    );
    requireValue(
      p.transactionId === null ||
        entries.get(p.transactionId)?.type === "INCOME",
      "\u660e\u7d30\u306f\u5b58\u5728\u3059\u308b\u5165\u91d1\u306b\u3060\u3051\u7d10\u3065\u3051\u3089\u308c\u307e\u3059\u3002",
    );
    return p;
  });
  requireValue(
    new Set(slips.map((p) => p.id)).size === slips.length,
    "\u660e\u7d30ID\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  const linked = slips.flatMap((p) =>
    p.transactionId === null ? [] : [p.transactionId],
  );
  requireValue(
    new Set(linked).size === linked.length,
    "\u540c\u3058\u5165\u91d1\u306b\u8907\u6570\u306e\u7d66\u4e0e\u660e\u7d30\u304c\u3042\u308a\u307e\u3059\u3002",
  );
  safeSum(slips.flatMap((p) => PAY_FIELDS.map((key) => p[key])));
  return slips;
}
export function validateSalaryTargets(raw: unknown): SalaryTarget[] {
  const targets = array(raw);
  requireValue(
    targets.length <= 50,
    "\u7d66\u4e0e\u306e\u76ee\u5b89\u984d\u306f50\u4ef6\u307e\u3067\u3067\u3059\u3002",
  );
  const out = targets.map((v) => {
    const o = object(v);
    requireValue(
      typeof o.id === "string" &&
        o.id.length > 0 &&
        o.id.length <= 200 &&
        typeof o.name === "string" &&
        o.name.trim().length > 0 &&
        o.name.length <= 200,
      "\u76ee\u5b89\u984d\u306e\u540d\u524d\u304c\u4e0d\u6b63\u3067\u3059\u3002",
    );
    return { id: o.id, name: o.name.trim(), amount: amount(o.amount) };
  });
  requireValue(
    new Set(out.map((t) => t.id)).size === out.length,
    "\u76ee\u5b89\u984dID\u304c\u91cd\u8907\u3057\u3066\u3044\u307e\u3059\u3002",
  );
  return out;
}
export function annualSalary(
  payslips: Payslip[],
  incomeSources: IncomeSource[],
  year: number,
) {
  const slips = payslips
    .filter((p) => p.payDate.startsWith(String(year) + "-"))
    .sort(
      (a, b) => b.payDate.localeCompare(a.payDate) || (b.id ?? 0) - (a.id ?? 0),
    );
  const sum = (items: Payslip[]) => {
    const values = items.map(payslipTotals);
    return {
      taxable: safeSum(values.map((v) => v.taxable)),
      nonTaxable: safeSum(values.map((v) => v.nonTaxable)),
      gross: safeSum(values.map((v) => v.gross)),
      social: safeSum(values.map((v) => v.social)),
      incomeTax: safeSum(items.map((p) => p.incomeTax)),
      residentTax: safeSum(items.map((p) => p.residentTax)),
      net: safeSum(values.map((v) => v.net)),
    };
  };
  return {
    slips,
    ...sum(slips),
    incomeSources: incomeSources
      .filter((e) => slips.some((p) => p.incomeSourceId === e.id))
      .map((e) => ({
        ...e,
        ...sum(slips.filter((p) => p.incomeSourceId === e.id)),
      })),
    months: Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      const items = slips.filter((p) => p.payDate.startsWith(month));
      return { month, slips: items, ...sum(items) };
    }),
  };
}
export function missingSalaryEntries(
  entries: Entry[],
  payslips: Payslip[],
  incomeSources: IncomeSource[],
  year: number,
): Entry[] {
  const linked = new Set(payslips.map((p) => p.transactionId));
  const sources = new Set(
    payslips
      .filter((p) => p.transactionId !== null)
      .map((p) => p.incomeSourceId),
  );
  return entries.filter(
    (e) =>
      e.type === "INCOME" &&
      e.date.startsWith(year + "-") &&
      !linked.has(e.id!) &&
      sources.has(e.incomeSourceId!),
  );
}
export function salaryCsv(
  payslips: Payslip[],
  incomeSources: IncomeSource[],
  year: number,
): string {
  const result = annualSalary(payslips, incomeSources, year);
  const rows: (string | number)[][] = [
    [
      "Section",
      "Year",
      "IncomeSourceOrMonth",
      "TaxablePayYen",
      "IncomeTaxYen",
      "NetPayYen",
      "GrossPayYen",
      "NonTaxablePayYen",
      "SocialInsuranceYen",
      "ResidentTaxYen",
    ],
    [
      "Annual",
      year,
      "All",
      result.taxable,
      result.incomeTax,
      result.net,
      result.gross,
      result.nonTaxable,
      result.social,
      result.residentTax,
    ],
    ...result.incomeSources.map((e) => [
      "IncomeSource",
      year,
      e.name,
      e.taxable,
      e.incomeTax,
      e.net,
      e.gross,
      e.nonTaxable,
      e.social,
      e.residentTax,
    ]),
    ...result.months.map((m) => [
      "Month",
      year,
      m.month,
      m.taxable,
      m.incomeTax,
      m.net,
      m.gross,
      m.nonTaxable,
      m.social,
      m.residentTax,
    ]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const s = String(value);
            return (
              '"' +
              (/^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll(
                '"',
                '""',
              ) +
              '"'
            );
          })
          .join(","),
      )
      .join("\r\n")
  );
}
export function normalizeEntry(e: Entry): Entry {
  return {
    ...e,
    incomeSourceId: e.type === "INCOME" ? (e.incomeSourceId ?? null) : null,
    storeId: e.type === "EXPENSE" ? e.storeId : null,
    installments: e.type === "EXPENSE" ? e.installments : 1,
    paymentMethod: e.type === "EXPENSE" ? e.paymentMethod : "NOW",
    recurringId: e.type === "EXPENSE" ? e.recurringId : null,
  };
}
export function mergeIncomeSources(b: Backup): Backup {
  const sources: IncomeSource[] = [];
  const ids = new Map<number, number>();
  for (const s of b.incomeSources ?? []) {
    const name = s.name.trim();
    requireValue(name, "Income source name required");
    let found = sources.find((x) => x.name === name);
    if (!found) {
      found = { ...s, name };
      sources.push(found);
    }
    ids.set(s.id!, found.id!);
  }
  return {
    ...b,
    incomeSources: sources,
    transactions: b.transactions.map((e) => ({
      ...e,
      incomeSourceId: e.incomeSourceId
        ? (ids.get(e.incomeSourceId) ?? null)
        : null,
    })),
    payslips: b.payslips?.map((p) => ({
      ...p,
      incomeSourceId: ids.get(p.incomeSourceId) ?? p.incomeSourceId,
    })),
  };
}

function validateRecordFilters(
  raw: unknown,
): Record<string, RecordFilter> | undefined {
  if (raw === undefined) return undefined;
  const o = object(raw);
  const out: Record<string, RecordFilter> = {};
  for (const key of ["EXPENSE", "INCOME"]) {
    if (!o[key]) continue;
    const f = object(o[key]);
    requireValue(
      ["parties", "payments", "payroll"].every(
        (k) =>
          Array.isArray(f[k]) &&
          f[k].length <= 100000 &&
          f[k].every((v: unknown) => typeof v === "string"),
      ) &&
        typeof f.installments === "boolean" &&
        typeof f.adjustments === "boolean" &&
        (!f.from || validDate(f.from)) &&
        (!f.to || validDate(f.to)),
      "Invalid record filters",
    );
    out[key] = {
      parties: f.parties,
      payments: f.payments,
      payroll: f.payroll,
      installments: f.installments,
      adjustments: f.adjustments,
      from: f.from,
      to: f.to,
    };
  }
  return out;
}
export function assetPosition(entries: Entry[], date = tokyoDate()) {
  requireValue(validDate(date), "Invalid date");
  const eligible = entries.filter((e) => e.date <= date);
  const month = date.slice(0, 7);
  const pending: { month: string; entry: Entry; amount: number }[] = [];
  let paid = 0;
  for (const e of eligible.filter((e) => e.type === "EXPENSE")) {
    const start = addMonths(
      e.date.slice(0, 7),
      e.paymentMethod === "NEXT_MONTH" ? 1 : 0,
    );
    for (let i = 0; i < e.installments; i++) {
      const m = addMonths(start, i);
      const value = installment(e.amount, e.installments, i);
      if (m <= month) paid = safeSum([paid, value]);
      else pending.push({ month: m, entry: e, amount: value });
    }
  }
  pending.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.entry.date.localeCompare(b.entry.date),
  );
  const current = safeSum([
    safeSum(
      eligible
        .filter((e) => e.type === "INCOME" || e.type === "ADJUST_INCOME")
        .map((e) => e.amount),
    ),
    -safeSum(
      eligible.filter((e) => e.type === "ADJUST_EXPENSE").map((e) => e.amount),
    ),
    -paid,
  ]);
  const full = assets(entries);
  const scheduled = safeSum(pending.map((p) => p.amount));
  const futureImpact = safeSum([full, -assets(eligible)]);
  return { current, full, scheduled, futureImpact, pending };
}
