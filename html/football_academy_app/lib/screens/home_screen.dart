import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart'; // For payment reminders
import '../models/student.dart';
import '../models/event.dart';
import '../models/payment.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import 'calendar_screen.dart'; // Import CalendarScreen
import 'profile_screen.dart'; // Import ProfileScreen
import 'groups_screen.dart'; // Import GroupsScreen
import 'users_screen.dart'; // Import UsersScreen
import 'payments_screen.dart'; // Import PaymentsScreen
import 'settings_screen.dart'; // Import SettingsScreen
import 'students_screen.dart'; // Import StudentsScreen
import 'attendance_screen.dart'; // Import AttendanceScreen

// Import new Coach screens
import 'coach/schedule_screen.dart';
import 'coach/attendance_journal_screen.dart';
import 'coach/coach_analytics_screen.dart';
import 'coach/my_groups_screen.dart';

// Import new feature-parity screens (sync with web)
import 'schedule_templates_screen.dart';
import 'salary/my_salary_screen.dart';
import 'coach/coach_communications_screen.dart';
import 'crm_screen.dart';
import 'marketing_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final role = user?.role.toLowerCase();
    
    if (role == 'parent') {
      return const ParentDashboard();
    } else if (role == 'coach') {
      return const CoachDashboard();
    } else {
      return const AdminDashboard();
    }
  }
}

// ==================== COACH DASHBOARD ====================
class CoachDashboard extends StatefulWidget {
  const CoachDashboard({super.key});

  @override
  State<CoachDashboard> createState() => _CoachDashboardState();
}

class _CoachDashboardState extends State<CoachDashboard> {
  int _selectedIndex = 0;
  
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    
    Widget currentView;
    String appBarTitle;

    switch (_selectedIndex) {
      case 0:
        appBarTitle = l10n.translate('my_groups');
        currentView = const MyGroupsScreen();
        break;
      case 1:
        appBarTitle = l10n.translate('schedule');
        currentView = const ScheduleScreen();
        break;
      case 2:
        appBarTitle = l10n.translate('attendance_journal');
        currentView = const AttendanceJournalScreen();
        break;
      case 3:
        appBarTitle = l10n.translate('communications');
        currentView = const CoachCommunicationsScreen();
        break;
      case 4:
        appBarTitle = l10n.translate('profile');
        currentView = const ProfileScreen();
        break;
      default:
        appBarTitle = l10n.translate('my_groups');
        currentView = const MyGroupsScreen();
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(appBarTitle),
        actions: [
          // Кнопка зарплаты
          IconButton(
            icon: const Icon(Icons.account_balance_wallet, color: Color(0xFFFFC107)),
            tooltip: l10n.translate('my_salary'),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => Scaffold(
                    appBar: AppBar(
                      title: Text(l10n.translate('my_salary')),
                      leading: IconButton(
                        icon: const Icon(Icons.arrow_back),
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                    body: const MySalaryScreen(),
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () {
              context.read<AuthProvider>().logout();
              Navigator.pushReplacementNamed(context, '/login');
            },
          ),
        ],
      ),
      body: currentView,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
        selectedItemColor: const Color(0xFFFFC107),
        unselectedItemColor: Colors.grey,
        backgroundColor: const Color(0xFF23272E),
        type: BottomNavigationBarType.fixed,
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.groups),
            label: l10n.translate('groups'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.calendar_today),
            label: l10n.translate('schedule'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.checklist),
            label: l10n.translate('attendance_journal'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.chat),
            label: l10n.translate('chats'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.person),
            label: l10n.translate('profile'),
          ),
        ],
      ),
    );
  }
}

// ==================== ADMIN DASHBOARD ====================
class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  int _selectedIndex = 0;
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  
  int _studentsCount = 0;
  int _activeStudents = 0;
  int _groupsCount = 0;
  int _eventsCount = 0;
  double _revenueThisMonth = 0;
  
  // Financial Comparison Stats
  Map<String, double> _weekStats = {'current': 0, 'prev': 0};
  Map<String, double> _monthStats = {'current': 0, 'prev': 0};
  Map<String, double> _yearStats = {'current': 0, 'prev': 0};
  
  List<Payment> _recentPayments = [];

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  double _calculateRevenue(List<Payment> payments, DateTime start, DateTime end) {
    return payments
        .where((p) {
          try {
            final d = DateTime.parse(p.paymentDate);
            return d.isAfter(start.subtract(const Duration(seconds: 1))) && 
                   d.isBefore(end.add(const Duration(days: 1))); // Inclusive
          } catch (e) {
            return false;
          }
        })
        .fold(0.0, (sum, p) => sum + p.amount);
  }

  Future<void> _loadStats() async {
    try {
      // Use unified analytics API for accurate counts
      final summaryFuture = _apiService.getAnalyticsSummary();
      final paymentsData = await _apiService.getPayments();
      final eventsData = await _apiService.getEvents();
      
      final summary = await summaryFuture;
      final payments = paymentsData.map((p) => Payment.fromJson(p)).toList();
      final events = eventsData.map((e) => Event.fromJson(e)).toList();
      
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      
      // Week Calculations (Mon-Sun)
      final currentWeekStart = today.subtract(Duration(days: today.weekday - 1));
      final currentWeekEnd = currentWeekStart.add(const Duration(days: 6));
      final prevWeekStart = currentWeekStart.subtract(const Duration(days: 7));
      final prevWeekEnd = prevWeekStart.add(const Duration(days: 6));
      
      // Month Calculations
      final currentMonthStart = DateTime(today.year, today.month, 1);
      final currentMonthEnd = DateTime(today.year, today.month + 1, 0);
      final prevMonthStart = DateTime(today.year, today.month - 1, 1);
      final prevMonthEnd = DateTime(today.year, today.month, 0);
      
      // Year Calculations
      final currentYearStart = DateTime(today.year, 1, 1);
      final currentYearEnd = DateTime(today.year, 12, 31);
      final prevYearStart = DateTime(today.year - 1, 1, 1);
      final prevYearEnd = DateTime(today.year - 1, 12, 31);

      // Use API values for month/year revenue if available
      final monthRevenueFromAPI = (summary['month_revenue'] ?? 0).toDouble();
      final yearRevenueFromAPI = (summary['year_revenue'] ?? 0).toDouble();
      
      setState(() {
        // Use total from analytics API (accurate count)
        _studentsCount = summary['total_students'] ?? 0;
        _activeStudents = summary['active_students'] ?? 0;
        _groupsCount = summary['total_groups'] ?? 0;
        _eventsCount = events.length;
        _revenueThisMonth = monthRevenueFromAPI;
        
        _weekStats = {
          'current': _calculateRevenue(payments, currentWeekStart, currentWeekEnd),
          'prev': _calculateRevenue(payments, prevWeekStart, prevWeekEnd),
        };
        _monthStats = {
          'current': monthRevenueFromAPI,
          'prev': _calculateRevenue(payments, prevMonthStart, prevMonthEnd),
        };
        _yearStats = {
          'current': yearRevenueFromAPI,
          'prev': _calculateRevenue(payments, prevYearStart, prevYearEnd),
        };

        _recentPayments = payments
          ..sort((a, b) {
            try {
              return DateTime.parse(b.paymentDate).compareTo(DateTime.parse(a.paymentDate));
            } catch (e) {
              return 0;
            }
          });
        _recentPayments = _recentPayments.take(5).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Widget _buildFinancialOverview(bool isOwner, AppLocalizations l10n) {
    if (!isOwner) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.translate('financial_analysis'),
          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFF23272E),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white10),
          ),
          child: Column(
            children: [
              _buildComparisonRow(l10n.translate('week'), _weekStats['current']!, _weekStats['prev']!, l10n),
              const Divider(color: Colors.white10),
              _buildComparisonRow(l10n.translate('month'), _monthStats['current']!, _monthStats['prev']!, l10n),
              const Divider(color: Colors.white10),
              _buildComparisonRow(l10n.translate('year'), _yearStats['current']!, _yearStats['prev']!, l10n),
            ],
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildComparisonRow(String label, double current, double prev, AppLocalizations l10n) {
    double change = 0;
    if (prev != 0) {
      change = ((current - prev) / prev) * 100;
    } else if (current > 0) {
      change = 100;
    }
    
    final isPositive = change >= 0;
    final changeText = '${isPositive ? '+' : ''}${change.toStringAsFixed(1)}%';
    
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 14)),
          ),
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${current.toInt()} MDL', 
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                Text(
                  '${l10n.translate('previous')}: ${prev.toInt()}', 
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
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
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final l10n = context.l10n;
    
    Widget currentView;
    String appBarTitle;

    switch (_selectedIndex) {
      case 0:
        appBarTitle = '📊 ${l10n.translate('dashboard_title')}';
        currentView = _buildDashboardView(user, l10n);
        break;
      case 1:
        appBarTitle = '⚽ ${l10n.translate('students')}';
        currentView = const StudentsScreen();
        break;
      case 2:
        appBarTitle = '💰 ${l10n.translate('payments')}';
        currentView = const PaymentsScreen();
        break;
      case 3:
        appBarTitle = '✅ ${l10n.translate('attendance')}';
        currentView = const AttendanceScreen();
        break;
      case 4:
        appBarTitle = '⚙️ ${l10n.translate('settings')}';
        currentView = const SettingsScreen();
        break;
      default:
        appBarTitle = '📊 ${l10n.translate('dashboard_short')}';
        currentView = _buildDashboardView(user, l10n);
    }
    
    return Scaffold(
      appBar: AppBar(
        title: Text(appBarTitle),
        actions: [
          if (_selectedIndex == 0)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadStats,
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadStats,
        child: _isLoading && _selectedIndex == 0
            ? const Center(child: CircularProgressIndicator())
            : currentView,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
        selectedItemColor: const Color(0xFFFFC107),
        unselectedItemColor: Colors.grey,
        backgroundColor: const Color(0xFF23272E),
        type: BottomNavigationBarType.fixed,
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.dashboard),
            label: l10n.translate('dashboard_short'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.people),
            label: l10n.translate('students'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.payment),
            label: l10n.translate('payments'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.checklist),
            label: l10n.translate('attendance'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.settings),
            label: l10n.translate('settings'),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardView(user, l10n) {
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Welcome card
          Card(
            elevation: 4,
            child: Container(
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF23272E), Color(0xFF1C2127)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.5)),
              ),
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 30,
                    backgroundColor: Color(0xFFFFC107),
                    child: Icon(
                      Icons.person,
                      size: 35,
                      color: Colors.black,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${l10n.translate('welcome')} ${user?.fullName ?? "Администратор"}!',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          user?.role == 'super_admin' ? '👑 ${l10n.translate('super_admin_role')}' : '🔧 ${l10n.translate('admin_role')}',
                          style: const TextStyle(
                            fontSize: 14,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          
          // Financial Overview (Owner Only)
          _buildFinancialOverview(user?.role == 'super_admin', l10n),

          // Key Metrics
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  icon: Icons.people,
                  title: l10n.translate('students'),
                  value: _studentsCount.toString(),
                  subtitle: '$_activeStudents ${l10n.translate('active').toLowerCase()}',
                  color: Colors.blue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  icon: Icons.group_work,
                  title: l10n.translate('groups'),
                  value: _groupsCount.toString(),
                  subtitle: l10n.translate('groups').toLowerCase(),
                  color: const Color(0xFFFFC107),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  icon: Icons.attach_money,
                  title: l10n.translate('monthly_income'),
                  value: '${_revenueThisMonth.toInt()}',
                  subtitle: 'MDL',
                  color: Colors.green,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  icon: Icons.event,
                  title: l10n.translate('events'),
                  value: _eventsCount.toString(),
                  subtitle: l10n.translate('total'),
                  color: Colors.orange,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Quick Actions
          Text(
            l10n.translate('quick_actions'),
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.3,
            children: [
              _ActionCard(
                icon: Icons.person_add,
                title: l10n.translate('users'),
                subtitle: l10n.translate('parents_coaches'),
                color: Colors.indigo,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const UsersScreen()),
                ),
              ),
              _ActionCard(
                icon: Icons.analytics,
                title: l10n.translate('analytics'),
                subtitle: l10n.translate('statistics'),
                color: Colors.purple,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => Scaffold(
                      appBar: AppBar(
                        title: Text(l10n.translate('analytics')),
                        leading: IconButton(
                          icon: const Icon(Icons.arrow_back),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                      body: const CoachAnalyticsScreen(),
                    ),
                  ),
                ),
              ),
              _ActionCard(
                icon: Icons.settings,
                title: l10n.translate('settings'),
                subtitle: l10n.translate('configuration'),
                color: Colors.grey,
                onTap: () => Navigator.pushNamed(context, '/settings'),
              ),
              _ActionCard(
                icon: Icons.calendar_month,
                title: l10n.translate('schedule'),
                subtitle: l10n.translate('events_calendar'),
                color: Colors.orange,
                onTap: () => Navigator.pushNamed(context, '/calendar'),
              ),
              _ActionCard(
                icon: Icons.checklist,
                title: l10n.translate('attendance'),
                subtitle: l10n.translate('mark_attendance_subtitle'),
                color: Colors.cyan,
                onTap: () => Navigator.pushNamed(context, '/attendance'),
              ),
              _ActionCard(
                icon: Icons.people,
                title: l10n.translate('students'),
                subtitle: l10n.translate('management'),
                color: Colors.blue,
                onTap: () => Navigator.pushNamed(context, '/students'),
              ),
              _ActionCard(
                icon: Icons.group_add,
                title: l10n.translate('groups'),
                subtitle: l10n.translate('create_edit'),
                color: Colors.teal,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const GroupsScreen()),
                ),
              ),
              _ActionCard(
                icon: Icons.chat,
                title: l10n.translate('chat'),
                subtitle: l10n.translate('messages'),
                color: Colors.pink,
                onTap: () => Navigator.pushNamed(context, '/chat'),
              ),
              _ActionCard(
                icon: Icons.payments,
                title: l10n.translate('payments'),
                subtitle: l10n.translate('income_expenses'),
                color: Colors.green,
                onTap: () => Navigator.pushNamed(context, '/payments'),
              ),
              // CRM & Marketing (New)
              _ActionCard(
                icon: Icons.filter_alt, // Funnel icon for CRM
                title: 'CRM',
                subtitle: 'Воронка продаж',
                color: Colors.blueAccent,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CrmScreen()),
                ),
              ),
              _ActionCard(
                icon: Icons.ads_click, // Ads/Campaigns icon
                title: 'Маркетинг',
                subtitle: 'Рекламные кампании',
                color: Colors.deepOrange,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const MarketingScreen()),
                ),
              ),
              // Feature parity screens
              _ActionCard(
                icon: Icons.bar_chart,
                title: l10n.translate('analytics'),
                subtitle: l10n.translate('academy_stats'),
                color: Colors.deepPurple,
                onTap: () => Navigator.pushNamed(context, '/analytics'),
              ),
              _ActionCard(
                icon: Icons.campaign,
                title: 'Рассылки',
                subtitle: 'SMS уведомления',
                color: Colors.amber,
                onTap: () => Navigator.pushNamed(context, '/communications'),
              ),
              _ActionCard(
                icon: Icons.newspaper,
                title: 'Новости',
                subtitle: 'Лента объявлений',
                color: Colors.indigo,
                onTap: () => Navigator.pushNamed(context, '/news'),
              ),
              _ActionCard(
                icon: Icons.event_available,
                title: 'Бронь',
                subtitle: 'Индивид. тренировки',
                color: Colors.lime,
                onTap: () => Navigator.pushNamed(context, '/booking'),
              ),
              _ActionCard(
                icon: Icons.calendar_view_week,
                title: 'Расписание',
                subtitle: 'Недельный вид',
                color: Colors.tealAccent,
                onTap: () => Navigator.pushNamed(context, '/schedule'),
              ),
              _ActionCard(
                icon: Icons.edit_calendar,
                title: 'Шаблоны',
                subtitle: 'Управление расписанием',
                color: Colors.deepOrange,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ScheduleTemplatesScreen()),
                ),
              ),
              // Salary Management - only for super_admin
              if (user?.role?.toLowerCase() == 'super_admin') ...
                [
                  _ActionCard(
                    icon: Icons.account_balance_wallet,
                    title: 'Зарплаты',
                    subtitle: 'Управление ЗП',
                    color: Colors.amber,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => Scaffold(
                          appBar: AppBar(
                            title: const Text('Управление зарплатами'),
                            leading: IconButton(
                              icon: const Icon(Icons.arrow_back),
                              onPressed: () => Navigator.of(context).pop(),
                            ),
                          ),
                          body: const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.account_balance_wallet, size: 64, color: Color(0xFFFFC107)),
                                SizedBox(height: 16),
                                Text('Управление зарплатами', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                                SizedBox(height: 8),
                                Text('Доступно в веб-версии', style: TextStyle(color: Colors.grey)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              // My Salary - for all staff (admin, super_admin)
              _ActionCard(
                icon: Icons.monetization_on,
                title: 'Моя зарплата',
                subtitle: 'Выплаты и авансы',
                color: Colors.green,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => Scaffold(
                      appBar: AppBar(
                        title: const Text('Моя зарплата'),
                        leading: IconButton(
                          icon: const Icon(Icons.arrow_back),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                      body: const MySalaryScreen(),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ==================== PARENT DASHBOARD (UNIFIED) ====================
class ParentDashboard extends StatefulWidget {
  const ParentDashboard({super.key});

  @override
  State<ParentDashboard> createState() => _ParentDashboardState();
}

class _ParentDashboardState extends State<ParentDashboard> {
  int _selectedIndex = 0;
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  List<Student> _children = [];
  List<Payment> _recentPayments = [];
  List<dynamic> _announcements = [];
  Map<int, int> _attendanceCounts = {};
  Map<int, Map<String, dynamic>> _subscriptionStatus = {};  // NEW: subscription status per child

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final user = context.read<AuthProvider>().user;
      print('DEBUG ParentDashboard: Loading data for user ID: ${user?.id}, phone: ${user?.phone}');
      
      final studentsData = await _apiService.getStudents();
      print('DEBUG ParentDashboard: Got ${studentsData.length} students from API');
      
      final paymentsData = await _apiService.getPayments();
      final announcementsData = await _apiService.getAnnouncements();
      
      final students = studentsData.map((s) => Student.fromJson(s)).toList();
      
      // Debug: print all students and their guardian_ids
      for (var s in students) {
        print('DEBUG ParentDashboard: Student ${s.id} (${s.fullName}) guardianIds: ${s.guardianIds}');
      }
      
      final filteredStudents = students
          .where((s) => s.guardianIds.contains(user?.id))
          .toList();
      
      print('DEBUG ParentDashboard: Filtered to ${filteredStudents.length} children for parent ID ${user?.id}');
      
      final childIds = filteredStudents.map((s) => s.id).toList();
      
      final payments = paymentsData
          .map((p) => Payment.fromJson(p))
          .where((p) => childIds.contains(p.studentId))
          .toList()
        ..sort((a, b) {
          try {
            return DateTime.parse(b.paymentDate).compareTo(DateTime.parse(a.paymentDate));
          } catch (e) {
            return 0;
          }
        });
      
      final attendanceCounts = <int, int>{};
      final subscriptionStatus = <int, Map<String, dynamic>>{};
      
      for (var student in filteredStudents) {
        // Load attendance count
        try {
          final studentAttendance = await _apiService.getStudentAttendance(student.id);
          final presentCount = studentAttendance
              .where((a) => a['status'] == 'present')
              .length;
          attendanceCounts[student.id] = presentCount;
        } catch (e) {
          attendanceCounts[student.id] = 0;
        }
        
        // Load subscription status
        try {
          final status = await _apiService.getSubscriptionStatus(student.id);
          subscriptionStatus[student.id] = status;
          print('DEBUG: Subscription status for ${student.fullName}: $status');
        } catch (e) {
          print('DEBUG: Error loading subscription status: $e');
          subscriptionStatus[student.id] = {
            'is_paid': false,
            'status_text': 'Не удалось загрузить',
            'status_color': 'grey',
            'show_reminder': false,
          };
        }
      }
      
      setState(() {
        _children = filteredStudents;
        _recentPayments = payments.take(5).toList();
        _announcements = announcementsData;
        _attendanceCounts = attendanceCounts;
        _subscriptionStatus = subscriptionStatus;
        _isLoading = false;
      });
      
      // Check for payment reminders (25th-31st of month)
      _checkPaymentReminders(filteredStudents, subscriptionStatus);
      
    } catch (e) {
      print('DEBUG ParentDashboard: Error loading data: $e');
      setState(() => _isLoading = false);
    }
  }
  
  /// Check and show payment reminder if needed
  Future<void> _checkPaymentReminders(
    List<Student> children,
    Map<int, Map<String, dynamic>> subscriptionStatus,
  ) async {
    // Collect unpaid children
    final unpaidChildren = <Map<String, dynamic>>[];
    
    for (var child in children) {
      final status = subscriptionStatus[child.id];
      if (status != null && status['is_paid'] != true && status['show_reminder'] == true) {
        unpaidChildren.add({
          'name': child.fullName,
          'target_month': status['target_month'] ?? '',
        });
      }
    }
    
    // Show reminder dialog if there are unpaid children and it's 25th+
    if (unpaidChildren.isNotEmpty && mounted) {
      await PaymentReminderService.showPaymentReminderIfNeeded(
        context,
        unpaidChildren,
      );
    }
  }

  /// Show group students list dialog
  Future<void> _showGroupStudentsDialog(int groupId) async {
    try {
      final l10n = context.l10n;
      
      // Load all students in the group
      final studentsData = await _apiService.getStudents();
      final allStudents = studentsData.map((s) => Student.fromJson(s)).toList();
      final groupStudents = allStudents.where((s) => s.groupId == groupId).toList();
      
      if (!mounted) return;
      
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Row(
            children: [
              const Icon(Icons.people, color: Color(0xFFFFC107)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.translate('group_students'),
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
          content: SizedBox(
            width: double.maxFinite,
            child: groupStudents.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        l10n.translate('no_students_in_group'),
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: groupStudents.length,
                    itemBuilder: (context, index) {
                      final student = groupStudents[index];
                      final isMyChild = _children.any((c) => c.id == student.id);
                      
                      return Card(
                        color: const Color(0xFF2D323B),
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: isMyChild 
                                ? const Color(0xFFFFC107) 
                                : Colors.grey,
                            child: Text(
                              student.firstName[0],
                              style: const TextStyle(
                                color: Colors.black,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                          title: Text(
                            student.fullName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          subtitle: Text(
                            '${student.dob ?? "N/A"} • ${student.status}',
                            style: TextStyle(color: Colors.grey[400], fontSize: 12),
                          ),
                          trailing: isMyChild
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFC107).withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(
                                      color: const Color(0xFFFFC107),
                                    ),
                                  ),
                                  child: Text(
                                    l10n.translate('my_child'),
                                    style: const TextStyle(
                                      color: Color(0xFFFFC107),
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                )
                              : null,
                        ),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                l10n.translate('close'),
                style: const TextStyle(color: Color(0xFFFFC107)),
              ),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading students: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final l10n = context.l10n;

    Widget currentView;
    String appBarTitle;

    switch (_selectedIndex) {
      case 0:
        appBarTitle = '👦 ${l10n.translate('my_children')}';
        currentView = _buildChildrenView(user);
        break;
      case 1:
        appBarTitle = '💰 ${l10n.translate('payments')}';
        currentView = const PaymentsScreen();
        break;
      case 2:
        appBarTitle = '📢 ${l10n.translate('announcements')}';
        currentView = _buildAnnouncementsView();
        break;
      case 3:
        appBarTitle = l10n.translate('schedule');
        currentView = _buildCalendarView();
        break;
      case 4:
        appBarTitle = '⚙️ ${l10n.translate('settings')}';
        currentView = const SettingsScreen();
        break;
      default:
        appBarTitle = l10n.translate('home');
        currentView = _buildChildrenView(user);
    }
    
    return Scaffold(
      appBar: AppBar(
        title: Text(appBarTitle),
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : currentView,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
        selectedItemColor: const Color(0xFFFFC107),
        unselectedItemColor: Colors.grey,
        backgroundColor: const Color(0xFF23272E),
        type: BottomNavigationBarType.fixed,
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.home),
            label: l10n.translate('home'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.payment),
            label: l10n.translate('payments'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.campaign),
            label: l10n.translate('announcements'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.calendar_today),
            label: l10n.translate('schedule'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.settings),
            label: l10n.translate('settings'),
          ),
        ],
      ),
    );
  }

  Widget _buildChildrenView(user) {
    final l10n = context.l10n;
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          if (_children.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Center(
                  child: Text(
                    l10n.translate('no_linked_children'),
                    style: const TextStyle(fontSize: 16, color: Colors.grey),
                  ),
                ),
              ),
            )
          else
            ..._children.map((child) {
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 35,
                            backgroundColor: child.status == 'active' 
                                ? const Color(0xFFFFC107) 
                                : Colors.grey,
                            backgroundImage: child.avatarUrl != null
                                ? NetworkImage('${ApiConfig.baseUrl}${child.avatarUrl}')
                                : null,
                            child: child.avatarUrl == null
                                ? Text(
                                    child.firstName[0] + child.lastName[0],
                                    style: TextStyle(
                                      color: child.status == 'active' ? Colors.black : Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 22,
                                    ),
                                  )
                                : null,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  child.fullName,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Icon(Icons.groups, size: 14, color: Colors.grey[400]),
                                    const SizedBox(width: 4),
                                    Text(
                                      child.groupName ?? l10n.translate('no_group'),
                                      style: TextStyle(
                                        color: Colors.grey[400],
                                        fontSize: 14,
                                      ),
                                    ),
                                  ],
                                ),
                                if (child.coachName != null) ...[
                                  const SizedBox(height: 2),
                                  Row(
                                    children: [
                                      Icon(Icons.person, size: 14, color: Colors.grey[400]),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${l10n.translate('coach_label')}: ${child.coachName}',
                                        style: TextStyle(
                                          color: Colors.grey[400],
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: child.status == 'active'
                                  ? Colors.green.withOpacity(0.2)
                                  : Colors.grey.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: child.status == 'active' ? Colors.green : Colors.grey
                              ),
                            ),
                            child: Text(
                              child.status == 'active' ? '✅' : '❌',
                              style: const TextStyle(fontSize: 18),
                            ),
                          ),
                        ],
                      ),
                      const Divider(height: 24, color: Colors.grey),
                      // Only show attendance count (hide payment amount from parents)
                      Center(
                        child: _buildInfoChip(
                          Icons.check_circle,
                          l10n.translate('attended'),
                          '${_attendanceCounts[child.id] ?? 0}',
                          Colors.blue,
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      // Schedule Button
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => CalendarScreen(groupId: child.groupId),
                              ),
                            );
                          },
                          icon: const Icon(Icons.calendar_month, color: Color(0xFFFFC107)),
                          label: Text(l10n.translate('training_schedule')),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Color(0xFFFFC107)),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                      
                      const SizedBox(height: 8),
                      // View Group Students Button
                      if (child.groupId != null)
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () => _showGroupStudentsDialog(child.groupId!),
                            icon: const Icon(Icons.people, color: Colors.blue),
                            label: Text(l10n.translate('view_group_students')),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.blue),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      
                      // SUBSCRIPTION STATUS BLOCK
                      Builder(
                        builder: (context) {
                          final status = _subscriptionStatus[child.id];
                          if (status == null) return const SizedBox.shrink();
                          
                          final isPaid = status['is_paid'] == true;
                          final statusColor = status['status_color'] ?? 'grey';
                          final showReminder = status['show_reminder'] == true;
                          final targetMonthNum = status['target_month_number'] ?? 1;
                          final targetYear = status['target_year'] ?? 2026;
                          final paymentPeriod = status['payment_period'] ?? '';
                          
                          // Localized month names
                          final monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                          final localizedMonth = l10n.translate(monthKeys[targetMonthNum - 1]);
                          final targetMonthLocalized = '$localizedMonth $targetYear';
                          
                          // Build localized status text
                          String localizedStatusText;
                          if (isPaid) {
                            localizedStatusText = '✅ ${l10n.translate('subscription_paid')} $targetMonthLocalized';
                          } else if (statusColor == 'yellow') {
                            localizedStatusText = '⏰ ${l10n.translate('pay_subscription')} $targetMonthLocalized';
                          } else {
                            localizedStatusText = '❌ ${l10n.translate('debt_for')} $targetMonthLocalized';
                          }
                          
                          Color bgColor;
                          Color borderColor;
                          Color textColor;
                          IconData icon;
                          
                          switch (statusColor) {
                            case 'green':
                              bgColor = Colors.green.withOpacity(0.15);
                              borderColor = Colors.green;
                              textColor = Colors.green;
                              icon = Icons.check_circle;
                              break;
                            case 'yellow':
                              bgColor = Colors.orange.withOpacity(0.15);
                              borderColor = Colors.orange;
                              textColor = Colors.orange;
                              icon = Icons.access_time;
                              break;
                            case 'red':
                              bgColor = Colors.red.withOpacity(0.15);
                              borderColor = Colors.red;
                              textColor = Colors.red;
                              icon = Icons.warning;
                              break;
                            default:
                              bgColor = Colors.grey.withOpacity(0.15);
                              borderColor = Colors.grey;
                              textColor = Colors.grey;
                              icon = Icons.help_outline;
                          }
                          
                          return Container(
                            margin: const EdgeInsets.only(top: 12),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: bgColor,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: borderColor.withOpacity(0.5), width: 1.5),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Icon(icon, color: textColor, size: 22),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        localizedStatusText,
                                        style: TextStyle(
                                          color: textColor,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 14,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (showReminder && !isPaid) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    '${l10n.translate('payment_period')}: $paymentPeriod',
                                    style: TextStyle(
                                      color: textColor.withOpacity(0.8),
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildAnnouncementsView() {
    final l10n = context.l10n;
    if (_announcements.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.campaign_outlined, size: 80, color: Colors.grey),
            const SizedBox(height: 20),
            Text(
              l10n.translate('no_announcements'),
              style: const TextStyle(fontSize: 18, color: Colors.grey),
            ),
            const SizedBox(height: 20),
             ElevatedButton.icon(
              onPressed: () => Navigator.pushNamed(context, '/chat'),
              icon: const Icon(Icons.message),
              label: Text(l10n.translate('open_chat')),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _announcements.length,
      itemBuilder: (context, index) {
        final announcement = _announcements[index];
        final isGeneral = announcement['is_general'] == true;
        final date = DateTime.tryParse(announcement['created_at'] ?? '') ?? DateTime.now();
        
        return Card(
          margin: const EdgeInsets.only(bottom: 16),
          elevation: 2,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: isGeneral ? Colors.orange.withOpacity(0.1) : Colors.blue.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        isGeneral ? Icons.campaign : Icons.info,
                        color: isGeneral ? Colors.orange : Colors.blue,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isGeneral ? 'Общее объявление' : 'Для группы',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: isGeneral ? Colors.orange[800] : Colors.blue[800],
                            ),
                          ),
                          Text(
                            '${date.day}.${date.month}.${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}',
                            style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const Divider(height: 24),
                ..._parseContent(announcement['content'] ?? ''),
              ],
            ),
          ),
        );
      },
    );
  }

  List<Widget> _parseContent(String content) {
    final List<Widget> widgets = [];
    // Regex for markdown images ![alt](url)
    final RegExp imageRegex = RegExp(r'!\[(.*?)\]\((.*?)\)');
    int lastIndex = 0;

    for (final match in imageRegex.allMatches(content)) {
      // Add text before image
      if (match.start > lastIndex) {
        final text = content.substring(lastIndex, match.start).trim();
        if (text.isNotEmpty) {
          widgets.add(Text(
            text,
            style: const TextStyle(fontSize: 16, height: 1.5),
          ));
        }
      }

      // Add image
      final imageUrl = match.group(2);
      if (imageUrl != null) {
        widgets.add(const SizedBox(height: 12));
        widgets.add(ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            imageUrl,
            fit: BoxFit.cover,
            loadingBuilder: (context, child, loadingProgress) {
              if (loadingProgress == null) return child;
              return Container(
                height: 200,
                color: Colors.grey[200],
                child: const Center(child: CircularProgressIndicator()),
              );
            },
            errorBuilder: (context, error, stackTrace) => Container(
              height: 200,
              color: Colors.grey[200],
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.broken_image, size: 50, color: Colors.grey),
                  SizedBox(height: 8),
                  Text('Ошибка загрузки изображения', style: TextStyle(color: Colors.grey)),
                ],
              ),
            ),
          ),
        ));
        widgets.add(const SizedBox(height: 12));
      }

      lastIndex = match.end;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      final text = content.substring(lastIndex).trim();
      if (text.isNotEmpty) {
        widgets.add(Text(
          text,
          style: const TextStyle(fontSize: 16, height: 1.5),
        ));
      }
    }
    
    return widgets;
  }

  Widget _buildCalendarView() {
    final l10n = context.l10n;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.calendar_today, size: 80, color: Color(0xFFFFC107)),
          const SizedBox(height: 20),
          Text(
            l10n.translate('training_schedule'),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 30),
          ElevatedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/calendar'),
            icon: const Icon(Icons.event),
            label: Text(l10n.translate('open_calendar')),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileView(user) {
    final l10n = context.l10n;
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: const Color(0xFFFFC107),
                    backgroundImage: user?.avatarUrl != null
                        ? NetworkImage('${ApiConfig.baseUrl}${user!.avatarUrl}')
                        : null,
                    child: user?.avatarUrl == null
                        ? Text(
                            user?.fullName.isNotEmpty == true
                                ? user!.fullName[0].toUpperCase()
                                : 'P',
                            style: const TextStyle(
                              fontSize: 40,
                              fontWeight: FontWeight.bold,
                              color: Colors.black,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    user?.fullName ?? l10n.translate('parent'),
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    user?.phone ?? '',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFC107).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFFFFC107)),
                    ),
                    child: Text(
                      '👨‍👩‍👧 ${l10n.translate('parent')}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFFFFC107),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          _buildActionButton(
            Icons.edit,
            l10n.translate('edit_profile'),
            Colors.blue,
            () => Navigator.pushNamed(context, '/profile'),
          ),
          const SizedBox(height: 12),
          _buildActionButton(
            Icons.payment,
            l10n.translate('payment_history'),
            Colors.green,
            () => Navigator.pushNamed(context, '/payments'),
          ),
          const SizedBox(height: 12),
          _buildActionButton(
            Icons.settings,
            l10n.translate('settings'),
            Colors.grey,
            () => Navigator.pushNamed(context, '/settings'),
          ),
          const SizedBox(height: 12),
          _buildActionButton(
            Icons.logout,
            l10n.translate('logout'),
            Colors.red,
            () {
              context.read<AuthProvider>().logout();
              Navigator.pushReplacementNamed(context, '/login');
            },
          ),
        ],
      ),
    );
  }

  Widget _buildInfoChip(IconData icon, String label, String value, Color color) {
    return Column(
      children: [
        Icon(icon, color: color, size: 28),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[400],
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(
    IconData icon,
    String label,
    Color color,
    VoidCallback onTap,
  ) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: color, size: 28),
        title: Text(
          label,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
        onTap: onTap,
      ),
    );
  }
}

// ==================== HELPER WIDGETS ====================
class _StatCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final String? subtitle;
  final Color color;

  const _StatCard({
    required this.icon,
    required this.title,
    required this.value,
    required this.color,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[400],
              ),
            ),
            if (subtitle != null)
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: 10,
                  color: Colors.grey[600],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 32, color: color),
              const SizedBox(height: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[400],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
