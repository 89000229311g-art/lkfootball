import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/group.dart';
import '../models/user.dart';
import '../l10n/app_localizations.dart';

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key});

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  final ApiService _apiService = ApiService();
  List<Group> _groups = [];
  bool _isLoading = true;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  // Filter groups by search query
  List<Group> get _filteredGroups {
    if (_searchQuery.isEmpty) return _groups;
    final query = _searchQuery.toLowerCase();
    return _groups.where((g) {
      return g.name.toLowerCase().contains(query) ||
             (g.ageGroup?.toLowerCase().contains(query) ?? false) ||
             (g.coachName?.toLowerCase().contains(query) ?? false);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    setState(() => _isLoading = true);
    try {
      final groupsData = await _apiService.getGroups();
      setState(() {
        _groups = groupsData.map((e) => Group.fromJson(e)).toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e')),
        );
      }
    }
  }

  void _showAddEditDialog([Group? group]) {
    final nameController = TextEditingController(text: group?.name);
    final ageGroupController = TextEditingController(text: group?.ageGroup);
    final feeController = TextEditingController(text: group?.monthlyFee.toString());
    final classesController = TextEditingController(text: (group?.classesPerMonth ?? 8).toString());
    final dueDayController = TextEditingController(text: (group?.paymentDueDay ?? 10).toString());
    int? selectedCoachId = group?.coachId;
    String subscriptionType = group?.subscriptionType ?? 'by_class';
    List<User> coaches = [];
    bool isLoadingCoaches = true;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) {
          // Load coaches if not loaded
          if (isLoadingCoaches && coaches.isEmpty) {
            _apiService.getUsers(role: 'coach').then((data) {
              if (context.mounted) {
                setDialogState(() {
                  coaches = data.map((e) => User.fromJson(e)).toList();
                  isLoadingCoaches = false;
                });
              }
            });
          }

          // Safe value logic
          int? safeCoachValue;
          if (isLoadingCoaches) {
            safeCoachValue = null;
          } else {
            final exists = selectedCoachId == null || coaches.any((c) => c.id == selectedCoachId);
            if (exists) {
              safeCoachValue = selectedCoachId;
            } else {
              safeCoachValue = null;
            }
          }

          return AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Text(
            group == null ? context.l10n.translate('create_group') : context.l10n.translate('edit_group'),
            style: const TextStyle(color: Colors.white),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: nameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('group_name_required'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: ageGroupController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('age_group'),
                    hintText: context.l10n.translate('age_group_hint'),
                    hintStyle: const TextStyle(color: Colors.grey),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: feeController,
                  style: const TextStyle(color: Colors.white),
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('cost_mdl'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                ),
                const SizedBox(height: 12),
                // Subscription Type Dropdown
                DropdownButtonFormField<String>(
                  initialValue: subscriptionType,
                  dropdownColor: const Color(0xFF2D323B),
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('subscription_type'),
                    labelStyle: const TextStyle(color: Colors.grey),
                    enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                    focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                  ),
                  items: [
                    DropdownMenuItem(value: 'by_class', child: Text(context.l10n.translate('by_classes'))),
                    DropdownMenuItem(value: 'by_calendar', child: Text(context.l10n.translate('by_calendar'))),
                  ],
                  onChanged: (value) => setDialogState(() => subscriptionType = value ?? 'by_class'),
                ),
                const SizedBox(height: 12),
                // Classes per month (only for by_class)
                if (subscriptionType == 'by_class')
                  TextField(
                    controller: classesController,
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: context.l10n.translate('classes_per_month'),
                      labelStyle: const TextStyle(color: Colors.grey),
                      enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                // Payment due day (only for by_calendar)
                if (subscriptionType == 'by_calendar')
                  TextField(
                    controller: dueDayController,
                    style: const TextStyle(color: Colors.white),
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: context.l10n.translate('payment_due_date'),
                      labelStyle: const TextStyle(color: Colors.grey),
                      enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                  ),
                const SizedBox(height: 12),
                if (isLoadingCoaches)
                  const Padding(
                    padding: EdgeInsets.all(16.0),
                    child: CircularProgressIndicator(color: Color(0xFFFFC107)),
                  )
                else
                  DropdownButtonFormField<int>(
                    initialValue: safeCoachValue,
                    dropdownColor: const Color(0xFF2D323B),
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: context.l10n.translate('select_coach'),
                      labelStyle: const TextStyle(color: Colors.grey),
                      enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Colors.grey)),
                      focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFFFFC107))),
                    ),
                    items: [
                      DropdownMenuItem(value: null, child: Text(context.l10n.translate('no_coach'))),
                      ...coaches.map((c) => DropdownMenuItem(
                        value: c.id,
                        child: Text(c.fullName),
                      )),
                    ],
                    onChanged: (value) => setDialogState(() => selectedCoachId = value),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(context.l10n.translate('cancel'), style: const TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: Colors.black,
              ),
              onPressed: () async {
                if (nameController.text.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(context.l10n.translate('enter_group_name_error'))),
                  );
                  return;
                }

                final data = {
                  'name': nameController.text,
                  'age_group': ageGroupController.text.isNotEmpty ? ageGroupController.text : null,
                  'monthly_fee': double.tryParse(feeController.text) ?? 0,
                  'coach_id': selectedCoachId,
                  'subscription_type': subscriptionType,
                  'classes_per_month': int.tryParse(classesController.text) ?? 8,
                  'payment_due_day': int.tryParse(dueDayController.text) ?? 10,
                };

                try {
                  if (group == null) {
                    await _apiService.createGroup(data);
                  } else {
                    await _apiService.updateGroup(group.id, data);
                  }
                  if (mounted) {
                    Navigator.pop(context);
                    _loadGroups();
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${context.l10n.translate('error')}: $e')),
                    );
                  }
                }
              },
              child: Text(group == null ? context.l10n.translate('add') : context.l10n.translate('save')),
            ),
          ],
        );
      }),
    );
  }

  Future<void> _deleteGroup(Group group) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: Text(context.l10n.translate('delete_group'), style: const TextStyle(color: Colors.white)),
        content: Text(
          context.l10n.translate('delete_group_confirmation'),
          style: const TextStyle(color: Colors.grey),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.translate('cancel'), style: const TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.translate('delete')),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteGroup(group.id);
        _loadGroups();
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('${context.l10n.translate('error')}: $e')),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredGroups = _filteredGroups;
    
    return Scaffold(
      backgroundColor: const Color(0xFF1C2127),
      appBar: AppBar(
        title: Text(context.l10n.translate('groups')),
        backgroundColor: const Color(0xFF23272E),
        foregroundColor: Colors.white,
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
                hintText: context.l10n.translate('search_hint'),
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
                    '${context.l10n.translate('found_count')}: ${filteredGroups.length}',
                    style: const TextStyle(color: Colors.grey, fontSize: 14),
                  ),
                ],
              ),
            ),
          // Groups List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filteredGroups.isEmpty
                    ? Center(
                        child: Text(
                          _searchQuery.isNotEmpty ? context.l10n.translate('nothing_found') : context.l10n.translate('no_groups'),
                          style: const TextStyle(color: Colors.grey, fontSize: 18),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: filteredGroups.length,
                        itemBuilder: (context, index) {
                          final group = filteredGroups[index];
                    return Card(
                      color: const Color(0xFF2D323B),
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: BorderSide(color: Colors.grey.withAlpha(51))
                      ),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFFFC107),
                          child: Text(
                            group.name.isNotEmpty ? group.name[0].toUpperCase() : 'G',
                            style: const TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
                          ),
                        ),
                        title: Row(
                          children: [
                            Flexible(
                              child: Text(
                                group.name,
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (group.ageGroup != null && group.ageGroup!.isNotEmpty)
                              Container(
                                margin: const EdgeInsets.only(left: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.grey[800],
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  group.ageGroup!,
                                  style: const TextStyle(color: Colors.white, fontSize: 12),
                                ),
                              ),
                          ],
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (group.coachName != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 4, bottom: 2),
                                child: Row(
                                  children: [
                                    const Icon(Icons.sports_soccer, size: 14, color: Colors.blue),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        group.coachName!,
                                        style: const TextStyle(color: Colors.blue, fontSize: 12, fontWeight: FontWeight.bold),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (group.monthlyFee > 0)
                              Text(
                                '${group.monthlyFee.toInt()} MDL',
                                style: TextStyle(color: Colors.grey[400]),
                              ),
                            // Display subscription type
                            Text(
                              group.subscriptionType == 'by_calendar' ? context.l10n.translate('by_calendar') : context.l10n.translate('by_classes'),
                              style: TextStyle(color: Colors.grey[600], fontSize: 12),
                            ),
                          ],
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.edit, color: Colors.blue),
                              onPressed: () => _showAddEditDialog(group),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete, color: Colors.red),
                              onPressed: () => _deleteGroup(group),
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
}
