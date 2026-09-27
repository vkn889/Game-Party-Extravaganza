import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { HostView } from './HostView';
import * as logic from './logic';

export const sketchyLies: GameModule<logic.SketchyLiesState> = {
  slug: 'sketchy-lies',
  name: GAME_META['sketchy-lies'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['sketchy-lies'],
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
