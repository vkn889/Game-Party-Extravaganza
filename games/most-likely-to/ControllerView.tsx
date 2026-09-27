'use client';

import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import type { MostLikelyToPublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<MostLikelyToPublic | null>(view);
  const mine = priv<{ voted: string | null }>(view);
  if (!data || view.phase !== 'vote' || !mine) return <LookAtScreen />;
  if (mine.voted) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="Vote locked in!" />;
  return (
    <div>
      <PhoneTitle sub={data.mode === 'meOrYou' ? 'Score when you agree with the others.' : 'Score by voting with the majority.'}>{data.prompt}</PhoneTitle>
      <VoteGrid
        options={view.players
          .filter((p) => p.inGame)
          .map((p) => ({ id: p.id, label: p.id === view.me ? `${p.name} (me)` : p.name, color: p.color }))}
        onVote={(id) => send({ type: 'VOTE', choiceId: id })}
      />
    </div>
  );
}
