# 存档契约 v1

朋友试玩只开本分支的 `index.html`。资产工坊不是给玩家的，不打开也能种、能存。存档只在这台浏览器里。换浏览器、换 `file://` 和 `http://` 来源，都看不到同一份。

离开页面时游戏会把当前局写回去。地址栏加 `?fresh=1` 是故意不读旧档，离开时仍会写回，试玩不要加。

## 版本

农场存档是一个 JSON 对象。

- `schema` 仍是 `2`。它表示这份快照的形状，测试和旧读入都认它。
- `saveVersion` 是给试玩的整数版本。这一版是 `1`。写入时盖上。读入时先走 `migrateSave`，再 `applySnapshot`。

`src/save-contract.js`：

```js
migrateSave(raw) → { ok, data, wipedKeys }
```

- `ok`：这份能迁进当前版本。
- `data`：迁完的对象。`ok` 为假时是 `null`。函数不改传入的 `raw`。
- `wipedKeys`：这次迁移删掉的键路径。v1 不删键，所以是 `[]`。
- `reason` 可选，只给读入方看：`shape`、`version`、`future`、`schema`。

规则：

| 读到的档 | 结果 |
| --- | --- |
| 没有 `saveVersion`，`schema` 是 2，`kind` 是 `farm-snapshot`，`fields` 是数组 | 迁到 v1：浅拷贝并写上 `saveVersion: 1`。键都留着。 |
| `saveVersion` 是整数 `1`，形状同上 | 原样返回，`wipedKeys` 为 `[]`。 |
| `saveVersion` 大于 1 | `ok: false`。不读入，也不写回。 |
| 不是对象、版本不是正整数、`schema` / `kind` / `fields` 对不上 | `ok: false`。不抛错。 |

读不了时打开管理里的 **重开**。**清空** 走现在的重开，写下 v1 新局。**留下** 不改浏览器里的那份，这一局的后续操作也不写回去。

升到 v2 时，在 `migrateSave` 里从 1 走到 2，删掉的键放进 `wipedKeys`。不要在读入半路把旧档盖成新局。

## 浏览器里的钥匙

| localStorage 键 | 谁写的 | 试玩要不要 | 升 `saveVersion` 时 |
| --- | --- | --- | --- |
| `ringsheaf.nongshen8.v1` | 可玩页 `saveNow` | 要。这就是农场存档 | 只迁这一份。读不了就整份留下，等玩家清空 |
| `ringsheaf.admin.pos` | 管理面板拖动位置 | 可有可无 | 不进契约。丢了只是面板回到默认位置 |
| `ringsheaf.assetlab.fieldStages.v1` | 工坊「保存」 | 不要。玩家不开工坊就用仓库里的 `potato-b.json` | 不进农场存档，升版本不动它 |
| `ringsheaf.assetlab.briefs` | 工坊备注 | 不要 | 不动 |

工坊阶段和农场存档是两把钥匙。朋友的土豆钟、田里的 `plantedAt` 和作业进度在农场存档里。阶段天数表不在农场存档里，随这一版代码走。

## 农场存档里的键

下面都在 `exportSnapshot()` 里。v0 → v1 的策略全是 **留**。`wipedKeys` 为空。

| 键 | 现在存什么 | 升版本 |
| --- | --- | --- |
| `schema` | 固定 `2` | 留。形状号，不是 `saveVersion` |
| `saveVersion` | 整数 `1`。旧档没有，迁移时补上 | 留 |
| `kind` | `farm-snapshot` | 留 |
| `plotId` | `nongshen-viii/plot-01`。对不上就不读入 | 留 |
| `worldDay` | 世界钟，单位是世界日 | 留 |
| `simTime` | 和 `worldDay` 同一个数 | 留 |
| `timeScale` | 管理里的倍率。暂停不进存档，重开页面是在走 | 留 |
| `revenue` | 营收 | 留 |
| `stores` | 商店存货，见下表 | 留 |
| `warehouse` | 入仓批次，整份拷贝 | 留 |
| `keepBuildings` | `true`。没有它时，读入会把三座开局仓棚补回来 | 留 |
| `buildings` | 仓棚、车库、加工棚、无人机基站等。田上的棚会挪回中枢 | 留 |
| `devices` | 培育层加工厂。读入只恢复 `kind === 'mill'` | 留在文件里。读入时丢掉不是加工厂的项 |
| `tanks` | 四口培养槽：物种、开工日、是否照料过、所在地块 | 留。缺这组就清空培养槽 |
| `fields` | 玩家地块，见下表。邻区冻结田不写 | 留 |
| `fleet` | 买来的农机，只要 `kind`。开局四台不在这里 | 留。读入先收回多出来的，再按种类加回去 |
| `workDrones` | 买来的侦察 / 植保无人机，只要 `kind` | 留。读入停回基站 |
| `harvesters` | 演示收割机的位置和模式 | 留在文件里。读入不看这组，另做演示机 |

`stores` 的键，都 **留**：`seed`（种薯）、`fertilizer`、`spray`、`feed`、`peel`、`frass`、`seed_soy`、`seed_barley`、`seedling_cabbage`。缺了按 0，饲料缺了按开局的 2。

`warehouse` 每一批现在有：`id`、`crop`、`name`、`kind`、`liters`、`unit`、`listPrice`、`i`、`j`、`t`。整份留。

`buildings` 每一座：`id`、`kind`、`name`、`x`、`z`、`ang`。留。

`devices` 每一台：`id`、`kind`、`name`、`x`、`z`、`bi`、`bj`、`fi`、`fj`、`startedAt`、`readyAt`、`job`（`startedAt`、`doneAt`、`potato`）。留。

`fields` 每一块：

| 键 | 现在 | 升版本 |
| --- | --- | --- |
| `i` `j` | 田块坐标 | 留 |
| `crop` `dir` | 作物下标、垄向 | 留 |
| `state` `g` `s` `timer` `growT` | 画面阶段和作业前沿 | 留 |
| `live` `hold` `paid` `sprayed` | 在种、待收、已入仓、打过药 | 留 |
| `plantedAt` | 钟的起点。土豆是薯播写完蒙版的世界日；空是还没起钟。别的作物是第一趟作业开工 | 留 |
| `planSeq` | 规划顺序 | 留 |
| `cycle` `autoBuy` | 循环种植、自动买物资 | 留 |
| `failed` | 烂在地里等原因；没有就是 `null` | 留 |
| `harvested` `stored` | 已收、已入仓 | 留 |
| `yieldFactor` | 错过必做作业之后的产量系数 | 留 |
| `jobs` | 每道作业走到第几垄，键是作业 id | 留。读入时按当前作物把缺的作业补 0 |

机器正在走的那一趟不进存档。读入后农机回库、电量和仓里的货清空，田上的 `jobs` 还在，下一趟从那里接着走。电量、暂停、相机、流水账都不写。

## 这一版已经在盘上的东西

还没有 `saveVersion` 的档，就是现在的 `schema: 2` 快照。第一次用这一版打开，迁移补上 `saveVersion: 1`，钱、仓库、田、`plantedAt`、作业进度、买来的农机和无人机、加工厂、培养槽、世界钟、倍率都还在。下一次 `saveNow` 把盖过版本的那份写回去。
