# Colours & font (v1.4.2)

1. No premium tier: every theme and font is free. (SONIQ Plus and its tab were removed.)
2. Tabs back to: Home · Search · Jam · Clans · Library. The combined Crew tab is gone; `ClansView` is reused by the Clans tab.
3. Screen `src/app/appearance.tsx` (Settings › Colours & font, also Profile): mode (Auto / Light / Dark), colour theme grid with a mini preview per theme, font list with an "Aa" sample.
4. Themes (`src/components/appearance.ts`): Amber, Ocean, Rose, Forest, Violet, Teal, Crimson, Gold, Lavender, Neon, Mocha, Pure Black. Each overrides palette tokens on the dark / light base.
5. Fonts: Default, Poppins, Space Grotesk, Nunito, Montserrat, Outfit, Quicksand, Playfair. Only weights 500/700/800 are bundled via deep `.ttf` imports.
6. `applyFont()` swaps every `type.*` token; the root Stack re-mounts under the font key, then returns to the Appearance screen.
