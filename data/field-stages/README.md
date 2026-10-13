# 田间阶段配置

`parseFieldStageDoc` 读这份结构。可玩进程里大豆、中熟商品薯、结球甘蓝、饲料大麦都用同一份编译：总周期、阶段首尾对齐、阶段内作业窗口。调度只吃窗口。仓库默认是占位文档。`potato-b.json` 是工坊里打开的土豆，重读之后也走这份编译，不再另有一张旧日历。不要在农时里写死「收获后只能回空地」。

生长链从**播种或移栽写完蒙版 M**起算。空地上的作业不启动这口钟。自然边按世界日从这次播种走完。待收获放满进 D1 过熟，再放满进 D2 烂地，到点还没收就烂在地里。侧卸若要写，写在收获作业的 `extensions.note` 里，留在收获机的执行链上，不单列田面阶段。同一阶段里的几道工各记各的进度，窗口相同。

阶段编辑器在这份构建的资产工坊里：打开 `asset-lab.html`，左侧 **田间 → 阶段编辑器**。默认土豆是 `potato-b.json`。保存写入 `ringsheaf.assetlab.fieldStages.v1`。可玩页 `index.html` 读同一把钥匙，刷新或点「重读工坊」后码头标 **工坊覆写**。

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

`text` 可以是 `data/field-stages/potato-b.json`，也可以是工坊下载的 `field-stage-<cropId>.json`。浏览器里的另一份在 `localStorage` 键 `ringsheaf.assetlab.fieldStages.v1`，形状是 `{ schema, cropId, crops: { [cropId]: doc } }`。

可玩页 `index.html` 打开时读这把钥匙。文档的 `cropId`、`logicId`、`profile: potato-b`，或信封里的钥匙 `potato`，对上土豆就用 `parseFieldStageDoc` 换掉土豆的钟、派工、显示名和田面颜色。显示名写在 `cropName`。读不了时管理面板写出原因，不再只说「工坊存档读不了」。没有这份，或地址栏带 `?stages=repo`，就用仓库里的 `potato-b.json`。管理面板标着 **工坊覆写** 或 **仓库默认**，也可以重读、贴上 JSON、导入工坊下载的文件。大豆、大麦、甘蓝不读这把钥匙。

用同一个来源打开两页时，工坊「保存」和可玩页看见的是同一份。例如在仓库根目录 `python3 -m http.server`，然后打开 `http://127.0.0.1:8000/asset-lab.html` 和 `http://127.0.0.1:8000/index.html`。直接双击两个 html（`file://`）时，Chrome 把每个文件当成不同来源，localStorage 不共用。那种打开方式从工坊下载 JSON，再到可玩页「导入文件」或粘贴。

`parseFieldStageDoc` 会补上缺的 E→O / E→A，并按 `chain` 重写自然边。它不推进时钟，也不派农机。

取消进行中的扫田时调用 `cancelWorkOrder(sim, doc)`。文档里的 `hooks.cancelWorkOrder` 只是这个函数名。工坊没有工单队列。

## 字段

| 字段 | 含义 |
| --- | --- |
| `schema` | `ringsheaf.field-stage/1` |
| `cropId` / `logicId` | 对齐 `CROPS.id` 与 `crop_<id>` |
| `cropName` / `name` | 同一个显示名。工坊新建作物时写入，列表用它 |
| `timeUnit` | `gameDay`。`secondsPerDayAt1x` 是工坊 1× 的换算，主进程用自己的世界钟 |
| `rows` | 垄行数，默认全阶段连锁。阶段上的 `rows` 为 `null` 表示继承；写成数字时主进程可以单独用，工坊预览仍用这里的行数，好让蒙版格子对齐 |
| `grid.along` | 沿行方向的蒙版格数 |
| `chain` | 自然生长链，头是 A，尾是 D。B、C 可以拿掉，也可以插入 `X1` 这种阶段 |
| `stages[]` | `id` O / A / B / C / D / E（以及插入的 id）。`days` 游戏日。`kind` 是 `idle` / `growth` / `post`。`color` `canopy` `roughness` `cover` `plantScale` 是地面和植株。`ridge` 为 `null` 时用文档上的连锁截面 |
| `stages[].variants[]` | 同阶段变体。`auto: true` 的会按边表自己出现（O3、D1、D2）。可选作业只改 `variant`，不重置阶段时钟 |
| `ridge` / `variant.ridge` | 控制点 `{x, y}`。`x` 为 0..1，横跨一条垄；`y` 为高度米。工坊用分段平滑插值 |
| `plant` | `shape` 是 `plantGeometry` 的 `bush` / `ear` / `stalk` / `tuft` / `rosette`。`height` `along` `row` 以及 `young` `ripe` `stub` |
| `transition` | `template`：`instant` 瞬间，`scatter` 散点，`sweep` 沿行推进。`span`：`full` 铺满整个阶段，`window` 只用结束前的 `windowDays` |
| `ops[]` | `kind`：`required` 走流程边（播种、收割），`optional` 只改当前阶段的变体、不改阶段，`special` 特殊（翻地、清田、预留复播）。`writesMask` 播种写下 M。`locksUnswept` 播种结束时把 M 外锁住。`breaksMask` 拆蒙版。`sweepDays` 是工坊扫完整趟的游戏日，不是阶段日历。`reserved: true` 的作业只有对应边启用才出现 |
| `ops[].extensions` | 能力、是否必要、无人机、备注。窗口不写在这里，由阶段对齐推出来。见下面「调度」。工坊扫田不读这些字段 |
| `edges[]` | 显式边。`when`：`natural` 到点，`auto` 久置或过熟，`process` 要农机扫过。`via` 对上 `ops.via`。`from: "*"` 表示任何阶段。默认启用 `E → O`（`via: clear`）。预留 `E → A`（`via: resow`，`enabled: false`） |
| `machines` | 每台占位农机的 `sweepHead` / `sweepTail`，单位米，相对车体原点，正值在车头一侧。扫过的格子在车头点经过时改面。车尾只预留给主进程 |
| `hooks.cancelWorkOrder` | 字符串 `cancelWorkOrder` |

O 放满自己的 `days` 变成 O3。中耕、撒石灰会把变体改成 O1、O2，并从这次作业重新计算久置。D 放满 `days` 还不收，变成 D1，再放满 D1 的 `days` 变成 D2。E 不会自己离开，要走边上的流程。

## 调度

玩法不另存一张工单表。`alignFieldCalendar` 把生长链从 A 排到 D，首尾相接，加总等于总周期。O 和 E 必须在，但不进这口钟。对不齐就抛错。

`jobWindows` 给每道工一个窗口。写下蒙版的，或阶段是 O 的，在钟起之前。阶段是 E 的，在收获之后。其余必须落在它写的那个阶段里。待收获上的收获可以盖到 D1、D2，因为过熟和烂地仍是 D。`framework`、`reserved`、阶段 `*` 不进调度。

工坊扫田只看 `kind`、`stage`、`variant`、`via` 和蒙版开关。

| 字段 | 含义 |
| --- | --- |
| `required` | `true` 表示这道工该做。时钟仍然往下走，不等它做完。漏做才扣产量 |
| `impl` / `implAny` / `self` | 后挂具、多选一，或自走机械的 logic id |
| `mode` | 挂具模式，如 `shallow`、`hill`、`residue` |
| `cap` / `caps` | 能力 id。`caps` 是满足其中一项即可 |
| `load` | 装载物，如 `seed`、`fertilizer`、`pest` |
| `drone` | 只派无人机 |
| `auto` | 水网之类自己发生，不派拖拉机 |
| `plant` / `harvest` | 这道工是播种，或收获 |
| `penalty` | 必要工漏做时的缺工系数，默认 0.15 |
| `order` | 同一窗口里的先后 |
| `framework` | `true` 表示编辑器自己的变体或预留边，不进调度 |
| `note` | 给人看的备注 |

## 土豆B

`data/field-stages/potato-b.json` 的 `profile` 是 `potato-b`，`logicId` 仍是 `crop_potato`。工坊里的土豆打开的就是这份。可玩页仓库默认不是这份，是四作物共用的占位链。重读工坊时，这份也按上面的对齐和窗口编译，阶段 id 仍是文档里的 `A`、`emerg`、`hill`、`D`。

侧卸不单列阶段，写在起薯的 `extensions.note`：执行链在收获机侧。

薯播、起薯走流程边。浅中耕、培土、追肥、灌溉、打秧在工坊里只改变体；`extensions.required` 为 `true` 的，玩法里仍算必要工。生长链 A→emerg→hill→bulk→haulm→D 加到 D 之前是 77 日。E→A 仍关着。
