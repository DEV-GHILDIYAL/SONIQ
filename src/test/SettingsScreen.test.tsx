import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '@/app/settings';
import { useRecentStore } from '@/store/recentStore';
import { makeTrack } from './fixtures';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));

beforeEach(() => useRecentStore.getState().clear());

describe('SettingsScreen', () => {
  it('lists every source with its status', async () => {
    await render(<SettingsScreen />);
    expect(screen.getByText('Jamendo')).toBeOnTheScreen();
    expect(screen.getByText('On this device')).toBeOnTheScreen();
    // No Jamendo key in tests: Jamendo asks for it, the keyless sources are connected.
    expect(screen.getByText('Add key in .env')).toBeOnTheScreen();
    expect(screen.getAllByText('Connected')).toHaveLength(3);
  });

  it('clears recently played after confirmation', async () => {
    useRecentStore.getState().add(makeTrack(1));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === 'Clear')?.onPress?.();
    });
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: /Clear recently played/ }));
    expect(alert).toHaveBeenCalled();
    expect(useRecentStore.getState().tracks).toEqual([]);
  });
});
