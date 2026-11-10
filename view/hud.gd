extends VBoxContainer

signal action_requested(action: String)

var _signature := ""
var _groups: VBoxContainer
var banner: Label
var hint: Label
var status: Label
var detail: Label
var reason: Label
var card_title: Label
var card_meta: Label
var intents: Label
var log_label: Label
var _normal: StyleBoxFlat
var _hover: StyleBoxFlat
var _pressed: StyleBoxFlat
var _pixel_scale := 1


func set_pixel_scale(scale: int) -> void:
	var next := clampi(scale, 1, 4)
	if next == _pixel_scale:
		return
	_pixel_scale = next
	_restyle(self)


func _restyle(node: Node) -> void:
	if node is Label or node is Button:
		var base := int(node.get_meta("base_size", 0))
		if base > 0:
			node.add_theme_font_size_override("font_size", base * _pixel_scale)
	for child in node.get_children():
		_restyle(child)


func setup() -> void:
	add_theme_constant_override("separation", 8)
	_normal = _box(Color("2a3038"), Color("3d4652"))
	_hover = _box(Color("3a4450"), Color("cbb892"))
	_pressed = _box(Color("1e242b"), Color("f2d16b"))
	banner = _own("", 18, Color("f2d16b"))
	status = _own("", 16, Color("f4f1ea"))
	detail = _own("", 14, Color("d5d8df"))
	hint = _own("", 14, Color("d5d8df"))
	reason = _own("", 14, Color("ffb4a2"))
	for line in [banner, status, detail, hint, reason]:
		_wrap(line)
	var card := PanelContainer.new()
	var card_style := _box(Color("262b31"), Color("cbb892"))
	card_style.set_content_margin_all(10)
	card.add_theme_stylebox_override("panel", card_style)
	add_child(card)
	var card_box := VBoxContainer.new()
	card_box.add_theme_constant_override("separation", 4)
	card.add_child(card_box)
	card_title = _label("", 22, Color("f7f4ea"))
	card_box.add_child(card_title)
	card_meta = _label("", 14, Color("e4e0d6"))
	_wrap(card_meta)
	card_box.add_child(card_meta)
	_groups = VBoxContainer.new()
	_groups.add_theme_constant_override("separation", 12)
	add_child(_groups)
	_own("意图", 14, Color("cbb892"))
	intents = _own("", 14, Color("d5d8df"))
	_wrap(intents)
	_own("记录", 14, Color("cbb892"))
	log_label = _own("", 13, Color("b7bdc7"))
	_wrap(log_label)


func refresh(vm: Dictionary) -> void:
	banner.text = str(vm.get("banner", ""))
	hint.text = str(vm.get("hint", ""))
	status.text = str(vm.get("status", ""))
	detail.text = str(vm.get("detail", ""))
	reason.text = str(vm.get("reason", ""))
	card_title.text = str(vm.get("card_title", ""))
	card_meta.text = str(vm.get("card_meta", ""))
	intents.text = str(vm.get("intents", ""))
	log_label.text = str(vm.get("log", ""))
	var signature := str(vm.get("signature", ""))
	if signature == _signature:
		return
	_signature = signature
	for child in _groups.get_children():
		child.queue_free()
	for group in vm.get("groups", []):
		var actions: Array = group.get("actions", [])
		if actions.is_empty():
			continue
		var block := VBoxContainer.new()
		block.add_theme_constant_override("separation", 4)
		var title := _label(str(group.get("title", "")), 13, Color("cbb892"))
		block.add_child(title)
		for action in actions:
			var button := Button.new()
			button.text = str(action.text)
			button.alignment = HORIZONTAL_ALIGNMENT_LEFT
			button.custom_minimum_size = Vector2(0, 36)
			button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			button.set_meta("base_size", 16)
			button.add_theme_font_size_override("font_size", 16 * _pixel_scale)
			button.add_theme_stylebox_override("normal", _normal)
			button.add_theme_stylebox_override("hover", _hover)
			button.add_theme_stylebox_override("pressed", _pressed)
			button.add_theme_color_override("font_color", Color("f4f1ea"))
			button.add_theme_color_override("font_hover_color", Color("fff8ea"))
			var id := str(action.id)
			button.pressed.connect(func() -> void: action_requested.emit(id))
			block.add_child(button)
		_groups.add_child(block)


func _own(text: String, size: int, color: Color) -> Label:
	var label := _label(text, size, color)
	add_child(label)
	return label


func _wrap(label: Label) -> void:
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(420, 0)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL


func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.set_meta("base_size", size)
	label.add_theme_font_size_override("font_size", size * _pixel_scale)
	label.add_theme_color_override("font_color", color)
	return label


func _box(bg: Color, edge: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = edge
	style.set_border_width_all(1)
	style.set_content_margin_all(8)
	return style
