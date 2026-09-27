import type { GameSlug } from '@/lib/types';

export type PatternKind =
  | 'dots'
  | 'stripes'
  | 'grid'
  | 'zigzag'
  | 'waves'
  | 'confetti'
  | 'checks'
  | 'rings'
  | 'diamonds'
  | 'plus'
  | 'bolts'
  | 'bubbles'
  | 'coins'
  | 'sparks'
  | 'hearts';

export interface GameMeta {
  slug: GameSlug;
  name: string;
  tagline: string;
  howToPlay: string;
  smallGroupRule: string;
  minutes: number;
  minPlayers: 2;
  maxPlayers: 8;
  drawing: boolean;
  /** Lucide icon name, resolved by components/shared/GameIcon. */
  icon: string;
  accent: string;
  pattern: PatternKind;
}

// Metadata only, so the phone bundle can list games without loading game logic.
export const GAME_META: Record<GameSlug, GameMeta> = {
  punchline: {
    slug: 'punchline',
    name: 'Punchline',
    tagline: 'Fill in the blank. Win the room.',
    howToPlay:
      'Two players answer the same fill-in-the-blank prompt and everyone else votes for the funnier one. Three rounds; in the final round everyone answers one prompt.',
    smallGroupRule:
      'With 2 or 3 players, everyone answers every prompt next to a House answer. Vote for the best answer that is not yours and score for beating the House.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'MessageSquareQuote',
    accent: '#E086D3',
    pattern: 'confetti',
  },
  'killer-quiz': {
    slug: 'killer-quiz',
    name: 'Killer Quiz',
    tagline: 'Answer wrong. Survive the minigame.',
    howToPlay:
      'Trivia questions where a wrong answer sends you to a death minigame: dice, memory or quick math. Losers become ghosts, and the finale is a race to the exit that ghosts can still win.',
    smallGroupRule: 'Works as is. With 2 players the finale is a head-to-head race.',
    minutes: 20,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Skull',
    accent: '#BAD1CD',
    pattern: 'diamonds',
  },
  'stat-snoop': {
    slug: 'stat-snoop',
    name: 'Stat Snoop',
    tagline: 'Guess the percentage. Bet on the guess.',
    howToPlay:
      'One player sets a percentage guess for a survey question on a slider. Everyone else bets higher, lower, much higher or much lower. Turns rotate.',
    smallGroupRule: 'Works as is: guesser and bettor swap each question.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Percent',
    accent: '#F2D1C9',
    pattern: 'grid',
  },
  'shirt-showdown': {
    slug: 'shirt-showdown',
    name: 'Shirt Showdown',
    tagline: 'Draw it. Slogan it. Wear the crown.',
    howToPlay:
      'Draw designs and write slogans, then combine pieces from the shared pool into shirts. Shirts battle in a bracket by vote.',
    smallGroupRule:
      'With 2 or 3 players, each player builds 2 shirts and every matchup is your shirt against a House remix, judged by the other players.',
    minutes: 20,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: true,
    icon: 'Shirt',
    accent: '#E086D3',
    pattern: 'stripes',
  },
  'hands-up-hoax': {
    slug: 'hands-up-hoax',
    name: 'Hands Up Hoax',
    tagline: 'Everyone has a task. One of you is faking.',
    howToPlay:
      'Everyone gets a secret task (raise a hand, point at someone, hold up fingers) except the faker, who must blend in. Then the group votes on the faker.',
    smallGroupRule:
      'With 2 or 3 players, maybe-faker mode: each round there may be 0, 1 or 2 fakers, and you guess whether each other player is faking.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Hand',
    accent: '#BAD1CD',
    pattern: 'plus',
  },
  imposter: {
    slug: 'imposter',
    name: 'Imposter',
    tagline: 'One word. One liar.',
    howToPlay:
      'Everyone sees the same secret word except the imposter. Give one-word clues in turn, then vote. A caught imposter can still win by guessing the word.',
    smallGroupRule:
      'With 2 or 3 players, double-blind mode: each player gets a word that may or may not match (a close decoy). After clues, guess whether you share the word.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'VenetianMask',
    accent: '#8332AC',
    pattern: 'rings',
  },
  'sketchy-lies': {
    slug: 'sketchy-lies',
    name: 'Sketchy Lies',
    tagline: 'Draw weird. Lie well.',
    howToPlay:
      'Draw a weird prompt, then everyone writes fake titles for each drawing and tries to pick the real one. Score for finding the truth and for fooling others.',
    smallGroupRule: 'With 2 or 3 players, 2 House decoy titles join each drawing so there are always at least 4 options.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: true,
    icon: 'Brush',
    accent: '#F2D1C9',
    pattern: 'zigzag',
  },
  'bluff-buffet': {
    slug: 'bluff-buffet',
    name: 'Bluff Buffet',
    tagline: 'Serve up a lie. Sniff out the truth.',
    howToPlay:
      'An obscure fact with a blank appears. Everyone writes a believable lie, then tries to pick the truth from the spread.',
    smallGroupRule: 'House lies fill the list to at least 4 options.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'UtensilsCrossed',
    accent: '#E086D3',
    pattern: 'checks',
  },
  'most-likely-to': {
    slug: 'most-likely-to',
    name: 'Most Likely To',
    tagline: 'Who would? Vote with the crowd.',
    howToPlay:
      '"Who is most likely to..." prompts. Vote anonymously for a player and score by matching the majority.',
    smallGroupRule: 'With 2 or 3 players it becomes "me or you?": everyone picks, and you score when you agree.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Users',
    accent: '#BAD1CD',
    pattern: 'hearts',
  },
  'doodle-telephone': {
    slug: 'doodle-telephone',
    name: 'Doodle Telephone',
    tagline: 'Write. Draw. Describe. Laugh.',
    howToPlay:
      'Write a sentence, the next person draws it, the next describes the drawing, and so on. The chain reveal is the payoff, and votes pick the best link.',
    smallGroupRule: 'With 2 or 3 players, chains loop around the group twice so every book has at least 4 steps.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: true,
    icon: 'Phone',
    accent: '#F2D1C9',
    pattern: 'waves',
  },
  'buzzer-blitz': {
    slug: 'buzzer-blitz',
    name: 'Buzzer Blitz',
    tagline: 'Fastest thumb wins.',
    howToPlay:
      'Phones become buzzers. First correct answer scores; a wrong answer locks you out for that question.',
    smallGroupRule: 'Works as is.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'BellRing',
    accent: '#E086D3',
    pattern: 'bolts',
  },
  'emoji-decode': {
    slug: 'emoji-decode',
    name: 'Emoji Decode',
    tagline: 'Read the pictures. Type it first.',
    howToPlay:
      'A movie, song or phrase appears in emojis. First to type it scores the most; small typos are forgiven.',
    smallGroupRule: 'Works as is.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Smile',
    accent: '#BAD1CD',
    pattern: 'bubbles',
  },
  'auction-chaos': {
    slug: 'auction-chaos',
    name: 'Auction Chaos',
    tagline: 'Jackpot, dud or cursed?',
    howToPlay:
      'Bid fake cash on mystery boxes full of jackpots, duds and cursed items. Most money at the end wins.',
    smallGroupRule: 'With 2 or 3 players, a House bidder with a hidden max bid joins every auction.',
    minutes: 15,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Gavel',
    accent: '#F2D1C9',
    pattern: 'coins',
  },
  'word-bomb': {
    slug: 'word-bomb',
    name: 'Word Bomb',
    tagline: 'Type a word before it blows.',
    howToPlay:
      'A letter combo appears. The active player types a real word containing it before the bomb goes off. Three lives each; last one standing wins.',
    smallGroupRule: 'Works as is.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'Bomb',
    accent: '#E086D3',
    pattern: 'sparks',
  },
  'two-truths': {
    slug: 'two-truths',
    name: 'Two Truths and a Lie',
    tagline: 'How well do you know your friends?',
    howToPlay:
      'Everyone writes 2 truths and 1 lie about themselves, and the others guess the lie. Score for correct guesses and for fooling people.',
    smallGroupRule: 'Works as is: the other player guesses.',
    minutes: 10,
    minPlayers: 2,
    maxPlayers: 8,
    drawing: false,
    icon: 'ScrollText',
    accent: '#BAD1CD',
    pattern: 'dots',
  },
};

export const GAME_LIST: GameMeta[] = Object.values(GAME_META);

/** Why a game can't be played with this many players, or null if it can. */
export function unsupportedReason(meta: GameMeta, playerCount: number): string | null {
  if (playerCount < meta.minPlayers) {
    const missing = meta.minPlayers - playerCount;
    return `Needs ${missing} more player${missing === 1 ? '' : 's'} (${meta.minPlayers} to ${meta.maxPlayers})`;
  }
  if (playerCount > meta.maxPlayers) {
    return `Too many players: ${meta.maxPlayers} max`;
  }
  return null;
}
