import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// Coach Analytics Screen - Performance metrics for coaches
class CoachAnalyticsScreen extends StatefulWidget {
  const CoachAnalyticsScreen({super.key});

  @override
  State<CoachAnalyticsScreen> createState() => _CoachAnalyticsScreenState();
}

class _CoachAnalyticsScreenState extends State<CoachAnalyticsScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  List<dynamic> _events = [];
  List<dynamic> _groups = [];
  List<dynamic> _students = [];
  Map<String, dynamic> _coachStats = {};
  
  String _selectedPeriod = 'month';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _apiService.getEvents(),
        _apiService.getGroups(),
        _apiService.getStudents(),
      ]);
      
      _events = results[0];
      _groups = results[1];
      _students = results[2];
      
      _calculateCoachStats();
    } catch (e) {
      debugPrint('Error loading coach analytics: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _calculateCoachStats() {
    final now = DateTime.now();
    DateTime start, end;
    
    switch (_selectedPeriod) {
      case 'week':
        start = now.subtract(Duration(days: now.weekday - 1));
        end = now;
        break;
      case 'month':
        start = DateTime(now.year, now.month, 1);
        end = now;
        break;
      case 'year':
        start = DateTime(now.year, 1, 1);
        end = now;
        break;
      default:
        start = DateTime(now.year, now.month, 1);
        end = now;
    }
    
    // Filter events in period
    final periodEvents = _events.where((e) {
      final date = DateTime.tryParse(e['start_time'] ?? '');
      return date != null && date.isAfter(start) && date.isBefore(end.add(const Duration(days: 1)));
    }).toList();
    
    final trainings = periodEvents.where((e) => e['type'] == 'training').length;
    final individual = periodEvents.where((e) => e['type'] == 'individual').length;
    final matches = periodEvents.where((e) => e['type'] == 'match' || e['type'] == 'game').length;
    
    // Calculate hours
    final totalHours = periodEvents.fold<double>(0, (sum, e) {
      final startTime = DateTime.tryParse(e['start_time'] ?? '');
      final endTime = DateTime.tryParse(e['end_time'] ?? '');
      if (startTime != null && endTime != null) {
        return sum + endTime.difference(startTime).inMinutes / 60;
      }
      return sum + 1.5; // Default 1.5 hours per session
    });
    
    _coachStats = {
      'totalSessions': periodEvents.length,
      'trainings': trainings,
      'individual': individual,
      'matches': matches,
      'totalHours': totalHours,
      'avgPerWeek': (periodEvents.length / (_getDaysInPeriod() / 7)).toStringAsFixed(1),
      'studentsCount': _students.where((s) => s['status'] == 'active').length,
      'groupsCount': _groups.length,
    };
  }

  int _getDaysInPeriod() {
    switch (_selectedPeriod) {
      case 'week': return 7;
      case 'month': return 30;
      case 'year': return 365;
      default: return 30;
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
            Text('👨‍🏫 ', style: TextStyle(fontSize: 24)),
            Text('Моя статистика'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : RefreshIndicator(
              onRefresh: _loadData,
              color: const Color(0xFFFFC107),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Period selector
                    _buildPeriodSelector(),
                    const SizedBox(height: 20),
                    
                    // Main stats cards
                    _buildMainStats(),
                    const SizedBox(height: 20),
                    
                    // Sessions breakdown
                    _buildSessionsBreakdown(),
                    const SizedBox(height: 20),
                    
                    // Weekly schedule overview
                    _buildWeeklyOverview(),
                    const SizedBox(height: 20),
                    
                    // Performance chart
                    _buildPerformanceChart(),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildPeriodSelector() {
    final periods = [
      {'id': 'week', 'label': 'Неделя'},
      {'id': 'month', 'label': 'Месяц'},
      {'id': 'year', 'label': 'Год'},
    ];
    
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: periods.map((p) {
          final isSelected = _selectedPeriod == p['id'];
          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedPeriod = p['id'] as String;
                _calculateCoachStats();
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFFFFC107).withOpacity(0.2) : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                p['label'] as String,
                style: TextStyle(
                  color: isSelected ? const Color(0xFFFFC107) : Colors.grey,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildMainStats() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFFFFC107).withOpacity(0.2), const Color(0xFF23272E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem(
                '🏃',
                '${_coachStats['totalSessions'] ?? 0}',
                'Тренировок',
              ),
              Container(width: 1, height: 50, color: Colors.white10),
              _buildStatItem(
                '⏱️',
                '${(_coachStats['totalHours'] ?? 0).toStringAsFixed(1)}ч',
                'Всего часов',
              ),
              Container(width: 1, height: 50, color: Colors.white10),
              _buildStatItem(
                '📊',
                '${_coachStats['avgPerWeek'] ?? 0}',
                'В среднем/нед',
              ),
            ],
          ),
          const SizedBox(height: 20),
          const Divider(color: Colors.white10),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem(
                '👥',
                '${_coachStats['studentsCount'] ?? 0}',
                'Учеников',
              ),
              Container(width: 1, height: 50, color: Colors.white10),
              _buildStatItem(
                '📚',
                '${_coachStats['groupsCount'] ?? 0}',
                'Групп',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String emoji, String value, String label) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 24)),
        const SizedBox(height: 8),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(color: Colors.grey, fontSize: 12),
        ),
      ],
    );
  }

  Widget _buildSessionsBreakdown() {
    final breakdown = [
      {'type': 'Групповые', 'count': _coachStats['trainings'] ?? 0, 'icon': Icons.groups, 'color': Colors.blue},
      {'type': 'Индивидуальные', 'count': _coachStats['individual'] ?? 0, 'icon': Icons.person, 'color': Colors.green},
      {'type': 'Матчи', 'count': _coachStats['matches'] ?? 0, 'icon': Icons.sports_soccer, 'color': Colors.orange},
    ];
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.pie_chart, color: Color(0xFFFFC107)),
              SizedBox(width: 8),
              Text(
                'Разбивка по типам',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...breakdown.map((b) {
            final total = (_coachStats['totalSessions'] ?? 1);
            final percent = total > 0 ? ((b['count'] as int) / total * 100).round() : 0;
            
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: (b['color'] as Color).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(b['icon'] as IconData, color: b['color'] as Color, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(b['type'] as String, style: const TextStyle(color: Colors.white)),
                            Text('${b['count']}', style: TextStyle(color: b['color'] as Color, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        LinearProgressIndicator(
                          value: percent / 100,
                          backgroundColor: Colors.white10,
                          valueColor: AlwaysStoppedAnimation(b['color'] as Color),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text('$percent%', style: const TextStyle(color: Colors.grey)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildWeeklyOverview() {
    final weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    final now = DateTime.now();
    
    // Count events per weekday
    final eventsByDay = <int, int>{};
    for (var e in _events) {
      final date = DateTime.tryParse(e['start_time'] ?? '');
      if (date != null) {
        eventsByDay[date.weekday] = (eventsByDay[date.weekday] ?? 0) + 1;
      }
    }
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.calendar_view_week, color: Color(0xFFFFC107)),
              SizedBox(width: 8),
              Text(
                'Нагрузка по дням',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(7, (i) {
              final dayNum = i + 1;
              final count = eventsByDay[dayNum] ?? 0;
              final maxCount = eventsByDay.values.isEmpty ? 1 : eventsByDay.values.reduce((a, b) => a > b ? a : b);
              final heightPercent = maxCount > 0 ? count / maxCount : 0.0;
              final isToday = now.weekday == dayNum;
              
              return Column(
                children: [
                  SizedBox(
                    height: 80,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '$count',
                          style: TextStyle(
                            color: isToday ? const Color(0xFFFFC107) : Colors.grey,
                            fontSize: 10,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          width: 30,
                          height: 60 * heightPercent + 10,
                          decoration: BoxDecoration(
                            color: isToday 
                                ? const Color(0xFFFFC107) 
                                : const Color(0xFFFFC107).withOpacity(0.3),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    weekdays[i],
                    style: TextStyle(
                      color: isToday ? const Color(0xFFFFC107) : Colors.grey,
                      fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ],
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildPerformanceChart() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.trending_up, color: Colors.green),
              SizedBox(width: 8),
              Text(
                'Эффективность',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _buildPerformanceRow('Посещаемость групп', 0.87, Colors.green),
          _buildPerformanceRow('Выполнение плана', 0.92, const Color(0xFFFFC107)),
          _buildPerformanceRow('Обратная связь', 0.78, Colors.blue),
        ],
      ),
    );
  }

  Widget _buildPerformanceRow(String label, double value, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(color: Colors.white)),
              Text('${(value * 100).round()}%', style: TextStyle(color: color, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: value,
              backgroundColor: Colors.white10,
              valueColor: AlwaysStoppedAnimation(color),
              minHeight: 8,
            ),
          ),
        ],
      ),
    );
  }
}
