# 田间阶段配置

工坊里的「田间 / 阶段编辑器」改的就是这份结构。玩法循环先不读它。主进程要接的时候，用 `parseFieldStageDoc`，不要在农时里写死「收获后只能回空地」。

## 打开

1. 构建过一次的话，直接打开 `asset-lab.html`（单文件，不用服务器）。
2. 改过 `src/` 之后：`npm install`，然后 `npm run build`，或只打工坊 `node build.mjs asset-lab`。
3. 左侧目录选 **田间 → 阶段编辑器**。

预览是一块 36 × 28 m 的田。`rows` 条垄铺进这块宽里，方便看截面。`plant.row` 仍是农艺行距，给主进程用，预览不按它拉开垄距。

## 怎么看一条链

底部：

- **播放 / 暂停 / 重置**。空格同样切换播放。打开时是 1×：1 游戏日 = 1 真实秒，播种一趟大约两秒，方便看农机扫过。4×、8×、16× 按这个比例加快阶段和扫田。整链演示会自己切到 4×。
- **整链演示**：空地先放到 O3，再翻地、播种半田、喷水，等到 D1 后收割，再清田回 O。
- **播种**扫完整块，**半田**只扫一半。没扫到的格子锁住，本轮不能再播。
- **喷水 / 施肥 / 喷药**把扫过的格子写成 A1、A2、C1。同一阶段后一次盖住前一次。做不做都按该阶段的游戏日进入下一阶段。
- **收割**把 D（含 D1、D2）扫成 E。**翻地**、**清田**可以拆掉蒙版。**取消扫田**停掉这一趟，已经扫过的留下。
- 点时间轴上的一块，画面停在那个阶段，方便改颜色和截面。再按播放，回到时钟。

时长在右侧每个阶段旁边的数字，单位是游戏日。改完立刻影响播放比例。

垄截面在曲线上改。横轴是一条垄的横向，纵轴是高度（米）。拖控制点，预览里的地面跟着变。双击加点，右键删点。不勾「只改这一阶段」时，改的是全阶段连锁的截面。

## 主进程怎么读

```js
import { parseFieldStageDoc } from './src/field-stages.js';
const doc = parseFieldStageDoc(JSON.parse(text));
```

`text` 可以是 `data/field-stages/potato.json`，也可以是工坊下载的 `field-stage-<cropId>.json`。浏览器里的另一份在 `localStorage` 键 `ringsheaf.assetlab.fieldStages.v1`，形状是 `{ schema, cropId, crops: { [cropId]: doc } }`。

`parseFieldStageDoc` 会补上缺的 E→O / E→A，并按 `chain` 重写自然边。它不推进时钟，也不派农机。

取消进行中的扫田时调用 `cancelWorkOrder(sim, doc)`。文档里的 `hooks.cancelWorkOrder` 只是这个函数名。工坊没有工单队列。

## 字段

| 字段 | 含义 |
| --- | --- |
| `schema` | `ringsheaf.field-stage/1` |
| `cropId` / `logicId` | 对齐 `CROPS.id` 与 `crop_<id>` |
| `timeUnit` | `gameDay`。`secondsPerDayAt1x` 是工坊 1× 的换算，主进程用自己的世界钟 |
| `rows` | 垄行数，默认全阶段连锁。阶段上的 `rows` 为 `null` 表示继承；写成数字时主进程可以单独用，工坊预览仍用这里的行数，好让蒙版格子对齐 |
| `grid.along` | 沿行方向的蒙版格数 |
| `chain` | 自然生长链，头是 A，尾是 D。B、C 可以拿掉，也可以插入 `X1` 这种阶段 |
| `stages[]` | `id` O / A / B / C / D / E（以及插入的 id）。`days` 游戏日。`kind` 是 `idle` / `growth` / `post`。`color` `canopy` `roughness` `cover` `plantScale` 是地面和植株。`ridge` 为 `null` 时用文档上的连锁截面 |
| `stages[].variants[]` | 同阶段变体。`auto: true` 的会按边表自己出现（O3、D1、D2）。可选作业只改 `variant`，不重置阶段时钟 |
| `ridge` / `variant.ridge` | 控制点 `{x, y}`。`x` 为 0..1，横跨一条垄；`y` 为高度米。工坊用分段平滑插值 |
| `plant` | `shape` 是 `plantGeometry` 的 `bush` / `ear` / `stalk` / `tuft` / `rosette`。`height` `along` `row` 以及 `young` `ripe` `stub` |
| `transition` | `template`：`instant` 瞬间，`scatter` 散点，`sweep` 沿行推进。`span`：`full` 铺满整个阶段，`window` 只用结束前的 `windowDays` |
| `ops[]` | `kind`：`required` 必要（播种、收割），`optional` 可选，`special` 特殊（翻地、清田、预留复播）。`writesMask` 播种写下 M。`locksUnswept` 播种结束时把 M 外锁住。`breaksMask` 拆蒙版。`sweepDays` 扫完整趟要的游戏日。`reserved: true` 的作业只有对应边启用才出现 |
| `edges[]` | 显式边。`when`：`natural` 到点，`auto` 久置或过熟，`process` 要农机扫过。`via` 对上 `ops.via`。`from: "*"` 表示任何阶段。默认启用 `E → O`（`via: clear`）。预留 `E → A`（`via: resow`，`enabled: false`） |
| `machines` | 每台占位农机的 `sweepHead` / `sweepTail`，单位米，相对车体原点，正值在车头一侧。扫过的格子在车头点经过时改面。车尾只预留给主进程 |
| `hooks.cancelWorkOrder` | 字符串 `cancelWorkOrder` |

O 放满自己的 `days` 变成 O3。中耕、撒石灰会把变体改成 O1、O2，并从这次作业重新计算久置。D 放满 `days` 还不收，变成 D1，再放满 D1 的 `days` 变成 D2。E 不会自己离开，要走边上的流程。
