extends Control

const Catalog = preload("res://data/catalog.gd")
const Spatial = preload("res://sim/spatial.gd")

signal cell_pressed(x: int, y: int)

## Chunky pixel diamonds, 56 wide and 43 tall. Actors are a standing layer above the tile.
const TILE_W := 56
const TILE_H := 43
const HALF_W := 28
const HALF_H := 21
const SKIRT := 8
const HEADROOM := 48
const PX := 1
const ACTOR_SCALE := 2

const TERRAIN := {
	"ocean": Color("163e66"),
	"coast": Color("2f7c78"),
	"reef": Color("2f6a62"),
	"plain": Color("5f7d52"),
	"mountain": Color("6e675c"),
}

var pixel_scale := 1
var design_size := Vector2.ZERO
var _cells := 0
var _w := 0
var _h := 0
var _built := false
var _origin := Vector2.ZERO
var _wave := 0.0
var _state: Dictionary = {}
var _marks: Dictionary = {}
var _hover := Vector2i(-1, -1)
var _order: Array = []
var _flashes := {}
var _bolts: Array = []
var _ghosts: Array = []
var _tip_box: PanelContainer
var _tip: Label


func cell_count() -> int:
	return _cells


func setup(state: Dictionary) -> void:
	if _built:
		return
	_built = true
	_state = state
	_w = int(state.board.w)
	_h = int(state.board.h)
	_cells = _w * _h
	_order = _sorted_cells()
	_layout()
	mouse_filter = Control.MOUSE_FILTER_STOP
	_tip_box = PanelContainer.new()
	_tip_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip_box.visible = false
	_tip_box.z_index = 5
	var tip_style := StyleBoxFlat.new()
	tip_style.bg_color = Color("1a1e22")
	tip_style.border_color = Color("cbb892")
	tip_style.set_border_width_all(1)
	tip_style.set_content_margin_all(6)
	_tip_box.add_theme_stylebox_override("panel", tip_style)
	_tip = Label.new()
	_tip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_tip.add_theme_font_size_override("font_size", 14)
	_tip.add_theme_color_override("font_color", Color("f4f1ea"))
	_tip_box.add_child(_tip)
	add_child(_tip_box)
	set_process(true)


func set_pixel_scale(next: int) -> void:
	pixel_scale = clampi(next, 1, 4)
	if _built:
		_layout()
	queue_redraw()


func sync(state: Dictionary, marks: Dictionary) -> void:
	if not _built:
		setup(state)
	_state = state
	_marks = marks
	queue_redraw()


func play(events: Array) -> void:
	var started := false
	for event in events:
		var kind := str(event.get("kind", ""))
		var x := int(event.get("x", -1))
		var y := int(event.get("y", -1))
		match kind:
			"construct", "spawn":
				_flash(x, y, Color("f2d16b"))
				started = true
			"stance":
				_flash(x, y, Color("8eb4d4"))
				started = true
			"damage", "bad_end":
				_flash(x, y, Color("e76f51"))
				started = true
			"attack":
				_bolt(x, y, int(event.get("tx", x)), int(event.get("ty", y)))
				_flash(int(event.get("tx", x)), int(event.get("ty", y)), Color("f4a261"))
				started = true
			"death":
				_ghost(x, y, Color("c0392b") if str(event.get("who", "")) == "monster" else Color("f4f7fb"))
				_flash(x, y, Color("f7f4ea"))
				started = true
			"clear":
				_flash(x, y, Color("b7e4c7"))
				started = true
	if started:
		set_process(true)


func _process(delta: float) -> void:
	_wave += delta
	var busy := true
	var dead: Array = []
	for key in _flashes.keys():
		_flashes[key].life = float(_flashes[key].life) - delta
		if float(_flashes[key].life) <= 0.0:
			dead.append(key)
		else:
			busy = true
	for key in dead:
		_flashes.erase(key)
	var bolts: Array = []
	for bolt in _bolts:
		bolt.t = float(bolt.t) + delta / 0.16
		if float(bolt.t) < 1.0:
			bolts.append(bolt)
			busy = true
	_bolts = bolts
	var ghosts: Array = []
	for ghost in _ghosts:
		ghost.life = float(ghost.life) - delta
		if float(ghost.life) > 0.0:
			ghosts.append(ghost)
			busy = true
	_ghosts = ghosts
	if busy:
		queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		var next := _pick(motion.position)
		if next != _hover:
			_hover = next
			_show_tip(motion.position)
			queue_redraw()
		else:
			_move_tip(motion.position)
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.pressed and button.button_index == MOUSE_BUTTON_LEFT:
			var hit := _pick(button.position)
			if hit.x >= 0:
				cell_pressed.emit(hit.x, hit.y)
				accept_event()


func _notification(what: int) -> void:
	if what == NOTIFICATION_MOUSE_EXIT:
		_hover = Vector2i(-1, -1)
		if _tip_box != null:
			_tip_box.visible = false
		queue_redraw()


func _draw() -> void:
	if not _built or _state.is_empty():
		return
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(pixel_scale, pixel_scale))
	for cell in _order:
		_draw_tile(int(cell.x), int(cell.y))
	for bolt in _bolts:
		var at: Vector2 = bolt.a.lerp(bolt.b, clampf(float(bolt.t), 0.0, 1.0))
		draw_rect(Rect2(at.x - 4 * PX, at.y - 4 * PX, 8 * PX, 8 * PX), Color("f2d16b"))
	for ghost in _ghosts:
		var life := clampf(float(ghost.life) / 0.28, 0.0, 1.0)
		var size := 14.0 + (1.0 - life) * 18.0
		var at: Vector2 = ghost.at
		draw_rect(Rect2(at.x - size * 0.5, at.y - size * 0.5, size, size), Color(ghost.color.r, ghost.color.g, ghost.color.b, life))


func _draw_tile(x: int, y: int) -> void:
	var center := _center(x, y)
	var terrain := str(Spatial.cell_at(_state, x, y).get("terrain", "plain"))
	var fill: Color = TERRAIN.get(terrain, TERRAIN.plain)
	var grid := Spatial.grid_at(_state, x, y)
	if not grid.is_empty() and float(grid.construct_remaining) > 0.0:
		fill = Color("d4892a")
	elif (x + y) % 2 == 1:
		fill = fill.lightened(0.05)
	if y == _h - 1:
		_skirt(center, -1, _skirt_color(terrain))
	if x == _w - 1:
		_skirt(center, 1, _skirt_color(terrain))
	_paint_tile(center, fill, true)
	_draw_terrain_mark(center, terrain, fill)
	_draw_plate(x, y, center)
	var look := _mark_look(x, y)
	if look.fill.a > 0.0:
		_paint_tile(center, look.fill, false)
	if look.stroke.a > 0.0:
		_stroke_tile(center, look.stroke, int(look.thick))
	var key := _key(x, y)
	if _flashes.has(key):
		var flash: Dictionary = _flashes[key]
		var alpha := clampf(float(flash.life) / 0.28, 0.0, 0.7)
		var tint: Color = flash.color
		_paint_tile(center, Color(tint.r, tint.g, tint.b, alpha), false)
	_draw_contents(x, y, center)


func _draw_plate(x: int, y: int, center: Vector2) -> void:
	if Spatial.is_cc(_state, x, y):
		var cc: Dictionary = _state.command_center
		var plate := Color("f2d16b") if not bool(cc.core_exposed) else Color("ff5d3a")
		_fill_iso(center + Vector2(0, 2), 16, 7, plate.darkened(0.15))
		return
	var grid := Spatial.grid_at(_state, x, y)
	if grid.is_empty():
		return
	var def := Spatial.grid_def_for(grid)
	var art := "grid.ruined" if bool(grid.ruined) else str(def.get("art_id", "grid.light"))
	var plate: Color = _art_color(art)
	if bool(grid.submerged):
		plate = plate.lerp(Color("24556e"), 0.45)
	if float(grid.construct_remaining) > 0.0:
		plate = plate.darkened(0.35)
	_fill_iso(center + Vector2(0, 2), 16, 7, plate)
	if float(grid.construct_total) > 0.0 and float(grid.construct_remaining) > 0.0:
		var done := 1.0 - float(grid.construct_remaining) / float(grid.construct_total)
		_bar(center + Vector2(0, 12), done, 28.0)
	elif _key(x, y) == str(_marks.get("selected", "")):
		_bar(center + Vector2(0, 12), float(grid.hp) / maxf(1.0, float(grid.max_hp)), 28.0)


func _draw_contents(x: int, y: int, center: Vector2) -> void:
	var grid := Spatial.grid_at(_state, x, y)
	var buildings: Array = []
	if not grid.is_empty():
		for slot in grid.slots:
			if int(slot.building_id) < 0:
				continue
			var building := Spatial.building_by_id(_state, int(slot.building_id))
			if building.is_empty():
				continue
			buildings.append({"building": building, "role": str(slot.role)})
	var split := buildings.size() > 1
	for item in buildings:
		var building: Dictionary = item.building
		var bdef := Catalog.building(str(building.def_id))
		var shift := Vector2.ZERO
		if split:
			shift = Vector2(12, 0) if str(item.role) == "intercept" or str(bdef.get("role", "")) == "weapon" else Vector2(-12, 0)
		var building_id := str(building.def_id)
		var dim := float(building.construct_remaining) > 0.0
		if str(building.slot_role) == "peace" and not Spatial.facility_exposed(_state, building):
			dim = true
		var top := _blit(_stand(center, shift), _sprite_rows(building_id), _sprite_colors(building_id), ACTOR_SCALE, dim)
		if float(building.construct_remaining) > 0.0:
			_blit(Vector2(center.x + shift.x, top - 2.0), _SCAFFOLD, {"y": Color("e0c56a")}, ACTOR_SCALE, false)
	if Spatial.cover_blocks(_state, x, y):
		_blit(center + Vector2(0, 14), _RUBBLE, {"k": Color("3b2424"), "s": Color("6a5348")}, ACTOR_SCALE, false)
	if Spatial.is_cc(_state, x, y):
		var exposed := bool(_state.command_center.core_exposed)
		var rows := _CC_OPEN if exposed else _CC
		var top := _blit(_stand(center), rows, _cc_colors(), ACTOR_SCALE, false)
		var wall := float(_state.command_center.wall_hp) / maxf(1.0, float(_state.command_center.wall_max))
		var core := float(_state.command_center.core_hp) / maxf(1.0, float(_state.command_center.core_max))
		_bar(Vector2(center.x, top - 4), wall if int(_state.command_center.wall_hp) > 0 else core, 24.0)
	var monster := Spatial.monster_at(_state, x, y)
	if not monster.is_empty() and int(monster.x) == x and int(monster.y) == y:
		var shift := _foot_shift(monster.footprint)
		var top := _blit(_stand(center, shift), _sprite_rows(str(monster.def_id)), _sprite_colors(str(monster.def_id)), ACTOR_SCALE, false)
		_bar(Vector2(center.x + shift.x, top - 4), float(monster.hp) / maxf(1.0, float(monster.max_hp)), 24.0)
	var mech := Spatial.mech_at(_state, x, y)
	if not mech.is_empty():
		var top := _blit(_stand(center), _sprite_rows("warden"), _sprite_colors("warden"), ACTOR_SCALE, false)
		_bar(Vector2(center.x, top - 4), float(mech.hp) / maxf(1.0, float(mech.max_hp)), 24.0)


func _mark_look(x: int, y: int) -> Dictionary:
	var key := _key(x, y)
	var fill := Color(0, 0, 0, 0)
	var stroke := Color(0, 0, 0, 0)
	var thick := 1
	if _marked("ports", key):
		stroke = Color("8ea4bc")
	if _marked("reach", key):
		fill = Color(0.49, 0.78, 0.62, 0.33)
		stroke = Color("7dcea0")
	if _marked("aim", key):
		fill = Color(0.93, 0.55, 0.28, 0.28)
		stroke = Color("f4a261")
		thick = 2
	if key == str(_marks.get("selected", "")):
		stroke = Color("f7f4ea")
		thick = 2
		if fill.a < 0.05:
			fill = Color(1, 1, 1, 0.18)
	if _marked("move", key):
		stroke = Color("e0c56a")
		thick = 2
	if _marked("attack", key):
		fill = Color(0.85, 0.28, 0.22, 0.30)
		stroke = Color("e76f51")
		thick = 2
	if stroke.a <= 0.0 and _hover == Vector2i(x, y):
		stroke = Color(1, 1, 1, 0.55)
	return {"fill": fill, "stroke": stroke, "thick": thick}


func _show_tip(at: Vector2) -> void:
	if _hover.x < 0:
		_tip_box.visible = false
		return
	_tip.text = _tip_text(_hover.x, _hover.y)
	_tip_box.visible = _tip.text != ""
	_move_tip(at)


func _move_tip(at: Vector2) -> void:
	if _tip_box == null or not _tip_box.visible:
		return
	_tip_box.position = Vector2(clampf(at.x + 16, 0, maxf(0, size.x - 160)), clampf(at.y + 14, 0, maxf(0, size.y - 36)))


func _tip_text(x: int, y: int) -> String:
	if Spatial.is_cc(_state, x, y):
		return "指挥中心"
	var mech := Spatial.mech_at(_state, x, y)
	if not mech.is_empty():
		return "%s  %d/%d" % [str(mech.name), int(mech.hp), int(mech.max_hp)]
	var monster := Spatial.monster_at(_state, x, y)
	if not monster.is_empty():
		return "%s  %d/%d" % [str(monster.name), int(monster.hp), int(monster.max_hp)]
	var grid := Spatial.grid_at(_state, x, y)
	if not grid.is_empty():
		var def := Spatial.grid_def_for(grid)
		var name := str(def.get("name", "网格"))
		if float(grid.construct_remaining) > 0.0:
			return "%s  施工中" % name
		return "%s  %d/%d" % [name, int(grid.hp), int(grid.max_hp)]
	if Spatial.cover_blocks(_state, x, y):
		return "覆盖"
	var cell := Spatial.cell_at(_state, x, y)
	if str(cell.terrain) == "mountain":
		return "山地"
	if str(cell.terrain) == "reef":
		return "礁石"
	if str(cell.region) == "sea":
		return "岸线" if str(cell.terrain) == "coast" else "海域"
	return "空地"


func _layout() -> void:
	var min_x := 0.0
	var max_x := 0.0
	var min_y := 0.0
	var max_y := 0.0
	for y in _h:
		for x in _w:
			var raw := Vector2((x - y) * HALF_W, (x + y) * HALF_H + _drop(x, y))
			min_x = minf(min_x, raw.x - HALF_W)
			max_x = maxf(max_x, raw.x + HALF_W)
			min_y = minf(min_y, raw.y - HALF_H - HEADROOM)
			max_y = maxf(max_y, raw.y + HALF_H + SKIRT)
	_origin = Vector2(round(10.0 - min_x), round(10.0 - min_y))
	design_size = Vector2(round(max_x - min_x + 24.0), round(max_y - min_y + 24.0))
	custom_minimum_size = design_size * float(pixel_scale)
	size = custom_minimum_size


func _sorted_cells() -> Array:
	var cells: Array = []
	for y in _h:
		for x in _w:
			cells.append(Vector2i(x, y))
	cells.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var sa := a.x + a.y
		var sb := b.x + b.y
		if sa == sb:
			return a.x < b.x
		return sa < sb
	)
	return cells


func _center(x: int, y: int) -> Vector2:
	var raw := _origin + Vector2((x - y) * HALF_W, (x + y) * HALF_H + _drop(x, y) + _bob(x, y))
	return Vector2(round(raw.x), round(raw.y))


func _bob(x: int, y: int) -> float:
	var terrain := str(Spatial.cell_at(_state, x, y).get("terrain", "plain"))
	if terrain != "ocean" and terrain != "coast" and terrain != "reef":
		return 0.0
	return sin(_wave * 2.2 + float(x) * 0.85 + float(y) * 0.45) * 2.0


func _drop(x: int, y: int) -> int:
	var terrain := str(Spatial.cell_at(_state, x, y).get("terrain", "plain"))
	if terrain == "ocean":
		return 4
	if terrain == "coast" or terrain == "reef":
		return 2
	if terrain == "mountain":
		return -2
	return 0


func _pick(at: Vector2) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_score := -999
	for cell in _order:
		var x := int(cell.x)
		var y := int(cell.y)
		if not _hit(x, y, at / float(maxi(pixel_scale, 1))):
			continue
		var score := (x + y) * 100 + x
		if score >= best_score:
			best_score = score
			best = Vector2i(x, y)
	return best


func _hit(x: int, y: int, at: Vector2) -> bool:
	var center := _center(x, y)
	var dx := absi(int(at.x) - int(center.x))
	var dy := absi(int(at.y) - int(center.y))
	return dx * HALF_H + dy * HALF_W <= HALF_W * HALF_H


func _stand(center: Vector2, shift: Vector2 = Vector2.ZERO) -> Vector2:
	return center + shift


func _paint_tile(center: Vector2, fill: Color, outlined: bool) -> void:
	var top_y := int(round(center.y)) - HALF_H
	var cx := int(round(center.x))
	var front := fill.darkened(0.28)
	var edge := Color(0, 0, 0, 0.6)
	for i in TILE_H:
		var half := _tile_half(i)
		var y := top_y + i
		var row_color := front if i >= TILE_H - 8 else fill
		draw_rect(Rect2(cx - half, y, half * 2, 1), row_color)
		if not outlined:
			continue
		draw_rect(Rect2(cx - half, y, 1, 1), edge)
		draw_rect(Rect2(cx + half - 1, y, 1, 1), edge)
		if i < 2 or i >= TILE_H - 2:
			draw_rect(Rect2(cx - half, y, half * 2, 1), edge)


func _stroke_tile(center: Vector2, color: Color, thick: int) -> void:
	var top_y := int(round(center.y)) - HALF_H
	var cx := int(round(center.x))
	for i in TILE_H:
		var half := _tile_half(i)
		var y := top_y + i
		for t in thick:
			draw_rect(Rect2(cx - half + t, y, 1, 1), color)
			draw_rect(Rect2(cx + half - 1 - t, y, 1, 1), color)
		if i < thick or i >= TILE_H - thick:
			draw_rect(Rect2(cx - half, y, max(half * 2, 1), 1), color)


func _tile_half(i: int) -> int:
	var dist := absi(i - HALF_H)
	var half := int(round(float(HALF_W) * float(HALF_H + 1 - dist) / float(HALF_H + 1)))
	return clampi(half, 1, HALF_W)


func _fill_iso(center: Vector2, half_w: int, half_h: int, color: Color) -> void:
	if half_h <= 0 or half_w <= 0:
		return
	var top_y := int(round(center.y)) - half_h
	var cx := int(round(center.x))
	var height := half_h * 2
	for i in height:
		var half := _row_half(i, half_w, half_h, height)
		if half <= 0:
			continue
		draw_rect(Rect2(cx - half, top_y + i, half * 2, 1), color)


func _row_half(i: int, half_w: int, half_h: int, height: int) -> int:
	if i < half_h:
		return int((i + 1) * half_w / float(half_h))
	return int((height - i) * half_w / float(half_h))


func _skirt(center: Vector2, side: int, color: Color) -> void:
	var mid := center + Vector2(side * HALF_W, 0)
	var bottom := center + Vector2(0, HALF_H)
	var mid_down := mid + Vector2(0, SKIRT)
	var bottom_down := bottom + Vector2(0, SKIRT)
	draw_colored_polygon(PackedVector2Array([mid, bottom, bottom_down, mid_down]), color)


func _draw_terrain_mark(center: Vector2, terrain: String, fill: Color) -> void:
	var cx := int(round(center.x))
	var cy := int(round(center.y))
	if terrain == "ocean" or terrain == "coast" or terrain == "reef":
		var crest := fill.lightened(0.2)
		draw_rect(Rect2(cx - 8, cy - 1, 6, 2), crest)
		draw_rect(Rect2(cx + 3, cy + 2, 5, 2), crest)
	if terrain == "reef":
		draw_rect(Rect2(cx - 7, cy - 4, 5, 3), Color("e7d7a8"))
		draw_rect(Rect2(cx + 2, cy + 1, 4, 3), Color("cbb892"))
	elif terrain == "mountain":
		draw_rect(Rect2(cx - 7, cy - 6, 14, 5), Color("8d867c"))
		draw_rect(Rect2(cx - 3, cy - 12, 6, 7), Color("d9d3c5"))
		draw_rect(Rect2(cx - 1, cy - 15, 2, 4), Color("f4f1ea"))


func _skirt_color(terrain: String) -> Color:
	if terrain == "ocean":
		return Color("0f2c44")
	if terrain == "coast" or terrain == "reef":
		return Color("1a4544")
	if terrain == "mountain":
		return Color("3f3b36")
	return Color("3e4638")


func _bar(at: Vector2, ratio: float, width: float) -> void:
	var clamped := clampf(ratio, 0.0, 1.0)
	var origin := Vector2(int(at.x - width * 0.5), int(at.y))
	draw_rect(Rect2(origin.x, origin.y, width, 3), Color(0, 0, 0, 0.65))
	draw_rect(Rect2(origin.x, origin.y, width * clamped, 3), Color("d8f3dc") if clamped > 0.35 else Color("f4a261"))


func _blit(anchor: Vector2, rows: PackedStringArray, colors: Dictionary, scale: int, dim: bool) -> float:
	var height := rows.size()
	var width := 0
	if height > 0:
		width = rows[0].length()
	var origin := Vector2(int(anchor.x - width * scale * 0.5), int(anchor.y - height * scale))
	for y in height:
		var row := rows[y]
		for x in row.length():
			var ch := row.substr(x, 1)
			if ch == "." or not colors.has(ch):
				continue
			var color: Color = colors[ch]
			if dim:
				color = color.darkened(0.4)
			draw_rect(Rect2(origin.x + x * scale, origin.y + y * scale, scale, scale), color)
	return origin.y


func _foot_shift(footprint: Array) -> Vector2:
	if footprint.size() <= 1:
		return Vector2.ZERO
	var sx := 0.0
	var sy := 0.0
	for pair in footprint:
		sx += float((int(pair[0]) - int(pair[1])) * HALF_W)
		sy += float((int(pair[0]) + int(pair[1])) * HALF_H)
	return Vector2(sx / float(footprint.size()), sy / float(footprint.size()))


func _flash(x: int, y: int, color: Color) -> void:
	if x < 0 or y < 0:
		return
	_flashes[_key(x, y)] = {"color": color, "life": 0.28}


func _bolt(x: int, y: int, tx: int, ty: int) -> void:
	if x < 0 or y < 0:
		return
	_bolts.append({"a": _center(x, y), "b": _center(tx, ty), "t": 0.0})


func _ghost(x: int, y: int, color: Color) -> void:
	if x < 0 or y < 0:
		return
	_ghosts.append({"at": _center(x, y), "color": color, "life": 0.28})


func _marked(bucket: String, key: String) -> bool:
	return (_marks.get(bucket, []) as Array).has(key)


func _key(x: int, y: int) -> String:
	return "%d,%d" % [x, y]


func _art_color(art: String) -> Color:
	match art:
		"grid.light":
			return Color("e0c56a")
		"grid.lift":
			return Color("8ea4bc")
		"grid.ruined":
			return Color("4e463f")
		_:
			return Color("e0c56a")


func _sprite_rows(id: String) -> PackedStringArray:
	match id:
		"warden":
			return _WARDEN
		"housing_light":
			return _HOUSE_SMALL
		"housing":
			return _HOUSE
		"power":
			return _POWER
		"hangar":
			return _HANGAR
		"turret_light":
			return _TURRET_SMALL
		"turret":
			return _TURRET
		"reef_maw":
			return _REEF
		"salt_claw":
			return _SALT
		"abyss_ridge":
			return _ABYSS
		_:
			return _HOUSE_SMALL


func _sprite_colors(id: String) -> Dictionary:
	match id:
		"warden":
			return {"a": Color("f4f7fb"), "b": Color("e0a100"), "c": Color("2c333c")}
		"housing_light":
			return {"g": Color("b7e4c7"), "w": Color("efece4"), "d": Color("5d6b62")}
		"housing":
			return {"g": Color("74c69d"), "w": Color("efece4"), "d": Color("3d5c4e")}
		"power":
			return {"y": Color("f4d35e"), "k": Color("3d3424"), "c": Color("fff4c2")}
		"hangar":
			return {"p": Color("b39ddb"), "d": Color("4a3d66"), "w": Color("efeaf8")}
		"turret_light":
			return {"o": Color("f4a261"), "b": Color("6b3d28"), "m": Color("2b241f")}
		"turret":
			return {"r": Color("e76f51"), "b": Color("8d3e2f"), "m": Color("2b241f"), "k": Color("f2c1b0")}
		"reef_maw":
			return {"r": Color("8d3a34"), "m": Color("2a1214"), "h": Color("d07a6a")}
		"salt_claw":
			return {"s": Color("e6e0d2"), "k": Color("6d6458")}
		"abyss_ridge":
			return {"n": Color("241c22"), "s": Color("5c4a58"), "e": Color("c45a4a")}
		_:
			return {"g": Color("b7e4c7"), "w": Color("efece4"), "d": Color("5d6b62")}


func _cc_colors() -> Dictionary:
	return {"g": Color("f2d16b"), "c": Color("ff5d3a"), "k": Color("6b5424"), "w": Color("fff6d8")}


var _WARDEN := PackedStringArray([
	"......a......",
	".....aba.....",
	"....aaaaa....",
	".....aba.....",
	"....aacaa....",
	"...aaacaaa...",
	"...aaccacaa..",
	"....aacaa....",
	".....aca.....",
	".....aca.....",
	"....aa.aa....",
	"....a...a....",
	"....a...a....",
	"...aa...aa...",
	"...a.....a...",
	"..aa.....aa..",
	"..a.......a..",
	"...aa...aa...",
])
var _HOUSE_SMALL := PackedStringArray([
	"......g......",
	".....ggg.....",
	"....ggggg....",
	"...ggggggg...",
	"...gwwwwwg...",
	"...gwdddwg...",
	"...gwwwwwg...",
	"...gwwwwwg...",
	"...gwdddwg...",
	"...gwwwwwg...",
	"...gwwwwwg...",
	"...ddddddd...",
	"....ddddd....",
	".....ddd.....",
	".....ddd.....",
	"......d......",
])
var _HOUSE := PackedStringArray([
	"......g......",
	".....ggg.....",
	"....ggggg....",
	"...ggggggg...",
	"..ggggggggg..",
	"..gwwwwwwwg..",
	"..gwwdwdwwg..",
	"..gwwwwwwwg..",
	"..gwwwwwwwg..",
	"..gwdwwdwwg..",
	"..gwwwwwwwg..",
	"..gwwwwwwwg..",
	"..gwwdwdwwg..",
	"..gwwwwwwwg..",
	"..ddddddddd..",
	"...ddddddd...",
	"....ddddd....",
	".....ddd.....",
])
var _POWER := PackedStringArray([
	".....c.c.....",
	"....ckkkc....",
	".....yyy.....",
	"....yyyyy....",
	"...yyyyyyy...",
	"...yykkkyy...",
	"...yyyyyyy...",
	"...yykkkyy...",
	"...yyyyyyy...",
	"...yykkkyy...",
	"...yyyyyyy...",
	"....yyyyy....",
	".....yyy.....",
	"....kkkkk....",
	"...kkkkkkk...",
	"..kkkkkkkkk..",
])
var _HANGAR := PackedStringArray([
	"..ppppppppp..",
	".ppppppppppp.",
	"ppppppppppppp",
	"pwwwwdwdwwwwp",
	"pwwwwwwwwwwwp",
	"pwwddwwwwddwp",
	"pwwwwwwwwwwwp",
	"pwwwwwwwwwwwp",
	"pwwddwwwwddwp",
	"pwwwwwwwwwwwp",
	"pdddddddddddp",
	"pdddddddddddp",
	".ddddddddddd.",
	"..ddddddddd..",
	"...ddddddd...",
	"....ddddd....",
])
var _TURRET_SMALL := PackedStringArray([
	"......o......",
	".....ooo.....",
	"....boooob...",
	"......o......",
	".....ooo.....",
	"....ooooo....",
	"....oomoo....",
	".....ooo.....",
	"....ooooo....",
	"....mmmmm....",
	"...mmmmmmm...",
	"..mmmmmmmmm..",
	"...mmmmmmm...",
	"....mmmmm....",
	".....mmm.....",
	"......m......",
])
var _TURRET := PackedStringArray([
	"......r......",
	".....rrr.....",
	"....brrrrb...",
	"....rrrkrr...",
	".....rrr.....",
	"....rrrrr....",
	"....rrmrr....",
	".....rrr.....",
	"....rrrrr....",
	"....mmmmm....",
	"...mmmmmmm...",
	"..mmmmmmmmm..",
	"...mmmmmmm...",
	"....mmmmm....",
	".....mmm.....",
	"......m......",
])
var _REEF := PackedStringArray([
	"....rrrrrr....",
	"...rhhhhhr....",
	"..rhmmmmmmhr..",
	"..rmmmmmmmmr..",
	".rrrmmmmmmmrr.",
	".rrmmmmmmmmrr.",
	"..rmmmmmmmmr..",
	"..rrrrrrrrrr..",
	"...rrrrrrrr...",
	"....rrrrrr....",
	".....rrrr.....",
	"......rr......",
	".....rrrr.....",
	"....rrrrrr....",
	"...rrrrrrrr...",
	"..rrrrrrrrrr..",
])
var _SALT := PackedStringArray([
	"k...........k",
	"kk.........kk",
	"kkk.......kkk",
	".kkssssssskk.",
	"..ksssssssk..",
	"...ksssssk...",
	"....ksssk....",
	".....kkk.....",
	"......k......",
	".....kkk.....",
	"....kkkkk....",
	".....kkk.....",
	"....kkkkk....",
	"...kkkkkkk...",
	"....kkkkk....",
	".....kkk.....",
])
var _ABYSS := PackedStringArray([
	"...s.s.s.s...",
	"..sssssssss..",
	".nnsssssssnn.",
	"nnneeeeeeeenn",
	"nnneeeeeeeenn",
	".nnsssssssnn.",
	"..nnsssssnn..",
	"...nnsssnn...",
	"....nnnnn....",
	".....nnn.....",
	"......n......",
	".....nnn.....",
	"....nnnnn....",
	"...nnnnnnn...",
	"....nnnnn....",
	".....nnn.....",
])
var _RUBBLE := PackedStringArray([
	".k.s.k.",
	"ksskssk",
	".kkkkk.",
])
var _SCAFFOLD := PackedStringArray([
	".y.y.",
	"y.y.y",
	".y.y.",
])
var _CC := PackedStringArray([
	".....g.......",
	"....ggg......",
	"...ggggg.....",
	"..gwwkwwg....",
	"..gwwkwwg....",
	"..gwwkwwg....",
	"..gwwkwwg....",
	"..ggggggg....",
	"..gwwwwwg....",
	"..gwwkwwg....",
	"..gwwwwwg....",
	"..ggggggg....",
	".kkkkkkkkk...",
	"kkkkkkkkkkk..",
	".kkkkkkkkk...",
	"..kkkkkkk....",
	"...kkkkk.....",
	"....kkk......",
])
var _CC_OPEN := PackedStringArray([
	".....g.......",
	"....ggg......",
	"...ggggg.....",
	"..gwcwcwg....",
	"..gcccccg....",
	"..gwcwcwg....",
	"..gcccccg....",
	"..ggggggg....",
	"..gwcwcwg....",
	"..gcccccg....",
	"..gwwwwwg....",
	"..ggggggg....",
	".kkkkkkkkk...",
	"kkkkkkkkkkk..",
	".kkkkkkkkk...",
	"..kkkkkkk....",
	"...kkkkk.....",
	"....kkk......",
])
