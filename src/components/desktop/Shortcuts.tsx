import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { next, pause, prev, resume, seekBy, setVolume } from '@/player/engine';
import { currentTrack } from '@/player/queue';
import { useLikedStore } from '@/store/likedStore';
import { usePlayerStore } from '@/store/playerStore';
import { goTo } from './navigate';

/**
 * Desktop keyboard shortcuts:
 *   Space play/pause · Ctrl+→/← next/previous · Shift+→/← seek 10 s
 *   Ctrl+↑/↓ volume · Ctrl+K or / search · Ctrl+L like
 * Ignored while typing in a text field.
 */
export function Shortcuts() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (typing) return;
      const s = usePlayerStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const handled = () => e.preventDefault();
      if (e.code === 'Space') {
        handled();
        if (s.status === 'playing') pause();
        else if (currentTrack(s.queue)) resume();
      } else if (ctrl && e.key === 'ArrowRight') {
        handled();
        void next();
      } else if (ctrl && e.key === 'ArrowLeft') {
        handled();
        void prev();
      } else if (e.shiftKey && e.key === 'ArrowRight') {
        handled();
        void seekBy(10);
      } else if (e.shiftKey && e.key === 'ArrowLeft') {
        handled();
        void seekBy(-10);
      } else if (ctrl && e.key === 'ArrowUp') {
        handled();
        setVolume((s.volume ?? 1) + 0.1);
      } else if (ctrl && e.key === 'ArrowDown') {
        handled();
        setVolume((s.volume ?? 1) - 0.1);
      } else if ((ctrl && e.key.toLowerCase() === 'k') || e.key === '/') {
        handled();
        goTo(router, '/search/find');
      } else if (ctrl && e.key.toLowerCase() === 'l') {
        const t = currentTrack(s.queue);
        if (t) {
          handled();
          useLikedStore.getState().toggle(t);
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);
  return null;
}
