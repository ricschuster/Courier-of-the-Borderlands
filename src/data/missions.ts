// Authored mission chains: the story spine expressed as data on top of the
// pure mission engine (src/systems/mission-system.ts). Each mission's progress
// is derived from facts the game already persists (completed contracts, story
// flags, visited settlements), so there is no mission save state.
//
// The arc follows docs/design/04_storyline.md (the Blockade): Greybridge sets
// it up, the two spokes each reveal one half (Saltreach the method, Fenmarch
// the cost) once the hub reveal has pointed the courier outward, and a
// Greywater capstone resolves it. Steps reference contract ids from the region
// data and story flags from dialogue-content.ts.

import type { Mission } from '../systems/mission-system';
import {
  FLAG_MET_POSTMASTER,
  FLAG_GREYBRIDGE_REVEAL,
  FLAG_SALTREACH_METHOD,
  FLAG_FENMARCH_COST,
  FLAG_BLOCKADE_BROKEN,
} from './dialogue-content';

const GREYBRIDGE_SPINE: Mission = {
  id: 'greybridge-silence',
  title: 'The Roads Fall Silent',
  regionId: 'greybridge',
  steps: [
    {
      id: 'meet',
      summary: 'Speak with the Greywater postmaster.',
      requires: { flags: [FLAG_MET_POSTMASTER] },
    },
    {
      id: 'first-letter',
      summary: 'Carry the sealed letters to Eastwatch.',
      requires: { contractsCompleted: ['letters-to-eastwatch'] },
    },
    {
      id: 'reconnect',
      summary:
        'Reconnect the rest of Greybridge: Southmill, Ironhollow, Northcairn, Mirewatch, Reedgrave.',
      requires: {
        contractsCompleted: [
          'grain-to-southmill',
          'rumours-to-ironhollow',
          'writ-to-northcairn',
          'secret-to-mirewatch',
          'secret-to-reedgrave',
        ],
      },
    },
    {
      id: 'reveal',
      summary: 'Return to the postmaster with what the roads have told you.',
      requires: { flags: [FLAG_GREYBRIDGE_REVEAL] },
    },
  ],
};

const SALTREACH_SPINE: Mission = {
  id: 'saltreach-method',
  title: 'The Vanished Courier',
  regionId: 'saltreach',
  // Opens once the hub reveal has pointed the courier out of Greybridge.
  requires: { flags: [FLAG_GREYBRIDGE_REVEAL] },
  steps: [
    {
      id: 'arrive',
      summary: 'Reach Tidewatch on the salt coast.',
      requires: { visited: ['tidewatch'] },
    },
    {
      id: 'retrace',
      summary:
        "Retrace the lost courier's route: Reedford, Saltkeep, Cormorant Rock, Saltmere.",
      requires: {
        contractsCompleted: [
          'saltreach-tide-to-reed',
          'saltreach-tide-to-keep',
          'saltreach-tide-to-cormorant',
          'saltreach-cipher-to-saltmere',
        ],
      },
    },
    {
      id: 'method',
      summary: 'Learn from the Tidewatch harbormaster how the roads are being cut.',
      requires: { flags: [FLAG_SALTREACH_METHOD] },
    },
  ],
};

const FENMARCH_SPINE: Mission = {
  id: 'fenmarch-cost',
  title: 'What the Mist Keeps',
  regionId: 'fenmarch',
  requires: { flags: [FLAG_GREYBRIDGE_REVEAL] },
  steps: [
    {
      id: 'arrive',
      summary: 'Reach Mossgate in the fen.',
      requires: { visited: ['mossgate'] },
    },
    {
      id: 'reconnect',
      summary: 'Bring the fen back onto the map: Duskmere, Thornwick, Hollowfen, Fenholt.',
      requires: {
        contractsCompleted: [
          'fenmarch-moss-to-dusk',
          'fenmarch-moss-to-thorn',
          'fenmarch-moss-to-hollow',
          'fenmarch-cipher-for-fenholt',
        ],
      },
    },
    {
      id: 'cost',
      summary: 'Hear from the Mossgate warden what isolation costs a place.',
      requires: { flags: [FLAG_FENMARCH_COST] },
    },
  ],
};

// The capstone. Available only once both spokes have revealed their half, it
// resolves the region arc back at the home town. The larger world stays open.
const GREYBRIDGE_CAPSTONE: Mission = {
  id: 'greybridge-answer',
  title: 'The Road Answers',
  regionId: 'greybridge',
  requires: { flags: [FLAG_SALTREACH_METHOD, FLAG_FENMARCH_COST] },
  steps: [
    {
      id: 'resolve',
      summary: 'Return to the Greywater postmaster. The blockade can be broken.',
      requires: { flags: [FLAG_BLOCKADE_BROKEN] },
    },
  ],
};

/**
 * All authored missions, in arc order. activeMission prefers the current
 * region, so the Greybridge Act 1 chain and its capstone can both live here;
 * the capstone only becomes available after both spoke reveals.
 */
export const MISSIONS: readonly Mission[] = [
  GREYBRIDGE_SPINE,
  SALTREACH_SPINE,
  FENMARCH_SPINE,
  GREYBRIDGE_CAPSTONE,
];
