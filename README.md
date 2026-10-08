# KESTREL-7 · satellite farm

A browser farm on the inner surface of a colony ring. This slice is one person's plot: about 3.9 km along the ring by the full width of the band. The rest of the ring is a frozen neighbor backdrop, so the curl, the walls, and the parent planet still read the way the v3.1 art sample does. Nothing here is multiplayer. Your farm is one JSON document that can later be saved or handed over as a neighbor snapshot.

## Run

Open `index.html` in a browser. It is a single file: no server, no network.

To rebuild after changing `src/`:

```bash
npm install
npm test
npm run build
```

`npm test` checks the flat-map sim (plot size, planting, growth, harvest payout, snapshot round-trip). The page itself is the 3D client.

Art cameras, same as the sample: `index.html?view=far`, `mid`, `near`, `cut`, `up`. Add `fresh=1` to ignore a saved game. `rate=4` sets the crop clock (1, 4, or 12).

## Play

The opening view sits on an empty field next to the hub. The salmon edge is the selected field.

1. Click a crop in the bottom bar (金穗麦 wheat, 尖塔玉米 corn, 苔豆 soy, 蓝藻稻 rice). The number under the name is the gross payout for that 128 m field.
2. The canopy fills in and the percent climbs. **流速** is the crop clock: 1×, 4×, 12×. Machines keep a readable pace either way.
3. A harvester already on the plot, or one that drives out from the hub, cuts the field. You do not drive it.
4. **营收** increases by that payout. A toast names the crop.

Click another of your fields to replant it. Fields outside the salmon plot boundaries are a neighbor snapshot: you can look, you cannot plant, and they do not pay. Keys: drag to pan, right-drag to orbit, wheel to zoom, 1–4 for orbit / sector / work / plant, C cutaway, N day-night, M map, H hide the HUD.

The game writes the snapshot to `localStorage` (`kestrel7.plot07.v1`) after you plant or harvest. `?fresh=1` starts from the seeded plot again.

## Snapshot

`exportSnapshot()` returns plain JSON, schema 1:

- `plotId`, `simTime`, `revenue`, `timeScale`
- `fields[]` for this plot only: `i, j, crop, dir, state, g, s, timer, growT, live, hold, plantedAt`
- `harvesters[]` with mode and the field they are on

`state` is 0 bare, 1 growing, 2 ripe, 3 cutting, 4 stubble. A future neighbor is this same document, loaded and not stepped.

Payouts use rough yield (L/ha) and price ($/1000 L) as a scale reference only. Four crops are plantable. The other four stay in the palette so the ring does not collapse to one color. There is no lime, weed, or rolling pass.

## Art

Look, materials, lighting, and the ring bend come from the v3.1 sample and are not a new style. Simulation stays on a flat map (x along the ring, z across, y up). The bend is still `curveWorld` in the vertex shader. Palette, the six shared materials, the low warm sun, AgX, and the HUD chrome are the sample's. Geometry is the sample's; this slice only changes which fields are alive.
