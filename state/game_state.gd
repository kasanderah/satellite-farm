extends RefCounted

const Catalog = preload("res://data/catalog.gd")

static func new_game(seed_value: int = 1) -> Dictionary:
	var cat := Catalog.data()
	var map: Dictionary = cat.map
	var width := int(map.width)
	var height := int(map.height)
	var cells := _generate_map(width, height, seed_value, map.command_center)
	var cc: Dictionary = map.command_center
	var cc_def: Dictionary = cat.command_center
	var econ: Dictionary = cat.economy
	var state := {
		"schema_version": 1,
		"defs_revision": Catalog.DEFS_REVISION,
		"seed": seed_value,
		"difficulty": 1,
		"rng_state": seed_value,
		"phase": "peace",
		"clock": {
			"seconds": 0.0,
			"paused": false,
			"scale": 1.0,
			"day": 0,
			"seconds_per_day": float(econ.seconds_per_day),
		},
		"economy": {
			"money": float(econ.start_money),
			"population": float(econ.start_pop),
			"morale": int(econ.start_morale),
			"research": 0,
			"casualties": 0,
		},
		"rules": {
			"blast_destroys_peace_slot": false,
			"overflow_damage": false,
		},
		"board": {"w": width, "h": height, "cells": cells},
		"command_center": {
			"x": int(cc.x),
			"y": int(cc.y),
			"wall_hp": int(cc_def.wall_hp),
			"wall_max": int(cc_def.wall_hp),
			"core_hp": int(cc_def.core_hp),
			"core_max": int(cc_def.core_hp),
			"core_exposed": false,
			"housing": int(cc_def.housing),
			"power": int(cc_def.power),
			"upgrade_level": 0,
		},
		"grids": [],
		"buildings": [],
		"mechs": [],
		"pilots": [],
		"monsters": [],
		"covers": [],
		"labor": {"crews": []},
		"warning": null,
		"combat": null,
		"campaign": {
			"wave_index": 0,
			"started": false,
			"auto_arm_at": float(econ.auto_arm_at),
			"recovery_left": 0.0,
			"evaluated": false,
			"evaluation": null,
			"segments_cleared": 0,
			"waves": cat.waves.duplicate(true),
		},
		"boundary_log": [],
		"log": ["城市已就绪。海域在北侧，这是占位朝向。"],
		"next_id": 1,
		"revision": 0,
	}
	var crew_count := int(cat.labor.crews)
	for _i in crew_count:
		state.labor.crews.append({
			"id": alloc(state),
			"task": {"kind": "idle", "target_id": -1},
		})
	return state


static func alloc(state: Dictionary) -> int:
	var id := int(state.next_id)
	state.next_id = id + 1
	return id


static func log(state: Dictionary, text: String) -> void:
	var lines: Array = state.log
	lines.append(text)
	while lines.size() > 16:
		lines.pop_front()


static func to_json(state: Dictionary) -> String:
	return JSON.stringify(state)


static func from_json(text: String) -> Dictionary:
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var data: Dictionary = _normalize(parsed)
	if int(data.get("defs_revision", -1)) != Catalog.DEFS_REVISION:
		return {}
	return data


static func _normalize(value):
	match typeof(value):
		TYPE_FLOAT:
			if is_finite(value) and value == floor(value) and abs(value) < 1000000000000.0:
				return int(value)
			return value
		TYPE_ARRAY:
			var arr: Array = []
			for item in value:
				arr.append(_normalize(item))
			return arr
		TYPE_DICTIONARY:
			var out := {}
			for key in value.keys():
				out[str(key)] = _normalize(value[key])
			return out
		_:
			return value


static func _generate_map(width: int, height: int, seed_value: int, cc: Dictionary) -> Array:
	var coast := _coastline(width, seed_value)
	var cells: Array = []
	for y in height:
		for x in width:
			var sea := y < int(coast[x])
			cells.append({
				"x": x,
				"y": y,
				"region": "sea" if sea else "city",
				"terrain": "ocean" if sea else "plain",
			})
	for y in height:
		for x in width:
			var cell: Dictionary = cells[y * width + x]
			if str(cell.region) != "sea":
				continue
			if _touches_land(cells, width, height, x, y):
				cell.terrain = "coast"
	_stamp_reefs(cells, width, height, seed_value)
	_stamp_mountains(cells, width, height, seed_value, cc)
	return cells


static func _coastline(width: int, seed_value: int) -> Array:
	var coast: Array = []
	for x in width:
		var wobble := (_mix(seed_value, 40 + x) % 5) - 2
		var neighbor := (_mix(seed_value, 80 + x) % 3) - 1
		var row := 9 + int(round((float(wobble) + float(neighbor)) * 0.5))
		coast.append(clampi(row, 6, 12))
	# The water tests and the north band stay sea; the build street stays land.
	coast[1] = mini(int(coast[1]), 10)
	coast[4] = clampi(int(coast[4]), 9, 10)
	var guard := 0
	while _sea_count(coast) != 81 and guard < 48:
		guard += 1
		var grow := _sea_count(coast) < 81
		var best := -1
		for x in width:
			var row := int(coast[x])
			if grow and row >= _coast_max(x):
				continue
			if not grow and row <= _coast_min(x):
				continue
			if best < 0 or (grow and row < int(coast[best])) or (not grow and row > int(coast[best])):
				best = x
		if best < 0:
			break
		coast[best] = int(coast[best]) + (1 if grow else -1)
	return coast


static func _coast_min(x: int) -> int:
	if x == 4:
		return 9
	return 6


static func _coast_max(x: int) -> int:
	if x == 1 or x == 4:
		return 10
	return 12


static func _sea_count(coast: Array) -> int:
	var total := 0
	for row in coast:
		total += int(row)
	return total


static func _touches_land(cells: Array, width: int, height: int, x: int, y: int) -> bool:
	for dir in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
		var nx := x + int(dir[0])
		var ny := y + int(dir[1])
		if nx < 0 or ny < 0 or nx >= width or ny >= height:
			continue
		if str(cells[ny * width + nx].region) == "city":
			return true
	return false


static func _stamp_reefs(cells: Array, width: int, height: int, seed_value: int) -> void:
	var placed := 0
	for i in 4:
		var origin_x := _mix(seed_value, 300 + i * 5) % width
		var origin_y := _mix(seed_value, 340 + i * 7) % 8
		var shape := _mix(seed_value, 380 + i) % 4
		if _paint_shape(cells, width, height, origin_x, origin_y, shape, "sea", "reef", true):
			placed += 1
	if placed > 0:
		return
	for y in height:
		for x in width:
			if str(cells[y * width + x].region) != "sea":
				continue
			if _protected_sea(x, y):
				continue
			cells[y * width + x].terrain = "reef"
			return


static func _stamp_mountains(cells: Array, width: int, height: int, seed_value: int, cc: Dictionary) -> void:
	var reserved := {
		"1,10": true, "4,10": true,
		"2,12": true, "3,12": true, "4,12": true, "5,12": true, "6,12": true,
		"3,13": true, "4,13": true, "5,13": true,
	}
	reserved["%d,%d" % [int(cc.x), int(cc.y)]] = true
	var placed := 0
	for i in 4:
		var origin_x := _mix(seed_value, 500 + i * 9) % width
		var origin_y := 14 + (_mix(seed_value, 560 + i * 3) % 4)
		if i == 0:
			origin_y = 11
		var shape := _mix(seed_value, 620 + i) % 4
		if _paint_shape(cells, width, height, origin_x, origin_y, shape, "city", "mountain", false, reserved):
			placed += 1
	if placed > 0:
		return
	for y in range(height - 1, 10, -1):
		for x in width:
			if _can_paint(cells, width, height, x, y, "city", false, reserved):
				cells[y * width + x].terrain = "mountain"
				return


static func _paint_shape(cells: Array, width: int, height: int, x: int, y: int, shape: int, region: String, terrain: String, sea_guard: bool, reserved: Dictionary = {}) -> bool:
	var offsets: Array = [[0, 0]]
	if shape == 1:
		offsets = [[0, 0], [1, 0], [-1, 0]]
	elif shape == 2:
		offsets = [[0, 0], [0, 1], [0, -1]]
	elif shape == 3:
		offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]
	var painted := false
	for step in offsets:
		var nx := x + int(step[0])
		var ny := y + int(step[1])
		if not _can_paint(cells, width, height, nx, ny, region, sea_guard, reserved):
			continue
		var cell: Dictionary = cells[ny * width + nx]
		cell.region = region
		cell.terrain = terrain
		painted = true
	return painted


static func _can_paint(cells: Array, width: int, height: int, x: int, y: int, region: String, sea_guard: bool, reserved: Dictionary) -> bool:
	if x < 0 or y < 0 or x >= width or y >= height:
		return false
	if sea_guard and _protected_sea(x, y):
		return false
	if reserved.has("%d,%d" % [x, y]):
		return false
	return str(cells[y * width + x].region) == region


static func _protected_sea(x: int, y: int) -> bool:
	return x == 4 and (y == 2 or y == 7 or y == 8)


static func _mix(seed_value: int, salt: int) -> int:
	var x := int(seed_value) * 374761393 + int(salt) * 668265263
	x = (x ^ (x >> 13)) * 1274126177
	x = x ^ (x >> 16)
	return absi(x)
