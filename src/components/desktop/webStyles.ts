import { Platform } from 'react-native';

/**
 * PC (web build) polish that React Native styles can't express: scrollbars stay invisible until
 * you hover the area you're scrolling, and are thin when they show. Added once at start.
 */
export function installWebStyles(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('soniq-web-styles')) return;
  const style = document.createElement('style');
  style.id = 'soniq-web-styles';
  style.textContent = `
    * { scrollbar-width: thin; scrollbar-color: transparent transparent; }
    *:hover { scrollbar-color: rgba(140,140,140,0.35) transparent; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: transparent; border-radius: 6px; }
    *:hover::-webkit-scrollbar-thumb { background: rgba(140,140,140,0.35); }
    ::-webkit-scrollbar-corner { background: transparent; }
    html, body { overscroll-behavior: none; user-select: none; }
    input, textarea, [data-selectable] { user-select: text; }
  `;
  document.head.appendChild(style);
}
