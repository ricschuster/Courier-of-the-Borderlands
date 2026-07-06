# 0003: Hub Region Layout and Arrival Markers

## Status

Accepted

## Context

Three regions now exist: Greybridge, Saltreach, and Fenmarch. They were wired as a linear chain (Greybridge <-> Saltreach <-> Fenmarch), with Saltreach as the middle node holding two gateways. Two problems followed:

1. **Topology.** A chain forces all Fenmarch trips through Saltreach and makes Saltreach a bottleneck. It does not match the intended shape of a home base with routes fanning out to frontier regions.
2. **Arrival placement.** On travel, the scene always dropped the courier at the destination region's fixed `spawn` tile. Travelling back to a region you had already entered from the far side put you at that region's start point, not at the gateway you arrived through. It read as a teleport and lost the sense of a connected map.

## Decision

**Hub and spokes.** Greybridge is the hub. It has one gateway to each spoke (Saltreach and Fenmarch). Each spoke has a single gateway leading back to Greybridge. The spokes are not directly connected, so all travel routes through the hub. Adding a future region is a spoke off the hub (a new gateway on Greybridge plus a return gateway on the new region), which keeps the topology explicit and each region's gateway list short.

**Arrival at the return gateway.** Travel now passes the origin region id into the scene restart. On entry the courier is placed at the *arrival tile*: the gateway in the destination region whose destination is the region just left. The player steps out at the marker they would use to return. A fresh load or new game has no origin and falls back to the region `spawn`.

The rule is a pure function, `arrivalTile(region, fromRegionId?)`, in `region-system.ts`. The scene calls it; unit tests cover it directly. Gateways are already required (by an existing test) to be reciprocal and on passable tiles, so an arrival tile is always a valid, drivable tile.

## Consequences

**Positive:**

- Travel is spatially coherent: leave a region through a gateway, return to the same gateway.
- The hub shape matches the design intent and scales by adding spokes without touching existing spoke data.
- Arrival logic is pure and unit tested, and an input-driven e2e test (`tests/e2e/travel.spec.ts`) drives a real round trip and asserts the landing tile.

**Negative:**

- Two regions cannot be adjacent without both linking through the hub, so a future "shortcut between spokes" would need an explicit extra gateway pair (an intentional, visible change).
- Arrival depends on reciprocal gateways. If a region gained a gateway with no return link, arrival from it would silently fall back to spawn. The reciprocity unit test guards against that.

These tradeoffs are accepted. The hub is the simplest layout that fits the home-base premise, and computing arrival from existing gateway data adds no new data to author or keep in sync.
