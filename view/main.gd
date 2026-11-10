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
var focus := ""
var mech_id := -1
var turret_id := -1
var focus_building_id := -1
var push_dir := Vector2i(1, 0)
var selected := Vector2i(-1, -1)
var last_reason := ""
var enemy_wait := 0.0
var turn_label: Label
var title_label: Label
var legend_label: Label
var pixel_scale := 1


func _ready() -> void:
	state = GameState.new_game(1)
	_apply_theme()
	_build()
	grid_view.setup(state)
	_refresh([])
	get_tree().root.size_changed.connect(_fit_pixel_scale)
	call_deferred("_fit_pixel_scale")


func _process(delta: float) -> void:
	if state.is_empty():
		return
	var events: Array = []
	var phase := str(state.phase)
	var stepped := {}
	if phase == "combat" and state.combat != null and str(state.combat.side) == "enemy":
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
		if event.keycode == KEY_SPACE:
			if str(state.phase) == "combat":
				_on_action("end_turn")
			elif str(state.phase) == "peace" or str(state.phase) == "warning":
				_on_action("end_day")
		elif event.keycode == KEY_ESCAPE:
			_on_action("cancel")
		elif event.keycode == KEY_EQUAL or event.keycode == KEY_KP_ADD:
			_step_zoom(1)
		elif event.keycode == KEY_MINUS or event.keycode == KEY_KP_SUBTRACT:
			_step_zoom(-1)


func _input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton) or not event.pressed:
		return
	var button := event as InputEventMouseButton
	if button.button_index != MOUSE_BUTTON_WHEEL_UP and button.button_index != MOUSE_BUTTON_WHEEL_DOWN:
		return
	if grid_view == null or not grid_view.get_global_rect().has_point(button.global_position):
		return
	_step_zoom(1 if button.button_index == MOUSE_BUTTON_WHEEL_UP else -1)
	get_viewport().set_input_as_handled()


func _build() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = Color("1b1e22")
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["margin_left", "margin_top", "margin_right", "margin_bottom"]:
		margin.add_theme_constant_override(side, 8)
	add_child(margin)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(row)
	var board := VBoxContainer.new()
	board.add_theme_constant_override("separation", 6)
	board.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	board.size_flags_vertical = Control.SIZE_EXPAND_FILL
	row.add_child(board)
	title_label = Label.new()
	title_label.text = "武装城市"
	title_label.add_theme_font_size_override("font_size", 20)
	board.add_child(title_label)
	turn_label = Label.new()
	turn_label.text = "和平 1月1日"
	turn_label.add_theme_font_size_override("font_size", 22)
	turn_label.add_theme_color_override("font_color", Color("f2d16b"))
	board.add_child(turn_label)
	var board_scroll := ScrollContainer.new()
	board_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	board_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	board.add_child(board_scroll)
	grid_view = GridViewScript.new()
	grid_view.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	grid_view.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	board_scroll.add_child(grid_view)
	grid_view.cell_pressed.connect(_on_cell)
	legend_label = Label.new()
	legend_label.text = "斜向俯视的占位像素。滚轮或 -/= 缩放。山地不能铺，礁石在海里。"
	legend_label.add_theme_font_size_override("font_size", 13)
	board.add_child(legend_label)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size = Vector2(440, 0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
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
		last_reason = "再点要铺的城区格子。"
		return
	if action.begins_with("build_here:"):
		if selected.x < 0:
			last_reason = "先点一格。"
			return
		_place_at(action.substr(11), selected.x, selected.y)
		return
	if action.begins_with("select_mech:"):
		_select_mech(int(action.substr(12)))
		return
	if action.begins_with("push_now:"):
		_set_dir(action.substr(9))
		_push_selected()
		return
	if action.begins_with("dir:"):
		_set_dir(action.substr(4))
		last_reason = "推动方向已设好。再点目标格。"
		return
	if action.begins_with("mode:"):
		_arm_mode(action.substr(5))
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
		"end_day":
			_run({"type": "end_day"})
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
			mode = ""
			_run({"type": "end_turn"})
		"deploy":
			var ready := _ready_mech()
			if ready.is_empty():
				last_reason = "没有可部署的机体。"
			else:
				mech_id = int(ready.id)
				focus = "mech"
				_run({"type": "deploy_mech", "mech_id": mech_id, "x": selected.x, "y": selected.y})
				if last_reason == "":
					mode = ""
					_select_here(selected.x, selected.y)
					_refresh([])
		"recall":
			var home := _deployed_mech()
			if home.is_empty():
				last_reason = "没有在场机体。"
			else:
				_run({"type": "recall_mech", "mech_id": int(home.id)})
		"blast":
			var blasting := _deployed_mech()
			if blasting.is_empty():
				last_reason = "没有在场机体。"
			else:
				_run({"type": "blast_recover", "mech_id": int(blasting.id)})


func _on_cell(x: int, y: int) -> void:
	var phase := str(state.phase)
	if tool != "" and (phase == "peace" or phase == "warning"):
		_place_at(tool, x, y)
		return
	if _player_turn() and _try_mode(x, y):
		return
	_select_here(x, y)
	mode = ""
	tool = ""
	_refresh([])


func _place_at(def_id: String, x: int, y: int) -> void:
	var kind := "place_grid" if def_id == "light" or def_id == "lift" else "place_building"
	_run({"type": kind, "def_id": def_id, "x": x, "y": y})
	if last_reason == "":
		tool = ""
		mode = ""
		_select_here(x, y)
		_refresh([])


func _try_mode(x: int, y: int) -> bool:
	if mode == "deploy" and mech_id >= 0:
		_run({"type": "deploy_mech", "mech_id": mech_id, "x": x, "y": y})
		if last_reason == "":
			mode = ""
			_select_here(x, y)
			_refresh([])
		return true
	if mode == "move" and mech_id >= 0:
		_run({"type": "move_mech", "mech_id": mech_id, "x": x, "y": y})
		if last_reason == "":
			mode = ""
			_select_here(x, y)
			_refresh([])
		return true
	if mode == "attack" and mech_id >= 0:
		_run({"type": "mech_attack", "mech_id": mech_id, "x": x, "y": y})
		if last_reason == "":
			mode = ""
		return true
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
		if last_reason == "":
			mode = ""
		return true
	return false


func _arm_mode(next: String) -> void:
	tool = ""
	if next == "move" or next == "attack" or next == "push":
		var mech := _deployed_mech()
		if mech.is_empty():
			mode = ""
			last_reason = "先点场上的机体。"
			return
		mech_id = int(mech.id)
		focus = "mech"
		mode = next
		if next == "move":
			last_reason = "再点能去的格子。"
		elif next == "attack":
			last_reason = "再点相邻的怪物。"
		else:
			last_reason = "再点推动方向。"
		return
	if next == "fire" or next == "fire_push":
		if focus_building_id < 0:
			mode = ""
			last_reason = "先点一门炮。"
			return
		turret_id = focus_building_id
		mode = next
		last_reason = "再点射程内的怪物。" if next == "fire" else "可先改方向，再点怪物。"
		return
	mode = ""


func _select_mech(id: int) -> void:
	var mech := Spatial.mech_by_id(state, id)
	if mech.is_empty():
		last_reason = "没有这架机体。"
		return
	mech_id = id
	focus = "mech"
	focus_building_id = -1
	tool = ""
	if str(mech.status) == "ready":
		mode = "deploy"
		last_reason = "已选中待命机体。再点升降网格。"
	elif str(mech.status) == "deployed":
		mode = ""
		selected = Vector2i(int(mech.x), int(mech.y))
		last_reason = "已选中机体。再点动作。"
	else:
		mode = ""
		last_reason = "机体还不能出动。"


func _select_here(x: int, y: int) -> void:
	selected = Vector2i(x, y)
	var phase := str(state.phase)
	var mech := Spatial.mech_at(state, x, y)
	if not mech.is_empty():
		mech_id = int(mech.id)
		focus = "mech"
		focus_building_id = -1
		last_reason = "已选中机体。再点动作。"
		return
	var monster := Spatial.monster_at(state, x, y)
	if not monster.is_empty():
		focus = "monster"
		focus_building_id = -1
		last_reason = ""
		return
	if _player_turn():
		var weapon := _weapon_at(x, y)
		if not weapon.is_empty() and Spatial.facility_exposed(state, weapon):
			turret_id = int(weapon.id)
			focus_building_id = int(weapon.id)
			focus = "building"
			last_reason = "已选中炮台。再点射击或推动。"
			return
	if Spatial.is_cc(state, x, y):
		focus = "cc"
		focus_building_id = -1
		last_reason = ""
		return
	var grid := Spatial.grid_at(state, x, y)
	if not grid.is_empty():
		focus = "grid"
		focus_building_id = _first_building_on(grid)
		if float(grid.construct_remaining) > 0.0:
			last_reason = "网格还在施工。完工后才会出现建筑。"
		elif bool(grid.ruined):
			last_reason = "网格已毁。"
		elif phase == "peace" or phase == "warning":
			last_reason = "点下面的建筑，放到这一格。"
		else:
			last_reason = ""
		return
	focus = "tile"
	focus_building_id = -1
	var cell := Spatial.cell_at(state, x, y)
	if (phase == "peace" or phase == "warning") and str(cell.get("region", "")) == "city" and str(cell.get("terrain", "")) == "plain" and not Spatial.cover_blocks(state, x, y):
		last_reason = "空地。可以铺网格。"
	elif str(cell.get("region", "")) == "sea":
		last_reason = "海域不能铺网格。"
	else:
		last_reason = ""


func _push_selected() -> void:
	var mech := _deployed_mech()
	if mech.is_empty():
		last_reason = "先让机体出场，或点选场上的机体。"
		return
	_run({
		"type": "mech_push",
		"mech_id": int(mech.id),
		"dir_x": push_dir.x,
		"dir_y": push_dir.y,
	})
	if last_reason == "":
		mode = ""


func _set_dir(tag: String) -> void:
	match tag:
		"e":
			push_dir = Vector2i(1, 0)
		"w":
			push_dir = Vector2i(-1, 0)
		"s":
			push_dir = Vector2i(0, 1)
		"n":
			push_dir = Vector2i(0, -1)


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
	if turn_label != null:
		turn_label.text = _turn_label()
	hud.refresh(_view_model())


func _marks() -> Dictionary:
	var move: Array = []
	var attack: Array = []
	var reach: Array = []
	var aim: Array = []
	var ports: Array = []
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
	elif mode == "attack" and mech_id >= 0:
		var mech := Spatial.mech_by_id(state, mech_id)
		if str(mech.get("status", "")) == "deployed":
			for monster in state.monsters:
				if int(monster.hp) <= 0 or int(monster.x) < 0:
					continue
				for cell in Spatial.footprint_cells(int(monster.x), int(monster.y), monster.footprint):
					if Spatial.manhattan(int(mech.x), int(mech.y), int(cell.x), int(cell.y)) == 1:
						aim.append("%d,%d" % [int(cell.x), int(cell.y)])
	elif (mode == "fire" or mode == "fire_push") and turret_id >= 0:
		var building := Spatial.building_by_id(state, turret_id)
		var def := Catalog.building(str(building.get("def_id", "")))
		var grid := Spatial.grid_by_id(state, int(building.get("grid_id", -1)))
		if not def.is_empty() and not grid.is_empty():
			var weapon_range := int(def.weapon.range)
			for monster in state.monsters:
				if int(monster.hp) <= 0 or int(monster.x) < 0:
					continue
				for cell in Spatial.footprint_cells(int(monster.x), int(monster.y), monster.footprint):
					var dist := Spatial.manhattan(int(grid.x), int(grid.y), int(cell.x), int(cell.y))
					if dist > 0 and dist <= weapon_range:
						aim.append("%d,%d" % [int(cell.x), int(cell.y)])
	elif mode == "deploy":
		for grid in state.grids:
			if Spatial.is_deploy_port(state, int(grid.x), int(grid.y)):
				ports.append("%d,%d" % [int(grid.x), int(grid.y)])
	return {
		"selected": "" if selected.x < 0 else "%d,%d" % [selected.x, selected.y],
		"move": move,
		"attack": attack,
		"reach": reach,
		"aim": aim,
		"ports": ports,
	}


func _view_model() -> Dictionary:
	var econ: Dictionary = state.economy
	var cap := Spatial.housing_capacity(state)
	var status := "金钱 %d    人口 %d/%d    士气 %d    科研 %d" % [
		int(econ.money), int(econ.population), cap, int(econ.morale), int(econ.research)
	]
	var detail := _turn_label()
	var extra := _phase_detail()
	if extra != "":
		detail += "　" + extra
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
		"card_title": _card_title(),
		"card_meta": _card_meta(),
		"intents": _intent_text(),
		"log": "\n".join(state.log),
		"groups": _action_groups(),
		"signature": _signature(),
	}


func _card_title() -> String:
	if focus == "mech":
		var mech := Spatial.mech_by_id(state, mech_id)
		if not mech.is_empty():
			return str(mech.name)
	if selected.x < 0:
		return "尚未选择"
	if focus == "monster":
		var monster := Spatial.monster_at(state, selected.x, selected.y)
		if not monster.is_empty():
			return str(monster.name)
	if focus == "cc":
		return "指挥中心"
	if focus == "building":
		var building := Spatial.building_by_id(state, focus_building_id)
		if not building.is_empty():
			var def := Catalog.building(str(building.def_id))
			return str(def.get("name", "建筑"))
	if focus == "grid":
		var grid := Spatial.grid_at(state, selected.x, selected.y)
		if not grid.is_empty():
			return str(Spatial.grid_def_for(grid).get("name", "网格"))
	return _ground_name()


func _card_meta() -> String:
	if selected.x < 0 and focus != "mech":
		return "点城区空地，这里只出现铺网格。点机体或建筑后，再点它的动作。"
	var lines: Array = []
	if focus == "mech":
		var mech := Spatial.mech_by_id(state, mech_id)
		if not mech.is_empty():
			var status_text := "在场"
			if str(mech.status) == "ready":
				status_text = "待命"
			elif str(mech.status) != "deployed":
				status_text = str(mech.status)
			lines.append("生命 %d/%d　%s" % [int(mech.hp), int(mech.max_hp), status_text])
			if str(mech.status) == "ready":
				lines.append("再点一座完工的升降网格。")
			elif str(mech.status) == "deployed":
				lines.append("位置 (%d,%d)。先点动作，再点目标格。" % [int(mech.x), int(mech.y)])
	if selected.x >= 0:
		lines.append(_inspect())
	return "\n".join(lines)


func _ground_name() -> String:
	var cell := Spatial.cell_at(state, selected.x, selected.y)
	if cell.is_empty():
		return "超出棋盘"
	if Spatial.cover_blocks(state, selected.x, selected.y):
		return "覆盖"
	if str(cell.terrain) == "mountain":
		return "山地"
	if str(cell.terrain) == "reef":
		return "礁石"
	if str(cell.region) == "sea":
		return "岸线" if str(cell.terrain) == "coast" else "海域"
	return "空地"


func _action_groups() -> Array:
	var groups: Array = []
	var phase := str(state.phase)
	if phase == "bad_end":
		return groups
	_add_group(groups, "铺网格", _grid_actions())
	_add_group(groups, "建造", _building_actions())
	_add_group(groups, "机体", _mech_actions())
	_add_group(groups, "炮台", _turret_actions())
	_add_group(groups, "部署", _deploy_actions())
	_add_group(groups, "待命", _roster_actions())
	_add_group(groups, "方向", _direction_actions())
	if tool != "" or mode != "":
		_add_group(groups, "选择", [{"id": "cancel", "text": "取消"}])
	if phase == "peace" or phase == "warning":
		_add_group(groups, "时间", [
			{"id": "end_day", "text": "结束本日"},
		])
		if phase == "peace" and not bool(state.campaign.evaluated):
			_add_group(groups, "阶段", [{"id": "warn", "text": "开始预警"}])
		if phase == "warning":
			_add_group(groups, "阶段", [{"id": "engage", "text": "提前迎击"}])
		var prep: Array = [{"id": "recruit", "text": "招募驾驶员"}]
		if not Spatial.completed_hangar(state).is_empty():
			prep.append({"id": "order_mech", "text": "开工机体"})
		_add_group(groups, "整备", prep)
		if focus == "cc" and int(state.command_center.upgrade_level) < 1:
			_add_group(groups, "指挥中心", [{"id": "upgrade", "text": "升级指挥中心"}])
		_add_group(groups, "工班", _labor_actions())
	elif _player_turn():
		_add_group(groups, "分钟", [{"id": "end_turn", "text": "结束这一分钟"}])
	return groups


func _add_group(groups: Array, title: String, actions: Array) -> void:
	if actions.is_empty():
		return
	groups.append({"title": title, "actions": actions})


func _grid_actions() -> Array:
	if focus != "tile" or not _build_phase():
		return []
	if not _open_ground(selected.x, selected.y):
		return []
	return [
		{"id": "build_here:light", "text": "轻质网格"},
		{"id": "build_here:lift", "text": "升降网格"},
	]


func _building_actions() -> Array:
	if focus != "grid" or not _build_phase():
		return []
	var grid := Spatial.grid_at(state, selected.x, selected.y)
	if grid.is_empty() or bool(grid.ruined) or float(grid.construct_remaining) > 0.0:
		return []
	if Spatial.cover_blocks(state, selected.x, selected.y):
		return []
	var actions: Array = []
	var seen := {}
	for slot in grid.slots:
		if int(slot.building_id) >= 0:
			continue
		for def_id in slot.accepts:
			var id := str(def_id)
			if seen.has(id):
				continue
			seen[id] = true
			var def := Catalog.building(id)
			if def.is_empty():
				continue
			actions.append({"id": "build_here:%s" % id, "text": str(def.name)})
	return actions


func _mech_actions() -> Array:
	if focus != "mech" or not _player_turn():
		return []
	var mech := Spatial.mech_by_id(state, mech_id)
	if mech.is_empty() or str(mech.status) != "deployed":
		return []
	var actions: Array = []
	if not _spent("moved", int(mech.id)):
		actions.append({"id": "mode:move", "text": "移动"})
	if not _spent("acted", int(mech.id)):
		actions.append({"id": "mode:attack", "text": "近战"})
		actions.append({"id": "mode:push", "text": "推动"})
	if Spatial.is_deploy_port(state, int(mech.x), int(mech.y)):
		actions.append({"id": "recall", "text": "从部署口撤离"})
	actions.append({"id": "blast", "text": "爆破回收"})
	return actions


func _turret_actions() -> Array:
	if focus != "building" or not _player_turn() or focus_building_id < 0:
		return []
	var building := Spatial.building_by_id(state, focus_building_id)
	if building.is_empty() or float(building.construct_remaining) > 0.0 or int(building.hp) <= 0:
		return []
	if not Spatial.facility_exposed(state, building):
		return []
	var def := Catalog.building(str(building.def_id))
	if def.is_empty() or str(def.role) != "weapon":
		return []
	if _spent("fired", int(building.id)):
		return []
	return [
		{"id": "mode:fire", "text": "射击"},
		{"id": "mode:fire_push", "text": "推动射击"},
	]


func _deploy_actions() -> Array:
	if not _player_turn() or not Spatial.is_deploy_port(state, selected.x, selected.y):
		return []
	var ready := _ready_mech()
	if ready.is_empty():
		return []
	return [{"id": "deploy", "text": "部署%s到这一格" % str(ready.name)}]


func _roster_actions() -> Array:
	if not _player_turn():
		return []
	var actions: Array = []
	for mech in state.mechs:
		if str(mech.status) != "ready":
			continue
		actions.append({"id": "select_mech:%d" % int(mech.id), "text": "选中待命的%s" % str(mech.name)})
	return actions


func _direction_actions() -> Array:
	if mode == "push":
		return [
			{"id": "push_now:n", "text": "向北推"},
			{"id": "push_now:e", "text": "向东推"},
			{"id": "push_now:s", "text": "向南推"},
			{"id": "push_now:w", "text": "向西推"},
		]
	if mode == "fire_push":
		return [
			{"id": "dir:n", "text": "推往北"},
			{"id": "dir:e", "text": "推往东"},
			{"id": "dir:s", "text": "推往南"},
			{"id": "dir:w", "text": "推往西"},
		]
	return []


func _banner() -> String:
	if str(state.phase) == "bad_end":
		return "Bad End：核心被摧毁，全城与入侵者同归于尽。这不是胜利。"
	if bool(state.campaign.evaluated) and state.campaign.evaluation != null:
		var score: Dictionary = state.campaign.evaluation
		return "%s\n评定　人口 %s　伤亡 %s　网格 %d/%d　设施 %d/%d　机师在册 %d　失联 %d。尸骸剩余 %d，不影响评定。" % [
			_turn_label(),
			str(score.population), str(score.casualties),
			int(score.grid_hp), int(score.grid_max),
			int(score.building_hp), int(score.building_max),
			int(score.pilots_accounted), int(score.pilots_unaccounted),
			int(score.cover_segments_left),
		]
	return _turn_label()


func _hint() -> String:
	match str(state.phase):
		"peace":
			return "点城区空地只铺网格，网格完工后再点那一格才出现建筑。时间不会自己走。点「结束本日」进入下一天。开局有五个和平日，第一波预警要等这些日子结束，也可以自己开始预警。"
		"warning":
			return "预警里仍可施工。点「结束本日」推进这一日。预警日走完，或点「提前迎击」，敌人才出现在海域。"
		"combat":
			if state.combat != null and str(state.combat.side) == "enemy":
				return "敌方正在执行这一分钟里已经亮出的意图。工班和施工都停着。"
			return "先点机体或炮台，再点它的动作，然后点目标格。一分钟是一个回合，点「结束这一分钟」后敌方才行动。绿边是能走的格子，橙边是你的目标。黄边是敌方下一步，红边是攻击格。"
		"bad_end":
			return "失败只来自核心被摧毁。走进中心格本身不是失败。"
		_:
			return ""


func _phase_detail() -> String:
	var span := _day_span()
	if str(state.phase) == "warning" and state.warning != null:
		var warn_days := maxi(1, ceili(float(state.warning.seconds_left) / span))
		return "%s　再结束 %d 日进入迎击" % [str(state.warning.wave_name), warn_days]
	if str(state.phase) == "combat" and state.combat != null:
		return "T1=%d" % int(state.combat.t1)
	if float(state.campaign.recovery_left) > 0.0:
		var recover_days := maxi(1, ceili(float(state.campaign.recovery_left) / span))
		return "恢复　再结束 %d 日" % recover_days
	if not bool(state.campaign.started):
		var left := maxf(0.0, float(state.campaign.auto_arm_at) - float(state.clock.seconds))
		return "再结束 %d 日进入第一波预警" % ceili(left / span)
	return "波次 %d/%d" % [mini(int(state.campaign.wave_index) + 1, state.campaign.waves.size()), state.campaign.waves.size()]


func _turn_label() -> String:
	var phase := str(state.phase)
	if phase == "combat" and state.combat != null:
		var side := "玩家" if str(state.combat.side) == "player" else "敌方"
		return "迎击 第%d分钟　%s" % [int(state.combat.round), side]
	if phase == "bad_end":
		return "终局"
	if phase == "warning":
		return "预警 %s" % _date_text()
	return "和平 %s" % _date_text()


func _date_text() -> String:
	var index := int(state.clock.get("day", 0))
	var number := index + 1
	var month := int((number - 1) / 30) + 1
	var day := int((number - 1) % 30) + 1
	return "%d月%d日" % [month, day]


func _day_span() -> float:
	var span := float(state.clock.get("seconds_per_day", 24.0))
	if span <= 0.0:
		return 24.0
	return span


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


func _labor_actions() -> Array:
	if not _build_phase():
		return []
	var rows: Array = []
	for crew in state.labor.crews:
		var task: Dictionary = crew.task
		if str(task.kind) != "idle":
			rows.append({
				"id": "labor:%d:idle:-1" % int(crew.id),
				"text": "工班 %d 改为空闲" % int(crew.id),
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
				"text": "工班 %d 建造 %s" % [int(crew.id), str(mech.name)],
			})
	return rows


func _signature() -> String:
	var parts: Array = [
		str(state.revision), str(state.phase), tool, mode, focus,
		str(mech_id), str(turret_id), str(focus_building_id), str(selected), str(push_dir),
	]
	if state.combat != null:
		parts.append(str(state.combat.side))
		parts.append(str(state.combat.round))
		parts.append(_id_line(state.combat.moved))
		parts.append(_id_line(state.combat.acted))
		parts.append(_id_line(state.combat.fired))
	parts.append(str(state.campaign.evaluated))
	parts.append(str(int(state.command_center.upgrade_level)))
	if selected.x >= 0:
		var grid := Spatial.grid_at(state, selected.x, selected.y)
		if grid.is_empty():
			parts.append("nogrid")
		else:
			parts.append(str(float(grid.construct_remaining) > 0.0))
			for slot in grid.slots:
				parts.append(str(slot.building_id))
	for crew in state.labor.crews:
		parts.append(str(crew.task.kind))
		parts.append(str(crew.task.target_id))
	return "|".join(parts)


func _id_line(items: Array) -> String:
	var bits: Array = []
	for item in items:
		bits.append(str(item))
	return ",".join(bits)


func _player_turn() -> bool:
	return str(state.phase) == "combat" and state.combat != null and str(state.combat.side) == "player"


func _build_phase() -> bool:
	var phase := str(state.phase)
	return phase == "peace" or phase == "warning"


func _open_ground(x: int, y: int) -> bool:
	var cell := Spatial.cell_at(state, x, y)
	if cell.is_empty():
		return false
	if str(cell.region) != "city" or str(cell.terrain) != "plain":
		return false
	if Spatial.is_cc(state, x, y):
		return false
	if not Spatial.grid_at(state, x, y).is_empty():
		return false
	if Spatial.cover_blocks(state, x, y):
		return false
	return true


func _spent(bucket: String, id: int) -> bool:
	if state.combat == null:
		return false
	return _listed(state.combat.get(bucket, []), id)


func _listed(items: Array, id: int) -> bool:
	for item in items:
		if int(item) == id:
			return true
	return false


func _first_building_on(grid: Dictionary) -> int:
	for slot in grid.slots:
		if int(slot.building_id) >= 0:
			return int(slot.building_id)
	return -1


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


func _step_zoom(step: int) -> void:
	_apply_pixel_scale(pixel_scale + step)


func _fit_pixel_scale() -> void:
	if grid_view == null or grid_view.design_size.x < 1.0:
		return
	var window := get_viewport_rect().size
	var best := 1
	for candidate in [4, 3, 2, 1]:
		if _scale_fits(candidate, window):
			best = candidate
			break
	_apply_pixel_scale(best)


func _scale_fits(scale: int, window: Vector2) -> bool:
	var design: Vector2 = grid_view.design_size
	var panel := 440.0 * float(scale)
	var room_w := window.x - 16.0 - 12.0 - panel
	var room_h := window.y - 16.0 - float(20 + 22 + 13) * float(scale) - 18.0
	return design.x * float(scale) <= room_w and design.y * float(scale) <= room_h


func _apply_pixel_scale(next: int) -> void:
	var clamped := clampi(next, 1, 4)
	pixel_scale = clamped
	if grid_view != null:
		grid_view.set_pixel_scale(clamped)
	if title_label != null:
		title_label.add_theme_font_size_override("font_size", 20 * clamped)
	if turn_label != null:
		turn_label.add_theme_font_size_override("font_size", 22 * clamped)
	if legend_label != null:
		legend_label.add_theme_font_size_override("font_size", 13 * clamped)
	if hud != null:
		hud.set_pixel_scale(clamped)


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
