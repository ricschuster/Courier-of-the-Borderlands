// Spine payoff text, shown in the journal when a settlement is reconnected to
// the courier network (its key delivery completed). Keeping this text in data
// keeps the world-state system generic; the story lives here.
//
// The through-line: the borderland is going silent, place by place, as
// settlements lose contact with one another. A completed delivery is the world
// answering back. These lines are the felt reward for a delivery, the thing the
// playtest found missing (see docs/design/05_playtest_notes.md). Keep them to
// one or two sentences, place-driven, consistent with each settlement's note.

export const RECONNECTED_NOTES: Readonly<Record<string, string>> = {
  // Greybridge
  eastwatch:
    'The watchtower answers again. The night your letters arrive, someone lights the signal-fire that had gone dark.',
  southmill:
    'The wheels turn once more. Southmill sends word downriver that it still stands, and asks for the next load.',
  ironhollow:
    'Ironhollow cracks its gates a hand\'s width. Whatever the rumour said, they were expecting it.',
  northcairn:
    'The hill clans set a fresh stone at Northcairn. The writ was read; the passes stay open a while longer.',
  mirewatch:
    'Mirewatch takes the sealed tube without a word. A lamp now burns out in the reeds where none did before.',

  // Saltreach
  reedford:
    'The reed-cutters take your parcels and, for once, do not ask how you came. Reedford is on the map again.',
  saltkeep:
    'Saltkeep opens its accounts to you. The garrison seems to remember there is still a road home.',
  'cormorant-rock':
    'The birds of Cormorant Rock scatter and wheel back. Your unsigned letter reached whoever it was meant for.',

  // Fenmarch
  duskmere:
    'Duskmere strings lamps along the water. The dark that comes before dusk holds off a little longer tonight.',
  thornwick:
    'Thornwick unbars its gate the width of a ledger. What it guards is still never named.',
  hollowfen:
    'The old stones at Hollowfen stand a little less alone. The waiting, for now, has an answer.',
};

/** Payoff line for a reconnected settlement, or a generic line if none authored. */
export function reconnectedNoteFor(settlementId: string): string {
  return RECONNECTED_NOTES[settlementId] ?? 'The road here is open again. Word travels on.';
}
