'use client';

import { useEffect, useState } from 'react';
import { LookAtScreen } from '@/components/shared/LookAtScreen';
import { VoteGrid } from '@/components/shared/VoteGrid';
import { REACTIONS } from '@/lib/reactions';
import type { AudienceVote } from '@/lib/types';

/**
 * Audience members (FR-14) and players who joined mid-game: vote in any vote
 * phase (counted together as one bonus vote) and send reactions.
 */
export function AudienceView({
  vote,
  step,
  title,
  onVote,
  onReact,
}: {
  vote: AudienceVote | null;
  step: number;
  title: string;
  onVote: (id: string) => void;
  onReact: (emoji: string) => void;
}) {
  const [voted, setVoted] = useState<{ step: number; id: string } | null>(null);
  useEffect(() => setVoted((v) => (v && v.step === step ? v : null)), [step]);
  return (
    <div className="flex flex-col gap-6">
      {vote ? (
        voted ? (
          <LookAtScreen title="Vote counted!" detail="The audience's votes combine into one bonus vote." />
        ) : (
          <div>
            <p className="font-display mb-1 text-sm font-semibold uppercase tracking-wide text-mint">Audience vote</p>
            <h2 className="font-display mb-4 text-2xl font-bold">{vote.prompt}</h2>
            <VoteGrid
              options={vote.options}
              onVote={(id) => {
                setVoted({ step, id });
                onVote(id);
              }}
            />
          </div>
        )
      ) : (
        <LookAtScreen title={title} detail="You can vote whenever there's a vote, and react any time." />
      )}
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Send a reaction">
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => onReact(emoji)} aria-label={`React ${emoji}`} className="h-14 rounded-2xl bg-plum-raised text-3xl hover:bg-purple">
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
