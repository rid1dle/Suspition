# Detective

A hidden-role mystery game for friends in one room. Every phone is a private character card,
a shared screen shows what everyone knows, and Claude (running headless on the host's laptop)
is the game master: it writes a fresh world for each group, keeps the truth, answers private
questions, and judges the final reconstruction.

Design notes: [docs/design.md](docs/design.md).

## Run a game

Needs Node 20+ and Claude Code signed in on the host laptop (`claude` on the PATH). No API key:
the GM always uses your Claude login and ignores any `ANTHROPIC_API_KEY` in your shell.

```bash
npm install
npm start
```

The table screen opens in the browser. Put it on a TV or leave it on the laptop. Players scan
the QR code (same Wi-Fi) and join from their phones. The host can play too: no screen shows
spoilers, and the terminal only prints the two links.

If macOS asks whether `node` may accept incoming connections, allow it, or phones cannot join.

### How a game goes

1. **Lobby**: players join; the host picks the setting, tone, length and number of global hints.
2. **The GM writes the world** (about 3 to 5 minutes).
3. **Reading**: everyone reads their card. Public, private, and the facts unknown even to you.
4. **Phases**: talk freely. On your phone you can ask the GM privately, investigate yourself, or
   take a secret action, a few times per phase. Any player can propose spending a global hint;
   the group votes. When the timer runs out (or the host moves on) the world changes.
5. **Final reconstruction**: everyone names the culprit(s), how and why. Culprits too.
6. **Reveal**: the majority verdict decides who wins; the table shows the story, every card and
   everyone's score.

### On the table screen

- **Who is where**: a map of every place and who is in it. Phones have it too (People tab).
- **People**: everything public about each person, growing as things come out: what they said out loud,
  clues that name them, answers given out loud, and where they say they were.
  Press **Edit map** to drag places around and type where each place is in your real room
  ("Lobby = big sofa"). Every phone shows those spots.
- **Music**: press Music for a soundtrack made for this mystery. It gets tenser each round.
- **Voice**: press Voice and the table reads the story, news, hints and the ending out loud.
  Private phone text is never read out. The music goes quiet while it speaks.

### Fix a game that is already running

Both commands ask the GM while the server keeps running, save a draft, and tell you to stop the server.
Run the same command again with the server stopped to put the draft in, then start the server.

- `npm run fix-cards`: makes every card say what that character did, saw and said, adds what drives them
  (wants, fears, reasons), key times with alibis, and a clear job for each round.
- `npm run rework -- --npcs 2`: before round 1 only. Re-centres the story on the players with that many
  background-only GM characters.

### Rewrite an old game in simple words

Stop the server, run `npm run simplify`, then start it again. It keeps every fact, name and
culprit, adds a map and music, and saves the old version next to it.

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4321` | Port to serve on |
| `DETECTIVE_HOST` | Wi-Fi address | Address printed in the join link and QR code |
| `DETECTIVE_SETUP_MODEL` | Claude Code default | Model that writes the world and the reveal |
| `DETECTIVE_SETUP_EFFORT` | `medium` | Effort for writing the world (`high` is richer and slower) |
| `DETECTIVE_PLAY_MODEL` | Claude Code default | Model that answers questions during play |
| `NO_OPEN` | | Set to `1` to stop the table screen opening on start |
| `DETECTIVE_USE_API_KEY` | | Set to `1` to let the GM use `ANTHROPIC_API_KEY` instead of your Claude login |
| `DETECTIVE_DATA_DIR` | `game-data/` | Where the current game is saved |
| `DETECTIVE_DATASET_DIR` | `dataset/` | Where finished and replaced games are kept for the dataset |

The current game is saved in `game-data/current-game.json`; restarting the server resumes it.
Every game is also kept in `dataset/games/` (without join tokens) when it ends or is replaced; see `dataset/README.md`.
Do not open that file mid-game: it holds the truth.

To end a game early, press **End game** on the table screen (tap twice). If the table link is lost,
`npm run fresh` starts the server with a new, empty lobby.

## Development

```bash
npm test                                   # unit and HTTP tests, with a fake GM
node scripts/try-generate.js out.json      # write one real world with Claude
node scripts/try-ask.js out.json           # ask the real GM one question about it
node scripts/try-knowledge.js out.json     # check GM characters only know what reached them
```
