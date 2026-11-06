# 农机编辑器 v2

工坊里的农机草稿。钥匙是 `ringsheaf.assetlab.machines.v1`。可玩页开局读这份，回到这个页面时再读一次。按机具 id 盖在内置表上，不整表替换。

合并：有这份存档时，同 id 的作业宽度、作业速度、仓容盖过内置值。拖拉机模式里出现的挂具 id 会补进播种机和拖拉机的挂具组，不删原有挂具。自走机械按功能对上收获机或移栽机，盖它的幅宽、速度和仓容。内置能力表保持不变，工坊少列一种中耕方式也不会把培土拿掉。速度按 10 m/s 为 1 倍，和主游戏的行驶速度对齐。仓容按 1000 L 算一趟卸，夹在 1 到 20 趟；没填仓容仍用内置趟数。存档缺失、空数组、JSON 坏掉、或 version 比工坊新，都不覆盖，调度继续用内置机具。

下载的文件和存档是同一个信封。`version` 现在是 2。v1 的平铺字段还能读：没有 `modes` 时，每个 tag 收成一个模式；没有 tag 就收成一个未选功能的模式。功率、作业宽度、作业速度、仓容抄进这些模式。`sync` 缺省是全关。

```json
{
  "kind": "ringsheaf.assetlab.machines",
  "version": 2,
  "machines": [
    {
      "id": "impl_cultivator",
      "name": "中耕",
      "role": "implement",
      "tags": ["impl_cultivator"],
      "caps": ["cultivate"],
      "workWidth": 6.4,
      "speed": 10,
      "power": 40,
      "hitch": null,
      "bin": null,
      "sync": { "power": false, "workWidth": false, "speed": false, "bin": false },
      "modes": [
        {
          "id": "m1",
          "fn": "impl_cultivator",
          "power": 40,
          "workWidth": 6.4,
          "speed": 10,
          "bin": null,
          "extra": { "style": "shallow" }
        }
      ],
      "model": { "source": "placeholder", "fileName": "", "libraryId": "" }
    }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定钥匙。显示名改不了它。新农机另起 `rig1`、`rig2`… |
| `name` | 显示名 |
| `role` | `tractor` 拖拉机，`implement` 挂具，`self` 一体机 |
| `modes` | 这台农机的模式。一台可以有多个 |
| `modes[].fn` | 功能，对应工序里的 machine id（播种、收获等）。空着就是还没选 |
| `modes[].power` | 这一模式的功率，kW |
| `modes[].workWidth` | 这一模式的作业宽度，米。顶视预览用当前模式的宽度，`lanesForWidth` 算 128 m 田上有几趟 |
| `modes[].speed` | 这一模式的作业速度，m/s |
| `modes[].bin` | 这一模式的仓容，升。空着就是还没填 |
| `modes[].extra` | 功能特有项。只有该功能有定义时才出现，例如中耕方式、排种盘、收获作物 |
| `sync` | 四个通用属性各自一个勾。勾上表示这台农机所有模式的该项一致，改一处写到其余模式 |
| `tags` / `caps` | 由各模式的 `fn` 推出，和 v1 一样。不单独手写 |
| `workWidth` / `speed` / `power` / `bin` | 第一模式的镜像，方便旧读者。真正要改的是模式里的数 |
| `hitch` | 整机挂接。空着就是还没接 |
| `model.source` | `placeholder`、`library` 或 `file` |
| `model.libraryId` | 从库里选的现用剪影或 `refs/machines` 占位 glb。字节不进存档 |
| `model.fileName` | 导入文件的名字。文件本身不进存档，也不进主游戏 |

可以删除整台农机。列表可以存成空的。占位外形仍用仓库里已有的剪影和 glb，预览画的是顶视趟数，不把模型换进主游戏。
