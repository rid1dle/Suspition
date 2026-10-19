## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Design context

Before any UI work, read `docs/ui-rules.md` (the game's UI rules and the creator's verdict ledger), `PRODUCT.md` (who plays, the feel, anti-references) and `DESIGN.md` (tokens). They sit on top of the impeccable skill at `~/.claude/plugins/marketplaces/impeccable/.claude/skills/impeccable/`. The biggest rule: show only the choices that can change this group's game.
