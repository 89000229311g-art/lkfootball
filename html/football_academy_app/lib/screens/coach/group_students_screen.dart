import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/group.dart';
import '../../models/student.dart';
import '../../config/api_config.dart';
import '../../l10n/app_localizations.dart';
import 'player_card_screen.dart';

class GroupStudentsScreen extends StatefulWidget {
  final Group group;
  final List<Student> students;

  const GroupStudentsScreen({
    super.key,
    required this.group,
    required this.students,
  });

  @override
  State<GroupStudentsScreen> createState() => _GroupStudentsScreenState();
}

class _GroupStudentsScreenState extends State<GroupStudentsScreen> {
  final ApiService _apiService = ApiService();
  late List<Student> _students;
  String _searchQuery = '';
  String _sortBy = 'name'; // name, rating, age

  @override
  void initState() {
    super.initState();
    _students = List.from(widget.students);
  }

  List<Student> get _filteredStudents {
    var filtered = _students.where((s) {
      final fullName = '${s.firstName} ${s.lastName}'.toLowerCase();
      return fullName.contains(_searchQuery.toLowerCase());
    }).toList();

    // Sort
    switch (_sortBy) {
      case 'name':
        filtered.sort((a, b) => '${a.firstName} ${a.lastName}'.compareTo('${b.firstName} ${b.lastName}'));
        break;
      case 'age':
        filtered.sort((a, b) {
          final ageA = _calculateAge(a.dob);
          final ageB = _calculateAge(b.dob);
          return (ageA ?? 0).compareTo(ageB ?? 0);
        });
        break;
    }

    return filtered;
  }

  int? _calculateAge(String? dob) {
    if (dob == null || dob.isEmpty) return null;
    try {
      final birthDate = DateTime.parse(dob);
      final today = DateTime.now();
      int age = today.year - birthDate.year;
      if (today.month < birthDate.month || 
          (today.month == birthDate.month && today.day < birthDate.day)) {
        age--;
      }
      return age;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeCount = _students.where((s) => s.status == 'active').length;

    return Scaffold(
      backgroundColor: const Color(0xFF14181F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.group.name,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            Text(
              '${_students.length} ${context.l10n.translate('students_lower')} • $activeCount ${context.l10n.translate('active_lower')}',
              style: TextStyle(fontSize: 12, color: Colors.grey[400]),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.sort),
            onSelected: (value) => setState(() => _sortBy = value),
            itemBuilder: (context) => [
              PopupMenuItem(value: 'name', child: Text(context.l10n.translate('sort_by_name'))),
              PopupMenuItem(value: 'age', child: Text(context.l10n.translate('sort_by_age'))),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              onChanged: (value) => setState(() => _searchQuery = value),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: context.l10n.translate('search_student_hint'),
                hintStyle: TextStyle(color: Colors.grey[500]),
                filled: true,
                fillColor: const Color(0xFF2D323B),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                prefixIcon: Icon(Icons.search, color: Colors.grey[500]),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),

          // Stats bar
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF2D323B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildMiniStat('👥', '${_students.length}', context.l10n.translate('total_label')),
                _buildMiniStat('✅', '$activeCount', context.l10n.translate('active_short')),
                // Financial info hidden for coaches
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Students list
          Expanded(
            child: _filteredStudents.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _filteredStudents.length,
                    itemBuilder: (context, index) {
                      return _buildStudentCard(_filteredStudents[index]);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String emoji, String value, String label) {
    return Column(
      children: [
        Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 16)),
            const SizedBox(width: 4),
            Text(
              value,
              style: const TextStyle(
                color: Color(0xFFFFC107),
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        Text(
          label,
          style: TextStyle(color: Colors.grey[500], fontSize: 11),
        ),
      ],
    );
  }

  Widget _buildStudentCard(Student student) {
    final age = _calculateAge(student.dob);
    final isActive = student.status == 'active';
    final avatarUrl = student.avatarUrl != null 
        ? '${ApiConfig.baseUrl.replaceAll('/api/v1', '')}${student.avatarUrl}'
        : null;

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => PlayerCardScreen(student: student),
          ),
        );
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF2D323B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isActive ? Colors.green.withOpacity(0.3) : Colors.grey[700]!,
          ),
        ),
        child: Row(
          children: [
            // Avatar
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: isActive 
                    ? const Color(0xFFFFC107).withOpacity(0.2)
                    : Colors.grey[700],
                borderRadius: BorderRadius.circular(28),
                image: avatarUrl != null
                    ? DecorationImage(
                        image: NetworkImage(avatarUrl),
                        fit: BoxFit.cover,
                      )
                    : null,
              ),
              child: avatarUrl == null
                  ? Center(
                      child: Text(
                        student.firstName.isNotEmpty 
                            ? student.firstName[0].toUpperCase()
                            : '?',
                        style: TextStyle(
                          color: isActive ? const Color(0xFFFFC107) : Colors.grey[400],
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),

            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${student.firstName} ${student.lastName}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      if (!isActive)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            student.status ?? 'inactive',
                            style: const TextStyle(color: Colors.red, fontSize: 10),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (age != null) ...[
                        Icon(Icons.cake, size: 14, color: Colors.grey[500]),
                        const SizedBox(width: 4),
                        Text(
                          '$age ${context.l10n.translate('years_old')}',
                          style: TextStyle(color: Colors.grey[400], fontSize: 12),
                        ),
                        const SizedBox(width: 12),
                      ],
                      if (student.dob != null) ...[
                        Icon(Icons.calendar_today, size: 14, color: Colors.grey[500]),
                        const SizedBox(width: 4),
                        Text(
                          _formatDate(student.dob!),
                          style: TextStyle(color: Colors.grey[500], fontSize: 12),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),

            // Arrow
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFFFC107).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(
                Icons.analytics,
                color: Color(0xFFFFC107),
                size: 20,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';
    } catch (_) {
      return dateStr;
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.search_off, size: 64, color: Colors.grey[600]),
          const SizedBox(height: 16),
          Text(
            _searchQuery.isNotEmpty 
                ? context.l10n.translate('student_not_found')
                : context.l10n.translate('no_students_in_group_label'),
            style: TextStyle(color: Colors.grey[400], fontSize: 16),
          ),
        ],
      ),
    );
  }
}
