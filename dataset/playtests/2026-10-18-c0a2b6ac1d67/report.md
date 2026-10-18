# Playtest 2026-10-18-c0a2b6ac1d67

World: The Dome Turned at Midnight. Winner: culprits.

## Players

- Himanshu (fair): moves 2, out loud 4, play 3, rating 0.83, flags {"claims":0,"sways_gm":0,"out_of_world":0}
- Nikhil (fair): moves 4, out loud 0, play 3, rating 1.5, flags {"claims":0,"sways_gm":0,"out_of_world":0}
- Rishabh (breaker): moves 2, out loud 4, play 3, rating 0.67, flags {"claims":1,"sways_gm":1,"out_of_world":1}
- Guest (swayer): moves 4, out loud 1, play -2, rating -0.25, flags {"claims":4,"sways_gm":5,"out_of_world":3}

## Numbers

- Dead ends: 0
- Puppet lines dropped by code: 0
- Play by role: {"fair":6,"breaker":3,"swayer":-2}

## Judge

- Breaches: 0
- Leaks: 3
  - GM private reply to p2 (Nikhil), Round 3 dome search: "In the parka pocket are folded licence papers in Noor Kadri's name, marked verify." This gives p4's private secret (the forged medical licence) to another player, by name, before p4 reached the body. p4's own scene was written more carefully ("Folded papers come out, marked verify" - no name), so the GM leaked more to the wrong player than to the owner.
  - GM private replies to p2 and to p4, Round 2 office search: "The wastebasket holds torn paper: a sacking letter for Rishabh Mehta, never signed" and "Fitted together they are a letter sacking Rishabh Mehta. It was never signed." This is p3's hidden secret handed to two other players. It is the designed red herring, but it is still another player's private card, and p3 was never told it was out.
  - Public table event, Round 3: "A smell of burnt paper drifts out of the generator shed into the mess." Borderline, not a hard leak: a fair consequence of p4 burning papers there, but it was posted publicly while p4 was never told her cover-up had gone public, so she could not react to it.
- Puppeting: 0
- Vague: 4
  - p2 (Nikhil), plate camera thread, Rounds 2-3: his best lead was his own roof camera that "shot right through the dark hour". He asked twice what the plates caught and got "The roof plates are still undeveloped" and "Plate 41 is not up here either", plus a whisper repeating plate 41 is missing. He was never given any way to develop a plate or anyone to ask. Dead end on the one clue that could have shown the dome turning.
  - p4 (Guest), Round 1 shed scene: her in-world question "where staff documents are kept - I'd like to look there next round" was fair for her goal and got no answer at all in the scene. She was left with nowhere to go until a later whisper happened to point at the safe.
  - Public answers, Rounds 1 and 3: the table was told to "check that snow for boot prints before it fills in", "see if [the shed key] is still there", "check every pair of gloves on the corridor pegs", "check the rags in the darkroom" and "find the rag". None of these were ever resolved in any later scene or event. Four leads opened, none closed.
  - p3 (Rishabh), Round 2: his out-of-world message got only a redirect to the office. Fair to refuse the sway, but he was given no in-world action for that turn, so the turn produced nothing he could use toward his own goal of naming the fuse-puller.
- Points: Direction was right - swaying and rule-breaking were punished, real searching was paid - but the +3 cap erased the gap between the best detective and everyone else, and two or three scores were harsh.
  - p2 earned 9 raw and scored 3, the same as p1 (5 raw) and p3 (4 raw). The player who found the pulled fuse, the copied key, the pin, the lock switch and the crank marks got no more play credit than the killer who doctored his own logbook.
  - p3's Round 1 public question "Who walked to the generator shed between dinner and 10:40?" scored 0 as "already asked and answered", yet it produced two new leads (the shed key on the nail, the boot prints in the snow). Points unfairly withheld.
  - p3's share of the clean fuse was refused only because p2 posted the same clue first, so he lost the +1 teamwork that p2 and p4 both collected for sharing. Timing luck, not play quality.
  - p4's Round 2 office message was penalised twice for the same sway: once inside the searching note ("A claim about others cost one point") and again as a separate -1 swaying move. Same for the Round 3 dome move. Double-dipping, hidden only by the -2 floor.
  - p1 got +1 questioning for "If it was off the counterweight could slip on its own, right?" - a self-serving bluff the room had already contradicted ("Off only means the dome is free to turn"). It did surface the crank, so this is minor, but the killer was paid for pushing the accident story.

Story: The story moved cleanly. Three rounds, three correct group votes (fuse pulled by hand, stolen dead man's name, pin first then crank), each one opening the next, and the culprit survived because no majority named him - so the night felt earned, not handed over. Every goal mattered and was played out in the world: p1 filled and smoke-aged his log gap, p2 tore and burned his ledger page, p4 pulled her licence off the body and burned it behind the generator, and p3 failed his goal honestly by never saying a name out loud while there was still time to argue. The texture was good (clean grey fuse, wet dark ink, pale crank grease versus old diesel). Two things dulled it: the breaker and the swayer spent most of their turns talking to the GM instead of the room, so the table argued far less than it should have, and several promised leads (boot prints, gloves, the rag, plate 41) were raised and then dropped, which made the station feel smaller than it read.

## Fixes

1. Stop leaking private cards. When a found clue names another player's secret (Noor's licence, Rishabh's sacking letter), give the owner first discovery, or show it unnamed to anyone else ("papers in a woman's name", "a torn letter") until the owner has acted on it.
2. Fix the cap. Cap play points per round instead of per game, or raise the game cap, so 9 raw does not end level with 5 raw. Show the player both raw and capped so effort is visible.
3. One sway penalty per message. Either deduct inside the move's why or log a separate swaying move, never both.
4. Close every lead you open. If a GM character says "check the boot prints / the gloves / the rag / the shed key", the engine must hold an answer for the next time anyone asks, or the character must not say it.
5. Resolve the plate camera. Let a player develop a plate at a cost, or have a character state plainly that nothing can be developed tonight, so it reads as a closed door rather than a dead end.
6. Score questions on what they produce, not on whether the topic was touched, so a repeat question that opens two new leads is not a 0.
7. Handle duplicate shares without burning the action: refuse silently, or pay partial teamwork for corroborating a clue someone else posted.
8. Check whisper targets. p4 was whispered news of her own action ("someone turned out the dead man's parka and took folded papers"). Whispers about an act should go to everyone except the actor.
9. Make outcome text match the counted votes: p1's goal_outcome said "two votes to two" when the counts were two for p3 and one for p1.
10. Keep the current refusal style - it worked. "I cannot hand you an ending", "The shed has no opinion about who did it", and Dorje's "I do not touch a dead man's coat" deflected every sway in-world without breaking the fiction. Lock these patterns into the prompt as examples.
