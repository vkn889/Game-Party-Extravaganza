import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { loadDictionary } from './dictionary';
import { HostView } from './HostView';
import * as logic from './logic';

export const wordBomb: GameModule<logic.WordBombState> = {
  slug: 'word-bomb',
  name: GAME_META['word-bomb'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['word-bomb'],
  prepare: () => loadDictionary(),
  init: logic.init,
  onAction: logic.onAction,
  onTimerEnd: logic.onTimerEnd,
  isStepComplete: logic.isStepComplete,
  publicView: logic.publicView,
  privateView: logic.privateView,
  audienceVote: logic.audienceVote,
  isOver: logic.isOver,
  winners: logic.winners,
  HostView,
  ControllerView,
};
