import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
}
async function prefs(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open("kakeibo-local");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("settings", "readonly");
          const get = tx.objectStore("settings").get("preferences");
          get.onsuccess = () => resolve(get.result.value);
          tx.oncomplete = () => database.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
test("an unfinished form defers reminders without consuming the claim", async ({
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
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic unfinished draft");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("kakeibo-local");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const get = store.get("preferences");
          get.onsuccess = () => {
            const row = get.result;
            row.value.reminderWeek = "";
            row.value.reminderCount = 0;
            row.value.retryDate = null;
            store.put(row);
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("textbox", { name: "\u5185\u5bb9", exact: true }),
  ).toHaveValue("Synthetic unfinished draft");
  expect((await prefs(page)).reminderCount).toBe(0);
  await page
    .getByRole("button", {
      name: "\u30ad\u30e3\u30f3\u30bb\u30eb",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7",
      exact: true,
    }),
  ).toBeVisible();
  expect((await prefs(page)).reminderCount).toBe(1);
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await prefs(page)).reminderCount).toBe(1);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("heading", {
      name: "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7",
      exact: true,
    }),
  ).toBeVisible();
  expect((await prefs(page)).reminderCount).toBe(2);
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("CSV replacement previews invalid rows, protects recovery and confirms external backup", async ({
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
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("40");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic recovery entry");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "\u8a2d\u5b9a", exact: true }).click();
  await page
    .getByLabel("\u9031\u6b21\u306e\u4fdd\u5b58\u6848\u5185\u3092\u8868\u793a")
    .click();
  await expect(
    page.getByLabel(
      "\u9031\u6b21\u306e\u4fdd\u5b58\u6848\u5185\u3092\u8868\u793a",
    ),
  ).not.toBeChecked();
  const csv =
    "total,,,,,,,,,\n\u65e5\u4ed8,\u5206\u985e,\u91d1\u984d,\u5185\u5bb9,\u8cfc\u5165\u5148,\u5206\u5272\u56de\u6570,\u6708\u9593\u640d\u76ca,\u8a08\u7b97\u7528\u5217,\u652f\u6255\u65b9\u6cd5,uuid\n2024/1/9,\u51fa\u8cbb,125,Synthetic import,,,,,,\n2024/2/30,\u51fa\u8cbb,7,Invalid,,,,,,";
  await page
    .getByLabel("CSV\u307e\u305f\u306fJSON\u30d5\u30a1\u30a4\u30eb")
    .setInputFiles({
      name: "synthetic.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(
    page.getByRole("heading", {
      name: "\u8aad\u307f\u8fbc\u3080\u5185\u5bb9\u3092\u78ba\u8a8d",
    }),
  ).toBeVisible();
  await expect(page.getByText("5\u884c\u76ee:", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("4\u884c\u76ee:", { exact: false }),
  ).toBeVisible();
  const before = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "\u7f6e\u304d\u63db\u3048\u3066\u8aad\u307f\u8fbc\u3080",
    })
    .click();
  await before;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const recovery = page
    .locator(".snapshot-row")
    .filter({ hasText: "\u8aad\u307f\u8fbc\u307f\u524d" })
    .first();
  await expect(recovery).toContainText("1\u4ef6");
  await recovery
    .getByRole("button", { name: "\u3053\u306e\u72b6\u614b\u306b\u623b\u3059" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "\u3053\u306e\u72b6\u614b\u306b\u623b\u3059" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "\u8a18\u9332", exact: true }).click();
  await expect(
    page.getByText("Synthetic recovery entry", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic import", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
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
      name: "\u30c9\u30e9\u30a4\u30d6\u306b\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await download;
  await page.getByRole("button", { name: "\u306f\u3044", exact: true }).click();
  await expect(page.locator(".backup-status")).toContainText(
    "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u306f\u5b8c\u4e86",
  );
});
test("CSV record export does not complete the weekly JSON backup", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "\u8a2d\u5b9a", exact: true }).click();
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u4e00\u89a7\u3092CSV\u3067\u4fdd\u5b58",
      exact: true,
    })
    .click();
  const downloaded = await wait;
  expect(downloaded.suggestedFilename()).toMatch(/^kakeibo_records_.*\.csv$/);
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  await expect(page.locator(".backup-status")).toContainText(
    "\u672a\u5b8c\u4e86",
  );
});
