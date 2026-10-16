import { useLocalSearchParams } from 'expo-router';
import { CollectionScreen } from '@/components/CollectionScreen';
import { getArtist } from '@/sources/registry';

/** Artist page. `id` = "<source>:<artistId>", `name` = optional name to show while loading. */
export default function ArtistScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return (
    <CollectionScreen
      kind="Artist"
      rounded
      loadKey={id}
      load={() => getArtist(id)}
      fallbackTitle={name ?? 'Artist'}
    />
  );
}
