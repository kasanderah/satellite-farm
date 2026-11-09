extends RefCounted

const Spatial = preload("res://sim/spatial.gd")

const DIRS := [[0, 1], [1, 0], [-1, 0], [0, -1]]

static func forecast(state: Dictionary) -> Array:
	var found: Array = []
	for monster in state.monsters:
		if int(monster.hp) <= 0 or int(monster.x) < 0:
			continue
		found.append(_one(state, monster))
	return found


static func _one(state: Dictionary, monster: Dictionary) -> Dictionary:
	var base := {
		"monster_id": int(monster.id),
		"name": str(monster.name),
		"damage": int(monster.damage),
		"visible": true,
		"move": null,
		"attack": null,
		"note": "",
	}
	if not bool(monster.detected):
		base.visible = false
		base.note = "未侦测"
		return base
	var attack := _attack_from(state, monster, int(monster.x), int(monster.y))
	if not attack.is_empty():
		base.attack = attack
		base.note = str(attack.note)
		return base
	var step := _next_step(state, monster)
	if step.is_empty():
		base.note = "通路阻塞，原地等待"
		return base
	base.move = step
	var later := _attack_from(state, monster, int(step.x), int(step.y))
	if later.is_empty():
		base.note = "前进"
	else:
		base.attack = later
		base.note = "前进后%s" % str(later.note)
	return base


static func _attack_from(state: Dictionary, monster: Dictionary, ax: int, ay: int) -> Dictionary:
	var reach := int(monster.attack_range)
	var preference := str(monster.target)
	var cc: Dictionary = state.command_center
	var cc_in := Spatial.in_attack_range(ax, ay, monster.footprint, int(cc.x), int(cc.y), reach)
	var mech := _nearest_cell(state, monster, ax, ay, reach, "mech")
	var facility := _nearest_cell(state, monster, ax, ay, reach, "facility")
	if preference == "mech":
		if not mech.is_empty():
			return {"x": int(mech.x), "y": int(mech.y), "note": "攻击机体"}
		if cc_in:
			return _cc_attack(state)
		return {}
	if preference == "facility":
		if not facility.is_empty():
			return {"x": int(facility.x), "y": int(facility.y), "note": "攻击设施"}
		if cc_in:
			return _cc_attack(state)
		if not mech.is_empty():
			return {"x": int(mech.x), "y": int(mech.y), "note": "攻击机体"}
		return {}
	if cc_in:
		return _cc_attack(state)
	if not mech.is_empty():
		return {"x": int(mech.x), "y": int(mech.y), "note": "攻击挡路机体"}
	return {}


static func _cc_attack(state: Dictionary) -> Dictionary:
	var cc: Dictionary = state.command_center
	var note := "攻击核心" if int(cc.wall_hp) <= 0 else "攻击外壁"
	return {"x": int(cc.x), "y": int(cc.y), "note": note}


static func _nearest_cell(state: Dictionary, monster: Dictionary, ax: int, ay: int, reach: int, kind: String) -> Dictionary:
	var best := {}
	var best_dist := 9999
	if kind == "mech":
		for mech in Spatial.deployed_mechs(state):
			if not Spatial.in_attack_range(ax, ay, monster.footprint, int(mech.x), int(mech.y), reach):
				continue
			var dist := Spatial.manhattan(ax, ay, int(mech.x), int(mech.y))
			if dist < best_dist:
				best_dist = dist
				best = {"x": int(mech.x), "y": int(mech.y)}
		return best
	for building in state.buildings:
		if not Spatial.facility_exposed(state, building):
			continue
		var grid := Spatial.grid_by_id(state, int(building.grid_id))
		if grid.is_empty():
			continue
		if not Spatial.in_attack_range(ax, ay, monster.footprint, int(grid.x), int(grid.y), reach):
			continue
		var dist := Spatial.manhattan(ax, ay, int(grid.x), int(grid.y))
		if dist < best_dist:
			best_dist = dist
			best = {"x": int(grid.x), "y": int(grid.y)}
	return best


static func _is_goal(state: Dictionary, monster: Dictionary, ax: int, ay: int) -> bool:
	var preference := str(monster.target)
	var cc: Dictionary = state.command_center
	var cc_in := Spatial.in_attack_range(ax, ay, monster.footprint, int(cc.x), int(cc.y), int(monster.attack_range))
	if preference == "mech":
		if not _nearest_cell(state, monster, ax, ay, int(monster.attack_range), "mech").is_empty():
			return true
		return cc_in
	if preference == "facility":
		if not _nearest_cell(state, monster, ax, ay, int(monster.attack_range), "facility").is_empty():
			return true
		return cc_in
	return cc_in


static func _next_step(state: Dictionary, monster: Dictionary) -> Dictionary:
	var start := Spatial.key_of(int(monster.x), int(monster.y))
	var queue: Array = [[int(monster.x), int(monster.y)]]
	var prev := {}
	var seen := {start: true}
	var found := ""
	var ignore := {"monster_ids": [int(monster.id)]}
	while not queue.is_empty():
		var cur: Array = queue.pop_front()
		var cx := int(cur[0])
		var cy := int(cur[1])
		for dir in DIRS:
			var nx: int = cx + int(dir[0])
			var ny: int = cy + int(dir[1])
			var nk := Spatial.key_of(nx, ny)
			if seen.has(nk):
				continue
			if not Spatial.can_anchor(state, nx, ny, str(monster.movement), monster.footprint, ignore):
				continue
			seen[nk] = true
			prev[nk] = Spatial.key_of(cx, cy)
			if _is_goal(state, monster, nx, ny):
				found = nk
				break
			queue.append([nx, ny])
		if found != "":
			break
	if found == "":
		return {}
	var cursor := found
	while prev.has(cursor) and str(prev[cursor]) != start:
		cursor = str(prev[cursor])
	var parts := cursor.split(",")
	return {"x": int(parts[0]), "y": int(parts[1])}
