import { useLocalSearchParams } from 'expo-router';
import { CollectionScreen } from '@/components/CollectionScreen';
import { getAlbum } from '@/sources/registry';

/** Album page. `id` = "<source>:<albumId>", `title` = optional name to show while loading. */
export default function AlbumScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  return (
    <CollectionScreen
      kind="Album"
      loadKey={id}
      load={() => getAlbum(id)}
      fallbackTitle={title ?? 'Album'}
    />
  );
}
