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

Reaching a signpost near the southern crossing unlocks the ford. That second crossing links the south-west (Ironhollow) to the south-east (Southmill and Mirewatch), which the bridge detour reaches only the long way around. The signpost sits directly on the west approach to the ford, so the Ironhollow-to-Mirewatch secret run passes it: that late contract both needs the crossing and carries a "cross at the ford" bonus, so unlocking the ford pays off in a real delivery. Each region that has a ford unlocks it separately, through its own signpost, so opening one region's ford does not open another's. Coins can be spent on the Reinforced Wheels upgrade, which adds 25 percent speed across all terrain.

### 7. Leaving the region

Both roads out of Greybridge require the Reinforced Wheels fitted (#362). Until then, pressing T on a gateway refuses and names the upgrade and its price.

This exists because the arc was previously completable having bought nothing at all, which contradicted the pillar that gold and upgrades matter from the early game rather than being optional convenience. The penalty for refusing to spend was already severe (a measured 2.2x wall time, seven strandings, 550 coins of forced rescues) but it was still only a penalty.

Two rules keep the gate from becoming a dead end, and both are pinned by tests:

- The requirement is an **upgrade fitted, not a coin price**. An upgrade cannot be spent away once bought, so the gate can only ever be ahead of the player once.
- The gate never costs more than the region's smallest single delivery, so a courier standing at a closed gateway with nothing fitted is always one contract away from opening it. Greybridge's lowest-paying route was raised from 45 to 50 coins to hold this.

Return gateways are never gated: a courier who travelled out and then spent down must always be able to get home, and the spoke regions have no shop.

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
