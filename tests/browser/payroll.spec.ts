import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
}
async function rows(page: Page, table: string) {
  return page.evaluate(
    (table) =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open("kakeibo-local");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(table, "readonly");
          const get = tx.objectStore(table).getAll();
          get.onsuccess = () => resolve(get.result);
          tx.oncomplete = () => db.close();
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
    table,
  );
}
async function seedLegacy(page: Page) {
  await page.route("**/assets/*.js", (r) => r.abort());
  await page.goto("./");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("kakeibo-local", 10);
        r.onupgradeneeded = () => {
          const db = r.result;
          const tx = db.createObjectStore("transactions", {
            keyPath: "id",
            autoIncrement: true,
          });
          for (const key of [
            "date",
            "type",
            "storeId",
            "paymentMethod",
            "recurringId",
          ])
            tx.createIndex(key, key);
          tx.createIndex("generatedKey", "generatedKey", { unique: true });
          tx.createIndex("[recurringId+monthKey]", ["recurringId", "monthKey"]);
          const recurring = db.createObjectStore("recurringPayments", {
            keyPath: "id",
          });
          recurring.createIndex("storeId", "storeId");
          recurring.createIndex("lastGeneratedMonth", "lastGeneratedMonth");
          const stores = db.createObjectStore("stores", {
            keyPath: "id",
            autoIncrement: true,
          });
          stores.createIndex("name", "name", { unique: true });
          stores.createIndex("sortOrder", "sortOrder");
          const snapshots = db.createObjectStore("snapshots", {
            keyPath: "id",
            autoIncrement: true,
          });
          for (const key of ["createdAt", "weekKey", "reason"])
            snapshots.createIndex(key, key);
          snapshots.createIndex("weeklyKey", "weeklyKey", { unique: true });
          db.createObjectStore("settings", { keyPath: "id" });
        };
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(
            ["transactions", "stores", "settings"],
            "readwrite",
          );
          const base = {
            date: "2024-04-12",
            type: "INCOME",
            amount: 173,
            description: "Synthetic legacy income",
            storeId: null,
            installments: 1,
            paymentMethod: "NOW",
            recurringId: null,
            createdAt: "2024-04-12T00:00:00Z",
            updatedAt: "2024-04-12T00:00:00Z",
          };
          tx.objectStore("transactions").add({ ...base, id: 41 });
          tx.objectStore("transactions").add({
            ...base,
            id: 42,
            type: "EXPENSE",
            amount: 29,
            description: "Synthetic legacy expense",
            storeId: 5,
          });
          tx.objectStore("stores").add({
            id: 5,
            name: "Synthetic legacy shop",
            sortOrder: 0,
            hidden: false,
          });
          tx.objectStore("settings").put({
            id: "preferences",
            value: {
              accounting: "PAYMENT",
              lastExportAt: null,
              lastExportMethod: "",
              remindersEnabled: false,
              reminderDay: 0,
              reminderWeek: "",
              reminderCount: 0,
              retryDate: null,
              persistence: "granted",
            },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }),
  );
  await page.unroute("**/assets/*.js");
}
test("linked and standalone payslips, warnings, annual salary, employer rename, targets and missing records", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "\u5206\u985e", exact: true })
    .selectOption("INCOME");
  await page.getByLabel("\u65e5\u4ed8", { exact: true }).fill("2024-12-28");
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("1");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic salary");

  await page
    .getByLabel("\u7d66\u4e0e\u660e\u7d30\u3092\u5165\u529b\u3059\u308b")
    .check();
  await page
    .getByLabel("\u652f\u7d66\u65e5", { exact: true })
    .fill("2025-01-25");
  await expect(
    page.getByLabel("\u5bfe\u8c61\u671f\u9593", { exact: true }),
  ).toHaveValue("2024-12");
  page.once("dialog", (d) => d.accept("Synthetic employer"));
  await page
    .getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true })
    .selectOption("add");
  await expect(
    page.getByRole("textbox", { name: "\u5185\u5bb9", exact: true }),
  ).toHaveValue("Synthetic salary");
  await page.getByLabel("\u57fa\u672c\u7d66", { exact: true }).fill("10001");
  await page
    .getByLabel(
      "\u901a\u52e4\u624b\u5f53\uff08\u975e\u8ab2\u7a0e\u5206\uff09",
      { exact: true },
    )
    .fill("101");
  await page
    .getByLabel(
      "\u6240\u5f97\u7a0e\uff08\u6e90\u6cc9\u5fb4\u53ce\u7a0e\u984d\uff09",
      { exact: true },
    )
    .fill("17");
  await expect(page.getByRole("alert")).toContainText(
    "\u4e00\u81f4\u3057\u307e\u305b\u3093",
  );
  await page
    .getByRole("button", {
      name: "\u5165\u91d1\u984d\u3092\u5dee\u5f15\u652f\u7d66\u984d\u306b\u5408\u308f\u305b\u308b",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09"),
  ).toHaveValue("10085");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("10,085");
  await page.getByRole("button", { name: "\u5e74\u9593", exact: true }).click();
  await page.getByLabel("\u5bfe\u8c61\u5e74", { exact: true }).fill("2024");
  await expect(page.getByTestId("salary-taxable")).toContainText("0");
  await page.getByLabel("\u5bfe\u8c61\u5e74", { exact: true }).fill("2025");
  await expect(page.getByTestId("salary-taxable")).toContainText("10,001");
  await page
    .getByRole("button", {
      name: "\u660e\u7d30\u306e\u307f\u767b\u9332",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true })
    .selectOption({ label: "Synthetic employer" });
  await page
    .getByLabel("\u652f\u7d66\u65e5", { exact: true })
    .fill("2025-02-25");
  await page.getByLabel("\u57fa\u672c\u7d66", { exact: true }).fill("2222");
  await page
    .getByLabel(
      "\u901a\u52e4\u624b\u5f53\uff08\u975e\u8ab2\u7a0e\u5206\uff09",
      { exact: true },
    )
    .fill("2");
  await page
    .getByRole("button", {
      name: "\u660e\u7d30\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("salary-taxable")).toContainText("12,223");
  await page.locator(".salary-month").nth(1).locator("summary").click();
  await expect(page.locator(".salary-month").nth(1)).toContainText(
    "\u660e\u7d30\u306e\u307f",
  );
  const csv = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "\u7d66\u4e0e\u96c6\u8a08\u3092CSV\u3067\u4fdd\u5b58",
      exact: true,
    })
    .click();
  expect((await csv).suggestedFilename()).toBe("kakeibo_salary_2025.csv");
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("10,085");
  await page.getByRole("button", { name: "\u8a2d\u5b9a", exact: true }).click();
  const employers = page.locator(".panel").filter({
    has: page.getByRole("heading", {
      name: "\u5165\u91d1\u5143",
      exact: true,
    }),
  });
  await employers
    .getByRole("button", { name: "\u540d\u79f0", exact: true })
    .click();
  await page
    .getByLabel("\u5165\u91d1\u5143\u306e\u540d\u524d", { exact: true })
    .fill("Synthetic renamed");
  await page
    .getByRole("button", {
      name: "\u5909\u66f4\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: "\u76ee\u5b89\u984d\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByLabel("\u76ee\u5b89\u984d\u306e\u540d\u524d", { exact: true })
    .fill("Personal target");
  await page
    .getByLabel("\u76ee\u5b89\u984d\uff08\u5186\uff09", { exact: true })
    .fill("20000");
  await page
    .getByRole("button", {
      name: "\u76ee\u5b89\u984d\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "\u5e74\u9593", exact: true }).click();
  await expect(page.locator(".salary-target")).toContainText("7,777");
  await expect(page.locator(".employer-summary")).toContainText(
    "Synthetic renamed",
  );
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: "\u5206\u985e", exact: true })
    .selectOption("INCOME");
  await page.getByLabel("\u65e5\u4ed8", { exact: true }).fill("2025-03-25");
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("5");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic salary");
  await page
    .getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true })
    .selectOption({ label: "Synthetic renamed" });
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: /\u7d66\u4e0e\u306e\u53ef\u80fd\u6027\u304c\u3042\u308b\u5165\u91d1 1\u4ef6/,
    })
    .click();
  await expect(page.locator(".entry")).toHaveCount(1);
  await page.locator(".entry-body").click();
  await page
    .getByLabel("\u7d66\u4e0e\u660e\u7d30\u3092\u5165\u529b\u3059\u308b")
    .check();
  await page
    .getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true })
    .selectOption({ label: "Synthetic renamed" });
  await page.getByLabel("\u57fa\u672c\u7d66", { exact: true }).fill("5");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page.locator(".delete-small").click();
  await page
    .getByRole("button", {
      name: "\u660e\u7d30\u3060\u3051\u6b8b\u3059",
      exact: true,
    })
    .click();
  await expect(page.locator(".entry")).toHaveCount(0);
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("10,085");
  await page.getByRole("button", { name: "\u5e74\u9593", exact: true }).click();
  await expect(page.getByTestId("salary-taxable")).toContainText("12,228");
  await page.screenshot({
    path: "test-results/payroll-year.png",
    fullPage: true,
  });
});
test("upgrading a legacy browser preserves records and makes the pre-migration snapshot exportable", async ({
  page,
}) => {
  await seedLegacy(page);
  const original = await rows(page, "transactions");
  await page.reload();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("144");
  expect(await rows(page, "transactions")).toEqual(
    original.map((e) => ({ ...e, incomeSourceId: null })),
  );
  expect(await rows(page, "payslips")).toEqual([]);
  const snapshots = await rows(page, "snapshots");
  const before = snapshots.filter((s) => s.reason === "BEFORE_MIGRATION");
  expect(before).toHaveLength(1);
  expect(before[0].data.transactions).toEqual(original);
  await page.getByRole("button", { name: "\u8a2d\u5b9a", exact: true }).click();
  await expect(
    page.locator(".snapshot-row").filter({ hasText: "\u66f4\u65b0\u524d" }),
  ).toHaveCount(1);
});
test("a failed upgrade leaves legacy data intact and exposes a recovery JSON download", async ({
  page,
}) => {
  await seedLegacy(page);
  const original = await rows(page, "transactions");
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name: string, version?: number) {
      if (name === "kakeibo-local" && version !== undefined && version >= 20)
        throw new DOMException("Synthetic upgrade failure", "UnknownError");
      return version === undefined
        ? open.call(this, name)
        : open.call(this, name, version);
    };
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "\u30c7\u30fc\u30bf\u3092\u958b\u3051\u307e\u305b\u3093\u3067\u3057\u305f",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "\u5fa9\u65e7\u7528\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58",
      exact: true,
    }),
  ).toBeVisible();
  expect(await rows(page, "transactions")).toEqual(original);
  expect(
    (await rows(page, "snapshots")).filter(
      (s) => s.reason === "BEFORE_MIGRATION",
    ),
  ).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "\u5fa9\u65e7\u7528\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toMatch(
    /^kakeibo_snapshot_.*\.json$/,
  );
  await expect(
    page.getByText("\u4fdd\u5b58\u3067\u304d\u307e\u3057\u305f\u304b\uff1f", {
      exact: true,
    }),
  ).toBeVisible();
});
