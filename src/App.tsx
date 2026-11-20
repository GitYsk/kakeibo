import { RecordList } from "./RecordList.tsx";
import { Modal } from "./Modal.tsx";
import {
  PayslipFields,
  StandalonePayslipEditor,
  PayrollYear,
  PayrollSettings,
  RecoveryScreen,
  slipDraft,
  readSlipDraft,
  type SlipDraft,
} from "./PayrollUI.tsx";
import { recoveryBackup } from "./migration.ts";
import "./style.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { liveQuery } from "dexie";
import { db } from "./db.ts";
import {
  assets,
  assetPosition,
  totals,
  charges,
  firstCharges,
  addMonths,
  tokyoDate,
  weekKey,
  weekComplete,
  importCsv,
  exportCsv,
  parseBackup,
  TYPE_LABEL,
  PAYMENT_LABEL,
  TYPES,
  PAYMENTS,
  defaults,
  priceFor,
  type Accounting,
  type Backup,
  type Charge,
  type Entry,
  type Recurring,
  type Snapshot,
  type State,
  type Store,
  type Payslip,
  type IncomeSource,
  payslipTotals,
  validDate,
  mergeIncomeSources,
} from "./core.ts";
import { beginSave, prepareBackup, type Prepared } from "./backup.ts";
import { registerUpdates, type UpdateAPI } from "./updates.ts";
const VERSION = __APP_VERSION__;
const yen = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
const stamp = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso))
    : "\u307e\u3060\u4fdd\u5b58\u3057\u3066\u3044\u307e\u305b\u3093";
const storeName = (stores: Store[], id: number | null) =>
  stores.find((s) => s.id === id)?.name ?? "\u672a\u8a2d\u5b9a";
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "\u51e6\u7406\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";
const confirmedTime = (p: Prepared) =>
  weekKey(tokyoDate(new Date(p.backup.exportedAt))) === weekKey(tokyoDate())
    ? new Date().toISOString()
    : p.backup.exportedAt;
function backupPeriod(backup: Backup) {
  const dates = [
    ...backup.transactions.map((e) => e.date),
    ...(backup.payslips ?? []).map((p) => p.payDate),
  ].sort();
  return dates.length
    ? dates[0] + " \uff5e " + dates.at(-1)
    : "\u8a18\u9332\u306a\u3057";
}
const empty: State = {
  payslips: [],
  incomeSources: [],
  entries: [],
  recurring: [],
  stores: [],
  snapshots: [],
  settings: defaults(),
};
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 11l9-8 9 8M5 10v11h14V10M9 21v-7h6v7",
    records: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
    month: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16",
    year: "M4 21V11h4v10M10 21V4h4v17M16 21v-7h4v7",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
    plus: "M12 5v14M5 12h14",
    close: "M5 5l14 14M5 19L19 5",
    download: "M12 3v12M7 10l5 5 5-5M4 17v4h16v-4",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.records} />
    </svg>
  );
}
function Summary({ value }: { value: ReturnType<typeof totals> }) {
  return (
    <section className="summary" aria-label={"\u53ce\u652f\u306e\u96c6\u8a08"}>
      <div>
        <span>{"\u51fa\u8cbb"}</span>
        <strong className="expense">{yen(value.expense)}</strong>
      </div>
      <div>
        <span>{"\u53ce\u5165"}</span>
        <strong className="income">{yen(value.income)}</strong>
      </div>
      <div className="balance-row">
        <span>{"\u53ce\u652f"}</span>
        <strong className={value.balance < 0 ? "expense" : "income"}>
          {yen(value.balance)}
        </strong>
      </div>
    </section>
  );
}
function Basis({
  mode,
  onChange,
}: {
  mode: Accounting;
  onChange: (v: Accounting) => void;
}) {
  return (
    <div className="segmented" aria-label={"\u8a08\u4e0a\u57fa\u6e96"}>
      {(["PAYMENT", "PURCHASE"] as const).map((value) => (
        <button
          key={value}
          className={mode === value ? "selected" : ""}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
        >
          {value === "PAYMENT"
            ? "\u652f\u6255\u6708\u57fa\u6e96"
            : "\u8cfc\u5165\u65e5\u57fa\u6e96"}
        </button>
      ))}
    </div>
  );
}
function EntryCard({
  entry,
  stores,
  incomeSources = [],
  allocated,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  stores: Store[];
  incomeSources?: IncomeSource[];
  allocated?: Charge;
  onEdit?: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
}) {
  return (
    <article className="entry">
      <button
        className="entry-body"
        disabled={!onEdit}
        onClick={() => onEdit?.(entry)}
      >
        <div className="entry-title">
          <strong>{entry.description || TYPE_LABEL[entry.type]}</strong>
          <strong
            className={
              entry.type === "INCOME" || entry.type === "ADJUST_INCOME"
                ? "income"
                : "expense"
            }
          >
            {yen(allocated?.amount ?? entry.amount)}
          </strong>
        </div>
        <div className="muted">
          {entry.date +
            " \u00b7 " +
            (entry.type === "INCOME"
              ? (incomeSources.find((s) => s.id === entry.incomeSourceId)
                  ?.name ?? "\u672a\u8a2d\u5b9a")
              : storeName(stores, entry.storeId))}
        </div>
        <div className="tags">
          <span>{TYPE_LABEL[entry.type]}</span>
          {entry.type === "EXPENSE" && (
            <span>{PAYMENT_LABEL[entry.paymentMethod]}</span>
          )}
          {entry.installments > 1 && (
            <span>
              {allocated
                ? `${entry.installments}\u56de\u4e2d${allocated.installment}\u56de\u76ee`
                : `\u7dcf\u984d\u30fb${entry.installments}\u56de\u6255\u3044`}
            </span>
          )}
        </div>
      </button>
      {onDelete && (
        <button
          className="delete-small"
          aria-label={`${entry.description || TYPE_LABEL[entry.type]}\u3092\u524a\u9664`}
          onClick={() => onDelete(entry)}
        >
          {"\u524a\u9664"}
        </button>
      )}
    </article>
  );
}
interface Draft {
  id?: number;
  date: string;
  type: Entry["type"];
  amount: string;
  description: string;
  storeId: string;
  incomeSourceId: string;
  installments: string;
  paymentMethod: Entry["paymentMethod"];
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
  generatedKey?: string;
}
function Editor({
  original,
  initialType = "EXPENSE",
  stores,
  incomeSources,
  originalPayslip,
  onClose,
  onSave,
  onError,
}: {
  original: Entry | null;
  initialType?: Entry["type"];
  stores: Store[];
  incomeSources: IncomeSource[];
  originalPayslip?: Payslip;
  onClose: () => void;
  onSave: (e: Entry, payroll?: Payslip | null) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    original
      ? {
          ...original,
          incomeSourceId: String(original.incomeSourceId ?? ""),
          amount: String(original.amount),
          installments: String(original.installments),
          storeId: original.storeId === null ? "" : String(original.storeId),
        }
      : {
          date: tokyoDate(),
          type: initialType,
          amount: "",
          description: "",
          storeId: "",
          incomeSourceId: "",
          installments: "1",
          paymentMethod: "NOW",
          recurringId: null,
          createdAt: "",
          updatedAt: "",
        },
  );
  const [payrollEnabled, setPayrollEnabled] = useState(!!originalPayslip);
  const [payrollDraft, setPayrollDraft] = useState<SlipDraft>(() =>
    slipDraft(originalPayslip ?? undefined),
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (field: keyof Draft, value: string) => {
    if (
      field === "date" &&
      !originalPayslip &&
      payrollDraft.payDate === draft.date &&
      validDate(value)
    )
      setPayrollDraft((p) => ({
        ...p,
        payDate: value,
        workPeriod: !p.periodTouched
          ? addMonths(value.slice(0, 7), -1)
          : p.workPeriod,
      }));
    setDraft((d) => ({ ...d, [field]: value }));
  };
  const monthly =
    draft.paymentMethod === "MONTHLY" ||
    draft.paymentMethod === "MONTHLY_ENDED";
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (
        !/^\d+$/.test(draft.amount) ||
        (draft.type === "EXPENSE" && !/^\d+$/.test(draft.installments))
      )
        throw new Error(
          "\u91d1\u984d\u3068\u5206\u5272\u56de\u6570\u306f\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
        );
      if (
        original &&
        original.type !== draft.type &&
        (original.storeId ||
          original.incomeSourceId ||
          originalPayslip ||
          original.installments > 1 ||
          original.recurringId ||
          original.paymentMethod !== "NOW")
      ) {
        if (
          !confirm(
            "\u5206\u985e\u3092\u5909\u66f4\u3059\u308b\u3068\u3001\u4f7f\u308f\u306a\u3044\u9805\u76ee\u306f\u4fdd\u5b58\u6642\u306b\u6d88\u53bb\u3055\u308c\u307e\u3059\u3002\u5b9a\u671f\u652f\u6255\u306e\u884c\u306f\u5b9a\u671f\u652f\u6255\u304b\u3089\u5916\u308c\u307e\u3059\u3002\u7d9a\u3051\u307e\u3059\u304b\uff1f",
          )
        )
          return;
        if (originalPayslip && draft.type !== "INCOME") {
          const choice = prompt(
            "\u7d66\u4e0e\u660e\u7d30\u3092\u3069\u3046\u3057\u307e\u3059\u304b\uff1f 1: \u660e\u7d30\u3060\u3051\u6b8b\u3059 / 2: \u660e\u7d30\u3082\u524a\u9664",
            "1",
          );
          if (choice !== "1" && choice !== "2") return;
          await db.saveEntry(
            {
              ...draft,
              amount: Number(draft.amount),
              installments: Number(draft.installments),
              storeId: draft.storeId ? Number(draft.storeId) : null,
              incomeSourceId: draft.incomeSourceId
                ? Number(draft.incomeSourceId)
                : null,
            },
            undefined,
            undefined,
            null,
            choice === "1" ? "KEEP" : "DELETE",
          );
          onClose();
          return;
        }
      }
      await onSave(
        {
          ...draft,
          amount: Number(draft.amount),
          installments: Number(draft.installments),
          storeId: draft.storeId ? Number(draft.storeId) : null,
          incomeSourceId: draft.incomeSourceId
            ? Number(draft.incomeSourceId)
            : null,
        },
        draft.type === "INCOME" && payrollEnabled
          ? readSlipDraft({
              ...payrollDraft,
              incomeSourceId: draft.incomeSourceId,
            })
          : originalPayslip
            ? null
            : undefined,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        original
          ? "\u8a18\u9332\u3092\u7de8\u96c6"
          : "\u8a18\u9332\u3092\u8ffd\u52a0"
      }
      onClose={onClose}
      actions={
        <>
          <button className="secondary" disabled={busy} onClick={onClose}>
            {"\u30ad\u30e3\u30f3\u30bb\u30eb"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy
              ? "\u4fdd\u5b58\u4e2d\u2026"
              : "\u8a18\u9332\u3092\u4fdd\u5b58"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {"\u5206\u985e"}
          <select
            value={draft.type}
            onChange={(e) => update("type", e.target.value)}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {"\u65e5\u4ed8"}
          <input
            type="date"
            required
            min="1900-01-01"
            max={
              draft.type === "INCOME" || draft.type === "ADJUST_INCOME"
                ? tokyoDate()
                : "2200-12-31"
            }
            value={draft.date}
            onChange={(e) => update("date", e.target.value)}
          />
        </label>
        <label>
          {"\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09"}
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft.amount}
            onChange={(e) => update("amount", e.target.value)}
            placeholder="0"
            required
          />
        </label>
        {draft.type === "INCOME" && (
          <>
            <label>
              {"\u5165\u91d1\u5143"}
              <select
                value={draft.incomeSourceId}
                onChange={(e) => {
                  if (e.target.value === "add") {
                    const name = prompt("\u65b0\u3057\u3044\u5165\u91d1\u5143");
                    if (name)
                      void db
                        .addIncomeSource(name)
                        .then((id) => update("incomeSourceId", String(id)))
                        .catch((e) => onError(errorText(e)));
                  } else update("incomeSourceId", e.target.value);
                }}
              >
                <option value="">{"\u672a\u8a2d\u5b9a"}</option>
                {incomeSources
                  .filter(
                    (s) => !s.hidden || String(s.id) === draft.incomeSourceId,
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                <option value="add">
                  {
                    "\uff0b \u65b0\u3057\u3044\u5165\u91d1\u5143\u3092\u8ffd\u52a0"
                  }
                </option>
              </select>
            </label>
          </>
        )}{" "}
        <label>
          {"\u5185\u5bb9"}
          <textarea
            rows={2}
            maxLength={10000}
            value={draft.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder={"\u4f55\u306b\u4f7f\u3044\u307e\u3057\u305f\u304b"}
          />
        </label>
        {draft.type === "EXPENSE" && (
          <>
            {" "}
            <label>
              {"\u8cfc\u5165\u5148"}
              <select
                value={draft.storeId}
                onChange={(e) => {
                  if (e.target.value === "add") {
                    setAdding(true);
                  } else update("storeId", e.target.value);
                }}
              >
                <option value="">{"\u672a\u8a2d\u5b9a"}</option>
                {stores
                  .filter((s) => !s.hidden || String(s.id) === draft.storeId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                <option value="add">
                  {
                    "\uff0b \u65b0\u3057\u3044\u8cfc\u5165\u5148\u3092\u8ffd\u52a0"
                  }
                </option>
              </select>
            </label>
            {adding && (
              <div className="inline-add">
                <label>
                  {"\u65b0\u3057\u3044\u8cfc\u5165\u5148"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    void db
                      .addStore(name)
                      .then((id) => {
                        update("storeId", String(id));
                        setAdding(false);
                        setName("");
                      })
                      .catch((e) => onError(errorText(e)))
                  }
                >
                  {"\u8ffd\u52a0\u3057\u3066\u9078\u629e"}
                </button>
              </div>
            )}
            <label>
              {"\u5206\u5272\u56de\u6570"}
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={monthly}
                value={draft.installments}
                onChange={(e) => update("installments", e.target.value)}
              />
            </label>
            <label>
              {"\u652f\u6255\u65b9\u6cd5"}
              <select
                value={draft.paymentMethod}
                onChange={(e) => {
                  update("paymentMethod", e.target.value);
                  if (e.target.value === "MONTHLY") update("installments", "1");
                }}
              >
                {PAYMENTS.filter(
                  (p) =>
                    p !== "MONTHLY_ENDED" ||
                    draft.paymentMethod === "MONTHLY_ENDED",
                ).map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            {monthly && (
              <p className="note">
                {
                  "\u7fcc\u6708\u4ee5\u964d\u306f\u6bce\u67081\u65e5\u306b\u8a08\u4e0a\u3057\u307e\u3059\u3002\u904e\u53bb\u306e\u65e5\u4ed8\u3067\u767b\u9332\u3059\u308b\u3068\u4eca\u6708\u307e\u3067\u306e\u4e0d\u8db3\u5206\u3082\u8ffd\u52a0\u3057\u307e\u3059\u3002\u500b\u5225\u306e\u8a18\u9332\u306e\u7de8\u96c6\u306f\u5b9a\u671f\u652f\u6255\u306e\u8a2d\u5b9a\u3092\u5909\u66f4\u3057\u307e\u305b\u3093\u3002"
                }
              </p>
            )}
          </>
        )}
        {draft.type !== "EXPENSE" && (
          <p className="note">
            {
              "\u5165\u91d1\u306f\u65e5\u4ed8\u306e\u6708\u306b\u8a08\u4e0a\u3057\u307e\u3059\u3002\u8abf\u6574\u7528\u306e\u5165\u51fa\u91d1\u306f\u7dcf\u8cc7\u7523\u3060\u3051\u306b\u53cd\u6620\u3057\u307e\u3059\u3002"
            }
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {draft.type === "INCOME" && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={payrollEnabled}
                onChange={(e) => {
                  if (
                    !e.target.checked &&
                    originalPayslip &&
                    !confirm(
                      "\u4fdd\u5b58\u6642\u306b\u3053\u306e\u7d66\u4e0e\u660e\u7d30\u3092\u524a\u9664\u3057\u307e\u3059\u3002\u5165\u91d1\u8a18\u9332\u306f\u6b8b\u308a\u307e\u3059\u3002\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f",
                    )
                  )
                    return;
                  setPayrollEnabled(e.target.checked);
                  if (
                    e.target.checked &&
                    !originalPayslip &&
                    validDate(draft.date)
                  )
                    setPayrollDraft((p) => ({
                      ...p,
                      payDate: draft.date,
                      workPeriod: addMonths(draft.date.slice(0, 7), -1),
                    }));
                }}
              />
              {"\u7d66\u4e0e\u660e\u7d30\u3092\u5165\u529b\u3059\u308b"}
            </label>
            {payrollEnabled && (
              <PayslipFields
                draft={payrollDraft}
                onChange={setPayrollDraft}
                incomeSources={incomeSources}
                hideSource
                incomeAmount={
                  /^\d+$/.test(draft.amount) ? Number(draft.amount) : null
                }
                onMatch={(n) => update("amount", String(n))}
              />
            )}
          </>
        )}
      </form>
    </Modal>
  );
}
function Records({
  state,
  onEdit,
  onDelete,
  onPayslip,
}: {
  state: State;
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onPayslip: (p: Payslip) => void;
}) {
  return (
    <RecordList
      state={state}
      onPayslip={onPayslip}
      renderEntry={(entry) => (
        <EntryCard
          entry={entry}
          stores={state.stores}
          incomeSources={state.incomeSources}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    />
  );
}
function Month({
  state,
  month,
  setMonth,
  onMode,
  onEdit,
}: {
  state: State;
  month: string;
  setMonth: (m: string) => void;
  onMode: (m: Accounting) => void;
  onEdit: (e: Entry) => void;
}) {
  const [tab, setTab] = useState(0);
  const all = charges(state.entries, month, state.settings.accounting);
  const out = firstCharges(state.entries, month);
  const incoming = firstCharges(state.entries, addMonths(month, -1));
  const due = charges(
    state.entries.filter((e) => e.paymentMethod === "NEXT_MONTH"),
    month,
    "PAYMENT",
  );
  function list(values: Charge[]) {
    return values.map((c) => (
      <EntryCard
        key={c.entry.id}
        entry={c.entry}
        stores={state.stores}
        incomeSources={state.incomeSources}
        allocated={c}
        onEdit={onEdit}
      />
    ));
  }
  return (
    <>
      <div className="period">
        <button
          className="secondary"
          aria-label={"\u524d\u6708"}
          disabled={month <= "1900-01"}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          {"\u524d\u6708"}
        </button>
        <label>
          <span className="sr-only">{"\u5bfe\u8c61\u5e74\u6708"}</span>
          <input
            type="month"
            min="1900-01"
            max="2200-12"
            value={month}
            onChange={(e) => {
              if (
                e.target.validity.valid &&
                /^\d{4}-\d{2}$/.test(e.target.value)
              )
                setMonth(e.target.value);
            }}
          />
        </label>
        <button
          className="secondary"
          aria-label={"\u7fcc\u6708"}
          disabled={month >= "2200-12"}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          {"\u7fcc\u6708"}
        </button>
      </div>
      <Basis mode={state.settings.accounting} onChange={onMode} />
      <div className="tabs-inline">
        <button
          className={tab === 0 ? "selected" : ""}
          onClick={() => setTab(0)}
        >
          {"\u3059\u3079\u3066"}
        </button>
        <button
          className={tab === 1 ? "selected" : ""}
          onClick={() => setTab(1)}
        >
          {"\u6765\u6708\u6255\u3044"}
        </button>
      </div>
      {tab === 0 ? (
        <>
          <Summary
            value={totals(state.entries, month, state.settings.accounting)}
          />
          <p className="note">
            {
              "\u65e5\u4ed8\u306f\u8cfc\u5165\u65e5\u3067\u3059\u3002\u8abf\u6574\u7528\u306e\u5165\u51fa\u91d1\u306f\u6708\u9593\u96c6\u8a08\u306b\u542b\u3081\u307e\u305b\u3093\u3002"
            }
          </p>
          {!all.length && (
            <div className="empty">
              {
                "\u3053\u306e\u6708\u306b\u8a08\u4e0a\u3055\u308c\u308b\u51fa\u8cbb\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
              }
            </div>
          )}
          {list(all)}
        </>
      ) : (
        <>
          <p className="note">
            {
              "\u3053\u306e\u30bf\u30d6\u306f\u8a08\u4e0a\u30e2\u30fc\u30c9\u306b\u304b\u304b\u308f\u3089\u305a\u3001\u5b9f\u969b\u306e\u652f\u6255\u4e88\u5b9a\u3067\u8868\u793a\u3057\u307e\u3059\u3002"
            }
          </p>
          <h2>
            {
              "\u4eca\u6708\u8cfc\u5165 \u00b7 \u6765\u6708\u5f15\u304d\u843d\u3068\u3057"
            }
          </h2>
          <div className="subtotal">
            {yen(out.reduce((n, c) => n + c.amount, 0))}
          </div>
          {list(out)}
          <h2>
            {
              "\u5148\u6708\u8cfc\u5165 \u00b7 \u4eca\u6708\u5f15\u304d\u843d\u3068\u3057"
            }
          </h2>
          <div className="subtotal">
            {yen(incoming.reduce((n, c) => n + c.amount, 0))}
          </div>
          {list(incoming)}
          <h2>
            {
              "\u4eca\u6708\u306b\u652f\u6255\u3046\u6765\u6708\u6255\u3044\u306e\u5168\u4ef6"
            }
          </h2>
          <p className="note">
            {
              "2\u304b\u6708\u4ee5\u4e0a\u524d\u306b\u8cfc\u5165\u3057\u305f\u5206\u5272\u6255\u3044\u3082\u542b\u307f\u307e\u3059\u3002"
            }
          </p>
          <div className="subtotal">
            {yen(due.reduce((n, c) => n + c.amount, 0))}
          </div>
          {list(due)}
        </>
      )}
    </>
  );
}
function Year({
  state,
  year,
  setYear,
  onMonth,
}: {
  state: State;
  year: number;
  setYear: (y: number) => void;
  onMonth: (m: string) => void;
}) {
  const [selected, setSelected] = useState(1);
  const values = Array.from({ length: 12 }, (_, i) =>
    totals(
      state.entries,
      `${year}-${String(i + 1).padStart(2, "0")}`,
      state.settings.accounting,
    ),
  );
  const maximum = Math.max(1, ...values.flatMap((v) => [v.expense, v.income]));
  return (
    <>
      <div className="period">
        <button
          className="secondary"
          disabled={year <= 1900}
          onClick={() => setYear(year - 1)}
        >
          {"\u524d\u5e74"}
        </button>
        <label>
          <span className="sr-only">{"\u5bfe\u8c61\u5e74"}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1900"
            max="2200"
            value={year}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1900 && n <= 2200) setYear(n);
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={year >= 2200}
          onClick={() => setYear(year + 1)}
        >
          {"\u7fcc\u5e74"}
        </button>
      </div>
      <p className="eyebrow">
        {state.settings.accounting === "PAYMENT"
          ? "\u652f\u6255\u6708\u57fa\u6e96 \u00b7 1\u301c12\u6708"
          : "\u8cfc\u5165\u65e5\u57fa\u6e96 \u00b7 1\u301c12\u6708"}
      </p>
      <Summary
        value={{
          expense: values.reduce((n, v) => n + v.expense, 0),
          income: values.reduce((n, v) => n + v.income, 0),
          balance: values.reduce((n, v) => n + v.balance, 0),
        }}
      />
      {state.settings.accounting === "PAYMENT" && (
        <p className="note">
          {
            "12\u6708\u306e\u6765\u6708\u6255\u3044\u306f\u3001\u7fcc\u5e741\u6708\u304b\u3089\u8a08\u4e0a\u3057\u307e\u3059\u3002"
          }
        </p>
      )}
      <section className="chart-card">
        <h2>{"\u6708\u5225\u306e\u51fa\u8cbb\u3068\u53ce\u5165"}</h2>
        <p className="legend">
          <span className="expense">{"\u25a0 \u51fa\u8cbb"}</span>
          <span className="income">{"\u25a0 \u53ce\u5165"}</span>
        </p>
        <svg
          viewBox="0 0 360 185"
          className="chart"
          role="img"
          aria-label={
            "\u6708\u5225\u306e\u51fa\u8cbb\u3068\u53ce\u5165\u3002\u4e0b\u306e\u8868\u3067\u3082\u78ba\u8a8d\u3067\u304d\u307e\u3059\u3002"
          }
        >
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1="0"
              x2="360"
              y1={10 + i * 48}
              y2={10 + i * 48}
              className="gridline"
            />
          ))}
          {values.map((v, i) => {
            const x = i * 30;
            return (
              <g
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`${i + 1}\u6708 \u51fa\u8cbb${yen(v.expense)} \u53ce\u5165${yen(v.income)}`}
                onClick={() => setSelected(i + 1)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(i + 1);
                }}
              >
                <rect
                  x={x}
                  y="0"
                  width="30"
                  height="180"
                  fill={selected === i + 1 ? "var(--selected)" : "transparent"}
                />
                <rect
                  x={x + 4}
                  y={154 - (v.expense / maximum) * 140}
                  width="9"
                  height={(v.expense / maximum) * 140}
                  className="expense-bar"
                />
                <rect
                  x={x + 16}
                  y={154 - (v.income / maximum) * 140}
                  width="9"
                  height={(v.income / maximum) * 140}
                  className="income-bar"
                />
                <text x={x + 15} y="178" textAnchor="middle">
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="note">{`${selected}\u6708 \u00b7 \u51fa\u8cbb ${yen(values[selected - 1].expense)} \u00b7 \u53ce\u5165 ${yen(values[selected - 1].income)}`}</p>
        <button
          className="secondary wide"
          onClick={() =>
            onMonth(`${year}-${String(selected).padStart(2, "0")}`)
          }
        >{`${selected}\u6708\u306e\u660e\u7d30\u3092\u8868\u793a`}</button>
      </section>
      <div className="year-table">
        <div className="table-head">
          <span>{"\u6708"}</span>
          <span>{"\u51fa\u8cbb"}</span>
          <span>{"\u53ce\u5165"}</span>
          <span>{"\u53ce\u652f"}</span>
        </div>
        {values.map((v, i) => (
          <button
            key={i}
            onClick={() => onMonth(`${year}-${String(i + 1).padStart(2, "0")}`)}
          >
            <span>{i + 1}</span>
            <span className="expense">{yen(v.expense)}</span>
            <span className="income">{yen(v.income)}</span>
            <span>{yen(v.balance)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
function SettingsView({
  state,
  onSave,
  onImport,
  onRestore,
  onExportSnapshot,
  onCsv,
  onError,
  onBusy,
}: {
  state: State;
  onSave: () => void;
  onImport: (file: File) => void;
  onRestore: (s: Snapshot) => void;
  onExportSnapshot: (s: Snapshot) => void;
  onCsv: () => void;
  onError: (s: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [payrollBusy, setPayrollBusy] = useState(false);
  const [storeDraft, setStoreDraft] = useState("");
  const [renaming, setRenaming] = useState<Store | null>(null);
  const [rename, setRename] = useState("");
  const [price, setPrice] = useState<Recurring | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [usage, setUsage] = useState<StorageEstimate | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then(setUsage)
      .catch(() => undefined);
  }, [state.snapshots.length]);
  useEffect(() => {
    onBusy(!!renaming || !!price || payrollBusy);
    return () => onBusy(false);
  }, [renaming, price, payrollBusy]);
  const run = (job: () => Promise<unknown>) => {
    void job().catch((e) => onError(errorText(e)));
  };
  return (
    <>
      <PayrollSettings
        state={state}
        onBusy={setPayrollBusy}
        onError={onError}
      />
      <section className="panel">
        <h2>{"\u30d0\u30c3\u30af\u30a2\u30c3\u30d7"}</h2>
        <p className="note">
          {"\u6700\u7d42\u4fdd\u5b58: " + stamp(state.settings.lastExportAt)}
        </p>
        <p className="note">
          {"\u4fdd\u5b58\u65b9\u6cd5: " +
            (state.settings.lastExportMethod ||
              "\u307e\u3060\u4fdd\u5b58\u3057\u3066\u3044\u307e\u305b\u3093")}
        </p>
        <button className="primary wide" onClick={onSave}>
          <Icon name="download" />
          {"\u30c9\u30e9\u30a4\u30d6\u306b\u4fdd\u5b58"}
        </button>
        <p className="note">
          {
            "\u4fdd\u5b58\u753b\u9762\u3067\u4fdd\u5b58\u5148\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002\u5171\u6709\u3084\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u306e\u5834\u5408\u306f\u3001\u4fdd\u5b58\u306e\u78ba\u8a8d\u5f8c\u306b\u5b8c\u4e86\u306b\u3057\u307e\u3059\u3002"
          }
        </p>
        <button className="secondary wide" onClick={onCsv}>
          {"\u8a18\u9332\u4e00\u89a7\u3092CSV\u3067\u4fdd\u5b58"}
        </button>
        <p className="note">
          {
            "CSV\u306f\u8a18\u9332\u306e\u95b2\u89a7\u7528\u3067\u3059\u3002\u5168\u30c7\u30fc\u30bf\u306e\u5fa9\u5143\u306b\u306fJSON\u3092\u4f7f\u3063\u3066\u304f\u3060\u3055\u3044\u3002CSV\u306e\u4fdd\u5b58\u3067\u306f\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u5b8c\u4e86\u306b\u306a\u308a\u307e\u305b\u3093\u3002"
          }
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={state.settings.remindersEnabled}
            onChange={(e) =>
              run(() =>
                db.patchSettings({ remindersEnabled: e.target.checked }),
              )
            }
          />
          {"\u9031\u6b21\u306e\u4fdd\u5b58\u6848\u5185\u3092\u8868\u793a"}
        </label>
        <label>
          {"\u6848\u5185\u3092\u59cb\u3081\u308b\u66dc\u65e5"}
          <select
            value={state.settings.reminderDay}
            onChange={(e) =>
              run(() =>
                db.patchSettings({ reminderDay: Number(e.target.value) }),
              )
            }
          >
            {[
              "\u65e5\u66dc\u65e5",
              "\u6708\u66dc\u65e5",
              "\u706b\u66dc\u65e5",
              "\u6c34\u66dc\u65e5",
              "\u6728\u66dc\u65e5",
              "\u91d1\u66dc\u65e5",
              "\u571f\u66dc\u65e5",
            ].map((day, i) => (
              <option key={i} value={i}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          {
            "\u9031\u306f\u65e5\u672c\u6642\u9593\u306e\u65e5\u66dc\u65e5\u306b\u59cb\u307e\u308a\u307e\u3059\u3002\u6307\u5b9a\u66dc\u65e5\u4ee5\u964d\u3001\u6700\u521d\u306b\u958b\u3044\u305f\u3068\u304d\u306b\u6848\u5185\u3057\u307e\u3059\u3002"
          }
        </p>
      </section>
      <section className="panel">
        <h2>{"\u30c7\u30fc\u30bf\u306e\u8aad\u307f\u8fbc\u307f"}</h2>
        <p className="note">
          {
            "\u521d\u56de\u79fb\u884c\u7528\u306eCSV\u3001\u307e\u305f\u306f\u3053\u306e\u30a2\u30d7\u30ea\u306eJSON\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u9078\u3079\u307e\u3059\u3002\u5185\u5bb9\u3092\u78ba\u8a8d\u3057\u3066\u304b\u3089\u3001\u73fe\u5728\u306e\u30c7\u30fc\u30bf\u3092\u7f6e\u304d\u63db\u3048\u307e\u3059\u3002"
          }
        </p>
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          aria-label={"CSV\u307e\u305f\u306fJSON\u30d5\u30a1\u30a4\u30eb"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onImport(file);
          }}
        />
        <button
          className="secondary wide"
          onClick={() => fileRef.current?.click()}
        >
          {"\u30d5\u30a1\u30a4\u30eb\u3092\u9078\u3076"}
        </button>
      </section>
      <section className="panel">
        <h2>{"\u8cfc\u5165\u5148"}</h2>
        <div className="inline-field">
          <input
            aria-label={"\u8ffd\u52a0\u3059\u308b\u8cfc\u5165\u5148"}
            value={storeDraft}
            onChange={(e) => setStoreDraft(e.target.value)}
            placeholder={"\u65b0\u3057\u3044\u8cfc\u5165\u5148"}
            maxLength={200}
          />
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await db.addStore(storeDraft);
                setStoreDraft("");
              })
            }
          >
            {"\u8ffd\u52a0"}
          </button>
        </div>
        {state.stores.map((s, i) => (
          <div className="store-row" key={s.id}>
            <strong>
              {s.name}
              {s.hidden && <small>{" \u00b7 \u975e\u8868\u793a"}</small>}
            </strong>
            <div className="store-actions">
              <button
                aria-label={s.name + "\u3092\u4e0a\u3078"}
                disabled={i === 0}
                onClick={() => run(() => db.moveStore(s.id!, -1))}
              >
                {"\u2191"}
              </button>
              <button
                aria-label={s.name + "\u3092\u4e0b\u3078"}
                disabled={i === state.stores.length - 1}
                onClick={() => run(() => db.moveStore(s.id!, 1))}
              >
                {"\u2193"}
              </button>
              <button
                onClick={() => {
                  setRenaming(s);
                  setRename(s.name);
                }}
              >
                {"\u540d\u79f0"}
              </button>
              <button onClick={() => run(() => db.toggleStore(s.id!))}>
                {s.hidden ? "\u8868\u793a" : "\u96a0\u3059"}
              </button>
              <button
                className="danger-text"
                onClick={() => {
                  if (
                    confirm(
                      "\u672a\u4f7f\u7528\u306e\u8cfc\u5165\u5148\u300c" +
                        s.name +
                        "\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f",
                    )
                  )
                    run(() => db.deleteStore(s.id!));
                }}
              >
                {"\u524a\u9664"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{"\u5b9a\u671f\u652f\u6255"}</h2>
        <p className="note">
          {
            "\u30a2\u30d7\u30ea\u3092\u958b\u3044\u305f\u3068\u304d\u306b\u672a\u4f5c\u6210\u306e\u6708\u3092\u88dc\u3044\u307e\u3059\u3002\u5143\u306e\u8a18\u9332\u3092\u524a\u9664\u3057\u3066\u3082\u5951\u7d04\u306f\u7d9a\u304f\u305f\u3081\u3001\u7d42\u4e86\u3059\u308b\u3068\u304d\u306f\u3053\u3053\u3067\u64cd\u4f5c\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
          }
        </p>
        {!state.recurring.length && (
          <p className="muted">
            {
              "\u5b9a\u671f\u652f\u6255\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
            }
          </p>
        )}
        {state.recurring.map((r) => (
          <div className="recurring-row" key={r.id}>
            <strong>{r.description || "\u5185\u5bb9\u672a\u8a2d\u5b9a"}</strong>
            <p>
              {yen(priceFor(r, tokyoDate().slice(0, 7))) +
                " / \u6708 \u00b7 " +
                (r.active ? "\u7d99\u7d9a\u4e2d" : "\u7d42\u4e86")}
            </p>
            <p className="muted">
              {storeName(state.stores, r.storeId) +
                " \u00b7 \u958b\u59cb " +
                r.startDate}
            </p>
            {r.pendingAmount !== undefined && r.effectiveMonth && (
              <p className="note">
                {r.effectiveMonth + "\u304b\u3089 " + yen(r.pendingAmount)}
              </p>
            )}
            {r.active && (
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => {
                    setPrice(r);
                    setPriceValue(String(priceFor(r, tokyoDate().slice(0, 7))));
                  }}
                >
                  {"\u7fcc\u6708\u304b\u3089\u91d1\u984d\u5909\u66f4"}
                </button>
                <button
                  className="danger-text"
                  onClick={() => {
                    if (
                      confirm(
                        "\u4eca\u6708\u5206\u307e\u3067\u6b8b\u3057\u3001\u7fcc\u6708\u4ee5\u964d\u306e\u81ea\u52d5\u8ffd\u52a0\u3092\u7d42\u4e86\u3057\u307e\u3059\u304b\uff1f",
                      )
                    )
                      run(() => db.stopRecurring(r.id));
                  }}
                >
                  {"\u7d42\u4e86"}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>
          {"\u30a2\u30d7\u30ea\u5185\u306e\u9000\u907f\u30c7\u30fc\u30bf"}
        </h2>
        <p className="notice">
          {
            "\u30b9\u30ca\u30c3\u30d7\u30b7\u30e7\u30c3\u30c8\u306f\u3053\u306e\u30b9\u30de\u30db\u306e\u30d6\u30e9\u30a6\u30b6\u5185\u306b\u4fdd\u5b58\u3055\u308c\u307e\u3059\u3002Chrome\u306e\u30c7\u30fc\u30bf\u524a\u9664\u3084\u7aef\u672b\u306e\u7d1b\u5931\u3067\u306f\u4e00\u7dd2\u306b\u6d88\u3048\u308b\u305f\u3081\u3001\u30c9\u30e9\u30a4\u30d6\u3078\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306e\u4ee3\u308f\u308a\u306b\u306f\u306a\u308a\u307e\u305b\u3093\u3002"
          }
        </p>
        <p className="note">
          {
            "\u9031\u6b218\u4ef6\u3001\u624b\u52d5\u30fb\u8aad\u307f\u8fbc\u307f\u524d\u306f\u5408\u308f\u305b\u30665\u4ef6\u307e\u3067\u4fdd\u5b58\u3057\u307e\u3059\u3002"
          }
        </p>
        <button
          className="secondary wide"
          onClick={() => run(() => db.snapshot("MANUAL", VERSION))}
        >
          {"\u4eca\u306e\u72b6\u614b\u3092\u9000\u907f\u3059\u308b"}
        </button>
        {state.snapshots.map((s) => (
          <div className="snapshot-row" key={s.id}>
            <strong>{stamp(s.createdAt)}</strong>
            <p className="muted">
              {(s.reason === "WEEKLY"
                ? "\u9031\u6b21"
                : s.reason === "BEFORE_MIGRATION"
                  ? "\u66f4\u65b0\u524d"
                  : s.reason === "MANUAL"
                    ? "\u624b\u52d5"
                    : "\u8aad\u307f\u8fbc\u307f\u524d") +
                " \u00b7 " +
                s.data.transactions.length +
                "\u4ef6"}
            </p>
            <div className="button-row">
              <button className="secondary" onClick={() => onRestore(s)}>
                {"\u3053\u306e\u72b6\u614b\u306b\u623b\u3059"}
              </button>
              <button className="secondary" onClick={() => onExportSnapshot(s)}>
                {"\u66f8\u304d\u51fa\u3059"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{"\u7aef\u672b\u5185\u306e\u4fdd\u5b58"}</h2>
        <p>
          {"\u6c38\u7d9a\u5316: " +
            {
              granted: "\u8a31\u53ef\u3055\u308c\u3066\u3044\u307e\u3059",
              denied: "\u8a31\u53ef\u3055\u308c\u3066\u3044\u307e\u305b\u3093",
              unsupported:
                "\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u3067\u306f\u672a\u5bfe\u5fdc",
              unknown: "\u78ba\u8a8d\u4e2d",
            }[state.settings.persistence]}
        </p>
        <p className="note">
          {usage?.usage !== undefined
            ? "\u4f7f\u7528\u5bb9\u91cf: " +
              (usage.usage / 1024 / 1024).toFixed(2) +
              " MiB" +
              (usage.quota
                ? " / \u7d04" + Math.round(usage.quota / 1024 / 1024) + " MiB"
                : "")
            : "\u4f7f\u7528\u5bb9\u91cf\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3002"}
        </p>
        <p className="note">
          {
            "\u30c7\u30fc\u30bf\u306f\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306b\u4fdd\u5b58\u3057\u307e\u3059\u3002Google\u30b9\u30d7\u30ec\u30c3\u30c9\u30b7\u30fc\u30c8\u3068\u306e\u540c\u671f\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
          }
        </p>
        <p className="version">
          {"\u5bb6\u8a08\u7c3f v" + VERSION + " \u00b7 \u65e5\u672c\u8a9e"}
        </p>
      </section>
      {renaming && (
        <Modal
          title={"\u8cfc\u5165\u5148\u306e\u540d\u524d\u3092\u5909\u66f4"}
          onClose={() => setRenaming(null)}
          actions={
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  await db.renameStore(renaming.id!, rename);
                  setRenaming(null);
                })
              }
            >
              {"\u5909\u66f4\u3092\u4fdd\u5b58"}
            </button>
          }
        >
          <label>
            {"\u540d\u524d"}
            <input
              autoFocus
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              maxLength={200}
            />
          </label>
          <p className="note">
            {
              "\u904e\u53bb\u306e\u8a18\u9332\u306b\u3082\u65b0\u3057\u3044\u540d\u524d\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002"
            }
          </p>
        </Modal>
      )}
      {price && (
        <Modal
          title={"\u5b9a\u671f\u652f\u6255\u306e\u91d1\u984d\u5909\u66f4"}
          onClose={() => setPrice(null)}
          actions={
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  if (!/^\d+$/.test(priceValue))
                    throw new Error(
                      "\u6574\u6570\u306e\u91d1\u984d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
                    );
                  await db.changePrice(price.id, Number(priceValue));
                  setPrice(null);
                })
              }
            >
              {"\u7fcc\u6708\u304b\u3089\u5909\u66f4"}
            </button>
          }
        >
          <p>{price.description}</p>
          <label>
            {"\u65b0\u3057\u3044\u6708\u984d\uff08\u5186\uff09"}
            <input
              inputMode="numeric"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
            />
          </label>
          <p className="note">
            {
              "\u904e\u53bb\u306e\u8a18\u9332\u3068\u4eca\u6708\u5206\u306f\u5909\u66f4\u3057\u307e\u305b\u3093\u3002"
            }
          </p>
        </Modal>
      )}
    </>
  );
}
type Overlay =
  | { kind: "weekly"; prepared: Prepared }
  | { kind: "confirm-save"; prepared: Prepared; method: string }
  | {
      kind: "retry-save";
      prepared: Prepared;
      message: string;
      canShare: boolean;
    }
  | {
      kind: "import";
      backup: Backup;
      skipped: { row: number; reason: string }[];
      blank: number;
      source: string;
    }
  | { kind: "delete-entry"; entry: Entry }
  | { kind: "restore"; snapshot: Snapshot }
  | null;
type Tab = "home" | "records" | "month" | "year" | "settings";
export function App() {
  const [state, setState] = useState<State>(empty);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(tokyoDate().slice(0, 7));
  const [year, setYear] = useState(Number(tokyoDate().slice(0, 4)));
  const [editor, setEditor] = useState<{
    entry: Entry | null;
    type?: Entry["type"];
  } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [standalone, setStandalone] = useState<{ slip: Payslip | null } | null>(
    null,
  );
  const [recordIds, setRecordIds] = useState<Set<number> | null>(null);
  const [recovery, setRecovery] = useState<Prepared | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const position = useMemo(() => assetPosition(state.entries), [state.entries]);
  const [message, setMessage] = useState("");
  const [update, setUpdate] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const updateAPI = useRef<UpdateAPI | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const blocked = useRef(true);
  blocked.current =
    !!editor ||
    !!standalone ||
    !!overlay ||
    showPending ||
    settingsBusy ||
    saving;
  const pending = useRef(false);
  const claiming = useRef(false);
  const activation = useRef(0);
  const prepared = useMemo(() => {
    if (!ready) return null;
    try {
      return prepareBackup({
        format: "kakeibo-web",
        schemaVersion: 3,
        payslips: state.payslips,
        incomeSources: state.incomeSources,
        exportedAt: new Date().toISOString(),
        appVersion: VERSION,
        transactions: state.entries,
        recurringPayments: state.recurring,
        stores: state.stores,
        settings: state.settings,
        snapshots: state.snapshots,
      });
    } catch {
      return null;
    }
  }, [state, ready]);
  const csvFile = useMemo(
    () =>
      new Blob([exportCsv(state.entries, state.stores, state.incomeSources)], {
        type: "text/csv;charset=utf-8",
      }),
    [state.entries, state.stores, state.incomeSources],
  );
  const saveCsv = () => {
    const url = URL.createObjectURL(csvFile);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kakeibo_records_" + tokyoDate() + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const error = (s: string) => setMessage(s);
  const tryReminder = async () => {
    if (!pending.current || blocked.current || claiming.current) return;
    claiming.current = true;
    pending.current = false;
    try {
      const data = await db.claimReminder(VERSION);
      if (data) setOverlay({ kind: "weekly", prepared: prepareBackup(data) });
    } catch (e) {
      error(errorText(e));
    } finally {
      claiming.current = false;
    }
  };
  useEffect(() => {
    let alive = true;
    const blockedOpen = () =>
      setMessage(
        "\u66f4\u65b0\u306e\u305f\u3081\u3001\u4ed6\u306e\u5bb6\u8a08\u7c3f\u30bf\u30d6\u3092\u9589\u3058\u3066\u304f\u3060\u3055\u3044\u3002\u30d6\u30e9\u30a6\u30b6\u306e\u30c7\u30fc\u30bf\u306f\u6d88\u53bb\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044\u3002",
      );
    db.on("blocked", blockedOpen);
    let subscription: { unsubscribe: () => void } | undefined;
    const observe = () => {
      if (subscription) return;
      subscription = liveQuery(() => db.state()).subscribe({
        next: (value) => {
          if (alive) {
            setState(value);
            setReady(true);
          }
        },
        error: (e) => {
          if (alive) {
            setFatal(errorText(e));
            void recoveryBackup(db.name, VERSION)
              .then((data) => {
                if (alive && data) setRecovery(prepareBackup(data, false));
              })
              .catch(() => undefined);
          }
        },
      });
    };
    const activate = async () => {
      const id = ++activation.current;
      try {
        await db.startup(VERSION);
        if (!alive) return;
        observe();
        pending.current = true;
        if (id === activation.current) void tryReminder();
        const prefs = await db.prefs();
        if (prefs.persistence === "unknown") {
          let persistence: State["settings"]["persistence"] = "unsupported";
          try {
            if (navigator.storage?.persist)
              persistence = (await navigator.storage.persist())
                ? "granted"
                : "denied";
          } catch {
            persistence = "denied";
          }
          await db.patchSettings({ persistence });
        }
        await updateAPI.current?.check();
      } catch (e) {
        if (alive) {
          setFatal(errorText(e));
          void recoveryBackup(db.name, VERSION)
            .then((data) => {
              if (alive && data) setRecovery(prepareBackup(data, false));
            })
            .catch(() => undefined);
        }
      }
    };
    updateAPI.current = registerUpdates(
      () => setUpdate(true),
      () => setOfflineReady(true),
    );
    const visibility = () => {
      if (document.visibilityState === "visible") void activate();
    };
    const connected = () => setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    void activate();
    return () => {
      alive = false;
      subscription?.unsubscribe();
      db.on.blocked.unsubscribe(blockedOpen);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
    };
  }, []);
  useEffect(() => {
    if (
      !editor &&
      !standalone &&
      !overlay &&
      !showPending &&
      !settingsBusy &&
      !saving
    )
      void tryReminder();
  }, [editor, standalone, overlay, showPending, settingsBusy, saving]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 12000);
    return () => clearTimeout(timer);
  }, [message]);
  const mode = (accounting: Accounting) => {
    void db.patchSettings({ accounting }).catch((e) => error(errorText(e)));
  };
  const later = () => {
    pending.current = false;
    void db.later().catch((e) => error(errorText(e)));
    setOverlay(null);
  };
  const save = (
    p: Prepared | null,
    method: "auto" | "share" | "download" = "auto",
  ) => {
    if (!p) {
      error(
        "\u4fdd\u5b58\u30c7\u30fc\u30bf\u3092\u6e96\u5099\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002",
      );
      return;
    }
    if (
      p.countsAsCurrent &&
      weekKey(tokyoDate(new Date(p.backup.exportedAt))) !== weekKey(tokyoDate())
    ) {
      error(
        "\u65e5\u4ed8\u304c\u5909\u308f\u308a\u307e\u3057\u305f\u3002\u6700\u65b0\u30c7\u30fc\u30bf\u3067\u4fdd\u5b58\u3092\u3084\u308a\u76f4\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      );
      setOverlay(null);
      return;
    }
    setSaving(true);
    let operation: ReturnType<typeof beginSave>;
    try {
      operation = beginSave(p, method);
    } catch (e) {
      setSaving(false);
      error(errorText(e));
      return;
    }
    void operation
      .then(async (result) => {
        if (result.kind === "saved") {
          if (p.countsAsCurrent)
            await db.markExport(result.method, confirmedTime(p));
          setOverlay(null);
          error(
            "\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002",
          );
        } else if (result.kind === "confirm") {
          setOverlay({
            kind: "confirm-save",
            prepared: p,
            method: result.method,
          });
        } else if (result.kind === "retry") {
          setOverlay({
            kind: "retry-save",
            prepared: p,
            message: result.message,
            canShare: result.canShare,
          });
        } else {
          setOverlay(null);
          error(
            "\u4fdd\u5b58\u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u672a\u5b8c\u4e86\u3067\u3059\u3002",
          );
        }
      })
      .catch((e) => error(errorText(e)))
      .finally(() => setSaving(false));
  };
  const importFile = async (file: File) => {
    setSaving(true);
    try {
      if (file.size > 64 * 1024 * 1024)
        throw new Error(
          "\u8aad\u307f\u8fbc\u3081\u308b\u30d5\u30a1\u30a4\u30eb\u306f64 MiB\u307e\u3067\u3067\u3059\u3002",
        );
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".csv")) {
        const result = importCsv(text);
        const backup: Backup = {
          format: "kakeibo-web",
          schemaVersion: 3,
          payslips: [],
          exportedAt: new Date().toISOString(),
          appVersion: VERSION,
          transactions: result.transactions,
          recurringPayments: result.recurringPayments,
          stores: result.stores,
          settings: {
            ...defaults(),
            accounting: stateRef.current.settings.accounting,
          },
          incomeSources: result.incomeSources,
          snapshots: [],
        };
        setOverlay({
          kind: "import",
          backup,
          skipped: result.skipped,
          blank: result.blankRows,
          source: "CSV",
        });
      } else
        setOverlay({
          kind: "import",
          backup: parseBackup(text),
          skipped: [],
          blank: 0,
          source: "JSON",
        });
    } catch (e) {
      error(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const downloadSafety = () => {
    if (
      (state.entries.length ||
        state.payslips.length ||
        state.incomeSources.length ||
        state.settings.salaryTargets.length) &&
      prepared
    ) {
      const url = URL.createObjectURL(prepared.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = prepared.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };
  const replace = async (backup: Backup) => {
    setSaving(true);
    try {
      backup = mergeIncomeSources(backup);
      await db.replace(backup, VERSION);
      await db.startup(VERSION);
      setOverlay(null);
      error(
        "\u8aad\u307f\u8fbc\u307f\u304c\u5b8c\u4e86\u3057\u307e\u3057\u305f\u3002\u5909\u66f4\u524d\u306e\u72b6\u614b\u306f\u30a2\u30d7\u30ea\u5185\u306b\u3082\u9000\u907f\u3057\u307e\u3057\u305f\u3002",
      );
    } catch (e) {
      error(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const edit = (entry: Entry) => setEditor({ entry });
  const remove = (entry: Entry) => {
    if (state.payslips.some((p) => p.transactionId === entry.id)) {
      setOverlay({ kind: "delete-entry", entry });
      return;
    }
    if (
      confirm(
        "\u300c" +
          (entry.description || TYPE_LABEL[entry.type]) +
          "\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f \u5b9a\u671f\u652f\u6255\u306e\u5951\u7d04\u306f\u7d42\u4e86\u3057\u307e\u305b\u3093\u3002",
      )
    )
      void db.deleteEntry(entry.id!).catch((e) => error(errorText(e)));
  };
  const editPayslip = (p: Payslip) => {
    const entry = state.entries.find((e) => e.id === p.transactionId);
    if (entry) setEditor({ entry });
    else setStandalone({ slip: p });
  };
  const salaryMissing = (entries: Entry[]) => {
    setRecordIds(new Set(entries.map((e) => e.id!)));
    void db.patchSettings({ recordView: "INCOME" }).then(async () => {
      setState(await db.state());
      setTab("records");
    });
  };
  const labels: Record<Tab, string> = {
    home: "\u30db\u30fc\u30e0",
    records: "\u8a18\u9332",
    month: "\u6708\u9593",
    year: "\u5e74\u9593",
    settings: "\u8a2d\u5b9a",
  };
  if (fatal) return <RecoveryScreen message={fatal} prepared={recovery} />;
  return (
    <div className="app">
      <header className="topbar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("home");
          }}
          className="brand"
        >
          <span className="brand-mark">{"\u00a5"}</span>
          <span>{"\u5bb6\u8a08\u7c3f"}</span>
        </a>
        <span className={"connection " + (online ? "" : "is-offline")}>
          {online
            ? "\u7aef\u672b\u5185\u306b\u4fdd\u5b58"
            : "\u30aa\u30d5\u30e9\u30a4\u30f3"}
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">{"\u66ae\u3089\u3057\u306e\u8a18\u9332"}</p>
            <h1>{labels[tab]}</h1>
          </div>
          <span className="version">{"v" + VERSION}</span>
        </div>
        {update && (
          <div className="update-banner" role="status">
            <p>
              {
                "\u65b0\u3057\u3044\u30d0\u30fc\u30b8\u30e7\u30f3\u3092\u5229\u7528\u3067\u304d\u307e\u3059\u3002\u5165\u529b\u3092\u7d42\u3048\u3066\u304b\u3089\u66f4\u65b0\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
              }
            </p>
            <button
              className="primary"
              disabled={
                !!editor || !!standalone || settingsBusy || saving || !!overlay
              }
              onClick={() => updateAPI.current?.apply()}
            >
              {"\u66f4\u65b0\u3059\u308b"}
            </button>
          </div>
        )}
        {!ready ? (
          <div className="empty">
            {
              "\u4fdd\u5b58\u30c7\u30fc\u30bf\u3092\u958b\u3044\u3066\u3044\u307e\u3059\u2026"
            }
          </div>
        ) : (
          <>
            {tab === "home" && (
              <>
                <section
                  className={
                    "backup-status " +
                    (weekComplete(state.settings, tokyoDate())
                      ? "complete"
                      : "pending")
                  }
                >
                  <div>
                    <strong>
                      {weekComplete(state.settings, tokyoDate())
                        ? "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u5b8c\u4e86"
                        : "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u672a\u5b8c\u4e86"}
                    </strong>
                    <p>
                      {"\u6700\u7d42\u4fdd\u5b58: " +
                        stamp(state.settings.lastExportAt)}
                    </p>
                  </div>
                  <button
                    className="backup-shortcut"
                    aria-label={"\u30c9\u30e9\u30a4\u30d6\u306b\u4fdd\u5b58"}
                    disabled={saving || !prepared}
                    onClick={() => save(prepared)}
                  >
                    <Icon name="download" />
                  </button>
                </section>
                <section className="asset-card">
                  <p>{"\u4eca\u6708\u6642\u70b9\u306e\u7dcf\u8cc7\u7523"}</p>
                  <div
                    className={
                      "asset-value " +
                      (position.current < 0 ? "asset-negative" : "")
                    }
                  >
                    {yen(position.current)}
                  </div>
                  <div className="asset-secondary">
                    <span>
                      {
                        "\u6765\u6708\u4ee5\u964d\u306e\u5f15\u304d\u843d\u3068\u3057\u3092\u542b\u3080"
                      }
                    </span>
                    <strong
                      className={
                        "asset-value " +
                        (position.full < 0 ? "asset-negative" : "")
                      }
                    >
                      {yen(position.full)}
                    </strong>
                  </div>
                  <button
                    className="asset-pending"
                    onClick={() => setShowPending(true)}
                  >
                    {"\u6765\u6708\u4ee5\u964d\u306e\u5f15\u304d\u843d\u3068\u3057\u4e88\u5b9a " +
                      yen(-position.scheduled)}
                  </button>
                  {position.futureImpact !== 0 && (
                    <p className="asset-caption">
                      {"\u672a\u6765\u65e5\u4ed8\u306e\u8a18\u9332\u306b\u3088\u308b\u5168\u671f\u9593\u984d\u3078\u306e\u5f71\u97ff " +
                        yen(position.futureImpact)}
                    </p>
                  )}{" "}
                  <div className="asset-meta">
                    <span>
                      {state.entries.length + "\u4ef6\u306e\u8a18\u9332"}
                    </span>
                    <span>{tokyoDate().replaceAll("-", " / ")}</span>
                  </div>
                </section>
                <div className="section-heading">
                  <h2>{"\u4eca\u6708\u306e\u53ce\u652f"}</h2>
                  <button
                    onClick={() => {
                      setMonth(tokyoDate().slice(0, 7));
                      setTab("month");
                    }}
                  >
                    {"\u660e\u7d30\u3092\u898b\u308b \u2192"}
                  </button>
                </div>
                <Basis mode={state.settings.accounting} onChange={mode} />
                <Summary
                  value={totals(
                    state.entries,
                    tokyoDate().slice(0, 7),
                    state.settings.accounting,
                  )}
                />
                <section className="home-note">
                  <div className="note-symbol">{"\u2713"}</div>
                  <div>
                    <strong>
                      {
                        "\u5bb6\u8a08\u306e\u8a18\u9332\u306f\u3001\u3053\u306e\u7aef\u672b\u306b\u3002"
                      }
                    </strong>
                    <p>
                      {
                        "\u8ffd\u52a0\u30fb\u7de8\u96c6\u306f\u30aa\u30d5\u30e9\u30a4\u30f3\u3067\u3082\u4f7f\u3048\u307e\u3059\u3002\u7aef\u672b\u3092\u306a\u304f\u3057\u305f\u5834\u5408\u306b\u5099\u3048\u3066\u3001\u9031\u306b\u4e00\u5ea6\u306f\u30d5\u30a1\u30a4\u30eb\u3092\u4fdd\u5b58\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
                      }
                    </p>
                  </div>
                </section>
                <div className="section-heading">
                  <h2>{"\u6700\u8fd1\u306e\u8a18\u9332"}</h2>
                  <button onClick={() => setTab("records")}>
                    {"\u3059\u3079\u3066 \u2192"}
                  </button>
                </div>
                {!state.entries.length ? (
                  <div className="empty">
                    <strong>
                      {
                        "\u6700\u521d\u306e\u8a18\u9332\u3092\u6b8b\u3057\u307e\u3057\u3087\u3046"
                      }
                    </strong>
                    <p>
                      {
                        "\u53f3\u4e0b\u306e\uff0b\u304b\u3089\u5165\u529b\u3067\u304d\u307e\u3059\u3002\u79fb\u884c\u7528CSV\u306f\u8a2d\u5b9a\u3067\u8aad\u307f\u8fbc\u3081\u307e\u3059\u3002"
                      }
                    </p>
                  </div>
                ) : (
                  [...state.entries]
                    .sort(
                      (a, b) =>
                        b.date.localeCompare(a.date) ||
                        (b.id ?? 0) - (a.id ?? 0),
                    )
                    .slice(0, 4)
                    .map((e) => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        stores={state.stores}
                        incomeSources={state.incomeSources}
                        onEdit={edit}
                      />
                    ))
                )}
                <p className="footer-note">
                  {offlineReady
                    ? "\u30aa\u30d5\u30e9\u30a4\u30f3\u3067\u5229\u7528\u3067\u304d\u307e\u3059"
                    : "\u30c7\u30fc\u30bf\u306f\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306b\u4fdd\u5b58\u3055\u308c\u307e\u3059"}
                </p>
                <p className="footer-note">{"v" + VERSION}</p>
              </>
            )}
            {tab === "records" && (
              <>
                {recordIds && (
                  <div className="notice">
                    <p>
                      {
                        "\u7d66\u4e0e\u660e\u7d30\u304c\u306a\u3044\u53ef\u80fd\u6027\u306e\u3042\u308b\u5165\u91d1\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002"
                      }
                    </p>
                    <button
                      className="secondary wide"
                      onClick={() => setRecordIds(null)}
                    >
                      {"\u3059\u3079\u3066\u306e\u8a18\u9332\u306b\u623b\u308b"}
                    </button>
                  </div>
                )}
                <Records
                  state={
                    recordIds
                      ? {
                          ...state,
                          entries: state.entries.filter((e) =>
                            recordIds.has(e.id!),
                          ),
                        }
                      : state
                  }
                  onEdit={edit}
                  onDelete={remove}
                  onPayslip={editPayslip}
                />
              </>
            )}
            {tab === "month" && (
              <Month
                state={state}
                month={month}
                setMonth={setMonth}
                onMode={mode}
                onEdit={edit}
              />
            )}
            {tab === "year" && (
              <>
                {" "}
                <Year
                  state={state}
                  year={year}
                  setYear={setYear}
                  onMonth={(m) => {
                    setMonth(m);
                    setTab("month");
                  }}
                />
                <PayrollYear
                  state={state}
                  year={year}
                  onNew={() => setStandalone({ slip: null })}
                  onEdit={editPayslip}
                  onMissing={salaryMissing}
                />
              </>
            )}
            {tab === "settings" && (
              <SettingsView
                state={state}
                onSave={() => save(prepared)}
                onCsv={saveCsv}
                onImport={(file) => void importFile(file)}
                onRestore={(snapshot) =>
                  setOverlay({ kind: "restore", snapshot })
                }
                onExportSnapshot={(s) =>
                  save(prepareBackup({ ...s.data, snapshots: [] }, false))
                }
                onError={error}
                onBusy={setSettingsBusy}
              />
            )}
          </>
        )}
      </main>
      <button
        className="fab"
        aria-label={"\u8a18\u9332\u3092\u8ffd\u52a0"}
        disabled={!ready}
        onClick={() =>
          setEditor({
            entry: null,
            type:
              tab === "records"
                ? (state.settings.recordView ?? "EXPENSE")
                : "EXPENSE",
          })
        }
      >
        <Icon name="plus" />
      </button>
      <nav
        className="bottom-nav"
        aria-label={
          "\u30e1\u30a4\u30f3\u30ca\u30d3\u30b2\u30fc\u30b7\u30e7\u30f3"
        }
      >
        {(["home", "records", "month", "year", "settings"] as const).map(
          (t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                if (t === "records") setRecordIds(null);
              }}
            >
              <Icon name={t} />
              <span>{labels[t]}</span>
            </button>
          ),
        )}
      </nav>
      {message && (
        <div className="toast" role="status">
          <p>{message}</p>
          <button
            aria-label={
              "\u30e1\u30c3\u30bb\u30fc\u30b8\u3092\u9589\u3058\u308b"
            }
            onClick={() => setMessage("")}
          >
            {"\u00d7"}
          </button>
        </div>
      )}
      {showPending && (
        <Modal
          title={
            "\u6765\u6708\u4ee5\u964d\u306e\u5f15\u304d\u843d\u3068\u3057\u4e88\u5b9a"
          }
          onClose={() => setShowPending(false)}
        >
          <p>{"\u5408\u8a08 " + yen(position.scheduled)}</p>
          {position.pending.map((p, i) => (
            <div className="snapshot-row" key={i}>
              <strong>{p.month + " \u00b7 " + p.entry.description}</strong>
              <p>{yen(p.amount)}</p>
            </div>
          ))}
          {!position.pending.length && (
            <p>{"\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}</p>
          )}
          {position.futureImpact !== 0 && (
            <p className="notice">
              {"\u672a\u6765\u65e5\u4ed8\u306e\u8a18\u9332\u306f\u3053\u306e\u4e88\u5b9a\u306b\u542b\u307f\u307e\u305b\u3093\u3002\u5168\u671f\u9593\u306e\u7dcf\u8cc7\u7523\u306b\u306f " +
                yen(position.futureImpact) +
                " \u306e\u5f71\u97ff\u304c\u3042\u308a\u307e\u3059\u3002"}
            </p>
          )}
        </Modal>
      )}
      {standalone && (
        <StandalonePayslipEditor
          original={standalone.slip}
          incomeSources={state.incomeSources}
          onClose={() => setStandalone(null)}
          onError={error}
        />
      )}
      {overlay?.kind === "delete-entry" && (
        <Modal
          title={"\u5165\u91d1\u3068\u7d66\u4e0e\u660e\u7d30\u306e\u524a\u9664"}
          onClose={() => setOverlay(null)}
        >
          <p>
            {
              "\u5165\u91d1\u3092\u524a\u9664\u3059\u308b\u3068\u304d\u3001\u7d66\u4e0e\u660e\u7d30\u3092\u3069\u3046\u3057\u307e\u3059\u304b\uff1f \u660e\u7d30\u3060\u3051\u6b8b\u3059\u5834\u5408\u3001\u7dcf\u8cc7\u7523\u3068\u6708\u9593\u53ce\u5165\u304b\u3089\u5165\u91d1\u304c\u9664\u304b\u308c\u3001\u5e74\u9593\u7d66\u4e0e\u306b\u306f\u660e\u7d30\u304c\u6b8b\u308a\u307e\u3059\u3002"
            }
          </p>
          <div className="stack">
            <button
              className="secondary"
              onClick={() =>
                void db
                  .deleteEntry(overlay.entry.id!, "KEEP")
                  .then(() => setOverlay(null))
                  .catch((e) => error(errorText(e)))
              }
            >
              {"\u660e\u7d30\u3060\u3051\u6b8b\u3059"}
            </button>
            <button
              className="danger-text"
              onClick={() =>
                void db
                  .deleteEntry(overlay.entry.id!, "DELETE")
                  .then(() => setOverlay(null))
                  .catch((e) => error(errorText(e)))
              }
            >
              {"\u660e\u7d30\u3082\u524a\u9664\u3059\u308b"}
            </button>
            <button className="secondary" onClick={() => setOverlay(null)}>
              {"\u30ad\u30e3\u30f3\u30bb\u30eb"}
            </button>
          </div>
        </Modal>
      )}
      {editor && (
        <Editor
          key={editor.entry?.id ?? "new"}
          original={editor.entry}
          initialType={editor.type}
          stores={state.stores}
          incomeSources={state.incomeSources}
          originalPayslip={state.payslips.find(
            (p) => p.transactionId === editor.entry?.id,
          )}
          onClose={() => setEditor(null)}
          onError={error}
          onSave={async (e, payroll) => {
            await db.saveEntry(e, undefined, undefined, payroll);
            setEditor(null);
            error(
              "\u8a18\u9332\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002",
            );
          }}
        />
      )}
      {overlay?.kind === "weekly" && (
        <Modal
          title={"\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7"}
          onClose={later}
          actions={
            <>
              <button className="secondary" disabled={saving} onClick={later}>
                {"\u3042\u3068\u3067"}
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => save(overlay.prepared)}
              >
                {saving
                  ? "\u4fdd\u5b58\u4e2d\u2026"
                  : "\u30c9\u30e9\u30a4\u30d6\u306b\u4fdd\u5b58"}
              </button>
            </>
          }
        >
          <div className="weekly-symbol">
            <Icon name="download" />
          </div>
          <h3>
            {
              "\u5927\u5207\u306a\u8a18\u9332\u3092\u3001\u7aef\u672b\u306e\u5916\u306b\u3082\u3002"
            }
          </h3>
          <p>
            {
              "\u30b9\u30de\u30db\u3092\u306a\u304f\u3057\u305f\u308a\u30d6\u30e9\u30a6\u30b6\u306e\u30c7\u30fc\u30bf\u3092\u524a\u9664\u3057\u305f\u308a\u3059\u308b\u3068\u3001\u8a18\u9332\u3082\u6d88\u3048\u307e\u3059\u3002\u4eca\u9031\u5206\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u30d5\u30a1\u30a4\u30eb\u306b\u4fdd\u5b58\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
            }
          </p>
          <dl>
            <dt>{"\u6700\u7d42\u4fdd\u5b58"}</dt>
            <dd>{stamp(overlay.prepared.backup.settings.lastExportAt)}</dd>
            <dt>{"\u8a18\u9332\u4ef6\u6570"}</dt>
            <dd>{overlay.prepared.backup.transactions.length + "\u4ef6"}</dd>
          </dl>
          <p className="note">
            {
              "\u300c\u3042\u3068\u3067\u300d\u306f\u3001\u4eca\u65e5\u306e\u6b21\u56de\u8d77\u52d5\u6642\u306b\u3082\u3046\u4e00\u5ea6\u3060\u3051\u6848\u5185\u3057\u307e\u3059\u3002"
            }
          </p>
        </Modal>
      )}
      {overlay?.kind === "confirm-save" && (
        <Modal
          title={"\u4fdd\u5b58\u3067\u304d\u307e\u3057\u305f\u304b\uff1f"}
          onClose={() => setOverlay(null)}
          actions={
            <>
              <button
                className="secondary"
                onClick={() => {
                  setOverlay(null);
                  error(
                    "\u4fdd\u5b58\u306f\u672a\u5b8c\u4e86\u306e\u307e\u307e\u3067\u3059\u3002",
                  );
                }}
              >
                {"\u3044\u3044\u3048"}
              </button>
              <button
                className="primary"
                onClick={() => {
                  const o = overlay;
                  void (async () => {
                    if (o.prepared.countsAsCurrent)
                      await db.markExport(o.method, confirmedTime(o.prepared));
                    setOverlay(null);
                    error(
                      "\u4fdd\u5b58\u3092\u78ba\u8a8d\u3057\u307e\u3057\u305f\u3002",
                    );
                  })().catch((e) => error(errorText(e)));
                }}
              >
                {"\u306f\u3044"}
              </button>
            </>
          }
        >
          <p>
            {overlay.method +
              "\u3067\u4f5c\u6210\u3057\u305f\u30d5\u30a1\u30a4\u30eb\u304c\u3001\u9078\u3093\u3060\u4fdd\u5b58\u5148\u306b\u3042\u308b\u3053\u3068\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002"}
          </p>
          <p className="note">
            {overlay.prepared.countsAsCurrent
              ? "\u300c\u306f\u3044\u300d\u3092\u62bc\u3059\u3068\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u304c\u5b8c\u4e86\u306b\u306a\u308a\u307e\u3059\u3002"
              : "\u904e\u53bb\u306e\u9000\u907f\u30c7\u30fc\u30bf\u306e\u66f8\u304d\u51fa\u3057\u306f\u3001\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u5b8c\u4e86\u306b\u306f\u306a\u308a\u307e\u305b\u3093\u3002"}
          </p>
          <p className="filename">{overlay.prepared.filename}</p>
        </Modal>
      )}
      {overlay?.kind === "retry-save" && (
        <Modal
          title={
            "\u4fdd\u5b58\u65b9\u6cd5\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044"
          }
          onClose={() => setOverlay(null)}
        >
          <p>{overlay.message}</p>
          <div className="stack">
            {overlay.canShare && (
              <button
                className="primary"
                onClick={() => save(overlay.prepared, "share")}
              >
                {"\u5171\u6709\u3057\u3066\u4fdd\u5b58"}
              </button>
            )}
            <button
              className="secondary"
              onClick={() => save(overlay.prepared, "download")}
            >
              {"\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3059\u308b"}
            </button>
          </div>
        </Modal>
      )}
      {overlay?.kind === "import" && (
        <Modal
          title={"\u8aad\u307f\u8fbc\u3080\u5185\u5bb9\u3092\u78ba\u8a8d"}
          onClose={() => setOverlay(null)}
          actions={
            <>
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setOverlay(null)}
              >
                {"\u30ad\u30e3\u30f3\u30bb\u30eb"}
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => {
                  downloadSafety();
                  void replace(overlay.backup);
                }}
              >
                {saving
                  ? "\u8aad\u307f\u8fbc\u307f\u4e2d\u2026"
                  : "\u7f6e\u304d\u63db\u3048\u3066\u8aad\u307f\u8fbc\u3080"}
              </button>
            </>
          }
        >
          <p className="notice">
            {
              "\u73fe\u5728\u306e\u30c7\u30fc\u30bf\u3092\u7f6e\u304d\u63db\u3048\u307e\u3059\u3002\u5b9f\u884c\u524d\u306b\u73fe\u5728\u306e\u72b6\u614b\u3092\u7aef\u672b\u5185\u306b\u9000\u907f\u3057\u3001\u8a18\u9332\u304c\u3042\u308b\u5834\u5408\u306fJSON\u306e\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3082\u958b\u59cb\u3057\u307e\u3059\u3002"
            }
          </p>
          <dl>
            <dt>{"\u5f62\u5f0f"}</dt>
            <dd>{overlay.source}</dd>
          </dl>
          {overlay?.kind === "import" && overlay.source === "CSV" && (
            <section className="panel">
              <h3>
                {
                  "\u5165\u91d1\u5143\u306e\u78ba\u8a8d\u30fb\u540d\u524d\u4fee\u6b63"
                }
              </h3>
              {(overlay.backup.incomeSources ?? []).map((source) => (
                <label key={source.id}>
                  {overlay.backup.transactions.filter(
                    (e) => e.incomeSourceId === source.id,
                  ).length + "\u4ef6"}
                  <input
                    value={source.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setOverlay({
                        ...overlay,
                        backup: {
                          ...overlay.backup,
                          incomeSources: overlay.backup.incomeSources!.map(
                            (s) => (s.id === source.id ? { ...s, name } : s),
                          ),
                        },
                      });
                    }}
                  />
                </label>
              ))}
            </section>
          )}
          <dl>
            <dt>{"\u8a18\u9332"}</dt>
            <dd>{overlay.backup.transactions.length + "\u4ef6"}</dd>
            <dt>{"\u671f\u9593"}</dt>
            <dd>{backupPeriod(overlay.backup)}</dd>
            <dt>{"\u7d66\u4e0e\u660e\u7d30"}</dt>
            <dd>{(overlay.backup.payslips?.length ?? 0) + "\u4ef6"}</dd>
            <dt>{"\u5165\u91d1\u5143"}</dt>
            <dd>{(overlay.backup.incomeSources?.length ?? 0) + "\u4ef6"}</dd>
            <dt>{"\u7dcf\u8cc7\u7523"}</dt>
            <dd>{yen(assets(overlay.backup.transactions))}</dd>
            <dt>{"\u5b9a\u671f\u652f\u6255"}</dt>
            <dd>{overlay.backup.recurringPayments.length + "\u4ef6"}</dd>
            <dt>{"\u7121\u8996\u3057\u305f\u7a7a\u884c"}</dt>
            <dd>{overlay.blank + "\u884c"}</dd>
            <dt>{"\u8aad\u307f\u8fbc\u3081\u306a\u3044\u884c"}</dt>
            <dd>{overlay.skipped.length + "\u884c"}</dd>
          </dl>
          {overlay.backup.schemaVersion === 1 && (
            <p className="notice">
              {
                "\u3053\u306e\u30d5\u30a1\u30a4\u30eb\u306b\u7d66\u4e0e\u660e\u7d30\u30fb\u5165\u91d1\u5143\u30fb\u76ee\u5b89\u984d\u306f\u542b\u307e\u308c\u307e\u305b\u3093\u3002\u73fe\u5728\u306e\u7d66\u4e0e\u30c7\u30fc\u30bf\u3082\u7f6e\u304d\u63db\u308f\u308a\u307e\u3059\u3002\u5fc5\u8981\u306a\u3089\u5148\u306bJSON\u3092\u4fdd\u5b58\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
              }
            </p>
          )}
          {overlay.skipped.length > 0 && (
            <details open>
              <summary>
                {"\u30b9\u30ad\u30c3\u30d7\u3059\u308b\u884c\u3068\u7406\u7531"}
              </summary>
              <ul>
                {overlay.skipped.map((s) => (
                  <li key={s.row}>{s.row + "\u884c\u76ee: " + s.reason}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="note">
            {
              "\u5b9a\u671f\u652f\u6255\u306e\u672a\u4f5c\u6210\u6708\u306f\u3001\u8aad\u307f\u8fbc\u307f\u5f8c\u306b\u81ea\u52d5\u3067\u8ffd\u52a0\u3057\u307e\u3059\u3002"
            }
          </p>
        </Modal>
      )}
      {overlay?.kind === "restore" && (
        <Modal
          title={
            "\u3053\u306e\u72b6\u614b\u306b\u623b\u3057\u307e\u3059\u304b\uff1f"
          }
          onClose={() => setOverlay(null)}
          actions={
            <>
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setOverlay(null)}
              >
                {"\u30ad\u30e3\u30f3\u30bb\u30eb"}
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() =>
                  void replace({ ...overlay.snapshot.data, snapshots: [] })
                }
              >
                {"\u3053\u306e\u72b6\u614b\u306b\u623b\u3059"}
              </button>
            </>
          }
        >
          <p>
            {stamp(overlay.snapshot.createdAt) +
              " \u00b7 " +
              overlay.snapshot.data.transactions.length +
              "\u4ef6"}
          </p>
          <p>
            {
              "\u73fe\u5728\u306e\u72b6\u614b\u3092\u8aad\u307f\u8fbc\u307f\u524d\u306e\u9000\u907f\u30c7\u30fc\u30bf\u3068\u3057\u3066\u4fdd\u5b58\u3057\u3066\u304b\u3089\u623b\u3057\u307e\u3059\u3002\u5b9a\u671f\u652f\u6255\u306e\u672a\u4f5c\u6210\u6708\u306f\u88dc\u3044\u307e\u3059\u3002"
            }
          </p>
        </Modal>
      )}
    </div>
  );
}
