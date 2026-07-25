import { LONG_ANSWER_WORD_THRESHOLD, SHORT_ANSWER_WORD_THRESHOLD } from './constants.js';

const URL_PATTERN = /https?:\/\/[^\s)]+/gi;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const HEADING = /^#{1,6}\s+/gm;
const BULLET = /^[•\-*]\s+/gm;
const CITATION = /\[\^?\d+\]|\(\s*source:\s*[^)]+\)/gi;

function expandAbbreviations(text: string): string {
  return text
    .replace(/\bKC\b/g, 'Kansas City')
    .replace(/\bPWA\b/g, 'P W A')
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bTTS\b/g, 'text to speech');
}

function spokenUrlLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return `link to ${host}`;
  } catch {
    return 'link';
  }
}

/** Plain speech text for Studio Voice — does not alter displayed answer. */
export function transformAnswerToSpeechText(content: string, mode: 'full' | 'summary' = 'full'): string {
  let text = content.trim();
  if (!text) return '';

  if (mode === 'summary') {
    const summaryMatch = text.match(/Summary:\s*([\s\S]*?)(?=\n\n(?:What's Working:|Recommended Action:|$))/i);
    if (summaryMatch?.[1]) {
      text = summaryMatch[1].trim();
    } else {
      text = text.split(/\n{2,}/)[0] ?? text;
    }
  }

  text = text.replace(MARKDOWN_LINK, '$1');
  text = text.replace(HEADING, '');
  text = text.replace(BULLET, '');
  text = text.replace(CITATION, '');
  text = text.replace(/\*\*/g, '');
  text = text.replace(/`/g, '');
  text = text.replace(URL_PATTERN, (url) => spokenUrlLabel(url));
  text = text.replace(/\s+/g, ' ').trim();
  return expandAbbreviations(text);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isShortAnswer(text: string): boolean {
  return wordCount(text) <= SHORT_ANSWER_WORD_THRESHOLD;
}

export function isLongAnswer(text: string): boolean {
  return wordCount(text) > LONG_ANSWER_WORD_THRESHOLD;
}

export function shouldAutoPlay(
  autoPlay: 'off' | 'short_only' | 'all',
  answerText: string,
): boolean {
  if (autoPlay === 'off') return false;
  if (autoPlay === 'all') return true;
  return isShortAnswer(answerText);
}
