import { expect, test } from '@playwright/test';
import { closeAll, joinMany, joinPhone, openHost } from './helpers';

test('players join by code, appear in the lobby fast, and the first one is VIP', async ({ browser }) => {
  const host = await openHost(browser);
  const started = Date.now();
  const [vip, second] = await joinMany(browser, host.code, 2);
  // FR-2 / success metric: join to lobby well under 15 s.
  expect(Date.now() - started).toBeLessThan(30_000);
  await expect(host.page.getByText('P1', { exact: true })).toBeVisible({ timeout: 1_500 });
  await expect(host.page.getByText('P2', { exact: true })).toBeVisible({ timeout: 1_500 });
  await expect(vip.page.getByText("You're the VIP!")).toBeVisible();
  await expect(second.page.getByText("You're in!")).toBeVisible();

  // Duplicate names get a number suffix.
  const dupe = await joinPhone(browser, host.code, 'P1');
  await expect(host.page.getByText('P12', { exact: true })).toBeVisible();

  // The VIP can kick a player.
  await vip.page.getByRole('button', { name: 'Kick' }).last().click();
  await vip.page.getByRole('button', { name: 'Tap to confirm' }).click();
  await expect(dupe.page.getByText('You were removed from the room.')).toBeVisible();
  await expect(host.page.getByText('P12', { exact: true })).toBeHidden();

  await closeAll(host.context, vip.context, second.context, dupe.context);
});

test('the ninth person joins as audience and can vote', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 8);
  const audience = await joinMany(browser, host.code, 1, 'Aud');
  await expect(audience[0].page.getByText("You're in the audience!")).toBeVisible();
  await expect(host.page.getByText('1 in the audience')).toBeVisible();

  await phones[0].page.getByRole('button', { name: /^Most Likely To/ }).click();
  await phones[0].page.getByRole('button', { name: 'Start Most Likely To' }).click();
  await expect(audience[0].page.getByText('Audience vote')).toBeVisible({ timeout: 30_000 });
  await audience[0].page.getByRole('button', { name: 'P2' }).click();
  await expect(audience[0].page.getByText('Vote counted!')).toBeVisible();
  await expect(host.page.getByText(/1 vote in/)).toBeVisible();

  await closeAll(host.context, ...phones.map((p) => p.context), audience[0].context);
});
