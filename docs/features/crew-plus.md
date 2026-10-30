# Crew tab + SONIQ Plus (v1.4.0)

1. Tab bar (5): Home · Search · **Crew** (raised centre button) · **Plus** · Library.
2. Crew = Jam + Clans with a "Jam | Clans" switch. Jam shows LIVE while in a Jam; Clans shows the unread count (also on the tab).
3. Old routes stay as hidden tabs that redirect: `/jam?code=` → `/crew?tab=jam&code=` (invite links keep working), `/clans` → `/crew?tab=clans`.
4. `ClansView` (components) is the old Clans screen body without its own header.
5. SONIQ Plus screen (`(tabs)/premium.tsx`): hero, theme grid with a live mini preview per theme, font list with an "Aa" sample in each font.
6. Themes (`components/appearance.ts`): Amber (free), Ocean, Rose, Forest, Violet, Pure Black. They override palette tokens on top of the dark / light base; light/dark mode stays in Settings.
7. Fonts: Default (system, free), Poppins, Space Grotesk, Nunito. Only weights 500/700/800 are bundled (deep `.ttf` imports, ~1.1 MB).
8. `type.*` tokens are swapped by `applyFont()`; the root `<Stack>` re-mounts under the font key so all screens redraw, then returns to Plus.
9. No payments: `PLUS_FREE_PREVIEW = true` in `src/lib/plus.ts` unlocks everything (UI says "Free preview"). Turning it off shows locks and a "coming soon" sheet.
