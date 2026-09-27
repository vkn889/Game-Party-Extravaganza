'use client';

import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { TextEntry } from '@/components/shared/TextEntry';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { WaitingScreen } from '@/components/shared/WaitingScreen';
import { PhoneTitle, PromptBox, priv, pub } from '@/games/shared/phone';
import type { ControllerViewProps } from '@/lib/types';
import type { PunchlinePrivate, PunchlinePublic } from './logic';

export default function ControllerView({ view, send }: ControllerViewProps) {
  const data = pub<PunchlinePublic>(view);
  const mine = priv<PunchlinePrivate>(view);

  if (view.phase === 'answer' && mine?.kind === 'answer') {
    const task = mine.tasks.find((t) => !t.answered);
    if (!task) return <WaitingScreen players={view.players} submittedIds={view.submittedIds} message="All answered! Waiting for the others." />;
    const index = mine.tasks.indexOf(task) + 1;
    return (
      <div>
        <PhoneTitle sub={mine.tasks.length > 1 ? `Prompt ${index} of ${mine.tasks.length}` : undefined}>Finish the prompt</PhoneTitle>
        <PromptBox>{task.prompt}</PromptBox>
        <TextEntry
          key={task.matchupId}
          label="Your answer"
          placeholder="Make them laugh"
          onSubmit={(text) => send({ type: 'SUBMIT', payload: { matchupId: task.matchupId, text } })}
        />
      </div>
    );
  }

  if (view.phase === 'vote' && mine?.kind === 'vote' && data.matchup) {
    if (!mine.canVote) return <LookAtScreen title="Your answer is up!" detail="Everyone else is voting. Fingers crossed." />;
    if (mine.votedFor || view.submitted) return <LookAtScreen title="Vote locked in!" detail="Watch the big screen for the reveal." />;
    return (
      <div>
        <PhoneTitle sub="Pick your favorite">{data.matchup.prompt}</PhoneTitle>
        <VoteGrid
          options={data.matchup.options
            .filter((o) => !o.missing)
            .map((o) => ({ id: o.id, label: o.text, disabled: o.id === mine.ownAnswerId, disabledReason: 'Your answer' }))}
          onVote={(id) => send({ type: 'VOTE', choiceId: id })}
        />
      </div>
    );
  }

  return <LookAtScreen />;
}
