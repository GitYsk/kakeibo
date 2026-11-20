import { useState } from "react";
import { db } from "./db.ts";
import {
  PAYMENTS,
  PAYMENT_LABEL,
  payslipTotals,
  safeSum,
  type State,
  type Entry,
  type Payslip,
  type RecordFilter,
} from "./core.ts";
import type { ReactNode } from "react";
const blank = (): RecordFilter => ({
  parties: [],
  payments: [],
  payroll: [],
  installments: false,
  adjustments: true,
  from: "",
  to: "",
});
const yen = (n: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    n,
  );
export function RecordList({
  state,
  renderEntry,
  onPayslip,
}: {
  state: State;
  renderEntry: (e: Entry) => ReactNode;
  onPayslip: (p: Payslip) => void;
}) {
  const [view, setView] = useState(state.settings.recordView ?? "EXPENSE");
  const [filters, setFilters] = useState<Record<string, RecordFilter>>({
    EXPENSE: blank(),
    INCOME: blank(),
    ...state.settings.recordFilters,
  });
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const f = filters[view];
  const save = (next: typeof filters, v = view) => {
    setFilters(next);
    void db.patchSettings({ recordView: v, recordFilters: next });
  };
  const change = (patch: Partial<RecordFilter>) =>
    save({ ...filters, [view]: { ...f, ...patch } });
  const toggle = (field: "parties" | "payments" | "payroll", id: string) =>
    change({
      [field]: f[field].includes(id)
        ? f[field].filter((x) => x !== id)
        : [...f[field], id],
    });
  const within = (date: string) =>
    (!f.from || date >= f.from) && (!f.to || date <= f.to);
  const rows: {
    date: string;
    amount: number;
    key: string;
    entry?: Entry;
    slip?: Payslip;
  }[] = state.entries
    .filter(
      (e) =>
        (view === "EXPENSE"
          ? e.type === "EXPENSE" || e.type === "ADJUST_EXPENSE"
          : e.type === "INCOME" || e.type === "ADJUST_INCOME") &&
        (f.adjustments || !e.type.startsWith("ADJUST")) &&
        within(e.date) &&
        e.description.toLowerCase().includes(query.toLowerCase()) &&
        (!f.parties.length ||
          f.parties.includes(
            String((view === "EXPENSE" ? e.storeId : e.incomeSourceId) ?? ""),
          )) &&
        (view !== "EXPENSE" ||
          ((!f.payments.length || f.payments.includes(e.paymentMethod)) &&
            (!f.installments || e.installments > 1))) &&
        (view !== "INCOME" ||
          !f.payroll.length ||
          f.payroll.includes(
            state.payslips.some((p) => p.transactionId === e.id) ? "YES" : "NO",
          )),
    )
    .map((entry) => ({
      date: entry.date,
      amount: entry.amount,
      key: "entry-" + entry.id,
      entry,
    }));
  if (view === "INCOME" && (!f.payroll.length || f.payroll.includes("ONLY"))) {
    for (const p of state.payslips.filter(
      (p) =>
        p.transactionId === null &&
        within(p.payDate) &&
        (!f.parties.length || f.parties.includes(String(p.incomeSourceId))) &&
        [
          p.memo,
          p.workPeriod,
          state.incomeSources.find((s) => s.id === p.incomeSourceId)?.name ??
            "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    ))
      rows.push({
        date: p.payDate,
        amount: payslipTotals(p).taxable,
        key: "slip-" + p.id,
        slip: p,
      });
  }
  rows.sort(
    (a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key),
  );
  const count =
    f.parties.length +
    f.payments.length +
    f.payroll.length +
    Number(f.installments) +
    Number(!f.adjustments) +
    Number(!!f.from) +
    Number(!!f.to);
  let previous = "";
  return (
    <>
      <div className="segmented" aria-label={"\u8a18\u9332\u306e\u7a2e\u985e"}>
        {(["EXPENSE", "INCOME"] as const).map((v) => (
          <button
            key={v}
            aria-pressed={view === v}
            className={view === v ? "selected" : ""}
            onClick={() => {
              setView(v);
              setLimit(100);
              save(filters, v);
            }}
          >
            {v === "EXPENSE" ? "\u51fa\u8cbb" : "\u5165\u91d1"}
          </button>
        ))}
      </div>
      <label>
        <span className="sr-only">{"\u5185\u5bb9\u3092\u691c\u7d22"}</span>
        <input
          type="search"
          placeholder={"\u5185\u5bb9\u3092\u691c\u7d22"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(100);
          }}
        />
      </label>
      <details className="filter-panel">
        <summary>
          {"\u7d5e\u308a\u8fbc\u307f" +
            (count ? "\uff08" + count + "\uff09" : "")}
        </summary>
        <button className="secondary wide" onClick={() => change(blank())}>
          {"\u3059\u3079\u3066\u89e3\u9664"}
        </button>
        <fieldset>
          <legend>
            {view === "EXPENSE"
              ? "\u8cfc\u5165\u5148\u3067\u7d5e\u308a\u8fbc\u307f"
              : "\u5165\u91d1\u5143\u3067\u7d5e\u308a\u8fbc\u307f"}
          </legend>
          {[
            { id: "", name: "\u672a\u8a2d\u5b9a" },
            ...(view === "EXPENSE" ? state.stores : state.incomeSources),
          ].map((p) => (
            <label className="check" key={p.id}>
              <input
                type="checkbox"
                checked={f.parties.includes(String(p.id))}
                onChange={() => toggle("parties", String(p.id))}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        {view === "EXPENSE" ? (
          <>
            <fieldset>
              <legend>
                {"\u652f\u6255\u65b9\u6cd5\u3067\u7d5e\u308a\u8fbc\u307f"}
              </legend>
              {PAYMENTS.map((p) => (
                <label className="check" key={p}>
                  <input
                    type="checkbox"
                    checked={f.payments.includes(p)}
                    onChange={() => toggle("payments", p)}
                  />
                  {PAYMENT_LABEL[p]}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                checked={f.installments}
                onChange={(e) => change({ installments: e.target.checked })}
              />
              {"\u5206\u5272\u6255\u3044\u306e\u307f"}
            </label>
          </>
        ) : (
          <fieldset>
            <legend>{"\u7d66\u4e0e\u660e\u7d30\u306e\u6709\u7121"}</legend>
            {[
              ["YES", "\u660e\u7d30\u3042\u308a"],
              ["NO", "\u660e\u7d30\u306a\u3057"],
              ["ONLY", "\u660e\u7d30\u306e\u307f"],
            ].map(([id, label]) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={f.payroll.includes(id)}
                  onChange={() => toggle("payroll", id)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={f.adjustments}
            onChange={(e) => change({ adjustments: e.target.checked })}
          />
          {"\u8abf\u6574\u3092\u542b\u3081\u308b"}
        </label>
        <label>
          {"\u671f\u9593\u306e\u958b\u59cb"}
          <input
            type="date"
            value={f.from}
            onChange={(e) => change({ from: e.target.value })}
          />
        </label>
        <label>
          {"\u671f\u9593\u306e\u7d42\u4e86"}
          <input
            type="date"
            value={f.to}
            onChange={(e) => change({ to: e.target.value })}
          />
        </label>
      </details>
      <p className="muted">{rows.length + "\u4ef6\u306e\u8a18\u9332"}</p>
      {rows.slice(0, limit).map((row) => {
        const month = row.date.slice(0, 7),
          heading = month !== previous;
        previous = month;
        return (
          <div key={row.key}>
            {heading && (
              <h2 className="month-heading">
                {month +
                  " \u00b7 " +
                  yen(
                    safeSum(
                      rows
                        .filter((r) => r.date.startsWith(month) && r.entry)
                        .map((r) => r.amount),
                    ),
                  )}
              </h2>
            )}
            {row.entry ? (
              <>
                {renderEntry(row.entry)}
                <p className="note">
                  {row.entry.type.startsWith("ADJUST")
                    ? "\u8abf\u6574"
                    : view === "INCOME"
                      ? state.payslips.some(
                          (p) => p.transactionId === row.entry!.id,
                        )
                        ? "\u7d66\u4e0e\u660e\u7d30\u3042\u308a"
                        : "\u7d66\u4e0e\u660e\u7d30\u306a\u3057"
                      : ""}
                </p>
              </>
            ) : (
              <button
                className="payslip-card"
                onClick={() => onPayslip(row.slip!)}
              >
                <strong>
                  {
                    state.incomeSources.find(
                      (s) => s.id === row.slip!.incomeSourceId,
                    )?.name
                  }
                </strong>
                <span>{row.date + " \u00b7 " + yen(row.amount)}</span>
                <span>
                  {
                    "\u660e\u7d30\u306e\u307f \u00b7 \u8ab2\u7a0e\u652f\u7d66\u984d"
                  }
                </span>
                <small>
                  {
                    "\u7dcf\u8cc7\u7523\u306b\u306f\u542b\u307e\u308c\u307e\u305b\u3093"
                  }
                </small>
              </button>
            )}
          </div>
        );
      })}
      {!rows.length && (
        <p className="empty">
          {
            "\u8a72\u5f53\u3059\u308b\u8a18\u9332\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
          }
        </p>
      )}
      {rows.length > limit && (
        <button
          className="secondary wide"
          onClick={() => setLimit(limit + 100)}
        >
          {"\u3055\u3089\u306b100\u4ef6\u3092\u8868\u793a"}
        </button>
      )}
    </>
  );
}
