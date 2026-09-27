import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { HostView } from './HostView';
import * as logic from './logic';

export const buzzerBlitz: GameModule<logic.BuzzerBlitzState> = {
  slug: 'buzzer-blitz',
  name: GAME_META['buzzer-blitz'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['buzzer-blitz'],
  init: logic.init,
  onAction: logic.onAction,
  onTimerEnd: logic.onTimerEnd,
  isStepComplete: logic.isStepComplete,
  publicView: logic.publicView,
  privateView: logic.privateView,
  audienceVote: logic.audienceVote,
  isOver: logic.isOver,
  HostView,
  ControllerView,
};
