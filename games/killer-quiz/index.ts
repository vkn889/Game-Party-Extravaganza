import { GAME_META } from '@/games/meta';
import type { GameModule } from '@/lib/types';
import ControllerView from './ControllerView';
import { HostView } from './HostView';
import * as logic from './logic';

export const killerQuiz: GameModule<logic.KillerQuizState> = {
  slug: 'killer-quiz',
  name: GAME_META['killer-quiz'].name,
  minPlayers: 2,
  maxPlayers: 8,
  packs: ['killer-quiz', 'killer-quiz-finale'],
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
