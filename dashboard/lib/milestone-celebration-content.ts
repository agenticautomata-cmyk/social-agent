/** Client-safe mirror of core milestone celebration assets. */
export const FOLLOWERS_5000_GIFS = {
  hero: 'https://media.giphy.com/media/T086gjDemS7XU9lDCQ/giphy.gif',
  fireworks: 'https://media.giphy.com/media/26BRuo6sObfdwvc6E/giphy.gif',
  party: 'https://media.giphy.com/media/l0MYC0Lajbo8PHprO/giphy.gif',
} as const;

export const FOLLOWERS_5000_HEADLINE = '5,000 followers!';

export const FOLLOWERS_5000_MESSAGE =
  'Kellie — Kansas City showed up for you. Benson has been watching this climb, and this one matters. Five thousand people chose to stay.';

export const FOLLOWERS_5000_GIF_LIST = [
  FOLLOWERS_5000_GIFS.hero,
  FOLLOWERS_5000_GIFS.fireworks,
  FOLLOWERS_5000_GIFS.party,
] as const;

export const MILESTONE_CONFETTI = ['🎆', '✨', '🎉', '💜', '🌟', '🎊', '🔥', '💫'] as const;
