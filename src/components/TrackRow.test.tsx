import { fireEvent, render, screen } from '@testing-library/react-native';
import { makeTrack } from '@/test/fixtures';
import { TrackRow } from './TrackRow';

describe('TrackRow', () => {
  it('shows title, artist, source and duration', async () => {
    await render(<TrackRow track={makeTrack(1)} />);
    expect(screen.getByText('Track 1')).toBeOnTheScreen();
    expect(screen.getByText('Artist 1 · Jamendo')).toBeOnTheScreen();
    expect(screen.getByText('2:05')).toBeOnTheScreen();
  });

  it('calls onPress with the track', async () => {
    const onPress = jest.fn();
    const track = makeTrack(2);
    await render(<TrackRow track={track} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Track 2 by Artist 2' }));
    expect(onPress).toHaveBeenCalledWith(track);
  });

  it('marks the active track as selected', async () => {
    await render(<TrackRow track={makeTrack(3)} active />);
    expect(screen.getByRole('button')).toBeSelected();
  });
});
