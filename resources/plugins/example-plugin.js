/*
 * TuneGram example plugin.
 *
 * Plugins are plain JavaScript evaluated with a `window.Spicetify` global in
 * place. This one is deliberately tiny — it proves the three things most
 * Spicetify extensions rely on:
 *
 *   1. adding a button to the mini-player (Spicetify.Playbar.Button)
 *   2. reacting to track changes   (Spicetify.Player.addEventListener)
 *   3. persisting a small preference (Spicetify.LocalStorage)
 *
 * Deliberately NOT used: Spicetify.CosmosAsync, Spicetify.Platform, and any
 * Spotify GraphQL call. TuneGram is a local-only player, so those APIs have no
 * backend here. See Settings -> Plugins & themes for the full list.
 */

;(() => {
  'use strict'

  const S = window.Spicetify
  if (!S || !S.Player) {
    console.warn('[example] Spicetify API unavailable')
    return
  }

  // Persisted across restarts, namespaced by the shim.
  const seenCount = Number(S.LocalStorage.get('example-play-count') ?? '0')
  let copyMode = S.LocalStorage.get('example-copy-mode') ?? 'text'
  let playCount = seenCount

  const playlistURL = 'https://open.spotify.com/'

  function notify(message) {
    S.showNotification(message, 3000)
  }

  function trackLabel() {
    const data = S.Player.data
    if (!data) return 'nothing'
    return `${data.artist.name} — ${data.name}`
  }

  function copyCurrent() {
    const data = S.Player.data
    if (!data) {
      notify('Nothing is playing')
      return
    }
    const text =
      copyMode === 'link'
        ? `${playlistURL}track/${data.id}`
        : `${data.artist.name} — ${data.name} (${data.album.name})`
    void navigator.clipboard
      .writeText(text)
      .then(() => notify(`Copied: ${text}`))
      .catch(() => notify('Could not write to the clipboard'))
  }

  function toggleCopyMode() {
    copyMode = copyMode === 'text' ? 'link' : 'text'
    S.LocalStorage.set('example-copy-mode', copyMode)
    notify(`Copy mode: ${copyMode}`)
  }

  // --- mini-player button ------------------------------------------------
  S.Playbar.Button({
    label: 'Copy current track',
    // Any HTML is allowed; Spicetify extensions usually pass an inline SVG.
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<rect x="5.5" y="5.5" width="9" height="9" rx="1.5" stroke="currentColor"/>' +
      '<path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" ' +
      'stroke="currentColor" stroke-linecap="round"/></svg>',
    onClick: copyCurrent
  })

  // --- reaction to playback ---------------------------------------------
  S.Player.addEventListener('songchange', () => {
    playCount += 1
    S.LocalStorage.set('example-play-count', String(playCount))
    console.info(`[example] now playing: ${trackLabel()} (${playCount} this session-run)`)
  })

  S.Player.addEventListener('onerror', (payload) => {
    notify("That track can't be played", 5000)
    console.warn('[example] playback error', payload)
  })

  // --- a topbar button, toggling the copy mode ---------------------------
  S.Topbar.Button({
    label: 'Toggle copy mode',
    icon: copyMode === 'link' ? 'ID' : 'AB',
    onClick: toggleCopyMode
  })

  console.info(`[example] loaded — ${playCount} tracks seen since first run`)
})()
