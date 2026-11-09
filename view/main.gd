extends Control

const Catalog = preload("res://data/catalog.gd")
const Commands = preload("res://sim/commands.gd")
const GameState = preload("res://state/game_state.gd")
const GridViewScript = preload("res://view/grid_view.gd")
const HudScript = preload("res://view/hud.gd")
const Spatial = preload("res://sim/spatial.gd")

var state: Dictionary = {}
var grid_view: Control
var hud: VBoxContainer
var tool := ""
var mode := ""
var mech_id := -1
var turret_id := -1
var push_dir := Vector2i(1, 0)
var selected := Vector2i(-1, -1)
var last_reason := ""
var enemy_wait := 0.0


func _ready() -> void:
	state = GameState.new_game(1)
	_apply_theme()
	_build()
	grid_view.setup(state)
	_refresh([])


func _process(delta: float) -> void:
	if state.is_empty():
		return
	var events: Array = []
	var phase := str(state.phase)
	var stepped := {}
	if phase == "peace" or phase == "warning":
		stepped = Commands.advance(state, delta)
		events = stepped.events
	elif phase == "combat" and state.combat != null and str(state.combat.side) == "enemy":
		enemy_wait += delta
		if enemy_wait >= 0.42:
			enemy_wait = 0.0
			stepped = Commands.apply(state, {"type": "step_enemy"})
			events = stepped.events
			if not bool(stepped.ok):
				last_reason = str(stepped.reason)
	_refresh(events)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_SPACE and str(state.phase) == "combat":
			_on_action("end_turn")
		elif event.keycode == KEY_ESCAPE:
			_on_action("cancel")
		elif event.keycode == KEY_P:
			_on_action("pause")


func _build() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = Color("1b1e22")
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		margin.add_theme_constant_override(side, 12)
	add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(row)
	var board := VBoxContainer.new()
	board.add_theme_constant_override("separation", 6)
	row.add_child(board)
	var title := Label.new()
	title.text = "武装城市    海域在北，城区在南（岸线朝向是占位）"
	board.add_child(title)
	grid_view = GridViewScript.new()
	board.add_child(grid_view)
	grid_view.cell_pressed.connect(_on_cell)
	var legend := Label.new()
	legend.text = "色块：指 指挥中心　升 升降网格　轻 轻质网格　宅 电 库 炮　甲 机体　礁/盐/渊 怪物　骸 覆盖"
	legend.add_theme_font_size_override("font_size", 13)
	board.add_child(legend)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(460, 0)
	row.add_child(scroll)
	hud = HudScript.new()
	hud.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(hud)
	hud.setup()
	hud.action_requested.connect(_on_action)


func _on_action(action: String) -> void:
	if action == "cancel":
		tool = ""
		mode = ""
		last_reason = ""
		return
	if action.begins_with("tool:"):
		tool = action.substr(5)
		mode = ""
		last_reason = "点击城区格子放置。"
		return
	if action.begins_with("dir:"):
		match action:
			"dir:e":
				push_dir = Vector2i(1, 0)
			"dir:w":
				push_dir = Vector2i(-1, 0)
			"dir:s":
				push_dir = Vector2i(0, 1)
			"dir:n":
				push_dir = Vector2i(0, -1)
		last_reason = "推动方向已设为 %s。" % action.substr(4)
		return
	if action.begins_with("mode:"):
		mode = action.substr(5)
		tool = ""
		if mode == "move" or mode == "attack":
			var mech := _deployed_mech()
			if not mech.is_empty():
				mech_id = int(mech.id)
		elif mode == "fire" or mode == "fire_push":
			var weapon := _first_weapon()
			if not weapon.is_empty():
				turret_id = int(weapon.id)
		last_reason = "再点击目标格。"
		return
	if action.begins_with("labor:"):
		var parts := action.split(":")
		if parts.size() >= 4:
			_run({
				"type": "assign_labor",
				"crew_id": int(parts[1]),
				"kind": parts[2],
				"target_id": int(parts[3]),
			})
		return
	match action:
		"pause":
			_run({"type": "set_clock", "paused": true, "scale": float(state.clock.scale)})
		"speed1":
			_run({"type": "set_clock", "paused": false, "scale": 1.0})
		"speed2":
			_run({"type": "set_clock", "paused": false, "scale": 2.0})
		"warn":
			_run({"type": "start_warning"})
		"engage":
			_run({"type": "begin_combat"})
		"upgrade":
			_run({"type": "upgrade_cc"})
		"recruit":
			_run({"type": "recruit_pilot"})
		"order_mech":
			_run({"type": "order_mech"})
		"end_turn":
			_run({"type": "end_turn"})
		"deploy":
			var ready := _ready_mech()
			if ready.is_empty():
				last_reason = "没有可部署的机体。"
			else:
				_run({"type": "deploy_mech", "mech_id": int(ready.id), "x": selected.x, "y": selected.y})
		"push":
			var mech := _deployed_mech()
			if mech.is_empty():
				last_reason = "先让机体出场，或点选场上的机体。"
			else:
				_run({
					"type": "mech_push",
					"mech_id": int(mech.id),
					"dir_x": push_dir.x,
					"dir_y": push_dir.y,
				})
		"recall":
			var mech := _deployed_mech()
			if mech.is_empty():
				last_reason = "没有在场机体。"
			else:
				_run({"type": "recall_mech", "mech_id": int(mech.id)})
		"blast":
			var mech := _deployed_mech()
			if mech.is_empty():
				last_reason = "没有在场机体。"
			else:
				_run({"type": "blast_recover", "mech_id": int(mech.id)})


func _on_cell(x: int, y: int) -> void:
	selected = Vector2i(x, y)
	var phase := str(state.phase)
	if tool != "" and (phase == "peace" or phase == "warning"):
		var kind := "place_grid" if tool == "light" or tool == "lift" else "place_building"
		_run({"type": kind, "def_id": tool, "x": x, "y": y})
		return
	if phase == "combat" and state.combat != null and str(state.combat.side) == "player":
		if mode == "move" and mech_id >= 0:
			_run({"type": "move_mech", "mech_id": mech_id, "x": x, "y": y})
			return
		if mode == "attack" and mech_id >= 0:
			_run({"type": "mech_attack", "mech_id": mech_id, "x": x, "y": y})
			return
		if (mode == "fire" or mode == "fire_push") and turret_id >= 0:
			_run({
				"type": "turret_fire",
				"building_id": turret_id,
				"x": x,
				"y": y,
				"mode": "push" if mode == "fire_push" else "damage",
				"dir_x": push_dir.x,
				"dir_y": push_dir.y,
			})
			return
	var mech := Spatial.mech_at(state, x, y)
	if not mech.is_empty():
		mech_id = int(mech.id)
		last_reason = "已选中机体。"
	var weapon := _weapon_at(x, y)
	if not weapon.is_empty():
		turret_id = int(weapon.id)
		if mech.is_empty():
			last_reason = "已选中炮台。"


func _run(cmd: Dictionary) -> void:
	var result := Commands.apply(state, cmd)
	if bool(result.ok):
		last_reason = ""
		_refresh(result.events)
	else:
		last_reason = str(result.reason)
		_refresh([])


func _refresh(events: Array) -> void:
	if grid_view == null or hud == null:
		return
	grid_view.sync(state, _marks())
	if not events.is_empty():
		grid_view.play(events)
	hud.refresh(_view_model())


func _marks() -> Dictionary:
	var move: Array = []
	var attack: Array = []
	var reach: Array = []
	if state.combat != null:
		var rows: Array = state.combat.intents if str(state.combat.side) == "player" else state.combat.queue
		for intent in rows:
			if typeof(intent) != TYPE_DICTIONARY or not bool(intent.get("visible", true)):
				continue
			if typeof(intent.get("move")) == TYPE_DICTIONARY:
				move.append("%d,%d" % [int(intent.move.x), int(intent.move.y)])
			if typeof(intent.get("attack")) == TYPE_DICTIONARY:
				attack.append("%d,%d" % [int(intent.attack.x), int(intent.attack.y)])
	if mode == "move" and mech_id >= 0:
		var mech := Spatial.mech_by_id(state, mech_id)
		if str(mech.get("status", "")) == "deployed":
			var dist := Spatial.reachable(state, int(mech.x), int(mech.y), "land", [[0, 0]], int(mech.move), {"mech_ids": [mech_id]})
			for key in dist.keys():
				if int(dist[key]) > 0:
					reach.append(str(key))
	return {
		"selected": "" if selected.x < 0 else "%d,%d" % [selected.x, selected.y],
		"move": move,
		"attack": attack,
		"reach": reach,
	}


func _view_model() -> Dictionary:
	var econ: Dictionary = state.economy
	var cap := Spatial.housing_capacity(state)
	var phase := str(state.phase)
	var status := "金钱 %d    人口 %d/%d    士气 %d    科研 %d" % [
		int(econ.money), int(econ.population), cap, int(econ.morale), int(econ.research)
	]
	var clock := "暂停" if bool(state.clock.paused) else "%d 倍" % int(state.clock.scale)
	var detail := "阶段 %s　%s　%s" % [phase, clock, _phase_detail()]
	detail += "\n" + _power_line()
	detail += "\n" + _rule_line()
	if int(state.campaign.segments_cleared) > 0:
		detail += "\n清理验收：已清 %d 段。这不是胜利条件。" % int(state.campaign.segments_cleared)
	return {
		"banner": _banner(),
		"hint": _hint(),
		"status": status,
		"detail": detail,
		"reason": last_reason,
		"inspector": _inspect(),
		"intents": _intent_text(),
		"log": "\n".join(state.log),
		"actions": _actions(),
		"labor": _labor_actions(),
		"signature": _signature(),
	}


func _banner() -> String:
	if str(state.phase) == "bad_end":
		return "Bad End：核心被摧毁，全城与入侵者同归于尽。这不是胜利。"
	if bool(state.campaign.evaluated) and state.campaign.evaluation != null:
		var score: Dictionary = state.campaign.evaluation
		return "评定　人口 %s　伤亡 %s　网格 %d/%d　设施 %d/%d　机师在册 %d　失联 %d。尸骸剩余 %d，不影响评定。" % [
			str(score.population), str(score.casualties),
			int(score.grid_hp), int(score.grid_max),
			int(score.building_hp), int(score.building_max),
			int(score.pilots_accounted), int(score.pilots_unaccounted),
			int(score.cover_segments_left),
		]
	return "切片占位数值。同一张棋盘，和平建设，海上接敌后进入回合。"


func _hint() -> String:
	match str(state.phase):
		"peace":
			return "可暂停。轻质网格便宜但只有一个槽；升降网格较慢，能同时放和平建筑和炮台，并作为部署口。住房下沉后仍算数。清尸只在和平时间进行，清完也不是通关。"
		"warning":
			return "预警中仍可建设。倒计时结束，或点「提前迎击」，敌人会出现在海域并开始回合。"
		"combat":
			if state.combat != null and str(state.combat.side) == "enemy":
				return "敌方正在执行刚才看到的意图。攻击锁在格子上，不会临时改瞄。"
			return "黄框是敌方下一步，红框是攻击格。绿框是机体可达格。炮台手动开火，立即结算，每轮一次，并锁定已用功率。T1 之后士气会下降。"
		"bad_end":
			return "失败只来自核心被摧毁。走进中心格本身不是失败。"
		_:
			return ""


func _phase_detail() -> String:
	if str(state.phase) == "warning" and state.warning != null:
		return "%s　%.0f 秒" % [str(state.warning.wave_name), float(state.warning.seconds_left)]
	if str(state.phase) == "combat" and state.combat != null:
		var side := "玩家" if str(state.combat.side) == "player" else "敌方"
		return "第 %d 回合　%s　T1=%d" % [int(state.combat.round), side, int(state.combat.t1)]
	if float(state.campaign.recovery_left) > 0.0:
		return "恢复窗口 %.0f 秒" % float(state.campaign.recovery_left)
	if not bool(state.campaign.started):
		return "距离自动预警 %.0f 秒" % maxf(0.0, float(state.campaign.auto_arm_at) - float(state.clock.seconds))
	return "波次 %d/%d" % [mini(int(state.campaign.wave_index) + 1, state.campaign.waves.size()), state.campaign.waves.size()]


func _power_line() -> String:
	var cap := Spatial.power_capacity(state)
	if state.combat == null:
		return "功率容量 %d（行动后才会锁定本轮用量）" % cap
	return "功率 %d/%d　%s" % [
		int(state.combat.power_spent), cap,
		"本轮已锁定" if bool(state.combat.power_locked) else "本轮未锁定",
	]


func _rule_line() -> String:
	var peace := "爆破会摧毁地下和平槽" if bool(state.rules.blast_destroys_peace_slot) else "爆破保留地下和平槽"
	var spill := "破壁会溢伤核心" if bool(state.rules.overflow_damage) else "破壁不溢伤核心"
	return "待定参数当前取值：%s；%s。离场和落水只记录结果，救援表示离场且受损，驾驶员不保证生还。" % [peace, spill]


func _intent_text() -> String:
	if state.combat == null:
		return "和平时期没有战斗意图。"
	var rows: Array = state.combat.intents if str(state.combat.side) == "player" else state.combat.queue
	if rows.is_empty():
		return "没有待执行的意图。"
	var lines: Array = []
	for intent in rows:
		if typeof(intent) != TYPE_DICTIONARY:
			continue
		if not bool(intent.get("visible", true)):
			lines.append("%s：未侦测" % str(intent.get("name", "敌人")))
			continue
		var move := ""
		if typeof(intent.get("move")) == TYPE_DICTIONARY:
			move = " →(%d,%d)" % [int(intent.move.x), int(intent.move.y)]
		var attack := ""
		if typeof(intent.get("attack")) == TYPE_DICTIONARY:
			attack = " 攻(%d,%d)" % [int(intent.attack.x), int(intent.attack.y)]
		lines.append("%s%s%s　%s　伤害 %d" % [str(intent.get("name", "")), move, attack, str(intent.get("note", "")), int(intent.get("damage", 0))])
	return "\n".join(lines)


func _inspect() -> String:
	if selected.x < 0:
		return "尚未选择格子。"
	var cell := Spatial.cell_at(state, selected.x, selected.y)
	if cell.is_empty():
		return "超出棋盘。"
	var lines: Array = ["(%d,%d) %s / %s" % [selected.x, selected.y, str(cell.region), str(cell.terrain)]]
	if Spatial.is_cc(state, selected.x, selected.y):
		var cc: Dictionary = state.command_center
		lines.append("指挥中心　外壁 %d/%d　核心 %d/%d　升级 %d" % [int(cc.wall_hp), int(cc.wall_max), int(cc.core_hp), int(cc.core_max), int(cc.upgrade_level)])
	var grid := Spatial.grid_at(state, selected.x, selected.y)
	if not grid.is_empty():
		var def := Spatial.grid_def_for(grid)
		var port := "部署口" if bool(def.get("deploy_port", false)) else "无部署口"
		var sunk := "已下沉" if bool(grid.submerged) else "在地表"
		lines.append("%s　耐久 %d/%d　%s　%s" % [str(def.get("name", "")), int(grid.hp), int(grid.max_hp), port, sunk])
		if float(grid.construct_remaining) > 0.0:
			lines.append("网格施工剩余 %.1f 秒" % float(grid.construct_remaining))
		for slot in grid.slots:
			if int(slot.building_id) < 0:
				lines.append("%s槽：空" % str(slot.role))
				continue
			var building := Spatial.building_by_id(state, int(slot.building_id))
			var bdef := Catalog.building(str(building.def_id))
			var exposed := "露出" if Spatial.facility_exposed(state, building) else "避难"
			lines.append("%s槽：%s %d/%d %s" % [str(slot.role), str(bdef.name), int(building.hp), int(building.max_hp), exposed])
	var monster := Spatial.monster_at(state, selected.x, selected.y)
	if not monster.is_empty():
		lines.append("%s　生命 %d/%d　%s" % [str(monster.name), int(monster.hp), int(monster.max_hp), str(monster.movement)])
	var mech := Spatial.mech_at(state, selected.x, selected.y)
	if not mech.is_empty():
		lines.append("机体 %s　生命 %d/%d" % [str(mech.name), int(mech.hp), int(mech.max_hp)])
	for cover in state.covers:
		for segment in cover.segments:
			if bool(segment.cleared):
				continue
			if int(segment.x) == selected.x and int(segment.y) == selected.y:
				lines.append("%s覆盖　剩余工时 %.1f" % [str(cover.name), float(segment.work_remaining)])
	if lines.size() == 1:
		lines.append("空地。")
	return "\n".join(lines)


func _actions() -> Array:
	var phase := str(state.phase)
	var actions: Array = []
	if phase == "bad_end":
		return actions
	if phase == "peace" or phase == "warning":
		actions.append_array([
			{"id": "pause", "text": "暂停"},
			{"id": "speed1", "text": "1 倍"},
			{"id": "speed2", "text": "2 倍"},
			{"id": "tool:light", "text": "铺轻质网格"},
			{"id": "tool:lift", "text": "铺升降网格"},
			{"id": "tool:housing_light", "text": "轻住宅"},
			{"id": "tool:housing", "text": "集合住宅"},
			{"id": "tool:power", "text": "街角电厂"},
			{"id": "tool:hangar", "text": "机库"},
			{"id": "tool:turret_light", "text": "轻炮位"},
			{"id": "tool:turret", "text": "城防炮"},
			{"id": "recruit", "text": "招募驾驶员"},
			{"id": "order_mech", "text": "开工机体"},
			{"id": "upgrade", "text": "升级指挥中心"},
			{"id": "cancel", "text": "取消选择"},
		])
		if phase == "peace" and not bool(state.campaign.evaluated):
			actions.append({"id": "warn", "text": "开始预警"})
		if phase == "warning":
			actions.append({"id": "engage", "text": "提前迎击"})
	elif phase == "combat" and state.combat != null and str(state.combat.side) == "player":
		actions.append_array([
			{"id": "end_turn", "text": "结束回合"},
			{"id": "mode:move", "text": "移动机体"},
			{"id": "mode:attack", "text": "机体近战"},
			{"id": "push", "text": "按方向推动"},
			{"id": "mode:fire", "text": "炮台射击"},
			{"id": "mode:fire_push", "text": "炮台推动"},
			{"id": "dir:n", "text": "方向 北"},
			{"id": "dir:s", "text": "方向 南"},
			{"id": "dir:w", "text": "方向 西"},
			{"id": "dir:e", "text": "方向 东"},
			{"id": "deploy", "text": "部署到所选格"},
			{"id": "recall", "text": "部署口撤离"},
			{"id": "blast", "text": "爆破回收"},
			{"id": "cancel", "text": "取消选择"},
		])
	return actions


func _labor_actions() -> Array:
	if str(state.phase) == "combat" or str(state.phase) == "bad_end":
		return [{"id": "noop", "text": "战斗中工班冻结"}]
	var rows: Array = []
	for crew in state.labor.crews:
		var task: Dictionary = crew.task
		rows.append({
			"id": "labor:%d:idle:-1" % int(crew.id),
			"text": "工班 %d 当前 %s → 改空闲" % [int(crew.id), str(task.kind)],
		})
		for cover in state.covers:
			if Spatial.uncleared_segments(cover) <= 0:
				continue
			rows.append({
				"id": "labor:%d:clear_cover:%d" % [int(crew.id), int(cover.id)],
				"text": "工班 %d 清理 %s" % [int(crew.id), str(cover.name)],
			})
		for mech in state.mechs:
			if str(mech.status) != "building":
				continue
			rows.append({
				"id": "labor:%d:build_mech:%d" % [int(crew.id), int(mech.id)],
				"text": "工班 %d 建造 %s（剩 %.0f）" % [int(crew.id), str(mech.name), float(mech.build_remaining)],
			})
	return rows


func _signature() -> String:
	var parts: Array = [str(state.phase), tool, mode, str(mech_id), str(turret_id), str(push_dir)]
	if state.combat != null:
		parts.append(str(state.combat.side))
		parts.append(str(state.combat.round))
	parts.append(str(state.campaign.evaluated))
	parts.append(str(state.covers.size()))
	parts.append(str(state.mechs.size()))
	for crew in state.labor.crews:
		parts.append(str(crew.task.kind))
		parts.append(str(crew.task.target_id))
	return "|".join(parts)


func _ready_mech() -> Dictionary:
	if mech_id >= 0:
		var chosen := Spatial.mech_by_id(state, mech_id)
		if str(chosen.get("status", "")) == "ready":
			return chosen
	for mech in state.mechs:
		if str(mech.status) == "ready":
			return mech
	return {}


func _deployed_mech() -> Dictionary:
	if mech_id >= 0:
		var chosen := Spatial.mech_by_id(state, mech_id)
		if str(chosen.get("status", "")) == "deployed":
			return chosen
	for mech in state.mechs:
		if str(mech.status) == "deployed":
			return mech
	return {}


func _first_weapon() -> Dictionary:
	for building in state.buildings:
		var def := Catalog.building(str(building.get("def_id", "")))
		if def.is_empty() or str(def.role) != "weapon":
			continue
		if Spatial.facility_exposed(state, building):
			return building
	return {}


func _weapon_at(x: int, y: int) -> Dictionary:
	var grid := Spatial.grid_at(state, x, y)
	if grid.is_empty():
		return {}
	for slot in grid.slots:
		if int(slot.building_id) < 0:
			continue
		var building := Spatial.building_by_id(state, int(slot.building_id))
		var def := Catalog.building(str(building.get("def_id", "")))
		if not def.is_empty() and str(def.role) == "weapon":
			return building
	return {}


func _apply_theme() -> void:
	var font := FontFile.new()
	var err := font.load_dynamic_font("res://assets/fonts/wqy-microhei.ttc")
	var theme := Theme.new()
	if err == OK:
		theme.default_font = font
	else:
		var system := SystemFont.new()
		system.font_names = PackedStringArray(["WenQuanYi Micro Hei", "Noto Sans CJK SC", "Droid Sans Fallback"])
		theme.default_font = system
	theme.default_font_size = 15
	self.theme = theme

