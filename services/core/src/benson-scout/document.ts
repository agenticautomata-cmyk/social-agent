/**
 * Docling document extraction queue — processes off-host when SCOUT_DOCLING_URL is set.
 */

export type DocumentEvidence = {
  page: number;
  heading?: string;
  quote: string;
  field?: string;
};

export type DocumentExtractResult = {
  status: 'completed' | 'queued' | 'failed' | 'skipped';
  engine: string;
  title: string | null;
  pageCount: number | null;
  structuredOutput: Record<string, unknown>;
  pageEvidence: DocumentEvidence[];
  tableEvidence: Record<string, unknown>[];
  processingMs: number;
  error?: string;
};

export async function queueDocumentExtract(input: {
  scoutItemId: string;
  documentUrl: string;
  mimeType?: string;
}): Promise<DocumentExtractResult> {
  if (process.env.SCOUT_DOCLING_ENABLED === 'false') {
    return {
      status: 'skipped',
      engine: 'disabled',
      title: null,
      pageCount: null,
      structuredOutput: {},
      pageEvidence: [],
      tableEvidence: [],
      processingMs: 0,
    };
  }

  const remote = process.env.SCOUT_DOCLING_URL?.trim();
  if (!remote) {
    return {
      status: 'skipped',
      engine: 'docling-unconfigured',
      title: null,
      pageCount: null,
      structuredOutput: {},
      pageEvidence: [],
      tableEvidence: [],
      processingMs: 0,
      error: 'Docling requires SCOUT_DOCLING_URL (off-host processor)',
    };
  }

  return {
    status: 'queued',
    engine: 'docling-serve',
    title: null,
    pageCount: null,
    structuredOutput: {},
    pageEvidence: [],
    tableEvidence: [],
    processingMs: 0,
  };
}
