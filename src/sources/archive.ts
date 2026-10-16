import { createInternetArchiveSource } from './internetArchive';

/** Internet Archive netlabels collection: curated Creative Commons releases. */
export const archiveSource = createInternetArchiveSource({
  id: 'archive',
  label: 'Internet Archive',
  filter: 'collection:netlabels',
});
