import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../models/event.dart';
import '../models/group.dart';
import '../l10n/app_localizations.dart';
import '../providers/auth_provider.dart';

class CalendarScreen extends StatefulWidget {
  final int? groupId;
  const CalendarScreen({super.key, this.groupId});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  final ApiService _apiService = ApiService();
  List<Event> _events = [];
  List<Group> _groups = [];
  DateTime _selectedDate = DateTime.now();
  DateTime _focusedMonth = DateTime.now();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final eventsData = await _apiService.getEvents();
      // Only fetch groups if we are not restricted to a specific group, or just fetch all for simplicity
      final groupsData = await _apiService.getGroups();
      
      var allEvents = (eventsData).map((e) => Event.fromJson(e)).toList();
      var allGroups = (groupsData).map((g) => Group.fromJson(g)).toList();
      
      if (widget.groupId != null) {
        allEvents = allEvents.where((e) => e.groupId == widget.groupId).toList();
      }
      
      if (mounted) {
        setState(() {
          _events = allEvents;
          _groups = allGroups;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Event> _getEventsForDay(DateTime day) {
    return _events.where((event) {
      final eventDate = DateTime.tryParse(event.startTime);
      if (eventDate == null) return false;
      return eventDate.year == day.year &&
             eventDate.month == day.month &&
             eventDate.day == day.day;
    }).toList();
  }

  bool _hasEventsOnDay(DateTime day) {
    return _getEventsForDay(day).isNotEmpty;
  }

  String _getGroupName(int? groupId) {
    if (groupId == null) return context.tr('all_groups');
    final group = _groups.firstWhere((g) => g.id == groupId, orElse: () => Group(id: -1, name: 'Unknown', monthlyFee: 0));
    if (group.ageGroup != null && group.ageGroup!.isNotEmpty) {
      return '${group.name} (${group.ageGroup})';
    }
    return group.name;
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isParent = user?.role.toLowerCase() == 'parent';
    
    return Scaffold(
      backgroundColor: const Color(0xFF1C2127), // Dark background
      appBar: AppBar(
        title: Text(context.tr('events')),
        backgroundColor: const Color(0xFF23272E),
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Month navigator
                Container(
                  padding: const EdgeInsets.all(16),
                  color: const Color(0xFF23272E),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.chevron_left, color: Colors.white),
                        onPressed: () {
                          setState(() {
                            _focusedMonth = DateTime(
                              _focusedMonth.year,
                              _focusedMonth.month - 1,
                            );
                          });
                        },
                      ),
                      Text(
                        _getMonthName(_focusedMonth),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.chevron_right, color: Colors.white),
                        onPressed: () {
                          setState(() {
                            _focusedMonth = DateTime(
                              _focusedMonth.year,
                              _focusedMonth.month + 1,
                            );
                          });
                        },
                      ),
                    ],
                  ),
                ),

                // Weekday headers
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
                        .map((dayKey) => Expanded(
                              child: Center(
                                child: Text(
                                  context.tr(dayKey),
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.grey[400],
                                  ),
                                ),
                              ),
                            ))
                        .toList(),
                  ),
                ),

                // Calendar grid
                Expanded(
                  child: _buildCalendarGrid(),
                ),

                // Selected day events
                Container(
                  height: 200,
                  decoration: BoxDecoration(
                    color: const Color(0xFF23272E),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.3),
                        blurRadius: 10,
                        offset: const Offset(0, -5),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _formatDate(_selectedDate),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: _buildSelectedDayEvents(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
      // Only show add button for non-parents
      floatingActionButton: isParent ? null : FloatingActionButton(
        onPressed: _showAddEventDialog,
        backgroundColor: const Color(0xFFFFC107),
        child: const Icon(Icons.add, color: Colors.black),
      ),
    );
  }

  Widget _buildCalendarGrid() {
    final firstDayOfMonth = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final lastDayOfMonth = DateTime(_focusedMonth.year, _focusedMonth.month + 1, 0);
    
    // Adjust for Monday start
    int startWeekday = firstDayOfMonth.weekday - 1;
    if (startWeekday < 0) startWeekday = 6;
    
    final daysInMonth = lastDayOfMonth.day;
    final totalCells = startWeekday + daysInMonth;
    final rows = (totalCells / 7).ceil();

    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 7,
        childAspectRatio: 1,
      ),
      itemCount: rows * 7,
      itemBuilder: (context, index) {
        final dayNumber = index - startWeekday + 1;
        
        if (dayNumber < 1 || dayNumber > daysInMonth) {
          return const SizedBox();
        }

        final day = DateTime(_focusedMonth.year, _focusedMonth.month, dayNumber);
        final isSelected = _selectedDate.year == day.year &&
                          _selectedDate.month == day.month &&
                          _selectedDate.day == day.day;
        final isToday = DateTime.now().year == day.year &&
                       DateTime.now().month == day.month &&
                       DateTime.now().day == day.day;
        final hasEvents = _hasEventsOnDay(day);

        return GestureDetector(
          onTap: () {
            setState(() {
              _selectedDate = day;
            });
          },
          child: Container(
            margin: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              color: isSelected
                  ? const Color(0xFFFFC107)
                  : isToday
                      ? const Color(0xFFFFC107).withOpacity(0.2)
                      : const Color(0xFF2D323B),
              borderRadius: BorderRadius.circular(8),
              border: isToday && !isSelected
                  ? Border.all(color: const Color(0xFFFFC107))
                  : null,
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Text(
                  dayNumber.toString(),
                  style: TextStyle(
                    color: isSelected ? Colors.black : Colors.white,
                    fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                if (hasEvents)
                  Positioned(
                    bottom: 4,
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.black : const Color(0xFFFFC107),
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSelectedDayEvents() {
    final dayEvents = _getEventsForDay(_selectedDate);

    if (dayEvents.isEmpty) {
      return Center(
        child: Text(
          context.tr('no_events'),
          style: TextStyle(color: Colors.grey[500]),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: dayEvents.length,
      itemBuilder: (context, index) {
        final event = dayEvents[index];
        final groupName = _getGroupName(event.groupId);
        final typeName = context.tr(event.type); // Translate type

        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          color: const Color(0xFF2D323B),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: _getEventColor(event.type),
              child: Icon(
                _getEventIcon(event.type),
                color: Colors.white,
                size: 20,
              ),
            ),
            title: Text(
              typeName,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${event.formattedTimeRange} • $groupName',
                  style: TextStyle(color: Colors.grey[400]),
                ),
                if (event.location != null && event.location!.isNotEmpty)
                  Text(
                    event.location!,
                    style: TextStyle(color: Colors.grey[500], fontSize: 12),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showAddEventDialog() {
    String type = 'training';
    int? groupId = widget.groupId;
    String startTime = '18:00';
    String endTime = '19:30';
    String location = '';
    String description = '';
    
    // Default group if only one exists or if filter is set
    if (groupId == null && _groups.isNotEmpty) {
      groupId = _groups.first.id;
    }

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Text(context.tr('add_event'), style: const TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: type,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.tr('event_type'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  items: [
                    DropdownMenuItem(value: 'training', child: Text(context.tr('training'))),
                    DropdownMenuItem(value: 'game', child: Text(context.tr('game'))),
                    DropdownMenuItem(value: 'tournament', child: Text(context.tr('tournament'))),
                    DropdownMenuItem(value: 'individual', child: Text(context.tr('individual'))),
                    DropdownMenuItem(value: 'parent_meeting', child: Text(context.tr('parent_meeting'))),
                  ],
                  onChanged: (v) => setDialogState(() => type = v!),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: groupId,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.tr('group'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  items: _groups.map((g) => DropdownMenuItem(
                    value: g.id,
                    child: Text(g.name),
                  )).toList(),
                  onChanged: (v) => setDialogState(() => groupId = v),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: context.tr('start_time'),
                          labelStyle: const TextStyle(color: Colors.grey),
                          enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                          focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                        ),
                        controller: TextEditingController(text: startTime),
                        onChanged: (v) => startTime = v,
                        keyboardType: TextInputType.datetime,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          labelText: context.tr('end_time'),
                          labelStyle: const TextStyle(color: Colors.grey),
                          enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                          focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                        ),
                        controller: TextEditingController(text: endTime),
                        onChanged: (v) => endTime = v,
                        keyboardType: TextInputType.datetime,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.tr('location'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  onChanged: (v) => location = v,
                ),
                const SizedBox(height: 12),
                TextField(
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.tr('description'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  maxLines: 2,
                  onChanged: (v) => description = v,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(context.tr('cancel'), style: const TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: Colors.black,
              ),
              onPressed: () async {
                try {
                  // Format dates
                  final dateStr = _selectedDate.toIso8601String().split('T')[0];
                  final startDateTime = DateTime.parse('${dateStr}T$startTime:00').toIso8601String();
                  final endDateTime = DateTime.parse('${dateStr}T$endTime:00').toIso8601String();

                  await _apiService.createEvent({
                    'type': type,
                    'group_id': groupId,
                    'start_time': startDateTime,
                    'end_time': endDateTime,
                    'location': location,
                    'description': description,
                  });

                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('${context.tr('error')}: $e')),
                  );
                }
              },
              child: Text(context.tr('add')),
            ),
          ],
        ),
      ),
    );
  }

  String _getMonthName(DateTime date) {
    final months = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun', 
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ];
    final monthKey = months[date.month - 1];
    return '${context.tr(monthKey)} ${date.year}';
  }

  String _formatDate(DateTime date) {
    final weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    final dayKey = weekdays[date.weekday - 1];
    
    final months = [
      'jan', 'feb', 'mar', 'apr', 'may', 'jun', 
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ];
    final monthKey = months[date.month - 1];
    
    return '${context.tr(dayKey)}, ${date.day} ${context.tr(monthKey)}';
  }

  IconData _getEventIcon(String type) {
    switch (type) {
      case 'training':
        return Icons.sports_soccer;
      case 'game':
        return Icons.sports;
      case 'tournament':
        return Icons.emoji_events;
      case 'individual':
        return Icons.person;
      case 'parent_meeting':
        return Icons.groups;
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
      case 'tournament':
        return Colors.amber;
      case 'individual':
        return Colors.cyan;
      case 'parent_meeting':
        return Colors.orange;
      case 'medical':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
