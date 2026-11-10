extends SceneTree

var frames := 0
var main: Node
var placed := false
var grouped := false
var grid_then_building := false
var turn_ok := false


func _init() -> void:
	var packed: PackedScene = load("res://view/main.tscn")
	main = packed.instantiate()
	root.add_child(main)


func _process(_delta: float) -> bool:
	frames += 1
	if frames == 3:
		main._on_cell(3, 12)
		var empty_ids := _action_ids(main._view_model())
		main._on_cell(4, 2)
		var sea_ids := _action_ids(main._view_model())
		grouped = empty_ids.has("build_here:light") and empty_ids.has("build_here:lift") and empty_ids.has("end_day") and not empty_ids.has("build_here:housing") and not empty_ids.has("mode:move") and not empty_ids.has("speed1") and not empty_ids.has("pause") and sea_ids.has("build_here:light") == false
		turn_ok = str(main._turn_label()) == "和平 1月1日"
	if frames == 4:
		main._on_action("tool:lift")
		main._on_cell(4, 12)
		main._on_cell(4, 2)
		main._on_action("end_day")
		main._on_cell(4, 12)
		var built_ids := _action_ids(main._view_model())
		grid_then_building = built_ids.has("build_here:housing") and built_ids.has("build_here:turret") and not built_ids.has("build_here:light")
		main._on_action("warn")
		main._on_action("engage")
		placed = true
	if frames < 8:
		return false
	var state: Dictionary = main.state
	var cells := int(main.grid_view.cell_count())
	var grids := int(state.grids.size())
	var font_ok := main.theme != null and main.theme.default_font != null
	var board_size: Vector2 = main.grid_view.custom_minimum_size
	var iso_board := board_size.x > board_size.y and board_size.x > 640.0
	var fighting := str(state.phase) == "combat" and int(state.monsters.size()) == 1
	var sea_spawn := false
	if fighting:
		var monster: Dictionary = state.monsters[0]
		sea_spawn = str(state.board.cells[int(monster.y) * 9 + int(monster.x)].region) == "sea"
	var ok := int(state.board.w) == 9 and int(state.board.h) == 18 and cells == 162 and grids == 1 and font_ok and placed and fighting and sea_spawn and iso_board and grouped and grid_then_building and turn_ok
	print("SMOKE cells=%d grids=%d phase=%s font=%s board=%sx%s grouped=%s built=%s turn=%s" % [cells, grids, str(state.phase), str(font_ok), board_size.x, board_size.y, str(grouped), str(grid_then_building), str(turn_ok)])
	if not ok:
		print("SMOKE FAIL")
		quit(1)
	else:
		print("SMOKE OK")
		quit(0)
	return true


func _action_ids(vm: Dictionary) -> Array:
	var ids: Array = []
	for group in vm.get("groups", []):
		for action in group.get("actions", []):
			ids.append(str(action.get("id", "")))
	return ids
