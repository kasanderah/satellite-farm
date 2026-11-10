extends RefCounted

const GameState = preload("res://state/game_state.gd")
const Spatial = preload("res://sim/spatial.gd")

## 位移只记录留下、进入海域、离开棋盘、落水。不把出界当成击杀胜利，也不保证驾驶员生还。

static func relocate(state: Dictionary, kind: String, id: int, nx: int, ny: int) -> Dictionary:
	var unit := _unit(state, kind, id)
	if unit.is_empty():
		return {"ok": false, "result": "blocked", "reason": "单位不在场", "removed": false}
	var mode := str(unit.movement) if kind == "monster" else "land"
	var footprint: Array = unit.footprint if kind == "monster" else [[0, 0]]
	var cells := Spatial.footprint_cells(nx, ny, footprint)
	var off_board := not Spatial.in_bounds(state, nx, ny)
	if not off_board:
		for cell in cells:
			if not Spatial.in_bounds(state, int(cell.x), int(cell.y)):
				off_board = true
				break
	if off_board:
		return _leave(state, kind, unit, "left_board")
	var fell := false
	for cell in cells:
		var tile := Spatial.cell_at(state, int(cell.x), int(cell.y))
		if Spatial.mode_allows(mode, tile):
			continue
		if str(tile.region) == "sea" or str(tile.terrain) == "ocean" or str(tile.terrain) == "coast":
			fell = true
		else:
			return {"ok": false, "result": "blocked", "reason": "地形不可进入", "removed": false}
	if fell:
		return _leave(state, kind, unit, "fell_in_water")
	var ignore := {"monster_ids": [id]} if kind == "monster" else {"mech_ids": [id]}
	if not Spatial.can_anchor(state, nx, ny, mode, footprint, ignore):
		return {"ok": false, "result": "blocked", "reason": "格子被挡住", "removed": false}
	var entered_sea := false
	for cell in cells:
		var tile := Spatial.cell_at(state, int(cell.x), int(cell.y))
		if str(tile.region) == "sea":
			entered_sea = true
	unit.x = nx
	unit.y = ny
	var result := "entered_sea" if entered_sea else "stayed"
	return {"ok": true, "result": result, "removed": false}


static func _unit(state: Dictionary, kind: String, id: int) -> Dictionary:
	if kind == "monster":
		return Spatial.monster_by_id(state, id)
	return Spatial.mech_by_id(state, id)


static func _leave(state: Dictionary, kind: String, unit: Dictionary, result: String) -> Dictionary:
	var entry := {
		"kind": kind,
		"id": int(unit.id),
		"result": result,
		"x": int(unit.x),
		"y": int(unit.y),
	}
	if kind == "mech":
		entry.pilot_id = int(unit.pilot_id)
		entry.pilot_result = "unaccounted"
		var pilot := Spatial.pilot_by_id(state, int(unit.pilot_id))
		if not pilot.is_empty():
			pilot.status = "unaccounted"
			pilot.mech_id = -1
		unit.pilot_id = -1
		unit.status = "damaged"
		unit.x = -1
		unit.y = -1
		GameState.log(state, "机体%s。已离开战场并受损，驾驶员生还未确认。" % ("落水" if result == "fell_in_water" else "离场"))
	else:
		entry.name = str(unit.name)
		unit.hp = 0
		unit.x = -1
		unit.y = -1
		state.monsters.erase(unit)
		var verb := "落水" if result == "fell_in_water" else "离开棋盘"
		GameState.log(state, "%s%s。结果已记录，不留尸骸，也不算走进核心。" % [str(entry.name), verb])
	state.boundary_log.append(entry)
	return {"ok": true, "result": result, "removed": true}
