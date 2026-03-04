import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../models/event.dart';
import '../models/group.dart';
import '../providers/auth_provider.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  final ApiService _apiService = ApiService();
  List<Event> _events = [];
  List<Group> _groups = [];
  bool _isLoading = true;
  String? _error;
  
  // Search
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  
  List<Event> get _filteredEvents {
    if (_searchQuery.isEmpty) return _events;
    final query = _searchQuery.toLowerCase();
    return _events.where((e) {
      final group = _groups.where((g) => g.id == e.groupId).firstOrNull;
      return e.typeDisplayName.toLowerCase().contains(query) ||
             (group?.name.toLowerCase().contains(query) ?? false) ||
             (e.location?.toLowerCase().contains(query) ?? false);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final eventsData = await _apiService.getEvents();
      final groupsData = await _apiService.getGroups();
      setState(() {
        _events = eventsData.map((e) => Event.fromJson(e)).toList();
        _groups = groupsData.map((e) => Group.fromJson(e)).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    }
  }

  void _showAddEditDialog([Event? event]) {
    final isEditing = event != null;
    
    // Initialize date and time
    DateTime selectedDate = event != null 
        ? DateTime.tryParse(event.startTime) ?? DateTime.now()
        : DateTime.now();
    TimeOfDay startTime = event != null 
        ? TimeOfDay.fromDateTime(DateTime.tryParse(event.startTime) ?? DateTime.now())
        : const TimeOfDay(hour: 17, minute: 0);
    TimeOfDay endTime = event != null
        ? TimeOfDay.fromDateTime(DateTime.tryParse(event.endTime) ?? DateTime.now())
        : const TimeOfDay(hour: 18, minute: 30);
    
    final locationController = TextEditingController(text: event?.location ?? '');
    int? selectedGroupId = event?.groupId ?? (_groups.isNotEmpty ? _groups.first.id : null);
    String eventType = event?.type ?? 'training';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Text(isEditing ? 'Редактировать событие' : 'Добавить событие', style: const TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Group selection (required)
                DropdownButtonFormField<int>(
                  initialValue: selectedGroupId,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Группа *',
                    labelStyle: TextStyle(color: Colors.grey),
                    border: OutlineInputBorder(),
                  ),
                  items: _groups.map((g) => DropdownMenuItem(
                    value: g.id,
                    child: Text(g.name),
                  )).toList(),
                  onChanged: (value) => setDialogState(() => selectedGroupId = value),
                  validator: (value) => value == null ? 'Выберите группу' : null,
                ),
                const SizedBox(height: 12),
                
                // Event type
                DropdownButtonFormField<String>(
                  initialValue: eventType,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Тип события *',
                    labelStyle: TextStyle(color: Colors.grey),
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'training', child: Text('Тренировка')),
                    DropdownMenuItem(value: 'game', child: Text('Игра')),
                    DropdownMenuItem(value: 'medical', child: Text('Медосмотр')),
                  ],
                  onChanged: (value) => setDialogState(() => eventType = value!),
                ),
                const SizedBox(height: 12),
                
                // Date picker
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Дата *', style: TextStyle(color: Colors.white)),
                  subtitle: Text(
                    '${selectedDate.day.toString().padLeft(2, '0')}.${selectedDate.month.toString().padLeft(2, '0')}.${selectedDate.year}',
                    style: const TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                  trailing: const Icon(Icons.calendar_today, color: Color(0xFFFFC107)),
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: selectedDate,
                      firstDate: DateTime.now().subtract(const Duration(days: 365)),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                      builder: (context, child) {
                        return Theme(
                          data: Theme.of(context).copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFFFFC107),
                              onPrimary: Colors.black,
                              surface: Color(0xFF23272E),
                              onSurface: Colors.white,
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (date != null) {
                      setDialogState(() => selectedDate = date);
                    }
                  },
                ),
                const Divider(color: Colors.grey),
                
                // Time range
                Row(
                  children: [
                    Expanded(
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Начало', style: TextStyle(color: Colors.white)),
                        subtitle: Text(
                          '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}',
                          style: const TextStyle(fontSize: 16, color: Colors.grey),
                        ),
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: startTime,
                            builder: (context, child) {
                              return Theme(
                                data: Theme.of(context).copyWith(
                                  colorScheme: const ColorScheme.dark(
                                    primary: Color(0xFFFFC107),
                                    onPrimary: Colors.black,
                                    surface: Color(0xFF23272E),
                                    onSurface: Colors.white,
                                  ),
                                ),
                                child: child!,
                              );
                            },
                          );
                          if (time != null) {
                            setDialogState(() => startTime = time);
                          }
                        },
                      ),
                    ),
                    Expanded(
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Конец', style: TextStyle(color: Colors.white)),
                        subtitle: Text(
                          '${endTime.hour.toString().padLeft(2, '0')}:${endTime.minute.toString().padLeft(2, '0')}',
                          style: const TextStyle(fontSize: 16, color: Colors.grey),
                        ),
                        onTap: () async {
                          final time = await showTimePicker(
                            context: context,
                            initialTime: endTime,
                            builder: (context, child) {
                              return Theme(
                                data: Theme.of(context).copyWith(
                                  colorScheme: const ColorScheme.dark(
                                    primary: Color(0xFFFFC107),
                                    onPrimary: Colors.black,
                                    surface: Color(0xFF23272E),
                                    onSurface: Colors.white,
                                  ),
                                ),
                                child: child!,
                              );
                            },
                          );
                          if (time != null) {
                            setDialogState(() => endTime = time);
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                
                // Location
                TextField(
                  controller: locationController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Место *',
                    labelStyle: TextStyle(color: Colors.grey),
                    border: OutlineInputBorder(),
                    hintText: 'Например: Главный стадион',
                    hintStyle: TextStyle(color: Colors.grey),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              onPressed: () async {
                // Validation
                if (selectedGroupId == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Выберите группу')),
                  );
                  return;
                }
                if (locationController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Введите место проведения')),
                  );
                  return;
                }

                // Create datetime strings in ISO format
                final startDateTime = DateTime(
                  selectedDate.year,
                  selectedDate.month,
                  selectedDate.day,
                  startTime.hour,
                  startTime.minute,
                );
                final endDateTime = DateTime(
                  selectedDate.year,
                  selectedDate.month,
                  selectedDate.day,
                  endTime.hour,
                  endTime.minute,
                );

                // Validate time range
                if (endDateTime.isBefore(startDateTime) || endDateTime.isAtSameMomentAs(startDateTime)) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Время окончания должно быть позже начала')),
                  );
                  return;
                }

                final data = {
                  'group_id': selectedGroupId,
                  'start_time': startDateTime.toIso8601String(),
                  'end_time': endDateTime.toIso8601String(),
                  'type': eventType,
                  'location': locationController.text,
                };

                try {
                  if (isEditing) {
                    await _apiService.updateEvent(event.id, data);
                  } else {
                    await _apiService.createEvent(data);
                  }
                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(isEditing ? 'Событие обновлено' : 'Событие добавлено')),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Ошибка: $e')),
                    );
                  }
                }
              },
              child: Text(isEditing ? 'Сохранить' : 'Добавить'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deleteEvent(Event event) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Удалить событие?', style: TextStyle(color: Colors.white)),
        content: const Text('Вы уверены, что хотите удалить это событие?', style: TextStyle(color: Colors.grey)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Удалить', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteEvent(event.id);
        _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Событие удалено')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Ошибка удаления: $e')),
          );
        }
      }
    }
  }

  IconData _getEventIcon(String type) {
    switch (type) {
      case 'training':
        return Icons.sports_soccer;
      case 'game':
        return Icons.sports;
      case 'medical':
        return Icons.medical_services;
      default:
        return Icons.event;
    }
  }

  Color _getEventColor(String type) {
    switch (type) {
      case 'training':
        return Colors.blue;
      case 'game':
        return Colors.green;
      case 'medical':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isParent = user?.role.toLowerCase() == 'parent';
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('События'),
      ),
      // Only show add button for non-parents
      floatingActionButton: (_groups.isEmpty || isParent)
          ? null 
          : FloatingActionButton(
              backgroundColor: const Color(0xFFFFC107),
              onPressed: () => _showAddEditDialog(),
              child: const Icon(Icons.add, color: Colors.black),
            ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text('Ошибка: $_error', style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        child: const Text('Повторить'),
                      ),
                    ],
                  ),
                )
              : _groups.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.group_off, size: 64, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('Сначала создайте группу', style: TextStyle(fontSize: 18, color: Colors.grey)),
                          SizedBox(height: 8),
                          Text('Для создания события нужна хотя бы одна группа', style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : _events.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.event_outlined, size: 64, color: Colors.grey),
                              SizedBox(height: 16),
                              Text('Нет событий', style: TextStyle(fontSize: 18, color: Colors.grey)),
                              SizedBox(height: 8),
                              Text('Нажмите + чтобы добавить', style: TextStyle(color: Colors.grey)),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: Column(
                            children: [
                              // Search bar
                              Padding(
                                padding: const EdgeInsets.all(8),
                                child: TextField(
                                  controller: _searchController,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: InputDecoration(
                                    hintText: '🔍 Поиск по группе, типу, месту...',
                                    hintStyle: const TextStyle(color: Colors.grey),
                                    prefixIcon: const Icon(Icons.search, color: Colors.grey),
                                    suffixIcon: _searchQuery.isNotEmpty
                                        ? IconButton(
                                            icon: const Icon(Icons.clear, color: Colors.grey),
                                            onPressed: () {
                                              _searchController.clear();
                                              setState(() => _searchQuery = '');
                                            },
                                          )
                                        : null,
                                    filled: true,
                                    fillColor: const Color(0xFF2D323B),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: BorderSide.none,
                                    ),
                                  ),
                                  onChanged: (value) => setState(() => _searchQuery = value),
                                ),
                              ),
                              if (_searchQuery.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                                  child: Row(
                                    children: [
                                      Text('Найдено: ${_filteredEvents.length}', style: const TextStyle(color: Colors.grey)),
                                    ],
                                  ),
                                ),
                              Expanded(
                                child: _filteredEvents.isEmpty
                                    ? const Center(child: Text('Ничего не найдено', style: TextStyle(color: Colors.grey)))
                                    : ListView.builder(
                                        padding: const EdgeInsets.all(8),
                                        itemCount: _filteredEvents.length,
                                        itemBuilder: (context, index) {
                                          final event = _filteredEvents[index];
                                          final group = _groups.where((g) => g.id == event.groupId).firstOrNull;
                                          return Card(
                                            child: ListTile(
                                              leading: CircleAvatar(
                                                backgroundColor: _getEventColor(event.type),
                                                child: Icon(
                                                  _getEventIcon(event.type),
                                                  color: Colors.white,
                                                ),
                                              ),
                                              title: Text(event.typeDisplayName, style: const TextStyle(color: Colors.white)),
                                              subtitle: Column(
                                                crossAxisAlignment: CrossAxisAlignment.start,
                                                children: [
                                                  Text(event.formattedDate, style: const TextStyle(color: Colors.grey)),
                                                  Text(event.formattedTimeRange, style: const TextStyle(color: Colors.grey)),
                                                  if (group != null)
                                                    Text('Группа: ${group.name}', style: const TextStyle(color: Colors.grey)),
                                                  if (event.location != null && event.location!.isNotEmpty)
                                                    Text('Место: ${event.location}', style: const TextStyle(color: Colors.grey)),
                                                ],
                                              ),
                                              isThreeLine: true,
                                              // Only show edit/delete menu for non-parents
                                              trailing: isParent ? null : PopupMenuButton(
                                                color: const Color(0xFF23272E),
                                                iconColor: Colors.grey,
                                                itemBuilder: (context) => [
                                                  const PopupMenuItem(
                                                    value: 'edit',
                                                    child: Row(
                                                      children: [
                                                        Icon(Icons.edit, color: Colors.white),
                                                        SizedBox(width: 8),
                                                        Text('Редактировать', style: TextStyle(color: Colors.white)),
                                                      ],
                                                    ),
                                                  ),
                                                  const PopupMenuItem(
                                                    value: 'delete',
                                                    child: Row(
                                                      children: [
                                                        Icon(Icons.delete, color: Colors.red),
                                                        SizedBox(width: 8),
                                                        Text('Удалить', style: TextStyle(color: Colors.red)),
                                                      ],
                                                    ),
                                                  ),
                                                ],
                                                onSelected: (value) {
                                                  if (value == 'edit') {
                                                    _showAddEditDialog(event);
                                                  } else if (value == 'delete') {
                                                    _deleteEvent(event);
                                                  }
                                                },
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                              ),
                            ],
                          ),
                        ),
    );
  }
}
