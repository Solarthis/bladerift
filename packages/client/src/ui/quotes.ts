/**
 * What each hero says: a line on the VS screen before the first round, and one when they win the match (hero id order).
 * Original lines in each legend's voice; Gilgamesh's are as condescending as his folded arms.
 */
export interface HeroQuotes {
  vs: string;
  win: string;
}
export const QUOTES: HeroQuotes[] = [
  { vs: 'Ride with me, or fall before me.', win: 'God willed it. So did my sword.' },
  { vs: 'Twelve labours. You would be the thirteenth?', win: 'The venom does the rest.' },
  { vs: 'You may look upon me. Briefly.', win: 'Be grateful. Few are struck down by gold.' },
  { vs: 'The Hound of Ulster never misses twice.', win: 'The barbs stay in. So do you.' },
  { vs: 'I was clay before I was anything. I can wait.', win: 'Bound, as the gods once were.' },
  { vs: 'Look closely. None of me is here.', win: 'The stars were real. Sorry.' },
  { vs: 'Every great story needs a villain. Welcome.', win: 'And that, dear reader, ends the chapter.' },
  { vs: 'You are already being watched.', win: 'The hand found you. It always does.' },
  { vs: '...', win: 'You never saw me. No one will.' },
  { vs: 'Turn back. This forest is mine.', win: 'Seven terrors. You needed only one.' },
  { vs: 'Lovely evening for a stroll, isn\'t it?', win: 'Such a shame. I rather liked your face.' },
  { vs: 'The edge of the world is further on. Stand aside.', win: 'Another land for the map.' },
  { vs: 'It\'s not me you should be afraid of.', win: 'Hush now. He is gentle with the tired ones.' },
  { vs: 'Not one step back.', win: 'The wall holds. It always holds.' },
];
export const quotesOf = (hero: number): HeroQuotes => QUOTES[hero] ?? QUOTES[0];
