import { expect, test } from '@playwright/test';
import { closeAll, joinMany, openHost, startGame } from './helpers';

test('Most Likely To played with real votes to the results screen', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 2);
  await startGame(phones[0].page, 'Most Likely To');
  for (let round = 0; round < 10; round++) {
    for (const phone of phones) {
      const me = phone.page.getByRole('button', { name: `${phone.name} (me)` });
      await expect(me).toBeVisible({ timeout: 30_000 });
      await me.click();
      await expect(phone.page.getByText('Vote locked in!')).toBeVisible();
    }
    // Both voted: the host reveals immediately, then moves on.
    await expect(host.page.getByText(/votes$/).first()).toBeVisible();
  }
  await expect(phones[0].page.getByRole('button', { name: 'Play again' })).toBeVisible({ timeout: 30_000 });
  await phones[0].page.getByRole('button', { name: 'Back to lobby' }).click();
  await expect(phones[1].page.getByText("You're in!")).toBeVisible();
  await closeAll(host.context, ...phones.map((p) => p.context));
});

test('Punchline: typed answers show up anonymously on the host', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 2);
  await startGame(phones[0].page, 'Punchline');
  for (const phone of phones) {
    for (let i = 0; i < 2; i++) {
      const field = phone.page.getByLabel('Your answer');
      await expect(field).toBeVisible({ timeout: 30_000 });
      await field.fill(`${phone.name} answer ${i}`);
      await phone.page.getByRole('button', { name: 'Send' }).click();
    }
  }
  await expect(host.page.getByText('P1 answer 0')).toBeVisible({ timeout: 30_000 });
  await closeAll(host.context, ...phones.map((p) => p.context));
});
