import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/student.dart';
import '../../models/event.dart';
import '../../l10n/app_localizations.dart';

/// ✅ Экран отметки посещений для конкретного события
/// Открывается из расписания
class AttendanceMarkingScreen extends StatefulWidget {
  final Event event;
  final String groupName;

  const AttendanceMarkingScreen({
    super.key,
    required this.event,
    required this.groupName,
  });

  @override
  State<AttendanceMarkingScreen> createState() => _AttendanceMarkingScreenState();
}

class _AttendanceMarkingScreenState extends State<AttendanceMarkingScreen> {
  final ApiService _apiService = ApiService();
  
  List<Student> _students = [];
  Map<int, String> _attendanceStatus = {}; // studentId -> status
  Map<int, int> _attendanceIds = {}; // studentId -> recordId
  
  bool _isLoading = true;
  bool _isSaving = false;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    try {
      // 1. Загрузить учеников группы
      final studentsData = await _apiService.getStudents();
      final allStudents = studentsData.map((s) => Student.fromJson(s)).toList();
      final groupStudents = allStudents.where((s) => s.groupId == widget.event.groupId).toList();
      
      // 2. Загрузить существующие отметки для этого события
      final attendanceData = await _apiService.getAttendance(eventId: widget.event.id);
      
      final statusMap = <int, String>{};
      final idMap = <int, int>{};
      
      for (var record in attendanceData) {
        statusMap[record['student_id']] = record['status'];
        idMap[record['student_id']] = record['id'];
      }
      
      // Установить дефолтный статус для тех, у кого нет отметки
      for (var student in groupStudents) {
        if (!statusMap.containsKey(student.id)) {
          statusMap[student.id] = 'present'; // По умолчанию - присутствовал
        }
      }
      
      setState(() {
        _students = groupStudents;
        _attendanceStatus = statusMap;
        _attendanceIds = idMap;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _setStatus(int studentId, String status) {
    setState(() {
      _attendanceStatus[studentId] = status;
      _hasChanges = true;
    });
  }

  Future<void> _saveAttendance() async {
    setState(() => _isSaving = true);
    
    try {
      for (var student in _students) {
        final status = _attendanceStatus[student.id];
        final existingId = _attendanceIds[student.id];
        
        if (existingId != null) {
          // Обновить существующую запись
          await _apiService.updateAttendance(existingId, {'status': status});
        } else {
          // Создать новую запись
          final result = await _apiService.createAttendance({
            'event_id': widget.event.id,
            'student_id': student.id,
            'status': status,
          });
          if (result['id'] != null) {
            _attendanceIds[student.id] = result['id'];
          }
        }
      }
      
      setState(() {
        _isSaving = false;
        _hasChanges = false;
      });
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.l10n.translate('attendance_saved')),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context, true); // Вернуться с результатом
      }
    } catch (e) {
      setState(() => _isSaving = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  // Быстрая отметка всех как присутствующих
  void _markAllPresent() {
    setState(() {
      for (var student in _students) {
        _attendanceStatus[student.id] = 'present';
      }
      _hasChanges = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.groupName, style: const TextStyle(fontSize: 16)),
            Text(
              widget.event.formattedTimeRange,
              style: TextStyle(fontSize: 12, color: Colors.grey[400]),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF23272E),
        actions: [
          // Быстрая кнопка "Все присутствовали"
          IconButton(
            onPressed: _markAllPresent,
            icon: const Icon(Icons.check_circle_outline),
            tooltip: context.l10n.translate('mark_all_present'),
          ),
        ],
      ),
      floatingActionButton: _hasChanges
          ? FloatingActionButton.extended(
              onPressed: _isSaving ? null : _saveAttendance,
              backgroundColor: const Color(0xFFFFC107),
              label: Text(
                _isSaving ? context.l10n.translate('saving') : '💾 ${context.l10n.translate('save')}',
                style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
              ),
            )
          : null,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : _students.isEmpty
              ? Center(
                  child: Text(context.l10n.translate('no_students_in_group'), style: const TextStyle(color: Colors.grey)),
                )
              : Column(
                  children: [
                    // Сводка
                    _buildSummary(),
                    
                    // Список учеников
                    Expanded(
                      child: ListView.builder(
                        itemCount: _students.length,
                        padding: const EdgeInsets.only(bottom: 80),
                        itemBuilder: (context, index) {
                          final student = _students[index];
                          return _buildStudentTile(student);
                        },
                      ),
                    ),
                  ],
                ),
    );
  }

  Widget _buildSummary() {
    final presentCount = _attendanceStatus.values.where((s) => s == 'present').length;
    final absentCount = _attendanceStatus.values.where((s) => s == 'absent').length;
    final lateCount = _attendanceStatus.values.where((s) => s == 'late').length;
    final sickCount = _attendanceStatus.values.where((s) => s == 'sick').length;
    
    return Container(
      padding: const EdgeInsets.all(16),
      color: const Color(0xFF23272E),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _buildSummaryItem('✅', context.l10n.translate('were_present'), presentCount, Colors.green),
          _buildSummaryItem('❌', context.l10n.translate('were_absent'), absentCount, Colors.red),
          _buildSummaryItem('⏰', context.l10n.translate('were_late'), lateCount, Colors.orange),
          _buildSummaryItem('🤒', context.l10n.translate('were_sick'), sickCount, Colors.blue),
        ],
      ),
    );
  }

  Widget _buildSummaryItem(String emoji, String label, int count, Color color) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(height: 2),
        Text('$count', style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 18)),
        Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 10)),
      ],
    );
  }

  Widget _buildStudentTile(Student student) {
    final status = _attendanceStatus[student.id] ?? 'present';
    
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      color: const Color(0xFF1E2228),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            // Имя ученика
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: _getStatusColor(status),
                  child: Text(
                    student.firstName.isNotEmpty ? student.firstName[0] : '?',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    student.fullName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
                ),
                // Текущий статус
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor(status).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _getStatusColor(status)),
                  ),
                  child: Text(
                    _getStatusEmoji(status),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 10),
            
            // Кнопки выбора статуса
            Row(
              children: [
                _buildStatusButton(student.id, 'present', '✅', context.l10n.translate('was_present'), status),
                const SizedBox(width: 8),
                _buildStatusButton(student.id, 'absent', '❌', context.l10n.translate('was_absent'), status),
                const SizedBox(width: 8),
                _buildStatusButton(student.id, 'late', '⏰', context.l10n.translate('was_late'), status),
                const SizedBox(width: 8),
                _buildStatusButton(student.id, 'sick', '🤒', context.l10n.translate('was_sick'), status),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusButton(int studentId, String value, String emoji, String label, String currentStatus) {
    final isSelected = value == currentStatus;
    
    return Expanded(
      child: GestureDetector(
        onTap: () => _setStatus(studentId, value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFFFFC107) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? const Color(0xFFFFC107) : Colors.grey[700]!,
              width: isSelected ? 2 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(height: 2),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    color: isSelected ? Colors.black : Colors.grey,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'present': return Colors.green;
      case 'absent': return Colors.red;
      case 'late': return Colors.orange;
      case 'sick': return Colors.blue;
      default: return Colors.grey;
    }
  }

  String _getStatusEmoji(String status) {
    switch (status) {
      case 'present': return '✅';
      case 'absent': return '❌';
      case 'late': return '⏰';
      case 'sick': return '🤒';
      default: return '❓';
    }
  }
}
