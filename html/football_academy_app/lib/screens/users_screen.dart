import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../models/user.dart';
import '../models/group.dart';
import '../models/student.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  final ApiService _apiService = ApiService();
  List<User> _users = [];
  List<Group> _groups = [];
  bool _isLoading = true;
  String _filterRole = 'all'; // all, coach, parent, admin
  
  // Search
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  
  List<User> get _filteredUsers {
    List<User> filtered = _users;
    
    // Apply role filter
    if (_filterRole != 'all') {
      filtered = filtered.where((u) => u.role.toLowerCase() == _filterRole).toList();
    }
    
    // Apply search filter
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      filtered = filtered.where((u) {
        return (u.fullName.toLowerCase().contains(query) ?? false) ||
               (u.phone.contains(query) ?? false) ||
               (u.role.toLowerCase().contains(query) ?? false);
      }).toList();
    }
    
    return filtered;
  }

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final role = _filterRole == 'all' ? null : _filterRole;
      final results = await Future.wait([
        _apiService.getUsers(role: role),
        _apiService.getGroups(),
      ]);
      
      if (mounted) {
        setState(() {
          _users = (results[0]).map((e) => User.fromJson(e)).toList();
          _groups = (results[1]).map((g) => Group.fromJson(g)).toList();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    }
  }

  void _showResetPasswordDialog(User user) {
    final passwordController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: Text('Сброс пароля', style: const TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Пользователь: ${user.fullName}', style: const TextStyle(color: Colors.grey, fontSize: 12)),
            const SizedBox(height: 16),
            TextField(
              controller: passwordController,
              style: const TextStyle(color: Colors.white),
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Новый пароль',
                labelStyle: TextStyle(color: Colors.grey),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFFC107), foregroundColor: Colors.black),
            onPressed: () async {
              if (passwordController.text.length < 6) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Минимум 6 символов')),
                );
                return;
              }
              try {
                await _apiService.resetUserPassword(user.id, passwordController.text);
                if (mounted) {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Пароль изменен')),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Ошибка: $e')),
                  );
                }
              }
            },
            child: const Text('Сбросить'),
          ),
        ],
      ),
    );
  }

  void _showAddUserDialog() {
    final phoneController = TextEditingController();
    final passwordController = TextEditingController();
    final fullNameController = TextEditingController();
    
    // For Parent
    final childNameController = TextEditingController();
    final childSurnameController = TextEditingController();
    DateTime? childDob;
    
    String role = 'parent';
    int? selectedGroupId;
    bool isSaving = false;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: const Text(
            'Добавить пользователя',
            style: TextStyle(color: Colors.white),
          ),
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
                    hintText: '+373...',
                    hintStyle: TextStyle(color: Colors.grey),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
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
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: fullNameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'ФИО *',
                    labelStyle: TextStyle(color: Colors.grey),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: role,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Роль',
                    labelStyle: TextStyle(color: Colors.grey),
                    enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'parent', child: Text('Родитель')),
                    DropdownMenuItem(value: 'coach', child: Text('Тренер')),
                    DropdownMenuItem(value: 'admin', child: Text('Администратор')),
                  ],
                  onChanged: (value) => setDialogState(() => role = value!),
                ),
                
                // Extra fields for Parent
                if (role == 'parent') ...[
                  const SizedBox(height: 20),
                  const Text('Ребенок (Обязательно для привязки)', style: TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold)),
                  TextField(
                    controller: childNameController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Имя ребенка *',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                  TextField(
                    controller: childSurnameController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Фамилия ребенка *',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Date of Birth
                  InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: DateTime.now().subtract(const Duration(days: 365 * 10)),
                        firstDate: DateTime(2000),
                        lastDate: DateTime.now(),
                      );
                      if (picked != null) {
                        setDialogState(() => childDob = picked);
                      }
                    },
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Дата рождения ребенка *',
                        labelStyle: TextStyle(color: Colors.grey),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      ),
                      child: Text(
                        childDob == null ? 'Выберите дату' : DateFormat('dd.MM.yyyy').format(childDob!),
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: selectedGroupId,
                    dropdownColor: const Color(0xFF2D323B),
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Группа ребенка *',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                    items: _groups.map((g) => DropdownMenuItem(
                      value: g.id,
                      child: Text('${g.name} ${g.ageGroup != null ? "(${g.ageGroup})" : ""}'),
                    )).toList(),
                    onChanged: (value) => setDialogState(() => selectedGroupId = value),
                  ),
                ],

                // Extra fields for Coach
                if (role == 'coach') ...[
                  const SizedBox(height: 20),
                  const Text('Привязка к группе', style: TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold)),
                  DropdownButtonFormField<int>(
                    initialValue: selectedGroupId,
                    dropdownColor: const Color(0xFF2D323B),
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Назначить тренером группы',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                    items: _groups.map((g) => DropdownMenuItem(
                      value: g.id,
                      child: Text('${g.name} ${g.ageGroup != null ? "(${g.ageGroup})" : ""}'),
                    )).toList(),
                    onChanged: (value) => setDialogState(() => selectedGroupId = value),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: Colors.black,
              ),
              onPressed: isSaving ? null : () async {
                if (phoneController.text.isEmpty || 
                    passwordController.text.isEmpty || 
                    fullNameController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Заполните все обязательные поля')),
                  );
                  return;
                }
                
                if (role == 'parent') {
                   if (childNameController.text.isEmpty || childSurnameController.text.isEmpty || childDob == null || selectedGroupId == null) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Для родителя нужно заполнить данные ребенка и группу')),
                      );
                      return;
                   }
                }

                setDialogState(() => isSaving = true);

                final data = <String, dynamic>{
                  'phone': phoneController.text,
                  'password': passwordController.text,
                  'full_name': fullNameController.text,
                  'role': role,
                };
                
                // Add child data for parents (backend creates both atomically)
                if (role == 'parent' && childNameController.text.isNotEmpty && childDob != null && selectedGroupId != null) {
                  data['child_full_name'] = '${childNameController.text} ${childSurnameController.text}'.trim();
                  data['child_birth_date'] = childDob!.toIso8601String().split('T')[0];
                  data['child_group_id'] = selectedGroupId;
                }

                try {
                  // Create User (with child if parent)
                  final newUser = await _apiService.createUser(data);
                  final newUserId = newUser['id'];

                  // Coach: assign to group
                  if (role == 'coach' && selectedGroupId != null) {
                    await _apiService.updateGroup(selectedGroupId!, {
                      'coach_id': newUserId,
                    });
                  }

                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Пользователь и ученик созданы')),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Ошибка: $e')),
                    );
                  }
                } finally {
                  if (mounted) setDialogState(() => isSaving = false);
                }
              },
              child: isSaving 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                : const Text('Создать'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditUserDialog(User user) {
    final phoneController = TextEditingController(text: user.phone);
    final fullNameController = TextEditingController(text: user.fullName);
    
    int? selectedGroupId; // For Coach editing
    
    // For Parent editing
    List<Student> children = [];
    bool isLoadingChildren = false;

    if (user.role == 'parent') {
      isLoadingChildren = true;
      // We need to fetch students and filter by parent? Or get children of parent.
      // Ideally backend should provide this, but we can filter on client for now.
      _apiService.getStudents().then((data) {
        // Need to check how to link. User ID? 
        // Student model has guardianIds?
        // Let's assume we can match by parent phone or if we have guardian relation.
        // In this app, student has 'parent_id' or 'guardian_ids'.
        // Let's just fetch all students and filter where guardian_ids contains user.id
        // But getStudents returns list of dicts.
        if (mounted) {
          // This is a bit hacky if we don't have direct endpoint. 
          // But let's try.
        }
      });
    }

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          // Load coach's current group if coach
          if (user.role == 'coach' && selectedGroupId == null) {
             // Find group where coach_id == user.id
             try {
               final group = _groups.firstWhere((g) => g.coachId == user.id);
               selectedGroupId = group.id;
             } catch (_) {}
          }

          return AlertDialog(
            backgroundColor: const Color(0xFF23272E),
            title: const Text(
              'Редактировать пользователя',
              style: TextStyle(color: Colors.white),
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: phoneController,
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Телефон',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: fullNameController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'ФИО',
                      labelStyle: TextStyle(color: Colors.grey),
                      enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                  const SizedBox(height: 20),
                  
                  // Reset Password Button
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.lock_reset, size: 18),
                      label: const Text('Сбросить пароль'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFFFC107),
                        side: const BorderSide(color: Color(0xFFFFC107)),
                      ),
                      onPressed: () => _showResetPasswordDialog(user),
                    ),
                  ),
                  
                  if (user.role == 'coach') ...[
                    const SizedBox(height: 20),
                    const Text('Привязка к группе', style: TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold)),
                    DropdownButtonFormField<int>(
                      initialValue: selectedGroupId,
                      dropdownColor: const Color(0xFF2D323B),
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(
                        labelText: 'Тренер группы',
                        labelStyle: TextStyle(color: Colors.grey),
                        enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                        focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                      ),
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Без группы')),
                        ..._groups.map((g) => DropdownMenuItem(
                          value: g.id,
                          child: Text('${g.name} ${g.ageGroup != null ? "(${g.ageGroup})" : ""}'),
                        )),
                      ],
                      onChanged: (value) => setDialogState(() => selectedGroupId = value),
                    ),
                  ],

                  if (user.role == 'parent') ...[
                    const SizedBox(height: 20),
                    // Adding child in edit mode is complex (needs createStudent).
                    // Just a button to navigate to Add Student?
                    // Or simple "Add Child" fields here?
                    // Let's keep it simple: Show hint.
                    const Text(
                      'Для добавления детей используйте раздел "Ученики" или создайте нового пользователя.',
                      style: TextStyle(color: Colors.grey, fontSize: 12),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFC107),
                  foregroundColor: Colors.black,
                ),
                onPressed: () async {
                  if (phoneController.text.isEmpty || fullNameController.text.isEmpty) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Заполните обязательные поля')),
                    );
                    return;
                  }

                  final data = {
                    'phone': phoneController.text,
                    'full_name': fullNameController.text,
                  };

                  try {
                    await _apiService.updateUser(user.id, data);
                    
                    if (user.role == 'coach') {
                      // Handle group change
                      // If selectedGroupId is different from current
                      // 1. Find old group and remove coach
                      try {
                        final oldGroup = _groups.firstWhere((g) => g.coachId == user.id);
                        if (oldGroup.id != selectedGroupId) {
                          await _apiService.updateGroup(oldGroup.id, {'coach_id': null});
                        }
                      } catch (_) {}
                      
                      // 2. Set new group
                      if (selectedGroupId != null) {
                        await _apiService.updateGroup(selectedGroupId!, {'coach_id': user.id});
                      }
                    }

                    if (mounted) {
                      Navigator.pop(context);
                      _loadData();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Пользователь обновлен')),
                      );
                    }
                  } catch (e) {
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Ошибка: $e')),
                      );
                    }
                  }
                },
                child: const Text('Сохранить'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _deleteUser(User user) async {
    // Double check - don't allow deleting super_admin
    if (user.role.toLowerCase() == 'super_admin') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Руководитель не может быть удален'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Удалить пользователя?', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Вы уверены, что хотите удалить пользователя ${user.fullName}?',
              style: const TextStyle(color: Colors.grey),
            ),
            const SizedBox(height: 8),
            const Text(
              'Это действие нельзя отменить.',
              style: TextStyle(color: Colors.red, fontSize: 12),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteUser(user.id);
        _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Пользователь ${user.fullName} удален'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } on DioException catch (e) {
        if (mounted) {
          String errorMsg = 'Ошибка удаления';
          if (e.response?.data != null) {
            final detail = e.response?.data['detail'];
            if (detail != null) {
              errorMsg = detail.toString();
            }
          } else if (e.response?.statusCode == 403) {
            errorMsg = 'Недостаточно прав для удаления';
          } else if (e.response?.statusCode == 404) {
            errorMsg = 'Пользователь не найден';
          }
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(errorMsg),
              backgroundColor: Colors.red,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Ошибка удаления: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C2127),
      appBar: AppBar(
        title: const Text('Пользователи'),
        backgroundColor: const Color(0xFF23272E),
        foregroundColor: Colors.white,
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            color: const Color(0xFF2D323B),
            onSelected: (value) {
              setState(() {
                _filterRole = value;
              });
              _loadData();
            },
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'all', child: Text('Все', style: TextStyle(color: Colors.white))),
              const PopupMenuItem(value: 'parent', child: Text('Родители', style: TextStyle(color: Colors.white))),
              const PopupMenuItem(value: 'coach', child: Text('Тренеры', style: TextStyle(color: Colors.white))),
              const PopupMenuItem(value: 'admin', child: Text('Админы', style: TextStyle(color: Colors.white))),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFFC107),
        onPressed: _showAddUserDialog,
        child: const Icon(Icons.add, color: Colors.black),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Search bar
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: TextField(
                    controller: _searchController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: '🔍 Поиск по имени, телефону...',
                      hintStyle: const TextStyle(color: Colors.grey),
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
                      filled: true,
                      fillColor: const Color(0xFF2D323B),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onChanged: (value) => setState(() => _searchQuery = value),
                  ),
                ),
                if (_searchQuery.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        Text('Найдено: ${_filteredUsers.length}', style: const TextStyle(color: Colors.grey)),
                      ],
                    ),
                  ),
                Expanded(
                  child: _filteredUsers.isEmpty
                      ? const Center(
                          child: Text(
                            'Нет пользователей',
                            style: TextStyle(color: Colors.grey, fontSize: 18),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _filteredUsers.length,
                          itemBuilder: (context, index) {
                            final user = _filteredUsers[index];
                    return Card(
                      color: const Color(0xFF2D323B),
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Colors.grey.withOpacity(0.2)),
                      ),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: _getRoleColor(user.role),
                          child: Icon(
                            _getRoleIcon(user.role),
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                        title: Text(
                          user.fullName,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.phone,
                              style: TextStyle(color: Colors.grey[400]),
                            ),
                            Container(
                              margin: const EdgeInsets.only(top: 4),
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: _getRoleColor(user.role).withOpacity(0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                _getRoleName(user.role),
                                style: TextStyle(
                                  color: _getRoleColor(user.role),
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ),
                        trailing: user.role.toLowerCase() == 'super_admin'
                            ? Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  border: Border.all(color: Colors.red.withOpacity(0.5)),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('Руководитель', style: TextStyle(color: Colors.red, fontSize: 10)),
                              )
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (user.role == 'parent')
                                    IconButton(
                                      icon: const Icon(Icons.person_add_alt_1, color: Colors.green),
                                      tooltip: 'Добавить ребенка',
                                      onPressed: () {
                                        Navigator.pushNamed(
                                          context, 
                                          '/students', 
                                          arguments: {'parentPhone': user.phone},
                                        );
                                      },
                                    ),
                                  IconButton(
                                    icon: const Icon(Icons.edit, color: Colors.blue),
                                    tooltip: 'Редактировать',
                                    onPressed: () => _showEditUserDialog(user),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.delete, color: Colors.red),
                                    tooltip: 'Удалить',
                                    onPressed: () => _deleteUser(user),
                                  ),
                                ],
                              ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
    );
  }

  Color _getRoleColor(String role) {
    switch (role.toLowerCase()) {
      case 'super_admin':
      case 'admin':
        return Colors.red;
      case 'coach':
        return Colors.blue;
      case 'parent':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  IconData _getRoleIcon(String role) {
    switch (role.toLowerCase()) {
      case 'super_admin':
      case 'admin':
        return Icons.admin_panel_settings;
      case 'coach':
        return Icons.sports_soccer;
      case 'parent':
        return Icons.family_restroom;
      default:
        return Icons.person;
    }
  }

  String _getRoleName(String role) {
    switch (role.toLowerCase()) {
      case 'super_admin':
        return 'Руководитель академии';
      case 'admin':
        return 'Администратор';
      case 'coach':
        return 'Тренер';
      case 'parent':
        return 'Родитель';
      default:
        return role;
    }
  }
}
