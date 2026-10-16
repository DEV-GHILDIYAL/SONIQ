import { createInternetArchiveSource } from './internetArchive';

/**
 * Free Music Archive. FMA no longer issues API keys, so we use its official mirror
 * on the Internet Archive (`collection:freemusicarchive`). Items without MP3 are skipped.
 */
export const fmaSource = createInternetArchiveSource({
  id: 'fma',
  label: 'Free Music Archive',
  filter: 'collection:freemusicarchive',
});
