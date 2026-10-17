# Dataset

Every game played, kept so the game and the GM prompts can be improved over time.

- `games/`: one file per game, named `day-title-gameid[-label].json`. The server writes it when a game
  reaches its reveal, and when the host starts a new game or ends one early, so unfinished games are kept too.
  `before-rework` and `before-fix-cards` files are the same game before those fixes were applied.
  Each file is the full saved game: setup, the world and its truth, every chat with the GM,
  questions asked out loud, votes, moments, the knowledge record and the scores.
  Join tokens are removed, so a file cannot be used to take over a game.
- `worlds/`: worlds the GM wrote during testing, with no players.

To add games saved before this folder existed, run `npm run dataset`. Then commit and push.

These files hold players' names and everything they typed. Keep the repo private.
