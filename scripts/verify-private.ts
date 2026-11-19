import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import {
  importCsv,
  assets,
  totals,
  charges,
  charge,
  addMonths,
} from "../src/core.ts";
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || args[i + 1] === undefined)
    throw new Error(
      "Use --csv PATH --month YYYY-MM [--assets NUMBER --expense NUMBER --income NUMBER --first-date YYYY-MM-DD --first-amount NUMBER --split-date YYYY-MM-DD --split-amount NUMBER --split-month YYYY-MM]",
    );
  options.set(args[i], args[i + 1]);
}
const file = options.get("--csv");
const month = options.get("--month");
if (!file || !month)
  throw new Error(
    "--csv and --month are required. Keep the source and output outside this repository.",
  );
const path = resolve(file);
const relation = relative(process.cwd(), path);
if (!isAbsolute(relation) && !relation.startsWith(".."))
  throw new Error("Private CSV must be outside the current project directory.");
const data = importCsv(readFileSync(path, "utf8"));
const value = totals(data.transactions, month, "PAYMENT");
const first = charges(data.transactions, month, "PAYMENT")[0];
const checks: { name: string; pass: boolean }[] = [];
for (const [flag, actual] of [
  ["--assets", assets(data.transactions)],
  ["--expense", value.expense],
  ["--income", value.income],
  ["--first-amount", first?.amount],
] as const) {
  if (options.has(flag))
    checks.push({
      name: flag.slice(2),
      pass: actual === Number(options.get(flag)),
    });
}
if (options.has("--first-date"))
  checks.push({
    name: "first-date",
    pass: first?.entry.date === options.get("--first-date"),
  });
if (options.has("--split-date")) {
  const split = data.transactions.find(
    (e) =>
      e.date === options.get("--split-date") &&
      (!options.has("--split-amount") ||
        e.amount === Number(options.get("--split-amount"))),
  );
  const start = options.get("--split-month");
  if (!split || !start) checks.push({ name: "split", pass: false });
  else {
    const second =
      Number(start.slice(5, 7)) === 12
        ? `${Number(start.slice(0, 4)) + 1}-01`
        : `${start.slice(0, 4)}-${String(Number(start.slice(5, 7)) + 1).padStart(2, "0")}`;
    checks.push({
      name: "split-installments",
      pass:
        charge(split, start, "PAYMENT")?.amount ===
          Math.floor(split.amount / split.installments) +
            (split.amount % split.installments) &&
        charge(split, second, "PAYMENT")?.amount ===
          Math.floor(split.amount / split.installments) &&
        charge(split, addMonths(start, -1), "PURCHASE")?.amount ===
          Math.floor(split.amount / split.installments) +
            (split.amount % split.installments) &&
        charge(split, start, "PURCHASE")?.amount ===
          Math.floor(split.amount / split.installments) &&
        charge(split, addMonths(start, -1), "PAYMENT") === null &&
        charge(split, addMonths(start, 2), "PAYMENT") === null,
    });
  }
}
console.log(
  JSON.stringify(
    {
      records: data.transactions.length,
      skipped: data.skipped.length,
      assets: assets(data.transactions),
      month,
      summary: value,
      first: first ? { date: first.entry.date, amount: first.amount } : null,
      checks,
    },
    null,
    2,
  ),
);
if (data.skipped.length || checks.some((c) => !c.pass)) process.exitCode = 1;
