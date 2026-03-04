import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../models/group.dart';
import '../../models/student.dart';
import '../../models/event.dart';
import '../../providers/auth_provider.dart';
import '../../l10n/app_localizations.dart';
import 'group_students_screen.dart';
import 'attendance_marking_screen.dart'; // Import for navigation

class MyGroupsScreen extends StatefulWidget {
  const MyGroupsScreen({super.key});

  @override
  State<MyGroupsScreen> createState() => _MyGroupsScreenState();
}

class _MyGroupsScreenState extends State<MyGroupsScreen> {
  final ApiService _apiService = ApiService();
  
  List<Group> _groups = [];
  Map<int, List<Student>> _studentsByGroup = {};
  Event? _nextEvent;
  List<Event> _todayEvents = [];
  bool _isLoading = true;
  String? _errorMessage;
  
  int get _totalStudents => _studentsByGroup.values.fold(0, (sum, list) => sum + list.length);

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final user = context.read<AuthProvider>().user;
      
      // Load all groups
      final groupsData = await _apiService.getGroups();
      final allGroups = groupsData.map((g) => Group.fromJson(g)).toList();
      
      // Filter coach's groups
      final myGroups = allGroups.where((g) => g.coachId == user?.id).toList();
      final myGroupIds = myGroups.map((g) => g.id).toList();
      
      // Load all students
      final studentsData = await _apiService.getStudents();
      final allStudents = studentsData.map((s) => Student.fromJson(s)).toList();
      
      // Group students by group_id
      final studentsByGroup = <int, List<Student>>{};
      for (var group in myGroups) {
        studentsByGroup[group.id] = allStudents.where((s) => s.groupId == group.id).toList();
      }

      // Load events for dashboard functionality
      final eventsData = await _apiService.getEvents();
      final allEvents = eventsData.map((e) => Event.fromJson(e)).toList();
      
      // Filter events for my groups
      final myEvents = allEvents.where((e) => myGroupIds.contains(e.groupId)).toList();
      
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final tomorrow = today.add(const Duration(days: 1));
      
      // Find next event
      final upcoming = myEvents.where((e) {
        try {
          return DateTime.parse(e.startTime).isAfter(now);
        } catch (_) {
          return false;
        }
      }).toList();
      
      upcoming.sort((a, b) => DateTime.parse(a.startTime).compareTo(DateTime.parse(b.startTime)));
      
      // Find today's events
      final todayEvs = myEvents.where((e) {
        try {
          final start = DateTime.parse(e.startTime);
          return start.isAfter(today) && start.isBefore(tomorrow);
        } catch (_) {
          return false;
        }
      }).toList();
      
      todayEvs.sort((a, b) => DateTime.parse(a.startTime).compareTo(DateTime.parse(b.startTime)));

      setState(() {
        _groups = myGroups;
        _studentsByGroup = studentsByGroup;
        _nextEvent = upcoming.isNotEmpty ? upcoming.first : null;
        _todayEvents = todayEvs;
        _isLoading = false;
        
        if (myGroups.isEmpty) {
          _errorMessage = context.l10n.translate('no_assigned_groups');
        }
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = '${context.l10n.translate('error')}: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)));
    }

    if (_errorMessage != null && _groups.isEmpty) {
      return _buildEmptyState();
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      color: const Color(0xFFFFC107),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Next Event Card (Dashboard feature)
            if (_nextEvent != null) _buildNextEventCard(_nextEvent!),
            if (_nextEvent != null) const SizedBox(height: 24),

            // Total stats card
            _buildTotalStatsCard(),
            const SizedBox(height: 24),
            
            // Groups list header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '📚 ${context.l10n.translate('my_groups')}',
                  style: TextStyle(
                    color: Colors.grey[300],
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${_groups.length} ${context.l10n.translate('groups').toLowerCase()}',
                  style: TextStyle(
                    color: Colors.grey[500],
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            
            // Groups list
            ..._groups.map((group) => _buildGroupCard(group)),
          ],
        ),
      ),
    );
  }

  Widget _buildNextEventCard(Event event) {
    final l10n = context.l10n;
    DateTime? startTime;
    try {
      startTime = DateTime.parse(event.startTime);
    } catch (_) {}

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF1565C0), Color(0xFF0D47A1)], // Blue gradient like web
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.blue.withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
             Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => AttendanceMarkingScreen(
                  event: event,
                  groupName: event.groupName ?? 'Group',
                ),
              ),
            );
          },
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        l10n.translate('next_training'),
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (startTime != null)
                      Text(
                        '${startTime.hour.toString().padLeft(2, '0')}:${startTime.minute.toString().padLeft(2, '0')}',
                        style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: 'monospace'),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  event.groupName ?? l10n.translate('group'),
                  style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.location_on, color: Colors.blueAccent, size: 16),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        event.location ?? l10n.translate('cd_field_placeholder'),
                        style: TextStyle(color: Colors.blue[100], fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.checklist, color: Color(0xFF1565C0)),
                      const SizedBox(width: 8),
                      Text(
                        l10n.translate('start_attendance'),
                        style: const TextStyle(
                          color: Color(0xFF1565C0),
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTotalStatsCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2D323B), Color(0xFF23272E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildStatItem('👥', '$_totalStudents', context.l10n.translate('students_count')),
              _buildStatItem('📚', '${_groups.length}', context.l10n.translate('groups')),
              _buildStatItem('⚽', '${_getActiveStudents()}', context.l10n.translate('active')),
            ],
          ),
        ],
      ),
    );
  }

  int _getActiveStudents() {
    int count = 0;
    for (var students in _studentsByGroup.values) {
      count += students.where((s) => s.status == 'active').length;
    }
    return count;
  }

  Widget _buildStatItem(String emoji, String value, String label) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 28)),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            color: Color(0xFFFFC107),
            fontSize: 28,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: Colors.grey[400],
            fontSize: 12,
          ),
        ),
      ],
    );
  }

  Widget _buildGroupCard(Group group) {
    final students = _studentsByGroup[group.id] ?? [];
    final activeCount = students.where((s) => s.status == 'active').length;
    
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => GroupStudentsScreen(
              group: group,
              students: students,
            ),
          ),
        ).then((_) => _loadData()); // Refresh on return
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF2D323B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.grey[700]!),
        ),
        child: Row(
          children: [
            // Group icon
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: const Color(0xFFFFC107).withOpacity(0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Center(
                child: Text('⚽', style: TextStyle(fontSize: 28)),
              ),
            ),
            const SizedBox(width: 16),
            
            // Group info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    group.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.people, size: 16, color: Colors.grey[400]),
                      const SizedBox(width: 4),
                      Text(
                        '${students.length} ${context.l10n.translate('students_count').toLowerCase()}',
                        style: TextStyle(
                          color: Colors.grey[400],
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.green.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '$activeCount ${context.l10n.translate('active').toLowerCase()}',
                          style: const TextStyle(
                            color: Colors.green,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  // Financial info hidden for coaches - managed by backend
                ],
              ),
            ),
            
            // Arrow
            Icon(
              Icons.chevron_right,
              color: Colors.grey[500],
              size: 28,
            ),
          ],
        ),
      ),
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
              context.l10n.translate('no_assigned_groups'),
              style: TextStyle(
                color: Colors.grey[300],
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              context.l10n.translate('no_groups_subtitle'),
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey[500]),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadData,
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
    );
  }
}
