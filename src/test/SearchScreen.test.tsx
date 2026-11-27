import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeTrack } from '@/test/fixtures';
import type { Track } from '@/sources/types';
import SearchScreen from '@/app/(tabs)/search/find';

const mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useSegments: () => ['search', 'find'],
}));

const mockSearchBatches = jest.fn();
const mockSources: { id: string }[] = [{ id: 'jamendo' }];

jest.mock('@/sources/registry', () => ({
  ALL_SOURCE_IDS: ['jamendo', 'archive', 'fma', 'local'],
  SOURCE_LABELS: {
    jamendo: 'Jamendo',
    archive: 'Internet Archive',
    fma: 'Free Music Archive',
    local: 'On this device',
  },
  get sources() {
    return mockSources;
  },
  searchAllWithBatches: (...args: unknown[]) => mockSearchBatches(...args),
  searchCacheKey: (query: string) => `all|20|${query.trim().toLowerCase()}`,
}));

const mockPlayQueue = jest.fn(() => Promise.resolve());
jest.mock('@/player/engine', () => ({
  playQueue: (...args: unknown[]) => mockPlayQueue(...(args as [])),
}));

async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Search'), text);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

function resolveSearch(tracks: Track[]) {
  mockSearchBatches.mockImplementation((...args: unknown[]) => {
    const onBatch = args[3] as (batch: { tracks: Track[]; replace?: boolean }) => void;
    onBatch({ tracks, replace: true });
    return Promise.resolve(tracks);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSearchBatches.mockReset();
  mockPlayQueue.mockClear();
  mockSources.splice(0, mockSources.length, { id: 'jamendo' });
  delete mockParams.q;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SearchScreen', () => {
  it('shows an empty state when there are no recent searches', async () => {
    await render(<SearchScreen />);
    expect(screen.getByText('Play what you love')).toBeOnTheScreen();
  });

  it('shows results and plays the tapped track as a queue', async () => {
    const tracks = [makeTrack(1), makeTrack(2)];
    resolveSearch(tracks);
    await render(<SearchScreen />);
    await typeQuery('lofi');
    expect(mockSearchBatches).toHaveBeenCalledWith(
      'lofi',
      undefined,
      20,
      expect.any(Function),
      expect.anything(),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Track 2 by Artist 2' }));
    expect(mockPlayQueue).toHaveBeenCalledWith([tracks[1]], 0);
  });

  it('shows a no-results state', async () => {
    resolveSearch([]);
    await render(<SearchScreen />);
    await typeQuery('zzzz');
    expect(await screen.findByText(`Couldn't find "zzzz"`)).toBeOnTheScreen();
  });

  it('shows an error state with retry', async () => {
    mockSearchBatches.mockRejectedValueOnce(new Error('Network down'));
    mockSearchBatches.mockImplementationOnce((...args: unknown[]) => {
      const onBatch = args[3] as (batch: { tracks: Track[]; replace?: boolean }) => void;
      onBatch({ tracks: [] });
      return Promise.resolve([]);
    });
    await render(<SearchScreen />);
    await typeQuery('rock');
    expect(await screen.findByText('No connection')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(`Couldn't find "rock"`)).toBeOnTheScreen();
    expect(mockSearchBatches).toHaveBeenCalledTimes(2);
  });

  it('runs the search passed in from Home via the q param', async () => {
    mockParams.q = 'Jazz';
    resolveSearch([makeTrack(9)]);
    await render(<SearchScreen />);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSearchBatches).toHaveBeenCalledWith(
      'Jazz',
      undefined,
      20,
      expect.any(Function),
      expect.anything(),
    );
    expect(await screen.findByText('Track 9')).toBeOnTheScreen();
  });

  it('explains when no sources are connected', async () => {
    mockSources.splice(0, mockSources.length);
    await render(<SearchScreen />);
    await typeQuery('jazz');
    expect(screen.getByText('No music sources connected yet')).toBeOnTheScreen();
    expect(mockSearchBatches).not.toHaveBeenCalled();
  });
});
