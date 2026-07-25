export function looksLikeDeviceFilename(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  const t = title.trim();
  if (/\.(mp4|mov|m4v|webm|m4a|mp3|wav|aac|heic|jpg|jpeg|png)$/i.test(t)) return true;
  if (/^vid[_\d]/i.test(t)) return true;
  if (/^dsc[_\d]/i.test(t)) return true;
  if (/^img[_\d]/i.test(t)) return true;
  if (/^\d{8}[_-]\d{6}/.test(t)) return true;
  // Storage UUIDs from share uploads (with or without extension / dashes)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^[0-9a-f]{32}$/i.test(t)) return true;
  if (/^[0-9a-f]{32}\.[a-z0-9]+$/i.test(t)) return true;
  return false;
}

export function humanDraftTitle(input: {
  draftTitle?: string | null;
  suggestedCaption?: string | null;
  overallSummary?: string | null;
  hookAssessment?: string | null;
}): string | null {
  if (input.suggestedCaption?.trim()) {
    const line = input.suggestedCaption.split('\n')[0]?.trim();
    if (line && line.length >= 12 && !looksLikeDeviceFilename(line)) {
      return line.length > 120 ? `${line.slice(0, 117)}…` : line;
    }
  }
  if (input.hookAssessment?.trim() && !looksLikeDeviceFilename(input.hookAssessment)) {
    const hook = input.hookAssessment.trim();
    return hook.length > 120 ? `${hook.slice(0, 117)}…` : hook;
  }
  if (input.draftTitle?.trim() && !looksLikeDeviceFilename(input.draftTitle)) {
    return input.draftTitle.trim();
  }
  if (input.overallSummary?.trim()) {
    const s = input.overallSummary.trim();
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  return null;
}

export function humanIntakeTitle(input: {
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
  if (captionText && captionText.length >= 12 && !looksLikeDeviceFilename(captionText)) {
    return captionText.length > 120 ? `${captionText.slice(0, 117)}…` : captionText;
  }

  const hook = input.hookSummary?.trim();
  if (hook && hook.length >= 8) return hook;

  const title = input.extractedTitle?.trim();
  if (title && !looksLikeDeviceFilename(title)) return title;

  const summary = input.aiSummary?.trim();
  if (summary) {
    return summary.length > 120 ? `${summary.slice(0, 117)}…` : summary;
  }

  if (input.intakeType === 'video') return 'shared video draft';
  if (input.intakeType === 'audio') return 'shared audio draft';
  return 'untitled share';
}
