import { test, expect } from "@playwright/test";

test("production guests synchronise, reconnect, and reset a real match", async ({
  browser,
}) => {
  test.skip(
    process.env.TEST_ONLINE !== "1",
    "Requires an explicitly configured live backend",
  );
  test.setTimeout(150000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  for (const page of [host, guest])
    page.on("pageerror", (error) => errors.push(error.message));
  const origin = process.env.TEST_BASE_URL!;
  try {
    await host.goto(origin);
    await host.getByRole("button", { name: "Play Game", exact: false }).click();
    await host.getByLabel("Display name").fill("QA Host");
    await host
      .getByRole("button", { name: "Create Room", exact: true })
      .click();
    await expect(
      host.getByText("Connected · authoritative server"),
    ).toBeVisible({ timeout: 45000 });
    const code = (await host.locator(".invite code").textContent())!;
    await guest.goto(`${origin}/?room=${code}`);
    await guest.getByLabel("Display name").fill("QA Guest");
    await guest.getByLabel("Board piece").selectOption("1");
    await guest.getByRole("button", { name: "Join Room", exact: true }).click();
    await expect(
      guest.getByText("Connected · authoritative server"),
    ).toBeVisible({ timeout: 45000 });
    await expect(
      host.locator(".seat").filter({ hasText: "QA Guest" }),
    ).toBeVisible();
    const hostCookie = (await hostContext.cookies()).find(
      (c) => c.name === "imm_guest",
    )!;
    const guestCookie = (await guestContext.cookies()).find(
      (c) => c.name === "imm_guest",
    )!;
    expect(hostCookie.value).not.toBe(guestCookie.value);
    expect(hostCookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
    await host.getByRole("button", { name: "I’m ready", exact: true }).click();
    await expect(
      guest.locator(".seat").filter({ hasText: "QA Host" }),
    ).toContainText("Ready");
    await guest.getByRole("button", { name: "I’m ready", exact: true }).click();
    await expect(
      host.locator(".seat").filter({ hasText: "QA Guest" }),
    ).toContainText("Ready");
    await host
      .getByRole("button", { name: "Start match", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "Roll dice", exact: true }),
    ).toBeEnabled();
    await expect(guest.getByText("₹1,500 · 0 deeds")).toHaveCount(2);
    await host.getByRole("button", { name: "Roll dice", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "Roll dice", exact: true }),
    ).not.toBeVisible();
    await host
      .getByRole("textbox", { name: "Room chat message" })
      .fill("<script>window.qaInjected=true</script>");
    await host.getByRole("button", { name: "Send", exact: true }).click();
    await expect(
      guest.getByText("QA Host: <script>window.qaInjected=true</script>", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await guest.evaluate(() => Reflect.get(window, "qaInjected")),
    ).toBeUndefined();
    await guest.reload();
    await expect(
      guest.getByText("Connected · authoritative server"),
    ).toBeVisible({ timeout: 45000 });
    expect(
      (await guestContext.cookies()).find((c) => c.name === "imm_guest")!.value,
    ).toBe(guestCookie.value);
    await host.getByText("Room controls", { exact: true }).click();
    host.once("dialog", (dialog) => void dialog.accept());
    await host
      .getByRole("button", { name: "Reset room by vote", exact: true })
      .click();
    await expect(
      guest.getByRole("button", { name: "Vote Yes", exact: true }),
    ).toBeVisible();
    await guest.getByRole("button", { name: "Vote Yes", exact: true }).click();
    await expect(
      host.getByText("Your private room", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByText("Your private room", { exact: true }),
    ).toBeVisible();
    await host.screenshot({
      path: "screenshots/online-lobby.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
