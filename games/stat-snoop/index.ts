import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { HostView } from './HostView';
import * as logic from './logic';

export const statSnoop: GameModule<logic.StatSnoopState> = {
  slug: 'stat-snoop',
  name: GAME_META['stat-snoop'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['stat-snoop'],
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
