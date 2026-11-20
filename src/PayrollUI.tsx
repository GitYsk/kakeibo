import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Modal } from "./Modal.tsx";
import { db } from "./db.ts";
import {
  PAY_FIELDS,
  PAY_LABEL,
  emptyPayslip,
  payslipTotals,
  annualSalary,
  missingSalaryEntries,
  salaryCsv,
  addMonths,
  tokyoDate,
  amount,
  validDate,
  type Payslip,
  type Employer,
  type State,
  type Entry,
  type PayField,
} from "./core.ts";
import { beginSave, type Prepared } from "./backup.ts";
const yen = (n: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(n);
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "\u51e6\u7406\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002";
export type SlipDraft = Omit<Payslip, PayField | "employerId"> &
  Record<PayField, string> & { employerId: string; periodTouched: boolean };
export function slipDraft(p: Payslip = emptyPayslip()): SlipDraft {
  return {
    ...p,
    ...(Object.fromEntries(
      PAY_FIELDS.map((key) => [key, String(p[key])]),
    ) as Record<PayField, string>),
    employerId: p.employerId ? String(p.employerId) : "",
    periodTouched: !!p.id,
  } as SlipDraft;
}
export function readSlipDraft(d: SlipDraft): Payslip {
  for (const key of PAY_FIELDS) {
    if (!/^\d+$/.test(d[key] || "0"))
      throw new Error(
        "\u7d66\u4e0e\u306e\u91d1\u984d\u306f0\u4ee5\u4e0a\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
      );
    amount(Number(d[key] || "0"));
  }
  const { periodTouched: _, ...data } = d;
  return {
    ...data,
    ...(Object.fromEntries(
      PAY_FIELDS.map((key) => [key, Number(d[key] || "0")]),
    ) as Record<PayField, number>),
    employerId: Number(d.employerId),
  } as Payslip;
}
export function PayslipFields({
  draft,
  onChange,
  employers,
  incomeAmount,
  onMatch,
}: {
  draft: SlipDraft;
  onChange: Dispatch<SetStateAction<SlipDraft>>;
  employers: Employer[];
  incomeAmount?: number | null;
  onMatch?: (n: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  let total: ReturnType<typeof payslipTotals> | null = null;
  try {
    total = payslipTotals(readSlipDraft(draft));
  } catch {}
  const field = (key: PayField) => (
    <label key={key}>
      {PAY_LABEL[key]}
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft[key]}
        placeholder="0"
        onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="payroll-fields">
      <h3>{"\u7d66\u4e0e\u660e\u7d30"}</h3>
      <label>
        {"\u52e4\u52d9\u5148"}
        <select
          value={draft.employerId}
          onChange={(e) => {
            if (e.target.value === "add") setAdding(true);
            else onChange({ ...draft, employerId: e.target.value });
          }}
        >
          <option value="">
            {"\u9078\u3093\u3067\u304f\u3060\u3055\u3044"}
          </option>
          {employers
            .filter((e) => !e.hidden || String(e.id) === draft.employerId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          <option value="add">
            {"\uff0b \u65b0\u3057\u3044\u52e4\u52d9\u5148\u3092\u8ffd\u52a0"}
          </option>
        </select>
      </label>
      {adding && (
        <div className="inline-add">
          <label>
            {"\u65b0\u3057\u3044\u52e4\u52d9\u5148"}
            <input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void db
                .addEmployer(name)
                .then((id) => {
                  onChange((current) => ({
                    ...current,
                    employerId: String(id),
                  }));
                  setAdding(false);
                  setName("");
                  setError("");
                })
                .catch((e) => setError(errorText(e)));
            }}
          >
            {"\u8ffd\u52a0\u3057\u3066\u9078\u629e"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
      <label>
        {"\u652f\u7d66\u65e5"}
        <input
          type="date"
          min="1900-01-01"
          max="2200-12-31"
          value={draft.payDate}
          onChange={(e) => {
            const date = e.target.value;
            onChange({
              ...draft,
              payDate: date,
              workPeriod:
                !draft.periodTouched && validDate(date)
                  ? addMonths(date.slice(0, 7), -1)
                  : draft.workPeriod,
            });
          }}
        />
      </label>
      <label>
        {"\u5bfe\u8c61\u671f\u9593"}
        <input
          value={draft.workPeriod}
          maxLength={200}
          onChange={(e) =>
            onChange({
              ...draft,
              workPeriod: e.target.value,
              periodTouched: true,
            })
          }
        />
      </label>
      {field("basePay")}
      {field("commuteAllowance")}
      {field("incomeTax")}
      <details className="payroll-details">
        <summary>{"\u652f\u7d66\u30fb\u63a7\u9664\u306e\u8a73\u7d30"}</summary>
        <h4>{"\u652f\u7d66"}</h4>
        {field("overtimePay")}
        {field("otherTaxablePay")}
        {field("otherNonTaxablePay")}
        <h4>{"\u63a7\u9664"}</h4>
        {(
          [
            "healthInsurance",
            "pensionInsurance",
            "employmentInsurance",
            "residentTax",
            "otherDeductions",
          ] as PayField[]
        ).map(field)}
      </details>
      <label>
        {"\u7d66\u4e0e\u30e1\u30e2"}
        <textarea
          value={draft.memo}
          maxLength={10000}
          onChange={(e) => onChange({ ...draft, memo: e.target.value })}
        />
      </label>
      {total ? (
        <>
          <dl className="pay-totals">
            <dt>{"\u8ab2\u7a0e\u652f\u7d66\u984d"}</dt>
            <dd>{yen(total.taxable)}</dd>
            <dt>{"\u7dcf\u652f\u7d66\u984d"}</dt>
            <dd>{yen(total.gross)}</dd>
            <dt>{"\u63a7\u9664\u5408\u8a08"}</dt>
            <dd>{yen(total.deductions)}</dd>
            <dt>
              {"\u5dee\u5f15\u652f\u7d66\u984d\uff08\u624b\u53d6\u308a\uff09"}
            </dt>
            <dd>{yen(total.net)}</dd>
          </dl>
          {incomeAmount !== undefined && total.net !== incomeAmount && (
            <div className="notice" role="alert">
              <strong>
                {
                  "\u5dee\u5f15\u652f\u7d66\u984d\u3068\u5165\u91d1\u984d\u304c\u4e00\u81f4\u3057\u307e\u305b\u3093\u3002"
                }
              </strong>
              <p>
                {"\u4fdd\u5b58\u306f\u53ef\u80fd\u3067\u3059\u3002\u5165\u91d1\u984d " +
                  (incomeAmount === null
                    ? "\u672a\u5165\u529b"
                    : yen(incomeAmount)) +
                  " / \u624b\u53d6\u308a " +
                  yen(total.net)}
              </p>
              {onMatch && total.net >= 0 && (
                <button
                  type="button"
                  className="secondary wide"
                  onClick={() => onMatch(total.net)}
                >
                  {
                    "\u5165\u91d1\u984d\u3092\u5dee\u5f15\u652f\u7d66\u984d\u306b\u5408\u308f\u305b\u308b"
                  }
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="error" role="alert">
          {
            "\u7d66\u4e0e\u306e\u91d1\u984d\u306f0\u4ee5\u4e0a\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
          }
        </p>
      )}
    </section>
  );
}
export function StandalonePayslipEditor({
  original,
  employers,
  onClose,
  onError,
}: {
  original: Payslip | null;
  employers: Employer[];
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [draft, setDraft] = useState(() =>
    slipDraft(original ?? emptyPayslip()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    try {
      await db.saveStandalonePayslip(readSlipDraft(draft));
      onClose();
      onError(
        "\u7d66\u4e0e\u660e\u7d30\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        original
          ? "\u7d66\u4e0e\u660e\u7d30\u3092\u7de8\u96c6"
          : "\u660e\u7d30\u306e\u307f\u767b\u9332"
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
              : "\u660e\u7d30\u3092\u4fdd\u5b58"}
          </button>
        </>
      }
    >
      <p className="notice">
        {
          "\u660e\u7d30\u306e\u307f\u306e\u767b\u9332\u3067\u3059\u3002\u7dcf\u8cc7\u7523\u3084\u6708\u9593\u53ce\u5165\u306f\u5909\u308f\u308a\u307e\u305b\u3093\u3002\u5e74\u9593\u7d66\u4e0e\u306b\u306f\u542b\u307e\u308c\u307e\u3059\u3002"
        }
      </p>
      <PayslipFields draft={draft} onChange={setDraft} employers={employers} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {original && (
        <button
          className="danger-text wide"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                "\u7d66\u4e0e\u660e\u7d30\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f \u5165\u91d1\u8a18\u9332\u306f\u5909\u66f4\u3057\u307e\u305b\u3093\u3002",
              )
            )
              void db
                .deletePayslip(original.id!)
                .then(onClose)
                .catch((e) => setError(errorText(e)));
          }}
        >
          {"\u3053\u306e\u660e\u7d30\u3092\u524a\u9664"}
        </button>
      )}
    </Modal>
  );
}
export function PayrollYear({
  state,
  year,
  onNew,
  onEdit,
  onMissing,
}: {
  state: State;
  year: number;
  onNew: () => void;
  onEdit: (p: Payslip) => void;
  onMissing: (e: Entry[]) => void;
}) {
  const value = annualSalary(state.payslips, state.employers, year);
  const missing = missingSalaryEntries(
    state.entries,
    state.payslips,
    state.employers,
    year,
  );
  const csv = useMemo(
    () =>
      new Blob([salaryCsv(state.payslips, state.employers, year)], {
        type: "text/csv;charset=utf-8",
      }),
    [state.payslips, state.employers, year],
  );
  const save = () => {
    const url = URL.createObjectURL(csv);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kakeibo_salary_" + year + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return (
    <section className="payroll-year">
      <div className="section-heading">
        <h2>{"\u7d66\u4e0e"}</h2>
        <span className="muted">
          {year + "\u5e74\u30fb\u652f\u7d66\u65e5\u57fa\u6e96"}
        </span>
      </div>
      <div className="salary-hero">
        <p>
          {
            "\u5e74\u9593\u7dcf\u7d66\u4e0e\uff08\u8ab2\u7a0e\u652f\u7d66\u984d\uff09"
          }
        </p>
        <strong data-testid="salary-taxable">{yen(value.taxable)}</strong>
        <p className="note">
          {
            "\u975e\u8ab2\u7a0e\u652f\u7d66\u3092\u542b\u3081\u305a\u3001\u652f\u7d66\u65e5\u306e\u5e74\u3067\u96c6\u8a08\u3057\u307e\u3059\u3002\u5bb6\u8a08\u306e\u8a08\u4e0a\u57fa\u6e96\u306f\u5f71\u97ff\u3057\u307e\u305b\u3093\u3002"
          }
        </p>
      </div>
      <dl className="salary-breakdown">
        <dt>
          {
            "\u7dcf\u652f\u7d66\u984d\uff08\u975e\u8ab2\u7a0e\u5206\u3092\u542b\u3080\uff09"
          }
        </dt>
        <dd>{yen(value.gross)}</dd>
        <dt>{"\u975e\u8ab2\u7a0e\u652f\u7d66"}</dt>
        <dd>{yen(value.nonTaxable)}</dd>
        <dt>{"\u793e\u4f1a\u4fdd\u967a\u6599"}</dt>
        <dd>{yen(value.social)}</dd>
        <dt>
          {"\u6240\u5f97\u7a0e\uff08\u6e90\u6cc9\u5fb4\u53ce\u7a0e\u984d\uff09"}
        </dt>
        <dd>{yen(value.incomeTax)}</dd>
        <dt>{"\u4f4f\u6c11\u7a0e"}</dt>
        <dd>{yen(value.residentTax)}</dd>
        <dt>
          {"\u5dee\u5f15\u652f\u7d66\u984d\uff08\u624b\u53d6\u308a\uff09"}
        </dt>
        <dd>{yen(value.net)}</dd>
      </dl>
      {state.settings.salaryTargets.map((target) => {
        const remaining = target.amount - value.taxable;
        return (
          <div className="salary-target" key={target.id}>
            <strong>{target.name}</strong>
            <p>
              {"\u76ee\u5b89 " +
                yen(target.amount) +
                " \u00b7 " +
                (remaining > 0
                  ? "\u3042\u3068 " + yen(remaining)
                  : "\u5230\u9054\u6e08\u307f\u30fb\u8d85\u904e " +
                    yen(-remaining))}
            </p>
            <progress
              max={100}
              value={
                target.amount > 0
                  ? Math.min(100, (value.taxable / target.amount) * 100)
                  : 100
              }
              aria-label={target.name + "\u306e\u9032\u6357"}
            />
          </div>
        );
      })}
      <p className="note">
        {
          "\u767b\u9332\u3057\u305f\u7d66\u4e0e\u660e\u7d30\u3060\u3051\u306e\u96c6\u8a08\u3067\u3059\u3002\u672a\u767b\u9332\u5206\u306f\u542b\u307e\u308c\u307e\u305b\u3093\u3002"
        }
      </p>
      {missing.length > 0 && (
        <button className="notice wide" onClick={() => onMissing(missing)}>
          {"\u7d66\u4e0e\u306e\u53ef\u80fd\u6027\u304c\u3042\u308b\u5165\u91d1 " +
            missing.length +
            "\u4ef6\u306b\u660e\u7d30\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u78ba\u8a8d\u3059\u308b"}
        </button>
      )}
      <div className="button-row">
        <button className="primary" onClick={onNew}>
          {"\u660e\u7d30\u306e\u307f\u767b\u9332"}
        </button>
        <button className="secondary" onClick={save}>
          {"\u7d66\u4e0e\u96c6\u8a08\u3092CSV\u3067\u4fdd\u5b58"}
        </button>
      </div>
      <h3 className="pay-subheading">
        {"\u52e4\u52d9\u5148\u5225\u306e\u5185\u8a33"}
      </h3>
      {!value.employers.length && (
        <p className="muted">
          {
            "\u3053\u306e\u5e74\u306e\u7d66\u4e0e\u660e\u7d30\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
          }
        </p>
      )}
      {value.employers.map((e) => (
        <div className="employer-summary" key={e.id}>
          <strong>{e.name}</strong>
          <p>
            {"\u5e74\u9593\u7dcf\u7d66\u4e0e " +
              yen(e.taxable) +
              " / \u6240\u5f97\u7a0e " +
              yen(e.incomeTax)}
          </p>
        </div>
      ))}
      <h3 className="pay-subheading">
        {"\u6708\u5225\u306e\u7d66\u4e0e\u660e\u7d30"}
      </h3>
      <p className="note">
        {
          "\u6708\u3092\u30bf\u30c3\u30d7\u3059\u308b\u3068\u660e\u7d30\u3092\u958b\u3051\u307e\u3059\u3002"
        }
      </p>
      <div className="salary-month-head">
        <span>{"\u6708"}</span>
        <span>{"\u8ab2\u7a0e\u652f\u7d66\u984d"}</span>
        <span>{"\u6240\u5f97\u7a0e"}</span>
        <span>{"\u624b\u53d6\u308a"}</span>
      </div>
      {value.months.map((m) => (
        <details key={m.month} className="salary-month">
          <summary>
            <span>{Number(m.month.slice(5))}</span>
            <span>{yen(m.taxable)}</span>
            <span>{yen(m.incomeTax)}</span>
            <span>{yen(m.net)}</span>
          </summary>
          {!m.slips.length && (
            <p className="note">
              {
                "\u3053\u306e\u6708\u306e\u660e\u7d30\u306f\u3042\u308a\u307e\u305b\u3093\u3002"
              }
            </p>
          )}
          {m.slips.map((p) => (
            <button
              key={p.id}
              className="payslip-card"
              onClick={() => onEdit(p)}
            >
              <strong>
                {state.employers.find((e) => e.id === p.employerId)?.name ??
                  "\u52e4\u52d9\u5148\u672a\u8a2d\u5b9a"}
              </strong>
              <span>{p.payDate + " \u00b7 " + p.workPeriod}</span>
              <span>
                {"\u8ab2\u7a0e " +
                  yen(payslipTotals(p).taxable) +
                  " / \u624b\u53d6\u308a " +
                  yen(payslipTotals(p).net)}
              </span>
              <small>
                {p.transactionId === null
                  ? "\u660e\u7d30\u306e\u307f"
                  : "\u5165\u91d1\u3068\u95a2\u9023\u4ed8\u3051\u6e08\u307f"}
              </small>
            </button>
          ))}
        </details>
      ))}
    </section>
  );
}
export function PayrollSettings({
  state,
  onBusy,
  onError,
}: {
  state: State;
  onBusy: (v: boolean) => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [employer, setEmployer] = useState<Employer | null>(null);
  const [rename, setRename] = useState("");
  const [target, setTarget] = useState<{
    id?: string;
    name: string;
    amount: string;
  } | null>(null);
  useEffect(() => {
    onBusy(!!employer || !!target);
    return () => onBusy(false);
  }, [employer, target]);
  const run = (job: () => Promise<unknown>) =>
    void job().catch((e) => onError(errorText(e)));
  return (
    <>
      <section className="panel">
        <h2>{"\u52e4\u52d9\u5148"}</h2>
        <div className="inline-field">
          <input
            aria-label={"\u8ffd\u52a0\u3059\u308b\u52e4\u52d9\u5148"}
            placeholder={"\u65b0\u3057\u3044\u52e4\u52d9\u5148"}
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await db.addEmployer(name);
                setName("");
              })
            }
          >
            {"\u8ffd\u52a0"}
          </button>
        </div>
        {state.employers.map((e, i) => (
          <div className="store-row" key={e.id}>
            <strong>
              {e.name + (e.hidden ? " \u00b7 \u975e\u8868\u793a" : "")}
            </strong>
            <div className="store-actions">
              <button
                aria-label={e.name + "\u3092\u4e0a\u3078"}
                disabled={i === 0}
                onClick={() => run(() => db.moveEmployer(e.id!, -1))}
              >
                {"\u4e0a\u3078"}
              </button>
              <button
                aria-label={e.name + "\u3092\u4e0b\u3078"}
                disabled={i === state.employers.length - 1}
                onClick={() => run(() => db.moveEmployer(e.id!, 1))}
              >
                {"\u4e0b\u3078"}
              </button>
              <button
                onClick={() => {
                  setEmployer(e);
                  setRename(e.name);
                }}
              >
                {"\u540d\u79f0"}
              </button>
              <button onClick={() => run(() => db.toggleEmployer(e.id!))}>
                {e.hidden ? "\u8868\u793a" : "\u96a0\u3059"}
              </button>
              <button
                className="danger-text"
                onClick={() => {
                  if (
                    confirm(
                      "\u672a\u4f7f\u7528\u306e\u52e4\u52d9\u5148\u300c" +
                        e.name +
                        "\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f",
                    )
                  )
                    run(() => db.deleteEmployer(e.id!));
                }}
              >
                {"\u524a\u9664"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{"\u7d66\u4e0e\u306e\u76ee\u5b89\u984d"}</h2>
        <p className="note">
          {
            "\u3054\u81ea\u8eab\u3067\u8a2d\u5b9a\u3057\u305f\u91d1\u984d\u3068\u5e74\u9593\u7dcf\u7d66\u4e0e\u3092\u6bd4\u8f03\u3057\u307e\u3059\u3002\u7a0e\u5236\u4e0a\u306e\u57fa\u6e96\u984d\u3084\u5224\u5b9a\u306f\u7d44\u307f\u8fbc\u3093\u3067\u3044\u307e\u305b\u3093\u3002"
          }
        </p>
        {state.settings.salaryTargets.map((t) => (
          <div className="store-row" key={t.id}>
            <strong>{t.name + " \u00b7 " + yen(t.amount)}</strong>
            <div className="button-row">
              <button
                className="secondary"
                onClick={() => setTarget({ ...t, amount: String(t.amount) })}
              >
                {"\u7de8\u96c6"}
              </button>
              <button
                className="danger-text"
                onClick={() => {
                  if (
                    confirm(
                      "\u3053\u306e\u76ee\u5b89\u984d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f",
                    )
                  )
                    run(() =>
                      db.patchSettings({
                        salaryTargets: state.settings.salaryTargets.filter(
                          (x) => x.id !== t.id,
                        ),
                      }),
                    );
                }}
              >
                {"\u524a\u9664"}
              </button>
            </div>
          </div>
        ))}
        <button
          className="secondary wide"
          onClick={() => setTarget({ name: "", amount: "" })}
        >
          {"\u76ee\u5b89\u984d\u3092\u8ffd\u52a0"}
        </button>
      </section>
      {employer && (
        <Modal
          title={"\u52e4\u52d9\u5148\u306e\u540d\u524d\u3092\u5909\u66f4"}
          onClose={() => setEmployer(null)}
          actions={
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  await db.renameEmployer(employer.id!, rename);
                  setEmployer(null);
                })
              }
            >
              {"\u5909\u66f4\u3092\u4fdd\u5b58"}
            </button>
          }
        >
          <label>
            {"\u52e4\u52d9\u5148\u306e\u540d\u524d"}
            <input
              value={rename}
              maxLength={200}
              onChange={(e) => setRename(e.target.value)}
            />
          </label>
          <p className="note">
            {
              "\u904e\u53bb\u306e\u7d66\u4e0e\u660e\u7d30\u306b\u3082\u65b0\u3057\u3044\u540d\u524d\u304c\u8868\u793a\u3055\u308c\u307e\u3059\u3002"
            }
          </p>
        </Modal>
      )}
      {target && (
        <Modal
          title={"\u7d66\u4e0e\u306e\u76ee\u5b89\u984d"}
          onClose={() => setTarget(null)}
          actions={
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  if (!/^\d+$/.test(target.amount))
                    throw new Error(
                      "\u91d1\u984d\u306f0\u4ee5\u4e0a\u306e\u6574\u6570\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
                    );
                  const row = {
                    id: target.id ?? crypto.randomUUID(),
                    name: target.name,
                    amount: Number(target.amount),
                  };
                  await db.patchSettings({
                    salaryTargets: [
                      ...state.settings.salaryTargets.filter(
                        (t) => t.id !== row.id,
                      ),
                      row,
                    ],
                  });
                  setTarget(null);
                })
              }
            >
              {"\u76ee\u5b89\u984d\u3092\u4fdd\u5b58"}
            </button>
          }
        >
          <label>
            {"\u76ee\u5b89\u984d\u306e\u540d\u524d"}
            <input
              value={target.name}
              maxLength={200}
              onChange={(e) => setTarget({ ...target, name: e.target.value })}
            />
          </label>
          <label>
            {"\u76ee\u5b89\u984d\uff08\u5186\uff09"}
            <input
              inputMode="numeric"
              value={target.amount}
              onChange={(e) => setTarget({ ...target, amount: e.target.value })}
            />
          </label>
        </Modal>
      )}
    </>
  );
}
export function RecoveryScreen({
  message,
  prepared,
}: {
  message: string;
  prepared: Prepared | null;
}) {
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [retry, setRetry] = useState(false);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = (method: "auto" | "share" | "download" = "auto") => {
    if (!prepared) return;
    setBusy(true);
    void beginSave(prepared, method)
      .then((result) => {
        setConfirming(result.kind === "confirm");
        setRetry(result.kind === "retry");
        if (result.kind === "retry") {
          setShare(result.canShare);
          setStatus(result.message);
        } else
          setStatus(
            result.kind === "saved"
              ? "\u5fa9\u65e7\u7528\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002"
              : result.kind === "cancelled"
                ? "\u4fdd\u5b58\u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f\u3002"
                : result.kind === "confirm"
                  ? "\u4fdd\u5b58\u5148\u306b\u30d5\u30a1\u30a4\u30eb\u304c\u3042\u308b\u3053\u3068\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
                  : "",
          );
      })
      .catch((e) => setStatus(errorText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <main className="app fatal">
      <h1>
        {
          "\u30c7\u30fc\u30bf\u3092\u958b\u3051\u307e\u305b\u3093\u3067\u3057\u305f"
        }
      </h1>
      <p>{message}</p>
      <p>
        {
          "\u65e2\u5b58\u306e\u8a18\u9332\u3092\u521d\u671f\u5316\u305b\u305a\u3001\u51e6\u7406\u3092\u505c\u6b62\u3057\u307e\u3057\u305f\u3002\u30d6\u30e9\u30a6\u30b6\u306e\u30c7\u30fc\u30bf\u3092\u6d88\u3055\u305a\u306b\u3001\u5fa9\u65e7\u7528\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
        }
      </p>
      {prepared ? (
        <>
          <p>
            {"\u5fa9\u65e7\u30c7\u30fc\u30bf: " +
              prepared.backup.transactions.length +
              "\u4ef6\u306e\u8a18\u9332"}
          </p>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => save()}
          >
            {
              "\u5fa9\u65e7\u7528\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58"
            }
          </button>
          {retry && (
            <div className="stack">
              {share && (
                <button disabled={busy} onClick={() => save("share")}>
                  {"\u5171\u6709\u3057\u3066\u4fdd\u5b58"}
                </button>
              )}
              <button disabled={busy} onClick={() => save("download")}>
                {"\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3059\u308b"}
              </button>
            </div>
          )}
          {confirming && (
            <div className="notice">
              <p>{"\u4fdd\u5b58\u3067\u304d\u307e\u3057\u305f\u304b\uff1f"}</p>
              <button
                onClick={() => {
                  setConfirming(false);
                  setStatus(
                    "\u4fdd\u5b58\u3092\u78ba\u8a8d\u3057\u307e\u3057\u305f\u3002",
                  );
                }}
              >
                {"\u306f\u3044"}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setStatus(
                    "\u4fdd\u5b58\u306f\u672a\u5b8c\u4e86\u3067\u3059\u3002",
                  );
                }}
              >
                {"\u3044\u3044\u3048"}
              </button>
            </div>
          )}
        </>
      ) : (
        <p>
          {
            "\u5fa9\u65e7\u7528\u30c7\u30fc\u30bf\u3092\u78ba\u8a8d\u3057\u3066\u3044\u307e\u3059\u3002\u53d6\u5f97\u3067\u304d\u306a\u3044\u5834\u5408\u306f\u4fdd\u5b58\u6e08\u307f\u306e\u5916\u90e8\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u7ba1\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
          }
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <button className="secondary wide" onClick={() => location.reload()}>
        {"\u3082\u3046\u4e00\u5ea6\u958b\u304f"}
      </button>
    </main>
  );
}
