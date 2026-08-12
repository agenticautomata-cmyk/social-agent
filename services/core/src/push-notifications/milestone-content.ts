export const FOLLOWERS_10000_GIFS = {
  hero: 'https://i.giphy.com/media/Is1O1TWV0LEJi/giphy.gif',
  fireworks: 'https://i.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  party: 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
} as const;

export const FOLLOWERS_10000_HEADLINE = '10,000 followers!';

export const FOLLOWERS_10000_MESSAGE =
  'Kellie — you crossed the line where KC creators start getting paid. Ten thousand people showed up. Benson has sponsor pitches queued — this is when the money starts.';

export function formatFollowers10000TelegramCaption(followerCount: number, appUrl: string): string {
  return [
    '🎆 BENSON · 10K MILESTONE 🎆',
    '',
    `Kellie just hit ${followerCount.toLocaleString()} TikTok followers.`,
    '',
    'This is the threshold where brand deals get real. KC showed up — time to cash in.',
    '',
    `Open the celebration → ${appUrl}`,
  ].join('\n');
}

export const VIEWS_1000000_GIFS = {
  hero: 'https://i.giphy.com/media/g9582DMOGtw6U/giphy.gif',
  fireworks: 'https://i.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif',
  party: 'https://i.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
} as const;

export function formatViews1000000TelegramCaption(viewCount: number): string {
  return [
    '🚀 BENSON · 1 MILLION VIEWS 🚀',
    '',
    `Kellie just crossed ${viewCount.toLocaleString()} total TikTok views.`,
    '',
    'A million eyes on your work. That is real reach — brands notice numbers like this.',
    '',
    'Keep going. Benson is watching the next win.',
  ].join('\n');
}
