/** Escape dynamic plain text before ASK SDK wraps it in <speak>. Do not use on static SSML. */
export function escapeSsmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const SPEECH = {
  help: "You can ask what's happening this weekend, or what's on the weekend list.",
  household: "I can only talk to this household's Benson.",
  setup: "Benson isn't set up for this Alexa account yet.",
  timeout: "That's taking too long. Try again, or check Benson on the dashboard.",
  unreachable: "Benson isn't reachable right now. Try again in a minute.",
  stop: 'Okay.',
  moreReprompt: 'Say more, or say stop.',
  moreWithoutContext:
    "Ask what's happening this weekend, or what's on the weekend list first.",
} as const;

export const HTTP_TIMEOUT_MS = 2500;
