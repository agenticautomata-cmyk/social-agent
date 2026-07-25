/**
 * OpenAI vision OCR queue (primary on constrained hosts).
 * PaddleOCR deploys off-host when SCOUT_OCR_REMOTE_URL is set.
 */

export type OcrFieldLabel = 'VERIFIED' | 'OCR_ONLY' | 'INFERRED' | 'CONFLICTING' | 'UNAVAILABLE';

export type OcrExtractedField = {
  field: string;
  value: string;
  confidence: number;
  label: OcrFieldLabel;
  bbox?: { x: number; y: number; w: number; h: number };
};

export type OcrJobResult = {
  status: 'completed' | 'queued' | 'failed' | 'skipped';
  engine: string;
  extractedText: string;
  fields: OcrExtractedField[];
  averageConfidence: number;
  processingMs: number;
  error?: string;
};

export async function queueFlyerOcr(input: {
  scoutItemId: string;
  imageUrl: string;
  captionText?: string | null;
}): Promise<OcrJobResult> {
  if (process.env.SCOUT_OCR_ENABLED === 'false') {
    return {
      status: 'skipped',
      engine: 'disabled',
      extractedText: '',
      fields: [],
      averageConfidence: 0,
      processingMs: 0,
    };
  }

  const remote = process.env.SCOUT_OCR_REMOTE_URL?.trim();
  if (remote) {
    return {
      status: 'queued',
      engine: 'paddleocr-remote',
      extractedText: '',
      fields: [],
      averageConfidence: 0,
      processingMs: 0,
    };
  }

  // Primary path: OpenAI vision when API key present
  if (!process.env.OPENAI_API_KEY) {
    return {
      status: 'skipped',
      engine: 'openai-vision-unconfigured',
      extractedText: '',
      fields: [],
      averageConfidence: 0,
      processingMs: 0,
      error: 'OCR requires OPENAI_API_KEY or SCOUT_OCR_REMOTE_URL',
    };
  }

  return {
    status: 'queued',
    engine: 'openai-vision',
    extractedText: '',
    fields: [],
    averageConfidence: 0,
    processingMs: 0,
  };
}

export function mergeOcrWithCaption(
  ocrFields: OcrExtractedField[],
  captionText: string | null | undefined,
): OcrExtractedField[] {
  if (!captionText?.trim()) return ocrFields;
  return ocrFields.map((field) => {
    const captionMatch = captionText.toLowerCase().includes(field.value.toLowerCase());
    if (captionMatch && field.label === 'OCR_ONLY') {
      return { ...field, label: 'VERIFIED' as const };
    }
    if (!captionMatch && field.confidence < 0.6) {
      return { ...field, label: 'CONFLICTING' as const };
    }
    return field;
  });
}
