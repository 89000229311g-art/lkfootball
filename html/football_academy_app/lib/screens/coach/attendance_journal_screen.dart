import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../models/group.dart';
import '../../providers/auth_provider.dart';
import '../../l10n/app_localizations.dart';

/// 📊 Журнал посещаемости - ТОЛЬКО статистика и табель
/// Отметка посещений происходит в расписании
class AttendanceJournalScreen extends StatefulWidget {
  const AttendanceJournalScreen({super.key});

  @override
  State<AttendanceJournalScreen> createState() => _AttendanceJournalScreenState();
}

class _AttendanceJournalScreenState extends State<AttendanceJournalScreen> {
  final ApiService _apiService = ApiService();
  
  List<Group> _groups = [];
  Group? _selectedGroup;
  
  // Текущий выбранный месяц/год
  int _selectedYear = DateTime.now().year;
  int _selectedMonth = DateTime.now().month;
  
  // Данные табеля
  Map<String, dynamic>? _monthlyReport;
  bool _isLoading = true;
  String? _errorMessage;
  
  // Годовая статистика по каждому ученику
  Map<int, List<Map<String, dynamic>>> _yearStats = {}; // studentId -> [{month, present, total}]

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    try {
      final user = context.read<AuthProvider>().user;
      final data = await _apiService.getGroups();
      final allGroups = data.map((g) => Group.fromJson(g)).toList();
      
      final coachGroups = allGroups.where((g) => g.coachId == user?.id).toList();
      
      setState(() {
        _groups = coachGroups;
        if (_groups.isEmpty) {
          _isLoading = false;
          _errorMessage = context.l10n.translate('no_assigned_groups');
          return;
        }
        _selectedGroup = _groups.first;
      });
      
      await _loadMonthlyReport();
      await _loadYearStats();
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '${context.l10n.translate('error')}: $e';
      });
    }
  }

  Future<void> _loadMonthlyReport() async {
    if (_selectedGroup == null) return;
    
    setState(() => _isLoading = true);
    try {
      final report = await _apiService.getMonthlyAttendanceReport(
        _selectedGroup!.id, _selectedYear, _selectedMonth
      );
      setState(() {
        _monthlyReport = report;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '${context.l10n.translate('error')}: $e';
      });
    }
  }

  // Загрузка статистики за весь год для сравнения
  Future<void> _loadYearStats() async {
    if (_selectedGroup == null) return;
    
    final stats = <int, List<Map<String, dynamic>>>{};
    
    // Загружаем данные за каждый месяц года
    for (int month = 1; month <= 12; month++) {
      try {
        final report = await _apiService.getMonthlyAttendanceReport(
          _selectedGroup!.id, _selectedYear, month
        );
        
        if (report['students'] != null) {
          for (var s in report['students']) {
            final studentId = s['student_id'] as int;
            stats[studentId] ??= [];
            stats[studentId]!.add({
              'month': month,
              'present': s['present_count'] ?? 0,
              'total': s['total_trainings'] ?? 0,
            });
          }
        }
      } catch (_) {
        // Пропускаем месяцы без данных
      }
    }
    
    setState(() => _yearStats = stats);
  }

  void _changeMonth(int delta) {
    setState(() {
      _selectedMonth += delta;
      if (_selectedMonth > 12) {
        _selectedMonth = 1;
        _selectedYear++;
      } else if (_selectedMonth < 1) {
        _selectedMonth = 12;
        _selectedYear--;
      }
    });
    _loadMonthlyReport();
  }

  void _changeYear(int delta) {
    setState(() {
      _selectedYear += delta;
    });
    _loadMonthlyReport();
    _loadYearStats();
  }

  String _getMonthName(int month) {
    const keys = [
      '', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ];
    if (month >= 1 && month <= 12) {
      return context.l10n.translate(keys[month]);
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading && _groups.isEmpty) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Color(0xFFFFC107))),
      );
    }
    
    if (_groups.isEmpty || _errorMessage != null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.group_off, size: 80, color: Colors.grey),
                const SizedBox(height: 24),
                Text(
                  _errorMessage ?? context.l10n.translate('no_assigned_groups'),
                  style: TextStyle(color: Colors.grey[300], fontSize: 18),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () {
                    setState(() {
                      _isLoading = true;
                      _errorMessage = null;
                    });
                    _loadGroups();
                  },
                  icon: const Icon(Icons.refresh),
                  label: Text(context.l10n.translate('refresh')),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFFC107),
                    foregroundColor: Colors.black,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      body: Column(
        children: [
          // 🔝 Header - Группа и навигация
          _buildHeader(),
          
          // 📊 Контент - табель
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
                : _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF23272E),
        boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 4)],
      ),
      child: Column(
        children: [
          // Выбор группы
          DropdownButtonFormField<Group>(
            initialValue: _selectedGroup,
            decoration: InputDecoration(
              labelText: context.l10n.translate('group'),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            dropdownColor: const Color(0xFF23272E),
            items: _groups.map((g) => DropdownMenuItem(
              value: g,
              child: Text(g.name, style: const TextStyle(color: Colors.white)),
            )).toList(),
            onChanged: (val) {
              setState(() => _selectedGroup = val);
              _loadMonthlyReport();
              _loadYearStats();
            },
          ),
          
          const SizedBox(height: 16),
          
          // Навигация по году
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () => _changeYear(-1),
                icon: const Icon(Icons.keyboard_double_arrow_left, color: Colors.white70),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFC107).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$_selectedYear',
                  style: const TextStyle(
                    color: Color(0xFFFFC107),
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
              ),
              IconButton(
                onPressed: () => _changeYear(1),
                icon: const Icon(Icons.keyboard_double_arrow_right, color: Colors.white70),
              ),
            ],
          ),
          
          const SizedBox(height: 8),
          
          // Навигация по месяцам
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                onPressed: () => _changeMonth(-1),
                icon: const Icon(Icons.chevron_left, color: Colors.white, size: 32),
              ),
              Text(
                _getMonthName(_selectedMonth),
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 20,
                ),
              ),
              IconButton(
                onPressed: () => _changeMonth(1),
                icon: const Icon(Icons.chevron_right, color: Colors.white, size: 32),
              ),
            ],
          ),
          
          // Подсказка
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              context.l10n.translate('attendance_hint'),
              style: TextStyle(color: Colors.grey[500], fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_monthlyReport == null) {
      return Center(
        child: Text(context.l10n.translate('no_data'), style: const TextStyle(color: Colors.grey)),
      );
    }
    
    final students = _monthlyReport!['students'] as List? ?? [];
    final trainingDates = _monthlyReport!['training_dates'] as List? ?? [];
    final totalTrainings = _monthlyReport!['total_trainings'] ?? 0;
    
    if (students.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.event_busy, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              '${context.l10n.translate('no_trainings_in')} ${_getMonthName(_selectedMonth)}',
              style: TextStyle(color: Colors.grey[400], fontSize: 16),
            ),
          ],
        ),
      );
    }
    
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 📊 Сводка за месяц
        _buildMonthlySummary(students, totalTrainings),
        
        const SizedBox(height: 16),
        
        // 📋 Список учеников с детальной статистикой
        ...students.map((s) => _buildStudentCard(s)),
        
        const SizedBox(height: 24),
        
        // 📈 Годовая динамика
        _buildYearDynamics(),
      ],
    );
  }

  Widget _buildMonthlySummary(List students, int totalTrainings) {
    int totalPresent = 0;
    int totalAbsent = 0;
    
    for (var s in students) {
      totalPresent += (s['present_count'] ?? 0) as int;
      totalAbsent += (s['absent_count'] ?? 0) as int;
    }
    
    final avgAttendance = totalTrainings > 0 && students.isNotEmpty
        ? (totalPresent / (students.length * totalTrainings) * 100).round()
        : 0;
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFFFFC107).withOpacity(0.2), Colors.transparent],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Text(
            '📊 ${_getMonthName(_selectedMonth)} $_selectedYear',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _buildStatItem('🏃', context.l10n.translate('trainings_count'), '$totalTrainings'),
              _buildStatItem('👥', context.l10n.translate('students_count'), '${students.length}'),
              _buildStatItem('📈', context.l10n.translate('attendance_rate'), '$avgAttendance%'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String emoji, String label, String value) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 24)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
        Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 12)),
      ],
    );
  }

  Widget _buildStudentCard(Map<String, dynamic> student) {
    final present = student['present_count'] ?? 0;
    final absent = student['absent_count'] ?? 0;
    final total = student['total_trainings'] ?? 0;
    final percentage = student['attendance_percentage'] ?? 0;
    final name = student['student_name'] ?? context.l10n.translate('student');
    
    Color percentColor = Colors.red;
    if (percentage >= 90) {
      percentColor = Colors.green;
    } else if (percentage >= 70) {
      percentColor = Colors.orange;
    } else if (percentage >= 50) {
      percentColor = Colors.yellow;
    }
    
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // Аватар с процентом
            Stack(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: percentColor.withOpacity(0.2),
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: TextStyle(color: percentColor, fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    decoration: BoxDecoration(
                      color: percentColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$percentage%',
                      style: const TextStyle(color: Colors.black, fontSize: 9, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 12),
            
            // Имя и статистика
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      _buildMiniStat('✅', present, Colors.green),
                      const SizedBox(width: 12),
                      _buildMiniStat('❌', absent, Colors.red),
                      const SizedBox(width: 12),
                      _buildMiniStat('📊', total, Colors.blue),
                    ],
                  ),
                ],
              ),
            ),
            
            // Прогресс-бар
            SizedBox(
              width: 60,
              child: Column(
                children: [
                  Text('$present/$total', style: TextStyle(color: Colors.grey[400], fontSize: 11)),
                  const SizedBox(height: 4),
                  LinearProgressIndicator(
                    value: total > 0 ? present / total : 0,
                    backgroundColor: Colors.grey[800],
                    valueColor: AlwaysStoppedAnimation(percentColor),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMiniStat(String emoji, int value, Color color) {
    return Row(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 12)),
        const SizedBox(width: 2),
        Text('$value', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 12)),
      ],
    );
  }

  Widget _buildYearDynamics() {
    if (_yearStats.isEmpty) {
      return const SizedBox.shrink();
    }
    
    // Подсчитываем общую статистику по месяцам
    final monthlyTotals = <int, Map<String, int>>{};
    
    for (var studentStats in _yearStats.values) {
      for (var stat in studentStats) {
        final month = stat['month'] as int;
        monthlyTotals[month] ??= {'present': 0, 'total': 0};
        monthlyTotals[month]!['present'] = (monthlyTotals[month]!['present'] ?? 0) + (stat['present'] as int);
        monthlyTotals[month]!['total'] = (monthlyTotals[month]!['total'] ?? 0) + (stat['total'] as int);
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
          Text(
            context.l10n.translate('year_dynamics'),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const SizedBox(height: 16),
          
          // Мини-график по месяцам
          SizedBox(
            height: 100,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: List.generate(12, (index) {
                final month = index + 1;
                final stats = monthlyTotals[month];
                final percentage = stats != null && stats['total']! > 0
                    ? (stats['present']! / stats['total']! * 100).round()
                    : 0;
                
                final isCurrentMonth = month == _selectedMonth;
                
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _selectedMonth = month);
                      _loadMonthlyReport();
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (percentage > 0)
                            Text(
                              '$percentage%',
                              style: TextStyle(
                                color: isCurrentMonth ? const Color(0xFFFFC107) : Colors.grey,
                                fontSize: 8,
                                fontWeight: isCurrentMonth ? FontWeight.bold : FontWeight.normal,
                              ),
                            ),
                          const SizedBox(height: 2),
                          Container(
                            height: percentage > 0 ? (percentage * 0.6).toDouble() : 4,
                            decoration: BoxDecoration(
                              color: isCurrentMonth
                                  ? const Color(0xFFFFC107)
                                  : percentage > 70
                                      ? Colors.green.withOpacity(0.6)
                                      : percentage > 50
                                          ? Colors.orange.withOpacity(0.6)
                                          : Colors.grey.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(4),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _getMonthName(month).substring(0, 3),
                            style: TextStyle(
                              color: isCurrentMonth ? const Color(0xFFFFC107) : Colors.grey[600],
                              fontSize: 9,
                              fontWeight: isCurrentMonth ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
