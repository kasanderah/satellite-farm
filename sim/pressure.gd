extends RefCounted

const Catalog = preload("res://data/catalog.gd")
const Damage = preload("res://sim/damage.gd")
const GameState = preload("res://state/game_state.gd")
const Spatial = preload("res://sim/spatial.gd")

static func on_round_end(state: Dictionary, events: Array) -> void:
	var round_n := int(state.combat.round)
	var t1 := int(state.combat.t1)
	if round_n < t1:
		return
	var steps := round_n - t1 + 1
	var drop := int(Catalog.pressure().base_drop) + (steps - 1) * int(Catalog.pressure().accel)
	var before := int(state.economy.morale)
	state.economy.morale = maxi(0, before - drop)
	GameState.log(state, "长战压力：士气 %d → %d。" % [before, int(state.economy.morale)])
	events.append({"kind": "morale", "before": before, "after": int(state.economy.morale)})
	if int(state.economy.morale) <= 0:
		sabotage(state, events)


static func sabotage(state: Dictionary, events: Array) -> void:
	var target := {}
	for building in state.buildings:
		if int(building.hp) <= 0 or float(building.construct_remaining) > 0.0:
			continue
		var def := Catalog.building(str(building.def_id))
		if def.is_empty() or not bool(def.civilian):
			continue
		target = building
		break
	if target.is_empty():
		GameState.log(state, "居民内部破坏，但没有可损的民用设施。对局继续。")
		events.append({"kind": "sabotage", "hit": false})
		return
	var grid := Spatial.grid_by_id(state, int(target.grid_id))
	Damage.damage_building(state, target, int(Catalog.pressure().sabotage_damage), events)
	GameState.log(state, "居民从内部破坏了民用设施。这不是失败，对局继续。")
	events.append({
		"kind": "sabotage",
		"hit": true,
		"x": int(grid.x) if not grid.is_empty() else -1,
		"y": int(grid.y) if not grid.is_empty() else -1,
	})
