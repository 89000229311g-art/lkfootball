import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/student.dart';
import '../models/group.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../widgets/student_card_dialog.dart';

class StudentsScreen extends StatefulWidget {
  const StudentsScreen({super.key});

  @override
  State<StudentsScreen> createState() => _StudentsScreenState();
}

class _StudentsScreenState extends State<StudentsScreen> {
  final ApiService _apiService = ApiService();
  List<Student> _students = [];
  List<Group> _groups = [];
  bool _isLoading = true;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  int _totalStudents = 0;  // Total from API
  
  // Attendance stats cache
  final Map<int, Map<String, dynamic>> _attendanceCache = {};

  // Filter students by search query
  List<Student> get _filteredStudents {
    if (_searchQuery.isEmpty) return _students;
    final query = _searchQuery.toLowerCase();
    return _students.where((s) {
      return s.fullName.toLowerCase().contains(query) ||
             (s.phone?.contains(query) ?? false) ||
             (s.parentPhone?.contains(query) ?? false) ||
             (s.groupName?.toLowerCase().contains(query) ?? false);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _loadData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      if (args != null && args.containsKey('parentPhone')) {
        final phone = args['parentPhone'] as String;
        // Wait a bit for data to load if needed, or just open dialog
        // Better to pass the phone to dialog
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) _showAddEditDialog(null, phone);
        });
      }
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      // Use getStudentsWithTotal to get accurate total count
      final studentsResult = await _apiService.getStudentsWithTotal();
      final groupsData = await _apiService.getGroups();
      final studentsData = studentsResult['data'] as List<dynamic>;
      final total = studentsResult['total'] as int;
      
      setState(() {
        _students = studentsData.map((e) => Student.fromJson(e)).toList();
        _groups = groupsData.map((e) => Group.fromJson(e)).toList();
        _totalStudents = total;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    }
  }

  void _showAddEditDialog([Student? student, String? prefillParentPhone]) {
    final isEditing = student != null;
    final firstNameController = TextEditingController(text: student?.firstName);
    final lastNameController = TextEditingController(text: student?.lastName);
    final phoneController = TextEditingController(text: student?.phone);
    final parentPhoneController = TextEditingController(text: student?.parentPhone ?? prefillParentPhone);
    final dobController = TextEditingController(text: student?.dob);
    int? selectedGroupId = student?.groupId;
    String status = student?.status ?? 'active';

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Text(
            isEditing ? 'Редактировать ученика' : 'Добавить ученика',
            style: const TextStyle(color: Colors.white),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: firstNameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Имя *',
                    labelStyle: TextStyle(color: Colors.grey),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: lastNameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Фамилия *',
                    labelStyle: TextStyle(color: Colors.grey),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneController,
                  style: const TextStyle(color: Colors.white),
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Телефон ребенка',
                    labelStyle: TextStyle(color: Colors.grey),
                    hintText: '+373...',
                    hintStyle: TextStyle(color: Colors.grey),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: parentPhoneController,
                        style: const TextStyle(color: Colors.white),
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Телефон родителя',
                          labelStyle: TextStyle(color: Colors.grey),
                          hintText: '+373...',
                          hintStyle: TextStyle(color: Colors.grey),
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.person_add, color: Color(0xFFFFC107)),
                      tooltip: 'Создать родителя',
                      onPressed: () {
                        // Quick create parent logic
                        _showQuickCreateParentDialog(parentPhoneController);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: dobController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Дата рождения',
                    labelStyle: TextStyle(color: Colors.grey),
                    hintText: 'YYYY-MM-DD',
                    hintStyle: TextStyle(color: Colors.grey),
                  ),
                  onTap: () async {
                    final date = await showDatePicker(
                      context: context,
                      initialDate: DateTime(2015),
                      firstDate: DateTime(2000),
                      lastDate: DateTime.now(),
                      builder: (context, child) {
                        return Theme(
                          data: Theme.of(context).copyWith(
                            colorScheme: const ColorScheme.dark(
                              primary: Color(0xFFFFC107),
                              onPrimary: Colors.black,
                              surface: Color(0xFF23272E),
                              onSurface: Colors.white,
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (date != null) {
                      dobController.text = date.toIso8601String().split('T')[0];
                    }
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: selectedGroupId,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Группа',
                    labelStyle: TextStyle(color: Colors.grey),
                  ),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('Без группы')),
                    ..._groups.map((g) => DropdownMenuItem(
                      value: g.id,
                      child: Text(g.name),
                    )),
                  ],
                  onChanged: (value) => setDialogState(() => selectedGroupId = value),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Статус',
                    labelStyle: TextStyle(color: Colors.grey),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'active', child: Text('Активный')),
                    DropdownMenuItem(value: 'inactive', child: Text('Неактивный')),
                  ],
                  onChanged: (value) => setDialogState(() => status = value!),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              onPressed: () async {
                if (firstNameController.text.isEmpty || lastNameController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Заполните обязательные поля')),
                  );
                  return;
                }

                final data = {
                  'first_name': firstNameController.text,
                  'last_name': lastNameController.text,
                  'phone': phoneController.text.isNotEmpty ? phoneController.text : null,
                  'parent_phone': parentPhoneController.text.isNotEmpty ? parentPhoneController.text : null,
                  'dob': dobController.text.isNotEmpty ? dobController.text : null,
                  'group_id': selectedGroupId,
                  'status': status,
                };

                try {
                  if (isEditing) {
                    await _apiService.updateStudent(student.id, data);
                  } else {
                    await _apiService.createStudent(data);
                  }
                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Ошибка: $e')),
                    );
                  }
                }
              },
              child: Text(isEditing ? 'Сохранить' : 'Добавить'),
            ),
          ],
        ),
      ),
    );
  }

  void _showQuickCreateParentDialog(TextEditingController parentPhoneController) {
    final phoneController = TextEditingController(text: parentPhoneController.text);
    final passwordController = TextEditingController();
    final fullNameController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Быстрое создание родителя', style: TextStyle(color: Colors.white)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: phoneController,
                style: const TextStyle(color: Colors.white),
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Телефон *',
                  labelStyle: TextStyle(color: Colors.grey),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passwordController,
                style: const TextStyle(color: Colors.white),
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Пароль *',
                  labelStyle: TextStyle(color: Colors.grey),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: fullNameController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'ФИО *',
                  labelStyle: TextStyle(color: Colors.grey),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFFC107), foregroundColor: Colors.black),
            onPressed: () async {
              if (phoneController.text.isEmpty || passwordController.text.isEmpty || fullNameController.text.isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Заполните все поля')));
                return;
              }

              try {
                await _apiService.createUser({
                  'phone': phoneController.text,
                  'password': passwordController.text,
                  'full_name': fullNameController.text,
                  'role': 'parent',
                });
                
                // Update parent phone in the main dialog
                parentPhoneController.text = phoneController.text;
                
                if (mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Родитель создан')));
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                }
              }
            },
            child: const Text('Создать'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteStudent(Student student) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Удалить ученика?', style: TextStyle(color: Colors.white)),
        content: Text('Вы уверены, что хотите удалить ${student.fullName}?', style: const TextStyle(color: Colors.grey)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Удалить', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteStudent(student.id);
        _loadData();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Ошибка удаления: $e')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredStudents = _filteredStudents;
    
    return Scaffold(
      appBar: AppBar(
        title: Text('Ученики ($_totalStudents)'),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFFC107),
        onPressed: () => _showAddEditDialog(),
        child: const Icon(Icons.add, color: Colors.black),
      ),
      body: Column(
        children: [
          // Search Bar
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: '🔍 Поиск по имени, телефону, группе...',
                hintStyle: const TextStyle(color: Colors.grey),
                filled: true,
                fillColor: const Color(0xFF2D323B),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, color: Colors.grey),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      )
                    : null,
              ),
              onChanged: (value) => setState(() => _searchQuery = value),
            ),
          ),
          // Result count
          if (_searchQuery.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Text(
                    'Найдено: ${filteredStudents.length}',
                    style: const TextStyle(color: Colors.grey, fontSize: 14),
                  ),
                ],
              ),
            ),
          // Student List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredStudents.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.search_off, size: 64, color: Colors.grey),
                            const SizedBox(height: 16),
                            Text(
                              _searchQuery.isNotEmpty ? 'Ничего не найдено' : 'Нет учеников',
                              style: const TextStyle(fontSize: 18, color: Colors.grey),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(8),
                          itemCount: filteredStudents.length,
                          itemBuilder: (context, index) {
                            final student = filteredStudents[index];
                      return GestureDetector(
                        onTap: () {
                          showDialog(
                            context: context,
                            builder: (context) => StudentCardDialog(studentId: student.id),
                          ).then((changed) {
                            if (changed == true) {
                              _loadData();
                            }
                          });
                        },
                        child: Card(
                          margin: const EdgeInsets.only(bottom: 12),
                        child: ExpansionTile(
                          collapsedIconColor: const Color(0xFFFFC107),
                          iconColor: const Color(0xFFFFC107),
                          leading: CircleAvatar(
                            backgroundColor: student.status == 'active'
                                ? const Color(0xFFFFC107)
                                : student.isFrozen
                                    ? Colors.blue
                                    : Colors.grey,
                            backgroundImage: student.avatarUrl != null
                                ? NetworkImage('${ApiConfig.baseUrl}${student.avatarUrl}')
                                : null,
                            child: student.avatarUrl == null
                                ? Text(
                                    student.firstName[0].toUpperCase(),
                                    style: TextStyle(
                                      color: student.status == 'active' ? Colors.black : Colors.white,
                                      fontWeight: FontWeight.bold
                                    ),
                                  )
                                : null,
                          ),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(student.fullName, style: const TextStyle(color: Colors.white)),
                              ),
                              // Показывать бейдж "Долг" если: месячный баланс < 0 (не оплачено)
                              if (student.monthlyBalance < 0)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.red.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(8),
                                    border: Border.all(color: Colors.red.withOpacity(0.5)),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.warning, size: 12, color: Colors.red),
                                      SizedBox(width: 2),
                                      Text(
                                        'Долг',
                                        style: TextStyle(
                                          fontSize: 10,
                                          color: Colors.red,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (student.groupName != null)
                                Text('📚 ${student.groupName}', style: const TextStyle(color: Colors.grey)),
                              Row(
                                children: [
                                  // Показываем посещаемость за текущий месяц
                                  GestureDetector(
                                    onTap: () => _showAttendanceStats(student),
                                    child: Row(
                                      children: [
                                        const Icon(Icons.calendar_today, size: 12, color: Colors.grey),
                                        const SizedBox(width: 4),
                                        FutureBuilder<Map<String, dynamic>>(
                                          future: _getAttendanceForStudent(student.id),
                                          builder: (ctx, snap) {
                                            if (snap.hasData && snap.data!['total'] > 0) {
                                              final present = snap.data!['present'] ?? 0;
                                              final total = snap.data!['total'] ?? 0;
                                              return Text(
                                                'Посещ: $present/$total',
                                                style: const TextStyle(color: Colors.grey, fontSize: 12),
                                              );
                                            }
                                            return const Text('Посещ: 0', style: TextStyle(color: Colors.grey, fontSize: 12));
                                          },
                                        ),
                                        const Icon(Icons.chevron_right, size: 14, color: Colors.grey),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  // Баланс месячной подписки с цветом
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        '${student.monthlyBalance >= 0 ? "+" : ""}${student.monthlyBalance.toInt()} лей',
                                        style: TextStyle(
                                          color: student.balanceColor == 'green' 
                                            ? Colors.green 
                                            : student.balanceColor == 'red' 
                                              ? Colors.red 
                                              : Colors.grey,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 13,
                                        ),
                                      ),
                                      // Показать бейдж скидки если есть индивидуальная оплата
                                      if (student.individualFee != null)
                                        Tooltip(
                                          message: student.feeDiscountReason ?? 'Скидка',
                                          child: Container(
                                            margin: const EdgeInsets.only(left: 4),
                                            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                            decoration: BoxDecoration(
                                              color: Colors.amber.withOpacity(0.2),
                                              borderRadius: BorderRadius.circular(4),
                                            ),
                                            child: const Icon(Icons.discount, size: 12, color: Colors.amber),
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                              if (student.isFrozen)
                                Text(
                                  '❄️ Заморожено${student.freezeUntil != null ? ' до ${student.freezeUntil}' : ''}',
                                  style: TextStyle(color: Colors.blue.shade300, fontWeight: FontWeight.w600),
                                ),
                            ],
                          ),
                          trailing: PopupMenuButton(
                            color: const Color(0xFF23272E),
                            iconColor: Colors.grey,
                            itemBuilder: (context) => [
                              // Показывать кнопку напоминания если: месячный баланс < 0 (не оплачено)
                              if (student.monthlyBalance < 0)
                                PopupMenuItem(
                                  value: 'notify',
                                  child: Row(
                                    children: [
                                      const Icon(Icons.notifications_active, color: Colors.orange),
                                      const SizedBox(width: 8),
                                      const Text('Напомнить об оплате', style: TextStyle(color: Colors.orange)),
                                    ],
                                  ),
                                ),
                              // 💰 Индивидуальная оплата (скидка)
                              PopupMenuItem(
                                value: 'individual_fee',
                                child: Row(
                                  children: [
                                    Icon(
                                      Icons.discount,
                                      color: student.individualFee != null ? Colors.amber : Colors.grey,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      student.individualFee != null ? 'Скидка: ${student.individualFee!.toInt()} лей' : 'Установить скидку',
                                      style: TextStyle(
                                        color: student.individualFee != null ? Colors.amber : Colors.white,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'edit',
                                child: Row(
                                  children: [
                                    Icon(Icons.edit, color: Colors.white),
                                    SizedBox(width: 8),
                                    Text('Редактировать', style: TextStyle(color: Colors.white)),
                                  ],
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'delete',
                                child: Row(
                                  children: [
                                    Icon(Icons.delete, color: Colors.red),
                                    SizedBox(width: 8),
                                    Text('Удалить', style: TextStyle(color: Colors.red)),
                                  ],
                                ),
                              ),
                            ],
                            onSelected: (value) async {
                              if (value == 'edit') {
                                _showAddEditDialog(student);
                              } else if (value == 'delete') {
                                _deleteStudent(student);
                              } else if (value == 'notify') {
                                try {
                                  await _apiService.notifyPayment(student.id);
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Напоминание отправлено родителю ${student.firstName}')),
                                    );
                                  }
                                } catch (e) {
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Ошибка: $e')),
                                    );
                                  }
                                }
                              } else if (value == 'individual_fee') {
                                _showIndividualFeeDialog(student);
                              }
                            },
                          ),
                          children: [
                            Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (student.phone != null)
                                    _DetailRow(icon: Icons.phone, label: 'Телефон', value: student.phone!),
                                  if (student.parentPhone != null)
                                    _DetailRow(icon: Icons.phone_android, label: 'Тел. родителя', value: student.parentPhone!),
                                  if (student.dob != null)
                                    _DetailRow(icon: Icons.cake, label: 'Дата рождения', value: student.dob!),
                                  if (student.subscriptionExpires != null)
                                    _DetailRow(
                                      icon: Icons.event_available,
                                      label: 'Абонемент до',
                                      value: student.subscriptionExpires!,
                                    ),
                                  if (student.medicalInfo != null && student.medicalInfo!.isNotEmpty)
                                    _DetailRow(
                                      icon: Icons.medical_information,
                                      label: 'Мед. инфо',
                                      value: student.medicalInfo!,
                                    ),
                                  if (student.height != null)
                                    _DetailRow(
                                      icon: Icons.height,
                                      label: 'Рост',
                                      value: '${student.height} см',
                                    ),
                                  if (student.weight != null)
                                    _DetailRow(
                                      icon: Icons.monitor_weight,
                                      label: 'Вес',
                                      value: '${student.weight} кг',
                                    ),
                                  _DetailRow(
                                    icon: Icons.info,
                                    label: 'Статус',
                                    value: student.status == 'active' ? 'Активен' : 'Неактивен',
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        ),
                      );
                    },
                  ),
                ),
          ),
        ],
      ),
    );
  }
  
  /// Get attendance for student (with caching)
  Future<Map<String, dynamic>> _getAttendanceForStudent(int studentId) async {
    // Check cache first
    if (_attendanceCache.containsKey(studentId)) {
      return _attendanceCache[studentId]!;
    }
    
    try {
      final stats = await _apiService.getStudentAttendanceStats(studentId);
      final currentMonth = stats['current_month'] ?? {};
      _attendanceCache[studentId] = {
        'present': currentMonth['present'] ?? 0,
        'absent': currentMonth['absent'] ?? 0,
        'total': currentMonth['total'] ?? 0,
        'rate': currentMonth['attendance_rate'] ?? 0,
      };
      return _attendanceCache[studentId]!;
    } catch (e) {
      return {'present': 0, 'absent': 0, 'total': 0, 'rate': 0};
    }
  }
  
  /// Show detailed attendance statistics dialog
  void _showAttendanceStats(Student student) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: const Color(0xFF23272E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: FutureBuilder<Map<String, dynamic>>(
          future: _apiService.getStudentAttendanceStats(student.id),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator(color: Color(0xFFFFC107))),
              );
            }
            
            if (snapshot.hasError || !snapshot.hasData) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error, color: Colors.red, size: 48),
                    const SizedBox(height: 16),
                    Text('Ошибка загрузки', style: TextStyle(color: Colors.grey[400])),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Закрыть'),
                    ),
                  ],
                ),
              );
            }
            
            final data = snapshot.data!;
            final currentMonth = data['current_month'] ?? {};
            final monthly = (data['monthly_breakdown'] as List?) ?? [];
            final yearly = data['yearly_totals'] ?? {};
            
            return Container(
              constraints: const BoxConstraints(maxHeight: 500),
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    children: [
                      const Icon(Icons.bar_chart, color: Color(0xFFFFC107), size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Посещаемость',
                              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            Text(
                              student.fullName,
                              style: TextStyle(color: Colors.grey[400], fontSize: 14),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.grey),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const Divider(color: Colors.white24, height: 24),
                  
                  // Current month summary
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [const Color(0xFFFFC107).withOpacity(0.2), const Color(0xFFFFC107).withOpacity(0.05)],
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _buildStatColumn('Тек. месяц', '${currentMonth['present'] ?? 0}/${currentMonth['total'] ?? 0}', Colors.green),
                        _buildStatColumn('Пропущено', '${currentMonth['absent'] ?? 0}', Colors.red),
                        _buildStatColumn('Посещаемость', '${currentMonth['attendance_rate'] ?? 0}%', const Color(0xFFFFC107)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Monthly breakdown
                  if (monthly.isNotEmpty) ...[
                    const Text('По месяцам:', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Flexible(
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: monthly.length,
                        itemBuilder: (ctx, i) {
                          final m = monthly[i];
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              children: [
                                SizedBox(
                                  width: 80,
                                  child: Text(
                                    m['month_name'] ?? '',
                                    style: const TextStyle(color: Colors.grey),
                                  ),
                                ),
                                Expanded(
                                  child: LinearProgressIndicator(
                                    value: (m['attendance_rate'] ?? 0) / 100,
                                    backgroundColor: Colors.white10,
                                    valueColor: AlwaysStoppedAnimation(
                                      (m['attendance_rate'] ?? 0) > 80 ? Colors.green : Colors.orange,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  '${m['present'] ?? 0}/${m['total'] ?? 0}',
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                  
                  // Yearly totals
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Итого за год:', style: TextStyle(color: Colors.grey)),
                        Text(
                          'Присут: ${yearly['present'] ?? 0} | Пропущ: ${yearly['absent'] ?? 0} | ${yearly['attendance_rate'] ?? 0}%',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
  
  Widget _buildStatColumn(String label, String value, Color color) {
    return Column(
      children: [
        Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 12)),
      ],
    );
  }

  /// 💰 Show dialog to set individual fee (discount)
  void _showIndividualFeeDialog(Student student) {
    final feeController = TextEditingController(
      text: student.individualFee?.toInt().toString() ?? '',
    );
    String selectedReason = student.feeDiscountReason ?? '';
    
    final reasons = [
      '',
      'Многодетная семья',
      'Второй ребенок',
      'Спонсор',
      'Сотрудник',
      'Талантливый игрок',
      'Социальная помощь',
      'Другое',
    ];
    
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              const Icon(Icons.discount, color: Colors.amber, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Индивидуальная оплата', style: TextStyle(color: Colors.white, fontSize: 18)),
                    Text(student.fullName, style: TextStyle(color: Colors.grey[400], fontSize: 14)),
                  ],
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Current fee info
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Стоимость группы:', style: TextStyle(color: Colors.grey[400])),
                          Text('${student.groupFee?.toInt() ?? student.monthlyFee.toInt()} лей/мес', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      if (student.individualFee != null) ...[
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Текущая скидка:', style: TextStyle(color: Colors.amber)),
                            Text('${student.individualFee!.toInt()} лей/мес', style: const TextStyle(color: Colors.amber, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        if (student.feeDiscountReason != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('Причина: ${student.feeDiscountReason}', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                          ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                
                // Fee input
                const Text('💵 Индивидуальная сумма (лей/мес)', style: TextStyle(color: Colors.white, fontSize: 14)),
                const SizedBox(height: 8),
                TextField(
                  controller: feeController,
                  style: const TextStyle(color: Colors.white),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    hintText: 'Напр: 600 (50% скидка)',
                    hintStyle: TextStyle(color: Colors.grey[600]),
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.05),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                ),
                Text('Оставьте пустым для стандартной цены', style: TextStyle(color: Colors.grey[600], fontSize: 11)),
                const SizedBox(height: 16),
                
                // Reason dropdown
                const Text('📝 Причина скидки', style: TextStyle(color: Colors.white, fontSize: 14)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: reasons.contains(selectedReason) ? selectedReason : '',
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: Colors.white.withOpacity(0.05),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                  ),
                  items: reasons.map((r) => DropdownMenuItem(
                    value: r,
                    child: Text(r.isEmpty ? 'Выберите причину...' : r),
                  )).toList(),
                  onChanged: (v) => setDialogState(() => selectedReason = v ?? ''),
                ),
              ],
            ),
          ),
          actions: [
            if (student.individualFee != null)
              TextButton(
                onPressed: () async {
                  try {
                    await _apiService.clearIndividualFee(student.id);
                    if (mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('✅ Скидка сброшена')),
                      );
                      _loadData();
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                    }
                  }
                },
                child: const Text('Сбросить', style: TextStyle(color: Colors.red)),
              ),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                foregroundColor: Colors.black,
              ),
              onPressed: () async {
                try {
                  final fee = feeController.text.isNotEmpty ? double.tryParse(feeController.text) : null;
                  await _apiService.setIndividualFee(
                    student.id,
                    individualFee: fee,
                    reason: selectedReason.isNotEmpty ? selectedReason : null,
                  );
                  if (mounted) {
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('✅ Индивидуальная оплата установлена')),
                    );
                    _loadData();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                  }
                }
              },
              child: const Text('Сохранить'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey[400]),
          const SizedBox(width: 8),
          Text(
            '$label: ',
            style: TextStyle(color: Colors.grey[400], fontSize: 13),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
