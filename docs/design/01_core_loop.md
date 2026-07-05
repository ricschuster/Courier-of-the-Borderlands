# Core Loop

## Player fantasy

You are a courier working the Greybridge Region: a fractured borderland where roads are unreliable, settlements are isolated, and information travels as slowly as wagons. Every delivery reveals more of a dangerous world and shifts how the people in it regard you.

## The loop

```
Accept contract
  -> Collect cargo at pickup settlement
  -> Plan a route across the terrain
  -> Drive and reveal the map as you go
  -> Deliver at the destination settlement
  -> Earn coins and reputation
  -> Unlock new routes, shortcuts, and upgrades
  -> Accept the next contract
```

Each step of the loop is implemented and playable.

### 1. Accept a contract

Contracts are accepted at the Greywater contract board. The board appears when the courier is in Greywater with no active contract, and lists the remaining contracts. Each has a title, cargo description, pickup settlement, destination settlement, coin reward, and reputation reward, plus a short delivery note that sets the tone.

Better contracts are gated by reputation. A contract can only be accepted once the courier's total reputation meets its minimum, so the player earns access to higher-value runs by completing earlier ones. This is what makes reputation matter: it is the key to the board, not just a score. Locked contracts are shown on the board with the reputation they require.

Each contract carries a cargo type: letters, goods, rumours, or secrets. The type is shown as a tag on the board and applies a small pay modifier at delivery (goods pay the baseline, secrets pay the most). The cargo modifier is applied to the base reward before the reputation bonus, so the two stack.

### 2. Collect and carry cargo

The contract state machine runs: `accepted -> carrying -> delivered`. The courier must reach the pickup settlement before cargo transfers. Arriving at the destination without cargo does nothing.

### 3. Plan a route

The Greybridge Region is a 20x11 tile map with six terrain types:

| Terrain  | Speed modifier | Notes                                     |
|----------|---------------|-------------------------------------------|
| Road     | x1.4          | Fastest travel                            |
| Bridge   | x1.4          | Only crossing at the start               |
| Plains   | x1.0          | Standard cross-country movement          |
| Forest   | x0.55         | Significantly slows the wagon            |
| Ford     | x0.7          | Second crossing, unlockable shortcut     |
| Water    | blocked       | River, impassable without a crossing     |
| Mountain | blocked       | Hard boundary                            |

The river must be crossed at the bridge or (once unlocked) the ford. Route choice matters.

### 4. Drive and reveal the map

The map starts fully fogged. Driving reveals tiles in a radius around the wagon. There is always more map to explore beyond the current visible area. The fog is the primary motivation to keep moving.

### 5. Deliver and collect rewards

Arriving at the destination settlement while carrying cargo completes the contract. The courier receives coins and settlement-specific reputation. On-screen feedback confirms the delivery.

### 6. Unlock progression

Reaching a signpost near the southern crossing unlocks the ford. That second crossing opens a shorter route to Southmill, making repeat runs faster. Each region that has a ford unlocks it separately, through its own signpost, so opening one region's ford does not open another's. Coins can be spent on the Reinforced Wheels upgrade, which adds 25 percent speed across all terrain.

## How the design pillars show up

- **Exploration first.** The fog hides the terrain ahead. You learn routes by driving them.
- **Deliveries drive progression.** Contracts are the only source of coins and reputation. Completing them unlocks the ford and funds upgrades.
- **Roads are gameplay.** Taking the road is faster than cutting across plains. Forest is a meaningful penalty. The bridge versus ford decision is a real route choice.
- **Story through places.** Lore comes from delivery notes, settlement names, and contract flavour text. There is no cutscene.
- **Small systems, clear feedback.** Each system is small and visible. The objective line, fog reveal, and delivery confirmation are the feedback.

## What the loop does not include yet

- Combat: not in MVP.
- Time pressure or deadlines: not in MVP.
- Economy simulation or supply chains: not in MVP.
- Multiple simultaneous contracts: not in MVP.
- Full NPC dialogue: short delivery notes only in MVP.

These are deliberate omissions, not gaps. The loop must be solid before any of these are added.
