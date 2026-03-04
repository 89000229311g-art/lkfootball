import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../models/event.dart';
import '../models/student.dart';
import '../models/attendance.dart';
import '../models/group.dart';
import '../providers/auth_provider.dart';
import 'package:intl/intl.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  final ApiService _apiService = ApiService();
  List<Event> _events = [];
  List<Student> _students = [];
  List<Student> _filteredStudents = [];
  List<Attendance> _attendance = [];
  Map<int, String> _tempAttendance = {}; // studentId -> status
  bool _isSaving = false;
  List<Group> _groups = [];
  Event? _selectedEvent;
  bool _isLoading = true;
  
  // Search
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  
  // Calendar state
  DateTime _viewDate = DateTime.now();
  DateTime _selectedDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final eventsData = await _apiService.getEvents();
      final studentsData = await _apiService.getStudents();
      final groupsData = await _apiService.getGroups();
      
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final user = authProvider.user;
      
      // Parse all data
      final allEvents = eventsData.map((e) => Event.fromJson(e)).toList();
      final allGroups = groupsData.map((g) => Group.fromJson(g)).toList();
      
      // Filter events for coaches - only show events from their groups
      List<Event> filteredEvents = allEvents;
      if (user?.role == 'coach') {
        // Get groups where this coach is assigned
        final coachGroups = allGroups.where((g) => g.coachId == user?.id).map((g) => g.id).toSet();
        // Filter events to only those in coach's groups
        filteredEvents = allEvents.where((e) => coachGroups.contains(e.groupId)).toList();
      }
      
      // Sort events by date (most recent first)
      filteredEvents.sort((a, b) => b.startTime.compareTo(a.startTime));
      
      setState(() {
        _events = filteredEvents;
        _students = studentsData.map((e) => Student.fromJson(e)).toList();
        _groups = allGroups;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    }
  }

  Future<void> _loadAttendance(Event event) async {
    try {
      final data = await _apiService.getAttendance(eventId: event.id);
      
      // Filter students to only show those in the event's group
      List<Student> groupStudents = _students.where((s) => s.groupId == event.groupId).toList();
      
      setState(() {
        _attendance = data.map((e) => Attendance.fromJson(e)).toList();
        _tempAttendance = {for (var a in _attendance) a.studentId: a.status};
        _selectedEvent = event;
        _filteredStudents = groupStudents;
        _searchQuery = '';
        _searchController.clear();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки посещаемости: $e')),
        );
      }
    }
  }
  
  void _applySearchFilter() {
    if (_selectedEvent == null) return;
    
    List<Student> groupStudents = _students.where((s) => s.groupId == _selectedEvent!.groupId).toList();
    
    if (_searchQuery.isEmpty) {
      setState(() => _filteredStudents = groupStudents);
    } else {
      final query = _searchQuery.toLowerCase();
      setState(() {
        _filteredStudents = groupStudents.where((s) {
          return s.fullName.toLowerCase().contains(query) ||
                 (s.phone?.contains(query) ?? false);
        }).toList();
      });
    }
  }

  void _markAttendance(Student student, String status) {
    if (_selectedEvent == null) return;

    setState(() {
      if (_tempAttendance[student.id] == status) {
        _tempAttendance.remove(student.id); // Toggle off if clicking same status
      } else {
        _tempAttendance[student.id] = status;
      }
    });
  }

  Future<void> _saveAllAttendance() async {
    if (_selectedEvent == null) return;

    setState(() => _isSaving = true);
    try {
      // Find what changed compared to original _attendance
      for (var student in _filteredStudents) {
        final newStatus = _tempAttendance[student.id];
        final originalAtt = _attendance.where((a) => a.studentId == student.id).firstOrNull;
        final originalStatus = originalAtt?.status;

        if (newStatus != null && newStatus != originalStatus) {
          if (originalAtt != null) {
            await _apiService.updateAttendance(originalAtt.id, {'status': newStatus});
          } else {
            await _apiService.createAttendance({
              'event_id': _selectedEvent!.id,
              'student_id': student.id,
              'status': newStatus,
            });
          }
        }
      }

      await _loadAttendance(_selectedEvent!);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Посещаемость сохранена'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка сохранения: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSaving = false);
    }
  }

  void _cancelChanges() {
    setState(() {
      _tempAttendance = {for (var a in _attendance) a.studentId: a.status};
    });
  }

  String _getStudentStatus(int studentId) {
    return _tempAttendance[studentId] ?? 'unmarked';
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'present':
        return Colors.green;
      case 'absent':
        return Colors.red;
      case 'late':
        return Colors.orange;
      case 'excused':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'present':
        return 'Присутствует';
      case 'absent':
        return 'Отсутствует';
      case 'late':
        return 'Опоздал';
      case 'excused':
        return 'Уважительная причина';
      default:
        return 'Не отмечен';
    }
  }

  // Calendar helpers
  List<DateTime?> _getDaysInMonth(DateTime date) {
    final firstDay = DateTime(date.year, date.month, 1);
    final lastDay = DateTime(date.year, date.month + 1, 0);
    final daysInMonth = lastDay.day;
    
    // Calculate starting day (Monday = 0)
    int startWeekday = firstDay.weekday - 1;
    if (startWeekday < 0) startWeekday = 6;
    
    List<DateTime?> days = [];
    
    // Add empty cells for padding
    for (int i = 0; i < startWeekday; i++) {
      days.add(null);
    }
    
    // Add days of month
    for (int i = 1; i <= daysInMonth; i++) {
      days.add(DateTime(date.year, date.month, i));
    }
    
    return days;
  }
  
  bool _isSameDay(DateTime? d1, DateTime? d2) {
    if (d1 == null || d2 == null) return false;
    return d1.year == d2.year && d1.month == d2.month && d1.day == d2.day;
  }
  
  List<Event> _getEventsForDay(DateTime date) {
    return _events.where((e) {
      try {
        final eventDate = DateTime.parse(e.startTime);
        return _isSameDay(eventDate, date);
      } catch (e) {
        return false;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final dayEvents = _getEventsForDay(_selectedDate);
    final days = _getDaysInMonth(_viewDate);
    
    // Check if there are unsaved changes
    bool hasChanges = false;
    if (_selectedEvent != null) {
      for (var student in _filteredStudents) {
        final current = _tempAttendance[student.id];
        final original = _attendance.where((a) => a.studentId == student.id).firstOrNull?.status;
        if (current != original) {
          hasChanges = true;
          break;
        }
      }
    }
    
    return Scaffold(
      backgroundColor: const Color(0xFF1C2127),
      appBar: AppBar(
        title: const Text('Посещаемость'),
        backgroundColor: const Color(0xFF23272E),
        foregroundColor: Colors.white,
      ),
      bottomNavigationBar: hasChanges 
        ? Container(
            padding: const EdgeInsets.all(16),
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
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _isSaving ? null : _cancelChanges,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey,
                      side: const BorderSide(color: Colors.grey),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: const Text('Отмена'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _isSaving ? null : _saveAllAttendance,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFFC107),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: _isSaving 
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                      : const Text('Сохранить', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          )
        : null,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Calendar Card
                  Card(
                    color: const Color(0xFF23272E),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          // Month navigation
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              IconButton(
                                icon: const Icon(Icons.chevron_left, color: Colors.white),
                                onPressed: () {
                                  setState(() {
                                    _viewDate = DateTime(_viewDate.year, _viewDate.month - 1);
                                  });
                                },
                              ),
                              Text(
                                DateFormat('MMMM yyyy', 'ru').format(_viewDate),
                                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                              IconButton(
                                icon: const Icon(Icons.chevron_right, color: Colors.white),
                                onPressed: () {
                                  setState(() {
                                    _viewDate = DateTime(_viewDate.year, _viewDate.month + 1);
                                  });
                                },
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          
                          // Weekday headers
                          Row(
                            children: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => 
                              Expanded(
                                child: Center(
                                  child: Text(day, style: const TextStyle(color: Colors.grey, fontWeight: FontWeight.bold)),
                                ),
                              ),
                            ).toList(),
                          ),
                          const SizedBox(height: 8),
                          
                          // Calendar grid
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 7,
                              mainAxisSpacing: 4,
                              crossAxisSpacing: 4,
                            ),
                            itemCount: days.length,
                            itemBuilder: (context, index) {
                              final day = days[index];
                              if (day == null) return const SizedBox();
                              
                              final isSelected = _isSameDay(day, _selectedDate);
                              final isToday = _isSameDay(day, DateTime.now());
                              final hasEvents = _getEventsForDay(day).isNotEmpty;
                              
                              return GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _selectedDate = day;
                                    _selectedEvent = null;
                                  });
                                },
                                child: Container(
                                  decoration: BoxDecoration(
                                    color: isSelected ? const Color(0xFFFFC107) : const Color(0xFF2D323B),
                                    borderRadius: BorderRadius.circular(8),
                                    border: isToday ? Border.all(color: const Color(0xFFFFC107), width: 2) : null,
                                  ),
                                  child: Stack(
                                    children: [
                                      Center(
                                        child: Text(
                                          '${day.day}',
                                          style: TextStyle(
                                            color: isSelected ? Colors.black : Colors.white,
                                            fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                                          ),
                                        ),
                                      ),
                                      if (hasEvents)
                                        Positioned(
                                          bottom: 4,
                                          left: 0,
                                          right: 0,
                                          child: Center(
                                            child: Container(
                                              width: 6,
                                              height: 6,
                                              decoration: BoxDecoration(
                                                color: isSelected ? Colors.black : const Color(0xFFFFC107),
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Events for selected day
                  Text(
                    'События: ${DateFormat('d MMMM', 'ru').format(_selectedDate)}',
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  
                  if (dayEvents.isEmpty)
                    const Card(
                      color: Color(0xFF23272E),
                      child: Padding(
                        padding: EdgeInsets.all(32),
                        child: Center(
                          child: Text(
                            'Нет событий на эту дату',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      ),
                    )
                  else
                    ...dayEvents.map((event) {
                      final groupName = _groups.where((g) => g.id == event.groupId).firstOrNull?.name ?? '';
                      final isSelected = _selectedEvent?.id == event.id;
                      
                      return GestureDetector(
                        onTap: () => _loadAttendance(event),
                        child: Card(
                          color: isSelected ? const Color(0xFFFFC107) : const Color(0xFF23272E),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Container(
                                  width: 50,
                                  height: 50,
                                  decoration: BoxDecoration(
                                    color: isSelected ? Colors.black.withOpacity(0.1) : const Color(0xFF2D323B),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    event.type == 'training' ? Icons.sports_soccer : Icons.event,
                                    color: isSelected ? Colors.black : const Color(0xFFFFC107),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        groupName,
                                        style: TextStyle(
                                          color: isSelected ? Colors.black : Colors.white,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 16,
                                        ),
                                      ),
                                      Text(
                                        event.formattedTimeRange,
                                        style: TextStyle(
                                          color: isSelected ? Colors.black.withOpacity(0.7) : Colors.grey,
                                          fontSize: 14,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  const Icon(Icons.check_circle, color: Colors.black),
                              ],
                            ),
                          ),
                        ),
                      );
                    }),
                  
                  // Students list
                  if (_selectedEvent != null) ...[
                    const SizedBox(height: 24),
                    Text(
                      'Ученики (${_filteredStudents.length})',
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    
                    // Search bar for students
                    TextField(
                      controller: _searchController,
                      style: const TextStyle(color: Colors.white),
                      decoration: InputDecoration(
                        hintText: '🔍 Поиск по имени...',
                        hintStyle: const TextStyle(color: Colors.grey),
                        prefixIcon: const Icon(Icons.search, color: Colors.grey),
                        suffixIcon: _searchQuery.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, color: Colors.grey),
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() => _searchQuery = '');
                                  _applySearchFilter();
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
                      onChanged: (value) {
                        setState(() => _searchQuery = value);
                        _applySearchFilter();
                      },
                    ),
                    if (_searchQuery.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text('Найдено: ${_filteredStudents.length}', style: const TextStyle(color: Colors.grey)),
                      ),
                    const SizedBox(height: 12),
                    
                    if (_filteredStudents.isEmpty)
                      const Card(
                        color: Color(0xFF23272E),
                        child: Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(
                            child: Text('Нет учеников', style: TextStyle(color: Colors.grey)),
                          ),
                        ),
                      )
                    else
                      ..._filteredStudents.map((student) {
                        final status = _getStudentStatus(student.id);
                        
                        return Card(
                          color: const Color(0xFF23272E),
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: _getStatusColor(status),
                                  child: Text(
                                    student.firstName[0].toUpperCase(),
                                    style: const TextStyle(color: Colors.white),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        student.fullName,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                      ),
                                      Text(
                                        _getStatusText(status),
                                        style: const TextStyle(color: Colors.grey, fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                                Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      icon: Icon(
                                        Icons.check_circle,
                                        color: status == 'present' ? Colors.green : Colors.grey,
                                      ),
                                      onPressed: () => _markAttendance(student, 'present'),
                                    ),
                                    IconButton(
                                      icon: Icon(
                                        Icons.cancel,
                                        color: status == 'absent' ? Colors.red : Colors.grey,
                                      ),
                                      onPressed: () => _markAttendance(student, 'absent'),
                                    ),
                                    IconButton(
                                      icon: Icon(
                                        Icons.schedule,
                                        color: status == 'late' ? Colors.orange : Colors.grey,
                                      ),
                                      onPressed: () => _markAttendance(student, 'late'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                  ],
                ],
              ),
            ),
    );
  }
}
