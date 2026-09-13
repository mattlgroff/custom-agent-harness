import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.skip(
  process.env.RUN_LIVE !== "1",
  "Explicit RUN_LIVE=1 is required; this test uses the configured paid model.",
);
test("real streamed proposal, database restart, human approval and follow-up", async ({
  page,
}) => {
  test.setTimeout(180000);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: /01 Eligible replacement/ }).click();
  await expect(
    page.getByRole("heading", { name: "A mug arrived broken", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message the support assistant" })
    .fill("Let's replace it for them.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("heading", { name: "Replacement proposed" }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save replacement proposal Completed" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Suggested replies").getByRole("button").first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/live-proposal.png",
    fullPage: true,
  });
  const suggestion = page
    .getByLabel("Suggested replies")
    .getByRole("button")
    .first();
  const reply = await suggestion.innerText();
  await suggestion.click();
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 90000 });
  // The chip submits a normal text turn and is retained after a reload.
  await expect(page.getByText(reply, { exact: true }).first()).toBeVisible();
  // Restart only this project's database. Persisted state must remain independent of the request.
  execFileSync("docker", ["compose", "restart", "postgres"], {
    stdio: "pipe",
    timeout: 30000,
  });
  execFileSync("docker", ["compose", "up", "-d", "--wait"], {
    stdio: "pipe",
    timeout: 30000,
  });
  await page.reload();
  await expect(page.getByText(reply, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Replacement proposed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unlock reviewer controls" }).click();
  await page
    .getByLabel("Local reviewer token")
    .fill(process.env.OPERATOR_TOKEN!);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Replacement recorded" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message the support assistant" })
    .fill(
      "The reviewer has made a decision. Check the saved resolution and tell me what happened.",
    );
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(
    page.getByRole("button", { name: "Check resolution Completed" }).last(),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/live-approved.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Check resolution Completed" }).last(),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});
