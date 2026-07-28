import { expect, test } from "@playwright/test";

test("links públicos navegam no cliente e movimento reduzido é respeitado @a11y", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");

  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("link", { name: "Privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);

  const card = page.locator(".legal-card");
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
});

test("shell e dados são progressivos sem recarga completa", async ({ context, page }) => {
  await context.addCookies([
    {
      name: "gm-access",
      value: "synthetic-access-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);

  const navigation = page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-shell--loading")).toBeVisible();
  await navigation;
  await expect(page.getByRole("heading", { name: "O que merece atenção agora" })).toBeVisible();

  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("link", { name: "Abrir quadro" }).click();
  await expect(page.getByRole("heading", { name: "Tarefas" })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});

test("mutation bloqueia clique duplicado e anuncia o estado pendente @a11y", async ({
  context,
  page
}) => {
  await context.addCookies([
    {
      name: "gm-access",
      value: "synthetic-access-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  await page.goto("/app/tasks");
  await page.getByLabel("Título").fill("Tarefa sintética");
  await page.getByRole("button", { name: "Criar tarefa" }).click();

  const pendingButton = page.getByRole("button", { name: /Criando/ });
  await expect(pendingButton).toBeDisabled();
  await expect(pendingButton.locator('[aria-live="polite"]')).toContainText("Criando…");
  await expect(page.getByRole("button", { name: "Criar tarefa" })).toBeEnabled();
});
