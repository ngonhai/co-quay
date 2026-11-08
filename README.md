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
| Còng tay / Handcuffs | opponent loses their next turn |
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

## v3: 3D (first person)
- `js/rou-3d.js` (ES module, Three.js vendored in `js/lib/`, MIT) draws the bar, the table, both bartenders (low-poly, faces are the same SVG art as a texture, so emotes/expressions carry over), the revolver and the 9 items as real 3D objects. Needs a static server (module + importmap), not `file://`.
- You only see **your own hands** (2-bone IK arms). Click an item on the table to select it (info panel), click it again — or press *Use* — and your hand picks it up and uses it (drink, ring the bell, flip the coin, hold the loupe/phone up…).
  Click the revolver to arm it: click the opponent to shoot them, click the revolver again to shoot yourself (the two buttons still work). The shooter's hand takes the gun, aims, a few beats of suspense (dolly-in, flicker, letterbox bars), then fire / click, recoil, hit reaction, gun back on the table. The opponent plays the same animations with their own arms.
- **Spectators**: anyone who joins a room code after the two seats are taken (or after the game started) stands beside the table: camera buttons *Beside table / <player> view* switch between a side view and each player's first-person view (including that player's private peeks). They can't act. Stored at `rooms/roulette_<CODE>/specs/<uid>`.
- `3D/2D` header button switches back to the old 2D table (also used automatically when WebGL isn't available). Quality is capped (pixel ratio ≤ 1.5, one shadow-casting light).

## v4
- Shot reveal updates everything at once: hearts shatter and vanish, shield badge/tray, live/blank counter.
- 3D: wide drooping hat brim + shadow across the face, shorter neck, wider shoulders, bigger arms/hands; faint pale-yellow hover glow on table items; blood sprays onto the table and fades; a 3D "N LIVE / N BLANK" sign next to the revolver (HUD counter hidden in 3D).
- Handcuffs replace the bell: slid to the opponent's table edge and locked there until their turn is skipped.
- Quieter BGM thump.

---

## v6 — brought up to the level of Sus Tavern

**Look (3D):** the whole table is now painted: toon shading with a brush-streak texture and an ink outline on everything (room, table, props, gun). Players are the same 8 animals as in Sus Tavern (pig, fox, dog, goat, octopus, penguin, hawk, turtle), each wearing a bartender's hat in the seat colour, with jointed arms and five-finger hands, expressions drawn as wobbly SVG faces. The gun always lies on its side in the middle of the table: whoever shoots reaches over, picks it up from there and puts it back there afterwards (it never moves by itself). The hand wraps the grip, the muzzle goes to your own head (shoot yourself) or points across the table (shoot opponent). A live hit snaps the target's head back; the loser of a round falls off the chair. Move the mouse to the bottom of the screen to look down at your side of the table. The wall carries a random tavern sign (per room, in the room creator's language). Jazz background music (tension still nudges the tempo).

**Items in hand (3D):** every item has its own, human-looking handling: the hand comes in over it in an arc, the wrist turns (thumb up round a glass, palm down on a coin), the fingers close, the player leans over and looks at it. Loupe: the lens goes over the cylinder. Phone: handset to the ear, head tilted. Beer: a long pull, glass slammed down, the spent shell pops out of the gun and clatters on the table. Whisky: one gulp. Lemon: bitten, sour face. Handcuffs: held up and jingled, then flicked across the table. Spin: a little top is flicked next to the gun and the cylinder spins with it. Coin: tossed and caught. Tray: stood up in front of you. The text of an item (what you saw, what was ejected...) appears at the moment of the deed.

**Functions:**
- **Characters:** pick your animal in the offline form and in the waiting room (two players never share one); bots get a free animal and a random name from a list.
- **Bot table talk** (rule "Bot table talk", on by default): while you decide, the bot says whether the firing-chamber shell is live or blank. It only uses what it really knows (its own peek / the public counts) and may lie to steer you (Easy: random, Normal: lies most of the time when it knows, Hard: mixes truth and lies so it is unreadable). 2D: bubble over the avatar. 3D: a board over the head. The bot also shows up in the log.
- **Sealed online rooms:** the room carries only the public state (no shell kinds, no seed, no peeks); each player receives only their own peeks; the host's browser is the referee. Needs Firebase anonymous sign-in + the `secure` block of `database.rules.json`; without them rooms are open as before. *With two players the referee is one of them: the host's browser can still see the cylinder. Sealing protects the guest and spectators.*
- **Room link:** `<page>?room=CODE` is kept in the address bar while you are in a room (an old `#CODE` still works); refreshing on it puts you back; a stranger who opens it of a running game joins as a spectator.
- **24 h expiry:** a room nobody wrote to for 24 h is gone (its data is deleted when someone touches the code, and the code can be handed out again).
- **Table chat** with suggestions (Tab) in online rooms; seated players' lines also appear over their head. Path `roomChats/roulette_<CODE>` (open in the rules file).
- **Host can add/remove a bot** on the free seat of an online room (spectators can watch the match).
- **Gestures (3D):** double-click the table to slam it, click the opponent (when the gun is not armed) to point; both are synced to the other player.
- "Leave table?" confirmation, rule rows with icons, text selection only in log/chat/inputs, log scroll stays put.

**Tests** (`node tests/engine.test.js`, `rooms`, `sealed`, `chat`): rules + secrecy + bot honesty, room lifecycle, sealed rooms against the real `database.rules.json` (in-memory Firebase, `tests/fakefb.js`), chat.

**Publishing:** copy the `secure`/`roomChats` parts of `database.rules.json` into your Realtime Database rules (merge with your other games' nodes) and enable Authentication > Anonymous.
