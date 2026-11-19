import { test, expect } from "@playwright/test";
async function open(page: import("@playwright/test").Page) {
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "\u4eca\u9031\u306e\u30d0\u30c3\u30af\u30a2\u30c3\u30d7",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
}
async function add(
  page: import("@playwright/test").Page,
  description: string,
  amount: string,
) {
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill(amount);
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill(description);
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("Japanese mobile CRUD, inline stores, accounting, export confirmation and offline reopening", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("10001");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic test purchase");
  await page.getByLabel("\u65e5\u4ed8", { exact: true }).fill("2024-01-12");
  await page.getByLabel("\u5206\u5272\u56de\u6570").fill("2");
  await page
    .getByRole("combobox", { name: "\u652f\u6255\u65b9\u6cd5", exact: true })
    .selectOption("NEXT_MONTH");
  await page
    .getByRole("combobox", { name: "\u8cfc\u5165\u5148", exact: true })
    .selectOption("add");
  await page
    .getByRole("textbox", {
      name: "\u65b0\u3057\u3044\u8cfc\u5165\u5148",
      exact: true,
    })
    .fill("Synthetic shop");
  await page
    .getByRole("button", {
      name: "\u8ffd\u52a0\u3057\u3066\u9078\u629e",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09"),
  ).toHaveValue("10001");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "\u6708\u9593", exact: true }).click();
  await page.getByLabel("\u5bfe\u8c61\u5e74\u6708").fill("2024-02");
  await expect(page.locator(".summary")).toContainText("5,001");
  await page
    .getByRole("button", {
      name: "\u8cfc\u5165\u65e5\u57fa\u6e96",
      exact: true,
    })
    .click();
  await page.getByLabel("\u5bfe\u8c61\u5e74\u6708").fill("2024-01");
  await expect(page.locator(".summary")).toContainText("5,001");
  await page.getByRole("button", { name: "\u5e74\u9593", exact: true }).click();
  await page.getByLabel("\u5bfe\u8c61\u5e74").fill("2024");
  await expect(page.locator(".year-table button")).toHaveCount(12);
  await page.getByRole("button", { name: "\u8a18\u9332", exact: true }).click();
  await page
    .getByLabel("\u5185\u5bb9\u3092\u691c\u7d22")
    .fill("Synthetic test");
  await expect(page.locator(".entry")).toHaveCount(1);
  await page.locator(".entry-body").click();
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic edited");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page
    .getByLabel("\u5185\u5bb9\u3092\u691c\u7d22")
    .fill("Synthetic edited");
  await expect(page.locator(".entry")).toHaveCount(1);
  await page.getByRole("button", { name: "\u8a2d\u5b9a", exact: true }).click();
  await page
    .getByLabel("\u9031\u6b21\u306e\u4fdd\u5b58\u6848\u5185\u3092\u8868\u793a")
    .click();
  await expect(
    page.getByLabel(
      "\u9031\u6b21\u306e\u4fdd\u5b58\u6848\u5185\u3092\u8868\u793a",
    ),
  ).not.toBeChecked();
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
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "\u30c9\u30e9\u30a4\u30d6\u306b\u4fdd\u5b58",
      exact: true,
    })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^kakeibo_backup_.*\.json$/);
  await expect(
    page.getByRole("heading", {
      name: "\u4fdd\u5b58\u3067\u304d\u307e\u3057\u305f\u304b\uff1f",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "\u3044\u3044\u3048", exact: true })
    .click();
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  await expect(page.locator(".backup-status")).toContainText(
    "\u672a\u5b8c\u4e86",
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "\u30db\u30fc\u30e0", exact: true }),
  ).toBeVisible();
  await add(page, "Synthetic offline record", "75");
  await expect(
    page.getByText("Synthetic offline record", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByText("Synthetic offline record", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile widths, dark mode, no overflow and no external requests", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:") &&
      !r.url().startsWith("https://gitysk.github.io/") &&
      !r.url().startsWith("blob:")
    )
      requests.push(r.url());
  });
  await open(page);
  await add(page, "Synthetic layout sample", "12345");
  for (const width of [360, 384, 412]) {
    await page.setViewportSize({ width, height: 824 });
    for (const tab of [
      "\u30db\u30fc\u30e0",
      "\u8a18\u9332",
      "\u6708\u9593",
      "\u5e74\u9593",
      "\u8a2d\u5b9a",
    ]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  expect(
    await page
      .locator(".app")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(20, 33, 29)");
  await page.screenshot({ path: "test-results/home-dark.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({
    path: "test-results/home-light.png",
    fullPage: true,
  });
  expect(requests).toEqual([]);
});
