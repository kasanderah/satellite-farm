extends Control

const Catalog = preload("res://data/catalog.gd")
const Spatial = preload("res://sim/spatial.gd")

signal cell_pressed(x: int, y: int)

const CELL := 32
const GAP := 2

const COLOR := {
	"ocean": Color("163e66"),
	"coast": Color("2f7c78"),
	"plain": Color("5f7d52"),
	"grid.light": Color("e0c56a"),
	"grid.lift": Color("8ea4bc"),
	"grid.ruined": Color("4e463f"),
	"bld.housing_light": Color("b7e4c7"),
	"bld.housing": Color("74c69d"),
	"bld.power": Color("f4d35e"),
	"bld.hangar": Color("b39ddb"),
	"bld.turret_light": Color("f4a261"),
	"bld.turret": Color("e76f51"),
	"unit.mech": Color("f4f7fb"),
	"unit.monster": Color("c0392b"),
	"unit.boss": Color("6c2a22"),
	"cover": Color("3b2424"),
	"cc": Color("f2d16b"),
	"cc_core": Color("ff5d3a"),
}

var _cells := {}
var _overlay: Control
var _locks := {}
var _built := false


func cell_count() -> int:
	return _cells.size()


func setup(state: Dictionary) -> void:
	if _built:
		return
	_built = true
	var w := int(state.board.w)
	var h := int(state.board.h)
	custom_minimum_size = Vector2(w * (CELL + GAP), h * (CELL + GAP))
	for y in h:
		for x in w:
			_cells[_key(x, y)] = _make_cell(x, y)
	_overlay = Control.new()
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.position = Vector2.ZERO
	_overlay.size = custom_minimum_size
	add_child(_overlay)


func sync(state: Dictionary, marks: Dictionary) -> void:
	if not _built:
		setup(state)
	var reach: Dictionary = {}
	for key in marks.get("reach", []):
		reach[str(key)] = true
	var move_mark := _mark_set(marks.get("move", []))
	var attack_mark := _mark_set(marks.get("attack", []))
	var selected := str(marks.get("selected", ""))
	for cell in state.board.cells:
		var x := int(cell.x)
		var y := int(cell.y)
		var key := _key(x, y)
		var pack: Dictionary = _cells[key]
		var terrain := str(cell.terrain)
		pack.terrain.color = COLOR.get(terrain, COLOR.plain)
		_draw_stack(state, pack, x, y)
		var outline: ColorRect = pack.outline
		outline.color = Color(0, 0, 0, 0)
		if attack_mark.has(key):
			outline.color = Color(0.95, 0.25, 0.2, 0.95)
		elif move_mark.has(key):
			outline.color = Color(0.95, 0.82, 0.25, 0.95)
		elif key == selected:
			outline.color = Color(0.95, 0.95, 0.95, 0.95)
		elif reach.has(key):
			outline.color = Color(0.45, 0.9, 0.55, 0.8)
		var panel: Control = pack.panel
		if not _locks.has(key):
			panel.scale = Vector2.ONE
		if panel.size.x > 1.0:
			panel.pivot_offset = panel.size * 0.5


func play(events: Array) -> void:
	for event in events:
		var kind := str(event.get("kind", ""))
		var x := int(event.get("x", -1))
		var y := int(event.get("y", -1))
		match kind:
			"construct", "spawn":
				_pulse(x, y, 0.25)
			"stance":
				_pulse(x, y, 0.72)
				_flash(x, y, Color(0.65, 0.82, 1.0, 0.0))
			"damage":
				_flash(x, y, Color(1.0, 0.35, 0.28, 0.0))
			"attack":
				_bolt(x, y, int(event.get("tx", x)), int(event.get("ty", y)))
				_flash(int(event.get("tx", x)), int(event.get("ty", y)), Color(1.0, 0.82, 0.35, 0.0))
			"death":
				_ghost(x, y, Color("c0392b") if str(event.get("who", "")) == "monster" else Color("f4f7fb"))
				_flash(x, y, Color(1, 1, 1, 0))
			"clear":
				_flash(x, y, Color(0.6, 0.9, 0.55, 0))
			"bad_end":
				_flash(x, y, Color(1.0, 0.15, 0.1, 0))
				_pulse(x, y, 1.15)


func _draw_stack(state: Dictionary, pack: Dictionary, x: int, y: int) -> void:
	var grid := Spatial.grid_at(state, x, y)
	var label: String = ""
	var bar := 0.0
	pack.grid.visible = false
	pack.peace.visible = false
	pack.weapon.visible = false
	pack.unit.visible = false
	pack.cover.visible = false
	pack.cc.visible = false
	if not grid.is_empty():
		var def := Spatial.grid_def_for(grid)
		var art := "grid.ruined" if bool(grid.ruined) else str(def.get("art_id", "grid.light"))
		pack.grid.visible = true
		pack.grid.color = COLOR.get(art, COLOR["grid.light"])
		if bool(grid.submerged):
			pack.grid.color = pack.grid.color.lerp(Color("24556e"), 0.45)
		if float(grid.construct_total) > 0.0 and float(grid.construct_remaining) > 0.0:
			label = "建"
			bar = 1.0 - float(grid.construct_remaining) / float(grid.construct_total)
		else:
			label = str(def.get("short", ""))
			bar = float(grid.hp) / maxf(1.0, float(grid.max_hp))
		for slot in grid.slots:
			if int(slot.building_id) < 0:
				continue
			var building := Spatial.building_by_id(state, int(slot.building_id))
			if building.is_empty():
				continue
			var bdef := Catalog.building(str(building.def_id))
			var swatch: ColorRect = pack.weapon if str(bdef.get("role", "")) == "weapon" else pack.peace
			swatch.visible = true
			swatch.color = COLOR.get(str(bdef.get("art_id", "")), Color.WHITE)
			if float(building.construct_remaining) > 0.0:
				swatch.color = swatch.color.darkened(0.35)
				label = "建"
			elif not Spatial.facility_exposed(state, building) and str(building.slot_role) == "peace":
				swatch.color = swatch.color.darkened(0.25)
	if Spatial.is_cc(state, x, y):
		var cc: Dictionary = state.command_center
		pack.cc.visible = true
		pack.cc.color = COLOR.cc_core if bool(cc.core_exposed) else COLOR.cc
		label = "核" if bool(cc.core_exposed) else "指"
		var wall_ratio := float(cc.wall_hp) / maxf(1.0, float(cc.wall_max))
		var core_ratio := float(cc.core_hp) / maxf(1.0, float(cc.core_max))
		bar = wall_ratio if int(cc.wall_hp) > 0 else core_ratio
	var monster := Spatial.monster_at(state, x, y)
	if not monster.is_empty():
		pack.unit.visible = true
		pack.unit.color = COLOR.get(str(monster.art_id), COLOR["unit.monster"])
		label = str(monster.short)
		bar = float(monster.hp) / maxf(1.0, float(monster.max_hp))
	var mech := Spatial.mech_at(state, x, y)
	if not mech.is_empty():
		pack.unit.visible = true
		pack.unit.color = COLOR["unit.mech"]
		label = str(mech.short)
		bar = float(mech.hp) / maxf(1.0, float(mech.max_hp))
	if Spatial.cover_blocks(state, x, y):
		pack.cover.visible = true
		if label == "" or label == "轻" or label == "升":
			label = "骸"
	var text: Label = pack.label
	text.text = label
	var on_dark := false
	if pack.unit.visible:
		on_dark = true
	elif str(Spatial.cell_at(state, x, y).terrain) == "ocean":
		on_dark = true
	text.add_theme_color_override("font_color", Color("f7f7f2") if on_dark else Color(0.08, 0.08, 0.08))
	var meter: ColorRect = pack.bar
	meter.visible = bar > 0.0
	meter.size.x = CELL * clampf(bar, 0.0, 1.0)
	meter.color = Color("d8f3dc") if bar > 0.35 else Color("f4a261")


func _make_cell(x: int, y: int) -> Dictionary:
	var panel := Button.new()
	panel.flat = true
	panel.position = Vector2(x * (CELL + GAP), y * (CELL + GAP))
	panel.size = Vector2(CELL, CELL)
	panel.focus_mode = Control.FOCUS_NONE
	panel.pressed.connect(func() -> void: cell_pressed.emit(x, y))
	add_child(panel)
	var outline := ColorRect.new()
	outline.mouse_filter = Control.MOUSE_FILTER_IGNORE
	outline.position = Vector2.ZERO
	outline.size = Vector2(CELL, CELL)
	outline.color = Color(0, 0, 0, 0)
	panel.add_child(outline)
	var terrain := _rect(panel, 2, 2, CELL - 4, CELL - 4, COLOR.plain)
	var grid := _rect(panel, 5, 5, CELL - 10, CELL - 10, COLOR["grid.light"])
	var peace := _rect(panel, 6, 16, 9, 9, COLOR["bld.housing"])
	var weapon := _rect(panel, CELL - 16, 16, 9, 9, COLOR["bld.turret"])
	var unit := _rect(panel, 9, 8, 14, 14, COLOR["unit.monster"])
	var cover := _rect(panel, 4, CELL - 8, CELL - 8, 4, COLOR.cover)
	var cc := _rect(panel, 7, 7, CELL - 14, CELL - 14, COLOR.cc)
	var flash := _rect(panel, 0, 0, CELL, CELL, Color(1, 1, 1, 0))
	var bar := _rect(panel, 2, 2, CELL - 4, 3, Color("d8f3dc"))
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.position = Vector2(0, 8)
	label.size = Vector2(CELL, 18)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color(0.08, 0.08, 0.08))
	panel.add_child(label)
	for node in [grid, peace, weapon, unit, cover, cc, bar]:
		node.visible = false
	return {
		"panel": panel,
		"outline": outline,
		"terrain": terrain,
		"grid": grid,
		"peace": peace,
		"weapon": weapon,
		"unit": unit,
		"cover": cover,
		"cc": cc,
		"flash": flash,
		"bar": bar,
		"label": label,
	}


func _rect(parent: Control, x: int, y: int, w: int, h: int, color: Color) -> ColorRect:
	var rect := ColorRect.new()
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.position = Vector2(x, y)
	rect.size = Vector2(w, h)
	rect.color = color
	parent.add_child(rect)
	return rect


func _pulse(x: int, y: int, from_scale: float) -> void:
	var pack = _pack(x, y)
	if pack.is_empty():
		return
	var panel: Control = pack.panel
	var key := _key(x, y)
	_locks[key] = true
	panel.pivot_offset = panel.size * 0.5
	panel.scale = Vector2(from_scale, from_scale)
	var tween := create_tween()
	tween.tween_property(panel, "scale", Vector2.ONE, 0.22)
	tween.finished.connect(func() -> void: _locks.erase(key))


func _flash(x: int, y: int, color: Color) -> void:
	var pack = _pack(x, y)
	if pack.is_empty():
		return
	var flash: ColorRect = pack.flash
	flash.color = Color(color.r, color.g, color.b, 0.0)
	var tween := create_tween()
	tween.tween_property(flash, "color:a", 0.72, 0.06)
	tween.tween_property(flash, "color:a", 0.0, 0.2)


func _ghost(x: int, y: int, color: Color) -> void:
	if x < 0 or y < 0:
		return
	var ghost := ColorRect.new()
	ghost.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ghost.color = color
	ghost.size = Vector2(14, 14)
	ghost.position = _center(x, y) - ghost.size * 0.5
	ghost.pivot_offset = ghost.size * 0.5
	_overlay.add_child(ghost)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(ghost, "scale", Vector2(0.15, 0.15), 0.28)
	tween.tween_property(ghost, "modulate:a", 0.0, 0.28)
	tween.chain().tween_callback(ghost.queue_free)


func _bolt(x: int, y: int, tx: int, ty: int) -> void:
	if x < 0 or y < 0:
		return
	var bolt := ColorRect.new()
	bolt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bolt.color = Color(1.0, 0.86, 0.35, 0.95)
	bolt.size = Vector2(8, 8)
	bolt.position = _center(x, y) - bolt.size * 0.5
	_overlay.add_child(bolt)
	var tween := create_tween()
	tween.tween_property(bolt, "position", _center(tx, ty) - bolt.size * 0.5, 0.16)
	tween.tween_callback(bolt.queue_free)


func _pack(x: int, y: int) -> Dictionary:
	var key := _key(x, y)
	if not _cells.has(key):
		return {}
	return _cells[key]


func _center(x: int, y: int) -> Vector2:
	return Vector2(x * (CELL + GAP) + CELL * 0.5, y * (CELL + GAP) + CELL * 0.5)


func _key(x: int, y: int) -> String:
	return "%d,%d" % [x, y]


func _mark_set(items: Array) -> Dictionary:
	var found := {}
	for item in items:
		found[str(item)] = true
	return found
