# 农机编辑器 v1

工坊里的农机草稿。钥匙是 `ringsheaf.assetlab.machines.v1`。主游戏本轮不读这份，种植菜单和派单仍用原来的机具表。

下载的文件和存档是同一个信封：

```json
{
  "kind": "ringsheaf.assetlab.machines",
  "version": 1,
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
      "model": { "source": "placeholder", "fileName": "" }
    }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定钥匙。显示名改不了它。新农机另起 `rig1`、`rig2`… |
| `name` | 显示名 |
| `role` | `tractor` 拖拉机，`implement` 挂具，`self` 一体机 |
| `tags` | 工序里的 machine id，和阶段编辑器的机具下拉同一份 |
| `caps` | 由 tags 推出的调度能力，例如 `cultivate`。不单独手写 |
| `workWidth` | 工作宽度，米。顶视预览和 `lanesForWidth` 用它算 128 m 田上有几趟 |
| `speed` | 作业速度，m/s |
| `power` | 功率，kW。本轮只作记录 |
| `hitch` | 挂接钩子。空着就是还没接 |
| `bin` | 仓容钩子，升。空着就是还没接 |
| `model.source` | `placeholder` 或 `file` |
| `model.fileName` | 导入文件的名字。文件本身不进存档，也不进主游戏 |

占位外形用仓库里已有的 `refs/machines`（Kenney、Pixor 和现用剪影）。正式模型以后向「环穗资产」要新下载再接入。预览优先画顶视的一趟，不换精模。
