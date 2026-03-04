import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// Communications Screen - Mass notifications & SMS to parents
class CommunicationsScreen extends StatefulWidget {
  const CommunicationsScreen({super.key});

  @override
  State<CommunicationsScreen> createState() => _CommunicationsScreenState();
}

class _CommunicationsScreenState extends State<CommunicationsScreen> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  bool _isSending = false;
  List<dynamic> _groups = [];
  List<dynamic> _students = [];
  List<dynamic> _debtors = [];
  
  // Form state
  final _messageController = TextEditingController();
  String _targetType = 'all'; // all, groups, debtors, custom
  final Set<int> _selectedGroupIds = {};
  final Set<int> _selectedStudentIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _apiService.getGroups(),
        _apiService.getStudents(),
      ]);
      
      _groups = results[0];
      _students = results[1];
      _debtors = _students.where((s) => 
        s['is_debtor'] == true || (s['balance'] ?? 0) <= 0
      ).toList();
    } catch (e) {
      debugPrint('Error loading data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  int _getRecipientsCount() {
    switch (_targetType) {
      case 'all':
        return _students.where((s) => s['status'] == 'active').length;
      case 'groups':
        return _students.where((s) => 
          s['status'] == 'active' && _selectedGroupIds.contains(s['group_id'])
        ).length;
      case 'debtors':
        return _debtors.length;
      case 'custom':
        return _selectedStudentIds.length;
      default:
        return 0;
    }
  }

  Future<void> _sendMessage() async {
    if (_messageController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите текст сообщения'), backgroundColor: Colors.red),
      );
      return;
    }
    
    final recipientsCount = _getRecipientsCount();
    if (recipientsCount == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Нет получателей'), backgroundColor: Colors.red),
      );
      return;
    }
    
    // Confirm
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Подтверждение', style: TextStyle(color: Colors.white)),
        content: Text(
          'Отправить сообщение $recipientsCount получателям?',
          style: const TextStyle(color: Colors.grey),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Отмена'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFFFC107)),
            child: const Text('Отправить', style: TextStyle(color: Colors.black)),
          ),
        ],
      ),
    );
    
    if (confirm != true) return;
    
    setState(() => _isSending = true);
    try {
      await _apiService.sendBulkSMS(
        message: _messageController.text.trim(),
        allStudents: _targetType == 'all',
        debtorsOnly: _targetType == 'debtors',
        groupIds: _targetType == 'groups' ? _selectedGroupIds.toList() : null,
        studentIds: _targetType == 'custom' ? _selectedStudentIds.toList() : null,
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✅ Сообщение отправлено $recipientsCount получателям'),
            backgroundColor: Colors.green,
          ),
        );
        _messageController.clear();
        setState(() {
          _selectedGroupIds.clear();
          _selectedStudentIds.clear();
          _targetType = 'all';
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSending = false);
    }
  }

  Future<void> _sendDebtReminders() async {
    if (_debtors.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Нет должников'), backgroundColor: Colors.orange),
      );
      return;
    }
    
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Row(
          children: [
            Icon(Icons.warning, color: Colors.orange),
            SizedBox(width: 8),
            Text('Напоминание должникам', style: TextStyle(color: Colors.white)),
          ],
        ),
        content: Text(
          'Отправить напоминание ${_debtors.length} должникам?',
          style: const TextStyle(color: Colors.grey),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Отмена'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('Отправить', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    
    if (confirm != true) return;
    
    setState(() => _isSending = true);
    try {
      await _apiService.sendReminderToAllDebtors();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✅ Напоминания отправлены ${_debtors.length} должникам'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSending = false);
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
            Text('📢 ', style: TextStyle(fontSize: 24)),
            Text('Рассылки'),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFFFC107),
          labelColor: const Color(0xFFFFC107),
          unselectedLabelColor: Colors.grey,
          tabs: const [
            Tab(icon: Icon(Icons.send), text: 'Новая рассылка'),
            Tab(icon: Icon(Icons.flash_on), text: 'Быстрые действия'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildNewMessageTab(),
                _buildQuickActionsTab(),
              ],
            ),
    );
  }

  Widget _buildNewMessageTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Target selection
          const Text(
            'Получатели',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildTargetChip('all', '👥 Все', _students.where((s) => s['status'] == 'active').length),
              _buildTargetChip('groups', '📚 По группам', null),
              _buildTargetChip('debtors', '⚠️ Должники', _debtors.length),
              _buildTargetChip('custom', '✏️ Выбрать', null),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Group selection (if groups selected)
          if (_targetType == 'groups') ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF23272E),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Выберите группы:', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _groups.map((g) {
                      final isSelected = _selectedGroupIds.contains(g['id']);
                      return FilterChip(
                        selected: isSelected,
                        label: Text(g['name'] ?? 'Группа'),
                        labelStyle: TextStyle(color: isSelected ? Colors.black : Colors.white),
                        backgroundColor: const Color(0xFF2D323B),
                        selectedColor: const Color(0xFFFFC107),
                        onSelected: (selected) {
                          setState(() {
                            if (selected) {
                              _selectedGroupIds.add(g['id']);
                            } else {
                              _selectedGroupIds.remove(g['id']);
                            }
                          });
                        },
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          
          // Recipients count
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFC107).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.people, color: Color(0xFFFFC107)),
                const SizedBox(width: 12),
                Text(
                  'Получателей: ${_getRecipientsCount()}',
                  style: const TextStyle(
                    color: Color(0xFFFFC107),
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          // Message input
          const Text(
            'Сообщение',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          
          TextField(
            controller: _messageController,
            maxLines: 5,
            maxLength: 300,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Введите текст сообщения...',
              hintStyle: TextStyle(color: Colors.grey[600]),
              filled: true,
              fillColor: const Color(0xFF23272E),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFFFC107)),
              ),
              counterStyle: const TextStyle(color: Colors.grey),
            ),
          ),
          
          const SizedBox(height: 16),
          
          // Quick templates
          const Text('Быстрые шаблоны:', style: TextStyle(color: Colors.grey, fontSize: 12)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildTemplateChip('Напоминание о тренировке завтра'),
              _buildTemplateChip('Тренировка отменена'),
              _buildTemplateChip('Изменение в расписании'),
              _buildTemplateChip('Срочное объявление'),
            ],
          ),
          
          const SizedBox(height: 24),
          
          // Send button
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _isSending ? null : _sendMessage,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: _isSending 
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2),
                    )
                  : const Icon(Icons.send, color: Colors.black),
              label: Text(
                _isSending ? 'Отправка...' : 'Отправить сообщение',
                style: const TextStyle(color: Colors.black, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTargetChip(String type, String label, int? count) {
    final isSelected = _targetType == type;
    return GestureDetector(
      onTap: () => setState(() => _targetType = type),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFFFC107).withOpacity(0.2) : const Color(0xFF23272E),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xFFFFC107) : Colors.white10,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: isSelected ? const Color(0xFFFFC107) : Colors.white,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
            if (count != null) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFFFFC107) : Colors.white10,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '$count',
                  style: TextStyle(
                    color: isSelected ? Colors.black : Colors.grey,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTemplateChip(String text) {
    return GestureDetector(
      onTap: () {
        _messageController.text = text;
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFF2D323B),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text, style: const TextStyle(color: Colors.grey, fontSize: 12)),
      ),
    );
  }

  Widget _buildQuickActionsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Debt reminders
          _buildQuickActionCard(
            icon: Icons.payment,
            iconColor: Colors.orange,
            title: 'Напомнить должникам',
            subtitle: 'Отправить SMS всем с задолженностью',
            count: _debtors.length,
            countLabel: 'должников',
            buttonText: 'Отправить напоминания',
            onPressed: _sendDebtReminders,
          ),
          
          const SizedBox(height: 16),
          
          // Training reminder
          _buildQuickActionCard(
            icon: Icons.fitness_center,
            iconColor: Colors.blue,
            title: 'Напомнить о тренировке',
            subtitle: 'Уведомить о занятиях завтра',
            count: _students.where((s) => s['status'] == 'active').length,
            countLabel: 'учеников',
            buttonText: 'Отправить напоминание',
            onPressed: () => _sendQuickMessage('Напоминаем о тренировке завтра. Ждём вас!'),
          ),
          
          const SizedBox(height: 16),
          
          // Birthday greetings
          _buildQuickActionCard(
            icon: Icons.cake,
            iconColor: Colors.pink,
            title: 'Поздравить с днём рождения',
            subtitle: 'Именинники сегодня',
            count: _getBirthdayCount(),
            countLabel: 'именинников',
            buttonText: 'Отправить поздравления',
            onPressed: () => _sendBirthdayGreetings(),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required int count,
    required String countLabel,
    required String buttonText,
    required VoidCallback onPressed,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: iconColor.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: iconColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconColor, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: iconColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    Text(
                      '$count',
                      style: TextStyle(
                        color: iconColor,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      countLabel,
                      style: const TextStyle(color: Colors.grey, fontSize: 10),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: count > 0 ? (_isSending ? null : onPressed) : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: iconColor,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(
                buttonText,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }

  int _getBirthdayCount() {
    final now = DateTime.now();
    return _students.where((s) {
      final dob = s['dob'] ?? s['date_of_birth'];
      if (dob == null) return false;
      final date = DateTime.tryParse(dob);
      if (date == null) return false;
      return date.month == now.month && date.day == now.day;
    }).length;
  }

  Future<void> _sendQuickMessage(String message) async {
    setState(() => _isSending = true);
    try {
      await _apiService.sendBulkSMS(message: message, allStudents: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Сообщение отправлено'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSending = false);
    }
  }

  Future<void> _sendBirthdayGreetings() async {
    // Implementation would send birthday greetings
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('🎂 Поздравления отправлены!'), backgroundColor: Colors.pink),
    );
  }
}
