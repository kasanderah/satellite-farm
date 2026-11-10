extends RefCounted

## 切片数据。数值都是占位，方便手感，不写成规则里的常数。
## 地图尺寸是已锁定的 9×9 城区 + 相邻 9×9 海域。岸线朝向只是占位。

const DEFS_REVISION := 1

static var _cache: Dictionary = {}

static func data() -> Dictionary:
	if _cache.is_empty():
		_cache = _build()
	return _cache


static func grid(id: String) -> Dictionary:
	for item in data().grids:
		if item.id == id:
			return item
	return {}


static func building(id: String) -> Dictionary:
	for item in data().buildings:
		if item.id == id:
			return item
	return {}


static func monster(id: String) -> Dictionary:
	for item in data().monsters:
		if item.id == id:
			return item
	return {}


static func mech() -> Dictionary:
	return data()["mech"]


static func economy() -> Dictionary:
	return data().economy


static func labor() -> Dictionary:
	return data().labor


static func pressure() -> Dictionary:
	return data().pressure


static func map_def() -> Dictionary:
	return data().map


static func _build() -> Dictionary:
	return {
		"map": {
			"width": 9,
			"height": 18,
			"city": {"x": 0, "y": 9, "w": 9, "h": 9},
			"sea": {"x": 0, "y": 0, "w": 9, "h": 9},
			"coast_rows": [8],
			"command_center": {"x": 4, "y": 13},
			"orientation_note": "岸线朝向是占位：海域在北，城区在南，尚未定稿。",
		},
		# Opening peace is auto_arm_at seconds, spent one day at a time.
		# 24 seconds is one day, so 120 seconds is five peace days before the first warning.
		"economy": {
			"start_money": 200,
			"start_pop": 18,
			"start_morale": 86,
			"tax_per_pop_per_sec": 0.06,
			"pop_growth_per_sec": 0.35,
			"recovery_seconds": 14.0,
			"seconds_per_day": 24.0,
			"auto_arm_at": 120.0,
			"blast_grid_damage": 9,
		},
		"labor": {
			"crews": 2,
			"work_per_sec": 4.0,
		},
		"pressure": {
			"t1": 3,
			"base_drop": 4,
			"accel": 3,
			"sabotage_damage": 4,
		},
		"pilot": {
			"cost": 8,
			"names": ["沈柝", "顾衡", "江照"],
		},
		"command_center": {
			"name": "指挥中心",
			"housing": 24,
			"power": 2,
			"wall_hp": 18,
			"core_hp": 14,
			"upgrade_cost": 30,
			"upgrade_wall": 6,
		},
		"wreck": {
			"work": 8,
			"money": 6,
			"research": 0,
			"delay": 28.0,
			"interval": 10.0,
			"morale": -1,
		},
		"mech": {
			"id": "warden",
			"name": "戍卫",
			"short": "甲",
			"art_id": "unit.mech",
			"cost": 20,
			"build_work": 12,
			"hp": 16,
			"move": 3,
			"damage": 5,
			"pushable": true,
		},
		"grids": [
			{
				"id": "light",
				"name": "轻质网格",
				"short": "轻",
				"art_id": "grid.light",
				"cost": 10,
				"hp": 8,
				"build_seconds": 1.5,
				"can_submerge": false,
				"deploy_port": false,
				"slots": [
					{"role": "flex", "accepts": ["housing_light", "turret_light"]},
				],
			},
			{
				"id": "lift",
				"name": "升降网格",
				"short": "升",
				"art_id": "grid.lift",
				"cost": 24,
				"hp": 16,
				"build_seconds": 5.0,
				"can_submerge": true,
				"deploy_port": true,
				"slots": [
					{"role": "peace", "accepts": ["housing", "power", "hangar"]},
					{"role": "intercept", "accepts": ["turret"]},
				],
			},
		],
		"buildings": [
			{
				"id": "housing_light",
				"name": "轻住宅",
				"short": "宅",
				"art_id": "bld.housing_light",
				"cost": 8,
				"build_seconds": 1.2,
				"hp": 7,
				"housing": 12,
				"income": 0.2,
				"power_supply": 0,
				"power_cost": 0,
				"civilian": true,
				"role": "civic",
				"needs_exposure": false,
				"runs_when_sheltered": true,
				"provides_when_sheltered": true,
			},
			{
				"id": "housing",
				"name": "集合住宅",
				"short": "宅",
				"art_id": "bld.housing",
				"cost": 14,
				"build_seconds": 1.6,
				"hp": 10,
				"housing": 22,
				"income": 0.35,
				"power_supply": 0,
				"power_cost": 0,
				"civilian": true,
				"role": "civic",
				"needs_exposure": false,
				"runs_when_sheltered": true,
				"provides_when_sheltered": true,
			},
			{
				"id": "power",
				"name": "街角电厂",
				"short": "电",
				"art_id": "bld.power",
				"cost": 16,
				"build_seconds": 2.0,
				"hp": 10,
				"housing": 0,
				"income": 0.0,
				"power_supply": 3,
				"power_cost": 0,
				"civilian": true,
				"role": "power",
				"needs_exposure": false,
				"runs_when_sheltered": true,
				"provides_when_sheltered": true,
			},
			{
				"id": "hangar",
				"name": "机库",
				"short": "库",
				"art_id": "bld.hangar",
				"cost": 18,
				"build_seconds": 2.2,
				"hp": 12,
				"housing": 0,
				"income": 0.0,
				"power_supply": 0,
				"power_cost": 0,
				"civilian": true,
				"role": "hangar",
				"needs_exposure": false,
				"runs_when_sheltered": true,
				"provides_when_sheltered": true,
			},
			{
				"id": "turret_light",
				"name": "轻炮位",
				"short": "炮",
				"art_id": "bld.turret_light",
				"cost": 10,
				"build_seconds": 1.2,
				"hp": 6,
				"housing": 0,
				"income": 0.0,
				"power_supply": 0,
				"power_cost": 1,
				"civilian": false,
				"role": "weapon",
				"needs_exposure": true,
				"runs_when_sheltered": false,
				"provides_when_sheltered": false,
				"weapon": {"damage": 4, "range": 4, "can_push": true},
			},
			{
				"id": "turret",
				"name": "城防炮",
				"short": "炮",
				"art_id": "bld.turret",
				"cost": 16,
				"build_seconds": 1.8,
				"hp": 9,
				"housing": 0,
				"income": 0.0,
				"power_supply": 0,
				"power_cost": 1,
				"civilian": false,
				"role": "weapon",
				"needs_exposure": true,
				"runs_when_sheltered": false,
				"provides_when_sheltered": false,
				"weapon": {"damage": 6, "range": 6, "can_push": true},
			},
		],
		"monsters": [
			{
				"id": "reef_maw",
				"name": "礁喉",
				"short": "礁",
				"art_id": "unit.monster",
				"hp": 14,
				"damage": 3,
				"movement": "amphibious",
				"footprint": [[0, 0]],
				"target": "core",
				"attack": "melee",
				"attack_range": 1,
				"pushable": true,
				"detected": true,
				"special": [],
				"corpse_work": 12,
				"research": 2,
				"money": 0,
				"rot_delay": 16.0,
				"rot_interval": 8.0,
				"rot_morale": -2,
			},
			{
				"id": "salt_claw",
				"name": "盐螯",
				"short": "盐",
				"art_id": "unit.monster",
				"hp": 18,
				"damage": 4,
				"movement": "amphibious",
				"footprint": [[0, 0]],
				"target": "mech",
				"attack": "melee",
				"attack_range": 1,
				"pushable": true,
				"detected": true,
				"special": [],
				"corpse_work": 14,
				"research": 2,
				"money": 0,
				"rot_delay": 16.0,
				"rot_interval": 8.0,
				"rot_morale": -2,
			},
			{
				"id": "abyss_ridge",
				"name": "渊脊",
				"short": "渊",
				"art_id": "unit.boss",
				"hp": 32,
				"damage": 5,
				"movement": "amphibious",
				"footprint": [[0, 0], [1, 0]],
				"target": "core",
				"attack": "ranged",
				"attack_range": 5,
				"pushable": true,
				"detected": true,
				"special": [],
				"corpse_work": 18,
				"research": 3,
				"money": 0,
				"rot_delay": 18.0,
				"rot_interval": 8.0,
				"rot_morale": -3,
			},
		],
		"waves": [
			{
				"id": "wave_1",
				"name": "第一波",
				"warning_seconds": 10.0,
				"final": false,
				"spawns": [{"def_id": "reef_maw", "x": 4, "y": 2}],
			},
			{
				"id": "wave_2",
				"name": "第二波",
				"warning_seconds": 10.0,
				"final": false,
				"spawns": [{"def_id": "salt_claw", "x": 1, "y": 3}],
			},
			{
				"id": "wave_final",
				"name": "最终波",
				"warning_seconds": 12.0,
				"final": true,
				"spawns": [{"def_id": "abyss_ridge", "x": 6, "y": 2}],
			},
		],
	}
