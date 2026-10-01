# Third-party notices

Runtime dependency bundled in `dist/`:

| Package       | License | URL                                |
| ------------- | ------- | ---------------------------------- |
| phaser 3.90.0 | MIT     | https://github.com/phaserjs/phaser |

Development-only tools (not shipped): vite, typescript, vitest, eslint, typescript-eslint,
@eslint/js, globals, prettier — all MIT/Apache-2.0/BSD/ISC licensed; see each package's
`LICENSE` in `node_modules/`.

Optional SDKs loaded at runtime only when the corresponding platform is selected
(not bundled, subject to the portal's terms):

- CrazyGames HTML5 SDK v3 — `https://sdk.crazygames.com/crazygames-sdk-v3.js`
- Poki SDK v2 — `https://game-cdn.poki.com/scripts/v2/poki-sdk.js`

Art: procedurally generated at runtime (no external images).
Audio: synthesized with the Web Audio API (no external audio files).
Fonts: system font stack (no web fonts).
