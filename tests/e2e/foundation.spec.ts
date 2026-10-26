import { test, expect } from "@playwright/test";
test("all five pages work with responsive navigation and honest empty states", async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "把每一餐",
  );
  await expect(page.getByText("待连接厨房", { exact: false })).toHaveCount(4);
  const nav = page.getByRole("navigation", {
    name: isMobile ? "手机主导航" : "桌面主导航",
  });
  await expect(nav).toBeVisible();
  for (const [label, route, title] of [
    ["冰箱", "/fridge", "我们的冰箱"],
    ["点菜", "/menu", "今天，想吃什么"],
    ["采购", "/shopping", "把期待，带回家"],
    ["我的", "/profile", "一起，开启厨房生活"],
  ]) {
    await nav.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByText("Phase 2 账号与家庭功能已实现", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("theme persists after refresh", async ({ page }) => {
  await page.goto("/");
  const previous = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: /切换.*模式/ }).click();
  const next = previous === "dark" ? "light" : "dark";
  await expect(page.locator("html")).toHaveAttribute("data-theme", next);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", next);
});
test("manifest and not-found page respond", async ({ page, request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ name: "All You Can Eat" });
  const missing = await page.goto("/this-page-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
});
test("auth and invite routes show configuration requirements without fake success", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "尚未连接 Supabase" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "邮箱" })).toHaveCount(0);
  await page.goto("/join#invite=not-a-real-token");
  await expect(page.getByRole("link", { name: "前往登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入共享厨房" })).toHaveCount(
    0,
  );
  const response = await page.goto("/auth/callback");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/login\?error=confirmation$/);
  await expect(
    page.getByRole("alert").filter({ hasText: "无法完成此次自动登录" }),
  ).toBeVisible();
});

test("cross-device confirmation guides users to sign in without registering again", async ({
  page,
}) => {
  await page.goto("/login?notice=confirmation-signin");
  await expect(
    page.getByRole("status").filter({ hasText: "无需重新注册" }),
  ).toBeVisible();
  await expect(
    page.getByText("邮箱确认链接无效", { exact: false }),
  ).toHaveCount(0);
});
