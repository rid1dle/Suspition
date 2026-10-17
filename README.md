# Detective

A hidden-role mystery game for friends in one room. Every phone is a private character card,
a shared screen shows what everyone knows, and Claude (running headless on the host's laptop)
is the game master: it writes a fresh world for each group, keeps the truth, answers private
questions, and judges the final reconstruction.

Design notes: [docs/design.md](docs/design.md).

## Run a game

Needs Node 20+ and Claude Code signed in on the host laptop (`claude` on the PATH). No API key.

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

## Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4321` | Port to serve on |
| `DETECTIVE_HOST` | Wi-Fi address | Address printed in the join link and QR code |
| `DETECTIVE_SETUP_MODEL` | Claude Code default | Model that writes the world and the reveal |
| `DETECTIVE_SETUP_EFFORT` | `medium` | Effort for writing the world (`high` is richer and slower) |
| `DETECTIVE_PLAY_MODEL` | Claude Code default | Model that answers questions during play |
| `NO_OPEN` | | Set to `1` to stop the table screen opening on start |
| `DETECTIVE_DATA_DIR` | `game-data/` | Where the current game is saved |

The current game is saved in `game-data/current-game.json`; restarting the server resumes it.
Do not open that file mid-game: it holds the truth.

To end a game early, press **End game** on the table screen (tap twice). If the table link is lost,
`npm run fresh` starts the server with a new, empty lobby.

## Development

```bash
npm test                                   # unit and HTTP tests, with a fake GM
node scripts/try-generate.js out.json      # write one real world with Claude
node scripts/try-ask.js out.json           # ask the real GM one question about it
```
