import { Tv } from 'lucide-react';

/** Phone placeholder while the action is on the big screen. */
export function LookAtScreen({ title = 'Eyes on the big screen!', detail }: { title?: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Tv aria-hidden className="h-16 w-16 text-mint" strokeWidth={1.75} />
      <p className="font-display text-2xl font-semibold">{title}</p>
      {detail && <p className="text-lg text-peach/85">{detail}</p>}
    </div>
  );
}
