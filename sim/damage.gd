extends RefCounted

const Catalog = preload("res://data/catalog.gd")
const Defeat = preload("res://sim/defeat.gd")
const GameState = preload("res://state/game_state.gd")
const Spatial = preload("res://sim/spatial.gd")

static func damage_cc(state: Dictionary, amount: int, events: Array) -> void:
	var cc: Dictionary = state.command_center
	if int(cc.wall_hp) > 0:
		var to_wall := amount
		if not bool(state.rules.overflow_damage):
			to_wall = mini(amount, int(cc.wall_hp))
		else:
			to_wall = mini(amount, int(cc.wall_hp))
		cc.wall_hp = int(cc.wall_hp) - to_wall
		events.append({"kind": "damage", "x": int(cc.x), "y": int(cc.y), "layer": "wall"})
		if int(cc.wall_hp) <= 0:
			cc.wall_hp = 0
			cc.core_exposed = true
			GameState.log(state, "指挥中心外壁破裂，中心暴露。")
		if bool(state.rules.overflow_damage):
			var spill := amount - to_wall
			if spill > 0 and int(cc.wall_hp) <= 0:
				_hit_core(state, spill, events)
		return
	_hit_core(state, amount, events)


static func _hit_core(state: Dictionary, amount: int, events: Array) -> void:
	var cc: Dictionary = state.command_center
	cc.core_hp = int(cc.core_hp) - amount
	events.append({"kind": "damage", "x": int(cc.x), "y": int(cc.y), "layer": "core"})
	if int(cc.core_hp) <= 0:
		cc.core_hp = 0
		Defeat.bad_end(state)
		events.append({"kind": "bad_end", "x": int(cc.x), "y": int(cc.y)})


static func damage_monster(state: Dictionary, monster: Dictionary, amount: int, events: Array) -> void:
	if monster.is_empty() or int(monster.hp) <= 0:
		return
	monster.hp = int(monster.hp) - amount
	events.append({"kind": "damage", "x": int(monster.x), "y": int(monster.y), "layer": "monster"})
	if int(monster.hp) > 0:
		return
	monster.hp = 0
	var cells := Spatial.footprint_cells(int(monster.x), int(monster.y), monster.footprint)
	events.append({"kind": "death", "x": int(monster.x), "y": int(monster.y), "who": "monster"})
	_spawn_monster_cover(state, monster, cells)
	state.monsters.erase(monster)
	GameState.log(state, "%s倒下，留下需要清理的尸骸。" % str(monster.name))


static func damage_mech(state: Dictionary, mech: Dictionary, amount: int, events: Array) -> void:
	if mech.is_empty() or str(mech.status) != "deployed":
		return
	mech.hp = int(mech.hp) - amount
	events.append({"kind": "damage", "x": int(mech.x), "y": int(mech.y), "layer": "mech"})
	if int(mech.hp) > 0:
		return
	mech.hp = 0
	events.append({"kind": "death", "x": int(mech.x), "y": int(mech.y), "who": "mech"})
	_spawn_wreck(state, mech)
	_unaccount_pilot(state, mech)
	mech.status = "destroyed"
	mech.x = -1
	mech.y = -1
	GameState.log(state, "机体被击毁，留下残骸。驾驶员生还未确认。")


static func damage_building(state: Dictionary, building: Dictionary, amount: int, events: Array) -> void:
	if building.is_empty() or int(building.hp) <= 0:
		return
	building.hp = int(building.hp) - amount
	var grid := Spatial.grid_by_id(state, int(building.grid_id))
	var x := int(grid.x) if not grid.is_empty() else -1
	var y := int(grid.y) if not grid.is_empty() else -1
	events.append({"kind": "damage", "x": x, "y": y, "layer": "building"})
	if int(building.hp) > 0:
		return
	destroy_building(state, building, events)


static func destroy_building(state: Dictionary, building: Dictionary, events: Array) -> void:
	if building.is_empty():
		return
	var grid := Spatial.grid_by_id(state, int(building.grid_id))
	var x := int(grid.x) if not grid.is_empty() else -1
	var y := int(grid.y) if not grid.is_empty() else -1
	if not grid.is_empty():
		for slot in grid.slots:
			if int(slot.building_id) == int(building.id):
				slot.building_id = -1
	state.buildings.erase(building)
	events.append({"kind": "death", "x": x, "y": y, "who": "building"})
	var def := Catalog.building(str(building.def_id))
	var name := str(def.name) if not def.is_empty() else "设施"
	GameState.log(state, "%s被摧毁。" % name)
	if not def.is_empty() and int(def.housing) > 0:
		_apply_housing_loss(state)


static func damage_grid(state: Dictionary, grid: Dictionary, amount: int, events: Array) -> void:
	if grid.is_empty():
		return
	grid.hp = int(grid.hp) - amount
	events.append({"kind": "damage", "x": int(grid.x), "y": int(grid.y), "layer": "grid"})
	if int(grid.hp) > 0:
		return
	grid.hp = 0
	grid.ruined = true
	GameState.log(state, "网格耐久耗尽，槽里的设施还在。")


static func strike_cell(state: Dictionary, x: int, y: int, amount: int, events: Array) -> void:
	if Spatial.is_cc(state, x, y):
		damage_cc(state, amount, events)
		return
	var mech := Spatial.mech_at(state, x, y)
	if not mech.is_empty():
		damage_mech(state, mech, amount, events)
		return
	var monster := Spatial.monster_at(state, x, y)
	if not monster.is_empty():
		damage_monster(state, monster, amount, events)
		return
	var building := Spatial.exposed_building_at(state, x, y)
	if not building.is_empty():
		damage_building(state, building, amount, events)
		return
	var grid := Spatial.grid_at(state, x, y)
	if not grid.is_empty() and float(grid.construct_remaining) <= 0.0:
		damage_grid(state, grid, amount, events)
		return
	events.append({"kind": "miss", "x": x, "y": y})


static func _apply_housing_loss(state: Dictionary) -> void:
	var cap := float(Spatial.housing_capacity(state))
	var pop := float(state.economy.population)
	if pop > cap:
		var loss := pop - cap
		state.economy.population = cap
		state.economy.casualties = int(state.economy.casualties) + int(ceil(loss))
		GameState.log(state, "住房损毁，居民伤亡 %d。" % int(ceil(loss)))


static func _spawn_monster_cover(state: Dictionary, monster: Dictionary, cells: Array) -> void:
	var total := int(monster.corpse_work)
	var count := maxi(cells.size(), 1)
	var base := total / count
	var rem := total % count
	var segments: Array = []
	for i in cells.size():
		var cell: Dictionary = cells[i]
		var work := base + (1 if i < rem else 0)
		segments.append({
			"x": int(cell.x),
			"y": int(cell.y),
			"work_remaining": float(work),
			"work_total": float(work),
			"cleared": false,
			"reward_paid": false,
		})
	state.covers.append({
		"id": GameState.alloc(state),
		"kind": "monster",
		"name": str(monster.name),
		"source_def": str(monster.def_id),
		"segments": segments,
		"elapsed": 0.0,
		"next_tick": float(monster.rot_delay),
		"delay": float(monster.rot_delay),
		"interval": float(monster.rot_interval),
		"morale_penalty": int(monster.rot_morale),
		"research": int(monster.research),
		"money": int(monster.money),
	})


static func _spawn_wreck(state: Dictionary, mech: Dictionary) -> void:
	var wreck: Dictionary = Catalog.data().wreck
	var work := int(wreck.work)
	state.covers.append({
		"id": GameState.alloc(state),
		"kind": "mech",
		"name": "戍卫残骸",
		"source_def": str(mech.def_id),
		"segments": [{
			"x": int(mech.x),
			"y": int(mech.y),
			"work_remaining": float(work),
			"work_total": float(work),
			"cleared": false,
			"reward_paid": false,
		}],
		"elapsed": 0.0,
		"next_tick": float(wreck.delay),
		"delay": float(wreck.delay),
		"interval": float(wreck.interval),
		"morale_penalty": int(wreck.morale),
		"research": int(wreck.research),
		"money": int(wreck.money),
	})


static func _unaccount_pilot(state: Dictionary, mech: Dictionary) -> void:
	var pilot := Spatial.pilot_by_id(state, int(mech.pilot_id))
	if not pilot.is_empty():
		pilot.status = "unaccounted"
		pilot.mech_id = -1
	mech.pilot_id = -1
