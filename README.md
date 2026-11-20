# Kakeibo

A Japanese, mobile-first household budget PWA. Live app: https://gitysk.github.io/kakeibo/

Financial records stay in IndexedDB on the device. There is no account, spreadsheet synchronization, analytics, external font, CDN, or financial-data API. GitHub Pages serves the application assets. File sharing only begins after the user chooses to export.

## Development

Install Node.js 24.15 or later and npm. Then:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The application lives at `/kakeibo/`, including the local preview. The production build includes a service worker; the development server intentionally does not. Use the production preview when checking offline behavior. Run `npx playwright install chromium` and `npm run test:e2e` for browser checks. Tests use synthetic data only. `test-results/` is ignored.

Runtime dependencies: React and React DOM render the UI; Dexie provides versioned IndexedDB tables and transactions. Build tools: Vite, TypeScript and the React plugin. `vite-plugin-pwa` builds the manifest and Workbox service worker. Workbox modules precache only same-origin app assets. Vitest and fake-indexeddb test business rules and database behavior; Playwright checks the production UI. Charts are local SVG, with a matching numeric table.

## Deploy to GitHub Pages

The public repository is `GitYsk/kakeibo`. Set Settings > Pages > Build and deployment > Source to **GitHub Actions**. Push `main`. The workflow installs locked dependencies, runs the unit tests, builds, uploads the static artifact and deploys to Pages. A failed test blocks deployment. The base path, manifest ID, start URL and scope are `/kakeibo/`. If the repository name changes, update all these together.

The app version comes from `package.json`; release tags use `v0.1.0` style. Database schema versions are independent of app versions. Version 0.2.0 uses database schema 2 and adds payslips and employers; existing transactions, recurring templates, stores and settings are preserved. Future schema changes must add a Dexie migration, never recreate the database. Updates are checked on launch and foreground activation. A banner offers an explicit update action, disabled while a form or modal is open. Other open tabs do not automatically reload after another tab updates.

## Install on Android

Open the live URL in Chrome, wait for the first download to finish, then use the Chrome menu > Add to Home screen > Install. Open from the new icon. All app controls are Japanese. The layout targets 360-412 CSS pixels, uses a maximum width of 480 pixels, honors safe areas and follows system dark mode. A PWA is installed through Chrome; an APK is not required.

On the physical phone, confirm that airplane mode still permits reopening the installed app and saving an entry. Persistent storage is requested at first initialization; its actual browser decision and approximate storage usage appear in Settings. Persistence reduces automatic eviction risk but does not protect against manual browser-data removal, device loss or uninstall behavior.

## One-time CSV migration

Download only the source transaction sheet as UTF-8 CSV. Keep its first totals row and second header row. In Settings, choose the file, review accepted and skipped row counts and reasons, then confirm replacement. Columns A-F and I-J are read; formula columns G-H are ignored. Blank stores and payment methods are accepted, and blank installment count means one. Monthly and ended recurring UUID groups become templates using the latest status and amount. The earliest record supplies the start date. Missing months after the latest imported month are generated on the next activation.

Existing data is retained in an internal BEFORE_IMPORT snapshot before replacement, in the same database transaction. If current records exist, the confirmation button also starts a JSON download before replacement. Check that file separately: automatic download initiation cannot prove the file reached Drive. Import never marks an external backup complete. The original CSV is read only. Repeating an import replaces records; it does not merge them.

After a successful migration, manually stop the old Apps Script recurring triggers in the source spreadsheet project to avoid further duplicate source entries. This app does not access or modify that project.

## Calculations and recurring records

Assets count all income, expenses and adjustments at full value. Monthly and annual summaries omit adjustments. Expense installments begin in the purchase month, shifted one month for NEXT_MONTH only in payment-month mode. Division uses integer yen, with the entire remainder added to the first installment. Income stays in its dated month. Home, month and year share the selected accounting mode. The next-month tab shows purchase cohorts and also all next-month installments due in the selected month.

Active recurring templates generate the first day of each missing month, starting in the month after their initial entry. Generation, cursor advancement and weekly snapshot creation are transactional. A unique generated key plus existing-month detection prevents duplicates across tabs. Deleting a generated entry does not stop its template or regenerate older deleted months. Price edits apply next month; ending a template stops future generation. Editing a past entry changes that entry only; use Settings to change the template.

## Payslips and annual salary

When an entry is Income, enable the payslip switch to add payroll details. Choose the income source in the income form; linked payroll uses that same source without a second selector. The payment date initially follows the income date; the work period defaults to the previous month and remains editable. Enter basic pay, taxable extras, non-taxable allowances and deductions in integer yen. Less common fields are in the expandable details section. The form shows taxable pay, gross pay, total deductions and net pay live. A mismatch with the income amount produces a warning and an explicit button to copy net pay into that amount; saving a mismatch is allowed.

Editing an existing income can add, edit or remove its payslip. Turning the payslip switch off confirms removal on save; the income itself remains. Changing a linked income to another category also requires confirmation before removing its payslip. When deleting a linked income, choose to delete its payslip as well or keep a standalone payslip. These changes commit atomically. A payslip never silently changes the household income amount.

Use **Annual > Salary > Add payslip only** for payroll from before migration or for other unlinked documents. Standalone slips do not change assets, household monthly income or the household annual income summary. They do contribute to salary totals. Each document displays whether it is standalone or linked. Open a month in the salary list to edit it; linked slips open their income editor.

Annual salary is the sum of taxable pay by the year of the payment date, independent of the work period, income date and household accounting mode. Taxable pay is basic pay plus overtime and other taxable pay. Non-taxable commuting and other non-taxable allowances are excluded from this headline. The section also shows gross/non-taxable pay, social insurance, withheld income tax, resident tax, net pay, employer breakdowns and twelve monthly rows. Its CSV includes annual, employer and monthly summaries.

The missing-payslip notice identifies unlinked income records whose income source already has linked payroll. It matches stable source IDs, not descriptions. Tap the notice to filter those records and attach missing slips.

Settings manages employers with stable IDs, rename, reordering and hide/show. An employer used by any slip cannot be deleted. Optional named salary targets are entered by the user, included in backups and compared with annual taxable salary. No statutory thresholds or tax-eligibility decision rules are embedded.

## Schema migration and recovery

Before opening schema 2 over an existing schema-1 database, the app uses a separate connection to commit a flat BEFORE_MIGRATION snapshot. It then closes that connection and upgrades the schema, preserving monetary values, dates, descriptions and source IDs. Identical source content reuses the same protected copy; a failed attempt followed by new legacy entries produces a new copy. A final upgrade-boundary check captures writes that arrived after the preflight copy. The initial committed copy remains available even if the version-change transaction aborts. A new empty installation does not need a migration snapshot.

An upgrade failure stops normal startup without clearing or rewriting existing financial records. The error screen prepares a recovery JSON from the protected snapshot, or the unchanged current records if they are newer, and offers native save, explicit sharing fallback or download with confirmation. When another tab blocks the upgrade, the app asks for the other tab to be closed; it never deletes the database to unblock it. Save unfinished work and close other household-budget tabs before updating across a schema change.

Retention is eight weekly snapshots, five combined manual/before-import snapshots, and a separate five migration snapshots. Internal copies remain in the same browser and are not an external backup.

Full JSON exports use schema version 3 and include payslips, employers and named targets. Schema-1 files and historical snapshots are still accepted, with missing payroll tables and targets treated as empty. Restoring an old file replaces current payroll too: the preview states that limitation and creates a full BEFORE_IMPORT recovery copy first. Backups and snapshots are flat and never recursively nest their own snapshot history. Import previews include counts and the date period.

## External backups and recovery

Use **Save to Drive** on Home, Settings or the weekly reminder. The app prepares a complete JSON file before the tap. It calls the native file picker directly during the tap if available; choose Drive if the system file provider offers it. Otherwise it offers file sharing, then a normal download. A failed asynchronous picker/write never silently opens another privileged UI: a new button tap selects the fallback. Cancellation leaves the week incomplete.

Successful picker writes complete after the stream closes. Sharing and downloads require an explicit **Yes / No** confirmation that the file exists at the chosen destination. The app cannot inspect the contents of your Drive or prove that a share target saved the file. Settings also exports the record list as an Excel-friendly UTF-8 CSV. CSV is for viewing and does not replace a full JSON backup or complete the weekly backup. A snapshot export is historical and never completes the current weekly backup. Full JSON backups contain financial tables, settings, schema version, export time and a flat list of snapshots. Snapshots never contain nested snapshots. JSON files are unencrypted: choose a private destination.

Weeks start on Sunday in Asia/Tokyo. The first eligible activation shows a reminder unless the current week has a confirmed external backup. The selected weekday delays eligibility until that day. Later permits only one additional activation on that same day, then suppresses the dialog for the week. Forms defer the dialog without consuming its count. Disabling reminders hides the dialog but does not hide the Home backup status.

A weekly internal snapshot is automatic even when reminders are disabled. The latest eight weekly snapshots and five combined manual/before-import snapshots are kept. Settings lists creation time and record count, and supports manual snapshots, historical file export and restore. Restore validates the entire file before changing data and creates a protected BEFORE_IMPORT recovery snapshot. These copies are in the same browser as the main data: clearing Chrome data or losing the phone destroys both. They are not a substitute for an external backup.

Physical-phone acceptance checks: choose Drive in the native picker or share target; verify the JSON file really exists; cancel once and confirm backup stays incomplete; complete a save and confirm Home changes to complete; restore that file and check records; background the app with an unfinished form and confirm no modal steals the form; deploy a new version, use the update banner, and confirm records survive. Browser automation cannot certify the phone's native Drive provider or the installed home-screen experience.

## Keep personal data out of Git

Never commit a source CSV, backup JSON, actual financial figures/descriptions, source sheet URL/ID, or private test output. `.gitignore` blocks CSV/JSON except necessary package/config files, as well as `private/` and `data/`. Always inspect `git status`, `git diff --cached --stat` and the full staged diff before every push. Publish only `dist` app assets, never a parent output folder.

The private verifier accepts an external CSV path and expected values through command-line arguments. Run it from this project, redirecting output to a file outside the repository:

```sh
npm run verify:private -- --csv /absolute/path/outside-repo/source.csv --month YYYY-MM --assets EXPECTED --expense EXPECTED --income EXPECTED
```

Optional flags: `--first-date`, `--first-amount`, `--split-date`, `--split-amount`, `--split-month`. No personal expected values are embedded in this script or in the tests. Keep the command output and real invocation arguments outside version control.

## Implementation references

[GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Dexie transactions](https://dexie.org/docs/Dexie/Dexie.transaction()), [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), and [PWA update prompts](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).

## Version 0.3.0: category-specific forms and income sources

Choose the category first. Income shows date, amount, income source, memo and optional payroll; expense shows date, amount, memo, store, installments and payment method. Adjustments show only date, amount and memo. Switching categories retains draft values until save. Saved entries clear irrelevant fields. Editing a category confirms discarded information; a linked payslip may be deleted or retained standalone. A recurring row changed to income is detached from its template; the template itself remains.

Income sources replace employers and are separate from stores. Linked payroll uses the entry source, with no second source selector. Standalone payroll selects its own income source. Schema 3 preserves employer IDs while moving them to incomeSources and relinks payroll and its income records. Schema-1 and schema-2 backups remain readable. Pre-migration and recovery protection also applies to this update.

CSV income rows ignore installments and payment fields. An empty or generic Other store column takes the description as the source and clears that description; a specific store column becomes the income source and retains the description. The preview lists source names and counts. Rename them there to merge spelling variants before replacement. Adjustment income has no source. The missing-payslip notice now matches income-source IDs with existing linked payroll, rather than descriptions.

## Version 0.4.0: records and asset position

Records has Expense and Income segments. Expense includes expense adjustments; Income includes income adjustments and standalone payslips. Standalone rows show taxable pay and do not affect assets or the cash-income monthly heading. The selected segment and independent filter sets are stored in IndexedDB settings and backed up. All multi-select filters are inside the expandable Filter list, with an active-selection count and clear action. Search remains visible. Month headings total the matching cash records. The add button defaults to the selected record category.

Home now emphasizes assets at the current month: only entries dated today or earlier participate, and expenses subtract only installments due by the current payment month. The smaller full-period amount keeps the original full-value formula. Tap the scheduled-payment total to view its month, description and integer-yen amount. Both amounts use payment-month allocation independently of the accounting toggle. Negative balances use the same red style.

Future-dated income and income adjustments are rejected on save, CSV import and replacement import. Existing data is not deleted. Full-period assets still include all dated records. Any future-dated record impact that prevents the full-period difference from matching the eligible scheduled-payment sum is displayed separately, rather than mislabeled as a payment schedule. This also handles any pre-existing future income or future expense/adjustment records.
