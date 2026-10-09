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

Art cameras, same as the sample: `index.html?view=far`, `mid`, `near`, `cut`, `up`. Add `fresh=1` to ignore a saved game. `rate=4` still sets the world clock for that session. **1× means one real minute is one world day.** A higher multiplier speeds the clock and the machines together. The speed control is not on the play HUD.

## Play

The only crop in this slice is a mid-season ware potato (中熟商品薯). It takes **120 world days** from planting to harvest. Stages follow that clock. Clicking does not skip a stage. At 1×, the planter, hiller, haulm topper, and harvester move at about 2.8 m/s, so one 128 m field edge takes about 50 real seconds.

The opening view sits on an empty field next to the hub. The salmon edge is the selected field. You start with one seed potato and one dose of fertilizer, enough for that first field, plus a vine-kill spray. The shop sells more 种薯, 肥料, and 饲料. A new game starts with feed for two protein cultures. More feed is the third shop row, at a placeholder price of 800.

1. Click 中熟商品薯. That spends one seed potato and one fertilizer. A tractor-drawn planter drops the seed and closes the soil into ridges.
2. The field stays bare ridges until emergence. Green shoots show on the ridges. A hiller then throws soil back onto the ridges.
3. The canopy closes the rows, then the plants flower (pale purple on a yellow-flesh potato).
4. Before harvest, a haulm topper shreds the vines. That pass also uses one spray if you still have any. The field turns to shredded brown haulm. This is vine-kill, not a slow yellowing.
5. A harvester lifts the ridge. Soil falls through the web, tubers show briefly in the opened row, and the lot goes into the warehouse. **营收** does not move until you sell that lot.

Click another of your fields to plant it again, if you still have seed and fertilizer. If either count is zero, planting stops and the field line says so. Buy the missing one in 商店. The price is a placeholder in the same unit as 营收. Short money says 营收不够. Fields outside the salmon plot boundary are a neighbor snapshot: you can look, you cannot plant, and they do not pay. The boundary is the same salmon line as a selected field, drawn around the whole plot, including in map mode (M). Keys: drag to pan, right-drag to orbit, wheel to zoom, 1–4 still change camera distance, C down to the protein deck and back, N day-night, M map, H hide the HUD.

## Bottom bar

The buttons along the bottom are the play modes:

- **农机** lists the machines you own and what each is doing. Click one and the camera locks onto it.
- **区域** returns to the field you are planting: select a field, then plant the potato. From the protein deck, 区域 brings you back up.
- **仓库** is the store on the hub. Harvested potatoes and protein lots sit here. Select a lot and sell it to add that lot's listed price to 营收. Each row has a **牌价**. That number is a placeholder for a future market price. It does not change, and there is no price simulation.
- **建设** has three separate actions: 放下 picks a building and clicks the hub to place it, 拆除 selects a hub building and removes it, and 查看 only lists what is already there. A crop field still refuses a building. The opening hub has a warehouse, a garage where the surface machines park, and a small processing shed. They stay until you delete them. 重开 puts the three back.
- **商店** sells 种薯, 肥料, and 饲料. Buying spends 营收. 饲料 is 800. One culture spends one.

## Protein deck

Press **C**, or click the grow row in the layers panel, to go down to the protein deck. The camera pans, orbits, and zooms the same way it does on the surface, including the 1–4 distance steps. While you are down there the surface field is hidden so the deck can be read. **C** or **区域** brings the surface and the surface camera back. The deck floor uses the same module as the surface plot: 7 large cells across, 16 small cells in each. Four sealed culture tanks and one gantry arm sit on that grid. Pick 蛴螬 or 黑水虻, start a tank (that spends one feed), send the arm to tend it, and harvest when the culture reaches its day on the same world clock. 蛴螬 takes 65 world days. 黑水虻 takes 13. The harvest is a protein lot in the warehouse, sold at its own 牌价. If the tank is already running, the line says so. If feed is gone, starting stops until you buy 饲料. The deck and the shop both show how much feed is left. The deck shows a set climate, 30°C and 70% humidity. That is a setpoint, not weather. The surface stays at its constant temperature.

## Admin

The world clock is an admin control. Press **F2** or **\\**, or click **管理**. The panel has 1×, 4×, and 12×, a number field for any other multiplier, and **暂停**. 1× is one real minute per world day. Pause holds the clock, so the potato and the machines stay where they are. The play HUD does not show those controls. Close the panel with F2, \\, or Esc.

## Assets

Press **V**, or open 管理 and click **资产**. The viewer shows the current potato stages (裸垄, 出苗, 封垄, 开花, 碎秧, 起薯), the machines (拖拉机, 播种机, 培土机, 杀秧机, 收获机), and the field tiles (条播, 宽行, 垄作, 水田, 菜畦). Each card is the asset's name and a picture of how it looks now. Click a card to mark it. This is a viewer: there is no upload, account, or editor. Press V or Esc, or click 关闭, to leave it.

The game writes the snapshot to `localStorage` (`ringsheaf.nongshen8.v1`) after you plant, change the clock, or harvest. `?fresh=1` starts from the seeded plot again.

## Snapshot

`exportSnapshot()` returns plain JSON, schema 2:

- `plotId` (`nongshen-viii/plot-01`), `worldDay`, `revenue`, `timeScale`
- `stores`: `seed`, `fertilizer`, `spray`, `feed`
- `warehouse[]`: harvested lots, each with `listPrice` (the listed price, not a live market). Protein lots are marked `kind: "protein"` and priced apart from potatoes.
- `buildings[]`: hub structures (warehouse, garage, processing shed). A shed saved on a crop field is moved onto the hub when the save opens. `keepBuildings` keeps a deleted starter deleted. An older save without that flag still receives the three opening buildings.
- `tanks[]`: the four culture tanks on the protein deck
- `fields[]` for this plot only: `i, j, crop, dir, state, g, s, timer, growT, live, hold, plantedAt, paid, sprayed`
- `harvesters[]` with mode and the field they are on

A future neighbor is this same document, loaded and not stepped. The ware potato payout uses a rough yield (L/ha) and price ($/1000 L) as a scale reference only. The other field colors on the ring are a frozen backdrop, not crops you can plant. There is no late blight, frost, or rain. Surface temperature stays constant. Hilling and vine-kill stay.

## Art

Look, materials, lighting, and the ring bend come from the v3.1 sample and are not a new style. The protein deck stays inside that palette: hard metal plates, cold practical lights, sealed tanks, and a gantry arm. The ring exterior is unchanged. Simulation stays on a flat map (x along the ring, z across, y up). The bend is still `curveWorld` in the vertex shader. Palette, the six shared materials, the low warm sun, AgX, and the HUD chrome are the sample's. Geometry is the sample's; this slice only changes which fields are alive.
