import { fireEvent, render, screen } from '@testing-library/react-native';
import HomeScreen from '@/app/(tabs)/index';
import { usePlaylistStore } from '@/store/playlistStore';
import { useRecentStore } from '@/store/recentStore';
import { makeTrack } from './fixtures';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn() }),
}));

const mockPlay = jest.fn(() => Promise.resolve());
jest.mock('@/player/engine', () => ({
  play: (...args: unknown[]) => mockPlay(...(args as [])),
  playQueue: jest.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  jest.clearAllMocks();
  useRecentStore.getState().clear();
  usePlaylistStore.setState({ playlists: [] });
});

describe('HomeScreen', () => {
  it('hides Recently played until something was played', async () => {
    await render(<HomeScreen />);
    expect(screen.queryByText('Recently played')).toBeNull();
  });

  it('shows genres as a 2x2 grid (first 4 only)', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Browse Lo-fi' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Browse Jazz' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Browse Classical' })).toBeNull();
  });

  it('plays a recently played track', async () => {
    const track = makeTrack(1);
    useRecentStore.getState().add(track);
    await render(<HomeScreen />);
    expect(screen.getByText('Recently played')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Play Track 1 by Artist 1' }));
    expect(mockPlay).toHaveBeenCalledWith(track);
  });

  it('opens Search with the genre as query', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Browse Jazz' }));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'Jazz' } });
  });

  it('lists saved playlists', async () => {
    usePlaylistStore.getState().createPlaylist('Night drive');
    await render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Open playlist Night drive' })).toBeOnTheScreen();
  });
});
