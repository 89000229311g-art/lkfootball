import 'package:flutter/material.dart';
import '../models/campaign.dart';
import '../services/marketing_service.dart';

class MarketingScreen extends StatefulWidget {
  const MarketingScreen({Key? key}) : super(key: key);

  @override
  _MarketingScreenState createState() => _MarketingScreenState();
}

class _MarketingScreenState extends State<MarketingScreen> {
  final MarketingService _marketingService = MarketingService();
  bool _isLoading = false;
  List<Campaign> _campaigns = [];

  final Map<String, String> _statusLabels = {
    'planning': 'Идея / Планирование',
    'preparing': 'В подготовке',
    'active': 'Запущено',
    'paused': 'Остановлено',
    'scaling': 'Масштабирование',
    'archived': 'Архив',
  };

  @override
  void initState() {
    super.initState();
    _loadCampaigns();
  }

  Future<void> _loadCampaigns() async {
    setState(() => _isLoading = true);
    try {
      final campaigns = await _marketingService.getCampaigns();
      setState(() {
        _campaigns = campaigns;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка загрузки кампаний: $e')),
      );
    }
  }

  Future<void> _updateCampaignStatus(int id, String newStatus) async {
    try {
      await _marketingService.updateCampaign(id, {'status': newStatus});
      _loadCampaigns();
      Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка обновления статуса: $e')),
      );
    }
  }

  Future<void> _createCampaign(String name, double budget, String source) async {
    try {
      await _marketingService.createCampaign({
        'name': name,
        'budget': budget,
        'source': source,
        'status': 'planning',
      });
      _loadCampaigns();
      Navigator.pop(context);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка создания кампании: $e')),
      );
    }
  }

  Future<void> _deleteCampaign(int id) async {
    try {
      await _marketingService.deleteCampaign(id);
      _loadCampaigns();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Ошибка удаления кампании: $e')),
      );
    }
  }

  void _showAddCampaignDialog() {
    final nameController = TextEditingController();
    final budgetController = TextEditingController();
    final sourceController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Новая кампания'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(labelText: 'Название'),
            ),
            TextField(
              controller: budgetController,
              decoration: const InputDecoration(labelText: 'Бюджет (MDL)'),
              keyboardType: TextInputType.number,
            ),
            TextField(
              controller: sourceController,
              decoration: const InputDecoration(labelText: 'Источник (например: Instagram)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          ElevatedButton(
            onPressed: () {
              if (nameController.text.isNotEmpty) {
                final budget = double.tryParse(budgetController.text) ?? 0.0;
                _createCampaign(nameController.text, budget, sourceController.text);
              }
            },
            child: const Text('Создать'),
          ),
        ],
      ),
    );
  }

  void _showStatusDialog(Campaign campaign) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Изменить статус'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: _statusLabels.entries.map((entry) {
              return RadioListTile<String>(
                title: Text(entry.value),
                value: entry.key,
                groupValue: campaign.status,
                onChanged: (value) {
                  if (value != null) {
                    _updateCampaignStatus(campaign.id, value);
                  }
                },
              );
            }).toList(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Маркетинг'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadCampaigns,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadCampaigns,
              child: _campaigns.isEmpty
                  ? const Center(child: Text('Нет активных кампаний'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(8),
                      itemCount: _campaigns.length,
                      itemBuilder: (context, index) {
                        final campaign = _campaigns[index];
                        return Card(
                          elevation: 2,
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        campaign.name,
                                        style: const TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    InkWell(
                                      onTap: () => _showStatusDialog(campaign),
                                      borderRadius: BorderRadius.circular(16),
                                      child: Chip(
                                        label: Text(
                                          _statusLabels[campaign.status] ?? campaign.status,
                                          style: const TextStyle(color: Colors.white, fontSize: 12),
                                        ),
                                        backgroundColor: _getStatusColor(campaign.status),
                                        visualDensity: VisualDensity.compact,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    _buildStat('Бюджет', '${campaign.budget.toStringAsFixed(0)} MDL'),
                                    _buildStat('Расход', '${campaign.spend.toStringAsFixed(0)} MDL'),
                                    _buildStat('Лиды', '${campaign.leads}'),
                                  ],
                                ),
                                if (campaign.source != null && campaign.source!.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 8.0),
                                    child: Text('Источник: ${campaign.source}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  ),
                                const Divider(height: 20),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    TextButton.icon(
                                      icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                                      label: const Text('Удалить', style: TextStyle(color: Colors.red)),
                                      onPressed: () => _confirmDelete(campaign),
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
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddCampaignDialog,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'active': return Colors.green;
      case 'planning': return Colors.blue;
      case 'completed': return Colors.grey;
      case 'paused': return Colors.orange;
      default: return Colors.grey;
    }
  }

  void _confirmDelete(Campaign campaign) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить кампанию?'),
        content: Text('Вы уверены, что хотите удалить "${campaign.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _deleteCampaign(campaign.id);
            },
            child: const Text('Удалить', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}
