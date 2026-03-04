import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// Schedule Templates Management Screen - Admin only
/// Create, edit and manage schedule templates for groups
class ScheduleTemplatesScreen extends StatefulWidget {
  const ScheduleTemplatesScreen({super.key});

  @override
  State<ScheduleTemplatesScreen> createState() => _ScheduleTemplatesScreenState();
}

class _ScheduleTemplatesScreenState extends State<ScheduleTemplatesScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  List<dynamic> _templates = [];
  List<dynamic> _groups = [];
  String? _errorMessage;
  int? _selectedGroupFilter;

  static const List<String> _dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  static const List<String> _dayNamesFull = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _apiService.getScheduleTemplates(),
        _apiService.getGroups(),
      ]);
      setState(() {
        _templates = results[0];
        _groups = results[1];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Ошибка загрузки: $e';
        _isLoading = false;
      });
    }
  }

  List<dynamic> get _filteredTemplates {
    if (_selectedGroupFilter == null) return _templates;
    return _templates.where((t) => t['group_id'] == _selectedGroupFilter).toList();
  }

  String _getGroupName(int? groupId) {
    if (groupId == null) return 'Без группы';
    final group = _groups.firstWhere((g) => g['id'] == groupId, orElse: () => null);
    return group?['name'] ?? 'Группа $groupId';
  }

  void _showCreateEditDialog([Map<String, dynamic>? template]) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => ScheduleTemplateDialog(
        template: template,
        groups: _groups,
        onSave: (data) async {
          try {
            if (template != null) {
              await _apiService.updateScheduleTemplate(template['id'], data);
            } else {
              await _apiService.createScheduleTemplate(data);
            }
            Navigator.pop(context);
            _loadData();
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(template != null ? '✅ Шаблон обновлён' : '✅ Шаблон создан'),
                backgroundColor: Colors.green,
              ),
            );
          } catch (e) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
            );
          }
        },
      ),
    );
  }

  void _confirmDelete(int templateId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Удалить шаблон?', style: TextStyle(color: Colors.white)),
        content: const Text('Это действие нельзя отменить', style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await _apiService.deleteScheduleTemplate(templateId);
                _loadData();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('🗑️ Шаблон удалён'), backgroundColor: Colors.orange),
                );
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
                );
              }
            },
            child: const Text('Удалить', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  Future<void> _generateEvents(int templateId) async {
    try {
      final result = await _apiService.generateEventsFromTemplate(templateId);
      final created = result['created'] ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('🚀 Создано $created событий'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка генерации: $e'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1D23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: const Row(
          children: [
            Text('📅 ', style: TextStyle(fontSize: 24)),
            Text('Шаблоны расписаний'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)))
              : Column(
                  children: [
                    _buildGroupFilter(),
                    Expanded(child: _buildTemplatesList()),
                  ],
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateEditDialog(),
        backgroundColor: const Color(0xFFFFC107),
        icon: const Icon(Icons.add, color: Colors.black),
        label: const Text('Создать', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildGroupFilter() {
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _buildFilterChip(null, 'Все группы'),
          ..._groups.map((g) => _buildFilterChip(g['id'], g['name'] ?? 'Группа')),
        ],
      ),
    );
  }

  Widget _buildFilterChip(int? groupId, String label) {
    final isSelected = _selectedGroupFilter == groupId;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        selected: isSelected,
        label: Text(label),
        labelStyle: TextStyle(color: isSelected ? Colors.black : Colors.white, fontSize: 12),
        backgroundColor: const Color(0xFF23272E),
        selectedColor: const Color(0xFFFFC107),
        checkmarkColor: Colors.black,
        side: BorderSide(color: isSelected ? const Color(0xFFFFC107) : Colors.white24),
        onSelected: (_) => setState(() => _selectedGroupFilter = groupId),
      ),
    );
  }

  Widget _buildTemplatesList() {
    if (_filteredTemplates.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.event_busy, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text('Нет шаблонов расписаний', style: TextStyle(color: Colors.grey[400], fontSize: 18)),
            const SizedBox(height: 8),
            const Text('Нажмите "Создать" для добавления', style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: const Color(0xFFFFC107),
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _filteredTemplates.length,
        itemBuilder: (context, index) {
          final template = _filteredTemplates[index];
          final rules = List<dynamic>.from(template['schedule_rules'] ?? []);
          final groupName = _getGroupName(template['group_id']);
          
          return Card(
            color: const Color(0xFF23272E),
            margin: const EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFC107).withOpacity(0.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.calendar_today, color: Color(0xFFFFC107)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              template['name'] ?? 'Без названия',
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            Container(
                              margin: const EdgeInsets.only(top: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.blue.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '📚 $groupName',
                                style: const TextStyle(color: Colors.blue, fontSize: 11),
                              ),
                            ),
                          ],
                        ),
                      ),
                      PopupMenuButton<String>(
                        icon: const Icon(Icons.more_vert, color: Colors.white54),
                        color: const Color(0xFF2D323B),
                        onSelected: (value) {
                          if (value == 'edit') _showCreateEditDialog(template);
                          if (value == 'generate') _generateEvents(template['id']);
                          if (value == 'delete') _confirmDelete(template['id']);
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(value: 'edit', child: Row(children: [Icon(Icons.edit, size: 18, color: Colors.blue), SizedBox(width: 8), Text('Редактировать', style: TextStyle(color: Colors.white))])),
                          const PopupMenuItem(value: 'generate', child: Row(children: [Icon(Icons.rocket_launch, size: 18, color: Colors.green), SizedBox(width: 8), Text('Генерировать', style: TextStyle(color: Colors.white))])),
                          const PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete, size: 18, color: Colors.red), SizedBox(width: 8), Text('Удалить', style: TextStyle(color: Colors.red))])),
                        ],
                      ),
                    ],
                  ),
                  if (rules.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Divider(color: Colors.white10),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: rules.map<Widget>((rule) {
                        final day = rule['day'] ?? 0;
                        final startTime = rule['start_time'] ?? '';
                        final endTime = rule['end_time'] ?? '';
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2D323B),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.white10),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_dayNames[day], style: const TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold, fontSize: 12)),
                              const SizedBox(width: 6),
                              Text('$startTime-$endTime', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Dialog for creating/editing schedule templates
class ScheduleTemplateDialog extends StatefulWidget {
  final Map<String, dynamic>? template;
  final List<dynamic> groups;
  final Function(Map<String, dynamic>) onSave;

  const ScheduleTemplateDialog({
    super.key,
    this.template,
    required this.groups,
    required this.onSave,
  });

  @override
  State<ScheduleTemplateDialog> createState() => _ScheduleTemplateDialogState();
}

class _ScheduleTemplateDialogState extends State<ScheduleTemplateDialog> {
  late int? _selectedGroupId;
  late String _name;
  late DateTime _validFrom;
  late DateTime _validUntil;
  late List<Map<String, dynamic>> _scheduleRules;
  
  // Quick fill time settings
  TimeOfDay _quickFillStart = const TimeOfDay(hour: 17, minute: 0);
  TimeOfDay _quickFillEnd = const TimeOfDay(hour: 18, minute: 30);
  
  // Currently editing rule index
  int? _editingRuleIndex;
  
  bool _isSaving = false;

  static const List<String> _dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  @override
  void initState() {
    super.initState();
    final t = widget.template;
    _selectedGroupId = t?['group_id'];
    _name = t?['name'] ?? '';
    _validFrom = t != null ? DateTime.tryParse(t['valid_from'] ?? '') ?? DateTime.now() : DateTime.now();
    _validUntil = t != null ? DateTime.tryParse(t['valid_until'] ?? '') ?? DateTime.now().add(const Duration(days: 365)) : DateTime.now().add(const Duration(days: 365));
    _scheduleRules = List<Map<String, dynamic>>.from(
      (t?['schedule_rules'] as List<dynamic>?)?.map((e) => Map<String, dynamic>.from(e)) ?? [],
    );
  }

  String _formatTime(TimeOfDay time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }

  TimeOfDay _parseTime(String time) {
    final parts = time.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  TimeOfDay _addMinutes(TimeOfDay time, int minutes) {
    final total = time.hour * 60 + time.minute + minutes;
    return TimeOfDay(hour: (total ~/ 60) % 24, minute: total % 60);
  }

  void _addRule(int day) {
    setState(() {
      _scheduleRules.add({
        'day': day,
        'start_time': _formatTime(_quickFillStart),
        'end_time': _formatTime(_quickFillEnd),
        'type': 'training',
        'location': '',
      });
    });
  }

  void _addQuickFill(List<int> days) {
    setState(() {
      for (final day in days) {
        _scheduleRules.add({
          'day': day,
          'start_time': _formatTime(_quickFillStart),
          'end_time': _formatTime(_quickFillEnd),
          'type': 'training',
          'location': '',
        });
      }
    });
  }

  void _removeRule(int index) {
    setState(() {
      _scheduleRules.removeAt(index);
      if (_editingRuleIndex == index) _editingRuleIndex = null;
    });
  }

  void _updateRule(int index, String field, dynamic value) {
    setState(() {
      _scheduleRules[index][field] = value;
    });
  }

  Future<void> _selectTime(bool isStart) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: isStart ? _quickFillStart : _quickFillEnd,
      builder: (context, child) => Theme(
        data: ThemeData.dark().copyWith(colorScheme: const ColorScheme.dark(primary: Color(0xFFFFC107))),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _quickFillStart = picked;
          _quickFillEnd = _addMinutes(picked, 90);
        } else {
          _quickFillEnd = picked;
        }
      });
    }
  }

  void _handleSave() {
    if (_selectedGroupId == null || _name.isEmpty || _scheduleRules.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заполните все поля и добавьте правила'), backgroundColor: Colors.orange),
      );
      return;
    }

    setState(() => _isSaving = true);
    widget.onSave({
      'group_id': _selectedGroupId,
      'name': _name,
      'valid_from': _validFrom.toIso8601String(),
      'valid_until': _validUntil.toIso8601String(),
      'schedule_rules': _scheduleRules,
      'excluded_dates': widget.template?['excluded_dates'] ?? [],
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.9,
      decoration: const BoxDecoration(
        color: Color(0xFF1A1D23),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Handle
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(color: Colors.grey, borderRadius: BorderRadius.circular(2)),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.template != null ? '✏️ Редактировать' : '➕ Создать шаблон',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close, color: Colors.grey),
                ),
              ],
            ),
          ),
          // Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Group selector
                  const Text('Группа *', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int>(
                    initialValue: _selectedGroupId,
                    dropdownColor: const Color(0xFF23272E),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: const Color(0xFF23272E),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                    style: const TextStyle(color: Colors.white),
                    items: widget.groups.map((g) => DropdownMenuItem<int>(value: g['id'], child: Text(g['name'] ?? 'Группа'))).toList(),
                    onChanged: (v) => setState(() => _selectedGroupId = v),
                  ),
                  const SizedBox(height: 16),
                  
                  // Name
                  const Text('Название *', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  const SizedBox(height: 8),
                  TextFormField(
                    initialValue: _name,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Основное расписание',
                      hintStyle: const TextStyle(color: Colors.white30),
                      filled: true,
                      fillColor: const Color(0xFF23272E),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                    onChanged: (v) => _name = v,
                  ),
                  const SizedBox(height: 24),
                  
                  // Quick fill section
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.green.withOpacity(0.3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.flash_on, color: Colors.green, size: 20),
                            SizedBox(width: 8),
                            Text('Быстрое заполнение', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // Time selector
                        Row(
                          children: [
                            Expanded(
                              child: GestureDetector(
                                onTap: () => _selectTime(true),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF23272E),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Icon(Icons.access_time, color: Colors.white54, size: 18),
                                      const SizedBox(width: 8),
                                      Text(_formatTime(_quickFillStart), style: const TextStyle(color: Colors.white, fontSize: 16)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 8),
                              child: Text('—', style: TextStyle(color: Colors.white54)),
                            ),
                            Expanded(
                              child: GestureDetector(
                                onTap: () => _selectTime(false),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF23272E),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Icon(Icons.access_time, color: Colors.white54, size: 18),
                                      const SizedBox(width: 8),
                                      Text(_formatTime(_quickFillEnd), style: const TextStyle(color: Colors.white, fontSize: 16)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _buildQuickButton('📅 Пн-Пт', () => _addQuickFill([0,1,2,3,4])),
                            _buildQuickButton('📅 Пн-Ср-Пт', () => _addQuickFill([0,2,4])),
                            _buildQuickButton('📅 Вт-Чт', () => _addQuickFill([1,3])),
                            _buildQuickButton('⚽ Сб игра', () {
                              setState(() {
                                _scheduleRules.add({'day': 5, 'start_time': '10:00', 'end_time': '12:00', 'type': 'game', 'location': 'Стадион'});
                              });
                            }),
                            _buildQuickButton('🗑️ Очистить', () => setState(() => _scheduleRules.clear()), isDestructive: true),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('💡 Установите время, затем нажмите кнопку', style: TextStyle(color: Colors.grey[600], fontSize: 11)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Schedule rules
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('📋 Правила расписания', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text('${_scheduleRules.length} правил', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  
                  if (_scheduleRules.isEmpty)
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: const Color(0xFF23272E),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Center(
                        child: Text('Добавьте правила через быстрое заполнение', style: TextStyle(color: Colors.white54)),
                      ),
                    )
                  else
                    ..._scheduleRules.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final rule = entry.value;
                      final isEditing = _editingRuleIndex == idx;
                      
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF23272E),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: isEditing ? const Color(0xFFFFC107) : Colors.white10),
                        ),
                        child: isEditing
                            ? _buildEditingRule(idx, rule)
                            : _buildViewRule(idx, rule),
                      );
                    }),
                  
                  // Add single day buttons
                  const SizedBox(height: 12),
                  const Text('Добавить отдельный день:', style: TextStyle(color: Colors.white54, fontSize: 12)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: List.generate(7, (i) => ActionChip(
                      label: Text(_dayNames[i]),
                      backgroundColor: const Color(0xFF23272E),
                      labelStyle: const TextStyle(color: Colors.white),
                      onPressed: () => _addRule(i),
                    )),
                  ),
                  
                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
          // Save button
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              border: Border(top: BorderSide(color: Colors.white.withOpacity(0.1))),
            ),
            child: SafeArea(
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _handleSave,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFFC107),
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(_isSaving ? '⏳ Сохранение...' : '💾 Сохранить', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickButton(String label, VoidCallback onPressed, {bool isDestructive = false}) {
    return ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: isDestructive ? Colors.red.withOpacity(0.2) : Colors.green.withOpacity(0.2),
        foregroundColor: isDestructive ? Colors.red : Colors.green,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        side: BorderSide(color: isDestructive ? Colors.red.withOpacity(0.3) : Colors.green.withOpacity(0.3)),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12)),
    );
  }

  Widget _buildViewRule(int idx, Map<String, dynamic> rule) {
    return Row(
      children: [
        Text(_dayNames[rule['day'] ?? 0], style: const TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold)),
        const SizedBox(width: 12),
        Text('${rule['start_time']} - ${rule['end_time']}', style: const TextStyle(color: Colors.white70)),
        const SizedBox(width: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: rule['type'] == 'game' ? Colors.green.withOpacity(0.2) : Colors.blue.withOpacity(0.2),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            rule['type'] == 'game' ? 'Матч' : 'Тренировка',
            style: TextStyle(color: rule['type'] == 'game' ? Colors.green : Colors.blue, fontSize: 10),
          ),
        ),
        const Spacer(),
        IconButton(
          icon: const Icon(Icons.edit, color: Colors.blue, size: 18),
          onPressed: () => setState(() => _editingRuleIndex = idx),
          constraints: const BoxConstraints(),
          padding: const EdgeInsets.all(4),
        ),
        IconButton(
          icon: const Icon(Icons.delete, color: Colors.red, size: 18),
          onPressed: () => _removeRule(idx),
          constraints: const BoxConstraints(),
          padding: const EdgeInsets.all(4),
        ),
      ],
    );
  }

  Widget _buildEditingRule(int idx, Map<String, dynamic> rule) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<int>(
                initialValue: rule['day'] ?? 0,
                dropdownColor: const Color(0xFF2D323B),
                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8)),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                items: List.generate(7, (i) => DropdownMenuItem(value: i, child: Text(_dayNames[i]))),
                onChanged: (v) => _updateRule(idx, 'day', v),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 80,
              child: TextFormField(
                initialValue: rule['start_time'],
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.all(8)),
                onChanged: (v) => _updateRule(idx, 'start_time', v),
              ),
            ),
            const Text(' - ', style: TextStyle(color: Colors.white54)),
            SizedBox(
              width: 80,
              child: TextFormField(
                initialValue: rule['end_time'],
                style: const TextStyle(color: Colors.white, fontSize: 14),
                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.all(8)),
                onChanged: (v) => _updateRule(idx, 'end_time', v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: rule['type'] ?? 'training',
                dropdownColor: const Color(0xFF2D323B),
                decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8)),
                style: const TextStyle(color: Colors.white, fontSize: 14),
                items: const [
                  DropdownMenuItem(value: 'training', child: Text('Тренировка')),
                  DropdownMenuItem(value: 'game', child: Text('Матч')),
                  DropdownMenuItem(value: 'tournament', child: Text('Турнир')),
                ],
                onChanged: (v) => _updateRule(idx, 'type', v),
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              icon: const Icon(Icons.check, color: Colors.green),
              onPressed: () => setState(() => _editingRuleIndex = null),
            ),
          ],
        ),
      ],
    );
  }
}
