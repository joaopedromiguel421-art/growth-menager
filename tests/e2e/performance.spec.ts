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
  await expect(page.getByRole("link", { name: "Tarefas" })).toHaveAttribute("aria-current", "page");
});

test("menu móvel abre, informa seu estado e fecha sem perder contexto @a11y", async ({
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

  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Abrir menu" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await page.getByRole("button", { name: "Fechar menu", exact: true }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
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

test("módulos operacionais exibem telas funcionais em vez de placeholders", async ({
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

  for (const [path, heading] of [
    ["/app/content", "Conteúdo"],
    ["/app/calendar", "Calendário"],
    ["/app/alerts", "Alertas"],
    ["/app/reports", "Relatórios"],
    ["/app/costs", "Custos"],
    ["/app/settings/brand", "Marca"]
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText(/ainda não está disponível/i)).toHaveCount(0);
  }
});
