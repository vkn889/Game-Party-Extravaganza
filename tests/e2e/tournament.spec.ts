import { expect, test } from '@playwright/test';
import { closeAll, joinMany, openHost } from './helpers';

test('tournament mode plays two games back to back and crowns a champion', async ({ browser }) => {
  const host = await openHost(browser);
  const phones = await joinMany(browser, host.code, 2);
  const vip = phones[0].page;
  await vip.getByRole('radio', { name: /Tournament/ }).click();
  await vip.getByRole('button', { name: /^Most Likely To/ }).click();
  await vip.getByRole('button', { name: /^Emoji Decode/ }).click();
  await vip.getByRole('button', { name: 'Start tournament (2 games)' }).click();
  await expect(host.page.getByText('Tournament · Game 1 of 2')).toBeVisible({ timeout: 30_000 });

  for (let game = 0; game < 2; game++) {
    const done = game === 0 ? vip.getByRole('button', { name: 'Start next game now' }) : vip.getByText('Tournament over!');
    for (let i = 0; i < 300 && !(await done.isVisible()); i++) {
      const skip = vip.getByRole('button', { name: 'Skip phase' });
      if (await skip.isVisible()) await skip.click().catch(() => {});
      await vip.waitForTimeout(250);
    }
    await expect(done).toBeVisible();
    if (game === 0) await done.click();
  }
  await expect(host.page.getByText('Tournament champion')).toBeVisible();
  await closeAll(host.context, ...phones.map((p) => p.context));
});
