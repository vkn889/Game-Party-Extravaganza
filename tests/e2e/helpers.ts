import { devices, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Phone {
  context: BrowserContext;
  page: Page;
  name: string;
}

export async function openHost(browser: Browser): Promise<{ page: Page; code: string; context: BrowserContext }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/host');
  const code = page.getByLabel(/^Room code [A-Z]( [A-Z]){3}$/);
  await expect(code).toBeVisible({ timeout: 30_000 });
  const text = (await code.textContent())!.trim();
  expect(text).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  return { page, code: text, context };
}

export async function joinPhone(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  await page.goto(`/join?code=${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await page.waitForURL(`**/play/${code}`);
  await expect(page.getByText(/You're in!|You're the VIP!|in the audience/)).toBeVisible({ timeout: 20_000 });
  return { context, page, name };
}

export async function joinMany(browser: Browser, code: string, count: number, prefix = 'P'): Promise<Phone[]> {
  const phones: Phone[] = [];
  for (let i = 0; i < count; i++) phones.push(await joinPhone(browser, code, `${prefix}${i + 1}`));
  return phones;
}

/** VIP picks a game and starts it. */
export async function startGame(vip: Page, gameName: string) {
  await vip.getByRole('button', { name: new RegExp(`^${gameName}`) }).click();
  const start = vip.getByRole('button', { name: `Start ${gameName}` });
  await expect(start).toBeEnabled();
  await start.click();
}

/** VIP skips every phase until the results screen (exercises FR-13 and each game's flow). */
export async function skipToResults(vip: Page, host: Page, maxSkips = 400) {
  const playAgain = vip.getByRole('button', { name: 'Play again' });
  const skip = vip.getByRole('button', { name: 'Skip phase' });
  for (let i = 0; i < maxSkips; i++) {
    if (await playAgain.isVisible()) break;
    if (await skip.isVisible()) await skip.click().catch(() => {});
    await vip.waitForTimeout(250);
  }
  await expect(playAgain).toBeVisible();
  await expect(host.getByText(/results$/)).toBeVisible();
}

export async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
}
