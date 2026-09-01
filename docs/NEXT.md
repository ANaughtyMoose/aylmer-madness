# Next up

Captured 2026-09-01 from playtesting. Ordered by what a player notices first.
Reference photos for the items below are in `data/raw/reference/` — **gitignored
on purpose**, because they are photographs of real people and this repo is
public. Do not commit them.

---

## 1. Memory — the blocker

The tab gets killed by Safari ("reloaded because it was using significant
memory"). ~1 GB JS heap plus ~260 MB of GPU buffers, all built up front. What
felt like an invisible wall on the Champlain Bridge was almost certainly this:
385 samples along the whole deck return **zero colliders**, and the bridge is the
far east edge of the map, so getting there holds the most geometry resident.

Fix in this order:

1. **Sector gating.** Aylmer, Hull, Chelsea and Ottawa are already separate data
   modules. Do not build Ottawa until the player crosses a bridge. Biggest win
   per hour, lowest risk.
2. **Free the CPU-side arrays after upload.** Check whether the heap is mostly
   vertex arrays that nothing reads again once they are on the GPU.
3. **Chunk streaming.** The world is already in 200 m chunks and the frustum
   culler already knows what is visible; extend that to what is *resident*.
4. Only then raise quality settings.

Do not hand this to an unreliable model — it needs profiling a live browser.

## 2. Traffic drives on the wrong side

Cars and buses are regularly on the wrong side of the road. `traffic.js`
`laneAt` / `wantOn` pick a side; the vehicles agent added a lane offset and a
speed cap for buses and cyclists at the same time. Suspect the offset sign is
wrong for one direction of travel, or that a one-way / dual-carriageway way is
being read as two-way.

## 3. Camera still jitters over bumps

Softened once already (two slow sines instead of one at 9.7 Hz, half amplitude,
plus a shake slider in Options). Still noticeable over bumps and slightly under
acceleration. The remaining source is not the shake term — it is the suspension
feeding `camPitch`, and the chase camera's position lerp (`dt * 9`) ringing
against the new higher speeds. Try: critically damping the camera spring,
low-passing the suspension contribution before it reaches the camera, and
decoupling pitch from `f.pitch` while airborne.

## 4. The missions need a story

Reordered so the opening is short and rewarding, and every brief now says what
it unlocks. Still to do:

- **The destinations repeat.** Poutine express and the dep run are effectively
  the same errand twice. Each job should go somewhere it has not been.
- **The poutine place does not exist.** The job sends you to the Galeries food
  court and there is nothing there to see. Either build the casse-croûte or send
  the job to one of the 120 real storefronts.
- **Unlocks should vary**: cash, a car, a tool, access to a place, a person who
  starts talking to you. Right now it is only ever a car.
- Written material already in `assets/text/` and unwired: `arc.json` (five-beat
  summer), `tutorial.json` (5 steps + 12 hints), `support.json` (50 lines of
  friends reacting to you being bad at it).

## 5. Avatar corrections — they look like today, not 2004

- **Sayyad**: no glasses at all, slimmer, no white or grey in the hair.
- **Margaret**: slimmer, dark brown hair (not white).

Both are parameter changes in `src/game/avatars.js`.

## 6. Russell's — a cheap garage at 1 rue Arial

A second, cheaper repair option than Norm's, at **1 rue Arial, Aylmer** (corner
of rue Riopelle / rue Louis, near chemin Foley).

**The property** (photos 29/30/31): a white two-storey with a **gambrel roof and
deep red trim**, red-framed upper windows, a full-width covered front porch,
white siding, cedar shrubs along the front. A **separate detached garage** sits
to the right of the house, set back down a long asphalt driveway — white, two
bays, gable roof. **The garage is where you fix your car**, not the house. It is
older and rough inside, with a **wood stove in the middle of the floor**.

- The house next door in the photos is modern and should NOT be copied; the
  street looked like this in 2004 but the neighbours did not.
- **Put an early-90s Ford F-250 in the driveway**, not the current white pickup.

**Russell** (photo 33 is 2020 — age him *down*): 16 in 2004, so make him
**slimmer with no facial hair**. A skateboarder.

**Russ's dad** (photo 32 is ~1994 — age him *up* about ten years): shoulder-length
hair, olive/green work jacket, moustache, outdoorsman. Fifties by 2004.

Cheap and rough is the point: Norm's is the proper garage, Russell's is the one
you go to when you have eleven dollars.

**Russell does not charge for labour — he charges pizza and beer.** You pay for
parts, full stop, and the work itself is settled in a large pizza and a case of
something. That is the whole economic joke and it should be literal: the bill
splits into a dollar amount for parts and an item you have to actually go and
fetch. Norm charges money for both and does it properly. Gemini's `russell.json`
currently frames it as a 50% labour discount — rewrite that.

## 7. Graphics

See the separate write-up. Short version: the ceiling here is not the renderer,
it is that every surface is one flat colour. Materials and lighting first,
geometry second.
