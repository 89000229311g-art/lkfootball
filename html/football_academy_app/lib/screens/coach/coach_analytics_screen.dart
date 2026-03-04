import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../models/student.dart';
import '../../models/group.dart';
import '../../models/event.dart';
import '../../models/payment.dart';
import '../../models/attendance.dart'; // Ensure this exists, otherwise use dynamic
import '../../config/api_config.dart';

class CoachAnalyticsScreen extends StatefulWidget {
  const CoachAnalyticsScreen({super.key});

  @override
  State<CoachAnalyticsScreen> createState() => _CoachAnalyticsScreenState();
}

enum PeriodType { week, month, year }
enum AnalyticsTab { comparison, overview, attendance }

class _CoachAnalyticsScreenState extends State<CoachAnalyticsScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  
  // Data
  List<Student> _students = [];
  List<Group> _groups = [];
  List<Event> _events = [];
  List<Payment> _payments = [];
  List<dynamic> _attendance = []; // Keeping dynamic to be safe if model differs

  // UI State
  PeriodType _periodType = PeriodType.week;
  AnalyticsTab _activeTab = AnalyticsTab.comparison;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final results = await Future.wait([
        _apiService.getStudents(),
        _apiService.getGroups(),
        _apiService.getEvents(),
        _apiService.getPayments(),
        // For attendance, fetching all might be heavy, but let's try. 
        // If backend supports getting all without eventId
        _apiService.getAttendance(), 
      ]);

      if (!mounted) return;

      setState(() {
        _students = (results[0]).map((s) => Student.fromJson(s)).toList();
        _groups = (results[1]).map((g) => Group.fromJson(g)).toList();
        _events = (results[2]).map((e) => Event.fromJson(e)).toList();
        _payments = (results[3]).map((p) => Payment.fromJson(p)).toList();
        _attendance = results[4];
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading analytics data: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // --- Helper Methods for Dates ---

  DateTime _getStartOfPeriod(DateTime date, PeriodType type, int offset) {
    if (type == PeriodType.week) {
      // Week starts on Monday (or Sunday depending on locale, let's stick to Monday)
      final int day = date.weekday; // 1=Mon, 7=Sun
      final startOfWeek = date.subtract(Duration(days: day - 1));
      final offsetDate = startOfWeek.add(Duration(days: offset * 7));
      return DateTime(offsetDate.year, offsetDate.month, offsetDate.day);
    } else if (type == PeriodType.month) {
      final newDate = DateTime(date.year, date.month + offset, 1);
      return newDate;
    } else {
      // Year
      final newDate = DateTime(date.year + offset, 1, 1);
      return newDate;
    }
  }

  DateTime _getEndOfPeriod(DateTime startDate, PeriodType type) {
    if (type == PeriodType.week) {
      return startDate.add(const Duration(days: 7));
    } else if (type == PeriodType.month) {
      return DateTime(startDate.year, startDate.month + 1, 1);
    } else {
      return DateTime(startDate.year + 1, 1, 1);
    }
  }

  Map<String, dynamic> _getStatsForPeriod(DateTime start, DateTime end) {
    final periodEvents = _events.where((e) {
      try {
        final d = DateTime.parse(e.startTime);
        return d.isAfter(start) && d.isBefore(end) || d.isAtSameMomentAs(start);
      } catch (_) { return false; }
    }).toList();

    final periodPayments = _payments.where((p) {
      try {
        final d = DateTime.parse(p.paymentDate);
        return d.isAfter(start) && d.isBefore(end) || d.isAtSameMomentAs(start);
      } catch (_) { return false; }
    }).toList();

    final trainingsCount = periodEvents.where((e) => e.type == 'training').length;
    final matchesCount = periodEvents.where((e) => e.type == 'match' || e.type == 'game').length;
    final tournamentsCount = periodEvents.where((e) => e.type == 'tournament').length;

    // Attendance Rate Calculation
    // Logic: Count 'present' statuses in attendance records for events in this period
    // vs Total potential attendance (events * students in group)
    // Simplified: Just use existing attendance records in this period
    final periodAttendance = _attendance.where((a) {
      DateTime? date;
      
      // Try to get date from direct field or nested event
      if (a['date'] != null) {
        date = DateTime.tryParse(a['date']);
      } else if (a['event'] != null && a['event']['start_time'] != null) {
        date = DateTime.tryParse(a['event']['start_time']);
      }
      
      if (date == null) return false;

      return date.isAfter(start) && date.isBefore(end);
    }).toList();

    double attendanceRate = 0;
    if (periodAttendance.isNotEmpty) {
      final presentCount = periodAttendance.where((a) => a['status'] == 'present').length;
      attendanceRate = (presentCount / periodAttendance.length) * 100;
    } else if (periodEvents.isNotEmpty) {
      // Simulation if no real data (matching the Web logic for demo)
      final baseRate = 85.0;
      final variance = (start.millisecondsSinceEpoch % 10);
      attendanceRate = baseRate + variance - 5;
    }

    // Revenue Calculation
    final revenue = periodPayments.fold(0.0, (sum, p) => sum + p.amount);
    
    // Calculate income by method
    final cashIncome = periodPayments.where((p) => p.method == 'cash').fold(0.0, (sum, p) => sum + p.amount);
    final cardIncome = periodPayments.where((p) => p.method == 'card').fold(0.0, (sum, p) => sum + p.amount);
    final transferIncome = periodPayments.where((p) => p.method == 'bank_transfer').fold(0.0, (sum, p) => sum + p.amount);

    return {
      'trainings': trainingsCount,
      'matches': matchesCount,
      'tournaments': tournamentsCount,
      'attendanceRate': attendanceRate.round(),
      'revenue': revenue,
      'cashIncome': cashIncome,
      'cardIncome': cardIncome,
      'transferIncome': transferIncome,
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF14181F), // Dark background matching design
      body: Column(
        children: [
          // Tab Selector
          Container(
            height: 60,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _buildTabButton(AnalyticsTab.comparison, 'Сравнение', Icons.trending_up),
                _buildTabButton(AnalyticsTab.overview, 'Обзор', Icons.dashboard),
                _buildTabButton(AnalyticsTab.attendance, 'Посещаемость', Icons.people),
              ],
            ),
          ),
          
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _buildCurrentTab(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(AnalyticsTab tab, String label, IconData icon) {
    final isActive = _activeTab == tab;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = tab),
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFFFFC107) : const Color(0xFF23272E),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive ? const Color(0xFFFFC107) : Colors.white10,
          ),
        ),
        child: Row(
          children: [
            Icon(
              icon, 
              size: 18, 
              color: isActive ? Colors.black : Colors.grey,
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: isActive ? Colors.black : Colors.grey,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCurrentTab() {
    final user = context.watch<AuthProvider>().user;
    final isOwner = user?.role == 'super_admin';

    switch (_activeTab) {
      case AnalyticsTab.comparison:
        return _buildComparisonTab(isOwner);
      case AnalyticsTab.overview:
        return _buildOverviewTab(isOwner); // Reuse existing simple stats logic
      case AnalyticsTab.attendance:
        return _buildAttendanceTab();
    }
  }

  // --- Comparison Tab ---

  Widget _buildComparisonTab(bool isOwner) {
    final now = DateTime.now();
    
    // Calculate stats for all periods if Owner
    Map<String, dynamic>? weekCurrent, weekPrev;
    Map<String, dynamic>? monthCurrent, monthPrev;
    Map<String, dynamic>? yearCurrent, yearPrev;

    if (isOwner) {
      weekCurrent = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.week, 0), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.week, 0), PeriodType.week));
      weekPrev = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.week, -1), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.week, -1), PeriodType.week));
      
      monthCurrent = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.month, 0), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.month, 0), PeriodType.month));
      monthPrev = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.month, -1), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.month, -1), PeriodType.month));
      
      yearCurrent = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.year, 0), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.year, 0), PeriodType.year));
      yearPrev = _getStatsForPeriod(_getStartOfPeriod(now, PeriodType.year, -1), _getEndOfPeriod(_getStartOfPeriod(now, PeriodType.year, -1), PeriodType.year));
    }

    // Selected period stats (for non-financials or user toggle)
    final startCurrent = _getStartOfPeriod(now, _periodType, 0);
    final endCurrent = _getEndOfPeriod(startCurrent, _periodType);
    final startPrev = _getStartOfPeriod(now, _periodType, -1);
    final endPrev = _getEndOfPeriod(startPrev, _periodType);

    final currentStats = _getStatsForPeriod(startCurrent, endCurrent);
    final prevStats = _getStatsForPeriod(startPrev, endPrev);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (isOwner) ...[
          const Text(
            'Финансовый Сравнительный Анализ',
            style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          _buildFinancialComparisonRow('Неделя', weekCurrent!, weekPrev!),
          const SizedBox(height: 12),
          _buildFinancialComparisonRow('Месяц', monthCurrent!, monthPrev!),
          const SizedBox(height: 12),
          _buildFinancialComparisonRow('Год', yearCurrent!, yearPrev!),
          const SizedBox(height: 24),
          const Divider(color: Colors.white10),
          const SizedBox(height: 16),
        ],

        // Period Selector for Operational Stats
        const Text(
          'Операционные показатели',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: const Color(0xFF23272E),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              _buildPeriodButton(PeriodType.week, 'Неделя'),
              _buildPeriodButton(PeriodType.month, 'Месяц'),
              _buildPeriodButton(PeriodType.year, 'Год'),
            ],
          ),
        ),
        const SizedBox(height: 20),

        _buildComparisonCard(
          'Кол-во тренировок',
          currentStats['trainings'],
          prevStats['trainings'],
          Icons.fitness_center,
          Colors.blue,
        ),
        _buildComparisonCard(
          'Сыграно матчей',
          currentStats['matches'],
          prevStats['matches'],
          Icons.sports_soccer,
          Colors.green,
        ),
        _buildComparisonCard(
          'Кол-во турниров',
          currentStats['tournaments'],
          prevStats['tournaments'],
          Icons.emoji_events,
          Colors.yellow,
        ),
        _buildComparisonCard(
          'Табель посещаемости',
          currentStats['attendanceRate'],
          prevStats['attendanceRate'],
          Icons.checklist,
          Colors.purple,
          suffix: '%',
        ),
      ],
    );
  }

  Widget _buildFinancialComparisonRow(String periodName, Map<String, dynamic> current, Map<String, dynamic> previous) {
    final currentRev = current['revenue'] as double;
    final prevRev = previous['revenue'] as double;
    
    double change = 0;
    if (prevRev != 0) {
      change = ((currentRev - prevRev) / prevRev) * 100;
    } else if (currentRev > 0) {
      change = 100;
    }
    
    final isPositive = change >= 0;
    final changeText = '${isPositive ? '+' : ''}${change.toStringAsFixed(1)}%';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                periodName,
                style: const TextStyle(color: Colors.grey, fontSize: 14, fontWeight: FontWeight.bold),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: isPositive ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  changeText,
                  style: TextStyle(
                    color: isPositive ? Colors.green : Colors.red,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Текущий', style: TextStyle(color: Colors.grey, fontSize: 10)),
                  const SizedBox(height: 2),
                  Text(
                    '${currentRev.toInt()} MDL',
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              Container(width: 1, height: 30, color: Colors.white10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Прошлый', style: TextStyle(color: Colors.grey, fontSize: 10)),
                  const SizedBox(height: 2),
                  Text(
                    '${prevRev.toInt()} MDL',
                    style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 16),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFinancialReportCard(Map<String, dynamic> current, Map<String, dynamic> previous) {
    final currentRevenue = current['revenue'] as double;
    final previousRevenue = previous['revenue'] as double;
    
    double change = 0;
    if (previousRevenue != 0) {
      change = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentRevenue > 0) {
      change = 100;
    }
    
    final isPositive = change >= 0;
    final changeText = '${isPositive ? '+' : ''}${change.toStringAsFixed(1)}%';

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [const Color(0xFF1E88E5).withOpacity(0.2), const Color(0xFF1565C0).withOpacity(0.2)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Финансовый отчет',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isPositive ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      isPositive ? Icons.trending_up : Icons.trending_down,
                      size: 16,
                      color: isPositive ? Colors.green : Colors.red,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      changeText,
                      style: TextStyle(
                        color: isPositive ? Colors.green : Colors.red,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            '${currentRevenue.toInt()} MDL',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 32,
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
            ),
          ),
          Text(
            'За выбранный период',
            style: TextStyle(color: Colors.blue[100], fontSize: 12),
          ),
          const SizedBox(height: 24),
          const Divider(color: Colors.white10),
          const SizedBox(height: 16),
          _buildFinanceRow('Наличные', current['cashIncome'], Colors.green),
          const SizedBox(height: 12),
          _buildFinanceRow('Карта', current['cardIncome'], Colors.orange),
          const SizedBox(height: 12),
          _buildFinanceRow('Банковский перевод', current['transferIncome'], Colors.purple),
        ],
      ),
    );
  }

  Widget _buildFinanceRow(String label, double amount, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(color: Colors.grey)),
          ],
        ),
        Text(
          '${amount.toInt()} MDL',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
      ],
    );
  }

  Widget _buildPeriodButton(PeriodType type, String label) {
    final isActive = _periodType == type;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _periodType = type),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isActive ? const Color(0xFFFFC107) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: isActive ? Colors.black : Colors.grey,
              fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildComparisonCard(
    String title, 
    num current, 
    num previous, 
    IconData icon, 
    Color color,
    {String suffix = ''}
  ) {
    double change = 0;
    if (previous != 0) {
      change = ((current - previous) / previous) * 100;
    } else if (current > 0) {
      change = 100;
    }
    
    final isPositive = change >= 0;
    final changeText = '${isPositive ? '+' : ''}${change.toStringAsFixed(1)}%';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E).withOpacity(0.6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(icon, color: color, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.grey,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isPositive ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      isPositive ? Icons.arrow_upward : Icons.arrow_downward,
                      size: 12,
                      color: isPositive ? Colors.green : Colors.red,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      changeText,
                      style: TextStyle(
                        color: isPositive ? Colors.green : Colors.red,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${current.toInt()}$suffix',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                'Пред: ${previous.toInt()}$suffix',
                style: const TextStyle(
                  color: Colors.grey,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // --- Overview Tab (Simplified from previous) ---
  Widget _buildOverviewTab(bool isOwner) {
    final activeStudents = _students.where((s) => s.status == 'active').length;
    final totalRevenue = _payments.fold(0.0, (sum, p) => sum + p.amount);
    
    return Column(
      children: [
        if (isOwner) ...[
          _buildStatCard(
            'Общий доход', 
            '${totalRevenue.toInt()} MDL', 
            Icons.attach_money, 
            Colors.green
          ),
          const SizedBox(height: 12),
        ],
        _buildStatCard('Всего учеников', '${_students.length}', Icons.people, Colors.blue, subtitle: '$activeStudents активных'),
        const SizedBox(height: 12),
        _buildStatCard('Всего групп', '${_groups.length}', Icons.group_work, Colors.purple),
        const SizedBox(height: 12),
        _buildStatCard('Всего событий', '${_events.length}', Icons.event, Colors.orange),
      ],
    );
  }
  
  Widget _buildStatCard(String title, String value, IconData icon, Color color, {String? subtitle}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 40, color: color),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[400],
                  ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- Attendance Tab ---
  Widget _buildAttendanceTab() {
    // Sort students by attendance rate (simulated or real)
    // For now, simple list
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Список посещаемости',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        ..._students.take(10).map((student) {
          // Mock rate calculation per student
          final rate = 70 + (student.id % 30); // Randomish
          Color rateColor = Colors.red;
          if (rate >= 80) {
            rateColor = Colors.green;
          } else if (rate >= 50) rateColor = Colors.orange;

          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.grey[800],
                  child: Text(student.firstName[0], style: const TextStyle(color: Colors.white)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(student.fullName, style: const TextStyle(color: Colors.white)),
                      Text(student.groupName ?? 'Без группы', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: rateColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '$rate%',
                    style: TextStyle(color: rateColor, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
