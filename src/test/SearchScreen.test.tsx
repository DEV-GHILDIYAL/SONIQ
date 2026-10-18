import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { makeTrack } from '@/test/fixtures';
import SearchScreen from '@/app/(tabs)/search/find';

const mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockSearchAll = jest.fn();
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
  searchAll: (...args: unknown[]) => mockSearchAll(...args),
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

beforeEach(() => {
  jest.useFakeTimers();
  mockSearchAll.mockReset();
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
    mockSearchAll.mockResolvedValue(tracks);
    await render(<SearchScreen />);
    await typeQuery('lofi');
    expect(mockSearchAll).toHaveBeenCalledWith('lofi', undefined);
    await fireEvent.press(await screen.findByRole('button', { name: 'Track 2 by Artist 2' }));
    expect(mockPlayQueue).toHaveBeenCalledWith(tracks, 1);
  });

  it('shows a no-results state', async () => {
    mockSearchAll.mockResolvedValue([]);
    await render(<SearchScreen />);
    await typeQuery('zzzz');
    expect(await screen.findByText(`Couldn't find "zzzz"`)).toBeOnTheScreen();
  });

  it('shows an error state with retry', async () => {
    mockSearchAll.mockRejectedValueOnce(new Error('Network down')).mockResolvedValue([]);
    await render(<SearchScreen />);
    await typeQuery('rock');
    expect(await screen.findByText('Network down')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(`Couldn't find "rock"`)).toBeOnTheScreen();
    expect(mockSearchAll).toHaveBeenCalledTimes(2);
  });

  it('runs the search passed in from Home via the q param', async () => {
    mockParams.q = 'Jazz';
    mockSearchAll.mockResolvedValue([makeTrack(9)]);
    await render(<SearchScreen />);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSearchAll).toHaveBeenCalledWith('Jazz', undefined);
    expect(await screen.findByText('Track 9')).toBeOnTheScreen();
  });

  it('explains when no sources are connected', async () => {
    mockSources.splice(0, mockSources.length);
    await render(<SearchScreen />);
    await typeQuery('jazz');
    expect(screen.getByText('No music sources connected yet')).toBeOnTheScreen();
    expect(mockSearchAll).not.toHaveBeenCalled();
  });
});
