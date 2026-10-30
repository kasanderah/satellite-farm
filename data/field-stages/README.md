# 田间阶段配置

主游戏种植只读 **拉斯提卡**。文档是 `data/field-stages/lastika.json`（`profile: lastika`，`cropId: lastika`）。工坊「田间 → 阶段编辑器」打开就是这份。保存仍用 `ringsheaf.assetlab.fieldStages.v1`，信封 `cropId` 是 `lastika`，文档在 `crops.lastika`。

可玩页 `index.html` 刷新，或管理里点「重读工坊」，就编译这一份：阶段名、软窗、田面色、生长钟。没有工坊档、地址栏 `?stages=repo`、或点「仓库默认」，用仓库里的 `lastika.json`。码头标 **工坊覆写** 或 **仓库默认**。

整地不在这条链里。清地 → 一般田地是和种植平级的配方，不要写回旧的 O→A 商品薯日历。

`potato-b.json` 只作归档。**主游戏不用。**

## 打开

1. 构建过一次的话，直接打开 `asset-lab.html`。
2. 改过 `src/` 之后：`node build.mjs asset-lab`。
3. 左侧 **田间 → 阶段编辑器**。默认作物是拉斯提卡。

预览是一块 36 × 28 m 的田。`rows` 条垄铺进这块宽里。`plant.row` 仍是农艺行距，给主进程用。

## 拉斯提卡怎么进主游戏

`lastikaSpecFromDoc` 只取序列组：

| 组 | 主游戏 |
| --- | --- |
| A | 硬作业播种 |
| B | 生长钟的天数来源。`days` 是世界日，写进阶段图的头阶段。1× 下一世界日 = 720 现实秒（12 现实分钟）。可选作业的窗口挂在头阶段上，不改阶段色 |
| D | 硬作业收割 |
| E | 硬作业收拾 |

O 留在编辑器里，表示种植链的空档，不是犁地。软作业过窗可失败并挂起，不锁田。硬作业锁到做完。追肥、培土的 `surface` 是 `none`，做完不改田面。

田面色读阶段和植株：未整地用 O 的 `color`，幼苗用 `plant.young`，成熟用 `plant.ripe`，残茬用 `plant.stub`。一般田地是犁完的深土，不从这份日历里取。

## 编辑器

- 序列组 O、A、B、D、E 必须有，各一个。C 和中间段（M）可以加减，插在 B 与 C 之间。
- 阶段名和 id 都能改。id 改了会改写作业的 `stage` 和边。
- 阶段内作业可上移下移。色条从上到下就是执行顺序。
- 硬 / 软：软作业带窗口；硬作业锁到做完。
- 田面三类：色、植株、垄截面。旁边有问号。作业可以选「不影响」。
- 自然阶段的散点、推进、窗口天数仍可用。

## 主进程怎么读

```js
import { parseFieldStageDoc } from './src/field-stages.js';
const doc = parseFieldStageDoc(JSON.parse(text));
```

`text` 是 `data/field-stages/lastika.json`，或工坊下载的 `field-stage-lastika.json`。浏览器里的另一份在 `localStorage` 键 `ringsheaf.assetlab.fieldStages.v1`。

用同一个来源打开两页时，工坊「保存」和可玩页看见的是同一份。直接双击两个 html（`file://`）时，Chrome 把每个文件当成不同来源。那种打开方式从工坊下载 JSON，再到可玩页「导入文件」或粘贴。贴上商品薯甘特会被拒绝。

## 字段

| 字段 | 含义 |
| --- | --- |
| `schema` | `ringsheaf.field-stage/1` |
| `cropId` / `logicId` | 拉斯提卡是 `lastika` / `crop_lastika` |
| `cropName` / `name` | 显示名。主游戏浮标用它 |
| `timeUnit` | `gameDay`。`secondsPerDayAt1x` 与世界钟对齐：1× 下 1 世界日 = 720 现实秒 |
| `rows` / `grid.along` | 垄行数，沿行蒙版格数 |
| `chain` | 自然生长链。拉斯提卡是 A、B、D |
| `stages[]` | `group` 是 O / A / B / C / D / E / M。`color` `canopy` `roughness` `cover` `plantScale` 是地面和植株。`ridge` 为 `null` 时用文档上的连锁截面 |
| `plant` | `shape`、`height`、`along`、`row`，以及 `young` `ripe` `stub` |
| `transition` | `instant` / `scatter` / `sweep`，`span` 为 `full` 或 `window` |
| `ops[]` | `required` 是硬作业，`optional` 是软作业，`special` 是收拾这类边。`surface`：`color` 色、`plant` 植株、`ridge` 垄截面、`none` 不影响。`window` 是阶段内的软窗 |
| `edges[]` | `natural` 到点，`process` 要农机扫过 |

`alignFieldCalendar` 把生长链从 A 排到 D。`jobWindows` 给每道工一个窗口。序列组是 `stage.group`，不是冻结的阶段 id。

## 归档：土豆 B

`data/field-stages/potato-b.json` 的 `profile` 是 `potato-b`。**主游戏不用。** 可玩页启动、重读工坊、仓库默认都不会装它。工坊若仍能在下拉里看到，只作对照，不进种植菜单。
