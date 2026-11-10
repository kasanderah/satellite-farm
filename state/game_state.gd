extends RefCounted

const Catalog = preload("res://data/catalog.gd")

static func new_game(seed_value: int = 1) -> Dictionary:
	var cat := Catalog.data()
	var map: Dictionary = cat.map
	var width := int(map.width)
	var height := int(map.height)
	var cells: Array = []
	for y in height:
		for x in width:
			var region := "city"
			var terrain := "plain"
			if _in_rect(x, y, map.sea):
				region = "sea"
				terrain = "ocean"
				if _row_listed(y, map.coast_rows):
					terrain = "coast"
			cells.append({
				"x": x,
				"y": y,
				"region": region,
				"terrain": terrain,
			})
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


static func _in_rect(x: int, y: int, rect: Dictionary) -> bool:
	return x >= int(rect.x) and y >= int(rect.y) and x < int(rect.x) + int(rect.w) and y < int(rect.y) + int(rect.h)


static func _row_listed(y: int, rows: Array) -> bool:
	for row in rows:
		if int(row) == y:
			return true
	return false
