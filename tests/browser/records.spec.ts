import { test, expect } from "@playwright/test";
test("record tabs retain separate filters, choose add category and show scheduled assets", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "\u3042\u3068\u3067", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("101");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic pending expense");
  await page
    .getByRole("combobox", { name: "\u652f\u6255\u65b9\u6cd5", exact: true })
    .selectOption("NEXT_MONTH");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("0");
  await expect(page.locator(".asset-secondary .asset-value")).toContainText(
    "101",
  );
  await page
    .getByRole("button", {
      name: /\u6765\u6708\u4ee5\u964d\u306e\u5f15\u304d\u843d\u3068\u3057\u4e88\u5b9a/,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Synthetic pending expense",
  );
  await page
    .getByRole("button", { name: "\u9589\u3058\u308b", exact: true })
    .click();
  await page.getByRole("button", { name: "\u8a18\u9332", exact: true }).click();
  await page.getByRole("button", { name: "\u5165\u91d1", exact: true }).click();
  await expect(page.locator(".entry")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u8ffd\u52a0",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "\u5206\u985e", exact: true }),
  ).toHaveValue("INCOME");
  await page
    .getByLabel("\u91d1\u984d\uff08\u5186\u30fb\u7dcf\u984d\uff09")
    .fill("222");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic tab income");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await page.locator(".filter-panel summary").click();
  await expect(
    page.getByRole("group", {
      name: "\u5165\u91d1\u5143\u3067\u7d5e\u308a\u8fbc\u307f",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", {
      name: "\u8cfc\u5165\u5148\u3067\u7d5e\u308a\u8fbc\u307f",
    }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "\u660e\u7d30\u306a\u3057", exact: true })
    .check();
  await expect(page.locator(".filter-panel summary")).toContainText("1");
  await page.getByRole("button", { name: "\u51fa\u8cbb", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "\u5206\u5272\u6255\u3044\u306e\u307f",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "\u5165\u91d1", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "\u660e\u7d30\u306a\u3057",
      exact: true,
    }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "\u30db\u30fc\u30e0", exact: true })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("222");
  await expect(page.locator(".asset-secondary .asset-value")).toContainText(
    "121",
  );
});
