/**
 * SONIQ Plus access. No payments yet: while PLUS_FREE_PREVIEW is on, everyone can use
 * Plus features (marked "Preview" in the UI). Turning it off later locks them again.
 */
export const PLUS_FREE_PREVIEW = true;

export function hasPlus(): boolean {
  return PLUS_FREE_PREVIEW;
}
