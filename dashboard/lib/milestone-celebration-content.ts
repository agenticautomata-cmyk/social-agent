/** Client-safe mirror of core milestone celebration assets. */
export const FOLLOWERS_10000_GIFS = {
  hero: 'https://i.giphy.com/media/Is1O1TWV0LEJi/giphy.gif',
  fireworks: 'https://i.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  party: 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
} as const;

export const FOLLOWERS_10000_HEADLINE = '10,000 followers!';

export const FOLLOWERS_10000_MESSAGE =
  'Kellie — you crossed the line where KC creators start getting paid. Ten thousand people showed up. Benson has sponsor pitches queued — this is when the money starts.';

export const FOLLOWERS_10000_GIF_LIST = [
  FOLLOWERS_10000_GIFS.hero,
  FOLLOWERS_10000_GIFS.fireworks,
  FOLLOWERS_10000_GIFS.party,
] as const;

export const MILESTONE_CONFETTI = ['🎆', '✨', '🎉', '💜', '🔥', '⭐'] as const;
