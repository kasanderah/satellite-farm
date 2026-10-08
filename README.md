# 环穗 (Ringsheaf)

环穗 (Ringsheaf) is a browser farm on the inner surface of a colony ring. This slice is one person's plot on the test satellite 农神VIII: about 3.9 km along the ring by the full width of the band. 农神VIII is the satellite, not the title of the game. The rest of the ring is a frozen neighbor backdrop, so the curl, the walls, and the parent planet still read the way the v3.1 art sample does. Nothing here is multiplayer. Your farm is one JSON document that can later be saved or handed over as a neighbor snapshot.

## Run

Open `index.html` in a browser. It is a single file: no server, no network.

To rebuild after changing `src/`:

```bash
npm install
npm test
npm run build
```

`npm test` checks the flat-map sim (plot size, planting, growth, harvest payout, snapshot round-trip). The page itself is the 3D client.

Art cameras, same as the sample: `index.html?view=far`, `mid`, `near`, `cut`, `up`. Add `fresh=1` to ignore a saved game. `rate=4` still sets the world clock for that session (1, 4, or 12). At 1×, one real second is one world day. The speed buttons are not on the play HUD.

## Play

The only crop in this slice is a mid-season ware potato (中熟商品薯). It takes **120 world days** from planting to harvest. Stages follow that clock. Clicking does not skip a stage. Planter, hiller, haulm topper, and harvester take five times as long to cross a field as they used to. The crop does not slow down with them.

The opening view sits on an empty field next to the hub. The salmon edge is the selected field. You start with seed potatoes, fertilizer, and a vine-kill spray, shown as counts.

1. Click 中熟商品薯. That spends one seed potato and one fertilizer. A tractor-drawn planter drops the seed and closes the soil into ridges.
2. The field stays bare ridges until emergence. Green shoots show on the ridges. A hiller then throws soil back onto the ridges.
3. The canopy closes the rows, then the plants flower (pale purple on a yellow-flesh potato).
4. Before harvest, a haulm topper shreds the vines. That pass also uses one spray if you still have any. The field turns to shredded brown haulm. This is vine-kill, not a slow yellowing.
5. A harvester lifts the ridge. Soil falls through the web, tubers show briefly in the opened row, and they go into the bunker. **营收** increases by that field's payout.

Click another of your fields to plant it again, if you still have seed and fertilizer. Fields outside the salmon plot boundaries are a neighbor snapshot: you can look, you cannot plant, and they do not pay. Keys: drag to pan, right-drag to orbit, wheel to zoom, 1–4 for orbit / sector / work / plant, C cutaway, N day-night, M map, H hide the HUD.

## Admin

The world clock is an admin control. Press **F2** or **\\**, or click **管理**. The panel has 1×, 4×, and 12×, plus **暂停**. Pause holds the clock, so the potato and the machines stay where they are. The play HUD does not show those buttons. Close the panel with F2, \\, or Esc.

## Assets

Press **V**, or open 管理 and click **资产**. The viewer shows the current potato stages (裸垄, 出苗, 封垄, 开花, 碎秧, 起薯), the machines (拖拉机, 播种机, 培土机, 杀秧机, 收获机), and the field tiles (条播, 宽行, 垄作, 水田, 菜畦). Each card is the asset's name and a picture of how it looks now. Click a card to mark it. This is a viewer: there is no upload, account, or editor. Press V or Esc, or click 关闭, to leave it.

The game writes the snapshot to `localStorage` (`ringsheaf.nongshen8.v1`) after you plant, change the clock, or harvest. `?fresh=1` starts from the seeded plot again.

## Snapshot

`exportSnapshot()` returns plain JSON, schema 2:

- `plotId` (`nongshen-viii/plot-01`), `worldDay`, `revenue`, `timeScale`
- `stores`: `seed`, `fertilizer`, `spray`
- `fields[]` for this plot only: `i, j, crop, dir, state, g, s, timer, growT, live, hold, plantedAt, paid, sprayed`
- `harvesters[]` with mode and the field they are on

A future neighbor is this same document, loaded and not stepped. The ware potato payout uses a rough yield (L/ha) and price ($/1000 L) as a scale reference only. The other field colors on the ring are a frozen backdrop, not crops you can plant. There is no late blight, frost, or rain. Surface temperature stays constant. Hilling and vine-kill stay.

## Art

Look, materials, lighting, and the ring bend come from the v3.1 sample and are not a new style. Simulation stays on a flat map (x along the ring, z across, y up). The bend is still `curveWorld` in the vertex shader. Palette, the six shared materials, the low warm sun, AgX, and the HUD chrome are the sample's. Geometry is the sample's; this slice only changes which fields are alive.
