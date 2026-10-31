# Roulette (quán rượu)

Two-player tension game in the same stack and look as Mèo Nổ: plain HTML/CSS/JS, flat **2D polygon** art drawn entirely in code
(`js/rou-art.js`), optional Firebase Realtime Database for online rooms, static hosting (GitHub Pages). Vietnamese by default, English via the picker.
Open `index.html` through any static server.

## Rules
- Two players share **one cylinder** (4–8 shells, a random mix of **live** and **blank**, order hidden). The live/blank counts are always shown on the board.
- Your turn: **shoot the opponent** (live = −1 HP, turn ends) or **shoot yourself** (blank = shoot again, live = −1 HP and turn ends).
- **Items lie on a shared table**: whoever's turn it is may use any of them (default 2 per turn, setting 1–3). Empty cylinder = reload + 2–3 new items (table holds 8).
- 2–4 HP each per round (random). 0 HP loses the round; the loser opens the next one. First to N round wins takes the match (setting 1–3, default 2).

| Item | Effect |
|---|---|
| Kính lúp / Loupe | privately see the shell in the firing chamber |
| Điện thoại / Phone | privately see a random later chamber |
| Ly bia / Beer | eject the firing-chamber shell (everyone sees it) |
| Chanh đá / Lemon soda | +1 HP |
| Chuông đóng cửa / Last-call bell | opponent loses their next turn |
| Xoay ổ / Spin | reshuffle the remaining shells, everybody's peeks are forgotten |
| Đồng xu / Coin | flip the firing-chamber shell; the public counter is **not** updated (a bluff tool) |
| Ly whisky / Whisky | next shot deals 2 if live |
| Khay gỗ / Wooden tray | blocks one live shell |

## Modes
- **Play vs bot** (Barkeep, easy / normal / hard) — offline, restored after a refresh (`rou_local_room`).
- **Online room** — 2 players, 5-letter code (click it to copy an invite link), room at `rooms/roulette_<CODE>` in the same Firebase project (existing `rooms/$roomId` rules apply).
  The state is one JSON string (`room.gs`) so Firebase can't drop empty arrays. Like Mèo Nổ, hidden info is in the room: fine for friends, not for stakes.
- Keys: `1` shoot opponent, `2` shoot yourself, `Esc` clear selection, double-click an item = use it.

## Files
- `js/rou-engine.js` — pure rules + bot (seeded RNG inside the state). Test: `node tests/engine.test.js` (600 bot-vs-bot games + rule checks).
- `js/rou-net.js` — Firebase transactions or local room. `js/rou-ui.js` — screens, drum, animations (state queue → events play over the old view), bot driver.
- `js/rou-art.js` — bar scene, item icons, avatars, drum. `js/rou-sound.js` — WebAudio synth (+ optional files, see `sounds/README.txt`). `js/i18n.js` — vi/en.
- Add an item: kind in `ITEMS`/`WEIGHT` + `canUse` + `useItem` (engine), icon in `ICON` (art), texts in `items` (i18n), sound in `playItem` (ui).

## v2 additions
- Background is blurred + dimmed with a spotlight (static layer, no per-frame filter cost); brush font (Sedgwick Ave Display, falls back to Baloo 2 for Vietnamese glyphs) with a rough-edge SVG filter on big words.
- `js/rou-fx.js`: one canvas particle system (blood drops, splats, drips, smoke, sparks, heal, confetti) — flat polygons, 90-particle cap, loop only runs while alive, off with reduced-motion.
- Emotes: the bartender faces (smug / laugh / scared / angry / hurt) react to events and can be sent from the face button next to your panel (synced online at `rooms/roulette_<CODE>/emote`; the bot answers back).
- BGM: generated low A-minor drone + bass + wall-clock ticks (`rou-sound.js`), tempo / filter / heartbeat rise with tension (low HP, last live shell). 🎵 toggles it, 🔊 toggles SFX.
