import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';

/// Weekly Schedule Screen - Shows training schedule for all groups
/// With offline caching support
class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  bool _isOffline = false;
  List<dynamic> _events = [];
  List<dynamic> _groups = [];
  DateTime _selectedWeekStart = DateTime.now();
  int? _selectedGroupId;
  
  // Cache keys
  static const String _cacheKeyGroups = 'schedule_groups';
  String get _cacheKeyEvents => 'schedule_events_${_selectedWeekStart.toIso8601String().split('T')[0]}';

  final List<String> _weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  final List<String> _weekDaysFull = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

  @override
  void initState() {
    super.initState();
    _selectedWeekStart = _getWeekStart(DateTime.now());
    _loadData();
  }

  DateTime _getWeekStart(DateTime date) {
    final weekday = date.weekday;
    return DateTime(date.year, date.month, date.day - weekday + 1);
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    // Try cache first
    await _loadFromCache();
    
    try {
      final results = await Future.wait([
        _apiService.getEvents(
          limit: 10000,
          startDate: _selectedWeekStart,
          endDate: _selectedWeekStart.add(const Duration(days: 7)),
        ),
        _apiService.getGroups(),
      ]);
      
      _events = results[0];
      _groups = results[1];
      _isOffline = false;
      
      // Save to cache
      await _saveToCache();
    } catch (e) {
      debugPrint('Error loading schedule: $e');
      _isOffline = true;
    } finally {
      setState(() => _isLoading = false);
    }
  }
  
  Future<void> _loadFromCache() async {
    try {
      final cachedGroups = await OfflineStorageService.getCache(_cacheKeyGroups);
      final cachedEvents = await OfflineStorageService.getCache(_cacheKeyEvents);
      
      if (cachedGroups != null) _groups = List<dynamic>.from(cachedGroups);
      if (cachedEvents != null) {
        _events = List<dynamic>.from(cachedEvents);
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Cache load error: $e');
    }
  }
  
  Future<void> _saveToCache() async {
    try {
      await OfflineStorageService.setCache(_cacheKeyGroups, _groups, ttl: const Duration(hours: 12));
      await OfflineStorageService.setCache(_cacheKeyEvents, _events, ttl: const Duration(hours: 1));
    } catch (e) {
      debugPrint('Cache save error: $e');
    }
  }

  List<dynamic> _getEventsForDay(int weekday) {
    return _events.where((e) {
      final date = DateTime.tryParse(e['start_time'] ?? '');
      if (date == null) return false;
      if (date.weekday != weekday) return false;
      if (_selectedGroupId != null && e['group_id'] != _selectedGroupId) return false;
      return true;
    }).toList()
      ..sort((a, b) {
        final aTime = DateTime.tryParse(a['start_time'] ?? '') ?? DateTime.now();
        final bTime = DateTime.tryParse(b['start_time'] ?? '') ?? DateTime.now();
        return aTime.compareTo(bTime);
      });
  }

  void _previousWeek() {
    setState(() {
      _selectedWeekStart = _selectedWeekStart.subtract(const Duration(days: 7));
    });
    _loadData();
  }

  void _nextWeek() {
    setState(() {
      _selectedWeekStart = _selectedWeekStart.add(const Duration(days: 7));
    });
    _loadData();
  }

  void _goToToday() {
    setState(() {
      _selectedWeekStart = _getWeekStart(DateTime.now());
    });
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    final weekEnd = _selectedWeekStart.add(const Duration(days: 6));
    final now = DateTime.now();
    final isCurrentWeek = _selectedWeekStart.isBefore(now) && 
                          weekEnd.isAfter(now.subtract(const Duration(days: 1)));
    
    return Scaffold(
      backgroundColor: const Color(0xFF1A1D23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: Row(
          children: [
            const Text('📅 ', style: TextStyle(fontSize: 24)),
            const Text('Расписание'),
            if (_isOffline) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off, size: 12, color: Colors.orange),
                    SizedBox(width: 4),
                    Text('Offline', style: TextStyle(fontSize: 10, color: Colors.orange)),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          if (!isCurrentWeek)
            TextButton.icon(
              onPressed: _goToToday,
              icon: const Icon(Icons.today, color: Color(0xFFFFC107)),
              label: const Text('Сегодня', style: TextStyle(color: Color(0xFFFFC107))),
            ),
        ],
      ),
      body: Column(
        children: [
          // Week navigation
          _buildWeekNavigator(),
          
          // Group filter
          _buildGroupFilter(),
          
          // Schedule content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
                : RefreshIndicator(
                    onRefresh: _loadData,
                    color: const Color(0xFFFFC107),
                    child: _buildScheduleList(),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildWeekNavigator() {
    final weekEnd = _selectedWeekStart.add(const Duration(days: 6));
    final monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    
    String weekRange;
    if (_selectedWeekStart.month == weekEnd.month) {
      weekRange = '${_selectedWeekStart.day} - ${weekEnd.day} ${monthNames[_selectedWeekStart.month - 1]}';
    } else {
      weekRange = '${_selectedWeekStart.day} ${monthNames[_selectedWeekStart.month - 1]} - ${weekEnd.day} ${monthNames[weekEnd.month - 1]}';
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.1))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: _previousWeek,
            icon: const Icon(Icons.chevron_left, color: Colors.white),
          ),
          GestureDetector(
            onTap: _goToToday,
            child: Column(
              children: [
                Text(
                  weekRange,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${_selectedWeekStart.year}',
                  style: const TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: _nextWeek,
            icon: const Icon(Icons.chevron_right, color: Colors.white),
          ),
        ],
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
    final isSelected = _selectedGroupId == groupId;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        selected: isSelected,
        label: Text(label),
        labelStyle: TextStyle(
          color: isSelected ? Colors.black : Colors.white,
          fontSize: 12,
        ),
        backgroundColor: const Color(0xFF23272E),
        selectedColor: const Color(0xFFFFC107),
        checkmarkColor: Colors.black,
        side: BorderSide(color: isSelected ? const Color(0xFFFFC107) : Colors.white24),
        onSelected: (_) {
          setState(() => _selectedGroupId = groupId);
        },
      ),
    );
  }

  Widget _buildScheduleList() {
    final now = DateTime.now();
    
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: 7,
      itemBuilder: (context, index) {
        final dayNum = index + 1;
        final dayDate = _selectedWeekStart.add(Duration(days: index));
        final events = _getEventsForDay(dayNum);
        final isToday = now.year == dayDate.year && 
                        now.month == dayDate.month && 
                        now.day == dayDate.day;
        final isPast = dayDate.isBefore(DateTime(now.year, now.month, now.day));
        
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: const Color(0xFF23272E),
            borderRadius: BorderRadius.circular(16),
            border: isToday 
                ? Border.all(color: const Color(0xFFFFC107), width: 2) 
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Day header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isToday 
                      ? const Color(0xFFFFC107).withOpacity(0.2) 
                      : isPast 
                          ? Colors.white.withOpacity(0.05)
                          : Colors.transparent,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: isToday 
                            ? const Color(0xFFFFC107) 
                            : Colors.white.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            _weekDays[index],
                            style: TextStyle(
                              color: isToday ? Colors.black : Colors.grey,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${dayDate.day}',
                            style: TextStyle(
                              color: isToday ? Colors.black : Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _weekDaysFull[index],
                            style: TextStyle(
                              color: isToday ? const Color(0xFFFFC107) : Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            events.isEmpty 
                                ? 'Нет занятий' 
                                : '${events.length} ${_pluralize(events.length, 'занятие', 'занятия', 'занятий')}',
                            style: TextStyle(
                              color: events.isEmpty ? Colors.grey : Colors.green,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isToday)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFFC107),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'СЕГОДНЯ',
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              
              // Events list
              if (events.isNotEmpty)
                ...events.map((e) => _buildEventTile(e, isPast)),
              
              if (events.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Center(
                    child: Text(
                      'Нет запланированных занятий',
                      style: TextStyle(color: Colors.grey[600], fontSize: 14),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildEventTile(dynamic event, bool isPast) {
    final startTime = DateTime.tryParse(event['start_time'] ?? '');
    final endTime = DateTime.tryParse(event['end_time'] ?? '');
    final type = event['type'] ?? 'training';
    final groupName = event['group_name'] ?? _getGroupName(event['group_id']);
    
    final timeStr = startTime != null 
        ? '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}'
        : '';
    final endTimeStr = endTime != null 
        ? '${endTime.hour.toString().padLeft(2, '0')}:${endTime.minute.toString().padLeft(2, '0')}'
        : '';
    
    Color typeColor;
    IconData typeIcon;
    String typeName;
    
    switch (type) {
      case 'training':
        typeColor = Colors.blue;
        typeIcon = Icons.fitness_center;
        typeName = 'Тренировка';
        break;
      case 'match':
      case 'game':
        typeColor = Colors.green;
        typeIcon = Icons.sports_soccer;
        typeName = 'Матч';
        break;
      case 'tournament':
        typeColor = Colors.orange;
        typeIcon = Icons.emoji_events;
        typeName = 'Турнир';
        break;
      case 'individual':
        typeColor = Colors.purple;
        typeIcon = Icons.person;
        typeName = 'Индивидуальная';
        break;
      default:
        typeColor = Colors.grey;
        typeIcon = Icons.event;
        typeName = 'Событие';
    }
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        children: [
          // Time column
          SizedBox(
            width: 60,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  timeStr,
                  style: TextStyle(
                    color: isPast ? Colors.grey : Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (endTimeStr.isNotEmpty)
                  Text(
                    endTimeStr,
                    style: TextStyle(color: Colors.grey[600], fontSize: 12),
                  ),
              ],
            ),
          ),
          
          // Color indicator
          Container(
            width: 4,
            height: 50,
            margin: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: isPast ? typeColor.withOpacity(0.5) : typeColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          
          // Event details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(typeIcon, size: 16, color: typeColor),
                    const SizedBox(width: 6),
                    Text(
                      typeName,
                      style: TextStyle(
                        color: isPast ? Colors.grey : typeColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  event['title'] ?? groupName,
                  style: TextStyle(
                    color: isPast ? Colors.grey : Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (event['location'] != null)
                  Row(
                    children: [
                      Icon(Icons.location_on, size: 12, color: Colors.grey[600]),
                      const SizedBox(width: 4),
                      Text(
                        event['location'],
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          
          // Attendance indicator (if past)
          if (isPast)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check, size: 14, color: Colors.green),
                  SizedBox(width: 4),
                  Text('✓', style: TextStyle(color: Colors.green, fontSize: 12)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _getGroupName(int? groupId) {
    if (groupId == null) return '';
    final group = _groups.firstWhere((g) => g['id'] == groupId, orElse: () => null);
    return group?['name'] ?? 'Группа $groupId';
  }

  String _pluralize(int count, String one, String few, String many) {
    if (count % 10 == 1 && count % 100 != 11) return one;
    if ([2, 3, 4].contains(count % 10) && ![12, 13, 14].contains(count % 100)) return few;
    return many;
  }
}
