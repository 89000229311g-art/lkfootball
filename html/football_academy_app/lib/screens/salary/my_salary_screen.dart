import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

const List<String> _months = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const Map<String, String> _salaryTypes = {
  'fixed': 'Фикс. оклад',
  'per_student': 'За ученика',
  'per_training': 'За тренировку',
  'combined': 'Оклад + бонусы'
};

const Map<String, String> _paymentTypes = {
  'advance': 'Аванс',
  'salary': 'Зарплата',
  'bonus': 'Премия',
  'deduction': 'Вычет'
};

class MySalaryScreen extends StatefulWidget {
  const MySalaryScreen({super.key});

  @override
  State<MySalaryScreen> createState() => _MySalaryScreenState();
}

class _MySalaryScreenState extends State<MySalaryScreen> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  
  List<dynamic> _payments = [];
  Map<String, dynamic>? _contract;
  Map<String, dynamic>? _currentCalc;
  int _selectedYear = DateTime.now().year;
  
  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    try {
      final user = context.read<AuthProvider>().user;
      if (user == null) return;
      
      // Load data in parallel
      final results = await Future.wait([
        _apiService.getMySalaryPayments(),
        _apiService.getSalaryContracts(userId: user.id, activeOnly: true),
        _apiService.calculateSalary(user.id, _selectedYear, DateTime.now().month).catchError((_) => <String, dynamic>{}),
      ]);
      
      final paymentsRes = results[0] as Map<String, dynamic>;
      final contractsRes = results[1] as List<dynamic>;
      final calcRes = results[2] as Map<String, dynamic>;
      
      setState(() {
        _payments = paymentsRes['data'] ?? [];
        _contract = contractsRes.isNotEmpty ? contractsRes[0] : null;
        _currentCalc = calcRes.isNotEmpty ? calcRes : null;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading salary data: $e');
      setState(() => _isLoading = false);
    }
  }

  // Group payments by year and month
  Map<String, Map<String, dynamic>> _groupPayments() {
    final grouped = <String, Map<String, dynamic>>{};
    for (var payment in _payments) {
      final key = '${payment['period_year']}-${payment['period_month'].toString().padLeft(2, '0')}';
      if (!grouped.containsKey(key)) {
        grouped[key] = {
          'year': payment['period_year'],
          'month': payment['period_month'],
          'payments': <dynamic>[],
        };
      }
      (grouped[key]!['payments'] as List<dynamic>).add(payment);
    }
    return grouped;
  }

  // Calculate totals for selected year
  Map<String, double> _calculateYearTotals() {
    final yearPayments = _payments.where((p) => p['period_year'] == _selectedYear);
    return {
      'advance': yearPayments.where((p) => p['payment_type'] == 'advance').fold(0.0, (sum, p) => sum + (p['amount'] ?? 0)),
      'salary': yearPayments.where((p) => p['payment_type'] == 'salary').fold(0.0, (sum, p) => sum + (p['amount'] ?? 0)),
      'bonus': yearPayments.where((p) => p['payment_type'] == 'bonus').fold(0.0, (sum, p) => sum + (p['amount'] ?? 0)),
      'deduction': yearPayments.where((p) => p['payment_type'] == 'deduction').fold(0.0, (sum, p) => sum + (p['amount'] ?? 0)),
    };
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F1117),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFFFFC107)),
        ),
      );
    }

    final totals = _calculateYearTotals();
    final totalYear = totals['advance']! + totals['salary']! + totals['bonus']! - totals['deduction']!;
    final groupedPayments = _groupPayments();
    final sortedPeriods = groupedPayments.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));

    return Scaffold(
      backgroundColor: const Color(0xFF0F1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1E24),
        title: const Text('Моя зарплата', style: TextStyle(color: Colors.white)),
        actions: [
          // Year selector
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 8),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                value: _selectedYear,
                dropdownColor: const Color(0xFF1C1E24),
                style: const TextStyle(color: Colors.white),
                icon: const Icon(Icons.arrow_drop_down, color: Colors.white),
                items: [2024, 2025, 2026, 2027].map((y) => 
                  DropdownMenuItem(value: y, child: Text('$y'))
                ).toList(),
                onChanged: (y) {
                  if (y != null) {
                    setState(() => _selectedYear = y);
                    _loadData();
                  }
                },
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: const Color(0xFFFFC107),
        onRefresh: _loadData,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Contract Info Card
              _buildContractCard(),
              const SizedBox(height: 16),
              
              // Current Month Calculation
              if (_currentCalc != null && _currentCalc!.isNotEmpty)
                _buildCurrentCalcCard(),
              
              const SizedBox(height: 16),
              
              // Year Summary Cards
              _buildYearSummary(totals, totalYear),
              
              const SizedBox(height: 24),
              
              // Payment History
              _buildPaymentHistory(sortedPeriods),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContractCard() {
    if (_contract == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.1),
          border: Border.all(color: Colors.red.withOpacity(0.3)),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          children: [
            const Icon(Icons.warning, color: Colors.red, size: 32),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Контракт не найден', style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('Обратитесь к руководителю', style: TextStyle(color: Colors.grey[400], fontSize: 14)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    final advanceDay = _contract!['advance_day'] ?? 25;
    final salaryDay = _contract!['salary_day'] ?? 10;
    final advancePercent = _contract!['advance_percent'] ?? 40;
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.green.withOpacity(0.2), Colors.green.withOpacity(0.05)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Colors.green.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 24),
              const SizedBox(width: 8),
              const Text('Контракт активен', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 24,
            runSpacing: 12,
            children: [
              _buildContractItem('Тип', _salaryTypes[_contract!['salary_type']] ?? _contract!['salary_type']),
              if (_contract!['salary_type'] == 'fixed' || _contract!['salary_type'] == 'combined')
                _buildContractItem('Оклад', '${_contract!['base_salary']?.toStringAsFixed(0)} MDL'),
              if (_contract!['salary_type'] == 'per_student' || _contract!['salary_type'] == 'combined')
                _buildContractItem('За ученика', '${_contract!['per_student_rate']?.toStringAsFixed(0)} MDL'),
              if (_contract!['salary_type'] == 'per_training' || _contract!['salary_type'] == 'combined')
                _buildContractItem('За тренировку', '${_contract!['per_training_rate']?.toStringAsFixed(0)} MDL'),
              _buildContractItem('Аванс', '$advancePercent% ($advanceDay числа)'),
              _buildContractItem('ЗП', '${100 - advancePercent}% ($salaryDay числа)'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildContractItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: Colors.grey[500], fontSize: 12)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _buildCurrentCalcCard() {
    final currentMonth = DateTime.now().month;
    
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.purple.withOpacity(0.1),
        border: Border.all(color: Colors.purple.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.analytics, color: Colors.purple, size: 24),
              const SizedBox(width: 8),
              Text('Текущий месяц (${_months[currentMonth]})', 
                style: const TextStyle(color: Colors.purple, fontWeight: FontWeight.bold, fontSize: 16)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildStatBox(
                  '${_currentCalc!['calculated_salary']?.toStringAsFixed(0) ?? 0} MDL',
                  'Расчётная ЗП',
                  Colors.purple,
                ),
              ),
              if ((_currentCalc!['students_count'] ?? 0) > 0) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatBox(
                    '${_currentCalc!['students_count']}',
                    'Учеников',
                    Colors.blue,
                  ),
                ),
              ],
              if ((_currentCalc!['trainings_count'] ?? 0) > 0) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: _buildStatBox(
                    '${_currentCalc!['trainings_count']}',
                    'Тренировок',
                    Colors.cyan,
                  ),
                ),
              ],
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatBox(
                  '${_currentCalc!['paid_amount']?.toStringAsFixed(0) ?? 0} MDL',
                  'Выплачено',
                  Colors.green,
                ),
              ),
            ],
          ),
          
          // Next payment indicator
          if (_contract != null) ...[
            const SizedBox(height: 16),
            _buildNextPaymentIndicator(),
          ],
        ],
      ),
    );
  }

  Widget _buildStatBox(String value, String label, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 11)),
        ],
      ),
    );
  }

  Widget _buildNextPaymentIndicator() {
    final today = DateTime.now();
    final currentDay = today.day;
    final advanceDay = _contract!['advance_day'] ?? 25;
    final salaryDay = _contract!['salary_day'] ?? 10;
    
    String nextType;
    int nextDay;
    int nextMonth;
    
    if (currentDay < advanceDay) {
      nextType = 'Аванс';
      nextDay = advanceDay;
      nextMonth = today.month;
    } else {
      nextType = 'Зарплата';
      nextDay = salaryDay;
      nextMonth = today.month + 1;
      if (nextMonth > 12) nextMonth = 1;
    }
    
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFC107).withOpacity(0.1),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.calendar_today, color: Color(0xFFFFC107)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Следующая выплата: $nextType', 
                  style: const TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.w500)),
                Text('$nextDay ${_months[nextMonth]}', 
                  style: TextStyle(color: Colors.grey[400], fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildYearSummary(Map<String, double> totals, double totalYear) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Итого за $_selectedYear', 
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildSummaryCard('${totals['advance']!.toStringAsFixed(0)} MDL', 'Авансы', Colors.blue),
              const SizedBox(width: 12),
              _buildSummaryCard('${totals['salary']!.toStringAsFixed(0)} MDL', 'Зарплаты', Colors.green),
              const SizedBox(width: 12),
              _buildSummaryCard('${totals['bonus']!.toStringAsFixed(0)} MDL', 'Премии', Colors.purple),
              const SizedBox(width: 12),
              _buildSummaryCard('${totals['deduction']!.toStringAsFixed(0)} MDL', 'Вычеты', Colors.red),
              const SizedBox(width: 12),
              _buildSummaryCard('${totalYear.toStringAsFixed(0)} MDL', 'Всего', const Color(0xFFFFC107)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSummaryCard(String value, String label, Color color) {
    return Container(
      width: 110,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        border: Border.all(color: color.withOpacity(0.3)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(color: color, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(label, style: TextStyle(color: Colors.grey[400], fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildPaymentHistory(List<MapEntry<String, Map<String, dynamic>>> sortedPeriods) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('История выплат', 
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        
        if (sortedPeriods.isEmpty)
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Column(
                children: [
                  const Text('💸', style: TextStyle(fontSize: 48)),
                  const SizedBox(height: 8),
                  Text('Нет выплат', style: TextStyle(color: Colors.grey[500])),
                ],
              ),
            ),
          )
        else
          ...sortedPeriods.map((entry) => _buildPeriodCard(entry.value)),
      ],
    );
  }

  Widget _buildPeriodCard(Map<String, dynamic> period) {
    final payments = period['payments'] as List<dynamic>;
    final total = payments.fold<double>(0, (sum, p) => 
      sum + (p['payment_type'] == 'deduction' ? -(p['amount'] ?? 0) : (p['amount'] ?? 0)));

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          // Period Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${_months[period['month']]} ${period['year']}',
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500)),
                Text('${total.toStringAsFixed(0)} MDL',
                  style: const TextStyle(color: Colors.green, fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          
          // Payments List
          ...payments.map((p) => _buildPaymentItem(p)),
        ],
      ),
    );
  }

  Widget _buildPaymentItem(dynamic payment) {
    final isDeduction = payment['payment_type'] == 'deduction';
    final color = payment['payment_type'] == 'advance' ? Colors.blue :
                  payment['payment_type'] == 'salary' ? Colors.green :
                  payment['payment_type'] == 'bonus' ? Colors.purple : Colors.red;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: Row(
        children: [
          // Payment Type Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              _paymentTypes[payment['payment_type']] ?? payment['payment_type'],
              style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ),
          const SizedBox(width: 12),
          
          // Date
          Text(
            _formatDate(payment['payment_date']),
            style: TextStyle(color: Colors.grey[400], fontSize: 13),
          ),
          
          // Description if exists
          if (payment['description'] != null && payment['description'].toString().isNotEmpty) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                payment['description'],
                style: TextStyle(color: Colors.grey[500], fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ] else
            const Spacer(),
          
          // Amount
          Text(
            '${isDeduction ? '-' : '+'}${payment['amount']?.toStringAsFixed(0)} MDL',
            style: TextStyle(
              color: isDeduction ? Colors.red : Colors.green,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}';
    } catch (e) {
      return dateStr;
    }
  }
}
