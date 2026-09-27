import { test } from '@playwright/test';
import { GAME_LIST } from '../../games/meta';
import { closeAll, joinMany, openHost, skipToResults, startGame } from './helpers';

// Every game, with 2 and with 8 phones, from start to the results screen.
for (const players of [2, 8]) {
  for (const game of GAME_LIST) {
    test(`${game.name} reaches results with ${players} players`, async ({ browser }) => {
      const host = await openHost(browser);
      const phones = await joinMany(browser, host.code, players);
      await startGame(phones[0].page, game.name);
      await skipToResults(phones[0].page, host.page);
      await closeAll(host.context, ...phones.map((p) => p.context));
    });
  }
}
