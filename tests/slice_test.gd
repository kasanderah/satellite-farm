extends SceneTree

const Catalog = preload("res://data/catalog.gd")
const Combat = preload("res://sim/combat.gd")
const Commands = preload("res://sim/commands.gd")
const Damage = preload("res://sim/damage.gd")
const Defeat = preload("res://sim/defeat.gd")
const Displacement = preload("res://sim/displacement.gd")
const GameState = preload("res://state/game_state.gd")
const Intent = preload("res://sim/intent.gd")
const Peace = preload("res://sim/peace.gd")
const Spatial = preload("res://sim/spatial.gd")

var failures: Array = []


func _init() -> void:
	_run()
	if failures.is_empty():
		print("SLICE OK")
		quit(0)
	else:
		print("SLICE FAIL %d" % failures.size())
		for item in failures:
			print(" - ", item)
		quit(1)


func check(cond: bool, message: String) -> void:
	if cond:
		print("OK ", message)
	else:
		failures.append(message)
		print("FAIL ", message)


func quiet(state: Dictionary) -> void:
	state.campaign.auto_arm_at = 100000.0
	state.campaign.recovery_left = 0.0


func pump(state: Dictionary, seconds: float) -> void:
	var left := seconds
	while left > 0.001:
		var step := minf(0.25, left)
		Commands.advance(state, step)
		left -= step


func fresh() -> Dictionary:
	var state := GameState.new_game(7)
	quiet(state)
	return state


func engage(state: Dictionary) -> Dictionary:
	if str(state.phase) == "peace":
		var opened := Commands.apply(state, {"type": "start_warning"})
		if not bool(opened.ok):
			return opened
	return Commands.apply(state, {"type": "begin_combat"})


func _run() -> void:
	_test_board()
	_test_days_and_minutes()
	_test_place_and_slots()
	_test_economy_and_save()
	_test_warning_spawns_at_sea()
	_test_submerge_keeps_housing_and_power()
	_test_turret_rules()
	_test_boundary()
	_test_rescue()
	_test_damage_layers_and_bad_end()
	_test_pressure_and_corpse()
	_test_cleanup_is_not_victory()
	_test_intent_block_and_boss()


func _test_board() -> void:
	var state := fresh()
	check(int(state.board.w) == 9 and int(state.board.h) == 18, "棋盘是 9×18")
	var city := 0
	var sea := 0
	var coast := 0
	for cell in state.board.cells:
		if str(cell.region) == "city":
			city += 1
		if str(cell.region) == "sea":
			sea += 1
		if str(cell.terrain) == "coast":
			coast += 1
	check(city == 81 and sea == 81, "城区和海域各一半")
	check(coast > 0, "岸线贴着陆地")
	var mountains := 0
	var reefs := 0
	var coast_ok := true
	for cell in state.board.cells:
		if str(cell.terrain) == "mountain":
			mountains += 1
			if str(cell.region) != "city":
				coast_ok = false
		if str(cell.terrain) == "reef":
			reefs += 1
			if str(cell.region) != "sea":
				coast_ok = false
		if str(cell.terrain) == "coast":
			var beside := false
			for dir in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
				var nx := int(cell.x) + int(dir[0])
				var ny := int(cell.y) + int(dir[1])
				var next := Spatial.cell_at(state, nx, ny)
				if not next.is_empty() and str(next.region) == "city":
					beside = true
			if not beside:
				coast_ok = false
	check(mountains > 0 and reefs > 0 and coast_ok, "种子会放山地和礁石")
	var other := GameState.new_game(8)
	var same := GameState.new_game(7)
	var changed := false
	var stable := true
	for i in state.board.cells.size():
		if str(state.board.cells[i].terrain) != str(same.board.cells[i].terrain):
			stable = false
		if str(state.board.cells[i].terrain) != str(other.board.cells[i].terrain) or str(state.board.cells[i].region) != str(other.board.cells[i].region):
			changed = true
	check(stable and changed, "同一种子地图不变，换种子岸线和山地会变")
	var blocked := {}
	for cell in state.board.cells:
		if str(cell.terrain) == "mountain":
			blocked = cell
			break
	var denied_mountain := Commands.apply(state, {"type": "place_grid", "def_id": "light", "x": int(blocked.x), "y": int(blocked.y)})
	check(not denied_mountain.ok, "山地不能铺网格")
	var cc: Dictionary = state.command_center
	check(int(cc.x) == 4 and int(cc.y) == 13, "指挥中心在城区正中")
	check(str(Spatial.cell_at(state, 4, 13).region) == "city", "中心格属于城区")
	check(str(Spatial.cell_at(state, 4, 2).region) == "sea", "北侧是海域")
	var rev := int(state.revision)
	var denied := Commands.apply(state, {"type": "place_grid", "def_id": "light", "x": 4, "y": 2})
	check(not denied.ok and int(state.revision) == rev, "海域不能铺网格，非法命令不改 revision")
	denied = Commands.apply(state, {"type": "place_grid", "def_id": "light", "x": 4, "y": 13})
	check(not denied.ok and int(state.revision) == rev, "指挥中心不能被覆盖")


func _test_days_and_minutes() -> void:
	var state := GameState.new_game(3)
	check(int(state.clock.day) == 0, "开局停在和平第一日")
	var placed := Commands.apply(state, {"type": "place_grid", "def_id": "lift", "x": 3, "y": 12})
	check(placed.ok and float(state.grids[0].construct_remaining) > 0.0, "铺下的网格要等这一日结束")
	var first := Commands.apply(state, {"type": "end_day"})
	check(first.ok and str(state.phase) == "peace", "结束本日仍是和平")
	check(float(state.grids[0].construct_remaining) == 0.0, "结束本日后施工才结算")
	check(int(state.clock.day) == 1, "结束本日进入下一天")
	for _i in 3:
		var stayed := Commands.apply(state, {"type": "end_day"})
		check(stayed.ok and str(state.phase) == "peace", "第五个和平日结束前不会预警")
	check(int(state.clock.day) == 4, "结束四次本日之后还在第五个和平日")
	var fifth := Commands.apply(state, {"type": "end_day"})
	check(fifth.ok and str(state.phase) == "warning", "第五个和平日结束后才进入预警")
	var not_minute := Commands.apply(state, {"type": "end_turn"})
	check(not not_minute.ok, "预警日不能结束战斗分钟")
	var began := Commands.apply(state, {"type": "begin_combat"})
	check(began.ok and int(state.combat.round) == 1, "迎击从第一分钟开始")
	var not_day := Commands.apply(state, {"type": "end_day"})
	check(not not_day.ok and int(state.clock.day) == 5, "战斗中不能结束一天")
	var minute := Commands.apply(state, {"type": "end_turn"})
	check(minute.ok and str(state.combat.side) == "enemy" and int(state.combat.round) == 1, "结束这一分钟后才轮到敌方")


func _test_place_and_slots() -> void:
	var state := fresh()
	var rev := int(state.revision)
	var placed := Commands.apply(state, {"type": "place_grid", "def_id": "lift", "x": 4, "y": 12})
	check(placed.ok and int(state.revision) == rev + 1, "升降网格可以铺在城区")
	check(float(state.grids[0].construct_remaining) > 0.0, "升降网格有施工时间")
	var early := Commands.apply(state, {"type": "place_building", "def_id": "housing", "x": 4, "y": 12})
	check(not early.ok, "网格未完工不能放建筑")
	pump(state, 5.2)
	check(float(state.grids[0].construct_remaining) == 0.0, "升降网格会完工")
	var home := Commands.apply(state, {"type": "place_building", "def_id": "housing", "x": 4, "y": 12})
	var gun := Commands.apply(state, {"type": "place_building", "def_id": "turret", "x": 4, "y": 12})
	check(home.ok and gun.ok, "同一格的住宅和炮台是两个实例")
	check(int(state.buildings[0].id) != int(state.buildings[1].id), "两个槽位实例编号不同")
	check(str(state.buildings[0].slot_role) == "peace" and str(state.buildings[1].slot_role) == "intercept", "和平槽和迎击槽分开")
	var third := Commands.apply(state, {"type": "place_building", "def_id": "power", "x": 4, "y": 12})
	check(not third.ok, "和平槽占满后不能再塞电厂")
	Commands.apply(state, {"type": "place_grid", "def_id": "light", "x": 2, "y": 12})
	pump(state, 1.6)
	var light_home := Commands.apply(state, {"type": "place_building", "def_id": "housing_light", "x": 2, "y": 12})
	var light_gun := Commands.apply(state, {"type": "place_building", "def_id": "turret_light", "x": 2, "y": 12})
	check(light_home.ok and not light_gun.ok, "轻质网格只有一个槽，住宅和炮台要取舍")


func _test_economy_and_save() -> void:
	var state := fresh()
	state.economy.population = float(Spatial.housing_capacity(state))
	var before := float(state.economy.money)
	Peace.step(state, 1.0)
	var expected := before + float(state.economy.population) * float(Catalog.economy().tax_per_pop_per_sec)
	check(absf(float(state.economy.money) - expected) < 0.02, "和平时间按人口收税")
	var text := GameState.to_json(state)
	var loaded := GameState.from_json(text)
	check(not loaded.is_empty() and int(loaded.board.w) == 9, "存档能整包还原 CityState")
	check(int(loaded.command_center.x) == 4, "读档后指挥中心还在")
	var again := Commands.apply(loaded, {"type": "place_grid", "def_id": "light", "x": 1, "y": 10})
	check(again.ok, "读档后的状态仍能接受命令")


func _test_warning_spawns_at_sea() -> void:
	var state := fresh()
	state.campaign.auto_arm_at = 0.2
	state.campaign.waves[0].warning_seconds = 0.3
	var pos_before := int(state.monsters.size())
	Commands.advance(state, 0.3)
	check(str(state.phase) == "warning" and pos_before == 0, "预警期间怪物还没移动")
	Commands.advance(state, 0.5)
	check(str(state.phase) == "combat", "预警结束，敌人在海域出现并进入回合")
	check(state.monsters.size() == 1, "第一波生成一只怪物")
	var monster: Dictionary = state.monsters[0]
	var cell := Spatial.cell_at(state, int(monster.x), int(monster.y))
	check(str(cell.region) == "sea", "怪物出现在海域而不是城里")
	var x := int(monster.x)
	var y := int(monster.y)
	Commands.advance(state, 1.0)
	check(int(monster.x) == x and int(monster.y) == y, "和平时钟在战斗中不移动单位")
	var forecast: Array = state.combat.intents
	check(forecast.size() == 1 and forecast[0].move != null, "开局能看到前进意图")
	var state_city := fresh()
	quiet(state_city)
	Commands.apply(state_city, {"type": "start_warning"})
	state_city.campaign.waves[0].spawns[0].x = 4
	state_city.campaign.waves[0].spawns[0].y = 13
	var began := engage(state_city)
	check(began.ok, "预定点在城里时仍能开战")
	var spawned: Dictionary = state_city.monsters[0]
	check(str(Spatial.cell_at(state_city, int(spawned.x), int(spawned.y)).region) == "sea", "刷进城区的预定点会被改到海域")


func _test_submerge_keeps_housing_and_power() -> void:
	var state := _armed_city()
	var cap := Spatial.housing_capacity(state)
	var pop := float(state.economy.population)
	check(cap > int(state.command_center.housing), "住宅提供住房")
	var began := engage(state)
	check(began.ok, "可以进入迎击")
	var lift: Dictionary = Spatial.grid_at(state, 4, 12)
	check(bool(lift.submerged), "升降网格迎击时下沉")
	check(Spatial.housing_capacity(state) == cap, "下沉后住房容量还在")
	check(absf(float(state.economy.population) - pop) < 0.01, "下沉不减少人口")
	check(Spatial.power_capacity(state) == int(state.command_center.power) + 3, "避难中的电厂继续供电")
	var housing := {}
	for building in state.buildings:
		if str(building.def_id) == "housing":
			housing = building
	check(not Spatial.facility_exposed(state, housing), "和平槽在下沉时不露出")
	var turret := _building(state, "turret")
	check(Spatial.facility_exposed(state, turret), "迎击槽炮台露出")


func _test_turret_rules() -> void:
	var state := _armed_city()
	engage(state)
	var turret := _building(state, "turret")
	var monster: Dictionary = state.monsters[0]
	monster.x = 4
	monster.y = 10
	var hp := int(monster.hp)
	var shot := Commands.apply(state, {"type": "turret_fire", "building_id": int(turret.id), "x": 4, "y": 10, "mode": "damage"})
	check(shot.ok and int(monster.hp) == hp - 6, "炮台在玩家阶段下令后立即结算")
	check(bool(state.combat.power_locked) and int(state.combat.power_spent) == 1, "开火后本轮功率锁定")
	var again := Commands.apply(state, {"type": "turret_fire", "building_id": int(turret.id), "x": 4, "y": 10, "mode": "damage"})
	check(not again.ok and int(monster.hp) == hp - 6, "同一门炮台每轮只能开一次")
	var poor := _armed_city()
	engage(poor)
	poor.command_center.power = 0
	for building in poor.buildings:
		if str(building.def_id) == "power":
			building.hp = 0
	var rev := int(poor.revision)
	poor.monsters[0].x = 4
	poor.monsters[0].y = 10
	var starved := Commands.apply(poor, {
		"type": "turret_fire",
		"building_id": int(_building(poor, "turret").id),
		"x": 4,
		"y": 10,
		"mode": "damage",
	})
	check(not starved.ok and int(poor.revision) == rev, "功率不足时开火失败且不改状态")


func _test_boundary() -> void:
	var state := fresh()
	var land := _spawn_raw(state, "reef_maw", 0, 4)
	land.movement = "land"
	var off := Displacement.relocate(state, "monster", int(land.id), -1, 4)
	check(off.ok and str(off.result) == "left_board", "离开棋盘会记录结果")
	check(state.covers.is_empty(), "离场的怪物不留尸")
	check(str(state.boundary_log.back().result) == "left_board", "离场写入边界记录")
	var wet := _spawn_raw(state, "reef_maw", 4, 9)
	wet.movement = "land"
	var fell := Displacement.relocate(state, "monster", int(wet.id), 4, 8)
	check(fell.ok and str(fell.result) == "fell_in_water", "陆地单位推进海里记为落水")
	check(state.covers.is_empty(), "落水不留尸")
	var swim := _spawn_raw(state, "reef_maw", 4, 8)
	var sea := Displacement.relocate(state, "monster", int(swim.id), 4, 7)
	check(sea.ok and str(sea.result) == "entered_sea" and int(swim.y) == 7, "两栖单位进入海域后留在棋盘上")
	var mech := _make_ready_mech(state)
	mech.status = "deployed"
	mech.x = 0
	mech.y = 12
	var pilot_id := int(mech.pilot_id)
	var left := Displacement.relocate(state, "mech", int(mech.id), -1, 12)
	check(left.ok and str(left.result) == "left_board", "机体离场有记录")
	check(str(mech.status) == "damaged" and int(mech.x) < 0, "离场机体离开战场并受损")
	check(str(Spatial.pilot_by_id(state, pilot_id).status) == "unaccounted", "离场驾驶员不保证生还")
	check(state.covers.is_empty(), "离场救援不在原地留残骸")


func _test_rescue() -> void:
	var state := _armed_city()
	_finish_mech(state)
	engage(state)
	var mech: Dictionary = state.mechs[0]
	var deployed := Commands.apply(state, {"type": "deploy_mech", "mech_id": int(mech.id), "x": 5, "y": 12})
	check(deployed.ok, "机体从另一个升降口部署")
	var stepped := Commands.apply(state, {"type": "move_mech", "mech_id": int(mech.id), "x": 6, "y": 12})
	check(stepped.ok, "机体可以离开部署口")
	var recalled := Commands.apply(state, {"type": "recall_mech", "mech_id": int(mech.id)})
	check(not recalled.ok, "不在部署口不能正常撤离")
	Commands.apply(state, {"type": "end_turn"})
	Commands.apply(state, {"type": "step_enemy"})
	Commands.apply(state, {"type": "step_enemy"})
	Commands.apply(state, {"type": "move_mech", "mech_id": int(mech.id), "x": 4, "y": 12})
	var home := Commands.apply(state, {"type": "recall_mech", "mech_id": int(mech.id)})
	check(home.ok and str(mech.status) == "damaged", "部署口撤离后机体受损离场")
	check(str(Spatial.pilot_by_id(state, int(state.pilots[0].id)).status) == "unaccounted", "撤离不保证驾驶员生还")
	var again := Commands.apply(state, {"type": "deploy_mech", "mech_id": int(mech.id), "x": 4, "y": 12})
	check(not again.ok, "本场不能把受损机体再部署")
	var blast_state := _armed_city()
	_finish_mech(blast_state)
	engage(blast_state)
	var blast_mech: Dictionary = blast_state.mechs[0]
	Commands.apply(blast_state, {"type": "deploy_mech", "mech_id": int(blast_mech.id), "x": 4, "y": 12})
	var housing_id := int(_building(blast_state, "housing").id)
	var turret_id := int(_building(blast_state, "turret").id)
	var grid := Spatial.grid_at(blast_state, 4, 12)
	var hp_before := int(grid.hp)
	var blasted := Commands.apply(blast_state, {"type": "blast_recover", "mech_id": int(blast_mech.id)})
	check(blasted.ok, "可以爆破回收")
	check(Spatial.building_by_id(blast_state, turret_id).is_empty(), "爆破拆掉地表炮台")
	check(not Spatial.building_by_id(blast_state, housing_id).is_empty(), "默认不摧毁地下和平槽")
	check(int(grid.hp) == hp_before - int(Catalog.economy().blast_grid_damage), "爆破损伤网格")
	check(str(blast_mech.status) == "damaged", "爆破回收后机体受损离场")
	var harsh := _armed_city()
	_finish_mech(harsh)
	engage(harsh)
	harsh.rules.blast_destroys_peace_slot = true
	var harsh_mech: Dictionary = harsh.mechs[0]
	Commands.apply(harsh, {"type": "deploy_mech", "mech_id": int(harsh_mech.id), "x": 4, "y": 12})
	var hid := int(_building(harsh, "housing").id)
	Commands.apply(harsh, {"type": "blast_recover", "mech_id": int(harsh_mech.id)})
	check(Spatial.building_by_id(harsh, hid).is_empty(), "打开待定参数后，爆破会摧毁和平槽")


func _test_damage_layers_and_bad_end() -> void:
	var state := _armed_city()
	engage(state)
	var housing := _building(state, "housing")
	var turret := _building(state, "turret")
	var cap := Spatial.housing_capacity(state)
	var events: Array = []
	Damage.damage_building(state, turret, 99, events)
	check(Spatial.building_by_id(state, int(turret.id)).is_empty(), "炮台可以被摧毁")
	check(not Spatial.building_by_id(state, int(housing.id)).is_empty(), "地表武装毁掉不报废地下住宅")
	check(Spatial.housing_capacity(state) == cap, "住宅容量不因炮台被毁而消失")
	var cc: Dictionary = state.command_center
	var core := int(cc.core_hp)
	events = []
	Damage.damage_cc(state, 100, events)
	check(int(cc.wall_hp) == 0 and int(cc.core_hp) == core, "默认不溢伤，破壁不会打进核心")
	check(str(state.phase) == "combat", "只破壁不会 Bad End")
	var monster: Dictionary = state.monsters[0]
	monster.x = int(cc.x)
	monster.y = int(cc.y)
	check(Defeat.reason(state) == "" and str(state.phase) == "combat", "怪物站在中心格本身不是失败")
	events = []
	Damage.damage_cc(state, int(cc.core_hp), events)
	check(str(state.phase) == "bad_end" and Defeat.reason(state) == "bad_end", "核心归零立刻 Bad End")
	var overflow := _armed_city()
	engage(overflow)
	overflow.rules.overflow_damage = true
	var wall := int(overflow.command_center.wall_hp)
	var before_core := int(overflow.command_center.core_hp)
	events = []
	Damage.damage_cc(overflow, wall + 4, events)
	check(int(overflow.command_center.wall_hp) == 0 and int(overflow.command_center.core_hp) == before_core - 4, "溢伤参数打开后才会打进核心")


func _test_pressure_and_corpse() -> void:
	var state := _armed_city()
	engage(state)
	state.economy.morale = 4
	state.combat.t1 = 1
	var housing := _building(state, "housing")
	var hp := int(housing.hp)
	Commands.apply(state, {"type": "end_turn"})
	Commands.apply(state, {"type": "step_enemy"})
	Commands.apply(state, {"type": "step_enemy"})
	check(int(state.economy.morale) == 0, "到达 T1 的轮末士气下降")
	check(str(state.phase) == "combat", "士气归零不结束对局")
	check(int(housing.hp) < hp or Spatial.building_by_id(state, int(housing.id)).is_empty(), "士气归零会破坏民用设施")
	var blocked := fresh()
	var stuck := _spawn_raw(blocked, "reef_maw", 4, 4)
	for dir in [[0, 1], [0, -1], [1, 0], [-1, 0]]:
		blocked.covers.append({
			"id": GameState.alloc(blocked),
			"kind": "monster",
			"name": "堵路",
			"source_def": "reef_maw",
			"segments": [{
				"x": int(stuck.x) + int(dir[0]),
				"y": int(stuck.y) + int(dir[1]),
				"work_remaining": 4.0,
				"work_total": 4.0,
				"cleared": false,
				"reward_paid": false,
			}],
			"elapsed": 0.0,
			"next_tick": 100.0,
			"delay": 100.0,
			"interval": 8.0,
			"morale_penalty": -1,
			"research": 1,
			"money": 0,
		})
	var forecast := Intent.forecast(blocked)
	check(forecast.size() == 1 and forecast[0].attack == null and "阻塞" in str(forecast[0].note), "不可破坏的尸骸不会被无限攻击")
	var labor := Commands.apply(blocked, {"type": "assign_labor", "crew_id": int(blocked.labor.crews[0].id), "kind": "clear_cover", "target_id": int(blocked.covers[0].id)})
	check(labor.ok, "和平时间可以派工班清覆盖")
	blocked.phase = "combat"
	blocked.combat = {"round": 1, "side": "player", "t1": 3, "moved": [], "acted": [], "fired": [], "power_spent": 0, "power_locked": false, "intents": [], "queue": []}
	var frozen := Commands.apply(blocked, {"type": "assign_labor", "crew_id": int(blocked.labor.crews[0].id), "kind": "idle", "target_id": -1})
	check(not frozen.ok, "战斗回合不能清理")


func _test_cleanup_is_not_victory() -> void:
	var state := _armed_city()
	var grid_id := int(Spatial.grid_at(state, 4, 12).id)
	var housing_id := int(_building(state, "housing").id)
	engage(state)
	var monster: Dictionary = state.monsters[0]
	monster.x = 3
	monster.y = 12
	monster.hp = 1
	Damage.damage_monster(state, monster, 5, [])
	check(state.covers.size() == 1, "死在棋盘上会留下尸骸")
	check(int(Spatial.grid_at(state, 4, 12).id) == grid_id, "尸骸不会删掉旁边的网格")
	Commands.apply(state, {"type": "end_turn"})
	check(str(state.phase) == "peace" and not bool(state.campaign.evaluated), "第一波结束回到和平，还不是评定")
	state.campaign.recovery_left = 0.0
	var cover: Dictionary = state.covers[0]
	var before_research := int(state.economy.research)
	Commands.apply(state, {"type": "assign_labor", "crew_id": int(state.labor.crews[0].id), "kind": "clear_cover", "target_id": int(cover.id)})
	pump(state, 4.0)
	check(state.covers.is_empty(), "工班能在和平时间清完尸骸")
	check(int(state.economy.research) == before_research + 2, "清理按段发放科研点，不重复发")
	check(not Spatial.grid_by_id(state, grid_id).is_empty(), "清掉覆盖后网格还在")
	check(not Spatial.building_by_id(state, housing_id).is_empty(), "清掉覆盖后建筑还在")
	check(not bool(state.campaign.evaluated), "清完尸骸不是胜利")
	state.campaign.wave_index = state.campaign.waves.size() - 1
	Commands.apply(state, {"type": "start_warning"})
	engage(state)
	check(state.monsters.size() == 1 and state.monsters[0].footprint.size() == 2, "最终波是占两格的渊脊")
	check(str(Spatial.cell_at(state, int(state.monsters[0].x), int(state.monsters[0].y)).region) == "sea", "最终波也从海域接近")
	var boss: Dictionary = state.monsters[0]
	boss.hp = 1
	Damage.damage_monster(state, boss, 5, [])
	check(state.covers.size() == 1 and state.covers[0].segments.size() == 2, "多格尸骸分成多块")
	Commands.apply(state, {"type": "end_turn"})
	check(bool(state.campaign.evaluated), "最终波结束会评定，即使尸骸还在")
	check(str(state.phase) == "peace", "评定后仍回到和平，方便继续清理")
	check(int(state.campaign.evaluation.cover_segments_left) == 2, "评定不要求覆盖归零")


func _test_intent_block_and_boss() -> void:
	var state := fresh()
	quiet(state)
	Commands.apply(state, {"type": "start_warning"})
	state.campaign.wave_index = 2
	# start_warning already consumed wave 0. Rebuild warning for the final wave.
	state.phase = "peace"
	state.warning = null
	state.campaign.wave_index = 2
	Commands.apply(state, {"type": "start_warning"})
	engage(state)
	var boss: Dictionary = state.monsters[0]
	var intent: Dictionary = state.combat.intents[0]
	check(bool(intent.visible) and int(boss.attack_range) == 5, "渊脊的远程意图可见")
	check(intent.move != null, "打不到指挥中心时会先跨海接近")
	var salt := fresh()
	_armed_into(salt)
	_finish_mech(salt)
	salt.campaign.wave_index = 1
	Commands.apply(salt, {"type": "start_warning"})
	engage(salt)
	var mech: Dictionary = salt.mechs[0]
	if str(mech.status) == "ready":
		Commands.apply(salt, {"type": "deploy_mech", "mech_id": int(mech.id), "x": 4, "y": 12})
	var foe: Dictionary = salt.monsters[0]
	foe.x = 4
	foe.y = 11
	var seen: Array = Intent.forecast(salt)
	check(seen.size() == 1 and seen[0].attack != null and int(seen[0].attack.x) == int(mech.x), "盐螯会优先攻击机体")


func _armed_city() -> Dictionary:
	var state := fresh()
	_armed_into(state)
	return state


func _armed_into(state: Dictionary) -> void:
	Commands.apply(state, {"type": "place_grid", "def_id": "lift", "x": 4, "y": 12})
	Commands.apply(state, {"type": "place_grid", "def_id": "lift", "x": 5, "y": 12})
	pump(state, 5.2)
	Commands.apply(state, {"type": "place_building", "def_id": "housing", "x": 4, "y": 12})
	Commands.apply(state, {"type": "place_building", "def_id": "turret", "x": 4, "y": 12})
	Commands.apply(state, {"type": "place_building", "def_id": "power", "x": 5, "y": 12})
	Commands.apply(state, {"type": "place_grid", "def_id": "lift", "x": 3, "y": 12})
	pump(state, 5.2)
	Commands.apply(state, {"type": "place_building", "def_id": "hangar", "x": 3, "y": 12})
	pump(state, 2.4)


func _finish_mech(state: Dictionary) -> void:
	Commands.apply(state, {"type": "recruit_pilot"})
	Commands.apply(state, {"type": "order_mech"})
	var mech: Dictionary = state.mechs.back()
	Commands.apply(state, {"type": "assign_labor", "crew_id": int(state.labor.crews[0].id), "kind": "build_mech", "target_id": int(mech.id)})
	pump(state, 4.0)
	check(str(mech.status) == "ready", "工班能造完机体")


func _building(state: Dictionary, def_id: String) -> Dictionary:
	for building in state.buildings:
		if str(building.def_id) == def_id and int(building.hp) > 0:
			return building
	return {}


func _spawn_raw(state: Dictionary, def_id: String, x: int, y: int) -> Dictionary:
	var def := Catalog.monster(def_id)
	var monster := {
		"id": GameState.alloc(state),
		"def_id": def_id,
		"name": str(def.name),
		"short": str(def.short),
		"art_id": str(def.art_id),
		"x": x,
		"y": y,
		"hp": int(def.hp),
		"max_hp": int(def.hp),
		"movement": str(def.movement),
		"footprint": [[0, 0]],
		"target": str(def.target),
		"attack": str(def.attack),
		"attack_range": int(def.attack_range),
		"damage": int(def.damage),
		"pushable": true,
		"detected": true,
		"special": [],
		"corpse_work": int(def.corpse_work),
		"research": int(def.research),
		"money": 0,
		"rot_delay": float(def.rot_delay),
		"rot_interval": float(def.rot_interval),
		"rot_morale": int(def.rot_morale),
	}
	state.monsters.append(monster)
	return monster


func _make_ready_mech(state: Dictionary) -> Dictionary:
	Commands.apply(state, {"type": "recruit_pilot"})
	var pilot: Dictionary = state.pilots.back()
	var mech := {
		"id": GameState.alloc(state),
		"def_id": "warden",
		"name": "戍卫",
		"short": "甲",
		"art_id": "unit.mech",
		"pilot_id": int(pilot.id),
		"status": "ready",
		"x": -1,
		"y": -1,
		"hp": 16,
		"max_hp": 16,
		"move": 3,
		"damage": 5,
		"pushable": true,
		"build_remaining": 0.0,
		"build_total": 12.0,
	}
	pilot.status = "assigned"
	pilot.mech_id = int(mech.id)
	state.mechs.append(mech)
	return mech
