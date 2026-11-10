extends RefCounted

const Catalog = preload("res://data/catalog.gd")
const GameState = preload("res://state/game_state.gd")
const Pressure = preload("res://sim/pressure.gd")
const Spatial = preload("res://sim/spatial.gd")

static func step(state: Dictionary, dt: float) -> Dictionary:
	if str(state.phase) == "combat" or str(state.phase) == "bad_end":
		return _pass()
	if bool(state.clock.paused) or dt <= 0.0:
		return _pass()
	var left := float(dt) * float(state.clock.scale)
	var events: Array = []
	while left > 0.00001:
		if str(state.phase) == "combat" or str(state.phase) == "bad_end":
			break
		var chunk := minf(left, 0.25)
		left -= chunk
		if _chunk(state, chunk, events):
			break
	if not events.is_empty():
		state.revision = int(state.revision) + 1
	return {"ok": true, "reason": "", "events": events}


static func _pass() -> Dictionary:
	return {"ok": true, "reason": "", "events": []}


static func _chunk(state: Dictionary, chunk: float, events: Array) -> bool:
	state.clock.seconds = float(state.clock.seconds) + chunk
	if str(state.phase) == "peace" or str(state.phase) == "warning":
		state.economy.money = float(state.economy.money) + Spatial.income_per_sec(state) * chunk
		var cap := float(Spatial.housing_capacity(state))
		if float(state.economy.population) < cap:
			var growth := float(Catalog.economy().pop_growth_per_sec) * chunk
			state.economy.population = minf(cap, float(state.economy.population) + growth)
	_tick_construction(state, chunk, events)
	_tick_labor(state, chunk, events)
	_tick_rot(state, chunk, events)
	if str(state.phase) == "warning" and state.warning != null:
		state.warning.seconds_left = float(state.warning.seconds_left) - chunk
		if float(state.warning.seconds_left) <= 0.0:
			state.warning.seconds_left = 0.0
			state.warning.due = true
			return true
	if str(state.phase) == "peace" and not bool(state.campaign.evaluated):
		if float(state.campaign.recovery_left) > 0.0:
			state.campaign.recovery_left = float(state.campaign.recovery_left) - chunk
			if float(state.campaign.recovery_left) <= 0.0:
				state.campaign.recovery_left = 0.0
				_open_warning(state, events)
				return true
		elif not bool(state.campaign.started) and float(state.clock.seconds) >= float(state.campaign.auto_arm_at):
			_open_warning(state, events)
			return true
	return false


static func _tick_construction(state: Dictionary, chunk: float, events: Array) -> void:
	for grid in state.grids:
		if float(grid.construct_remaining) <= 0.0:
			continue
		grid.construct_remaining = maxf(0.0, float(grid.construct_remaining) - chunk)
		if float(grid.construct_remaining) <= 0.0:
			grid.construct_remaining = 0.0
			events.append({"kind": "construct", "x": int(grid.x), "y": int(grid.y)})
			var def := Catalog.grid(str(grid.def_id))
			GameState.log(state, "%s完工。" % str(def.name))
	for building in state.buildings:
		if float(building.construct_remaining) <= 0.0:
			continue
		building.construct_remaining = maxf(0.0, float(building.construct_remaining) - chunk)
		if float(building.construct_remaining) <= 0.0:
			building.construct_remaining = 0.0
			var grid := Spatial.grid_by_id(state, int(building.grid_id))
			var def := Catalog.building(str(building.def_id))
			events.append({"kind": "construct", "x": int(grid.x), "y": int(grid.y)})
			GameState.log(state, "%s完工。" % str(def.name))


static func _tick_labor(state: Dictionary, chunk: float, events: Array) -> void:
	var rate := float(Catalog.labor().work_per_sec) * chunk
	for crew in state.labor.crews:
		var task: Dictionary = crew.task
		var kind := str(task.kind)
		if kind == "idle":
			continue
		if kind == "clear_cover":
			_work_cover(state, crew, int(task.target_id), rate, events)
		elif kind == "build_mech":
			_work_mech(state, crew, int(task.target_id), rate, events)


static func _work_cover(state: Dictionary, crew: Dictionary, cover_id: int, rate: float, events: Array) -> void:
	var cover := Spatial.cover_by_id(state, cover_id)
	if cover.is_empty():
		crew.task = {"kind": "idle", "target_id": -1}
		return
	var segment := {}
	for item in cover.segments:
		if not bool(item.cleared):
			segment = item
			break
	if segment.is_empty():
		crew.task = {"kind": "idle", "target_id": -1}
		return
	segment.work_remaining = float(segment.work_remaining) - rate
	if float(segment.work_remaining) > 0.0:
		return
	segment.work_remaining = 0.0
	segment.cleared = true
	_pay_segment(state, cover, segment)
	events.append({"kind": "clear", "x": int(segment.x), "y": int(segment.y)})
	if Spatial.uncleared_segments(cover) == 0:
		state.covers.erase(cover)
		GameState.log(state, "覆盖已清除。下面的网格和建筑还在。这不是整局胜利。")
	else:
		GameState.log(state, "清开一块覆盖，其余块还压着。")


static func _pay_segment(state: Dictionary, cover: Dictionary, segment: Dictionary) -> void:
	if bool(segment.reward_paid):
		return
	segment.reward_paid = true
	state.campaign.segments_cleared = int(state.campaign.segments_cleared) + 1
	var research := int(cover.research)
	var money := int(cover.money)
	if research > 0:
		state.economy.research = int(state.economy.research) + research
		GameState.log(state, "清理获得科研点 %d。" % research)
	if money > 0:
		state.economy.money = float(state.economy.money) + float(money)
		GameState.log(state, "回收残骸，获得金钱 %d。驾驶员不会因此回来。" % money)


static func _work_mech(state: Dictionary, crew: Dictionary, mech_id: int, rate: float, events: Array) -> void:
	var mech := Spatial.mech_by_id(state, mech_id)
	if mech.is_empty() or str(mech.status) != "building":
		crew.task = {"kind": "idle", "target_id": -1}
		return
	mech.build_remaining = float(mech.build_remaining) - rate
	if float(mech.build_remaining) > 0.0:
		return
	mech.build_remaining = 0.0
	mech.status = "ready"
	crew.task = {"kind": "idle", "target_id": -1}
	events.append({"kind": "construct", "x": -1, "y": -1, "who": "mech"})
	GameState.log(state, "机体「%s」完工，可以部署。" % str(mech.name))


static func _tick_rot(state: Dictionary, chunk: float, events: Array) -> void:
	for cover in state.covers:
		if Spatial.uncleared_segments(cover) == 0:
			continue
		if float(cover.interval) <= 0.0:
			continue
		cover.elapsed = float(cover.elapsed) + chunk
		while float(cover.elapsed) + 0.0001 >= float(cover.next_tick):
			var before := int(state.economy.morale)
			var penalty := int(cover.morale_penalty)
			state.economy.morale = maxi(0, before + penalty)
			cover.next_tick = float(cover.next_tick) + float(cover.interval)
			var label := "尸骸腐烂" if str(cover.kind) == "monster" else "残骸搁置"
			GameState.log(state, "%s使士气降至 %d。" % [label, int(state.economy.morale)])
			if before > 0 and int(state.economy.morale) <= 0:
				Pressure.sabotage(state, events)


static func _open_warning(state: Dictionary, events: Array) -> Dictionary:
	if str(state.phase) != "peace":
		return {"ok": false, "reason": "只有和平阶段能进入预警", "events": []}
	if bool(state.campaign.evaluated):
		return {"ok": false, "reason": "评定已经结束", "events": []}
	var waves: Array = state.campaign.waves
	var index := int(state.campaign.wave_index)
	if index < 0 or index >= waves.size():
		return {"ok": false, "reason": "没有后续波次", "events": []}
	var wave: Dictionary = waves[index]
	state.phase = "warning"
	state.campaign.started = true
	state.campaign.recovery_left = 0.0
	state.warning = {
		"seconds_left": float(wave.warning_seconds),
		"due": false,
		"wave_name": str(wave.name),
	}
	events.append({"kind": "warning", "name": str(wave.name)})
	GameState.log(state, "%s预警。敌人会先出现在海域。" % str(wave.name))
	return {"ok": true, "reason": "", "events": events}


static func place_grid(state: Dictionary, def_id: String, x: int, y: int) -> Dictionary:
	if str(state.phase) != "peace" and str(state.phase) != "warning":
		return _fail("现在不能施工")
	var cell := Spatial.cell_at(state, x, y)
	if cell.is_empty():
		return _fail("超出棋盘")
	if str(cell.region) != "city" or str(cell.terrain) != "plain":
		return _fail("只有城区平地可以铺网格")
	if Spatial.is_cc(state, x, y):
		return _fail("指挥中心不能拆除或覆盖")
	if not Spatial.grid_at(state, x, y).is_empty():
		return _fail("这里已有网格")
	if Spatial.cover_blocks(state, x, y):
		return _fail("覆盖物还在，不能施工")
	var def := Catalog.grid(def_id)
	if def.is_empty():
		return _fail("未知网格")
	if float(state.economy.money) < float(def.cost):
		return _fail("金钱不足")
	state.economy.money = float(state.economy.money) - float(def.cost)
	var slots: Array = []
	for slot in def.slots:
		slots.append({
			"role": str(slot.role),
			"building_id": -1,
			"accepts": (slot.accepts as Array).duplicate(),
		})
	state.grids.append({
		"id": GameState.alloc(state),
		"def_id": def_id,
		"x": x,
		"y": y,
		"hp": int(def.hp),
		"max_hp": int(def.hp),
		"ruined": false,
		"construct_remaining": float(def.build_seconds),
		"construct_total": float(def.build_seconds),
		"submerged": false,
		"slots": slots,
	})
	GameState.log(state, "开始铺设%s。" % str(def.name))
	var events := [{"kind": "construct", "x": x, "y": y}]
	return {"ok": true, "reason": "", "events": events}


static func place_building(state: Dictionary, def_id: String, x: int, y: int) -> Dictionary:
	if str(state.phase) != "peace" and str(state.phase) != "warning":
		return _fail("现在不能施工")
	var grid := Spatial.grid_at(state, x, y)
	if grid.is_empty():
		return _fail("先铺网格")
	if bool(grid.ruined):
		return _fail("网格已毁，不能再放设施")
	if float(grid.construct_remaining) > 0.0:
		return _fail("网格还在施工")
	if Spatial.cover_blocks(state, x, y):
		return _fail("覆盖物还在，不能施工")
	var def := Catalog.building(def_id)
	if def.is_empty():
		return _fail("未知设施")
	var slot := {}
	for item in grid.slots:
		if int(item.building_id) >= 0:
			continue
		if _accepts(item.accepts, def_id):
			slot = item
			break
	if slot.is_empty():
		return _fail("没有合适的空槽")
	if float(state.economy.money) < float(def.cost):
		return _fail("金钱不足")
	state.economy.money = float(state.economy.money) - float(def.cost)
	var building := {
		"id": GameState.alloc(state),
		"def_id": def_id,
		"grid_id": int(grid.id),
		"slot_role": str(slot.role),
		"hp": int(def.hp),
		"max_hp": int(def.hp),
		"construct_remaining": float(def.build_seconds),
		"construct_total": float(def.build_seconds),
	}
	slot.building_id = int(building.id)
	state.buildings.append(building)
	GameState.log(state, "开始建造%s。" % str(def.name))
	return {"ok": true, "reason": "", "events": [{"kind": "construct", "x": x, "y": y}]}


static func recruit_pilot(state: Dictionary) -> Dictionary:
	if str(state.phase) != "peace" and str(state.phase) != "warning":
		return _fail("现在不能招募")
	var cost := int(Catalog.data().pilot.cost)
	if float(state.economy.money) < float(cost):
		return _fail("金钱不足")
	var names: Array = Catalog.data().pilot.names
	var name := str(names[state.pilots.size() % names.size()])
	state.economy.money = float(state.economy.money) - float(cost)
	var pilot := {
		"id": GameState.alloc(state),
		"name": name,
		"status": "ready",
		"mech_id": -1,
	}
	state.pilots.append(pilot)
	GameState.log(state, "招募驾驶员%s。" % name)
	return {"ok": true, "reason": "", "events": []}


static func order_mech(state: Dictionary) -> Dictionary:
	if str(state.phase) != "peace" and str(state.phase) != "warning":
		return _fail("现在不能开工")
	if Spatial.completed_hangar(state).is_empty():
		return _fail("需要已完工的机库")
	var pilot := Spatial.ready_pilot(state)
	if pilot.is_empty():
		return _fail("需要一名空闲驾驶员")
	var def := Catalog.mech()
	if float(state.economy.money) < float(def.cost):
		return _fail("金钱不足")
	state.economy.money = float(state.economy.money) - float(def.cost)
	var mech := {
		"id": GameState.alloc(state),
		"def_id": str(def.id),
		"name": str(def.name),
		"short": str(def.short),
		"art_id": str(def.art_id),
		"pilot_id": int(pilot.id),
		"status": "building",
		"x": -1,
		"y": -1,
		"hp": int(def.hp),
		"max_hp": int(def.hp),
		"move": int(def.move),
		"damage": int(def.damage),
		"pushable": bool(def.pushable),
		"build_remaining": float(def.build_work),
		"build_total": float(def.build_work),
	}
	pilot.status = "assigned"
	pilot.mech_id = int(mech.id)
	state.mechs.append(mech)
	GameState.log(state, "开始建造机体「%s」，由%s驾驶。部署要走升降口，不是机库旁边。" % [str(def.name), str(pilot.name)])
	return {"ok": true, "reason": "", "events": [{"kind": "construct", "x": -1, "y": -1, "who": "mech"}]}


static func assign_labor(state: Dictionary, crew_id: int, kind: String, target_id: int) -> Dictionary:
	if str(state.phase) == "combat":
		return _fail("战斗中不能清理或施工，工班已冻结")
	if str(state.phase) == "bad_end":
		return _fail("对局已经结束")
	if kind != "idle" and kind != "clear_cover" and kind != "build_mech" and kind != "repair":
		return _fail("未知任务")
	if kind == "repair":
		return _fail("修复尚未接通，不会改变胜负")
	var crew := Spatial.crew_by_id(state, crew_id)
	if crew.is_empty():
		return _fail("没有这支工班")
	if kind == "clear_cover" and Spatial.cover_by_id(state, target_id).is_empty():
		return _fail("没有这具覆盖物")
	if kind == "build_mech":
		var mech := Spatial.mech_by_id(state, target_id)
		if mech.is_empty() or str(mech.status) != "building":
			return _fail("没有建造中的机体")
	crew.task = {"kind": kind, "target_id": target_id}
	GameState.log(state, "工班改为：%s。" % kind)
	return {"ok": true, "reason": "", "events": []}


static func set_clock(state: Dictionary, paused: bool, scale: float) -> Dictionary:
	if str(state.phase) == "bad_end":
		return _fail("对局已经结束")
	if scale != 1.0 and scale != 2.0:
		return _fail("切片只有 1 倍和 2 倍")
	state.clock.paused = paused
	state.clock.scale = scale
	return {"ok": true, "reason": "", "events": []}


static func start_warning(state: Dictionary) -> Dictionary:
	var events: Array = []
	var opened := _open_warning(state, events)
	if not opened.ok:
		return opened
	return {"ok": true, "reason": "", "events": events}


static func upgrade_cc(state: Dictionary) -> Dictionary:
	if str(state.phase) != "peace" and str(state.phase) != "warning":
		return _fail("现在不能升级指挥中心")
	var cc: Dictionary = state.command_center
	if int(cc.upgrade_level) >= 1:
		return _fail("切片只开放一次升级")
	var cost := int(Catalog.data().command_center.upgrade_cost)
	if float(state.economy.money) < float(cost):
		return _fail("金钱不足")
	state.economy.money = float(state.economy.money) - float(cost)
	var bonus := int(Catalog.data().command_center.upgrade_wall)
	cc.wall_max = int(cc.wall_max) + bonus
	cc.wall_hp = int(cc.wall_hp) + bonus
	cc.upgrade_level = 1
	GameState.log(state, "指挥中心升级，外壁加固。不能拆除。")
	return {"ok": true, "reason": "", "events": [{"kind": "construct", "x": int(cc.x), "y": int(cc.y)}]}


static func _accepts(accepts: Array, def_id: String) -> bool:
	for item in accepts:
		if str(item) == def_id:
			return true
	return false


static func _fail(reason: String) -> Dictionary:
	return {"ok": false, "reason": reason, "events": []}
