extends RefCounted

const Catalog = preload("res://data/catalog.gd")

const DIRS := [[0, 1], [1, 0], [-1, 0], [0, -1]]

static func in_bounds(state: Dictionary, x: int, y: int) -> bool:
	return x >= 0 and y >= 0 and x < int(state.board.w) and y < int(state.board.h)


static func cell_at(state: Dictionary, x: int, y: int) -> Dictionary:
	if not in_bounds(state, x, y):
		return {}
	return state.board.cells[y * int(state.board.w) + x]


static func is_cc(state: Dictionary, x: int, y: int) -> bool:
	var cc: Dictionary = state.command_center
	return int(cc.x) == x and int(cc.y) == y


static func mode_allows(mode: String, cell: Dictionary) -> bool:
	if cell.is_empty():
		return false
	var terrain := str(cell.terrain)
	match mode:
		"land":
			return terrain == "plain"
		"sea":
			return terrain == "ocean" or terrain == "coast"
		"amphibious":
			return terrain == "plain" or terrain == "ocean" or terrain == "coast"
		_:
			return terrain == "plain"


static func key_of(x: int, y: int) -> String:
	return "%d,%d" % [x, y]


static func manhattan(ax: int, ay: int, bx: int, by: int) -> int:
	return absi(ax - bx) + absi(ay - by)


static func footprint_cells(x: int, y: int, footprint: Array) -> Array:
	var cells: Array = []
	if footprint.is_empty():
		cells.append({"x": x, "y": y})
		return cells
	for pair in footprint:
		cells.append({"x": x + int(pair[0]), "y": y + int(pair[1])})
	return cells


static func grid_by_id(state: Dictionary, id: int) -> Dictionary:
	for grid in state.grids:
		if int(grid.id) == id:
			return grid
	return {}


static func grid_at(state: Dictionary, x: int, y: int) -> Dictionary:
	for grid in state.grids:
		if int(grid.x) == x and int(grid.y) == y:
			return grid
	return {}


static func building_by_id(state: Dictionary, id: int) -> Dictionary:
	for building in state.buildings:
		if int(building.id) == id:
			return building
	return {}


static func mech_by_id(state: Dictionary, id: int) -> Dictionary:
	for mech in state.mechs:
		if int(mech.id) == id:
			return mech
	return {}


static func monster_by_id(state: Dictionary, id: int) -> Dictionary:
	for monster in state.monsters:
		if int(monster.id) == id:
			return monster
	return {}


static func pilot_by_id(state: Dictionary, id: int) -> Dictionary:
	for pilot in state.pilots:
		if int(pilot.id) == id:
			return pilot
	return {}


static func cover_by_id(state: Dictionary, id: int) -> Dictionary:
	for cover in state.covers:
		if int(cover.id) == id:
			return cover
	return {}


static func crew_by_id(state: Dictionary, id: int) -> Dictionary:
	for crew in state.labor.crews:
		if int(crew.id) == id:
			return crew
	return {}


static func monster_at(state: Dictionary, x: int, y: int) -> Dictionary:
	for monster in state.monsters:
		if int(monster.hp) <= 0 or int(monster.x) < 0:
			continue
		for cell in footprint_cells(int(monster.x), int(monster.y), monster.footprint):
			if int(cell.x) == x and int(cell.y) == y:
				return monster
	return {}


static func mech_at(state: Dictionary, x: int, y: int) -> Dictionary:
	for mech in state.mechs:
		if str(mech.status) != "deployed":
			continue
		if int(mech.x) == x and int(mech.y) == y:
			return mech
	return {}


static func cover_blocks(state: Dictionary, x: int, y: int) -> bool:
	for cover in state.covers:
		for segment in cover.segments:
			if bool(segment.cleared):
				continue
			if int(segment.x) == x and int(segment.y) == y:
				return true
	return false


static func _ignored(ignore: Dictionary, bucket: String, id: int) -> bool:
	if not ignore.has(bucket):
		return false
	for item in ignore[bucket]:
		if int(item) == id:
			return true
	return false


static func occupied(state: Dictionary, x: int, y: int, ignore: Dictionary = {}) -> bool:
	var monster := monster_at(state, x, y)
	if not monster.is_empty() and not _ignored(ignore, "monster_ids", int(monster.id)):
		return true
	var mech := mech_at(state, x, y)
	if not mech.is_empty() and not _ignored(ignore, "mech_ids", int(mech.id)):
		return true
	return false


static func can_occupy_cell(state: Dictionary, x: int, y: int, mode: String, ignore: Dictionary = {}) -> bool:
	if not in_bounds(state, x, y):
		return false
	if is_cc(state, x, y):
		return false
	var cell := cell_at(state, x, y)
	if not mode_allows(mode, cell):
		return false
	if cover_blocks(state, x, y):
		return false
	if occupied(state, x, y, ignore):
		return false
	return true


static func can_anchor(state: Dictionary, x: int, y: int, mode: String, footprint: Array, ignore: Dictionary = {}) -> bool:
	for cell in footprint_cells(x, y, footprint):
		if not can_occupy_cell(state, int(cell.x), int(cell.y), mode, ignore):
			return false
	return true


static func in_attack_range(ax: int, ay: int, footprint: Array, tx: int, ty: int, reach: int) -> bool:
	for cell in footprint_cells(ax, ay, footprint):
		var dist := manhattan(int(cell.x), int(cell.y), tx, ty)
		if dist > 0 and dist <= reach:
			return true
	return false


static func facility_exposed(state: Dictionary, building: Dictionary) -> bool:
	if building.is_empty():
		return false
	if float(building.construct_remaining) > 0.0 or int(building.hp) <= 0:
		return false
	var grid := grid_by_id(state, int(building.grid_id))
	if grid.is_empty():
		return true
	if float(grid.construct_remaining) > 0.0:
		return false
	if not bool(grid.submerged):
		return true
	var role := str(building.slot_role)
	return role == "intercept" or role == "flex"


static func _building_ready(building: Dictionary) -> bool:
	return float(building.construct_remaining) <= 0.0 and int(building.hp) > 0


static func housing_capacity(state: Dictionary) -> int:
	var total := int(state.command_center.housing)
	for building in state.buildings:
		if not _building_ready(building):
			continue
		var def := Catalog.building(str(building.def_id))
		if def.is_empty() or int(def.housing) <= 0:
			continue
		if bool(def.provides_when_sheltered) or facility_exposed(state, building):
			total += int(def.housing)
	return total


static func power_capacity(state: Dictionary) -> int:
	var total := int(state.command_center.power)
	for building in state.buildings:
		if not _building_ready(building):
			continue
		var def := Catalog.building(str(building.def_id))
		if def.is_empty() or int(def.power_supply) <= 0:
			continue
		if bool(def.needs_exposure) and not facility_exposed(state, building):
			continue
		var grid := grid_by_id(state, int(building.grid_id))
		var sheltered := (not grid.is_empty()) and bool(grid.submerged) and not facility_exposed(state, building)
		if sheltered and not bool(def.runs_when_sheltered):
			continue
		total += int(def.power_supply)
	return total


static func income_per_sec(state: Dictionary) -> float:
	var money := float(state.economy.population) * float(Catalog.economy().tax_per_pop_per_sec)
	for building in state.buildings:
		if not _building_ready(building):
			continue
		var def := Catalog.building(str(building.def_id))
		if def.is_empty() or float(def.income) == 0.0:
			continue
		var grid := grid_by_id(state, int(building.grid_id))
		var sheltered := (not grid.is_empty()) and bool(grid.submerged) and not facility_exposed(state, building)
		if sheltered and not bool(def.runs_when_sheltered):
			continue
		if bool(def.needs_exposure) and not facility_exposed(state, building):
			continue
		money += float(def.income)
	return money


static func living_monsters(state: Dictionary) -> Array:
	var alive: Array = []
	for monster in state.monsters:
		if int(monster.hp) > 0 and int(monster.x) >= 0:
			alive.append(monster)
	return alive


static func deployed_mechs(state: Dictionary) -> Array:
	var found: Array = []
	for mech in state.mechs:
		if str(mech.status) == "deployed":
			found.append(mech)
	return found


static func reachable(state: Dictionary, ox: int, oy: int, mode: String, footprint: Array, move_range: int, ignore: Dictionary = {}) -> Dictionary:
	var dist := {key_of(ox, oy): 0}
	var queue: Array = [[ox, oy]]
	while not queue.is_empty():
		var cur: Array = queue.pop_front()
		var cx := int(cur[0])
		var cy := int(cur[1])
		var base := int(dist[key_of(cx, cy)])
		if base >= move_range:
			continue
		for dir in DIRS:
			var nx: int = cx + int(dir[0])
			var ny: int = cy + int(dir[1])
			var nk := key_of(nx, ny)
			if dist.has(nk):
				continue
			if not can_anchor(state, nx, ny, mode, footprint, ignore):
				continue
			dist[nk] = base + 1
			queue.append([nx, ny])
	return dist


static func completed_hangar(state: Dictionary) -> Dictionary:
	for building in state.buildings:
		if str(building.def_id) != "hangar":
			continue
		if _building_ready(building):
			return building
	return {}


static func ready_pilot(state: Dictionary) -> Dictionary:
	for pilot in state.pilots:
		if str(pilot.status) == "ready":
			return pilot
	return {}


static func grid_def_for(grid: Dictionary) -> Dictionary:
	if grid.is_empty():
		return {}
	return Catalog.grid(str(grid.def_id))


static func is_deploy_port(state: Dictionary, x: int, y: int) -> bool:
	var grid := grid_at(state, x, y)
	if grid.is_empty() or bool(grid.ruined) or float(grid.construct_remaining) > 0.0:
		return false
	var def := grid_def_for(grid)
	return not def.is_empty() and bool(def.deploy_port)


static func exposed_building_at(state: Dictionary, x: int, y: int) -> Dictionary:
	var grid := grid_at(state, x, y)
	if grid.is_empty():
		return {}
	var fallback := {}
	for slot in grid.slots:
		if int(slot.building_id) < 0:
			continue
		var building := building_by_id(state, int(slot.building_id))
		if building.is_empty() or not facility_exposed(state, building):
			continue
		var def := Catalog.building(str(building.def_id))
		if not def.is_empty() and str(def.role) == "weapon":
			return building
		fallback = building
	return fallback


static func uncleared_segments(cover: Dictionary) -> int:
	var count := 0
	for segment in cover.segments:
		if not bool(segment.cleared):
			count += 1
	return count
