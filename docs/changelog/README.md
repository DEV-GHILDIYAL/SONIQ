# Release notes

One file per release: `vX.Y.Z.md` (same as the git tag).

- First line: short tagline.
- Then bullet points: `- <emoji> text` (keep each short; the first 6 show in the update popup).

After adding or editing a file run `node scripts/gen-whatsnew.js` and commit
`src/lib/whatsnew.generated.ts` too. CI uses the file matching the tag as the GitHub release body.
