# Touch Media Card

A touch-first media player card for Home Assistant, made for wall tablets and kiosks. It is built from [Bubble Card](https://github.com/Clooos/Bubble-Card) widgets and works with [Music Assistant](https://music-assistant.io/) players.

Author: Ryan Davies ([PrimusNZ](https://github.com/PrimusNZ))

## Features

- Large album art, song, artist and album, with play state.
- Track progress slider with elapsed and total time. Drag it to seek (when the player supports seeking).
- Volume slider. The icon at its left is the mute button.
- Shuffle, previous, play/pause, next, stop and repeat. Stop also clears the queue.
- Browse music: search, playlists, radio, albums, artists and favourites from Music Assistant.
- Queue sheet (tap the song info): play, reorder or remove items, or clear the queue.
- Player sheet: switch between this display's player, an optional priority player and other players, and move the queue between them.
- Optional auto-switch: when the priority player (for example a whole-home audio group) starts playing, the card shows it.

## Requirements

- Home Assistant with the [Music Assistant](https://www.home-assistant.io/integrations/music_assistant/) integration (browsing, queue moves and queue view need it; basic playback controls work with any media player).
- [Bubble Card](https://github.com/Clooos/Bubble-Card), installed and loaded as a dashboard resource. This card draws its buttons and volume slider with it.

## Installation

### HACS (custom repository)

1. In HACS, open the menu and choose **Custom repositories**.
2. Add this repository's URL with the type **Dashboard**.
3. Install **Touch Media Card**, then reload the browser.

### Manual

1. Copy `touch-media-card.js` to `/config/www/touch-media-card/`.
2. Add a dashboard resource: URL `/local/touch-media-card/touch-media-card.js?v=1.0.0`, type **JavaScript module**. Change the `?v=` value after each update so browsers fetch the new file.

## Configuration

```yaml
type: custom:touch-media-card
entity_id: media_player.kitchen_display
priority_player: media_player.whole_home_audio
priority_name: Whole Home
discover: true
```

| Option | Default | Description |
| --- | --- | --- |
| `entity_id` | none | This display's own player. Shown as **This Device** in the player sheet and selected when it starts playing. |
| `priority_player` | none | Optional. A player that takes over the card whenever it starts playing, such as a whole-home group. If it is not set, or the entity does not exist, there is no auto-switch to it. Switching to `entity_id` still works. |
| `priority_name` | the player's friendly name | The label for the priority player. |
| `discover` | `true` | `true` lists every Music Assistant player (recognised by their `mass_player_type` / `active_queue` attributes) and ignores `media_players`. `false` lists only `media_players`. |
| `media_players` | none | List of players to offer when `discover` is `false`. Required in that case: the card shows an error if it is empty. |
| `config_entry_id` | auto | Music Assistant config entry ID. The card finds it itself; this is only a fallback for non-admin users, who cannot list config entries. |
| `ma_url` | none | Music Assistant server address, for example `http://192.168.1.10:8095`. With `ma_token` it enables the full queue view. |
| `ma_token` | none | A Music Assistant API token. |
| `template` | none | Name(s) of button-card templates in this dashboard, used as the source of `variables` (see below). |
| `variables` | none | Variables for use in templates. They override those from `template`. |

If neither `entity_id` nor a usable `priority_player` is set, the card shows the first available player (preferring one that is playing) until you pick another.

### Templates

`entity_id`, `priority_player` and each `media_players` entry may be a button-card style template:

```yaml
type: custom:touch-media-card
template: my_dashboard_template
entity_id: '[[[ return variables.local_player ]]]'
priority_player: '[[[ return variables.whole_home_audio ]]]'
```

Inside `[[[ ]]]` you have `hass`, `states`, `user` and `variables`. A body without `return` is treated as a single expression. `variables` are merged from the button-card templates named in `template` (including the templates they use) and the card's own `variables`. This is how one dashboard can serve several displays: each display's template sets its own `local_player`. [Button-card](https://github.com/custom-cards/button-card) itself is not required, only its `button_card_templates` section of the dashboard config.

You can also skip templates and set variables on the card:

```yaml
type: custom:touch-media-card
variables:
  local_player: media_player.kitchen_display
entity_id: '[[[ return variables.local_player ]]]'
```

### Without discovery

```yaml
type: custom:touch-media-card
entity_id: media_player.kitchen_display
discover: false
media_players:
  - media_player.kitchen_display
  - media_player.office_speaker
  - media_player.living_room_tv
```

### Full queue view

Home Assistant only exposes the current and next track of a queue. With `ma_url` and `ma_token` the card calls the Music Assistant server directly to list the whole queue and to play, move or remove items.

```yaml
type: custom:touch-media-card
entity_id: media_player.kitchen_display
ma_url: https://music.example.com
ma_token: YOUR_TOKEN
```

- The token is stored in the dashboard configuration, so anyone who can open the dashboard can read it. Create a token just for this card.
- The request goes from the browser to the server, so the server must be reachable from the display and allow cross-origin requests (CORS) from your Home Assistant address. If it is behind a reverse proxy, add CORS headers for `/api` there.
- Without these two options, or when the server cannot be reached, the card falls back to the current and next item.

## Styling

The card uses your Home Assistant theme: `--ha-card-background` for surfaces, `--primary-color` for accents and `--primary-text-color` / `--secondary-text-color` for text. Override any of these on the card (for example with [card-mod](https://github.com/thomasloven/lovelace-card-mod)):

| Variable | Used for |
| --- | --- |
| `--kiosk-surface` | Buttons, track info and sheet backgrounds |
| `--kiosk-surface-edge` | Their box-shadow (default none) |
| `--kiosk-accent` | Active buttons, slider fills, highlights |
| `--kiosk-text-primary` / `--kiosk-text-secondary` | Text |
| `--kiosk-background` | Background of the browser and sheets |
| `--kiosk-viewport-content-height` | Card height (default 100% of its container, minimum 300px) |
| `--kiosk-border-radius-12px` | Corner radius (default 12px) |

The variable names come from the Kiosk dashboard this card was first built for.

The card fills its container's height, so place it where it has room, for example in a panel view or a full-height section. It stacks the artwork above the controls on portrait displays.

## Notes

- Taps are handled by the card, not by Bubble Card's own tap actions, so Bubble Card options such as `tap_action` do not apply.
- Tested on Home Assistant with Bubble Card and Music Assistant players, including a small touch display (about 800x400). Other setups may need tweaks.

## License

Copyright © 2026 Ryan Davies (PrimusNZ).

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later).

You are free to use, study, modify, and redistribute this project under the terms of the GNU GPL. Redistributed copies and derivative works must comply with the applicable GPL terms and must retain applicable copyright and license notices.

Ryan Davies (PrimusNZ) is the original author of this project. Contributors may identify and hold copyright in their own contributions, but redistribution must not remove or misrepresent the original project's applicable copyright and licensing notices.

See the [LICENSE](LICENSE) file for the complete GNU General Public License terms.
