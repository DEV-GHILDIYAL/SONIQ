import { fireEvent, render, screen } from '@testing-library/react-native';
import { createQueue } from '@/player/queue';
import { initialPlayerState, usePlayerStore } from '@/store/playerStore';
import { makeTrack } from '@/test/fixtures';
import { MiniPlayer } from './MiniPlayer';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockPause = jest.fn();
const mockResume = jest.fn();
jest.mock('@/player/engine', () => ({
  pause: () => mockPause(),
  resume: () => mockResume(),
  next: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  usePlayerStore.setState({ ...initialPlayerState });
  jest.clearAllMocks();
});

describe('MiniPlayer', () => {
  it('renders nothing when the queue is empty', async () => {
    await render(<MiniPlayer />);
    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('shows the current track and pauses when playing', async () => {
    usePlayerStore.setState({ queue: createQueue([makeTrack(1)]), status: 'playing' });
    await render(<MiniPlayer />);
    expect(screen.getByText('Track 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(mockPause).toHaveBeenCalled();
  });

  it('resumes when paused and opens the full player on tap', async () => {
    usePlayerStore.setState({ queue: createQueue([makeTrack(1)]), status: 'paused' });
    await render(<MiniPlayer />);
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(mockResume).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: /Open player/ }));
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('shows the error message in place of the artist', async () => {
    usePlayerStore.setState({
      queue: createQueue([makeTrack(1)]),
      status: 'error',
      error: 'Stream failed',
    });
    await render(<MiniPlayer />);
    expect(screen.getByText('Stream failed')).toBeOnTheScreen();
  });
});
