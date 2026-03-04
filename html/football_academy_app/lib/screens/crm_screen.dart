import 'package:flutter/material.dart';
import '../models/lead.dart';
import '../services/crm_service.dart';
import 'package:intl/intl.dart';

class CrmScreen extends StatefulWidget {
  const CrmScreen({Key? key}) : super(key: key);

  @override
  _CrmScreenState createState() => _CrmScreenState();
}

class _CrmScreenState extends State<CrmScreen> with SingleTickerProviderStateMixin {
  final CrmService _crmService = CrmService();
  late TabController _tabController;
  bool _isLoading = false;
  List<Lead> _leads = [];

  final List<String> _statuses = [
    'new',
    'call',
    'trial',
    'offer',
    'deal',
    'success',
    'reject'
  ];

  final Map<String, String> _statusLabels = {
    'new': 'Новый',
    'call': 'Звонок',
    'trial': 'Пробное',
    'offer': 'Оффер',
    'deal': 'Сделка',
    'success': 'Успех',
    'reject': 'Отказ',
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _statuses.length, vsync: this);
    _loadLeads();
  }

  Future<void> _loadLeads() async {
    setState(() => _isLoading = true);
    try {
      final leads = await _crmService.getLeads();
      setState(() {
        _leads = leads;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка загрузки лидов: $e')),
      );
    }
  }

  List<Lead> _getLeadsByStatus(String status) {
    return _leads.where((l) => l.status == status).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CRM'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: _statuses.map((status) => Tab(text: _statusLabels[status])).toList(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadLeads,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: _statuses.map((status) {
                final leads = _getLeadsByStatus(status);
                return RefreshIndicator(
                  onRefresh: _loadLeads,
                  child: leads.isEmpty
                      ? const Center(child: Text('Нет лидов в этом статусе'))
                      : ListView.builder(
                          itemCount: leads.length,
                          itemBuilder: (context, index) {
                            final lead = leads[index];
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              child: ListTile(
                                title: Text(lead.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(lead.phone),
                                    if (lead.notes != null && lead.notes!.isNotEmpty)
                                      Text(lead.notes!, maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ],
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => _showLeadDetails(lead),
                              ),
                            );
                          },
                        ),
                );
              }).toList(),
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddLeadDialog,
        child: const Icon(Icons.add),
      ),
    );
  }

  void _showLeadDetails(Lead lead) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (context, scrollController) => Container(
          padding: const EdgeInsets.all(16),
          child: ListView(
            controller: scrollController,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(lead.name, style: Theme.of(context).textTheme.headlineSmall)),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _buildDetailRow('Телефон', lead.phone, icon: Icons.phone),
              if (lead.age != null) _buildDetailRow('Возраст', '${lead.age} лет', icon: Icons.cake),
              if (lead.source != null) _buildDetailRow('Источник', lead.source!, icon: Icons.source),
              const SizedBox(height: 24),
              const Text('Статус', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _statuses.map((status) {
                  return ChoiceChip(
                    label: Text(_statusLabels[status]!),
                    selected: lead.status == status,
                    onSelected: (selected) {
                      if (selected) {
                        _updateLeadStatus(lead.id, status);
                        Navigator.pop(context);
                      }
                    },
                  );
                }).toList(),
              ),
              const SizedBox(height: 24),
              const Text('Заметки', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey[100],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Text(
                  lead.notes?.isNotEmpty == true ? lead.notes! : 'Нет заметок',
                  style: const TextStyle(fontSize: 14),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  _showEditLeadDialog(lead);
                },
                icon: const Icon(Icons.edit),
                label: const Text('Редактировать'),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () => _confirmDeleteLead(lead),
                icon: const Icon(Icons.delete, color: Colors.red),
                label: const Text('Удалить', style: TextStyle(color: Colors.red)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDetailRow(String label, String value, {IconData? icon}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          if (icon != null) ...[Icon(icon, size: 20, color: Colors.grey), const SizedBox(width: 12)],
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
              Text(value, style: const TextStyle(fontSize: 16)),
            ],
          ),
        ],
      ),
    );
  }

  void _showEditLeadDialog(Lead lead) {
    final nameController = TextEditingController(text: lead.name);
    final phoneController = TextEditingController(text: lead.phone);
    final ageController = TextEditingController(text: lead.age?.toString() ?? '');
    final sourceController = TextEditingController(text: lead.source ?? '');
    final notesController = TextEditingController(text: lead.notes ?? '');

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Редактировать лид'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Имя')),
              TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Телефон')),
              TextField(controller: ageController, decoration: const InputDecoration(labelText: 'Возраст'), keyboardType: TextInputType.number),
              TextField(controller: sourceController, decoration: const InputDecoration(labelText: 'Источник')),
              TextField(controller: notesController, decoration: const InputDecoration(labelText: 'Заметки'), maxLines: 3),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          ElevatedButton(
            onPressed: () async {
              try {
                // Prepare update data
                // Note: The API might expect specific fields. 
                // Based on previous knowledge, update usually takes a map.
                // We'll need to check crm_service.dart update method.
                // Assuming updateLead(id, data) exists.
                // If not, we might need to add it.
                // Let's assume updateLeadStatus is specific, and we need a general update.
                // I'll check crm_service.dart in a moment.
                // For now, I'll invoke a hypothetical _updateLead method.
                await _crmService.updateLead(lead.id, {
                  'name': nameController.text,
                  'phone': phoneController.text,
                  'age': int.tryParse(ageController.text),
                  'source': sourceController.text,
                  'notes': notesController.text,
                });
                Navigator.pop(context);
                _loadLeads();
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
              }
            },
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDeleteLead(Lead lead) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить лид?'),
        content: Text('Вы уверены, что хотите удалить ${lead.name}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Удалить', style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _crmService.deleteLead(lead.id);
        Navigator.pop(context); // Close details
        _loadLeads();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка удаления: $e')));
      }
    }
  }

  Future<void> _updateLeadStatus(int id, String status) async {
    try {
      await _crmService.updateLeadStatus(id, status);
      _loadLeads();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка обновления статуса: $e')),
      );
    }
  }

  void _showAddLeadDialog() {
    final nameController = TextEditingController();
    final phoneController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Новый лид'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Имя')),
            TextField(controller: phoneController, decoration: const InputDecoration(labelText: 'Телефон')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Отмена')),
          ElevatedButton(
            onPressed: () async {
              if (nameController.text.isNotEmpty && phoneController.text.isNotEmpty) {
                try {
                  await _crmService.createLead({
                    'name': nameController.text,
                    'phone': phoneController.text,
                    'status': 'new',
                  });
                  Navigator.pop(context);
                  _loadLeads();
                } catch (e) {
                  // Handle error
                }
              }
            },
            child: const Text('Создать'),
          ),
        ],
      ),
    );
  }
}
