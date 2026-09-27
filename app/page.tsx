import { MonitorPlay, Smartphone, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { GameIcon } from '@/components/shared/GameIcon';
import { GAME_LIST } from '@/games/meta';

const STEPS = [
  { icon: MonitorPlay, title: 'Open a room on a big screen', text: 'A laptop or TV hosts. You get a 4-letter code and a QR code.' },
  { icon: Smartphone, title: 'Join from any phone', text: 'Scan the code or type it in. No app, no accounts.' },
  { icon: Sparkles, title: 'Play all night', text: 'Pick from 15 games. Everyone returns to the lobby between games.' },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-10 sm:px-8 sm:py-16">
      <section className="flex flex-col items-center gap-8 text-center">
        <p className="font-display rounded-full bg-plum-raised px-4 py-1 text-mint">15 party games · 2 to 8 players · up to 50 in the audience</p>
        <h1 className="font-display text-5xl font-bold leading-tight sm:text-7xl">
          Game Party <span className="text-pink">Extravaganza</span>
        </h1>
        <p className="max-w-2xl text-xl text-peach/90">The easiest way to turn any screen and a group of phones into game night.</p>
        <div className="flex w-full max-w-md flex-col gap-4 sm:flex-row">
          <Link
            href="/host"
            className="font-display flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-purple px-6 text-xl font-semibold text-peach shadow-card-sm transition-colors duration-200 hover:brightness-110"
          >
            <MonitorPlay aria-hidden className="h-6 w-6" /> Host a game
          </Link>
          <Link
            href="/join"
            className="font-display flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-mint px-6 text-xl font-semibold text-plum shadow-card-sm transition-colors duration-200 hover:brightness-105"
          >
            <Smartphone aria-hidden className="h-6 w-6" /> Join a game
          </Link>
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-6">
        <h2 id="how" className="font-display text-3xl font-bold">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3 rounded-3xl bg-plum-raised p-6 shadow-card">
              <span className="flex items-center gap-3">
                <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-pink text-xl font-bold text-plum">{i + 1}</span>
                <step.icon aria-hidden className="h-7 w-7 text-mint" />
              </span>
              <h3 className="font-display text-xl font-bold">{step.title}</h3>
              <p className="text-peach/85">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="games" className="flex flex-col gap-6">
        <h2 id="games" className="font-display flex items-center gap-3 text-3xl font-bold">
          <Users aria-hidden className="h-7 w-7 text-pink" /> The games
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_LIST.map((g) => (
            <li key={g.slug} className="flex gap-4 rounded-3xl bg-plum-raised p-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-purple text-peach">
                <GameIcon slug={g.slug} className="h-8 w-8" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-xl font-bold">{g.name}</h3>
                <p className="text-sm text-mint">
                  {g.minPlayers} to {g.maxPlayers} players · about {g.minutes} min
                </p>
                <p className="text-peach/85">{g.tagline}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-peach/15 pt-6 text-sm text-peach/70">
        Every game is an original take on a classic party format. No accounts, no ads, nothing to install.
      </footer>
    </main>
  );
}
