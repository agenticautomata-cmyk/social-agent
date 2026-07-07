export const FOLLOWERS_5000_GIFS = {
  /** Main celebration — confetti burst (i.giphy.com direct; media.giphy.com links 404 for bots) */
  hero: 'https://i.giphy.com/media/Is1O1TWV0LEJi/giphy.gif',
  /** Fireworks finale */
  fireworks: 'https://i.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  /** Party / hype */
  party: 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
} as const;

export const FOLLOWERS_5000_HEADLINE = '5,000 followers!';

export const FOLLOWERS_5000_MESSAGE =
  'Kellie — Kansas City showed up for you. Benson has been watching this climb, and this one matters. Five thousand people chose to stay.';

export function formatFollowers5000TelegramCaption(followerCount: number, appUrl: string): string {
  return [
    '🎆 BENSON · MILESTONE UNLOCKED 🎆',
    '',
    `Kellie just hit ${followerCount.toLocaleString()} TikTok followers!`,
    '',
    'KC showed up. Benson has been watching this climb — five thousand people chose to stay.',
    '',
    `Open the celebration → ${appUrl}`,
  ].join('\n');
}
