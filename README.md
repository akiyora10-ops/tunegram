# TuneGram

**Website:** <https://akiyora10-ops.github.io/tunegram> (deployed from [`docs/`](docs/) via GitHub Pages)

A Windows desktop music player for local files, with the familiar Spotify-style
layout: sidebar, search, home shelves, a persistent mini-player, and a queue.

TuneGram plays **only what is already on your disk**. There is no account, no
server, no streaming, and nothing Spotify-owned — no logo, no wordmark, no
catalog API. It scans a folder (Telegram's Downloads folder is detected
automatically), reads tags and embedded artwork, and plays anything it can,
converting the rest with a bundled ffmpeg.

It also ships a small **Spicetify-compatible layer** so that ordinary Spicetify
extensions and themes can add buttons and restyle the app.

---

## Quick start

```bash
npm install
npm run dev          # hot-reloading dev window
```

Build and package:

```bash
npm run build        # typecheck + build main/preload/renderer
npm run dist:dir     # unpacked Windows build in dist/win-unpacked
npm run dist         # NSIS installer: dist/TuneGram-<version>-setup.exe
npm run lint
```

Requires Node 20+ and Windows 10/11.

---

## How it works

| Concern | Where |
| --- | --- |
| Main process, windows, tray, shortcuts | `electron/main/` |
| Filesystem scanning, tags, artwork cache | `electron/main/library.ts` |
| `tunegram://` audio + artwork protocol, HTTP Range | `electron/main/media.ts` |
| ffmpeg fallback | `electron/main/transcode.ts` |
| `window.tunegram` bridge | `electron/preload/index.ts` |
| React UI | `src/` |
| Audio element + queue logic | `src/player/engine.ts` |
| Spicetify shim and loader | `src/spicetify-compat/` |
| Theming tokens | `src/styles/index.css` |

### Media URLs

Audio and artwork are served over a custom privileged scheme, never
`file://`:

```
tunegram://track/<trackId>
tunegram://art/<trackId>
```

The `tunegram://track/…` handler honours `Range` requests, so seeking behaves
like normal streaming. Track IDs are stable per path and are cached in
`path-index.json` so a track still resolves before the first rescan finishes.

### Playback and format support

Chromium decodes mp3, m4a, aac, wav, ogg, oga, opus and flac directly. For
anything else — wma, aiff, ape, wv, mpc, alac, dsf, midi, and so on — the player
tries the file once, and on failure transcodes it to mp3 with the bundled
ffmpeg and caches the result under `%APPDATA%/TuneGram/transcodes`.

Nothing is hidden. A file whose extension is not a recognised audio format is
still listed, tagged **Unverified**, and counted separately; if no ffmpeg is
available, attempting to play it shows a clear "this file can't be played"
message rather than failing silently.

### Scanning

- Recursive, with tag reads parallelised and a metadata cache keyed by
  path + mtime + size.
- Artwork is extracted once into `%APPDATA%/TuneGram/artwork` and served from
  there.
- Scan progress is streamed to the UI, and unreadable files are reported in
  `ScanResult.errors` instead of aborting the scan.
- Drop a folder (or loose files) onto the window to add it to the library.

### Theming

Every colour is a CSS custom property, so a theme is just a variable override:

```css
:root {
  --spice-main: #121212;
  --spice-sidebar: #121212;
  --spice-card: #181818;
  --spice-card-hover: #282828;
  --spice-player: #000000;
  --spice-divider: #2a2a2a;
  --spice-text: #ffffff;
  --spice-subtext: #b3b3b3;
  --spice-button: #1db954;
  --spice-button-active: #1ed760;
}
```

---

## Plugins & themes (Spicetify compatibility)

Two folders in the app's data directory (`%APPDATA%/TuneGram`):

- `Plugins/` — `.js` files, evaluated with a `window.Spicetify` global
- `Themes/` — `.css` files, injected into `<head>`

Both are copied out of `resources/` on first launch as working examples, and
both are watched, so saving a file reloads it without restarting the app. Manage
them in **Settings → Plugins & themes**.

### Supported API

```js
Spicetify.Player.play() / .pause() / .togglePlay() / .next() / .back()
Spicetify.Player.seek(ms) / .seekRatio(0..1)
Spicetify.Player.getProgress() / .getDuration() / .getVolume() / .setVolume(v)
Spicetify.Player.isPlaying() / .getQueue() / .Player.data
Spicetify.Player.addEventListener('songchange' | 'onplaypause' | 'onprogress' | 'onerror' | 'queuechange', cb)

Spicetify.Playbar.Button({ icon, label, onClick })   // mini-player button
Spicetify.Topbar.Button({ icon, label, onClick })
Spicetify.showNotification(message, durationMs)
Spicetify.LocalStorage.get / set / remove / clear    // namespaced to TuneGram
Spicetify.Config                                    // version + unsupported list
Spicetify.Utils.parseHTML(html) / .debounce(fn, ms)
```

`Spicetify.Player.data` is a local track: `{ id, name, uri, path, artist, album,
duration, isLocal, ext, hasArt, raw }`. Track IDs are TuneGram's own — they are
not Spotify track IDs and cannot be used with any Spotify service.

See `resources/plugins/example-plugin.js` for a working example.

### Not supported

TuneGram has no Spotify backend, so extensions built on these will not work:

- `Spicetify.CosmosAsync` / `CosmosResolver` — no streaming service to query
- `Spicetify.Platform` internals — navigation, context menus, entry points
- Spotify GraphQL/catalog endpoints, and any account, token or profile API
- `Spicetify.React` / `Spicetify.ReactComponent` — Spicetify's internal React
- `Spicetify.LibraryAPI` catalogue browsing

A plugin that needs these will fail to load and the error is surfaced in the UI
rather than swallowed.

---

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `Ctrl` + `→` / `←` | Next / previous |
| `↑` / `↓` | Volume |
| `Esc` | Leave search |

Media keys work through the main process.

---

## Data locations

Everything lives in `%APPDATA%/TuneGram`:

```
settings.json      preferences, playlists, favourites, addon toggles
library-cache.json tag cache
path-index.json    stable track id <-> path mapping
artwork/           extracted cover art
transcodes/        ffmpeg output
Plugins/  Themes/  your addons
```

Uninstalling removes the app; deleting this folder resets everything.

---

## Notes

- `npm run dev` uses an HTTP dev origin; packaged builds use `file://`. The
  custom protocol and preload behave the same in both.
- The renderer runs under a strict CSP. Plugins are evaluated from blob URLs
  (`blob:` is in `script-src`) because `file://` cannot execute inline scripts.
- This project is not affiliated with Spotify AB or the Spicetify project; it
  only implements a small, compatible surface area.
- The landing page in `docs/` is plain static HTML with no build step. It is
  published by `.github/workflows/pages.yml`; the download buttons resolve to
  the newest GitHub Release and auto-detect the repository owner from the
  Pages hostname.

---

## License

MIT — see [LICENSE](LICENSE).
