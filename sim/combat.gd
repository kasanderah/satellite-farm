extends RefCounted

const Catalog = preload("res://data/catalog.gd")
const Damage = preload("res://sim/damage.gd")
const Displacement = preload("res://sim/displacement.gd")
const GameState = preload("res://state/game_state.gd")
const Intent = preload("res://sim/intent.gd")
const Pressure = preload("res://sim/pressure.gd")
const Spatial = preload("res://sim/spatial.gd")

static func begin_combat(state: Dictionary) -> Dictionary:
	if str(state.phase) != "warning":
		return _fail("需要先处于预警")
	var waves: Array = state.campaign.waves
	var index := int(state.campaign.wave_index)
	if index < 0 or index >= waves.size():
		return _fail("没有这一波")
	var wave: Dictionary = waves[index]
	var planned: Array = []
	var reserved: Array = []
	for spawn in wave.spawns:
		var def := Catalog.monster(str(spawn.def_id))
		if def.is_empty():
			return _fail("未知怪物")
		var pos := _find_sea_spawn(state, def, int(spawn.x), int(spawn.y), reserved)
		if pos.is_empty():
			return _fail("海域没有可进入的出现点")
		planned.append({"def": def, "pos": pos, "requested_x": int(spawn.x), "requested_y": int(spawn.y)})
		for cell in Spatial.footprint_cells(int(pos.x), int(pos.y), _copy_footprint(def.footprint)):
			reserved.append(cell)
	var events: Array = []
	for grid in state.grids:
		var def := Catalog.grid(str(grid.def_id))
		if def.is_empty() or not bool(def.can_submerge):
			continue
		if float(grid.construct_remaining) > 0.0 or bool(grid.ruined):
			continue
		grid.submerged = true
		events.append({"kind": "stance", "x": int(grid.x), "y": int(grid.y), "submerged": true})
	for item in planned:
		var monster := _make_monster(state, item.def, int(item.pos.x), int(item.pos.y))
		state.monsters.append(monster)
		events.append({"kind": "spawn", "x": int(monster.x), "y": int(monster.y), "who": "monster"})
		if int(item.requested_x) != int(monster.x) or int(item.requested_y) != int(monster.y):
			GameState.log(state, "%s改在海域 (%d,%d) 出现。" % [str(monster.name), int(monster.x), int(monster.y)])
		else:
			GameState.log(state, "%s出现在海域 (%d,%d)。" % [str(monster.name), int(monster.x), int(monster.y)])
	state.phase = "combat"
	state.warning = null
	state.combat = {
		"round": 1,
		"side": "player",
		"t1": int(Catalog.pressure().t1),
		"moved": [],
		"acted": [],
		"fired": [],
		"power_spent": 0,
		"power_locked": false,
		"intents": [],
		"queue": [],
	}
	_refresh_intents(state)
	GameState.log(state, "迎击开始。炮台需手动开火，下令后立即结算。下沉不取消住房。")
	return {"ok": true, "reason": "", "events": events}


static func deploy(state: Dictionary, mech_id: int, x: int, y: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var mech := Spatial.mech_by_id(state, mech_id)
	if mech.is_empty():
		return _fail("没有这架机体")
	if str(mech.status) != "ready":
		return _fail("机体未就绪，回收后的受损机体本场不能再部署")
	if int(mech.pilot_id) < 0:
		return _fail("没有驾驶员")
	var pilot := Spatial.pilot_by_id(state, int(mech.pilot_id))
	if pilot.is_empty() or str(pilot.status) == "unaccounted":
		return _fail("驾驶员无法出动")
	if not Spatial.is_deploy_port(state, x, y):
		return _fail("只能部署到升降部署口")
	if not Spatial.can_anchor(state, x, y, "land", [[0, 0]], {}):
		return _fail("部署口被挡住")
	mech.status = "deployed"
	mech.x = x
	mech.y = y
	var events := [{"kind": "spawn", "x": x, "y": y, "who": "mech"}]
	GameState.log(state, "机体从部署口进入 (%d,%d)。" % [x, y])
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func move_mech(state: Dictionary, mech_id: int, x: int, y: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var mech := _deployed(state, mech_id)
	if mech.is_empty():
		return _fail("机体不在场")
	if _listed(state.combat.moved, mech_id):
		return _fail("本轮已经移动")
	var dist: Dictionary = Spatial.reachable(state, int(mech.x), int(mech.y), "land", [[0, 0]], int(mech.move), {"mech_ids": [mech_id]})
	var dest := Spatial.key_of(x, y)
	if not dist.has(dest) or int(dist[dest]) <= 0:
		return _fail("走不到那一格")
	var ox := int(mech.x)
	var oy := int(mech.y)
	mech.x = x
	mech.y = y
	state.combat.moved.append(mech_id)
	var events := [{"kind": "move", "x": ox, "y": oy, "tx": x, "ty": y, "who": "mech"}]
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func mech_attack(state: Dictionary, mech_id: int, tx: int, ty: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var mech := _deployed(state, mech_id)
	if mech.is_empty():
		return _fail("机体不在场")
	if _listed(state.combat.acted, mech_id):
		return _fail("本轮已经行动")
	if Spatial.manhattan(int(mech.x), int(mech.y), tx, ty) != 1:
		return _fail("不在近战范围")
	var monster := Spatial.monster_at(state, tx, ty)
	if monster.is_empty():
		return _fail("那里没有怪物")
	var events: Array = []
	events.append({"kind": "attack", "x": int(mech.x), "y": int(mech.y), "tx": tx, "ty": ty, "who": "mech"})
	Damage.damage_monster(state, monster, int(mech.damage), events)
	state.combat.acted.append(mech_id)
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func mech_push(state: Dictionary, mech_id: int, dir_x: int, dir_y: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	if not _cardinal(dir_x, dir_y):
		return _fail("推动只能沿直线一格")
	var mech := _deployed(state, mech_id)
	if mech.is_empty():
		return _fail("机体不在场")
	if _listed(state.combat.acted, mech_id):
		return _fail("本轮已经行动")
	var tx := int(mech.x) + dir_x
	var ty := int(mech.y) + dir_y
	var pushed := _pushable_at(state, tx, ty)
	if pushed.is_empty():
		return _fail("该方向没有可推动的单位")
	var moved := Displacement.relocate(state, str(pushed.kind), int(pushed.unit.id), tx + dir_x, ty + dir_y)
	if not moved.ok:
		return _fail(str(moved.reason))
	state.combat.acted.append(mech_id)
	var events := [
		{"kind": "attack", "x": int(mech.x), "y": int(mech.y), "tx": tx, "ty": ty, "who": "mech"},
		{"kind": "push", "result": str(moved.result), "x": tx + dir_x, "y": ty + dir_y},
	]
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func fire(state: Dictionary, building_id: int, tx: int, ty: int, mode: String, dir_x: int, dir_y: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var building := Spatial.building_by_id(state, building_id)
	if building.is_empty():
		return _fail("没有这门炮")
	var def := Catalog.building(str(building.def_id))
	if def.is_empty() or str(def.role) != "weapon":
		return _fail("不是炮台")
	if float(building.construct_remaining) > 0.0 or int(building.hp) <= 0:
		return _fail("炮台未就绪")
	if not Spatial.facility_exposed(state, building):
		return _fail("炮台没有露出")
	if _listed(state.combat.fired, building_id):
		return _fail("这门炮台本轮已经开火")
	var grid := Spatial.grid_by_id(state, int(building.grid_id))
	if grid.is_empty():
		return _fail("炮台没有网格")
	var reach := int(def.weapon.range)
	var dist := Spatial.manhattan(int(grid.x), int(grid.y), tx, ty)
	if dist <= 0 or dist > reach:
		return _fail("超出射程")
	var cost := int(def.power_cost)
	var cap := Spatial.power_capacity(state)
	if int(state.combat.power_spent) + cost > cap:
		return _fail("功率不足")
	var monster := Spatial.monster_at(state, tx, ty)
	if monster.is_empty():
		return _fail("目标格没有怪物")
	var events: Array = []
	events.append({"kind": "attack", "x": int(grid.x), "y": int(grid.y), "tx": tx, "ty": ty, "who": "turret"})
	if mode == "push":
		if not bool(def.weapon.can_push):
			return _fail("这门炮不能推")
		if not _cardinal(dir_x, dir_y):
			return _fail("推动只能沿直线一格")
		if not bool(monster.pushable):
			return _fail("推不动")
		var moved := Displacement.relocate(state, "monster", int(monster.id), tx + dir_x, ty + dir_y)
		if not moved.ok:
			return _fail(str(moved.reason))
		events.append({"kind": "push", "result": str(moved.result), "x": tx + dir_x, "y": ty + dir_y})
	else:
		Damage.damage_monster(state, monster, int(def.weapon.damage), events)
	state.combat.fired.append(building_id)
	state.combat.power_spent = int(state.combat.power_spent) + cost
	state.combat.power_locked = true
	GameState.log(state, "炮台立即结算，本轮功率锁定（已用 %d/%d）。" % [int(state.combat.power_spent), cap])
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func recall(state: Dictionary, mech_id: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var mech := _deployed(state, mech_id)
	if mech.is_empty():
		return _fail("机体不在场")
	if not Spatial.is_deploy_port(state, int(mech.x), int(mech.y)):
		return _fail("正常撤离必须站在部署口上")
	var events: Array = []
	_recover(state, mech, events, "recall")
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func blast(state: Dictionary, mech_id: int) -> Dictionary:
	var gate := _player_gate(state)
	if not gate.is_empty():
		return gate
	var mech := _deployed(state, mech_id)
	if mech.is_empty():
		return _fail("机体不在场")
	var cell := Spatial.cell_at(state, int(mech.x), int(mech.y))
	if cell.is_empty() or str(cell.region) != "city":
		return _fail("应急回收不覆盖海域")
	if str(cell.terrain) != "plain":
		return _fail("这一格不能爆破回收")
	var events: Array = []
	var grid := Spatial.grid_at(state, int(mech.x), int(mech.y))
	var destroy_peace := bool(state.rules.blast_destroys_peace_slot)
	if not grid.is_empty():
		var doomed: Array = []
		for slot in grid.slots:
			if int(slot.building_id) < 0:
				continue
			var building := Spatial.building_by_id(state, int(slot.building_id))
			if building.is_empty():
				continue
			var def := Catalog.building(str(building.def_id))
			var role := str(slot.role)
			var weapon := (not def.is_empty()) and str(def.role) == "weapon"
			if weapon or role == "intercept":
				doomed.append(building)
			elif destroy_peace:
				doomed.append(building)
		for building in doomed:
			Damage.destroy_building(state, building, events)
		Damage.damage_grid(state, grid, int(Catalog.economy().blast_grid_damage), events)
	_recover(state, mech, events, "blast")
	var peace_text := "地下和平槽一并摧毁" if destroy_peace else "地下和平槽保留"
	GameState.log(state, "爆破回收（待定参数）：地表武装拆除，网格受损，%s。" % peace_text)
	_after_player_action(state, events)
	return {"ok": true, "reason": "", "events": events}


static func end_turn(state: Dictionary) -> Dictionary:
	if str(state.phase) != "combat" or state.combat == null:
		return _fail("不在迎击中")
	if str(state.combat.side) != "player":
		return _fail("还不是玩家阶段")
	var events: Array = []
	if Spatial.living_monsters(state).is_empty():
		_end_combat(state, events)
		return {"ok": true, "reason": "", "events": events}
	_refresh_intents(state)
	state.combat.queue = (state.combat.intents as Array).duplicate(true)
	state.combat.side = "enemy"
	events.append({"kind": "phase", "side": "enemy"})
	return {"ok": true, "reason": "", "events": events}


static func step_enemy(state: Dictionary) -> Dictionary:
	if str(state.phase) != "combat" or state.combat == null:
		return _fail("不在迎击中")
	if str(state.combat.side) != "enemy":
		return _fail("敌方阶段未开始")
	var events: Array = []
	var queue: Array = state.combat.queue
	if not queue.is_empty():
		var intent: Dictionary = queue.pop_front()
		_execute_intent(state, intent, events)
		if str(state.phase) == "bad_end":
			return {"ok": true, "reason": "", "events": events}
		if Spatial.living_monsters(state).is_empty():
			queue.clear()
			_end_combat(state, events)
		return {"ok": true, "reason": "", "events": events}
	Pressure.on_round_end(state, events)
	if str(state.phase) == "bad_end":
		return {"ok": true, "reason": "", "events": events}
	state.combat.round = int(state.combat.round) + 1
	state.combat.side = "player"
	state.combat.moved = []
	state.combat.acted = []
	state.combat.fired = []
	state.combat.power_spent = 0
	state.combat.power_locked = false
	if Spatial.living_monsters(state).is_empty():
		_end_combat(state, events)
	else:
		_refresh_intents(state)
	return {"ok": true, "reason": "", "events": events}


static func _execute_intent(state: Dictionary, intent: Dictionary, events: Array) -> void:
	if not bool(intent.get("visible", true)):
		GameState.log(state, "有未侦测的敌人，意图不完整。")
		return
	var monster := Spatial.monster_by_id(state, int(intent.monster_id))
	if monster.is_empty() or int(monster.hp) <= 0 or int(monster.x) < 0:
		return
	var move = intent.get("move")
	if typeof(move) == TYPE_DICTIONARY:
		var ox := int(monster.x)
		var oy := int(monster.y)
		var moved := Displacement.relocate(state, "monster", int(monster.id), int(move.x), int(move.y))
		events.append({"kind": "move", "x": ox, "y": oy, "tx": int(move.x), "ty": int(move.y), "who": "monster", "result": str(moved.result)})
		if bool(moved.removed) or not moved.ok:
			if not moved.ok:
				GameState.log(state, "%s的移动落空。" % str(monster.name))
			return
	monster = Spatial.monster_by_id(state, int(intent.monster_id))
	if monster.is_empty():
		return
	var attack = intent.get("attack")
	if typeof(attack) != TYPE_DICTIONARY:
		return
	var tx := int(attack.x)
	var ty := int(attack.y)
	if not Spatial.in_attack_range(int(monster.x), int(monster.y), monster.footprint, tx, ty, int(monster.attack_range)):
		GameState.log(state, "%s的攻击落空，没有改瞄。" % str(monster.name))
		events.append({"kind": "miss", "x": tx, "y": ty})
		return
	events.append({"kind": "attack", "x": int(monster.x), "y": int(monster.y), "tx": tx, "ty": ty, "who": "monster"})
	Damage.strike_cell(state, tx, ty, int(monster.damage), events)


static func _end_combat(state: Dictionary, events: Array) -> void:
	if str(state.phase) != "combat":
		return
	for grid in state.grids:
		if bool(grid.submerged):
			grid.submerged = false
			events.append({"kind": "stance", "x": int(grid.x), "y": int(grid.y), "submerged": false})
	var waves: Array = state.campaign.waves
	var index := int(state.campaign.wave_index)
	var was_final := index >= waves.size() - 1
	if index >= 0 and index < waves.size() and bool(waves[index].get("final", false)):
		was_final = true
	state.campaign.wave_index = index + 1
	state.combat = null
	state.phase = "peace"
	events.append({"kind": "combat_end"})
	if was_final:
		state.campaign.evaluated = true
		state.campaign.evaluation = _evaluate(state)
		state.campaign.recovery_left = 0.0
		GameState.log(state, "最终波结束，评定已生成。清尸不是胜利条件，和平时间仍可清理。")
	else:
		state.campaign.recovery_left = float(Catalog.economy().recovery_seconds)
		GameState.log(state, "迎击结束，进入恢复窗口。损伤保留，外壳不会自动修好。")


static func _evaluate(state: Dictionary) -> Dictionary:
	var grid_hp := 0
	var grid_max := 0
	for grid in state.grids:
		grid_max += int(grid.max_hp)
		grid_hp += int(grid.hp)
	var building_hp := 0
	var building_max := 0
	for building in state.buildings:
		building_max += int(building.max_hp)
		building_hp += int(building.hp)
	var accounted := 0
	var unaccounted := 0
	for pilot in state.pilots:
		if str(pilot.status) == "unaccounted":
			unaccounted += 1
		else:
			accounted += 1
	var left := 0
	for cover in state.covers:
		left += Spatial.uncleared_segments(cover)
	return {
		"population": state.economy.population,
		"casualties": int(state.economy.casualties),
		"grid_hp": grid_hp,
		"grid_max": grid_max,
		"building_hp": building_hp,
		"building_max": building_max,
		"pilots_accounted": accounted,
		"pilots_unaccounted": unaccounted,
		"research": int(state.economy.research),
		"cover_segments_left": left,
		"segments_cleared": int(state.campaign.segments_cleared),
		"note": "评定看人口、城市损伤和机师去向。尸骸未清完不影响评定。",
	}


static func _recover(state: Dictionary, mech: Dictionary, events: Array, how: String) -> void:
	events.append({"kind": "death", "x": int(mech.x), "y": int(mech.y), "who": "extract"})
	var pilot := Spatial.pilot_by_id(state, int(mech.pilot_id))
	if not pilot.is_empty():
		pilot.status = "unaccounted"
		pilot.mech_id = -1
	mech.pilot_id = -1
	mech.status = "damaged"
	mech.x = -1
	mech.y = -1
	var label := "升降口撤离" if how == "recall" else "爆破回收"
	GameState.log(state, "%s：机体离开战场并受损，本场不能再部署。驾驶员生还未确认。" % label)


static func _after_player_action(state: Dictionary, events: Array) -> void:
	if str(state.phase) == "bad_end":
		return
	if str(state.phase) == "combat" and Spatial.living_monsters(state).is_empty():
		_end_combat(state, events)
		return
	if str(state.phase) == "combat":
		_refresh_intents(state)


static func _refresh_intents(state: Dictionary) -> void:
	if state.combat == null:
		return
	state.combat.intents = Intent.forecast(state)


static func _find_sea_spawn(state: Dictionary, def: Dictionary, x: int, y: int, reserved: Array) -> Dictionary:
	var footprint := _copy_footprint(def.footprint)
	if _sea_fit(state, x, y, str(def.movement), footprint, reserved):
		return {"x": x, "y": y}
	var best := {}
	var best_dist := 9999
	for cell in state.board.cells:
		if str(cell.region) != "sea":
			continue
		var cx := int(cell.x)
		var cy := int(cell.y)
		if not _sea_fit(state, cx, cy, str(def.movement), footprint, reserved):
			continue
		var dist := Spatial.manhattan(cx, cy, x, y)
		if dist < best_dist:
			best_dist = dist
			best = {"x": cx, "y": cy}
	return best


static func _sea_fit(state: Dictionary, x: int, y: int, mode: String, footprint: Array, reserved: Array) -> bool:
	for cell in Spatial.footprint_cells(x, y, footprint):
		var cx := int(cell.x)
		var cy := int(cell.y)
		if not Spatial.in_bounds(state, cx, cy):
			return false
		var tile := Spatial.cell_at(state, cx, cy)
		if str(tile.region) != "sea":
			return false
		if not Spatial.mode_allows(mode, tile):
			return false
		if Spatial.cover_blocks(state, cx, cy) or Spatial.occupied(state, cx, cy):
			return false
		for block in reserved:
			if int(block.x) == cx and int(block.y) == cy:
				return false
	return true


static func _make_monster(state: Dictionary, def: Dictionary, x: int, y: int) -> Dictionary:
	return {
		"id": GameState.alloc(state),
		"def_id": str(def.id),
		"name": str(def.name),
		"short": str(def.short),
		"art_id": str(def.art_id),
		"x": x,
		"y": y,
		"hp": int(def.hp),
		"max_hp": int(def.hp),
		"movement": str(def.movement),
		"footprint": _copy_footprint(def.footprint),
		"target": str(def.target),
		"attack": str(def.attack),
		"attack_range": int(def.attack_range),
		"damage": int(def.damage),
		"pushable": bool(def.pushable),
		"detected": bool(def.detected),
		"special": (def.special as Array).duplicate(),
		"corpse_work": int(def.corpse_work),
		"research": int(def.research),
		"money": int(def.money),
		"rot_delay": float(def.rot_delay),
		"rot_interval": float(def.rot_interval),
		"rot_morale": int(def.rot_morale),
	}


static func _copy_footprint(footprint: Array) -> Array:
	var copied: Array = []
	for pair in footprint:
		copied.append([int(pair[0]), int(pair[1])])
	if copied.is_empty():
		copied.append([0, 0])
	return copied


static func _pushable_at(state: Dictionary, x: int, y: int) -> Dictionary:
	var monster := Spatial.monster_at(state, x, y)
	if not monster.is_empty() and bool(monster.pushable):
		return {"kind": "monster", "unit": monster}
	var mech := Spatial.mech_at(state, x, y)
	if not mech.is_empty() and bool(mech.pushable):
		return {"kind": "mech", "unit": mech}
	return {}


static func _deployed(state: Dictionary, mech_id: int) -> Dictionary:
	var mech := Spatial.mech_by_id(state, mech_id)
	if mech.is_empty() or str(mech.status) != "deployed":
		return {}
	return mech


static func _player_gate(state: Dictionary) -> Dictionary:
	if str(state.phase) != "combat" or state.combat == null:
		return _fail("不在迎击中")
	if str(state.combat.side) != "player":
		return _fail("还不是玩家阶段")
	return {}


static func _listed(list: Array, id: int) -> bool:
	for item in list:
		if int(item) == id:
			return true
	return false


static func _cardinal(dir_x: int, dir_y: int) -> bool:
	return absi(dir_x) + absi(dir_y) == 1


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "events": []}
