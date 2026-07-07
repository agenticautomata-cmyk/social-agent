export type ScanSourceResult = {
  sourceId: string;
  scanRunId: string;
  itemsFound: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  error?: string;
};
