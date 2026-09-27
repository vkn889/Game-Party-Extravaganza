import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { HostView } from './HostView';
import * as logic from './logic';

export const handsUpHoax: GameModule<logic.HandsUpHoaxState> = {
  slug: 'hands-up-hoax',
  name: GAME_META['hands-up-hoax'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['hands-up-hoax'],
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
