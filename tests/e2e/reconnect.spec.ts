import { expect, test } from '@playwright/test';
import { closeAll, joinMany, openHost, startGame } from './helpers';

test('a phone refresh mid-round keeps the same seat and score (FR-8)', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 3);
  await startGame(phones[0].page, 'Most Likely To');
  const vote = phones[1].page.getByRole('button', { name: 'P2 (me)' });
  await expect(vote).toBeVisible({ timeout: 30_000 });
  await phones[1].page.reload();
  await expect(phones[1].page.getByRole('button', { name: 'P2 (me)' })).toBeVisible({ timeout: 30_000 });
  await expect(host.page.getByText('P2', { exact: true }).first()).toBeVisible();
  await expect(host.page.getByText(/^P2\d/)).toHaveCount(0); // no duplicate seat
  await closeAll(host.context, ...phones.map((p) => p.context));
});

test('the game pauses below 2 connected players and resumes (FR-10)', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 2);
  await startGame(phones[0].page, 'Most Likely To');
  await expect(phones[1].page.getByRole('button', { name: 'P2 (me)' })).toBeVisible({ timeout: 30_000 });
  await phones[1].context.setOffline(true);
  await expect(host.page.getByText('Waiting for players…')).toBeVisible({ timeout: 60_000 });
  await phones[1].context.setOffline(false);
  await expect(host.page.getByText('Waiting for players…')).toBeHidden({ timeout: 60_000 });
  await closeAll(host.context, ...phones.map((p) => p.context));
});

test('a host refresh restores the game from the snapshot (FR-9)', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 2);
  await startGame(phones[0].page, 'Emoji Decode');
  await expect(phones[0].page.getByLabel('Your guess')).toBeVisible({ timeout: 30_000 });
  await host.page.waitForTimeout(1500); // let the debounced snapshot save
  await host.page.reload();
  await expect(host.page.getByText(/Puzzle \d+ of 10/)).toBeVisible({ timeout: 30_000 });
  await expect(host.page.getByLabel(`Room code ${host.code}`)).toBeVisible();
  await expect(phones[1].page.getByLabel('Your guess')).toBeVisible();
  await closeAll(host.context, ...phones.map((p) => p.context));
});
