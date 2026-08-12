import { saveProgramToLibrary } from './save.js';
import { PROGRAM_LIBRARY_SEED_RECORDS } from './seed-data.js';
import { countProgramLibraryRecords } from './list.js';

export type SeedProgramLibraryResult = {
  created: number;
  updated: number;
  total: number;
  canonicalIdentities: string[];
};

export async function seedProgramLibrary(): Promise<SeedProgramLibraryResult> {
  let created = 0;
  let updated = 0;
  const canonicalIdentities: string[] = [];

  for (const record of PROGRAM_LIBRARY_SEED_RECORDS) {
    const result = await saveProgramToLibrary(record);
    canonicalIdentities.push(result.canonicalIdentity);
    if (result.created) created += 1;
    else updated += 1;
  }

  return {
    created,
    updated,
    total: await countProgramLibraryRecords(),
    canonicalIdentities,
  };
}
