# The living map

Status: approved by the creator ("design everything, I approve all already", 2026-10-18). Written from the choice they made earlier: "GM plans, code draws".

## The problem

Today's map is a few name chips on a blank square joined by straight lines. It says nothing about the world: not how far the boathouse is from the lodge, not whether there is a river, not whether the trip takes a minute or half an hour. Since places now matter (going somewhere is a real step, announced to the room), the map should make distance and the shape of the place felt, and the story should respect it.

## What the players see

- **A drawn place, not a diagram.** A ground in the world's colours with simple terrain (trees, water, hills, streets, snow, sand, or rooms and corridors for a single building), 6 to 12 made-up landmarks (an old well, a broken statue, the north gate), winding paths, a compass and a scale bar.
- **Distance and time on every path.** "350 m, 4 min walk". Trips over 1.5 km also show the drive ("6 km, 75 min walk, 12 min by car"). Inside one building: "20 m, under a minute".
- **On the phone,** the paths from where you are stand out with their times; the rest are faint. Tapping a place still picks it to go there (the confirm and the announcement stay as built).
- **On the table,** every path shows its time, and people's chips sit on their places as now.
- **Readability first:** labels on solid chips, the world's font only on the map title, no moving edges. Terrain is quiet texture under the places, never louder than the names.

## How it is made

- **The GM plans, in the world it already writes.** A new `geography` field:
  - `terrain`: one of `forest`, `hills`, `coast`, `river`, `snow`, `desert`, `city`, `village`, `building`.
  - `across_m`: how wide the drawn area is in real metres (a building is 30 to 120, grounds 200 to 1500, a village 1 to 3 km, a city up to 15 km).
  - `landmarks`: 6 to 12, each `{ id, name, kind, x, y }` with `kind` from a fixed list (tree, trees, water, bridge, well, statue, tower, gate, rock, hill, road, shop, house, ruin, stairs, door, window). Landmarks are scenery only: never a clue's place, never where a person is.
  - `paths`: `{ from, to, kind }` between locations (and optionally landmarks), `kind` from road, trail, stairs, corridor, bridge, water. Every pair of `neighbors` gets a path.
- **The code draws and measures.** Distance is the straight-line distance between the two ends on the 0 to 100 grid scaled by `across_m`, times 1.3 for a winding path. Walking is 80 m a minute; driving 30 km an hour, shown only past 1.5 km. Paths are drawn as gentle curves with a bend picked from the game id, so the same world always looks the same.
- **Old worlds still play.** No `geography`: the map draws as a plain ground with paths from `neighbors`, and an assumed `across_m` of 300 (grounds). Times are still shown, marked "about".
- **The GM's prompt rule:** the scale must fit the story (a lodge and its boathouse are a few hundred metres apart, not 5 km), and travel times must fit the night (nobody walks a 40-minute path in the 10 minutes between two whereabouts).

## The story respects the map

- **A new story check (`far`):** for each character, two whereabouts at different places whose walking time is longer than the minutes between them is a story issue, listed like the others (count logged, sent to the GM story check with the patch list).
- **Answers know the distance.** When the GM answers a move that goes somewhere, it is told the walking time from where the player is ("from the Lodge, 4 min walk"), so it can say how long it took.
- **The move announcement** gains the time: "Nikhil goes to the Boathouse (4 min walk) to check something".

## Out of scope

- Real travel time inside the game clock (a move still lands at once).
- A map editor for terrain or landmarks (the host's existing place editor keeps working for places).
- Pictures from an image model; the map is drawn in code.

## Tests that pin it

- `should give every neighbor pair a path with metres and minutes`
- `should show drive time only past 1.5 km`
- `should draw an old world without geography, marked about`
- `should never let a landmark be a clue's place` (validation drops or renames it)
- `should flag a whereabouts pair that is too far apart for the time between`
- `should tell the GM the walking time of a move`
- `should add the walking time to the move announcement`
- `should draw the same map for the same game every time`
