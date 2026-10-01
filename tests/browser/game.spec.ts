import { test, expect } from "@playwright/test";
test("3D renderer loads separately and retains board state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.screenshot({ path: "screenshots/menu.png", fullPage: true });
  await page.getByRole("button", { name: "Play Game", exact: false }).click();
  await page.getByRole("button", { name: "Local Pass-and-Play" }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  await page.screenshot({ path: "screenshots/match.png", fullPage: true });
  await page.getByLabel("Board view").selectOption("3d");
  await expect(page.locator(".webgl-board canvas")).toBeVisible();
  await expect(page.getByText("₹1,500 · 0 deeds")).toHaveCount(2);
  await page.getByLabel("Board view").selectOption("flat");
  await expect(
    page.getByRole("button", { name: "Mumbai, Maharashtra" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("menu, rules, local lobby, roll, deed inspection and escaped chat", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next big property deal." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play Game", exact: false }).click();
  await page.getByRole("button", { name: "Local Pass-and-Play" }).click();
  await expect(page.getByText("Your private room")).toBeVisible();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByRole("button", { name: "Roll dice" })).toBeEnabled();
  await page.getByRole("button", { name: "Roll dice" }).click();
  await expect(
    page.getByRole("button", { name: "Roll dice" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Mumbai, Maharashtra" }).click();
  await expect(
    page.getByRole("heading", { name: "Mumbai, Maharashtra" }),
  ).toBeVisible();
  await expect(page.getByText("Hotel", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close deed" }).click();
  await page
    .getByRole("textbox", { name: "Room chat message" })
    .fill("<script>window.bad=true</script>");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(": <script>window.bad=true</script>", { exact: false }),
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "bad"))).toBeUndefined();
  expect(errors).toEqual([]);
});
test("phone landscape lobby and board controls", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Play Game", exact: false }).click();
  await page.getByRole("button", { name: "Local Pass-and-Play" }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.getByRole("button", { name: "Roll dice" })).toBeVisible();
  await page.getByLabel("Board view").selectOption("flat");
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
});
test("all 20 original piece families and three styles are selectable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play Game", exact: false }).click();
  const select = page.getByLabel("Board piece");
  await expect(select.locator("option")).toHaveCount(20);
  for (let n = 0; n < 20; n++) {
    await select.selectOption(String(n));
    for (const variant of ["icon", "shaded", "model"]) {
      await page.getByLabel("Piece style").selectOption(variant);
      await expect(page.locator(".token-choice svg")).toBeVisible();
    }
    await expect(page.locator(".token-choice svg")).toHaveAttribute(
      "aria-label",
      (await select.locator("option:checked").textContent()) || "",
    );
  }
});

test("tooltip preference changes board titles without disabling deeds", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Tile tooltips").uncheck();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mumbai, Maharashtra" }),
  ).not.toHaveAttribute("title");
});
test("missing licensed photograph uses the original city illustration", async ({
  page,
}) => {
  await page.route("**/art/city-39.webp", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Play Game", exact: false }).click();
  await page.getByRole("button", { name: "Local Pass-and-Play" }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  await page.getByRole("button", { name: "Mumbai, Maharashtra" }).click();
  await expect(page.locator(".deed-image")).toHaveAttribute(
    "src",
    /city-39.svg/,
  );
});
