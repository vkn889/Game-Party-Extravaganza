import type { AnyGameModule } from '@/lib/realtime/hostEngine';
import type { GameSlug } from '@/lib/types';
import { auctionChaos } from './auction-chaos';
import { bluffBuffet } from './bluff-buffet';
import { buzzerBlitz } from './buzzer-blitz';
import { doodleTelephone } from './doodle-telephone';
import { emojiDecode } from './emoji-decode';
import { handsUpHoax } from './hands-up-hoax';
import { imposter } from './imposter';
import { killerQuiz } from './killer-quiz';
import { mostLikelyTo } from './most-likely-to';
import { punchline } from './punchline';
import { shirtShowdown } from './shirt-showdown';
import { sketchyLies } from './sketchy-lies';
import { statSnoop } from './stat-snoop';
import { twoTruths } from './two-truths';
import { wordBomb } from './word-bomb';

/** All 15 GameModules (SRD §7). Used by the host, which runs the game logic. */
export const GAMES: Record<GameSlug, AnyGameModule> = {
  punchline,
  'killer-quiz': killerQuiz,
  'stat-snoop': statSnoop,
  'shirt-showdown': shirtShowdown,
  'hands-up-hoax': handsUpHoax,
  imposter,
  'sketchy-lies': sketchyLies,
  'bluff-buffet': bluffBuffet,
  'most-likely-to': mostLikelyTo,
  'doodle-telephone': doodleTelephone,
  'buzzer-blitz': buzzerBlitz,
  'emoji-decode': emojiDecode,
  'auction-chaos': auctionChaos,
  'word-bomb': wordBomb,
  'two-truths': twoTruths,
};
