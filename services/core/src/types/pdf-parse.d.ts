declare module 'pdf-parse' {
  import type { Buffer } from 'node:buffer';

  type PdfParseResult = {
    text?: string;
    numpages?: number;
  };

  export default function pdfParse(data: Buffer): Promise<PdfParseResult>;
}
