extends SceneTree

var frames := 0
var main: Node
var placed := false


func _init() -> void:
	var packed: PackedScene = load("res://view/main.tscn")
	main = packed.instantiate()
	root.add_child(main)


func _process(_delta: float) -> bool:
	frames += 1
	if frames == 4:
		main._on_action("tool:lift")
		main._on_cell(4, 12)
		main._on_cell(4, 2)
		for _i in 24:
			main._process(0.5)
		main._on_action("warn")
		main._on_action("engage")
		placed = true
	if frames < 8:
		return false
	var state: Dictionary = main.state
	var cells := int(main.grid_view.cell_count())
	var grids := int(state.grids.size())
	var font_ok := main.theme != null and main.theme.default_font != null
	var fighting := str(state.phase) == "combat" and int(state.monsters.size()) == 1
	var sea_spawn := false
	if fighting:
		var monster: Dictionary = state.monsters[0]
		sea_spawn = str(state.board.cells[int(monster.y) * 9 + int(monster.x)].region) == "sea"
	var ok := int(state.board.w) == 9 and int(state.board.h) == 18 and cells == 162 and grids == 1 and font_ok and placed and fighting and sea_spawn
	print("SMOKE cells=%d grids=%d phase=%s font=%s" % [cells, grids, str(state.phase), str(font_ok)])
	if not ok:
		print("SMOKE FAIL")
		quit(1)
	else:
		print("SMOKE OK")
		quit(0)
	return true
