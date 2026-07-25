# Audio

Status: designed 2026-07-25. Phase 1 (eight synthesized cues) built the same day
in #382. The owner then asked for far more of them, which is "The breadth pass"
below and is tracked as #383, #384 and #385. Real samples and music are still owed;
see "Placeholder first, samples second". Tracks #226.

Scope of this note: sound effects. Music is deliberately out of the first slice
(see "Music, and why it is not here yet").

## The one rule

`src/scenes/juice.ts` sets the bar this follows:

> Removing the whole file would leave the game fully playable and identical to
> play.

Audio holds to the same promise. **No information reaches the player through
sound alone.** Every cue below duplicates something already on screen: a toast, a
number in the status line, a panel, a marker. A player with the sound off, a
player on a device with no output, and a player who never finds the mute key all
get the same game. This is the accessibility requirement, and it is a design
constraint rather than a later pass, because the moment to honour it is when the
cue is written.

Audio is therefore feedback only: it may make a moment *land*, and it may not
carry the moment.

## Decisions (owner, 2026-07-25)

1. **First slice is SFX only.** Six to eight short cues, a few hundred KB at
   most, no streaming. This proves the whole pipeline (load, preference, mute,
   persistence, credits, tests) on cheap assets before any music commitment.
2. **SFX default on, music default off** when music arrives. A short click on
   delivery is not what players object to; a browser tab that starts playing
   music unprompted is. This also keeps the autoplay block (below) from reading
   as "the music is broken".
3. **One key mutes all audio**, persisted. `V` (volume): `M`, `B`, `E`, `J`, `K`,
   `L`, `N`, `R`, `T`, `Space`, `Esc`, digits, and PgUp/PgDn are all taken.
   Rejected: separate SFX/music keys (spends two keys off an already full
   keyboard and doubles the persisted state) and an options panel (a new modal
   surface with its own input, freeze, and Esc rules, for one boolean today).
4. **The loudest cue belongs on the moment that hurt.** This mirrors `juice.ts`,
   where stranding gets the hard camera shake and a delivery gets a modest pop,
   and it follows the owner's standing direction that the game should have teeth.
   A delivery gets a short satisfying cue, not a fanfare.

## Three constraints that shape the build

### 1. Autoplay policy

Browsers refuse to play audio before a user gesture. This is not a footnote here,
because `boot-scene.ts` sends a player who has a save **straight into MapScene**
with no title screen and therefore no click. A cue fired before the first
keypress is silently dropped, and music started on boot would never play at all.

So: the audio system unlocks on the first input and never assumes it is running.
Phaser's sound manager exposes the locked state; the system treats "locked" as
just another reason a cue is a no-op, alongside "muted".

Consequence for cue choice: nothing important happens before the player's first
keypress, so no cue is lost that mattered. The intro toast is silent by design.

### 2. There is no OS-level "prefers no audio"

`systems/reduced-motion.ts` reads `prefers-reduced-motion` from the OS, which is
why juice needed neither a toggle nor storage: the player had already told their
system. Audio has no equivalent media query. It therefore needs a real persisted
preference, which means a storage key, which means `namespacedKey`
(`systems/storage-namespace.ts`, ADR 0008): path is not an isolation boundary in
the browser, and a PR preview must not write the player's real settings.

The key follows the existing standalone-preference precedent in
`save-system.ts` (`DIFFICULTY_KEY`, `INTRO_SEEN_KEY`): its own key, not part of
the save, so it survives a New Game. Muting is a preference about the player's
room, not state belonging to a run.

Storage failures read as **unmuted**, matching `prefersReducedMotion`'s reasoning:
answer with the honest default rather than claiming a preference the player never
expressed. A player with storage disabled gets sound every visit and can still
mute per session.

### 3. e2e must have audio wired but silent

`main.ts` already branches on `isE2E` (it sets `fps: { min: 20 }`), so
`audio: { noAudio: true }` belongs in the same place. Headless CI has no output
device, and the full-arc guard has a history of frame-starvation flake (#114,
#121) that a real sound device would not help.

But `noAudio` makes Phaser's `sound.play()` a silent no-op, which would leave
every call site unobservable, and an unobservable call is trap 1's "function with
no caller". Juice already solved this and said why:

> an accessibility promise that is only asserted in a unit test is a promise
> about a function, not about the game (the #274 lesson: the bug there was a
> missing caller).

So the audio system records the cue it last requested and exposes it on the e2e
hook, exactly as `Juice.isEnabled()` is exposed. A spec then proves that
completing a delivery *requested* the delivery cue, with no device involved. The
mute path gets the same treatment: after `V`, a delivery requests nothing.

## Placeholder first, samples second

The project's Art strategy is phased: Phase 1 coloured tiles and placeholder UI,
Phase 2 free asset packs, and art must never block the prototype. Audio gets the
same treatment, because the same reasoning applies.

**Phase 1 (built): synthesized cues, no asset files.** Short WebAudio blips
generated at runtime (a tone, an envelope, a decay). The audio equivalent of a coloured tile:
crude, obviously placeholder, and it needs no download, no licence entry, no
bundle weight, and no binary in the repo. Critically, it exercises every part of
the design that can actually be got wrong: the preference, the persistence, the
mute key, the autoplay unlock, the wiring at each call site, and the tests.

**Phase 2 (still owed): swap in real samples.** Kenney again (CC0, no attribution required,
already the source of every sprite in `assets/credits.md`) via the Interface
Sounds, RPG Audio, and Impact packs. The swap is one module: cue names and call
sites do not move. Files land in `assets/audio/` (which exists and holds only
`.gitkeep`), loaded in `boot-scene.ts` through Vite URL imports like every
existing texture, so base-path handling on GitHub Pages comes for free. Both
`assets/credits.md` and the hand-maintained `credits.html` get entries.

Doing Phase 2 first would mean committing binaries and a licence story before
knowing whether the wiring is right. Doing Phase 1 only would ship a game that
sounds like a 1980s calculator, which is why this note names Phase 2 as expected,
not optional.

## The cues

Weighted per decision 4: the moment that hurt is loudest. Every cue is short
(under ~400ms) and every one duplicates something already visible.

| Moment | Weight | Already on screen | Notes |
|---|---|---|---|
| Wagon stranded | **loudest** | toast, status line turns `stranded` | The one that hurt. Paired with the existing hard camera shake. Firm, not a jump-scare: no sudden peak, since it fires without warning. |
| Repair refused, too broke | strong | panel notice or toast | The other failure the player must feel. |
| Route or ford unlocked | strong | toast, terrain opens, marker changes | The biggest good moment in the game, and already the only juice effect that gets both shake and burst. |
| Delivery completed | medium | toast, coins and reputation move | Satisfying and short. Not a fanfare: it happens dozens of times a run. |
| Upgrade fitted | medium | toast, menu redraws | A part seating into the wagon. Pairs with the existing soft knock. |
| Repair completed | soft | toast, wagon meter refills | Relief, not an event. |
| Level up / skill point earned | soft | toast, status line | Fires mid-drive, so it must not startle. |
| Contract accepted | soft | board clears, objective changes | Confirms a commitment. Candidate to cut if the loop gets noisy: it is the most frequent press in the game. |

Deliberately silent in the first slice: toast dismissal, driving and terrain
changes, fog reveal, and the intro card (which fires before any gesture, so it
could not play anyway).

**Three of those four were overturned by the owner on the same day; see "The
breadth pass" below.** Only fog reveal and the intro card remain silent by
decision.

## The breadth pass (owner, 2026-07-25, after playing #382)

> Sounds work and make sense. My main comment is there needs to be more SFX in the
> game. If we do SFX we should do them for many actions and events. An easy one is
> cart movement. Nothing yet, but would add a lot.

The eight cues above were scoped as a first slice to prove the pipeline. That
worked, and the answer was that eight is too few: the game should answer the
player far more often. The inventory came to roughly thirty additions, tracked as
#383, #384 and #385, and it changes three things about the design above rather than
merely extending it.

**1. Driving gets a continuous voice.** The reasoning for leaving it silent (it is
continuous, and the wear meter already carries it) was wrong in an interesting way:
it treated audio purely as punctuation on discrete events. A rolling bed whose
timbre follows terrain makes "roads are gameplay" audible, which no meter does. It
is a new subsystem, not a table row, because it is a persistent voice with
per-frame modulation rather than a one-shot. See #383.

**2. Breadth needs a collision rule.** With thirty cues, several fire in the same
frame; a delivery arrival already stacks up to five. Highest tier wins and the rest
are dropped, not queued, because a late cue is detached from the moment it
described. Deliberately the same shape as the toast burst grouping (#378): several
things at once get one response, not a pile.

**3. Breadth needs a tier discipline and a master gain.** Frequent means quiet, as
a named tier rather than a number chosen per cue (bed, tick, cue, event, moment).
And a bed under thirty cues means loudness creeps together, so one master gain node
carries everything, which is also where a future volume slider goes.

Scroll stays silent by decision: it fires per wheel notch and would buzz rather
than tick. Recorded in #385 as a decision, not an omission.

## Where the code goes

Following the repo's own split, and mirroring juice:

- `src/systems/audio-preference.ts` (pure): the muted flag, its storage key via
  `namespacedKey`, load/save with the storage guards, and the default. Unit
  tested.
- `src/systems/audio-cues.ts` (pure): the cue table (name, weight, synth
  parameters). A table, not logic, so a cue's weight is reviewable in one place
  and testable without Phaser.
- `src/scenes/audio.ts`: the Phaser-facing `Audio` class: scene-lifetime, built
  in `create()`, one method per moment, every method a no-op when muted or
  locked. Records the last requested cue for the e2e hook.
- `src/main.ts`: `audio: { noAudio: true }` under `?e2e`.
- `src/scenes/map-scene.ts`: the call sites, next to the existing `this.juice.*`
  calls, which is also the proof that no cue carries information on its own: each
  one sits beside the toast or panel that already said it.

## What must be verified, not assumed

Trap 1 applies directly here, and this design has two shapes of it.

1. **Every cue needs a real caller.** The e2e hook exposes the last requested cue
   so at least the delivery path is proven from the browser, not just from a unit
   test. Cues without e2e coverage are covered by neutralizing the call and
   watching a unit test fail.
2. **Mute must be proven to actually silence.** The dangerous version of this bug
   is a mute flag that is read in a unit test and ignored at the call site. The
   e2e asserts that after `V`, a delivery requests no cue.

Also: the control-hint line (`systems/hint-text.ts`) and the Controls table in
`manual.html` both need the new key, or it is undiscoverable. A key with no
manual entry is trap 5's "tool with no CI job and no README entry" in a different
costume.

## Music, and why it is not here yet

Out of the first slice by decision 1, and the open questions are real: total
asset size on GitHub Pages, whether tracks are per-region (the scene restarts on
region travel, so a track would need to survive or hand off cleanly), the volume
mix against SFX, and looping seams. It defaults off when it arrives, so the mute
key generalizes to it without redesign: the preference is "audio muted", not
"SFX muted".

## No ADR needed

Phaser's sound manager is already a dependency the project has, and Phase 1 adds
no library at all. Per the dependency rules an ADR is for major dependencies, so
this note is the record. If music later needs a streaming or audio-sprite
library, that gets its own ADR.
