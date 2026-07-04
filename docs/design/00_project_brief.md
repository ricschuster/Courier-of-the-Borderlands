# Courier of the Borderlands: Project Brief

## 1. Project purpose

Courier of the Borderlands is a learning-first, solo game development project built with Claude Code. The goal is to create a working 2D web game that is fun to play, technically understandable, and easy to extend over time.

The project is not intended to be a commercial release at the start. The first goal is a playable MVP with one complete region, one meaningful core loop, and enough structure to support future expansion.

## 2. Game concept

Courier of the Borderlands is a 2D fantasy courier exploration game.

The player is a courier in a fractured frontier region where roads are unreliable, settlements are isolated, and information matters as much as goods. The player accepts delivery contracts, drives across difficult terrain, reveals the map, builds reputation with settlements, and gradually unlocks safer routes, vehicle upgrades, and story threads.

Short pitch:

> A 2D fantasy courier game about delivering goods, letters, rumours, and secrets across a dangerous borderland, where every route reveals more of the map and changes the player's reputation with the people who depend on them.

## 3. Design pillars

1. Exploration first  
   The player should always want to reveal one more stretch of road.

2. Deliveries drive progression  
   Every contract should move the world, reputation, map, vehicle, or story forward.

3. Roads are gameplay  
   Terrain, route quality, shortcuts, and hazards create the main challenge.

4. Story through places  
   Lore should emerge from settlements, route names, delivery notes, and short NPC interactions.

5. Small systems, clear feedback  
   Mechanics should be simple, visible, and testable before they become deep.

## 4. Intended feel

The game should feel like story-rich wandering across a mysterious and slightly dangerous fantasy borderland. It should not feel like a racing game, combat game, or heavy simulation.

Reference inspirations:

- Civilization: map discovery, long-term progression, meaningful choices
- Need for Speed: movement, routes, vehicle improvement
- Gothic: strong sense of place, settlements, reputation, regional mystery

The game should borrow the feeling of these games, not their full scope.

## 5. MVP scope

The MVP should include one small playable region called the Greybridge Region.

The MVP region should include:

1. One starting town
2. Three delivery destinations
3. Fog-of-war map reveal
4. Simple top-down courier vehicle movement
5. Multiple terrain types with movement effects
6. One difficult or blocked route
7. One unlockable shortcut or improved road
8. Three delivery contracts
9. Reputation and currency rewards
10. One basic vehicle upgrade
11. Short NPC or delivery text to establish story tone

## 6. First playable loop

The first playable loop is:

1. Player starts in town.
2. Player accepts a delivery.
3. Player drives across the map.
4. Fog-of-war reveals nearby terrain as the player travels.
5. Terrain affects movement speed.
6. Player reaches the destination.
7. Delivery completes.
8. Player receives reputation and currency.
9. A new route, contract, or upgrade becomes available.
10. Player chooses the next delivery.

If this loop is fun with placeholder art, the project is worth continuing.

## 7. What to build first

The first build target is a grey-box prototype of one delivery across a fogged map.

Do not begin with polished art, deep story, combat, complex menus, economy simulation, or save/load. Build the smallest playable version of the core loop first.

Initial build sequence:

1. Create a simple top-down tile map.
2. Add terrain types.
3. Add player vehicle movement.
4. Add fog-of-war reveal.
5. Add one pickup location.
6. Add one delivery destination.
7. Add delivery completion feedback.
8. Add terrain-based speed modifiers.
9. Add simple contract data.
10. Add reputation and currency rewards.

## 8. Technical direction

Recommended stack:

- TypeScript
- Phaser 3
- Vite
- GitHub
- GitHub Pages for web deployment
- Vitest for unit tests
- Playwright later for browser smoke tests
- Markdown for design docs and handoffs
- JSON as canonical game data format

Rationale:

- Web deployment is the easiest way to test and share the game.
- Phaser is mature and appropriate for 2D games.
- TypeScript helps Claude Code reason safely about code changes.
- JSON supports data-driven design for contracts, terrain, settlements, upgrades, and story snippets.
- Markdown supports lightweight documentation and session handoffs.

## 9. Art strategy

Art is a known project risk, so the game should be designed to work with minimal visuals at first.

Phase 1 art:

- Coloured terrain tiles
- Simple geometric player marker
- Icons or labels for towns and destinations
- Basic UI panels
- No custom illustration required

Phase 2 art:

- Free asset packs for terrain, roads, buildings, vehicle, and UI
- Clear asset credits in `assets/credits.md`

Phase 3 art:

- Optional custom or AI-generated assets once the game loop works

Art must not block the playable prototype.

## 10. Out of scope for MVP

The following are explicitly out of scope for the first MVP:

- Combat
- Multiplayer
- 3D graphics
- Full economy simulation
- Procedural world generation beyond simple test maps
- Large quest system
- Complex inventory
- Polished art
- Advanced audio
- Mobile optimization
- Save/load, unless the MVP is already stable

## 11. Definition of done for MVP

The MVP is done when a player can:

1. Open the game in a web browser.
2. Start in the Greybridge Region.
3. Accept a delivery contract.
4. Drive to a destination.
5. Reveal map areas through fog-of-war.
6. Experience movement differences across terrain.
7. Complete a delivery.
8. Receive visible rewards.
9. Unlock at least one new route, shortcut, contract, or upgrade.
10. Understand the basic fantasy courier premise from in-game text.

The MVP may use placeholder art and simple UI, but it must be playable from start to finish.
