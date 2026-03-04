import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';
import '../../services/api_service.dart';
import '../../models/event.dart';
import '../../models/group.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import 'attendance_marking_screen.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  // Календарь по умолчанию на месяц
  CalendarFormat _calendarFormat = CalendarFormat.month;
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;
  List<Event> _events = [];
  List<Group> _myGroups = [];
  bool _isLoading = true;
  String? _errorMessage;
  
  // Фильтр по группе (null = все группы)
  int? _selectedGroupId;

  @override
  void initState() {
    super.initState();
    _selectedDay = _focusedDay;
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final apiService = ApiService();
      final user = context.read<AuthProvider>().user;
      
      final groupsData = await apiService.getGroups();
      final allGroups = groupsData.map((g) => Group.fromJson(g)).toList();
      final myGroups = allGroups.where((g) => g.coachId == user?.id).toList();
      
      final eventsData = await apiService.getEvents();
      final allEvents = eventsData.map((e) => Event.fromJson(e)).toList();
      
      final myGroupIds = myGroups.map((g) => g.id).toSet();
      final myEvents = allEvents.where((e) => myGroupIds.contains(e.groupId)).toList();
      
      if (mounted) {
        setState(() {
          _myGroups = myGroups;
          _events = myEvents;
          _isLoading = false;
          if (myGroups.isEmpty) {
            _errorMessage = 'Вам не назначены группы';
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Ошибка загрузки: $e';
        });
      }
    }
  }

  // Фильтрованные события по выбранной группе
  List<Event> get _filteredEvents {
    if (_selectedGroupId == null) return _events;
    return _events.where((e) => e.groupId == _selectedGroupId).toList();
  }

  List<Event> _getEventsForDay(DateTime day) {
    return _filteredEvents.where((event) {
      try {
        final eventDate = DateTime.parse(event.startTime);
        return eventDate.year == day.year &&
            eventDate.month == day.month &&
            eventDate.day == day.day;
      } catch (e) {
        return false;
      }
    }).toList();
  }

  // Подсчёт событий в месяце для группы
  int _getMonthEventsCount(int? groupId) {
    final events = groupId == null ? _events : _events.where((e) => e.groupId == groupId);
    return events.where((e) {
      try {
        final eventDate = DateTime.parse(e.startTime);
        return eventDate.year == _focusedDay.year && eventDate.month == _focusedDay.month;
      } catch (_) {
        return false;
      }
    }).length;
  }
  
  String _getGroupName(int? groupId) {
    if (groupId == null) return 'Без группы';
    final group = _myGroups.firstWhere(
      (g) => g.id == groupId, 
      orElse: () => Group(id: 0, name: 'Группа $groupId', monthlyFee: 0)
    );
    return group.name;
  }

  String _getMonthName(int month) {
    const months = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    return months[month];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)));
    }
    
    if (_errorMessage != null && _myGroups.isEmpty) {
      return _buildEmptyState();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF14181F),
      body: RefreshIndicator(
        onRefresh: _loadData,
        color: const Color(0xFFFFC107),
        child: Column(
          children: [
            // Фильтр по группам
            _buildGroupFilter(),
            
            // Статистика месяца
            _buildMonthStats(),
            
            // Календарь (месяц по умолчанию)
            _buildCalendar(),
            
            // Заголовок списка событий
            _buildEventsHeader(),
            
            // Список событий
            Expanded(child: _buildEventsList(l10n)),
          ],
        ),
      ),
    );
  }

  Widget _buildGroupFilter() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      color: const Color(0xFF23272E),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '🎯 Фильтр:',
                style: TextStyle(color: Colors.white70, fontSize: 12),
              ),
              const SizedBox(width: 8),
              Text(
                _selectedGroupId == null 
                    ? 'Все группы' 
                    : _getGroupName(_selectedGroupId),
                style: const TextStyle(
                  color: Color(0xFFFFC107),
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                // Кнопка "Все группы"
                _buildFilterChip(
                  label: 'Все группы',
                  count: _getMonthEventsCount(null),
                  isSelected: _selectedGroupId == null,
                  onTap: () => setState(() => _selectedGroupId = null),
                ),
                const SizedBox(width: 8),
                // Кнопки групп
                ..._myGroups.map((group) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _buildFilterChip(
                    label: group.name,
                    count: _getMonthEventsCount(group.id),
                    isSelected: _selectedGroupId == group.id,
                    onTap: () => setState(() => _selectedGroupId = group.id),
                  ),
                )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip({
    required String label,
    required int count,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected 
              ? const Color(0xFFFFC107) 
              : const Color(0xFF2D323B),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isSelected ? const Color(0xFFFFC107) : Colors.grey[700]!,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.black : Colors.white,
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.black.withOpacity(0.2) : const Color(0xFFFFC107).withOpacity(0.3),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(
                    color: isSelected ? Colors.black : const Color(0xFFFFC107),
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMonthStats() {
    final monthEvents = _filteredEvents.where((e) {
      try {
        final d = DateTime.parse(e.startTime);
        return d.year == _focusedDay.year && d.month == _focusedDay.month;
      } catch (_) {
        return false;
      }
    }).toList();

    final trainings = monthEvents.where((e) => e.type == 'training').length;
    final games = monthEvents.where((e) => e.type == 'game' || e.type == 'match').length;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatItem('📅', _getMonthName(_focusedDay.month), '${_focusedDay.year}'),
          _buildStatItem('🏋️', '$trainings', 'тренировок'),
          _buildStatItem('⚽', '$games', 'игр'),
          _buildStatItem('📊', '${monthEvents.length}', 'всего'),
        ],
      ),
    );
  }

  Widget _buildStatItem(String emoji, String value, String label) {
    return Column(
      children: [
        Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 14)),
            const SizedBox(width: 4),
            Text(
              value,
              style: const TextStyle(
                color: Color(0xFFFFC107),
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        Text(
          label,
          style: TextStyle(color: Colors.grey[500], fontSize: 10),
        ),
      ],
    );
  }

  Widget _buildCalendar() {
    return TableCalendar(
      firstDay: DateTime.utc(2020, 1, 1),
      lastDay: DateTime.utc(2030, 12, 31),
      focusedDay: _focusedDay,
      calendarFormat: _calendarFormat,
      selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
      onDaySelected: (selectedDay, focusedDay) {
        setState(() {
          _selectedDay = selectedDay;
          _focusedDay = focusedDay;
        });
      },
      onPageChanged: (focusedDay) {
        setState(() => _focusedDay = focusedDay);
      },
      onFormatChanged: (format) {
        setState(() => _calendarFormat = format);
      },
      eventLoader: _getEventsForDay,
      availableCalendarFormats: const {
        CalendarFormat.month: 'Месяц',
        CalendarFormat.twoWeeks: '2 недели',
        CalendarFormat.week: 'Неделя',
      },
      calendarStyle: CalendarStyle(
        todayDecoration: BoxDecoration(
          color: Colors.blue.withOpacity(0.5),
          shape: BoxShape.circle,
        ),
        selectedDecoration: const BoxDecoration(
          color: Color(0xFFFFC107),
          shape: BoxShape.circle,
        ),
        markerDecoration: const BoxDecoration(
          color: Colors.green,
          shape: BoxShape.circle,
        ),
        markersMaxCount: 3,
        markerSize: 6,
        defaultTextStyle: const TextStyle(color: Colors.white),
        weekendTextStyle: TextStyle(color: Colors.grey[500]),
        outsideTextStyle: TextStyle(color: Colors.grey[700]),
      ),
      daysOfWeekStyle: DaysOfWeekStyle(
        weekdayStyle: TextStyle(color: Colors.grey[400], fontSize: 12),
        weekendStyle: TextStyle(color: Colors.grey[600], fontSize: 12),
      ),
      headerStyle: HeaderStyle(
        titleCentered: true,
        formatButtonVisible: true,
        formatButtonShowsNext: false,
        formatButtonTextStyle: const TextStyle(color: Colors.black, fontSize: 12),
        formatButtonDecoration: BoxDecoration(
          color: const Color(0xFFFFC107),
          borderRadius: BorderRadius.circular(12),
        ),
        titleTextStyle: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        leftChevronIcon: const Icon(Icons.chevron_left, color: Color(0xFFFFC107)),
        rightChevronIcon: const Icon(Icons.chevron_right, color: Color(0xFFFFC107)),
      ),
    );
  }

  Widget _buildEventsHeader() {
    final dayEvents = _getEventsForDay(_selectedDay!);
    final dayStr = '${_selectedDay!.day} ${_getMonthName(_selectedDay!.month).substring(0, 3).toLowerCase()}';
    
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.event, color: Color(0xFFFFC107), size: 18),
              const SizedBox(width: 8),
              Text(
                'События на $dayStr',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: dayEvents.isEmpty 
                  ? Colors.grey[800] 
                  : const Color(0xFFFFC107).withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '${dayEvents.length}',
              style: TextStyle(
                color: dayEvents.isEmpty ? Colors.grey[500] : const Color(0xFFFFC107),
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventsList(AppLocalizations l10n) {
    final dayEvents = _getEventsForDay(_selectedDay!);
    
    if (dayEvents.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_busy, size: 48, color: Colors.grey[700]),
            const SizedBox(height: 12),
            Text(
              'Нет событий',
              style: TextStyle(color: Colors.grey[500], fontSize: 14),
            ),
            const SizedBox(height: 4),
            Text(
              'Выберите другой день в календаре',
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: dayEvents.length,
      padding: const EdgeInsets.only(bottom: 16),
      itemBuilder: (context, index) {
        final event = dayEvents[index];
        final groupName = _getGroupName(event.groupId);
        final isGame = event.type == 'game' || event.type == 'match';
        
        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          color: const Color(0xFF2D323B),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(
              color: isGame ? Colors.green.withOpacity(0.3) : Colors.blue.withOpacity(0.3),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isGame 
                            ? Colors.green.withOpacity(0.2) 
                            : Colors.blue.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        isGame ? Icons.sports_soccer : Icons.fitness_center,
                        color: isGame ? Colors.green : Colors.blue,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isGame ? 'Игра / Матч' : 'Тренировка',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFC107).withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '📚 $groupName',
                              style: const TextStyle(
                                color: Color(0xFFFFC107),
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.access_time, size: 14, color: Colors.grey[400]),
                    const SizedBox(width: 4),
                    Text(
                      event.formattedTimeRange,
                      style: TextStyle(color: Colors.grey[300], fontSize: 13),
                    ),
                    if (event.location != null && event.location!.isNotEmpty) ...[
                      const SizedBox(width: 16),
                      Icon(Icons.location_on, size: 14, color: Colors.grey[400]),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          event.location!,
                          style: TextStyle(color: Colors.grey[300], fontSize: 13),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () async {
                      final result = await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AttendanceMarkingScreen(
                            event: event,
                            groupName: groupName,
                          ),
                        ),
                      );
                      // Обновить данные если были изменения
                      if (result == true) {
                        _loadData();
                      }
                    },
                    icon: const Icon(Icons.checklist, size: 16),
                    label: const Text('✅ Отметить посещаемость'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFFC107),
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
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

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.group_off, size: 80, color: Colors.grey),
            const SizedBox(height: 24),
            Text(
              'Нет назначенных групп',
              style: TextStyle(
                color: Colors.grey[300],
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Обратитесь к администратору для назначения вас тренером группы',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[500]),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: const Text('Обновить'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: Colors.black,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
