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

The app version comes from `package.json`; release tags use `v0.1.0` style. Database schema versions are independent of app versions. Future schema changes must add a Dexie migration, never recreate the database. Updates are checked on launch and foreground activation. A banner offers an explicit update action, disabled while a form or modal is open. Other open tabs do not automatically reload after another tab updates.

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

## External backups and recovery

Use **Save to Drive** on Home, Settings or the weekly reminder. The app prepares a complete JSON file before the tap. It calls the native file picker directly during the tap if available; choose Drive if the system file provider offers it. Otherwise it offers file sharing, then a normal download. A failed asynchronous picker/write never silently opens another privileged UI: a new button tap selects the fallback. Cancellation leaves the week incomplete.

Successful picker writes complete after the stream closes. Sharing and downloads require an explicit **Yes / No** confirmation that the file exists at the chosen destination. The app cannot inspect the contents of your Drive or prove that a share target saved the file. A snapshot export is historical and never completes the current weekly backup. Full JSON backups contain financial tables, settings, schema version, export time and a flat list of snapshots. Snapshots never contain nested snapshots. JSON files are unencrypted: choose a private destination.

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
