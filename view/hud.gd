extends VBoxContainer

signal action_requested(action: String)

var _signature := ""
var _buttons: GridContainer
var _labor: VBoxContainer
var hint: Label
var status: Label
var detail: Label
var reason: Label
var inspector: Label
var intents: Label
var log_label: Label
var banner: Label


func setup() -> void:
	add_theme_constant_override("separation", 6)
	banner = _label("", 20)
	banner.add_theme_color_override("font_color", Color("ffd6a5"))
	hint = _label("", 15)
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.custom_minimum_size = Vector2(440, 0)
	status = _label("", 16)
	detail = _label("", 14)
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	reason = _label("", 14)
	reason.add_theme_color_override("font_color", Color("ffb4a2"))
	_label("命令", 15)
	_buttons = GridContainer.new()
	_buttons.columns = 2
	_buttons.add_theme_constant_override("h_separation", 6)
	_buttons.add_theme_constant_override("v_separation", 6)
	add_child(_buttons)
	_label("工班", 15)
	_labor = VBoxContainer.new()
	add_child(_labor)
	_label("意图", 15)
	intents = _label("", 14)
	intents.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label("格子", 15)
	inspector = _label("", 14)
	inspector.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label("记录", 15)
	log_label = _label("", 13)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART


func refresh(vm: Dictionary) -> void:
	banner.text = str(vm.get("banner", ""))
	hint.text = str(vm.get("hint", ""))
	status.text = str(vm.get("status", ""))
	detail.text = str(vm.get("detail", ""))
	reason.text = str(vm.get("reason", ""))
	inspector.text = str(vm.get("inspector", ""))
	intents.text = str(vm.get("intents", ""))
	log_label.text = str(vm.get("log", ""))
	var signature := str(vm.get("signature", ""))
	if signature == _signature:
		return
	_signature = signature
	for child in _buttons.get_children():
		child.queue_free()
	for child in _labor.get_children():
		child.queue_free()
	for action in vm.get("actions", []):
		var button := Button.new()
		button.text = str(action.text)
		button.custom_minimum_size = Vector2(200, 32)
		var id := str(action.id)
		button.pressed.connect(func() -> void: action_requested.emit(id))
		_buttons.add_child(button)
	for action in vm.get("labor", []):
		var button := Button.new()
		button.text = str(action.text)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var id := str(action.id)
		button.pressed.connect(func() -> void: action_requested.emit(id))
		_labor.add_child(button)


func _label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	add_child(label)
	return label
