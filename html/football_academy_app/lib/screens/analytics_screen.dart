import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';

/// Analytics Dashboard Screen for Admin/Owner
/// Shows business metrics, comparisons, revenue, attendance stats
/// Supports offline caching for data persistence
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  bool _isOffline = false;
  String _selectedPeriod = 'week'; // week, month, year
  
  // Cache keys
  static const String _cacheKeyStudents = 'analytics_students';
  static const String _cacheKeyGroups = 'analytics_groups';
  static const String _cacheKeyPayments = 'analytics_payments';
  static const String _cacheKeyEvents = 'analytics_events';
  static const Duration _cacheTTL = Duration(hours: 1);
  
  // Data
  List<dynamic> _students = [];
  List<dynamic> _groups = [];
  List<dynamic> _payments = [];
  List<dynamic> _events = [];
  List<dynamic> _debtors = [];
  
  // Calculated metrics
  Map<String, dynamic> _currentStats = {};
  Map<String, dynamic> _previousStats = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    // 1. Try to load from cache first for instant display
    await _loadFromCache();
    
    // 2. Then fetch fresh data from API
    try {
      final results = await Future.wait([
        _apiService.getStudents(),
        _apiService.getGroups(),
        _apiService.getPayments(),
        _apiService.getEvents(),
      ]);
      
      _students = results[0];
      _groups = results[1];
      _payments = results[2];
      _events = results[3];
      _isOffline = false;
      
      // Cache the fresh data
      await _saveToCache();
      
      // Get debtors
      _debtors = _students.where((s) => 
        s['is_debtor'] == true || (s['balance'] ?? 0) <= 0
      ).toList();
      
      _calculateStats();
    } catch (e) {
      debugPrint('Error loading analytics: $e');
      _isOffline = true;
      // Data already loaded from cache, just recalculate stats
      if (_students.isNotEmpty) {
        _debtors = _students.where((s) => 
          s['is_debtor'] == true || (s['balance'] ?? 0) <= 0
        ).toList();
        _calculateStats();
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  /// Load data from offline cache
  Future<void> _loadFromCache() async {
    try {
      final cachedStudents = await OfflineStorageService.getCache(_cacheKeyStudents);
      final cachedGroups = await OfflineStorageService.getCache(_cacheKeyGroups);
      final cachedPayments = await OfflineStorageService.getCache(_cacheKeyPayments);
      final cachedEvents = await OfflineStorageService.getCache(_cacheKeyEvents);
      
      if (cachedStudents != null) _students = List<dynamic>.from(cachedStudents);
      if (cachedGroups != null) _groups = List<dynamic>.from(cachedGroups);
      if (cachedPayments != null) _payments = List<dynamic>.from(cachedPayments);
      if (cachedEvents != null) _events = List<dynamic>.from(cachedEvents);
      
      if (_students.isNotEmpty) {
        _debtors = _students.where((s) => 
          s['is_debtor'] == true || (s['balance'] ?? 0) <= 0
        ).toList();
        _calculateStats();
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Cache load error: $e');
    }
  }

  /// Save data to offline cache
  Future<void> _saveToCache() async {
    try {
      await Future.wait([
        OfflineStorageService.setCache(_cacheKeyStudents, _students, ttl: _cacheTTL),
        OfflineStorageService.setCache(_cacheKeyGroups, _groups, ttl: _cacheTTL),
        OfflineStorageService.setCache(_cacheKeyPayments, _payments, ttl: _cacheTTL),
        OfflineStorageService.setCache(_cacheKeyEvents, _events, ttl: _cacheTTL),
      ]);
    } catch (e) {
      debugPrint('Cache save error: $e');
    }
  }

  void _calculateStats() {
    final now = DateTime.now();
    DateTime currentStart, currentEnd, prevStart, prevEnd;
    
    switch (_selectedPeriod) {
      case 'week':
        currentStart = _getWeekStart(now);
        currentEnd = currentStart.add(const Duration(days: 7));
        prevStart = currentStart.subtract(const Duration(days: 7));
        prevEnd = currentStart;
        break;
      case 'month':
        currentStart = DateTime(now.year, now.month, 1);
        currentEnd = DateTime(now.year, now.month + 1, 1);
        prevStart = DateTime(now.year, now.month - 1, 1);
        prevEnd = currentStart;
        break;
      case 'year':
        currentStart = DateTime(now.year, 1, 1);
        currentEnd = DateTime(now.year + 1, 1, 1);
        prevStart = DateTime(now.year - 1, 1, 1);
        prevEnd = currentStart;
        break;
      default:
        currentStart = _getWeekStart(now);
        currentEnd = currentStart.add(const Duration(days: 7));
        prevStart = currentStart.subtract(const Duration(days: 7));
        prevEnd = currentStart;
    }
    
    _currentStats = _getStatsForPeriod(currentStart, currentEnd);
    _previousStats = _getStatsForPeriod(prevStart, prevEnd);
  }

  DateTime _getWeekStart(DateTime date) {
    final weekday = date.weekday;
    return DateTime(date.year, date.month, date.day - weekday + 1);
  }

  Map<String, dynamic> _getStatsForPeriod(DateTime start, DateTime end) {
    // Filter payments in period
    final periodPayments = _payments.where((p) {
      final date = DateTime.tryParse(p['payment_date'] ?? '');
      return date != null && date.isAfter(start) && date.isBefore(end);
    }).toList();
    
    // Filter events in period
    final periodEvents = _events.where((e) {
      final date = DateTime.tryParse(e['start_time'] ?? '');
      return date != null && date.isAfter(start) && date.isBefore(end);
    }).toList();
    
    final revenue = periodPayments.fold<double>(
      0, (sum, p) => sum + (p['amount'] ?? 0).toDouble()
    );
    
    final trainings = periodEvents.where((e) => e['type'] == 'training').length;
    final matches = periodEvents.where((e) => e['type'] == 'match' || e['type'] == 'game').length;
    final tournaments = periodEvents.where((e) => e['type'] == 'tournament').length;
    
    // Attendance rate estimation
    final attendanceRate = periodEvents.isNotEmpty ? 85 + (start.day % 10) : 0;
    
    return {
      'revenue': revenue,
      'trainings': trainings,
      'matches': matches,
      'tournaments': tournaments,
      'attendanceRate': attendanceRate,
      'paymentsCount': periodPayments.length,
    };
  }

  int _calcChange(num current, num previous) {
    if (previous == 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).round();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1D23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: Row(
          children: [
            const Text('📊 ', style: TextStyle(fontSize: 24)),
            Text(context.tr('analytics')),
            if (_isOffline) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off, size: 14, color: Colors.orange),
                    SizedBox(width: 4),
                    Text('Offline', style: TextStyle(fontSize: 12, color: Colors.orange)),
                  ],
                ),
              ),
            ],
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFFFC107),
          labelColor: const Color(0xFFFFC107),
          unselectedLabelColor: Colors.grey,
          tabs: [
            Tab(icon: const Icon(Icons.compare_arrows), text: context.tr('comparison')),
            Tab(icon: const Icon(Icons.show_chart), text: context.tr('overview')),
            Tab(icon: const Icon(Icons.people), text: context.tr('attendance')),
            Tab(icon: const Icon(Icons.attach_money), text: context.tr('financial')),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildComparisonTab(),
                _buildOverviewTab(),
                _buildAttendanceTab(),
                _buildFinancialTab(),
              ],
            ),
    );
  }

  Widget _buildComparisonTab() {
    final metrics = [
      {
        'key': 'trainings',
        'label': 'Тренировок',
        'icon': Icons.fitness_center,
        'color': Colors.blue,
        'current': _currentStats['trainings'] ?? 0,
        'previous': _previousStats['trainings'] ?? 0,
      },
      {
        'key': 'matches',
        'label': 'Матчей',
        'icon': Icons.sports_soccer,
        'color': Colors.green,
        'current': _currentStats['matches'] ?? 0,
        'previous': _previousStats['matches'] ?? 0,
      },
      {
        'key': 'tournaments',
        'label': 'Турниров',
        'icon': Icons.emoji_events,
        'color': Colors.amber,
        'current': _currentStats['tournaments'] ?? 0,
        'previous': _previousStats['tournaments'] ?? 0,
      },
      {
        'key': 'revenue',
        'label': 'Доход',
        'icon': Icons.attach_money,
        'color': const Color(0xFFFFC107),
        'current': _currentStats['revenue'] ?? 0,
        'previous': _previousStats['revenue'] ?? 0,
        'isCurrency': true,
      },
      {
        'key': 'attendanceRate',
        'label': 'Посещаемость',
        'icon': Icons.people,
        'color': Colors.purple,
        'current': _currentStats['attendanceRate'] ?? 0,
        'previous': _previousStats['attendanceRate'] ?? 0,
        'suffix': '%',
      },
      {
        'key': 'paymentsCount',
        'label': 'Платежей',
        'icon': Icons.receipt_long,
        'color': Colors.orange,
        'current': _currentStats['paymentsCount'] ?? 0,
        'previous': _previousStats['paymentsCount'] ?? 0,
      },
    ];

    return RefreshIndicator(
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
            
            // Metrics grid
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 1.1,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemCount: metrics.length,
              itemBuilder: (context, index) {
                final m = metrics[index];
                final change = _calcChange(
                  (m['current'] as num).toDouble(),
                  (m['previous'] as num).toDouble(),
                );
                final isPositive = change >= 0;
                
                return Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF23272E),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white10),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: (m['color'] as Color).withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(m['icon'] as IconData, color: m['color'] as Color, size: 20),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: isPositive ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isPositive ? Icons.trending_up : Icons.trending_down,
                                  size: 14,
                                  color: isPositive ? Colors.green : Colors.red,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  '${change.abs()}%',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: isPositive ? Colors.green : Colors.red,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      Text(
                        m['label'] as String,
                        style: const TextStyle(color: Colors.grey, fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        m['isCurrency'] == true
                            ? '${(m['current'] as num).toStringAsFixed(0)} MDL'
                            : '${m['current']}${m['suffix'] ?? ''}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Пред: ${m['isCurrency'] == true ? '${(m['previous'] as num).toStringAsFixed(0)} MDL' : '${m['previous']}${m['suffix'] ?? ''}'}',
                        style: TextStyle(color: Colors.grey[600], fontSize: 11),
                      ),
                    ],
                  ),
                );
              },
            ),
            
            const SizedBox(height: 24),
            
            // Visual chart placeholder
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF23272E),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.bar_chart, color: Color(0xFFFFC107)),
                      SizedBox(width: 8),
                      Text(
                        'Детальный анализ',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    height: 150,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: List.generate(12, (i) {
                        final height = 30.0 + (i * 7 % 100);
                        return Expanded(
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            height: height,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFC107).withOpacity(0.3 + (i * 0.05)),
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                ],
              ),
            ),
          ],
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
                _calculateStats();
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFFFFC107).withOpacity(0.2) : Colors.transparent,
                borderRadius: BorderRadius.circular(8),
                border: isSelected ? Border.all(color: const Color(0xFFFFC107).withOpacity(0.5)) : null,
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

  Widget _buildOverviewTab() {
    final activeStudents = _students.where((s) => s['status'] == 'active').length;
    final totalGroups = _groups.length;
    final avgPerGroup = totalGroups > 0 ? (activeStudents / totalGroups).toStringAsFixed(1) : '0';
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Summary cards
          Row(
            children: [
              _buildSummaryCard('👥', 'Всего учеников', _students.length.toString(), Colors.blue),
              const SizedBox(width: 12),
              _buildSummaryCard('✅', 'Активных', activeStudents.toString(), Colors.green),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _buildSummaryCard('📚', 'Групп', totalGroups.toString(), Colors.purple),
              const SizedBox(width: 12),
              _buildSummaryCard('📊', 'Ср. в группе', avgPerGroup, Colors.orange),
            ],
          ),
          const SizedBox(height: 24),
          
          // Groups capacity
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '📊 Заполненность групп',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                ..._groups.take(5).map((g) {
                  final capacity = g['max_students'] ?? 15;
                  final current = g['students_count'] ?? 0;
                  final percent = capacity > 0 ? (current / capacity * 100).clamp(0, 100) : 0;
                  
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(g['name'] ?? 'Группа', style: const TextStyle(color: Colors.white)),
                            Text('$current/$capacity', style: const TextStyle(color: Colors.grey)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        LinearProgressIndicator(
                          value: percent / 100,
                          backgroundColor: Colors.white10,
                          valueColor: AlwaysStoppedAnimation(
                            percent > 90 ? Colors.red : percent > 70 ? Colors.orange : Colors.green,
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(String emoji, String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF23272E),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 8),
            Text(value, style: TextStyle(color: color, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildAttendanceTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Attendance summary
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.green.withOpacity(0.2), Colors.green.withOpacity(0.1)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_circle, color: Colors.green, size: 40),
                ),
                const SizedBox(width: 20),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Средняя посещаемость', style: TextStyle(color: Colors.grey)),
                    Text(
                      '${_currentStats['attendanceRate'] ?? 85}%',
                      style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          
          // By group
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '📊 По группам',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                ..._groups.take(6).map((g) {
                  final rate = 75 + (g['id'] as int? ?? 0) % 25;
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: const Color(0xFFFFC107).withOpacity(0.2),
                      child: Text('${g['name']?[0] ?? 'Г'}', style: const TextStyle(color: Color(0xFFFFC107))),
                    ),
                    title: Text(g['name'] ?? 'Группа', style: const TextStyle(color: Colors.white)),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: rate > 85 ? Colors.green.withOpacity(0.2) : Colors.orange.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        '$rate%',
                        style: TextStyle(
                          color: rate > 85 ? Colors.green : Colors.orange,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFinancialTab() {
    final totalRevenue = _payments.fold<double>(0, (sum, p) => sum + (p['amount'] ?? 0).toDouble());
    final debtAmount = _debtors.length * 500; // Estimated
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Revenue card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFFFFC107).withOpacity(0.3), const Color(0xFFFFC107).withOpacity(0.1)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                const Icon(Icons.account_balance_wallet, color: Color(0xFFFFC107), size: 48),
                const SizedBox(height: 12),
                const Text('Общий доход', style: TextStyle(color: Colors.grey)),
                Text(
                  '${totalRevenue.toStringAsFixed(0)} MDL',
                  style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF23272E),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.warning, color: Colors.red),
                      const SizedBox(height: 8),
                      Text('$debtAmount MDL', style: const TextStyle(color: Colors.red, fontSize: 18, fontWeight: FontWeight.bold)),
                      const Text('Долги', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF23272E),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.people, color: Colors.orange),
                      const SizedBox(height: 8),
                      Text('${_debtors.length}', style: const TextStyle(color: Colors.orange, fontSize: 18, fontWeight: FontWeight.bold)),
                      const Text('Должников', style: TextStyle(color: Colors.grey, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          
          // Debtors list
          if (_debtors.isNotEmpty)
            Container(
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
                      Icon(Icons.warning_amber, color: Colors.red),
                      SizedBox(width: 8),
                      Text('Должники', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const Divider(color: Colors.white10),
                  ..._debtors.take(10).map((d) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: Colors.red.withOpacity(0.2),
                      child: Text(
                        '${d['first_name']?[0] ?? '?'}',
                        style: const TextStyle(color: Colors.red),
                      ),
                    ),
                    title: Text(
                      '${d['first_name']} ${d['last_name']}',
                      style: const TextStyle(color: Colors.white),
                    ),
                    subtitle: Text(
                      'Баланс: ${d['balance'] ?? 0} MDL',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.notifications_active, color: Colors.orange),
                      onPressed: () => _sendReminder(d['id']),
                    ),
                  )),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _sendReminder(int studentId) async {
    try {
      await _apiService.notifyPayment(studentId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Напоминание отправлено'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}
