import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/student.dart';
import '../../models/group.dart';
import '../../l10n/app_localizations.dart';
import '../../config/api_config.dart';

class StudentCardDialog extends StatefulWidget {
  final int studentId;

  const StudentCardDialog({super.key, required this.studentId});

  @override
  State<StudentCardDialog> createState() => _StudentCardDialogState();
}

class _StudentCardDialogState extends State<StudentCardDialog> {
  final ApiService _apiService = ApiService();
  bool _isLoading = true;
  Student? _student;
  double _totalPaid = 0;
  List<Map<String, dynamic>> _payments = [];
  final List<Map<String, dynamic>> _groupHistory = [];
  List<Group> _allGroups = [];
  Group? _selectedGroup;
  bool _showPaymentHistory = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      // Load student
      final studentData = await _apiService.getStudent(widget.studentId);
      final student = Student.fromJson(studentData);
      
      // Load payments
      final paymentsData = await _apiService.getPayments(studentId: widget.studentId);
      double total = 0;
      for (var p in paymentsData) {
        total += (p['amount'] ?? 0).toDouble();
      }
      
      // Load history (mock or real)
      // We haven't implemented getHistory endpoint in ApiService yet, so we'll skip or try to fetch
      // For now, let's just fetch groups for transfer functionality
      final groupsData = await _apiService.getGroups();
      final groups = groupsData.map((g) => Group.fromJson(g)).toList();
      
      setState(() {
        _student = student;
        _totalPaid = total;
        _payments = List<Map<String, dynamic>>.from(paymentsData);
        _allGroups = groups;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _transferStudent() async {
    if (_selectedGroup == null || _student == null) return;
    
    try {
      await _apiService.transferStudent(_student!.id, _selectedGroup!.id);
      Navigator.pop(context, true); // Return true to refresh parent
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    
    if (_isLoading) {
      return const AlertDialog(
        content: SizedBox(
          height: 100,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    
    if (_student == null) {
      return const AlertDialog(content: Text("Error loading student"));
    }

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: 500,
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                CircleAvatar(
                  radius: 40,
                  backgroundImage: _student!.avatarUrl != null
                      ? NetworkImage('${ApiConfig.baseUrl}${_student!.avatarUrl}')
                      : null,
                  child: _student!.avatarUrl == null
                      ? Text(
                          _student!.firstName[0],
                          style: const TextStyle(fontSize: 30),
                        )
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _student!.fullName,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${l10n.translate('date_of_birth')}: ${_student!.dob}',
                        style: const TextStyle(color: Colors.grey),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _student!.isDebtor ? Colors.red : Colors.green,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _student!.isDebtor ? l10n.translate('debtor') : 'OK',
                          style: const TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const Divider(height: 32),
            
            // Info Blocks
            Row(
              children: [
                Expanded(
                  child: _InfoBlock(
                    label: l10n.translate('group'),
                    value: _student!.groupName ?? l10n.translate('no_group'),
                    icon: Icons.group,
                  ),
                ),
                Expanded(
                  child: _InfoBlock(
                    label: l10n.translate('total_paid'),
                    value: '${_totalPaid.toInt()} MDL',
                    valueColor: Colors.green,
                    icon: Icons.monetization_on,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            // Parent Link
            InkWell(
              onTap: () {
                // Navigate to parent profile
                // For now just show a toast as we don't have parent profile screen ready for admin
                ScaffoldMessenger.of(context).showSnackBar(
                   const SnackBar(content: Text("Parent profile navigation")),
                );
              },
              child: Row(
                children: [
                  const Icon(Icons.family_restroom, color: Colors.blue),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.translate('parent_phone'),
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      Text(
                        _student!.parentPhone ?? '-',
                        style: const TextStyle(
                          color: Colors.blue,
                          fontWeight: FontWeight.bold,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            const Divider(height: 32),
            
            // Payment History Section
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.translate('payment_history_title'),
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                TextButton.icon(
                  onPressed: () => setState(() => _showPaymentHistory = !_showPaymentHistory),
                  icon: Icon(_showPaymentHistory ? Icons.expand_less : Icons.expand_more),
                  label: Text(_showPaymentHistory ? l10n.translate('hide') : '${l10n.translate('show')} (${_payments.length})'),
                ),
              ],
            ),
            
            // Payment Summary
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '${_totalPaid.toInt()} MDL',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.green),
                        ),
                        Text(l10n.translate('total_paid_label'), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '${_payments.length}',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.blue),
                        ),
                        Text(l10n.translate('payments_count'), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            
            // Payment History List (Collapsible)
            if (_showPaymentHistory) ...[
              const SizedBox(height: 12),
              Container(
                constraints: const BoxConstraints(maxHeight: 200),
                child: _payments.isEmpty
                    ? Center(child: Text(l10n.translate('no_payments_status'), style: const TextStyle(color: Colors.grey)))
                    : ListView.builder(
                        shrinkWrap: true,
                        itemCount: _payments.length,
                        itemBuilder: (context, index) {
                          final payment = _payments[index];
                          final paymentPeriod = payment['payment_period'];
                          String monthName = '-';
                          if (paymentPeriod != null) {
                            try {
                              final date = DateTime.parse(paymentPeriod.toString());
                              final monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                              final localizedMonth = l10n.translate(monthKeys[date.month - 1]);
                              monthName = '$localizedMonth ${date.year}';
                            } catch (_) {}
                          }
                          final status = payment['status'] ?? 'completed';
                          final statusColor = status == 'completed' ? Colors.green : 
                                             status == 'pending' ? Colors.orange : Colors.red;
                          
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              dense: true,
                              leading: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: statusColor.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Icon(Icons.payment, color: statusColor, size: 20),
                              ),
                              title: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    '${(payment['amount'] ?? 0).toInt()} MDL',
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.blue.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      '${l10n.translate('for_month')} $monthName',
                                      style: const TextStyle(fontSize: 11, color: Colors.blue),
                                    ),
                                  ),
                                ],
                              ),
                              subtitle: Row(
                                children: [
                                  Text('📅 ${payment['payment_date']?.toString().split('T')[0] ?? "-"}'),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                    decoration: BoxDecoration(
                                      color: statusColor.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      status == 'completed' ? '✓' : status == 'pending' ? '⏳' : '✗',
                                      style: TextStyle(fontSize: 10, color: statusColor),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ],
            
            const Divider(height: 32),
            
            // Transfer Action
            Text(
              l10n.translate('transfer_student'),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<Group>(
                    initialValue: _selectedGroup,
                    decoration: InputDecoration(
                      labelText: l10n.translate('select_new_group'),
                      border: const OutlineInputBorder(),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    items: _allGroups.map((g) {
                      return DropdownMenuItem(
                        value: g,
                        child: Text(g.name),
                      );
                    }).toList(),
                    onChanged: (val) => setState(() => _selectedGroup = val),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _selectedGroup != null && _selectedGroup!.id != _student!.groupId 
                      ? _transferStudent 
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  ),
                  child: Text(l10n.translate('transfer')),
                ),
              ],
            ),
            
            // Group History (Placeholder)
            /*
            const SizedBox(height: 16),
            Text(l10n.translate('group_history'), style: TextStyle(fontWeight: FontWeight.bold)),
            ...
            */
          ],
        ),
      ),
    );
  }
}

class _InfoBlock extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  const _InfoBlock({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 16, color: Colors.grey),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: valueColor ?? Colors.black87,
          ),
        ),
      ],
    );
  }
}
