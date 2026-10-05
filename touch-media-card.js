/**
 * Touch Media Card (touch-media-card.js) v1.0.0
 * A touch-first media player card for Home Assistant, built from Bubble Card
 * widgets, with Music Assistant search and library browsing.
 * Author: Ryan Davies (PrimusNZ)
 *
 * Copyright (C) 2026 Ryan Davies (PrimusNZ)
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version. It is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
 * Public License for more details: see the LICENSE file.
 *
 * Usage: see README.md. Needs Bubble Card (https://github.com/Clooos/Bubble-Card)
 * and, for browsing and queue moves, the Music Assistant integration.
 *
 * Card options: entity_id, priority_player, priority_name, discover,
 * media_players, config_entry_id, ma_url, ma_token, template, variables.
 * entity_id, priority_player and media_players entries may be button-card
 * style [[[ ... ]]] templates.
 */
(function () {
  const VERSION = '1.0.0';
  const ACTIVE_STATES = ['playing', 'buffering'];
  const REPEAT_NEXT = {off: 'all', all: 'one', one: 'off'};
  const REPEAT_ICON = {off: 'mdi:repeat-off', all: 'mdi:repeat', one: 'mdi:repeat-once'};
  // How long the list of Whole Bus member players is reused before the full
  // entity list is scanned again.
  const MEMBER_SCAN_MS = 10000;
  // Most items listed in the full queue view.
  const QUEUE_LIMIT = 100;
  // Longest the track info shows its spinner after a song is picked, in case
  // the title never changes (e.g. the same song again).
  const TRACK_WAIT_MS = 12000;
  // Height of one entry in the player sheet.
  const SHEET_ROW_PX = 56;

  // Colour tokens: the Kiosk dashboard's --kiosk-* variables when present,
  // otherwise the Home Assistant theme.
  const TOKEN_STYLE = `
    :host {
      --ktm-surface: var(--kiosk-surface, var(--ha-card-background, var(--card-background-color, #1c1c1c)));
      --ktm-surface-edge: var(--kiosk-surface-edge, none);
      --ktm-accent: var(--kiosk-accent, var(--primary-color, #03a9f4));
      --ktm-text-primary: var(--kiosk-text-primary, var(--primary-text-color, #fff));
      --ktm-text-secondary: var(--kiosk-text-secondary, var(--secondary-text-color, #9b9b9b));
      --ktm-background: var(--kiosk-background, var(--lovelace-background, var(--primary-background-color, #111)));
      --ktm-viewport-height: var(--kiosk-viewport-content-height, 100%);
    }`;
  const BASE_STYLE = `
:host {
  display: block;
  box-sizing: border-box;
  height: var(--ktm-viewport-height);
  min-height: 300px;
  color: var(--ktm-text-primary);
  --ktm-gap: 8px;
  --ktm-radius: var(--kiosk-border-radius-12px, 12px);
}
.shell {
  --ha-card-background: var(--ktm-surface);
  --card-background-color: var(--ktm-surface);
  --primary-text-color: var(--ktm-text-primary);
  --secondary-text-color: var(--ktm-text-secondary);
  --accent-color: var(--ktm-accent);
  --primary-color: var(--ktm-accent);
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  gap: var(--ktm-gap);
  width: 100%;
  height: 100%;
  min-height: 0;
}
.art-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: var(--ktm-gap);
}
.art {
  position: relative;
  min-height: 0;
  border-radius: var(--ktm-radius);
  background: var(--ktm-surface);
  box-shadow: var(--ktm-surface-edge);
  overflow: hidden;
  display: grid;
  place-items: center;
}
/* The picture is laid over the whole panel and fitted inside it, so a tall
   or short panel never crops it. */
.art img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.art ha-icon {
  --mdc-icon-size: 96px;
  color: var(--ktm-text-secondary);
  opacity: 0.5;
}
/* The controls column measures its own height (container units below) so the
   buttons and the song info grow to use a tall screen; on a short one they
   keep their minimum size and the column scrolls. */
.controls {
  container-type: size;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ktm-gap);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.controls > .slot {
  flex: 0 0 auto;
}
/* Bubble Card button height is --row-height; set it per slot. */
#transport,
#sources {
  --row-height: clamp(56px, 14cqh, 128px);
}
#now-playing {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.volume-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: var(--ktm-gap);
}
.volume-row #mute {
  order: -1;
}
.volume-row:has(#mute:empty) {
  grid-template-columns: minmax(0, 1fr);
}
.slot:empty {
  display: none;
}
/* Keep each Bubble widget's drawing inside its own slot so nothing it
   positions absolutely can sit over the buttons below it. */
.slot {
  position: relative;
  contain: layout paint;
}
/* Song, artist and album. */
.now {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  padding: 10px 14px 12px;
  display: grid;
  align-content: center;
  gap: 2px;
  border-radius: var(--ktm-radius);
  background: var(--ktm-surface);
  box-shadow: var(--ktm-surface-edge);
  text-align: center;
}
.now-state {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: clamp(12px, 2cqh, 18px);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ktm-accent);
}
.now-state ha-icon {
  --mdc-icon-size: 18px;
}
.now-title {
  font-size: clamp(18px, 5cqh, 48px);
  font-weight: 700;
  line-height: 1.2;
  color: var(--ktm-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.now-artist {
  font-size: clamp(14px, 3.2cqh, 30px);
  color: var(--ktm-text-primary);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.now-album {
  font-size: clamp(13px, 2.6cqh, 24px);
  color: var(--ktm-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.now.idle .now-title {
  color: var(--ktm-text-secondary);
  font-weight: 600;
}

/* Player selector sheet: covers the card, options sit at the bottom. */
.sheet {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet[hidden] {
  display: none;
}
.sheet-backdrop {
  position: absolute;
  inset: 0;
  border-radius: var(--ktm-radius);
  background: rgba(0, 0, 0, 0.55);
}
.sheet-panel {
  position: relative;
  box-sizing: border-box;
  width: min(100%, 560px);
  max-height: 100%;
  overflow-y: auto;
  padding: var(--ktm-gap);
  display: grid;
  gap: var(--ktm-gap);
  border-radius: var(--ktm-radius);
  background: var(--ktm-background);
  box-shadow: var(--ktm-surface-edge);
}
.sheet-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ktm-gap);
}
.sheet-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
  font-weight: 600;
  font-size: 18px;
  color: var(--ktm-text-primary);
}
.sheet-options {
  display: grid;
  gap: var(--ktm-gap);
}
.tap {
  min-width: 0;
  cursor: pointer;
  touch-action: manipulation;
}
.row {
  display: grid;
  gap: var(--ktm-gap);
}
.row.one { grid-template-columns: minmax(0, 1fr); }
.row.seven { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.row.six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.message {
  box-sizing: border-box;
  padding: 24px;
  text-align: center;
  color: var(--ktm-text-secondary);
}

/* Music Assistant browser: covers the whole card while open. */
.browser {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: var(--ktm-gap);
  padding: var(--ktm-gap);
  box-sizing: border-box;
  border-radius: var(--ktm-radius);
  background: var(--ktm-background);
  box-shadow: var(--ktm-surface-edge);
}
.browser[hidden],
.search[hidden],
.chips[hidden] {
  display: none;
}
.browser-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ktm-gap);
}
.tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
button {
  font: inherit;
  color: inherit;
  border: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tabs button,
.close,
.chips button,
.search button {
  min-height: 48px;
  padding: 0 14px;
  border-radius: var(--ktm-radius);
  background: var(--ktm-surface);
  box-shadow: var(--ktm-surface-edge);
  color: var(--ktm-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.tabs button.active,
.chips button.active {
  background: var(--ktm-accent);
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
}
.close {
  width: 56px;
  justify-content: center;
}
.search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--ktm-gap);
}
.search input {
  min-height: 52px;
  padding: 0 16px;
  font: inherit;
  font-size: 18px;
  color: var(--ktm-text-primary);
  background: var(--ktm-surface);
  border: none;
  border-radius: var(--ktm-radius);
  box-shadow: var(--ktm-surface-edge);
  outline: none;
}
.search button {
  width: 64px;
  justify-content: center;
}
.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}
.chips button {
  min-height: 42px;
}
.results {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-auto-rows: 72px;
  align-content: start;
  gap: var(--ktm-gap);
}
.results .message {
  grid-column: 1 / -1;
}
.item {
  min-height: 72px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  border-radius: var(--ktm-radius);
  background: var(--ktm-surface);
  box-shadow: var(--ktm-surface-edge);
  overflow: hidden;
}
.item-main {
  min-width: 0;
  min-height: 72px;
  padding: 8px;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: transparent;
}
.thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: rgba(127, 127, 127, 0.15);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.item-name,
.item-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-name {
  font-weight: 600;
}
.item-sub {
  font-size: 13px;
  color: var(--ktm-text-secondary);
}
.item .play {
  --mdc-icon-size: 32px;
  color: var(--ktm-accent);
}
.queue {
  width: 60px;
  background: transparent;
  border-left: 1px solid rgba(127, 127, 127, 0.2);
  color: var(--ktm-text-secondary);
}
.item-main:active,
.queue:active,
.tabs button:active,
.chips button:active {
  filter: brightness(1.2);
}

/* Short landscape displays (e.g. 960x480 with the navbar): tighter chrome. */
@media (max-height: 560px) {
  .results { grid-auto-rows: 60px; }
  .item, .item-main { min-height: 60px; }
  .thumb { width: 44px; height: 44px; }
  .item-main { grid-template-columns: 44px minmax(0, 1fr) auto; padding: 6px; }
  .tabs button, .close, .search button { min-height: 44px; }
  .now { padding: 6px 12px 8px; }
}

/* Narrow or portrait displays stack the artwork above the controls. */
@media (max-aspect-ratio: 1/1) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(160px, 0.8fr) minmax(0, 1.2fr);
  }
  .row.seven { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
`;

  const BROWSE_TABS = [
    {id: 'search', label: 'Search', icon: 'mdi:magnify'},
    {id: 'playlist', label: 'Playlists', icon: 'mdi:playlist-music'},
    {id: 'radio', label: 'Radio', icon: 'mdi:radio'},
    {id: 'album', label: 'Albums', icon: 'mdi:album'},
    {id: 'artist', label: 'Artists', icon: 'mdi:account-music'},
    {id: 'favorite', label: 'Favourites', icon: 'mdi:heart'}
  ];
  const SEARCH_TYPES = [
    {id: 'track', label: 'Songs', key: 'tracks'},
    {id: 'artist', label: 'Artists', key: 'artists'},
    {id: 'album', label: 'Albums', key: 'albums'},
    {id: 'playlist', label: 'Playlists', key: 'playlists'},
    {id: 'radio', label: 'Radio', key: 'radio'}
  ];

  // ---------------------------------------------------------------------
  // TEMPLATES (button-card style [[[ ... ]]])
  // ---------------------------------------------------------------------

  const TEMPLATE_RE = /^\s*\[\[\[([\s\S]*)\]\]\]\s*$/;
  const compiledTemplates = new Map();
  // Dashboard button_card_templates, read once per page load.
  const templateStore = {data: null, promise: null};

  const isTemplate = value => typeof value === 'string' && TEMPLATE_RE.test(value);

  // Runs the body of a [[[ ]]] template like button-card does: as a function
  // body with hass, states, variables and user in scope. A body without
  // `return` is treated as one expression.
  function runTemplate(source, context) {
    let fn = compiledTemplates.get(source);
    if (!fn) {
      let body = TEMPLATE_RE.exec(source)[1];
      if (!/\breturn\b/.test(body)) body = `return (${body.trim().replace(/;+$/, '')});`;
      fn = new Function('hass', 'states', 'variables', 'user', 'entity', body);
      compiledTemplates.set(source, fn);
    }
    return fn(context.hass, context.hass?.states || {}, context.variables, context.hass?.user, undefined);
  }

  // Variables from the named button-card templates (and the templates they
  // use), later ones overriding earlier ones.
  function collectTemplateVariables(names, store, seen = new Set()) {
    const out = {};
    for (const name of [].concat(names || [])) {
      const template = store?.[name];
      if (!template || seen.has(name)) continue;
      seen.add(name);
      Object.assign(out, collectTemplateVariables(template.template, store, seen), template.variables || {});
    }
    return out;
  }

  function loadButtonCardTemplates(hass) {
    if (templateStore.data) return Promise.resolve(templateStore.data);
    if (!templateStore.promise) {
      const path = window.location.pathname.split('/')[1];
      templateStore.promise = hass.callWS({
        type: 'lovelace/config',
        url_path: !path || path === 'lovelace' ? null : path
      }).then(config => {
        templateStore.data = config?.button_card_templates || {};
        return templateStore.data;
      }).catch(error => {
        templateStore.promise = null;
        throw error;
      });
    }
    return templateStore.promise;
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  // Extra styles for the card host: the colour tokens handed to Bubble Card
  // (its variables inherit into every Bubble Card inside this card), then the
  // queue sheet rows and the track-change spinner. The sheet itself is styled
  // in the stylesheet.
  const QUEUE_STYLE = `
    :host {
      --bubble-main-background-color: var(--ktm-surface);
      --bubble-secondary-background-color: var(--ktm-surface);
      --bubble-button-main-background-color: var(--ktm-surface);
      --bubble-box-shadow: var(--ktm-surface-edge);
      --bubble-accent-color: var(--ktm-accent);
      --bubble-button-accent-color: var(--ktm-accent);
    }
    .art { background: transparent !important; box-shadow: none !important; border: 0 !important; container-type: size; }
    .art img {
      inset: auto !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%);
      width: min(100cqw, 100cqh) !important; height: min(100cqw, 100cqh) !important;
      object-fit: contain; border-radius: 12px; background: transparent !important;
    }
    .row.two { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; }
    #progress { --prog-h: clamp(20px, 4cqh, 28px); }
    .prog { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
    .prog-time {
      min-width: 3.4ch; font-variant-numeric: tabular-nums; font-weight: 600;
      font-size: clamp(14px, 3cqh, 24px); color: var(--ktm-text-primary);
    }
    .prog-time.end { text-align: right; }
    .prog-track {
      position: relative; box-sizing: border-box; height: var(--prog-h); overflow: hidden;
      border-radius: 999px; background: var(--ktm-surface); box-shadow: var(--ktm-surface-edge);
      touch-action: none; cursor: pointer; user-select: none; -webkit-user-select: none;
    }
    .prog-fill { position: absolute; inset: 0 auto 0 0; width: 0; background-color: var(--ktm-accent); }
    .prog.off .prog-track, .prog.ro .prog-track { cursor: default; }
    .prog.off { opacity: 0.45; }
    .now.tappable { cursor: pointer; touch-action: manipulation; }
    .now { display: flex; flex-direction: column; }
    .now-state { flex: 0 0 auto; }
    .now-title { margin-top: auto; }
    .now > :last-child { margin-bottom: auto; }
    .now-state .now-queue { margin-left: auto; opacity: 0.7; }
    #now-playing.loading::after {
      content: ''; position: absolute; inset: 0; z-index: 1;
      border-radius: var(--ktm-radius); background: rgba(0, 0, 0, 0.5);
    }
    #now-playing.loading::before {
      content: ''; position: absolute; z-index: 2; top: 50%; left: 50%;
      width: 32px; height: 32px; margin: -16px 0 0 -16px; box-sizing: border-box;
      border: 4px solid rgba(255, 255, 255, 0.3); border-top-color: var(--ktm-accent, #fff);
      border-radius: 50%; animation: ktm-spin 0.8s linear infinite;
    }
    @keyframes ktm-spin { to { transform: rotate(360deg); } }
    .queue-info { padding: 2px 8px 6px; font-size: 13px; color: var(--ktm-text-secondary); }
    .queue-item {
      display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 10px;
      padding: 8px; border-radius: var(--ktm-radius); background: var(--ktm-surface);
      box-shadow: var(--ktm-surface-edge);
    }
    .queue-item.current { box-shadow: inset 0 0 0 2px var(--ktm-accent); }
    .queue-label {
      font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--ktm-accent);
    }
    .queue-row {
      display: grid; grid-template-columns: 28px 48px minmax(0, 1fr) auto; align-items: center; gap: 8px;
      min-height: 60px; padding: 4px 4px 4px 8px; border-radius: var(--ktm-radius);
      background: var(--ktm-surface); box-shadow: var(--ktm-surface-edge);
    }
    .queue-row.current { box-shadow: inset 0 0 0 2px var(--ktm-accent); }
    .queue-row .thumb { width: 48px; height: 48px; }
    .queue-pos { text-align: center; font-size: 13px; color: var(--ktm-text-secondary); }
    .queue-row.current .queue-pos { color: var(--ktm-accent); }
    .queue-row .queue-main {
      min-width: 0; min-height: 48px; display: grid; gap: 2px; align-content: center;
      text-align: left; background: transparent;
    }
    .queue-actions { display: flex; }
    .queue-actions button {
      width: 44px; min-height: 48px; background: transparent; color: var(--ktm-text-secondary);
      display: inline-flex; align-items: center; justify-content: center;
    }
    .queue-actions button[disabled] { opacity: 0.25; cursor: default; }`;


  // Bubble Card button layout: icon and label sit in .bubble-button, with
  // default margins that push them off-centre. Centre the icon (and the
  // label, when shown) and drop the empty label box on icon-only buttons.
  const CENTER_STYLE = `
    .bubble-button { justify-content: center !important; }
    .bubble-main-icon-container { margin: 0 !important; flex: 0 0 auto !important; }
    .bubble-name-container { flex-grow: 0 !important; margin: 0 0 0 10px !important; text-align: center !important; }
    .bubble-icon-container, .bubble-main-icon-container {
      background-color: rgba(255, 255, 255, 0.16) !important;
      background-color: color-mix(in srgb, var(--ktm-text-primary, #fff) 22%, var(--ktm-surface, #222)) !important;
    }
    .bubble-main-icon, .bubble-icon { color: var(--ktm-text-primary, #fff) !important; }`;
  // The volume slider: filled with the accent colour, icon disc and text in
  // the theme colours.
  const SLIDER_STYLE = `
    .bubble-range-fill { background-color: var(--ktm-accent) !important; opacity: 1 !important; }
    .bubble-icon-container, .bubble-main-icon-container {
      background-color: rgba(0, 0, 0, 0.34) !important;
    }
    .bubble-main-icon, .bubble-icon { color: var(--ktm-text-primary, #fff) !important; }
    .bubble-name, .bubble-state { color: var(--ktm-text-primary, #fff) !important; }`;
  // Buttons inside a player-sheet entry: no background of their own, so the
  // entry's single pill shows through behind both halves, and a fixed height
  // that matches the pill.
  const MERGED_STYLE = `
    :host { --row-height: ${SHEET_ROW_PX}px; }
    .bubble-button-background { background-color: transparent !important; opacity: 0 !important; }
    .bubble-container, .bubble-button-card-container, ha-card {
      background: transparent !important; box-shadow: none !important;
    }
    .bubble-container { height: ${SHEET_ROW_PX}px !important; }`;
  // The player half of an entry that also has a Move queue button: icon at a
  // fixed place on the left so the icons of all such entries line up.
  const ICON_LEFT_STYLE = `
    .bubble-button { justify-content: flex-start !important; padding-left: 18px !important; box-sizing: border-box !important; }
    .bubble-name-container { text-align: left !important; }`;
  // A music-note icon (mdi:music) after the name of a player that is playing.
  const PLAYING_STYLE = `
    .bubble-name-container { display: flex !important; flex-direction: row !important; align-items: center !important; }
    .bubble-name { min-width: 0; }
    .bubble-name-container::after {
      content: ''; display: block; flex: 0 0 auto; width: 1.15em; height: 1.15em; margin-left: 8px;
      background-color: currentColor;
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z'/%3E%3C/svg%3E") center / contain no-repeat;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z'/%3E%3C/svg%3E") center / contain no-repeat;
    }`;
  // The two buttons that share a row meet in the middle: square corners on the
  // sides that touch.
  const SQUARE_RIGHT_STYLE = `
    .bubble-container, .bubble-button-card-container, ha-card, .bubble-button-background {
      border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important;
    }`;
  const SQUARE_LEFT_STYLE = `
    .bubble-container, .bubble-button-card-container, ha-card, .bubble-button-background {
      border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important;
    }`;
  const HIDE_LABEL_STYLE = `.bubble-name-container { display: none !important; }`;
  const ACTIVE_STYLE = `
    .bubble-button-background { background-color: var(--ktm-accent, var(--accent-color)) !important; opacity: 1 !important; }
    .bubble-icon-container, .bubble-main-icon-container {
      background-color: rgba(0, 0, 0, 0.34) !important;
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.6) !important;
    }
    .bubble-main-icon, .bubble-icon { color: #fff !important; }
    .bubble-name-container, .bubble-name, .bubble-name-container * {
      color: #fff !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55) !important;
    }`;

  class TouchMediaCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode: 'open'});
      this.mode = null;
      this.satellite = null;
      this.busWasActive = false;
      this.localWasActive = false;
      this.player = null;
      // The resolved player options (templates evaluated): this display's own
      // player, the optional priority player and its label, and the extra
      // players to offer when discover is false.
      this.opts = {local: '', priority: '', priorityName: '', players: []};
      this.templatesRetryAt = 0;
      // Player chosen from the full Music Assistant list (mode 'other').
      this.otherPlayer = null;
      this.cards = {};
      // Button rows, kept between state changes so they can be updated in
      // place: slot id -> {wrap, cls, cells: [{el, card, onTap, sig}]}.
      this.rows = {};
      this.controlSignature = '';
      this.buildToken = 0;
      this.browseTab = null;
      this.searchType = 'track';
      this.browseToken = 0;
      // What the sheet currently shows: 'select' (players) or 'queue' (null
      // while it is closed).
      this.sheetKind = null;
      this.queueToken = 0;
      // Set while the track info shows its spinner after a song was picked
      // from the queue: {title, player, timer}.
      this.pendingTrack = null;
      this.configEntryId = null;
      this.muteMembers = null;
      // Signature of the volume slider's current config (its icon follows
      // the muted state).
      this.volumeSig = '';
      // Bubble Cards report taps as `hass-action` events, and Home Assistant
      // then runs their default action (a toggle, which becomes
      // media_player.turn_off and is rejected by these players). Every real
      // command here is issued by this card itself, so none of those events
      // are allowed out of it.
      this.addEventListener('hass-action', event => event.stopPropagation(), true);
    }

    setConfig(config) {
      config = config || {};
      if (config.discover === false &&
          !(Array.isArray(config.media_players) && config.media_players.length)) {
        throw new Error('touch-media-card: media_players must list at least one player when discover is false.');
      }
      this.config = config;
      this.renderShell();
      this.sync(true);
    }

    // Evaluates a [[[ ]]] template (or returns a plain value) in this card's
    // context. `variables` is built lazily so a variable that is itself a
    // template is evaluated when read, as in button-card.
    resolveValue(value, variables) {
      if (!isTemplate(value)) return typeof value === 'string' ? value.trim() : '';
      try {
        const result = runTemplate(value, {hass: this._hass, variables});
        return typeof result === 'string' ? result.trim() : '';
      } catch (error) {
        console.warn('[Touch Media Card] Template in the touch media card failed.', error);
        return '';
      }
    }

    templateVariables() {
      const raw = {...collectTemplateVariables(this.config?.template, templateStore.data),
        ...(this.config?.variables || {})};
      const variables = {};
      const active = new Set();
      for (const key of Object.keys(raw)) {
        Object.defineProperty(variables, key, {
          enumerable: true,
          get: () => {
            const value = raw[key];
            if (!isTemplate(value)) return value;
            if (active.has(key)) return undefined;
            active.add(key);
            try {
              return runTemplate(value, {hass: this._hass, variables});
            } catch (error) {
              console.warn(`[Touch Media Card] Variable ${key} failed.`, error);
              return undefined;
            } finally {
              active.delete(key);
            }
          }
        });
      }
      return variables;
    }

    // The card options with templates resolved. entity_id is this display's
    // own player; priority_player is optional, and when it is missing or
    // does not exist there is no priority player at all.
    resolveOptions() {
      const config = this.config || {};
      const variables = this.templateVariables();
      const resolve = value => this.resolveValue(value, variables);
      const states = this._hass?.states || {};
      const local = resolve(config.entity_id);
      let priority = resolve(config.priority_player);
      if (!states[priority] || priority === local) priority = '';
      const players = config.discover === false
        ? [].concat(config.media_players || []).map(resolve).filter(Boolean) : [];
      const priorityName = String(config.priority_name || '').trim() ||
        states[priority]?.attributes?.friendly_name || 'Priority player';
      this.opts = {local, priority, priorityName, players};
    }

    // Reads the dashboard's button-card templates once, when the card names
    // any, then redraws so templates that use their variables resolve.
    ensureTemplates() {
      if (!this.config?.template || templateStore.data || !this._hass?.callWS ||
          Date.now() < this.templatesRetryAt) return;
      this.templatesRetryAt = Date.now() + 5000;
      loadButtonCardTemplates(this._hass).then(() => this.sync(true)).catch(error =>
        console.warn('[Touch Media Card] Could not read the dashboard templates for the touch media card.', error));
    }

    set hass(value) {
      this._hass = value;
      // The Bubble Cards here only show the player's own entity (the volume
      // slider) or static buttons, so they need a fresh hass only when that
      // entity's state object, the theme or the language changes, not on every
      // state change anywhere in Home Assistant.
      const playerState = value?.states?.[this.player];
      if (playerState !== this.fwdPlayerState || value?.themes !== this.fwdThemes ||
          value?.language !== this.fwdLanguage) {
        this.fwdPlayerState = playerState;
        this.fwdThemes = value?.themes;
        this.fwdLanguage = value?.language;
        for (const card of Object.values(this.cards)) card.hass = value;
      }
      this.sync();
    }

    connectedCallback() {
      this.progTimer = setInterval(() => {
        if (!document.hidden && !this.progDrag) this.updateProgress(this.player);
      }, 1000);
      this.sync(true);
    }

    disconnectedCallback() {
      clearInterval(this.progTimer);
      this.progTimer = null;
      this.buildToken++;
      this.endTrackWait();
      this.closePlayerPopup();
    }

    getCardSize() {
      return 8;
    }

    // ---------------------------------------------------------------------
    // SHELL
    // ---------------------------------------------------------------------

    renderShell() {
      if (this.shadowRoot.childElementCount) return;
      this.shadowRoot.innerHTML = `
        <style>${TOKEN_STYLE}${BASE_STYLE}${QUEUE_STYLE}</style>
        <div class="shell">
          <div class="art-panel">
            <div class="art" id="art"><ha-icon icon="mdi:music"></ha-icon></div>
            <div class="volume-row">
              <div class="slot" id="volume"></div>
              <div class="slot" id="mute"></div>
            </div>
          </div>
          <div class="controls">
            <div class="slot" id="now-playing"></div>
            <div class="slot" id="progress"></div>
            <div class="slot" id="transport"></div>
            <div class="slot" id="sources"></div>
          </div>
          <div class="sheet" id="sheet" hidden>
            <div class="sheet-backdrop" id="sheet-backdrop"></div>
            <div class="sheet-panel">
              <div class="sheet-head">
                <span class="sheet-title"><ha-icon icon="mdi:speaker-multiple"></ha-icon><span id="sheet-title-text">Players</span></span>
                <button type="button" class="close" id="sheet-close" aria-label="Close">
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
              <div class="sheet-options" id="sheet-options"></div>
            </div>
          </div>
          <div class="browser" id="browser" hidden>
            <div class="browser-head">
              <div class="tabs" id="tabs"></div>
              <button type="button" class="close" id="close" aria-label="Close">
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
            <form class="search" id="search" hidden>
              <input id="query" type="search" enterkeyhint="search" autocomplete="off"
                placeholder="Search Music Assistant" aria-label="Search Music Assistant">
              <button type="submit" aria-label="Search"><ha-icon icon="mdi:magnify"></ha-icon></button>
            </form>
            <div class="chips" id="chips" hidden></div>
            <div class="results" id="results"></div>
          </div>
        </div>`;
      const root = this.shadowRoot;
      root.getElementById('close').addEventListener('click', () => this.closeBrowser());
      // The sheet appears under the finger that tapped the selector, so the
      // click that finishes that tap must not count as a tap on the backdrop.
      const dismiss = () => {
        if (Date.now() - (this.sheetOpenedAt || 0) > 500) this.closePlayerPopup();
      };
      root.getElementById('sheet-close').addEventListener('click', dismiss);
      root.getElementById('sheet-backdrop').addEventListener('click', dismiss);
      this.buildProgress();
      // Tapping the track info opens the queue.
      this.bindTap(root.getElementById('now-playing'), () => {
        if (this._hass?.states[this.player]) void this.openQueue();
      });
      // Buttons in the full queue list.
      root.getElementById('sheet-options').addEventListener('click', event => {
        const button = event.target.closest('button[data-act]');
        if (!button || this.sheetKind !== 'queue' || button.disabled) return;
        void this.queueAction(button.dataset.act, button.dataset.id, Number(button.dataset.index));
      });
      root.getElementById('search').addEventListener('submit', event => {
        event.preventDefault();
        root.getElementById('query').blur();
        void this.loadBrowse();
      });
      root.getElementById('tabs').innerHTML = BROWSE_TABS.map(tab => `
        <button type="button" data-tab="${tab.id}">
          <ha-icon icon="${tab.icon}"></ha-icon><span>${tab.label}</span>
        </button>`).join('');
      root.getElementById('tabs').addEventListener('click', event => {
        const button = event.target.closest('button[data-tab]');
        if (button) this.openBrowser(button.dataset.tab);
      });
      root.getElementById('chips').innerHTML = SEARCH_TYPES.map(type => `
        <button type="button" data-type="${type.id}">${type.label}</button>`).join('');
      root.getElementById('chips').addEventListener('click', event => {
        const button = event.target.closest('button[data-type]');
        if (!button) return;
        this.searchType = button.dataset.type;
        this.updateChips();
        if (root.getElementById('query').value.trim()) void this.loadBrowse();
      });
      root.getElementById('results').addEventListener('click', event => {
        const button = event.target.closest('button[data-uri]');
        if (!button) return;
        void this.playItem(button.dataset.uri, button.dataset.type, button.dataset.enqueue);
      });
    }

    // ---------------------------------------------------------------------
    // PLAYER CHOICE
    // ---------------------------------------------------------------------

    // This display's own player (the entity_id option).
    localPlayer() {
      return this.opts.local;
    }

    // The priority player, or '' when there is none (the busPlayer name is
    // from when it was always the whole-home audio group).
    busPlayer() {
      return this.opts.priority;
    }

    priorityLabel() {
      return this.opts.priorityName;
    }

    // The other players offered besides this display's own and the priority
    // player, by friendly name: every Music Assistant player (recognised by
    // the attributes the integration puts on them) when discover is on,
    // otherwise the players listed in media_players.
    musicAssistantPlayers() {
      const states = this._hass?.states || {};
      const bus = this.busPlayer();
      const local = this.localPlayer();
      const found = this.config?.discover === false
        ? this.opts.players.map(id => states[id]).filter(Boolean)
        : Object.values(states).filter(s => s.entity_id?.startsWith('media_player.') &&
          (s.attributes?.mass_player_type !== undefined || s.attributes?.active_queue !== undefined));
      return found.filter(s => s.entity_id !== bus && s.entity_id !== local)
        .sort((a, b) => this.playerName(a.entity_id).localeCompare(this.playerName(b.entity_id)));
    }

    sync(force = false) {
      this.renderShell();
      const hass = this._hass;
      if (!hass?.states) return;
      this.ensureTemplates();
      this.resolveOptions();
      const localPlayer = this.localPlayer();
      const busPlayer = this.busPlayer();
      const busActive = ACTIVE_STATES.includes(hass.states[busPlayer]?.state);
      const localActive = !!localPlayer && ACTIVE_STATES.includes(hass.states[localPlayer]?.state);

      if (localPlayer !== this.satellite) {
        this.satellite = localPlayer;
        this.mode = busActive ? 'bus' : 'device';
      } else if (busActive && !this.busWasActive) {
        // The whole bus started playing: show it, even if another player had
        // been picked by hand.
        this.mode = 'bus';
      } else if (!busActive && this.busWasActive && this.mode === 'bus' && localPlayer) {
        // The whole bus stopped while it was shown: fall back to this device.
        this.mode = 'device';
      } else if (localActive && !this.localWasActive && !busActive) {
        // This device's own player started playing (the bus wins when both
        // start together, as the local player is a member of it).
        this.mode = 'device';
      } else if (!this.mode) {
        this.mode = busActive ? 'bus' : 'device';
      }
      // A display with no local player (e.g. a desktop browser) can still
      // control the whole bus.
      if (this.mode === 'device' && !localPlayer && busPlayer) this.mode = 'bus';
      // With neither a local nor a priority player, show the first available
      // player (one that is playing, if any) until another is picked.
      if (this.mode === 'device' && !localPlayer && !busPlayer) {
        const choices = this.musicAssistantPlayers();
        const pick = choices.find(s => ACTIVE_STATES.includes(s.state)) || choices[0];
        if (pick) {
          this.mode = 'other';
          this.otherPlayer = pick.entity_id;
        }
      }
      // Any-player choice only lasts while that player still exists.
      if (this.mode === 'other' && !hass.states[this.otherPlayer]) {
        this.mode = localPlayer ? 'device' : (busPlayer ? 'bus' : 'device');
      }
      this.busWasActive = busActive;
      this.localWasActive = localActive;

      const player = this.mode === 'bus' ? busPlayer
        : this.mode === 'other' ? this.otherPlayer : localPlayer;
      this.updateArt(player);
      this.updateNowPlaying(player);
      this.updateProgress(player);
      if (force || player !== this.player) {
        this.player = player;
        this.controlSignature = '';
        void this.buildCards();
        return;
      }
      const signature = this.signature();
      if (signature !== this.controlSignature) {
        this.controlSignature = signature;
        void this.buildControls();
      }
    }

    signature() {
      const local = this._hass?.states[this.localPlayer()];
      const bus = this._hass?.states[this.busPlayer()];
      const player = this._hass?.states[this.player];
      const a = player?.attributes || {};
      return [this.mode, local?.state, bus?.state, player?.state, a.shuffle, a.repeat,
        this.muteInfo().muted].join('|');
    }

    // Which players a mute tap acts on, and whether they are muted. A player
    // reports is_volume_muted itself; the whole-bus sync group does not, so
    // its mute state is read from the member players sharing its queue, and
    // muting it mutes them all. Finding the members means scanning every
    // entity, so that list is reused for MEMBER_SCAN_MS and only the members'
    // own mute attributes are read on each call.
    muteInfo() {
      const states = this._hass?.states || {};
      const a = states[this.player]?.attributes || {};
      if (typeof a.is_volume_muted === 'boolean') {
        return {entities: [this.player], muted: a.is_volume_muted};
      }
      if (a.active_queue) {
        const cache = this.muteMembers;
        const now = Date.now();
        if (!cache || cache.queue !== a.active_queue || cache.player !== this.player ||
            now - cache.at > MEMBER_SCAN_MS) {
          this.muteMembers = {
            queue: a.active_queue,
            player: this.player,
            at: now,
            ids: Object.values(states).filter(s => s.entity_id?.startsWith('media_player.') &&
              s.attributes?.active_queue === a.active_queue &&
              s.attributes?.mass_player_type === 'player' &&
              typeof s.attributes.is_volume_muted === 'boolean').map(s => s.entity_id)
          };
        }
        const members = this.muteMembers.ids.map(id => states[id])
          .filter(s => typeof s?.attributes?.is_volume_muted === 'boolean');
        if (members.length) {
          return {entities: members.map(s => s.entity_id),
            muted: members.some(s => s.attributes.is_volume_muted)};
        }
      }
      return {entities: [this.player], muted: false};
    }

    where() {
      if (this.mode === 'bus') return this.priorityLabel();
      if (this.mode === 'other') return this.playerName(this.otherPlayer);
      return this.playerName(this.localPlayer());
    }

    playerName(entityId) {
      return this._hass?.states[entityId]?.attributes?.friendly_name || entityId || 'Not configured';
    }

    updateArt(player) {
      const root = this.shadowRoot;
      const stateObj = this._hass?.states[player];
      const a = stateObj?.attributes || {};
      const picture = a.entity_picture_local || a.entity_picture || '';
      const art = root.getElementById('art');
      if (art.dataset.src !== picture) {
        art.dataset.src = picture;
        art.innerHTML = picture
          ? `<img src="${escapeHtml(this._hass.hassUrl ? this._hass.hassUrl(picture) : picture)}" alt="" decoding="async">`
          : '<ha-icon icon="mdi:music"></ha-icon>';
      }
    }

    // ---------------------------------------------------------------------
    // TRACK PROGRESS
    // ---------------------------------------------------------------------

    formatTime(seconds) {
      const total = Math.max(0, Math.floor(seconds || 0));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = String(total % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    }

    buildProgress() {
      const root = this.shadowRoot;
      root.getElementById('progress').innerHTML = `
        <div class="prog off" id="prog">
          <span class="prog-time" id="prog-pos">-:--</span>
          <div class="prog-track" id="prog-track" role="slider" aria-label="Track position">
            <div class="prog-fill" id="prog-fill"></div>
          </div>
          <span class="prog-time end" id="prog-dur">-:--</span>
        </div>`;
      const track = root.getElementById('prog-track');
      const valueAt = event => {
        const rect = track.getBoundingClientRect();
        const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
        return Math.min(1, Math.max(0, ratio)) * (this.progInfo?.duration || 0);
      };
      track.addEventListener('pointerdown', event => {
        if (!this.progInfo?.seek) return;
        event.preventDefault();
        track.setPointerCapture(event.pointerId);
        this.progDrag = {id: event.pointerId, value: valueAt(event)};
        this.paintProgress();
      });
      track.addEventListener('pointermove', event => {
        if (!this.progDrag || this.progDrag.id !== event.pointerId) return;
        this.progDrag.value = valueAt(event);
        this.paintProgress();
      });
      const finish = (event, commit) => {
        const drag = this.progDrag;
        if (!drag || drag.id !== event.pointerId) return;
        this.progDrag = null;
        if (commit) this.seekTo(drag.value);
        this.paintProgress();
      };
      track.addEventListener('pointerup', event => finish(event, true));
      track.addEventListener('pointercancel', event => finish(event, false));
      // Nothing in the slider is a tap for the controls behind it.
      track.addEventListener('click', event => event.stopPropagation());
      this.paintProgress();
    }

    // Position, length and whether seeking works for `player`, or null when
    // it reports no duration. media_position is only reported on state
    // changes, so it is anchored to the local clock and advanced from there.
    progressInfo(player) {
      const stateObj = this._hass?.states[player];
      const a = stateObj?.attributes || {};
      const duration = Number(a.media_duration) || 0;
      if (!stateObj || duration <= 0) return null;
      const playing = stateObj.state === 'playing';
      const key = [player, stateObj.state, a.media_position, a.media_position_updated_at,
        a.media_title, duration].join('|');
      if (key !== this.progKey) {
        this.progKey = key;
        let pos = Number(a.media_position) || 0;
        // Catch up for the time since Home Assistant stamped the position
        // (it is not refreshed while a track plays, so this can be minutes).
        const age = (Date.now() - Date.parse(a.media_position_updated_at)) / 1000;
        if (playing && age > 0) pos += age;
        this.progAnchor = {pos, at: Date.now()};
      }
      // Just after a seek the old position may still be reported; keep the
      // sought position until Home Assistant sends a new one.
      const hold = this.progHold && this.progHold.key === key && Date.now() - this.progHold.at < 5000;
      const base = hold ? this.progHold : this.progAnchor;
      const pos = base.pos + (playing ? (Date.now() - base.at) / 1000 : 0);
      return {
        duration,
        pos: Math.min(duration, Math.max(0, pos)),
        seek: !!((Number(a.supported_features) || 0) & 2)
      };
    }

    updateProgress(player) {
      if (!this.shadowRoot.getElementById('prog')) return;
      this.progInfo = this.progressInfo(player);
      if (!this.progDrag) this.paintProgress();
    }

    paintProgress() {
      const root = this.shadowRoot;
      const info = this.progInfo;
      const pos = this.progDrag ? this.progDrag.value : info?.pos || 0;
      const text = info ? [this.formatTime(pos), this.formatTime(info.duration)] : ['-:--', '-:--'];
      const width = info ? `${(pos / info.duration * 100).toFixed(2)}%` : '0';
      const paint = [text[0], text[1], width, !info, !!info && !info.seek].join('|');
      if (paint === this.progPaint) return;
      this.progPaint = paint;
      root.getElementById('prog-pos').textContent = text[0];
      root.getElementById('prog-dur').textContent = text[1];
      root.getElementById('prog-fill').style.width = width;
      const prog = root.getElementById('prog');
      prog.classList.toggle('off', !info);
      prog.classList.toggle('ro', !!info && !info.seek);
      const track = root.getElementById('prog-track');
      track.setAttribute('aria-disabled', info?.seek ? 'false' : 'true');
      if (info) {
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(Math.floor(info.duration)));
        track.setAttribute('aria-valuenow', String(Math.floor(pos)));
      }
    }

    seekTo(position) {
      const hass = this._hass;
      const info = this.progInfo;
      if (!info?.seek || !this.player || !hass?.states[this.player]) return;
      const value = Math.min(info.duration, Math.max(0, position));
      this.progHold = {key: this.progKey, pos: value, at: Date.now()};
      this.updateProgress(this.player);
      hass.callService('media_player', 'media_seek',
        {entity_id: this.player, seek_position: Math.round(value)}).catch(error =>
        console.warn('[Touch Media Card] media_player.media_seek failed.', error));
    }

    // Song, artist and album, drawn by this card (not a Bubble widget) so the
    // title can be large and the layout stays tidy at any width. Tapping it
    // opens the queue.
    updateNowPlaying(player) {
      const holder = this.shadowRoot.getElementById('now-playing');
      const stateObj = this._hass?.states[player];
      const a = stateObj?.attributes || {};
      const key = stateObj
        ? [stateObj.state, a.media_title, a.media_artist, a.media_album_name].join('|') : 'none';
      if (holder.dataset.key === key) return;
      holder.dataset.key = key;
      // The song (or the player) changed, so the spinner has done its job.
      if (this.pendingTrack && (player !== this.pendingTrack.player ||
          a.media_title !== this.pendingTrack.title)) {
        this.endTrackWait();
      }
      // The track changed, so an open queue sheet is out of date.
      if (this.sheetKind === 'queue' && !this.shadowRoot.getElementById('sheet').hidden) {
        void this.loadQueue();
      }
      if (!stateObj) {
        holder.innerHTML = '<div class="message">No media player is configured for this display.</div>';
        return;
      }
      const states = {
        playing: ['mdi:play-circle', 'Playing'],
        buffering: ['mdi:progress-clock', 'Buffering'],
        paused: ['mdi:pause-circle', 'Paused']
      };
      const [icon, label] = states[stateObj.state] || ['mdi:music-off', 'Idle'];
      const title = a.media_title;
      holder.innerHTML = `
        <div class="now tappable ${title ? '' : 'idle'}">
          <div class="now-state"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><ha-icon class="now-queue" icon="mdi:playlist-music"></ha-icon></div>
          <div class="now-title">${escapeHtml(title || 'Nothing playing')}</div>
          ${a.media_artist ? `<div class="now-artist">${escapeHtml(a.media_artist)}</div>` : ''}
          ${a.media_album_name ? `<div class="now-album">${escapeHtml(a.media_album_name)}</div>` : ''}
        </div>`;
    }

    // Shows a spinner over the track info until the song changes (or
    // TRACK_WAIT_MS passes), after a song was picked from the queue.
    startTrackWait() {
      this.endTrackWait();
      this.pendingTrack = {
        title: this._hass?.states[this.player]?.attributes?.media_title,
        player: this.player,
        timer: setTimeout(() => this.endTrackWait(), TRACK_WAIT_MS)
      };
      this.shadowRoot.getElementById('now-playing')?.classList.add('loading');
    }

    endTrackWait() {
      if (!this.pendingTrack) return;
      clearTimeout(this.pendingTrack.timer);
      this.pendingTrack = null;
      this.shadowRoot.getElementById('now-playing')?.classList.remove('loading');
    }

    // ---------------------------------------------------------------------
    // BUBBLE CARD WIDGETS
    // ---------------------------------------------------------------------

    async createCard(slot, config) {
      const helpers = await window.loadCardHelpers();
      const card = helpers.createCardElement(config);
      card.hass = this._hass;
      this.cards[slot] = card;
      return card;
    }

    // The volume slider. Its icon doubles as the mute button, so it shows
    // the muted state.
    volumeConfig() {
      return {
        type: 'custom:bubble-card',
        card_type: 'button',
        button_type: 'slider',
        entity: this.player,
        name: 'Volume',
        icon: this.muteInfo().muted ? 'mdi:volume-off' : 'mdi:volume-high',
        show_state: false,
        show_attribute: false,
        card_layout: 'large',
        styles: SLIDER_STYLE,
        tap_action: {action: 'none'},
        double_tap_action: {action: 'none'},
        hold_action: {action: 'none'}
      };
    }

    async buildCards() {
      const token = ++this.buildToken;
      const root = this.shadowRoot;
      const player = this.player;
      if (!player || !this._hass?.states[player]) {
        for (const id of ['transport', 'volume', 'mute']) root.getElementById(id).replaceChildren();
        // The button rows were just emptied, so forget them; the next build
        // creates them afresh.
        for (const slot of ['transport', 'mute']) this.dropRow(slot);
        delete this.cards.nowPlaying;
        delete this.cards.volume;
        await this.buildControls(token);
        return;
      }

      const config = this.volumeConfig();
      const volume = await this.createCard('volume', config);
      if (token !== this.buildToken) return;
      this.volumeSig = JSON.stringify(config);
      // A tap on the icon at the left of the slider mutes or unmutes; the
      // rest of the slider still sets the volume.
      const hit = document.createElement('div');
      hit.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:64px;z-index:2;cursor:pointer;touch-action:manipulation;';
      this.bindTap(hit, () => this.toggleMute());
      root.getElementById('volume').replaceChildren(volume, hit);
      this.controlSignature = this.signature();
      await this.buildControls(token);
    }

    // Mutes or unmutes the player; for the whole bus, every member player.
    toggleMute() {
      const hass = this._hass;
      const info = this.muteInfo();
      if (!this.player || !hass?.states[this.player]) return;
      hass.callService('media_player', 'volume_mute',
        {entity_id: info.entities, is_volume_muted: !info.muted}).catch(error =>
        console.warn('[Touch Media Card] media_player.volume_mute failed.', error));
    }

    // Returns a Bubble Card button config plus the handler run when it is
    // tapped. Bubble's own tap_action is left as 'none'.
    button(name, icon, onTap, active = false, extra = {}) {
      return {
        onTap,
        config: {
          type: 'custom:bubble-card',
          card_type: 'button',
          button_type: 'name',
          name,
          icon,
          show_name: false,
          card_layout: 'large',
          tap_action: {action: 'none'},
          double_tap_action: {action: 'none'},
          hold_action: {action: 'none'},
          styles: CENTER_STYLE + (extra.show_name ? '' : HIDE_LABEL_STYLE) +
            (active ? ACTIVE_STYLE : ''),
          ...extra
        }
      };
    }

    // Forgets a button row (its cards and tap wrappers) without touching the DOM.
    dropRow(slot) {
      Object.keys(this.cards)
        .filter(key => key.startsWith(`${slot}-`))
        .forEach(key => delete this.cards[key]);
      delete this.rows[slot];
    }

    // Shows `buttons` in the row `slot`. When the row already holds the same
    // number of buttons they are updated in place: only a button whose config
    // actually changed gets setConfig, and each tap wrapper just receives its
    // new handler. A different button count (the player appeared or went
    // away) builds the row afresh.
    renderRow(slot, buttons, cls, helpers, hass) {
      const holder = this.shadowRoot.getElementById(slot);
      const existing = this.rows[slot];
      if (existing && existing.cls === cls && existing.cells.length === buttons.length &&
          holder.firstChild === existing.wrap) {
        buttons.forEach(({config, onTap}, index) => {
          const cell = existing.cells[index];
          cell.onTap = onTap;
          const sig = JSON.stringify(config);
          if (sig === cell.sig) return;
          cell.sig = sig;
          cell.card.setConfig(config);
          cell.card.hass = hass;
        });
        return;
      }
      this.dropRow(slot);
      if (!buttons.length) {
        holder.replaceChildren();
        return;
      }
      const wrap = document.createElement('div');
      wrap.className = `row ${cls}`;
      const cells = buttons.map(({config, onTap}, index) => {
        const card = helpers.createCardElement(config);
        card.hass = hass;
        this.cards[`${slot}-${index}`] = card;
        const el = document.createElement('div');
        el.className = 'tap';
        const cell = {el, card, onTap, sig: JSON.stringify(config)};
        this.bindTap(el, () => cell.onTap());
        el.append(card);
        wrap.append(el);
        return cell;
      });
      this.rows[slot] = {wrap, cls, cells};
      holder.replaceChildren(wrap);
    }

    async buildControls(token = this.buildToken) {
      const hass = this._hass;
      const player = this.player;
      const stateObj = hass?.states[player];
      const a = stateObj?.attributes || {};
      const perform = service => () => this.command(service);
      const cmd = (name, extra = {}) => () => this.command(name, extra);

      const selector = this.button(
        this.where(),
        this.mode === 'bus' ? 'mdi:speaker-multiple' : 'mdi:speaker',
        () => this.openPlayerPopup(), false, {show_name: true});

      const playing = stateObj?.state === 'playing';
      const repeat = a.repeat || 'off';
      const transport = stateObj ? [
        this.button('Shuffle', a.shuffle ? 'mdi:shuffle' : 'mdi:shuffle-disabled',
          cmd('shuffle'), !!a.shuffle),
        this.button('Previous', 'mdi:skip-previous', perform('media_previous_track')),
        this.button(playing ? 'Pause' : 'Play', playing ? 'mdi:pause' : 'mdi:play',
          perform('media_play_pause'), playing),
        this.button('Next', 'mdi:skip-next', perform('media_next_track')),
        this.button('Stop', 'mdi:stop', cmd('stop')),
        this.button('Repeat', REPEAT_ICON[repeat] || 'mdi:repeat', cmd('repeat'), repeat !== 'off')
      ] : [];
      // One button opens the browser; its own tabs cover search, playlists,
      // radio and the rest.
      const browse = [this.button('Browse music', 'mdi:music-box-multiple',
        cmd('browse', {tab: this.browseTab || 'search'}), false, {show_name: true})];

      const helpers = await window.loadCardHelpers();
      if (token !== this.buildToken) return;
      // The volume slider's icon follows the muted state.
      const volumeCard = this.cards.volume;
      if (volumeCard && stateObj) {
        const config = this.volumeConfig();
        const sig = JSON.stringify(config);
        if (sig !== this.volumeSig) {
          this.volumeSig = sig;
          volumeCard.setConfig(config);
          volumeCard.hass = hass;
        }
      }
      // Browse music (left) and the player picker (right) share one row.
      browse[0].config.styles += SQUARE_RIGHT_STYLE;
      selector.config.styles += SQUARE_LEFT_STYLE;
      this.renderRow('sources', [...browse, selector], 'two', helpers, hass);
      this.renderRow('transport', transport, 'seven', helpers, hass);
    }

    // The player sheet is a sheet over this card (backdrop, header and one
    // row per player). It is deliberately not a Bubble pop-up: those open and
    // close through the browser's address hash and history, which blanked the
    // page on wall displays when they closed.
    // It lists This Device (entity_id), the priority player and every Music
    // Assistant player. A row's main button shows that player; the button
    // beside it moves the shown player's queue there. Both halves sit on one
    // pill so each entry reads as a single item.
    async openPlayerPopup() {
      const root = this.shadowRoot;
      const helpers = await window.loadCardHelpers();
      const local = this.localPlayer();
      const bus = this.busPlayer();
      const states = this._hass?.states || {};
      const usable = id => id === this.player ||
        !['unavailable', 'unknown'].includes(states[id]?.state);
      const rows = [];
      const add = (id, label, icon, selected, choose) => {
        if (!states[id] || !usable(id)) return;
        // A player that is playing gets a music-note icon after its name.
        const isPlaying = ACTIVE_STATES.includes(states[id].state);
        const row = {selected, select: this.button(label, icon, () => {
          this.closePlayerPopup();
          choose();
        }, selected, {show_name: true})};
        row.select.config.styles += MERGED_STYLE + (isPlaying ? PLAYING_STYLE : '');
        if (id !== this.player && this.player) {
          row.select.config.styles += ICON_LEFT_STYLE;
          row.move = this.button('Move queue', 'mdi:transfer', () => {
            this.closePlayerPopup();
            void this.moveQueue(id);
          }, false, {show_name: true});
          row.move.config.styles += MERGED_STYLE;
        }
        rows.push(row);
      };
      if (local) {
        add(local, `This Device · ${this.playerName(local)}`, 'mdi:speaker',
          this.mode === 'device', () => this.command('mode', {value: 'device'}));
      }
      if (bus) {
        add(bus, this.priorityLabel(), 'mdi:speaker-multiple', this.mode === 'bus',
          () => this.command('mode', {value: 'bus'}));
      }
      for (const p of this.musicAssistantPlayers()) {
        const id = p.entity_id;
        if (id === local) continue;
        add(id, this.playerName(id), 'mdi:speaker',
          this.mode === 'other' && this.otherPlayer === id,
          () => this.command('mode', {value: 'other', entity: id}));
      }
      root.getElementById('sheet-title-text').textContent = 'Players';
      this.sheetKind = 'select';
      this.queueToken++;
      this.dropSheetCards();
      const list = root.getElementById('sheet-options');
      // A long player list scrolls inside the sheet.
      list.style.maxHeight = '60vh';
      list.style.overflowY = 'auto';
      if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'message';
        empty.textContent = 'No players are available.';
        list.replaceChildren(empty);
      } else {
        let n = 0;
        const cellFor = ({config, onTap}) => {
          const card = helpers.createCardElement(config);
          card.hass = this._hass;
          this.cards[`sheet-${n++}`] = card;
          const cell = document.createElement('div');
          cell.className = 'tap';
          this.bindTap(cell, onTap);
          cell.append(card);
          return cell;
        };
        list.replaceChildren(...rows.map(option => {
          const row = document.createElement('div');
          // One fixed-height pill behind both halves (accent when it is the
          // shown player).
          row.style.cssText = `display:flex;align-items:stretch;overflow:hidden;flex:0 0 auto;` +
            `height:${SHEET_ROW_PX}px;border-radius:${SHEET_ROW_PX / 2}px;background:` +
            (option.selected ? 'var(--ktm-accent, var(--accent-color))' : 'var(--ktm-surface)') + ';';
          const select = cellFor(option.select);
          select.style.flex = '1 1 0';
          select.style.minWidth = '0';
          row.append(select);
          if (option.move) {
            const move = cellFor(option.move);
            move.style.flex = '0 0 38%';
            move.style.borderLeft = '1px solid rgba(127, 127, 127, 0.25)';
            row.append(move);
          }
          return row;
        }));
      }
      this.sheetOpenedAt = Date.now();
      root.getElementById('sheet').hidden = false;
    }

    // ---------------------------------------------------------------------
    // QUEUE
    // ---------------------------------------------------------------------

    // Music Assistant server address and API token from the card config, or
    // null when either is missing (the full queue view is then unavailable).
    maServer() {
      const url = String(this.config?.ma_url || '').trim().replace(/\/+$/, '');
      const token = String(this.config?.ma_token || '').trim();
      return url && token ? {url, token} : null;
    }

    // Calls a Music Assistant server command over its HTTP API.
    async maApi(command, args = {}) {
      const server = this.maServer();
      if (!server) throw new Error('Music Assistant server is not configured');
      const response = await fetch(`${server.url}/api`, {
        method: 'POST',
        headers: {'Authorization': `Bearer ${server.token}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({command, args})
      });
      if (!response.ok) throw new Error(`Music Assistant answered ${response.status}`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    // A picture address for a queue item. The server reports an image as a
    // plain address or as {path, provider, remotely_accessible}; one that
    // cannot be fetched directly goes through the server's image proxy.
    queueImage(item) {
      const media = item?.media_item || {};
      const image = item?.image || media.image || media.metadata?.images?.[0] ||
        media.album?.image || media.album?.metadata?.images?.[0];
      if (!image) return '';
      if (typeof image === 'string') return image;
      const path = image.path;
      if (!path) return '';
      if (image.remotely_accessible && /^https?:\/\//.test(path)) return path;
      const server = this.maServer();
      if (!server) return '';
      return `${server.url}/imageproxy?path=${encodeURIComponent(path)}` +
        `&provider=${encodeURIComponent(image.provider || '')}&size=96`;
    }

    notify(message) {
      this.dispatchEvent(new CustomEvent('hass-notification', {
        bubbles: true, composed: true, detail: {message}
      }));
    }

    // Opens the sheet with the selected player's queue.
    async openQueue() {
      const root = this.shadowRoot;
      root.getElementById('sheet-title-text').textContent = 'Queue';
      this.sheetKind = 'queue';
      this.dropSheetCards();
      const list = root.getElementById('sheet-options');
      list.style.maxHeight = '60vh';
      list.style.overflowY = 'auto';
      list.innerHTML = '<div class="message">Loading…</div>';
      this.sheetOpenedAt = Date.now();
      root.getElementById('sheet').hidden = false;
      await this.loadQueue();
    }

    // Reads the queue and draws it into the open sheet: the whole list from
    // the Music Assistant server when it is configured and reachable,
    // otherwise what music_assistant.get_queue gives (the current and next
    // item and the count).
    async loadQueue() {
      const token = ++this.queueToken;
      const player = this.player;
      const list = this.shadowRoot.getElementById('sheet-options');
      const stale = () => token !== this.queueToken || this.sheetKind !== 'queue';
      const queueId = this._hass?.states[player]?.attributes?.active_queue;

      let full = null;
      let problem = '';
      if (this.maServer() && queueId) {
        try {
          // Start the list at the song that is playing; earlier ones are not
          // shown.
          const queue = await this.maApi('player_queues/get', {queue_id: queueId}) || {};
          const offset = Math.max(Number.isInteger(queue.current_index) ? queue.current_index : 0, 0);
          const items = await this.maApi('player_queues/items',
            {queue_id: queueId, limit: QUEUE_LIMIT, offset});
          full = {queue, offset, items: Array.isArray(items) ? items : []};
        } catch (error) {
          console.warn('[Touch Media Card] Could not read the queue from the Music Assistant server.', error);
          problem = `Could not reach the Music Assistant server (${error?.message || 'network error'}).`;
        }
        if (stale()) return;
      }

      let basic = null;
      if (!full) {
        try {
          const result = await this._hass.callWS({
            type: 'call_service',
            domain: 'music_assistant',
            service: 'get_queue',
            target: {entity_id: player},
            return_response: true
          });
          basic = result?.response?.[player] || null;
        } catch (error) {
          if (stale()) return;
          console.warn('[Touch Media Card] Could not read the queue.', error);
          list.innerHTML = `<div class="message">Could not read the queue. ${escapeHtml(error?.message || '')}</div>`;
          return;
        }
      }
      const helpers = await window.loadCardHelpers();
      if (stale()) return;
      this.dropSheetCards();

      const warning = problem ? `<div class="queue-info">${escapeHtml(problem)}</div>` : '';
      let html;
      if (full) html = this.fullQueueHtml(full.queue, full.items, full.offset);
      else html = warning + this.basicQueueHtml(basic);
      list.innerHTML = html;
      if (full && !full.items.length) return;
      if (!full && !(Number(basic?.items) > 0)) return;

      const clear = this.button('Clear queue', 'mdi:playlist-remove', () => {
        this.closePlayerPopup();
        this._hass.callService('media_player', 'clear_playlist', {entity_id: player}).catch(error =>
          console.warn('[Touch Media Card] media_player.clear_playlist failed.', error));
      }, false, {show_name: true});
      const card = helpers.createCardElement(clear.config);
      card.hass = this._hass;
      this.cards['sheet-0'] = card;
      const cell = document.createElement('div');
      cell.className = 'tap';
      this.bindTap(cell, clear.onTap);
      cell.append(card);
      list.append(cell);
    }

    // The queue from the playing song onwards (`offset` is that song's place
    // in the whole queue), with art, and play / move up / move down / remove
    // on each row.
    fullQueueHtml(queue, items, offset) {
      if (!items.length) return '<div class="message">The queue is empty.</div>';
      const current = Number.isInteger(queue?.current_index) ? queue.current_index : -1;
      const total = Number(queue?.items) || (offset + items.length);
      const left = Math.max(total - offset, items.length);
      const info = [`${left} ${left === 1 ? 'song' : 'songs'} left`,
        `Shuffle ${queue?.shuffle_enabled ? 'on' : 'off'}`,
        `Repeat ${queue?.repeat_mode || 'off'}`].join(' · ');
      const rows = items.map((item, i) => {
        const index = offset + i;
        const media = item.media_item || {};
        const artists = (media.artists || []).map(artist => artist.name).join(', ');
        const sub = artists || item.stream_title || '';
        const id = escapeHtml(item.queue_item_id);
        const image = this.queueImage(item);
        // Only items after the one playing can be moved; the first of them
        // cannot go any higher.
        const movable = index > current;
        return `
          <div class="queue-row ${index === current ? 'current' : ''}">
            <span class="queue-pos">${index === current
              ? '<ha-icon icon="mdi:play" style="--mdc-icon-size:20px"></ha-icon>' : i}</span>
            <span class="thumb">${image
              ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`
              : '<ha-icon icon="mdi:music"></ha-icon>'}</span>
            <button type="button" class="queue-main" data-act="play" data-index="${index}">
              <span class="item-name">${escapeHtml(item.name || media.name || '')}</span>
              ${sub ? `<span class="item-sub">${escapeHtml(sub)}</span>` : ''}
            </button>
            <span class="queue-actions">
              <button type="button" data-act="up" data-id="${id}" data-index="${index}"
                aria-label="Move up" ${movable && index > current + 1 ? '' : 'disabled'}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
              <button type="button" data-act="down" data-id="${id}" data-index="${index}"
                aria-label="Move down" ${movable && i < items.length - 1 ? '' : 'disabled'}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
              <button type="button" data-act="remove" data-id="${id}" data-index="${index}"
                aria-label="Remove"><ha-icon icon="mdi:close"></ha-icon></button>
            </span>
          </div>`;
      }).join('');
      const more = left > items.length
        ? `<div class="queue-info">…and ${left - items.length} more</div>` : '';
      return `<div class="queue-info">${escapeHtml(info)}</div>${rows}${more}`;
    }

    // What Home Assistant gives: the current and next item and the count.
    basicQueueHtml(queue) {
      const count = Number(queue?.items) || 0;
      if (!queue || !count) return '<div class="message">The queue is empty.</div>';
      const row = (item, label, current) => {
        if (!item) return '';
        const media = item.media_item || {};
        const artists = (media.artists || []).map(artist => artist.name).join(', ');
        const sub = artists || item.stream_title || '';
        const image = media.image || media.album?.image || '';
        return `
          <div class="queue-item ${current ? 'current' : ''}">
            <span class="thumb">${image
              ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`
              : '<ha-icon icon="mdi:music"></ha-icon>'}</span>
            <span class="item-copy">
              <span class="queue-label">${label}</span>
              <span class="item-name">${escapeHtml(item.name || media.name || '')}</span>
              ${sub ? `<span class="item-sub">${escapeHtml(sub)}</span>` : ''}
            </span>
          </div>`;
      };
      const info = [`${count} ${count === 1 ? 'item' : 'items'} in queue`,
        `Shuffle ${queue.shuffle_enabled ? 'on' : 'off'}`,
        `Repeat ${queue.repeat_mode || 'off'}`].join(' · ');
      return `
        <div class="queue-info">${escapeHtml(info)}</div>
        ${row(queue.current_item, 'Now playing', true)}
        ${row(queue.next_item, 'Up next', false)}
        ${count > 2 ? `<div class="queue-info">…and ${count - 2} more</div>` : ''}`;
    }

    // A tap on a row of the full queue: play it, move it, or take it out.
    // Picking a song closes the sheet and spins the track info until the
    // song changes.
    async queueAction(act, id, index) {
      const queueId = this._hass?.states[this.player]?.attributes?.active_queue;
      if (!queueId) return;
      if (act === 'play') {
        this.closePlayerPopup();
        this.startTrackWait();
        try {
          await this.maApi('player_queues/play_index', {queue_id: queueId, index});
        } catch (error) {
          console.warn('[Touch Media Card] Could not play that song.', error);
          this.endTrackWait();
          this.notify(`Could not play that song (${error?.message || 'error'})`);
        }
        return;
      }
      try {
        if (act === 'remove') {
          await this.maApi('player_queues/delete_item', {queue_id: queueId, item_id_or_index: id});
        } else if (act === 'up' || act === 'down') {
          await this.maApi('player_queues/move_item',
            {queue_id: queueId, queue_item_id: id, pos_shift: act === 'up' ? -1 : 1});
        }
      } catch (error) {
        console.warn('[Touch Media Card] Queue change failed.', error);
        this.notify(`Could not change the queue (${error?.message || 'error'})`);
      }
      if (this.sheetKind === 'queue') await this.loadQueue();
    }

    dropSheetCards() {
      Object.keys(this.cards).filter(key => key.startsWith('sheet-'))
        .forEach(key => delete this.cards[key]);
    }

    closePlayerPopup() {
      const sheet = this.shadowRoot.getElementById('sheet');
      if (sheet) sheet.hidden = true;
      this.sheetKind = null;
      this.queueToken++;
      this.dropSheetCards();
    }

    // Moves the queue of the shown player to `target` with Music Assistant's
    // transfer_queue. Playback carries on at the target only if the source
    // was playing. The card then switches to show the target player.
    async moveQueue(target) {
      const hass = this._hass;
      const source = this.player;
      const sourceState = hass?.states[source];
      if (!sourceState || !target || target === source) return;
      const name = target === this.busPlayer() ? this.priorityLabel() : this.playerName(target);
      try {
        await hass.callService('music_assistant', 'transfer_queue', {
          source_player: source,
          auto_play: ACTIVE_STATES.includes(sourceState.state)
        }, {entity_id: target});
        this.notify(`Queue moved to ${name}`);
        // Follow the queue: show the player it was moved to.
        if (target === this.busPlayer()) this.command('mode', {value: 'bus'});
        else if (target === this.localPlayer()) this.command('mode', {value: 'device'});
        else this.command('mode', {value: 'other', entity: target});
      } catch (error) {
        console.warn('[Touch Media Card] Could not move the queue.', error);
        this.notify(`Could not move the queue to ${name}`);
      }
    }

    // Pointer events, in the capture phase, so a tap registers even if the
    // Bubble widget cancels touch or click events. A press that moves more
    // than a few pixels is treated as a scroll and ignored.
    bindTap(cell, onTap) {
      let start = null;
      cell.addEventListener('pointerdown', event => {
        start = {id: event.pointerId, x: event.clientX, y: event.clientY};
      }, true);
      cell.addEventListener('pointerup', event => {
        const press = start;
        start = null;
        if (!press || press.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) return;
        event.stopPropagation();
        onTap();
      }, true);
      cell.addEventListener('pointercancel', () => { start = null; }, true);
      cell.addEventListener('click', event => event.stopPropagation(), true);
    }

    // ---------------------------------------------------------------------
    // ACTIONS FROM BUBBLE BUTTONS
    // ---------------------------------------------------------------------

    command(name, detail = {}) {
      const hass = this._hass;
      const stateObj = hass?.states[this.player];
      const a = stateObj?.attributes || {};
      const call = (service, data = {}) => hass.callService('media_player', service,
        {entity_id: this.player, ...data}).catch(error =>
        console.warn(`[Touch Media Card] media_player.${service} failed.`, error));
      switch (name) {
        case 'media_previous_track':
        case 'media_play_pause':
        case 'media_next_track':
        case 'media_stop':
          if (stateObj) call(name);
          break;
        case 'stop':
          // Stop also empties the queue of the selected player (for Whole Bus,
          // the group's shared queue).
          if (stateObj) call('media_stop').then(() => call('clear_playlist'));
          break;
        case 'mode':
          if (detail.value === 'device' && !this.localPlayer()) return;
          if (detail.value === 'other') {
            if (!detail.entity) return;
            this.otherPlayer = detail.entity;
          }
          this.mode = detail.value;
          this.sync(true);
          break;
        case 'shuffle':
          if (stateObj) call('shuffle_set', {shuffle: !a.shuffle});
          break;
        case 'repeat':
          if (stateObj) call('repeat_set', {repeat: REPEAT_NEXT[a.repeat || 'off'] || 'off'});
          break;
        case 'browse':
          this.openBrowser(detail.tab);
          break;
      }
    }

    // ---------------------------------------------------------------------
    // MUSIC ASSISTANT BROWSER
    // ---------------------------------------------------------------------

    async maEntryId() {
      if (this.configEntryId) return this.configEntryId;
      try {
        const entries = await this._hass.callWS({type: 'config_entries/get', domain: 'music_assistant'});
        const loaded = entries.find(entry => entry.state === 'loaded') || entries[0];
        if (loaded?.entry_id) this.configEntryId = loaded.entry_id;
      } catch (error) {
        // Non-admin users cannot list config entries; use the card option.
      }
      this.configEntryId = this.configEntryId || this.config.config_entry_id || null;
      return this.configEntryId;
    }

    async maService(service, data) {
      const entryId = await this.maEntryId();
      if (!entryId) throw new Error('Music Assistant is not set up');
      const result = await this._hass.callWS({
        type: 'call_service',
        domain: 'music_assistant',
        service,
        service_data: {config_entry_id: entryId, ...data},
        return_response: true
      });
      return result?.response || {};
    }

    openBrowser(tab) {
      const root = this.shadowRoot;
      this.browseTab = tab;
      root.getElementById('browser').hidden = false;
      root.querySelectorAll('#tabs button').forEach(button =>
        button.classList.toggle('active', button.dataset.tab === tab));
      const isSearch = tab === 'search';
      root.getElementById('search').hidden = !isSearch;
      root.getElementById('chips').hidden = !isSearch;
      this.updateChips();
      if (isSearch) {
        const query = root.getElementById('query');
        if (query.value.trim()) void this.loadBrowse();
        else {
          root.getElementById('results').innerHTML =
            '<div class="message">Type something to search Music Assistant.</div>';
          query.focus();
        }
      } else {
        void this.loadBrowse();
      }
    }

    closeBrowser() {
      this.browseTab = null;
      this.browseToken++;
      this.shadowRoot.getElementById('browser').hidden = true;
    }

    updateChips() {
      this.shadowRoot.querySelectorAll('#chips button').forEach(button =>
        button.classList.toggle('active', button.dataset.type === this.searchType));
    }

    async loadBrowse() {
      const root = this.shadowRoot;
      const results = root.getElementById('results');
      const token = ++this.browseToken;
      const tab = this.browseTab;
      results.innerHTML = '<div class="message">Loading…</div>';
      try {
        let items = [];
        if (tab === 'search') {
          const name = root.getElementById('query').value.trim();
          if (!name) {
            results.innerHTML = '<div class="message">Type something to search Music Assistant.</div>';
            return;
          }
          const type = SEARCH_TYPES.find(t => t.id === this.searchType) || SEARCH_TYPES[0];
          const response = await this.maService('search', {name, media_type: [type.id], limit: 40});
          items = response[type.key] || [];
        } else if (tab === 'favorite') {
          const response = await this.maService('get_library',
            {media_type: 'track', favorite: true, limit: 100, order_by: 'name'});
          items = response.items || [];
        } else {
          const response = await this.maService('get_library',
            {media_type: tab, limit: 100, order_by: 'name'});
          items = response.items || [];
        }
        if (token !== this.browseToken) return;
        results.innerHTML = items.length
          ? items.map(item => this.itemHtml(item)).join('')
          : '<div class="message">Nothing found.</div>';
      } catch (error) {
        if (token !== this.browseToken) return;
        results.innerHTML = `<div class="message">Music Assistant could not be reached. ${escapeHtml(error?.message || '')}</div>`;
        console.warn('[Touch Media Card] Music Assistant browse failed.', error);
      }
    }

    itemHtml(item) {
      const artists = (item.artists || []).map(artist => artist.name).join(', ');
      const subtitle = artists || ({radio: 'Radio station', playlist: 'Playlist', artist: 'Artist',
        album: 'Album', track: 'Song'})[item.media_type] || '';
      const image = item.image || item.album?.image || '';
      const uri = escapeHtml(item.uri);
      const type = escapeHtml(item.media_type);
      const queueable = item.media_type !== 'radio';
      return `
        <div class="item">
          <button type="button" class="item-main" data-uri="${uri}" data-type="${type}" data-enqueue="play">
            <span class="thumb">${image
              ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`
              : '<ha-icon icon="mdi:music"></ha-icon>'}</span>
            <span class="item-copy">
              <span class="item-name">${escapeHtml(item.name)}</span>
              <span class="item-sub">${escapeHtml(subtitle)}</span>
            </span>
            <ha-icon class="play" icon="mdi:play-circle"></ha-icon>
          </button>
          ${queueable ? `<button type="button" class="queue" data-uri="${uri}" data-type="${type}"
            data-enqueue="add" aria-label="Add to queue"><ha-icon icon="mdi:playlist-plus"></ha-icon></button>` : ''}
        </div>`;
    }

    async playItem(uri, mediaType, enqueue) {
      if (!this.player || !this._hass?.states[this.player]) return;
      // Single songs play now and keep the queue; collections and radio
      // replace it so the choice starts straight away.
      const mode = enqueue === 'add' ? 'add' : (mediaType === 'track' ? 'play' : 'replace');
      try {
        await this._hass.callService('music_assistant', 'play_media', {
          media_id: uri, media_type: mediaType, enqueue: mode
        }, {entity_id: this.player});
        if (mode !== 'add') this.closeBrowser();
      } catch (error) {
        console.warn('[Touch Media Card] Could not play media.', error);
      }
    }
  }

  if (!customElements.get('touch-media-card')) {
    console.info(`%c TOUCH-MEDIA-CARD %c v${VERSION} `, 'background:#03a9f4;color:#fff', '');
    customElements.define('touch-media-card', TouchMediaCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: 'touch-media-card',
      name: 'Touch Media Card',
      description: 'Touch-first Bubble Card media player with Music Assistant browsing.'
    });
  }
})();
