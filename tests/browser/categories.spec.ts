import { test, expect } from "@playwright/test";
test("category fields preserve drafts and normalize irrelevant values on save", async ({
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
    .fill("111");
  await page
    .getByRole("textbox", { name: "\u5185\u5bb9", exact: true })
    .fill("Synthetic category draft");
  await page
    .getByRole("combobox", { name: "\u8cfc\u5165\u5148", exact: true })
    .selectOption({ label: "Amazon" });
  await page.getByLabel("\u5206\u5272\u56de\u6570", { exact: true }).fill("3");
  await page
    .getByRole("combobox", { name: "\u652f\u6255\u65b9\u6cd5", exact: true })
    .selectOption("NEXT_MONTH");
  await page
    .getByRole("combobox", { name: "\u5206\u985e", exact: true })
    .selectOption("INCOME");
  await expect(
    page.getByRole("combobox", { name: "\u8cfc\u5165\u5148", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("\u5206\u5272\u56de\u6570", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "\u5206\u985e", exact: true })
    .selectOption("EXPENSE");
  await expect(
    page.getByLabel("\u5206\u5272\u56de\u6570", { exact: true }),
  ).toHaveValue("3");
  await expect(
    page.getByRole("combobox", { name: "\u8cfc\u5165\u5148", exact: true }),
  ).toHaveValue("1");
  await page
    .getByRole("combobox", { name: "\u5206\u985e", exact: true })
    .selectOption("ADJUST_INCOME");
  await expect(
    page.getByRole("combobox", { name: "\u5165\u91d1\u5143", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "\u5185\u5bb9", exact: true }),
  ).toHaveValue("Synthetic category draft");
  await page
    .getByRole("button", {
      name: "\u8a18\u9332\u3092\u4fdd\u5b58",
      exact: true,
    })
    .click();
  await expect(page.locator(".asset-card > .asset-value")).toContainText("111");
});
