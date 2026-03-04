import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../models/payment.dart';
import '../models/student.dart';

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  List<Payment> _payments = [];
  List<Payment> _filteredPayments = [];
  List<Student> _students = [];
  bool _isLoading = true;
  String? _error;
  String _statusFilter = 'all';  // all, completed, pending, cancelled
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();
  
  // Parent debt status
  Map<String, dynamic>? _paymentStatus;
  List<dynamic> _myDebts = [];
  
  // Admin pending payments
  List<dynamic> _pendingPayments = [];
  
  // Debtors list (admin)
  List<dynamic> _debtors = [];
  double _totalDebtAmount = 0;
  
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
  }
  
  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final user = context.read<AuthProvider>().user;
      final isParent = user?.role.toLowerCase() == 'parent';
      
      if (isParent) {
        // Load parent-specific data
        final statusData = await _apiService.getMyPaymentStatus();
        final debtsData = await _apiService.getMyDebts();
        setState(() {
          _paymentStatus = statusData;
          _myDebts = debtsData;
        });
      } else {
        // Load admin data
        final pendingData = await _apiService.getPendingPayments();
        
        // Load debtors for admin
        try {
          final debtorsData = await _apiService.getDebtors();
          setState(() {
            _debtors = debtorsData['debtors'] ?? [];
            _totalDebtAmount = (debtorsData['total_debt_amount'] ?? 0).toDouble();
          });
        } catch (e) {
          print('Error loading debtors: $e');
        }
        
        setState(() {
          _pendingPayments = pendingData;
        });
      }
      
      final paymentsData = await _apiService.getPayments();
      final studentsData = await _apiService.getStudents();
      setState(() {
        _payments = paymentsData.map((e) => Payment.fromJson(e)).toList();
        _students = studentsData.map((e) => Student.fromJson(e)).toList();
        _applyFilter();
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = e.toString();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    }
  }

  void _applyFilter() {
    setState(() {
      List<Payment> filtered = _payments;
      
      // Apply status filter
      if (_statusFilter != 'all') {
        filtered = filtered.where((p) => p.status == _statusFilter).toList();
      }
      
      // Apply text search
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        filtered = filtered.where((p) {
          final student = _students.where((s) => s.id == p.studentId).firstOrNull;
          return (student?.fullName.toLowerCase().contains(query) ?? false) ||
                 (p.paymentDate.contains(query) ?? false) ||
                 p.amount.toString().contains(query);
        }).toList();
      }
      
      _filteredPayments = filtered;
    });
  }

  void _showAddPaymentDialog() {
    final amountController = TextEditingController();
    final descriptionController = TextEditingController();
    final referenceController = TextEditingController(); // For Transaction ID / Invoice
    int? selectedStudentId;
    String method = 'cash';
    String status = 'completed';
    DateTime paymentDate = DateTime.now();
    DateTime paymentPeriod = DateTime(DateTime.now().year, DateTime.now().month, 1);

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: const Text('Новый платеж', style: TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. Student Selection
                const Text('Плательщик', style: TextStyle(color: Colors.grey, fontSize: 12)),
                const SizedBox(height: 4),
                DropdownButtonFormField<int>(
                  initialValue: selectedStudentId,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Выберите ученика',
                    hintStyle: TextStyle(color: Colors.grey[600]),
                    filled: true,
                    fillColor: const Color(0xFF2D323B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: const Icon(Icons.person, color: Colors.grey),
                  ),
                  items: _students.map((s) => DropdownMenuItem(
                    value: s.id,
                    child: Text(s.fullName),
                  )).toList(),
                  onChanged: (value) => setDialogState(() => selectedStudentId = value),
                ),
                const SizedBox(height: 16),
                
                // 2. Amount & Currency
                const Text('Сумма', style: TextStyle(color: Colors.grey, fontSize: 12)),
                const SizedBox(height: 4),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: const Color(0xFF2D323B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: const Icon(Icons.attach_money, color: Colors.green),
                    suffixText: 'MDL',
                    suffixStyle: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 16),
                
                // 3. Payment Method (Tabs)
                const Text('Способ оплаты', style: TextStyle(color: Colors.grey, fontSize: 12)),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildMethodTab('cash', 'Наличные', Icons.money, method, (val) => setDialogState(() => method = val)),
                      const SizedBox(width: 8),
                      _buildMethodTab('card', 'Карта', Icons.credit_card, method, (val) => setDialogState(() => method = val)),
                      const SizedBox(width: 8),
                      _buildMethodTab('bank_transfer', 'Счет', Icons.account_balance, method, (val) => setDialogState(() => method = val)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Dynamic Fields based on Method
                if (method == 'card')
                  TextField(
                    controller: referenceController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'ID Транзакции (опционально)',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF2D323B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      prefixIcon: const Icon(Icons.receipt_long, color: Colors.grey),
                    ),
                  ),
                if (method == 'bank_transfer')
                  TextField(
                    controller: referenceController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: 'Номер счета / Инвойс',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF2D323B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      prefixIcon: const Icon(Icons.description, color: Colors.grey),
                    ),
                  ),
                if (method != 'cash') const SizedBox(height: 16),
                
                // 4. Status
                DropdownButtonFormField<String>(
                  initialValue: status,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Статус платежа',
                    labelStyle: const TextStyle(color: Colors.grey),
                    filled: true,
                    fillColor: const Color(0xFF2D323B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: _getStatusIcon(status),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'completed', child: Text('✅ Проведен (Баланс пополнен)')),
                    DropdownMenuItem(value: 'pending', child: Text('⏳ В ожидании (Баланс не меняется)')),
                    DropdownMenuItem(value: 'cancelled', child: Text('❌ Отменён')),
                  ],
                  onChanged: (value) => setDialogState(() => status = value!),
                ),
                const SizedBox(height: 16),
                
                // 5. Payment Period (УПРОЩЕНО: выбор месяца и года)
                InkWell(
                  onTap: () async {
                    // Показываем кастомный выбор месяца
                    await _showMonthYearPicker(context, paymentPeriod, (selectedDate) {
                      setDialogState(() {
                        // Устанавливаем 1-е число выбранного месяца
                        paymentPeriod = DateTime(selectedDate.year, selectedDate.month, 1);
                        paymentDate = DateTime(selectedDate.year, selectedDate.month, 1);
                      });
                    });
                  },
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Абонемент за месяц',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF2D323B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      prefixIcon: const Icon(Icons.calendar_month, color: Colors.orange),
                    ),
                    child: Text(
                      _getMonthName(paymentPeriod),
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                
                // Subscription Info Box
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.blue.withOpacity(0.3)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.blue, size: 16),
                          SizedBox(width: 6),
                          Text('Информация:', style: TextStyle(color: Colors.blue, fontWeight: FontWeight.bold, fontSize: 12)),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text('• Выберите месяц, за который вносится оплата', style: TextStyle(color: Colors.blue.shade300, fontSize: 11)),
                      Text('• Дата платежа устанавливается автоматически', style: TextStyle(color: Colors.blue.shade300, fontSize: 11)),
                      Text('• Оплата рекомендуется с 25-го по 1-е число', style: TextStyle(color: Colors.blue.shade300, fontSize: 11)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // 6. Description
                TextField(
                  controller: descriptionController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Комментарий',
                    labelStyle: const TextStyle(color: Colors.grey),
                    hintText: 'Например: За форму, Штраф...',
                    hintStyle: TextStyle(color: Colors.grey[600]),
                    filled: true,
                    fillColor: const Color(0xFF2D323B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: const Icon(Icons.comment, color: Colors.grey),
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
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4CAF50),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              onPressed: () async {
                if (selectedStudentId == null) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Выберите ученика')));
                  return;
                }
                
                final amount = double.tryParse(amountController.text);
                if (amount == null || amount <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Введите корректную сумму')));
                  return;
                }

                final data = {
                  'student_id': selectedStudentId,
                  'amount': amount,
                  'payment_date': paymentDate.toIso8601String().split('T')[0],
                  'payment_period': paymentPeriod.toIso8601String().split('T')[0],
                  'method': method,
                  'status': status,
                  'description': descriptionController.text,
                  'reference_id': referenceController.text,
                };

                try {
                  await _apiService.createPayment(data);
                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Платеж успешно проведен')));
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
                  }
                }
              },
              child: const Text('Провести платеж'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMethodTab(String value, String label, IconData icon, String groupValue, Function(String) onChanged) {
    final isSelected = value == groupValue;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF1E88E5) : const Color(0xFF2D323B),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? Colors.blueAccent : Colors.grey.withOpacity(0.3),
            ),
          ),
          child: Column(
            children: [
              Icon(icon, color: isSelected ? Colors.white : Colors.grey, size: 20),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : Colors.grey,
                  fontSize: 12,
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _getStatusIcon(String status) {
    switch (status) {
      case 'completed': return const Icon(Icons.check_circle, color: Colors.green);
      case 'pending': return const Icon(Icons.access_time, color: Colors.orange);
      case 'cancelled': return const Icon(Icons.cancel, color: Colors.red);
      default: return const Icon(Icons.help_outline, color: Colors.grey);
    }
  }

  String _getMonthName(DateTime date) {
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель',
      'Май', 'Июнь', 'Июль', 'Август',
      'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    return '${months[date.month - 1]} ${date.year}';
  }

  // Кастомный выбор месяца и года (без дней)
  Future<void> _showMonthYearPicker(
    BuildContext context,
    DateTime initialDate,
    Function(DateTime) onDateSelected,
  ) async {
    int selectedYear = initialDate.year;
    int selectedMonth = initialDate.month;

    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: const Text(
            'Выберите месяц',
            style: TextStyle(color: Colors.white),
          ),
          content: SizedBox(
            width: 300,
            height: 400,
            child: Column(
              children: [
                // Выбор года
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left, color: Colors.white),
                      onPressed: () => setDialogState(() => selectedYear--),
                    ),
                    Text(
                      '$selectedYear',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.chevron_right, color: Colors.white),
                      onPressed: () => setDialogState(() => selectedYear++),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Сетка месяцев
                Expanded(
                  child: GridView.builder(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      childAspectRatio: 1.5,
                      crossAxisSpacing: 10,
                      mainAxisSpacing: 10,
                    ),
                    itemCount: 12,
                    itemBuilder: (context, index) {
                      final month = index + 1;
                      final isSelected = month == selectedMonth;
                      const monthNames = [
                        'Янв', 'Фев', 'Мар', 'Апр',
                        'Май', 'Июн', 'Июл', 'Авг',
                        'Сен', 'Окт', 'Ноя', 'Дек'
                      ];

                      return GestureDetector(
                        onTap: () => setDialogState(() => selectedMonth = month),
                        child: Container(
                          decoration: BoxDecoration(
                            color: isSelected
                                ? const Color(0xFF4CAF50)
                                : const Color(0xFF2D323B),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isSelected
                                  ? const Color(0xFF4CAF50)
                                  : Colors.grey.withOpacity(0.3),
                              width: 2,
                            ),
                          ),
                          child: Center(
                            child: Text(
                              monthNames[index],
                              style: TextStyle(
                                color: isSelected ? Colors.white : Colors.grey,
                                fontWeight: isSelected
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                              ),
                            ),
                          ),
                        ),
                      );
                    },
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
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF4CAF50),
              ),
              onPressed: () {
                onDateSelected(DateTime(selectedYear, selectedMonth, 1));
                Navigator.pop(context);
              },
              child: const Text('Выбрать', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deletePayment(Payment payment) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить платеж?'),
        content: Text('Удалить платеж на сумму ${payment.amount.toStringAsFixed(0)} MDL?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
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
        await _apiService.deletePayment(payment.id);
        _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Платеж удалён')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Ошибка удаления: $e')),
          );
        }
      }
    }
  }

  Future<void> _confirmPayment(int paymentId) async {
    try {
      await _apiService.confirmPayment(paymentId);
      _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Оплата подтверждена!'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e')),
        );
      }
    }
  }

  IconData _getMethodIcon(String method) {
    switch (method) {
      case 'cash':
        return Icons.money;
      case 'card':
        return Icons.credit_card;
      case 'bank_transfer':
        return Icons.account_balance;
      case 'transfer':  // Old value support
        return Icons.account_balance;
      default:
        return Icons.payment;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'completed':
        return const Color(0xFF4CAF50);
      case 'pending':
        return Colors.orange;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final isParent = user?.role.toLowerCase() == 'parent';
    final total = _filteredPayments.fold<double>(0, (sum, p) => sum + p.amount);

    return Scaffold(
      backgroundColor: const Color(0xFF1C2127),
      appBar: AppBar(
        title: const Text('Платежи'),
        backgroundColor: const Color(0xFF1B5E20),
        foregroundColor: Colors.white,
        bottom: isParent ? null : TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          isScrollable: true,
          tabs: [
            Tab(text: 'Ожидают (${_pendingPayments.length})'),
            Tab(text: '⚠️ Должники (${_debtors.length})'),
            const Tab(text: 'История'),
            const Tab(text: 'Все'),
          ],
        ),
      ),
      floatingActionButton: isParent
          ? null
          : FloatingActionButton(
              backgroundColor: const Color(0xFF4CAF50),
              onPressed: _showAddPaymentDialog,
              child: const Icon(Icons.add, color: Colors.white),
            ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorWidget()
              : isParent
                  ? _buildParentView()
                  : _buildAdminView(total),
    );
  }

  void _showInvoiceStudentDialog(int studentId, String studentName, double monthlyFee) {
    final amountController = TextEditingController(text: monthlyFee.toStringAsFixed(0));
    DateTime paymentPeriod = DateTime(DateTime.now().year, DateTime.now().month, 1);

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Text('Выставить счет: $studentName', style: const TextStyle(color: Colors.white)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Сумма', style: TextStyle(color: Colors.grey, fontSize: 12)),
                const SizedBox(height: 4),
                TextField(
                  controller: amountController,
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: const Color(0xFF2D323B),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    prefixIcon: const Icon(Icons.attach_money, color: Colors.green),
                    suffixText: 'MDL',
                    suffixStyle: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 16),
                InkWell(
                  onTap: () async {
                    await _showMonthYearPicker(context, paymentPeriod, (selectedDate) {
                      setDialogState(() {
                        paymentPeriod = DateTime(selectedDate.year, selectedDate.month, 1);
                      });
                    });
                  },
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'За месяц',
                      labelStyle: const TextStyle(color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF2D323B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      prefixIcon: const Icon(Icons.calendar_month, color: Colors.orange),
                    ),
                    child: Text(
                      _getMonthName(paymentPeriod),
                      style: const TextStyle(color: Colors.white),
                    ),
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
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                final amount = double.tryParse(amountController.text);
                if (amount == null || amount <= 0) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Введите корректную сумму')),
                  );
                  return;
                }
                try {
                  final period = paymentPeriod.toIso8601String().split('T')[0];
                  await _apiService.invoiceStudent(studentId, period, amount);
                  if (mounted) {
                    Navigator.pop(context);
                    _loadData();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('✅ Счет выставлен!'),
                        backgroundColor: Colors.green,
                      ),
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
              child: const Text('Выставить счет'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text('Ошибка: $_error', style: const TextStyle(color: Colors.white)),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadData,
            child: const Text('Повторить'),
          ),
        ],
      ),
    );
  }

  // ==================== PARENT VIEW ====================
  Widget _buildParentView() {
    final hasDebt = _paymentStatus?['has_debt'] ?? false;
    final totalPending = (_paymentStatus?['total_pending'] ?? 0).toDouble();
    final children = _paymentStatus?['children'] as List<dynamic>? ?? [];

    return RefreshIndicator(
      onRefresh: _loadData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Debt Status Card
            _buildDebtStatusCard(hasDebt, totalPending),
            const SizedBox(height: 20),
            
            // Children with payment status
            if (children.isNotEmpty) ...[  
              const Text(
                'Дети',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              ...children.map((child) => _buildChildPaymentCard(child)),
            ],
            
            const SizedBox(height: 20),
            
            // My Debts List
            if (_myDebts.isNotEmpty) ...[  
              const Text(
                'Ожидающие оплаты',
                style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              ...(_myDebts.map((debt) => _buildDebtCard(debt))),
            ],
            
            const SizedBox(height: 20),
            
            // Payment History
            const Text(
              'История платежей',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            if (_payments.isEmpty)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('Нет платежей', style: TextStyle(color: Colors.grey)),
                ),
              )
            else
              ..._payments.take(10).map((p) => _buildPaymentCard(p, isParent: true)),
          ],
        ),
      ),
    );
  }

  Widget _buildDebtStatusCard(bool hasDebt, double totalPending) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: hasDebt
              ? [const Color(0xFFC62828), const Color(0xFFD32F2F)]
              : [const Color(0xFF2E7D32), const Color(0xFF388E3C)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: (hasDebt ? Colors.red : Colors.green).withOpacity(0.3),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              hasDebt ? Icons.warning_rounded : Icons.check_circle,
              color: Colors.white,
              size: 32,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasDebt ? 'Есть долг' : 'Оплачено, долга нет',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (hasDebt) ...[  
                  const SizedBox(height: 4),
                  Text(
                    'Сумма: ${totalPending.toStringAsFixed(0)} MDL',
                    style: const TextStyle(color: Colors.white70, fontSize: 16),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChildPaymentCard(dynamic child) {
    final studentName = child['student_name'] ?? 'Ученик';
    final hasPending = child['has_pending'] ?? false;
    final pendingAmount = (child['pending_amount'] ?? 0).toDouble();
    final groupName = child['group_name'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasPending ? Colors.orange.withOpacity(0.5) : Colors.green.withOpacity(0.5),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: hasPending ? Colors.orange.withOpacity(0.2) : Colors.green.withOpacity(0.2),
            child: Icon(
              hasPending ? Icons.access_time : Icons.check,
              color: hasPending ? Colors.orange : Colors.green,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  studentName,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                ),
                if (groupName.isNotEmpty)
                  Text(groupName, style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
          ),
          if (hasPending)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${pendingAmount.toStringAsFixed(0)} MDL',
                style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.bold),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text(
                'Оплачено',
                style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDebtCard(dynamic debt) {
    final studentName = debt['student_name'] ?? 'Ученик';
    final amount = (debt['amount'] ?? 0).toDouble();
    final period = debt['payment_period'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          const Icon(Icons.receipt_long, color: Colors.red),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(studentName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text('За: $period', style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
          ),
          Text(
            '${amount.toStringAsFixed(0)} MDL',
            style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 16),
          ),
        ],
      ),
    );
  }

  // ==================== ADMIN VIEW ====================
  Widget _buildAdminView(double total) {
    return TabBarView(
      controller: _tabController,
      children: [
        // Tab 1: Pending Payments
        _buildPendingPaymentsTab(),
        // Tab 2: Debtors
        _buildDebtorsTab(),
        // Tab 3: History (Completed)
        _buildHistoryTab(),
        // Tab 4: All Payments
        _buildAllPaymentsTab(total),
      ],
    );
  }

  Widget _buildDebtorsTab() {
    if (_debtors.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          children: const [
            SizedBox(height: 100),
            Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_outline, size: 64, color: Colors.green),
                  SizedBox(height: 16),
                  Text('Нет должников', style: TextStyle(fontSize: 18, color: Colors.grey)),
                  Text('Все платежи внесены вовремя!', style: TextStyle(color: Colors.green)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: Column(
        children: [
          // Summary card
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFE65100), Color(0xFFFF8F00)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.orange.withOpacity(0.3),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Всего должников', style: TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 4),
                    Text('${_debtors.length} учеников', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('Общий долг', style: TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 4),
                    Text(
                      '${_totalDebtAmount.toStringAsFixed(0)} MDL',
                      style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Debtors list
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _debtors.length,
              itemBuilder: (context, index) {
                final debtor = _debtors[index];
                final studentId = debtor['student_id'] as int;
                final studentName = debtor['student_name'] ?? 'Ученик';
                final groupName = debtor['group_name'] ?? '';
                final daysOverdue = debtor['days_overdue'] ?? 0;
                final monthsUnpaid = debtor['months_unpaid'] ?? 1;
                final totalDebt = (debtor['total_debt'] ?? 0).toDouble();
                final monthlyFee = (debtor['monthly_fee'] ?? 0).toDouble();
                final parentPhone = debtor['parent_phone'] ?? '';
                final guardians = debtor['guardians'] as List<dynamic>? ?? [];

                // Get first guardian phone if available
                String contactPhone = parentPhone;
                if (contactPhone.isEmpty && guardians.isNotEmpty) {
                  contactPhone = guardians[0]['phone'] ?? '';
                }

                return Card(
                  color: const Color(0xFF2D323B),
                  margin: const EdgeInsets.only(bottom: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Header row
                        Row(
                          children: [
                            CircleAvatar(
                              backgroundColor: Colors.orange.withOpacity(0.2),
                              child: const Icon(Icons.warning_amber, color: Colors.orange),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    studentName,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                                  ),
                                  if (groupName.isNotEmpty)
                                    Text(groupName, style: TextStyle(color: Colors.grey[400], fontSize: 12)),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: daysOverdue > 14 ? Colors.red.withOpacity(0.2) : Colors.orange.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                '$daysOverdue дн.',
                                style: TextStyle(
                                  color: daysOverdue > 14 ? Colors.red : Colors.orange,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        
                        // Debt details
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1C2127),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              Column(
                                children: [
                                  Text('Неоплачено', style: TextStyle(color: Colors.grey[500], fontSize: 11)),
                                  Text('$monthsUnpaid мес.', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                                ],
                              ),
                              Container(width: 1, height: 30, color: Colors.grey[700]),
                              Column(
                                children: [
                                  Text('Тариф', style: TextStyle(color: Colors.grey[500], fontSize: 11)),
                                  Text('${monthlyFee.toStringAsFixed(0)} MDL', style: const TextStyle(color: Colors.white)),
                                ],
                              ),
                              Container(width: 1, height: 30, color: Colors.grey[700]),
                              Column(
                                children: [
                                  Text('Долг', style: TextStyle(color: Colors.grey[500], fontSize: 11)),
                                  Text(
                                    '${totalDebt.toStringAsFixed(0)} MDL',
                                    style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),

                        // Contact & Action row
                        Row(
                          children: [
                            if (contactPhone.isNotEmpty)
                              Expanded(
                                child: Text(
                                  '📞 $contactPhone',
                                  style: TextStyle(color: Colors.grey[400], fontSize: 13),
                                ),
                              ),
                            if (contactPhone.isEmpty)
                              const Expanded(child: SizedBox()),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.orange,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              ),
                              onPressed: () => _showInvoiceStudentDialog(studentId, studentName, monthlyFee),
                              icon: const Icon(Icons.receipt_long, size: 18),
                              label: const Text('Выставить счет'),
                            ),
                          ],
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

  Widget _buildPendingPaymentsTab() {
    if (_pendingPayments.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 64, color: Colors.green),
            SizedBox(height: 16),
            Text('Нет ожидающих оплат', style: TextStyle(fontSize: 18, color: Colors.grey)),
            Text('Все оплачено!', style: TextStyle(color: Colors.green)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _pendingPayments.length,
        itemBuilder: (context, index) {
          final payment = _pendingPayments[index];
          final paymentId = payment['id'] as int;
          final studentName = payment['student_name'] ?? 'Ученик';
          final groupName = payment['group_name'] ?? '';
          final amount = (payment['amount'] ?? 0).toDouble();
          final period = payment['payment_period'] ?? '';

          return Card(
            color: const Color(0xFF2D323B),
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: Colors.orange.withOpacity(0.2),
                child: const Icon(Icons.access_time, color: Colors.orange),
              ),
              title: Text(studentName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (groupName.isNotEmpty)
                    Text(groupName, style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  Text('За: $period', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${amount.toStringAsFixed(0)} MDL',
                    style: const TextStyle(color: Colors.orange, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    onPressed: () => _confirmPayment(paymentId),
                    child: const Text('Провести'),
                  ),
                ],
              ),
              isThreeLine: groupName.isNotEmpty,
            ),
          );
        },
      ),
    );
  }

  Widget _buildHistoryTab() {
    final completedPayments = _payments.where((p) => p.status == 'completed').toList();
    
    if (completedPayments.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text('Нет проведенных платежей', style: TextStyle(fontSize: 18, color: Colors.grey)),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: completedPayments.length,
        itemBuilder: (context, index) => _buildPaymentCard(completedPayments[index], isParent: false),
      ),
    );
  }

  Widget _buildAllPaymentsTab(double total) {
    return Column(
      children: [
        // Summary card
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF1B5E20), Color(0xFF2E7D32)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.green.withOpacity(0.3),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Всего платежей', style: TextStyle(color: Colors.white70, fontSize: 14)),
                  const SizedBox(height: 4),
                  Text('${_filteredPayments.length} платежей', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                ],
              ),
              Text(
                '${total.toStringAsFixed(0)} MDL',
                style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),

        // Status Filters
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _FilterChip(
                  label: 'Все (${_payments.length})',
                  isSelected: _statusFilter == 'all',
                  onTap: () => setState(() { _statusFilter = 'all'; _applyFilter(); }),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '✅ Оплачено (${_payments.where((p) => p.status == 'completed').length})',
                  isSelected: _statusFilter == 'completed',
                  onTap: () => setState(() { _statusFilter = 'completed'; _applyFilter(); }),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: '⏳ Ожидает (${_payments.where((p) => p.status == 'pending').length})',
                  isSelected: _statusFilter == 'pending',
                  onTap: () => setState(() { _statusFilter = 'pending'; _applyFilter(); }),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),

        // Search bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextField(
            controller: _searchController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: '🔍 Поиск...',
              hintStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.search, color: Colors.grey),
              filled: true,
              fillColor: const Color(0xFF2D323B),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
            onChanged: (value) => setState(() { _searchQuery = value; _applyFilter(); }),
          ),
        ),
        const SizedBox(height: 8),

        // Payments list
        Expanded(
          child: _filteredPayments.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.payment_outlined, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text('Нет платежей', style: TextStyle(fontSize: 18, color: Colors.grey)),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _loadData,
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _filteredPayments.length,
                    itemBuilder: (context, index) => _buildPaymentCard(_filteredPayments[index], isParent: false),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildPaymentCard(Payment payment, {required bool isParent}) {
    return Card(
      color: const Color(0xFF2D323B),
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: _getStatusColor(payment.status).withOpacity(0.2),
          child: Icon(
            _getMethodIcon(payment.method),
            color: _getStatusColor(payment.status),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                payment.studentName ?? 'Ученик #${payment.studentId}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _getStatusColor(payment.status).withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: _getStatusColor(payment.status).withOpacity(0.5),
                  width: 1,
                ),
              ),
              child: Text(
                payment.statusDisplayName,
                style: TextStyle(
                  fontSize: 10,
                  color: _getStatusColor(payment.status),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text('За: ${payment.formattedPeriod}', style: TextStyle(color: Colors.grey[400])),
            Text(
              '${payment.methodDisplayName} • ${payment.paymentDate}',
              style: TextStyle(color: Colors.grey[500], fontSize: 12),
            ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              payment.formattedAmount,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: _getStatusColor(payment.status),
              ),
            ),
            if (!isParent)
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                onPressed: () => _deletePayment(payment),
              ),
          ],
        ),
        isThreeLine: true,
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF1B5E20) : Colors.grey.shade200,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? const Color(0xFF1B5E20) : Colors.grey.shade400,
            width: 1.5,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : Colors.black87,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
