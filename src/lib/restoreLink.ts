/**
 * One-tap restore link. Points to a tiny page on GitHub Pages (docs/r/index.html) that opens
 * soniq://restore?id=…&code=… — chat apps only make https links tappable, not soniq:// ones.
 * The ID + code sit in the URL #fragment, so the web server never sees them.
 */
const RESTORE_PAGE = 'https://dev-ghildiyal.github.io/SONIQ/r/';

export function restoreLink(id: string, code: string): string {
  return `${RESTORE_PAGE}#id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`;
}
