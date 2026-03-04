import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../providers/auth_provider.dart';
import '../../l10n/app_localizations.dart';

/// Экран коммуникаций для тренеров
/// - Лента объявлений (общая + по группам)
/// - Групповые чаты (с родителями учеников)
/// - Личные сообщения (с родителями и админом)
/// - Уведомления (изменения расписания, системные)
class CoachCommunicationsScreen extends StatefulWidget {
  const CoachCommunicationsScreen({super.key});

  @override
  State<CoachCommunicationsScreen> createState() => _CoachCommunicationsScreenState();
}

class _CoachCommunicationsScreenState extends State<CoachCommunicationsScreen> 
    with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late TabController _tabController;
  Timer? _refreshTimer;
  
  bool _isLoading = true;
  List<dynamic> _announcements = [];
  List<dynamic> _myGroups = [];
  List<dynamic> _chatUsers = [];
  List<dynamic> _notifications = [];
  final Map<int, List<dynamic>> _groupMessages = {};
  final Map<int, int> _unreadCounts = {};
  
  // Текущий открытый чат
  String _currentView = 'list'; // list, chat
  int? _selectedGroupId;
  int? _selectedUserId;
  String _selectedChatName = '';
  List<dynamic> _currentMessages = [];
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadData();
    // Автообновление каждые 10 секунд
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) => _refreshMessages());
  }

  @override
  void dispose() {
    _tabController.dispose();
    _refreshTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _apiService.getAnnouncements(),
        _apiService.getGroups(), // Будут отфильтрованы по тренеру на сервере
        _apiService.getChatUsers(),
        _loadNotifications(),
      ]);
      
      _announcements = results[0] ?? [];
      _myGroups = results[1] ?? [];
      _chatUsers = results[2] ?? [];
      
      // Загрузить непрочитанные счётчики
      await _loadUnreadCounts();
    } catch (e) {
      debugPrint('Error loading data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<List<dynamic>> _loadNotifications() async {
    try {
      // Загружаем уведомления об изменениях расписания
      final scheduleChanges = await _apiService.getMyScheduleChanges();
      _notifications = scheduleChanges.map((c) => {
        ...c,
        'type': 'schedule_change',
        'icon': Icons.calendar_month,
        'color': Colors.orange,
      }).toList();
      return _notifications;
    } catch (e) {
      debugPrint('Error loading notifications: $e');
      return [];
    }
  }

  Future<void> _loadUnreadCounts() async {
    try {
      for (var group in _myGroups) {
        final messages = await _apiService.getGroupMessages(group['id']);
        final unread = (messages).where((m) => m['is_read'] != true).length;
        _unreadCounts[group['id']] = unread;
      }
    } catch (e) {
      debugPrint('Error loading unread counts: $e');
    }
  }

  Future<void> _refreshMessages() async {
    if (_currentView == 'chat' && _selectedGroupId != null) {
      await _loadGroupMessages(_selectedGroupId!);
    } else if (_currentView == 'chat' && _selectedUserId != null) {
      await _loadDirectMessages(_selectedUserId!);
    }
  }

  Future<void> _loadGroupMessages(int groupId) async {
    try {
      final messages = await _apiService.getGroupMessages(groupId);
      setState(() {
        _currentMessages = messages;
        _unreadCounts[groupId] = 0;
      });
      _scrollToBottom();
    } catch (e) {
      debugPrint('Error loading group messages: $e');
    }
  }

  Future<void> _loadDirectMessages(int userId) async {
    try {
      final messages = await _apiService.getDirectMessages(userId);
      setState(() => _currentMessages = messages);
      _scrollToBottom();
    } catch (e) {
      debugPrint('Error loading direct messages: $e');
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      Future.delayed(const Duration(milliseconds: 100), () {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending) return;

    setState(() => _isSending = true);
    try {
      if (_selectedGroupId != null) {
        await _apiService.sendGroupMessage(_selectedGroupId!, {'content': text});
        await _loadGroupMessages(_selectedGroupId!);
      } else if (_selectedUserId != null) {
        await _apiService.sendDirectMessage(_selectedUserId!, {'content': text});
        await _loadDirectMessages(_selectedUserId!);
      }
      _messageController.clear();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${context.l10n.translate('error')}: $e'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => _isSending = false);
    }
  }

  void _openGroupChat(int groupId, String groupName) {
    setState(() {
      _currentView = 'chat';
      _selectedGroupId = groupId;
      _selectedUserId = null;
      _selectedChatName = groupName;
      _currentMessages = [];
    });
    _loadGroupMessages(groupId);
  }

  void _openDirectChat(int userId, String userName) {
    setState(() {
      _currentView = 'chat';
      _selectedUserId = userId;
      _selectedGroupId = null;
      _selectedChatName = userName;
      _currentMessages = [];
    });
    _loadDirectMessages(userId);
  }

  void _closeChat() {
    setState(() {
      _currentView = 'list';
      _selectedGroupId = null;
      _selectedUserId = null;
      _currentMessages = [];
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_currentView == 'chat') {
      return _buildChatView();
    }
    
    return Scaffold(
      backgroundColor: const Color(0xFF0F1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1E24),
        title: Row(
          children: [
            const Text('💬 ', style: TextStyle(fontSize: 24)),
            Text(context.l10n.translate('communications'), style: const TextStyle(color: Colors.white)),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFFFC107),
          labelColor: const Color(0xFFFFC107),
          unselectedLabelColor: Colors.grey,
          labelStyle: const TextStyle(fontSize: 12),
          tabs: [
            Tab(icon: const Icon(Icons.feed, size: 20), text: context.l10n.translate('feed')),
            _buildTabWithBadge(Icons.groups, context.l10n.translate('groups'), _getTotalGroupUnread()),
            Tab(icon: const Icon(Icons.message, size: 20), text: context.l10n.translate('personal')),
            _buildTabWithBadge(Icons.notifications, context.l10n.translate('notifications_short'), _notifications.length),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildFeedTab(),
                _buildGroupChatsTab(),
                _buildDirectMessagesTab(),
                _buildNotificationsTab(),
              ],
            ),
    );
  }

  Widget _buildTabWithBadge(IconData icon, String text, int count) {
    return Tab(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 20),
              const SizedBox(height: 2),
              Text(text, style: const TextStyle(fontSize: 10)),
            ],
          ),
          if (count > 0)
            Positioned(
              right: -8,
              top: -4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: Colors.red,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  count > 99 ? '99+' : '$count',
                  style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }

  int _getTotalGroupUnread() {
    return _unreadCounts.values.fold(0, (sum, count) => sum + count);
  }

  // ==================== ЛЕНТА ОБЪЯВЛЕНИЙ ====================
  Widget _buildFeedTab() {
    if (_announcements.isEmpty) {
      return _buildEmptyState(Icons.feed, context.l10n.translate('no_announcements'), context.l10n.translate('no_announcements_subtitle'));
    }

    return RefreshIndicator(
      color: const Color(0xFFFFC107),
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _announcements.length,
        itemBuilder: (context, index) {
          final ann = _announcements[index];
          return _buildAnnouncementCard(ann);
        },
      ),
    );
  }

  Widget _buildAnnouncementCard(dynamic ann) {
    final isGeneral = ann['is_general'] == true;
    final groupName = ann['group_name'] ?? '';
    final createdAt = _formatDateTime(ann['created_at']);
    final authorName = ann['author_name'] ?? context.l10n.translate('administration');
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1E24),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isGeneral ? Colors.blue.withOpacity(0.3) : Colors.green.withOpacity(0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Заголовок
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: (isGeneral ? Colors.blue : Colors.green).withOpacity(0.1),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                Icon(
                  isGeneral ? Icons.campaign : Icons.group,
                  color: isGeneral ? Colors.blue : Colors.green,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isGeneral ? context.l10n.translate('general_announcement') : groupName,
                        style: TextStyle(
                          color: isGeneral ? Colors.blue : Colors.green,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        '$authorName • $createdAt',
                        style: TextStyle(color: Colors.grey[500], fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Контент
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              ann['content'] ?? ann['title'] ?? '',
              style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  // ==================== ГРУППОВЫЕ ЧАТЫ ====================
  Widget _buildGroupChatsTab() {
    if (_myGroups.isEmpty) {
      return _buildEmptyState(Icons.groups, context.l10n.translate('no_groups'), context.l10n.translate('no_groups_subtitle'));
    }

    return RefreshIndicator(
      color: const Color(0xFFFFC107),
      onRefresh: _loadData,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _myGroups.length,
        itemBuilder: (context, index) {
          final group = _myGroups[index];
          return _buildGroupChatCard(group);
        },
      ),
    );
  }

  Widget _buildGroupChatCard(dynamic group) {
    final groupId = group['id'] as int;
    final unread = _unreadCounts[groupId] ?? 0;
    final studentsCount = group['students_count'] ?? 0;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: const Color(0xFF1C1E24),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => _openGroupChat(groupId, group['name'] ?? context.l10n.translate('group')),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                // Аватар группы
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFC107).withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.groups, color: Color(0xFFFFC107), size: 28),
                ),
                const SizedBox(width: 16),
                // Инфо
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        group['name'] ?? context.l10n.translate('group'),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '👨‍👩‍👧 $studentsCount ${context.l10n.translate('students_count').toLowerCase()}',
                        style: TextStyle(color: Colors.grey[400], fontSize: 13),
                      ),
                    ],
                  ),
                ),
                // Непрочитанные + стрелка
                Row(
                  children: [
                    if (unread > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '$unread',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_right, color: Colors.grey),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ==================== ЛИЧНЫЕ СООБЩЕНИЯ ====================
  Widget _buildDirectMessagesTab() {
    // Фильтруем только родителей и админов
    final parents = _chatUsers.where((u) => 
      u['role']?.toString().toLowerCase() == 'parent'
    ).toList();
    final admins = _chatUsers.where((u) => 
      u['role']?.toString().toLowerCase() == 'admin' || 
      u['role']?.toString().toLowerCase() == 'super_admin'
    ).toList();

    return RefreshIndicator(
      color: const Color(0xFFFFC107),
      onRefresh: _loadData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Администрация
          if (admins.isNotEmpty) ...[
            Text(
              context.l10n.translate('administration'),
              style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ...admins.map((u) => _buildUserChatCard(u, Colors.purple)),
            const SizedBox(height: 20),
          ],
          
          // Родители
          Text(
            context.l10n.translate('parents_of_students'),
            style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          if (parents.isEmpty)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFF1C1E24),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(context.l10n.translate('no_contacts'), style: const TextStyle(color: Colors.grey)),
              ),
            )
          else
            ...parents.map((u) => _buildUserChatCard(u, Colors.blue)),
        ],
      ),
    );
  }

  Widget _buildUserChatCard(dynamic user, Color accentColor) {
    final userId = user['id'] as int;
    final fullName = user['full_name'] ?? context.l10n.translate('users');
    final role = user['role']?.toString().toLowerCase() ?? '';
    final roleLabel = role == 'admin' || role == 'super_admin' ? context.l10n.translate('admin_role') : context.l10n.translate('parent');
    
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: const Color(0xFF1C1E24),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _openDirectChat(userId, fullName),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: accentColor.withOpacity(0.2),
                  child: Text(
                    fullName.isNotEmpty ? fullName[0].toUpperCase() : '?',
                    style: TextStyle(color: accentColor, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        fullName,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
                      ),
                      Text(
                        roleLabel,
                        style: TextStyle(color: Colors.grey[500], fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: Colors.grey[600]),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ==================== УВЕДОМЛЕНИЯ ====================
  Widget _buildNotificationsTab() {
    if (_notifications.isEmpty) {
      return _buildEmptyState(
        Icons.notifications_none, 
        context.l10n.translate('no_notifications'), 
        context.l10n.translate('no_notifications_subtitle'),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFFFFC107),
      onRefresh: () async {
        await _loadNotifications();
        setState(() {});
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _notifications.length,
        itemBuilder: (context, index) {
          final notif = _notifications[index];
          return _buildNotificationCard(notif);
        },
      ),
    );
  }

  Widget _buildNotificationCard(dynamic notif) {
    final changeType = notif['change_type'] ?? notif['change_type_display'] ?? '';
    final groupName = notif['group_name'] ?? '';
    final date = notif['change_date'] ?? notif['created_at'] ?? '';
    final reason = notif['reason'] ?? '';
    
    IconData icon;
    Color color;
    String title;
    
    switch (changeType.toLowerCase()) {
      case 'cancelled':
        icon = Icons.cancel;
        color = Colors.red;
        title = context.l10n.translate('training_cancelled');
        break;
      case 'rescheduled':
        icon = Icons.schedule;
        color = Colors.orange;
        title = context.l10n.translate('training_rescheduled');
        break;
      case 'added':
        icon = Icons.add_circle;
        color = Colors.green;
        title = context.l10n.translate('training_added');
        break;
      default:
        icon = Icons.info;
        color = Colors.blue;
        title = context.l10n.translate('schedule_change');
    }
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1E24),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withOpacity(0.2),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                  const SizedBox(height: 4),
                  if (groupName.isNotEmpty)
                    Text(
                      '📚 $groupName',
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                    ),
                  if (date.isNotEmpty)
                    Text(
                      '📅 ${_formatDate(date)}',
                      style: TextStyle(color: Colors.grey[400], fontSize: 12),
                    ),
                  if (reason.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '💬 $reason',
                      style: TextStyle(color: Colors.grey[400], fontSize: 12, fontStyle: FontStyle.italic),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==================== ВИД ЧАТА ====================
  Widget _buildChatView() {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1117),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1E24),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: _closeChat,
        ),
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: const Color(0xFFFFC107).withOpacity(0.2),
              child: Icon(
                _selectedGroupId != null ? Icons.groups : Icons.person,
                color: const Color(0xFFFFC107),
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _selectedChatName,
                style: const TextStyle(color: Colors.white, fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Сообщения
          Expanded(
            child: _currentMessages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey[700]),
                        const SizedBox(height: 16),
                        Text(context.l10n.translate('start_chatting'), style: TextStyle(color: Colors.grey[600])),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _currentMessages.length,
                    itemBuilder: (context, index) {
                      return _buildMessageBubble(_currentMessages[index]);
                    },
                  ),
          ),
          // Поле ввода
          _buildMessageInput(),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(dynamic message) {
    final user = context.read<AuthProvider>().user;
    final isMe = message['sender_id'] == user?.id;
    final content = message['content'] ?? '';
    final senderName = message['sender_name'] ?? '';
    final time = _formatTime(message['created_at']);
    
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        child: Column(
          crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!isMe && senderName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 12, bottom: 4),
                child: Text(
                  senderName,
                  style: TextStyle(color: Colors.grey[500], fontSize: 11),
                ),
              ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: isMe ? const Color(0xFFFFC107) : const Color(0xFF2D323B),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMe ? 16 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 16),
                ),
              ),
              child: Text(
                content,
                style: TextStyle(
                  color: isMe ? Colors.black : Colors.white,
                  fontSize: 14,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4, right: 4),
              child: Text(
                time,
                style: TextStyle(color: Colors.grey[600], fontSize: 10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageInput() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1E24),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.1))),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _messageController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: context.l10n.translate('enter_message'),
                  hintStyle: TextStyle(color: Colors.grey[600]),
                  filled: true,
                  fillColor: const Color(0xFF2D323B),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
                onSubmitted: (_) => _sendMessage(),
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: const Color(0xFFFFC107),
              borderRadius: BorderRadius.circular(24),
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: _isSending ? null : _sendMessage,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  child: _isSending
                      ? const SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2),
                        )
                      : const Icon(Icons.send, color: Colors.black),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ==================== ВСПОМОГАТЕЛЬНЫЕ ====================
  Widget _buildEmptyState(IconData icon, String title, String subtitle) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.grey[700]),
          const SizedBox(height: 16),
          Text(title, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(subtitle, style: TextStyle(color: Colors.grey[500], fontSize: 14)),
        ],
      ),
    );
  }

  String _formatDateTime(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final isToday = date.year == now.year && date.month == now.month && date.day == now.day;
      
      if (isToday) {
        return '${context.l10n.translate('today')}, ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
      }
      return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')} в ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return dateStr;
    }
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return '';
    }
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';
    } catch (e) {
      return dateStr;
    }
  }
}
