extends RefCounted

const Combat = preload("res://sim/combat.gd")
const Peace = preload("res://sim/peace.gd")

static func apply(state: Dictionary, cmd: Dictionary) -> Dictionary:
	var result := _dispatch(state, cmd)
	if bool(result.get("ok", false)):
		state.revision = int(state.revision) + 1
	return result


static func advance(state: Dictionary, dt: float) -> Dictionary:
	var stepped := Peace.step(state, dt)
	var events: Array = (stepped.events as Array).duplicate()
	if str(state.phase) == "warning" and state.warning != null and bool(state.warning.get("due", false)):
		var began := apply(state, {"type": "begin_combat"})
		events.append_array(began.events)
		if not bool(began.ok):
			return {"ok": false, "reason": str(began.reason), "events": events}
	return {"ok": true, "reason": "", "events": events}


static func _dispatch(state: Dictionary, cmd: Dictionary) -> Dictionary:
	var type := str(cmd.get("type", ""))
	match type:
		"place_grid":
			return Peace.place_grid(state, str(cmd.get("def_id", "")), int(cmd.get("x", -1)), int(cmd.get("y", -1)))
		"place_building":
			return Peace.place_building(state, str(cmd.get("def_id", "")), int(cmd.get("x", -1)), int(cmd.get("y", -1)))
		"recruit_pilot":
			return Peace.recruit_pilot(state)
		"order_mech":
			return Peace.order_mech(state)
		"assign_labor":
			return Peace.assign_labor(state, int(cmd.get("crew_id", -1)), str(cmd.get("kind", "")), int(cmd.get("target_id", -1)))
		"set_clock":
			return Peace.set_clock(state, bool(cmd.get("paused", false)), float(cmd.get("scale", 1)))
		"start_warning":
			return Peace.start_warning(state)
		"upgrade_cc":
			return Peace.upgrade_cc(state)
		"begin_combat":
			return Combat.begin_combat(state)
		"deploy_mech":
			return Combat.deploy(state, int(cmd.get("mech_id", -1)), int(cmd.get("x", -1)), int(cmd.get("y", -1)))
		"move_mech":
			return Combat.move_mech(state, int(cmd.get("mech_id", -1)), int(cmd.get("x", -1)), int(cmd.get("y", -1)))
		"mech_attack":
			return Combat.mech_attack(state, int(cmd.get("mech_id", -1)), int(cmd.get("x", -1)), int(cmd.get("y", -1)))
		"mech_push":
			return Combat.mech_push(state, int(cmd.get("mech_id", -1)), int(cmd.get("dir_x", 0)), int(cmd.get("dir_y", 0)))
		"turret_fire":
			return Combat.fire(
				state,
				int(cmd.get("building_id", -1)),
				int(cmd.get("x", -1)),
				int(cmd.get("y", -1)),
				str(cmd.get("mode", "damage")),
				int(cmd.get("dir_x", 0)),
				int(cmd.get("dir_y", 0))
			)
		"recall_mech":
			return Combat.recall(state, int(cmd.get("mech_id", -1)))
		"blast_recover":
			return Combat.blast(state, int(cmd.get("mech_id", -1)))
		"end_turn":
			return Combat.end_turn(state)
		"step_enemy":
			return Combat.step_enemy(state)
		_:
			return {"ok": false, "reason": "未知命令", "events": []}
