import { Platform } from 'react-native';

/**
 * FlatList settings for long track lists: render one screenful first, then small batches,
 * and keep fewer off-screen rows mounted (less memory, smoother scrolling on budget phones).
 */
export const LIST_PERF = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriod: 50,
  windowSize: 9,
  removeClippedSubviews: Platform.OS === 'android',
} as const;
