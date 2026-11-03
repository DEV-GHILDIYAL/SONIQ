import { Platform, useWindowDimensions, type PressableStateCallbackType } from 'react-native';

/** Wide enough for the desktop layout (sidebar + player bar). Narrow windows get the phone UI. */
export const DESKTOP_MIN_WIDTH = 900;
export const SIDEBAR_WIDTH = 248;
export const PLAYER_BAR_HEIGHT = 88;
/** Wide enough to also show the right panel (Up next / Friends). */
export const PANEL_MIN_WIDTH = 1180;

/** The right panel fits and the user has it open. */
export function useShowsRightPanel(open: boolean): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= PANEL_MIN_WIDTH && open;
}

/** True in the Windows app (web build) when the window is wide. */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
}

/** Mouse hover (react-native-web adds `hovered` to Pressable's state; phones never hover). */
export function hov(state: PressableStateCallbackType): boolean {
  return !!(state as PressableStateCallbackType & { hovered?: boolean }).hovered;
}
