/** True when a title is a device export filename, not a human-readable title. */
export function isRawMediaFilename(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  const t = title.trim();
  if (/\.(mp4|mov|m4v|webm|m4a|mp3|wav|aac|heic|jpg|jpeg|png)$/i.test(t)) return true;
  if (/^vid[_\d]/i.test(t)) return true;
  if (/^dsc[_\d]/i.test(t)) return true;
  if (/^img[_\d]/i.test(t)) return true;
  if (/^\d{8}[_-]\d{6}/.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^[0-9a-f]{32}$/i.test(t)) return true;
  if (/^[0-9a-f]{32}\.[a-z0-9]+$/i.test(t)) return true;
  return false;
}

export function draftDisplayTitle(input: {
  draftTitle?: string | null;
  overallSummary?: string | null;
  suggestedCaption?: string | null;
  hookAssessment?: string | null;
}): string {
  const caption = input.suggestedCaption?.trim();
  if (caption) {
    const firstLine = caption.split('\n')[0]?.trim();
    if (firstLine && firstLine.length >= 12 && !isRawMediaFilename(firstLine)) {
      return firstLine.length > 100 ? `${firstLine.slice(0, 97)}…` : firstLine;
    }
  }

  const hook = input.hookAssessment?.trim();
  if (hook && hook.length >= 12 && !isRawMediaFilename(hook)) {
    return hook.length > 100 ? `${hook.slice(0, 97)}…` : hook;
  }

  const title = input.draftTitle?.trim();
  if (title && !isRawMediaFilename(title)) {
    return title;
  }

  const summary = input.overallSummary?.trim();
  if (summary) {
    const excerpt = summary.length > 90 ? `${summary.slice(0, 87)}…` : summary;
    return excerpt;
  }

  return 'untitled draft';
}

export function intakeDisplayTitle(input: {
  extractedTitle?: string | null;
  hookSummary?: string | null;
  aiSummary?: string | null;
  intakeType?: string;
  captionSuggestionsJson?: unknown;
}): string {
  const captions = Array.isArray(input.captionSuggestionsJson)
    ? (input.captionSuggestionsJson as Array<{ text?: string }>)
    : [];
  const captionText = captions[0]?.text?.trim();
  if (captionText && captionText.length >= 12 && !isRawMediaFilename(captionText)) {
    return captionText.length > 100 ? `${captionText.slice(0, 97)}…` : captionText;
  }

  const hook = input.hookSummary?.trim();
  if (hook && hook.length >= 8) return hook;

  const title = input.extractedTitle?.trim();
  if (title && !isRawMediaFilename(title)) return title;

  const summary = input.aiSummary?.trim();
  if (summary) {
    return summary.length > 90 ? `${summary.slice(0, 87)}…` : summary;
  }

  if (input.intakeType === 'video') return 'shared video draft';
  if (input.intakeType === 'audio') return 'shared audio draft';
  return 'untitled share';
}
