extends RefCounted

const GameState = preload("res://state/game_state.gd")

## 失败只认核心被摧毁。站在中心格、士气归零、人口或金钱都不算。

static func reason(state: Dictionary) -> String:
	if int(state.command_center.core_hp) <= 0:
		return "bad_end"
	return ""


static func bad_end(state: Dictionary) -> void:
	if str(state.phase) == "bad_end":
		return
	state.phase = "bad_end"
	state.command_center.core_hp = 0
	state.command_center.core_exposed = true
	GameState.log(state, "Bad End：指挥中心核心被摧毁，全城与入侵者同归于尽。这不是胜利。")
