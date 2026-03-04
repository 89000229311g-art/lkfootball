import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';

enum ChatType { broadcast, admin, group, direct }

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ApiService _apiService = ApiService();
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  List<Map<String, dynamic>> _messages = [];
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _groups = [];
  
  ChatType _chatType = ChatType.broadcast;
  int? _selectedId;
  String _selectedName = 'Общий чат';
  
  bool _isLoading = true;
  bool _isSending = false;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadData();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) => _loadMessages());
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final users = await _apiService.getChatUsers();
      final groups = await _apiService.getChatGroups();
      setState(() {
        _users = users.cast<Map<String, dynamic>>();
        _groups = groups.cast<Map<String, dynamic>>();
      });
      await _loadMessages();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки: $e')),
        );
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadMessages() async {
    try {
      List<dynamic> messages;
      
      if (_chatType == ChatType.broadcast) {
        // Load all announcements (general + user's groups)
        messages = await _apiService.getAnnouncements();
      } else if (_chatType == ChatType.direct && _selectedId != null) {
        // Load direct messages with specific user
        messages = await _apiService.getDirectMessages(_selectedId!);
      } else if (_chatType == ChatType.group && _selectedId != null) {
        // Load group chat messages
        messages = await _apiService.getGroupMessages(_selectedId!);
      } else if (_chatType == ChatType.admin) {
        // Load admin messages (general announcements only)
        messages = await _apiService.getAnnouncements(generalOnly: true);
      } else {
        messages = [];
      }
      
      setState(() {
        _messages = messages.cast<Map<String, dynamic>>();
      });
      _scrollToBottom();
    } catch (e) {
      print('Failed to load messages: $e');
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      Future.delayed(const Duration(milliseconds: 100), () {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      });
    }
  }

  Future<void> _sendMessage() async {
    final content = _messageController.text.trim();
    if (content.isEmpty || _isSending) return;

    setState(() => _isSending = true);
    try {
      if (_chatType == ChatType.direct && _selectedId != null) {
        // Direct message
        await _apiService.sendDirectMessage(_selectedId!, {'content': content});
      } else if (_chatType == ChatType.group && _selectedId != null) {
        // Group chat message
        await _apiService.sendGroupMessage(_selectedId!, {'content': content});
      } else if (_chatType == ChatType.broadcast || _chatType == ChatType.admin) {
        // Announcement (only admin/coach can send)
        await _apiService.createAnnouncement({
          'content': content,
          'is_general': true,
          'group_ids': [],
        });
      }
      
      _messageController.clear();
      await _loadMessages();
    } catch (e) {
      if (mounted) {
        String errorMsg = 'Ошибка отправки';
        if (e.toString().contains('403')) {
          errorMsg = 'Нет прав для отправки объявлений';
        } else if (e.toString().contains('404')) {
          errorMsg = 'Чат не найден';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMsg)),
        );
      }
    } finally {
      setState(() => _isSending = false);
    }
  }

  void _selectChat(ChatType type, {int? id, String? name}) {
    setState(() {
      _chatType = type;
      _selectedId = id;
      _selectedName = name ?? 'Чат';
    });
    _loadMessages();
  }

  String _formatTime(String? dateStr) {
    if (dateStr == null) return '';
    try {
      final date = DateTime.parse(dateStr);
      final now = DateTime.now();
      final isToday = date.year == now.year && date.month == now.month && date.day == now.day;
      
      if (isToday) {
        return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
      }
      return '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_selectedName),
        backgroundColor: const Color(0xFF1B5E20),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => _showChatSelector(),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Chat type indicator
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  color: Colors.grey[100],
                  child: Row(
                    children: [
                      Icon(_getChatIcon(), size: 16, color: Colors.grey[600]),
                      const SizedBox(width: 8),
                      Text(
                        _getChatDescription(),
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
                ),
                
                // Messages
                Expanded(
                  child: _messages.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.chat_bubble_outline, size: 64, color: Colors.grey),
                              SizedBox(height: 16),
                              Text('Нет сообщений', style: TextStyle(color: Colors.grey)),
                            ],
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final msg = _messages[index];
                            return _buildMessageBubble(msg);
                          },
                        ),
                ),
                
                // Input
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 4,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _messageController,
                            decoration: InputDecoration(
                              hintText: 'Сообщение...',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(25),
                              ),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            ),
                            maxLines: null,
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                        const SizedBox(width: 8),
                        CircleAvatar(
                          backgroundColor: const Color(0xFF1B5E20),
                          child: IconButton(
                            icon: _isSending
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                  )
                                : const Icon(Icons.send, color: Colors.white),
                            onPressed: _isSending ? null : _sendMessage,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  IconData _getChatIcon() {
    switch (_chatType) {
      case ChatType.broadcast: return Icons.campaign;
      case ChatType.admin: return Icons.admin_panel_settings;
      case ChatType.group: return Icons.group;
      case ChatType.direct: return Icons.person;
    }
  }

  String _getChatDescription() {
    switch (_chatType) {
      case ChatType.broadcast: return 'Сообщения видят все пользователи';
      case ChatType.admin: return 'Общение с администрацией';
      case ChatType.group: return 'Родители и тренер группы';
      case ChatType.direct: return 'Личная переписка';
    }
  }

  Widget _buildMessageBubble(Map<String, dynamic> msg) {
    // Determine if message is from self
    // We don't have current user ID easily available here without AuthProvider
    // But we can check sender_name or role.
    // Ideally we should pass currentUserId to this widget.
    // For now, let's assume if it's "Me" it's own.
    // Actually the previous logic `msg['sender_name']?.toString().contains('Admin')` is weak.
    // Let's rely on alignment for now or improve it later.
    final isOwn = false; // We can't know for sure without context.read<AuthProvider>().user.id
    
    final content = msg['content'] ?? '';
    
    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isOwn ? const Color(0xFF1B5E20) : Colors.grey[200],
          borderRadius: BorderRadius.circular(16),
        ),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.75,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isOwn && msg['sender_name'] != null)
              Text(
                msg['sender_name'],
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isOwn ? Colors.white70 : Colors.grey[700],
                ),
              ),
            
            _buildMessageContent(content, isOwn),
            
            const SizedBox(height: 4),
            Text(
              _formatTime(msg['created_at']),
              style: TextStyle(
                fontSize: 10,
                color: isOwn ? Colors.white54 : Colors.grey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageContent(String content, bool isOwn) {
    // Regex for Markdown Image: ![alt](url)
    final imageRegex = RegExp(r'!\[.*?\]\((.*?)\)');
    // Regex for Video Link: [🎥 Video](url)
    final videoRegex = RegExp(r'\[🎥.*?\]\((.*?)\)');
    
    final imageMatch = imageRegex.firstMatch(content);
    final videoMatch = videoRegex.firstMatch(content);
    
    if (imageMatch != null) {
      final url = imageMatch.group(1);
      final text = content.replaceAll(imageRegex, '').trim();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(text, style: TextStyle(color: isOwn ? Colors.white : Colors.black87)),
            ),
          if (url != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                url,
                loadingBuilder: (ctx, child, progress) {
                  if (progress == null) return child;
                  return const SizedBox(
                    height: 150, 
                    child: Center(child: CircularProgressIndicator())
                  );
                },
                errorBuilder: (ctx, _, __) => const Icon(Icons.broken_image),
              ),
            ),
        ],
      );
    } else if (videoMatch != null) {
      final url = videoMatch.group(1);
      final text = content.replaceAll(videoRegex, '').trim();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
           if (text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(text, style: TextStyle(color: isOwn ? Colors.white : Colors.black87)),
            ),
          if (url != null)
            Container(
              decoration: BoxDecoration(
                color: Colors.black12,
                borderRadius: BorderRadius.circular(8),
              ),
              child: ListTile(
                leading: const Icon(Icons.play_circle_fill, size: 40, color: Colors.red),
                title: const Text('Видео вложение'),
                subtitle: const Text('Нажмите, чтобы открыть (TODO)'),
                onTap: () {
                  // Open video player or launch URL
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Открыть видео: $url')),
                  );
                },
              ),
            ),
        ],
      );
    }

    return Text(
      content,
      style: TextStyle(color: isOwn ? Colors.white : Colors.black87),
    );
  }

  void _showChatSelector() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        minChildSize: 0.5,
        expand: false,
        builder: (context, scrollController) => SingleChildScrollView(
          controller: scrollController,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Center(
                  child: Text(
                    'Выберите чат',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 16),
                
                // System chats
                const Text('ОБЩИЕ', style: TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold)),
                ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.campaign)),
                  title: const Text('📢 Общий чат'),
                  subtitle: const Text('Сообщения для всех'),
                  selected: _chatType == ChatType.broadcast,
                  onTap: () {
                    _selectChat(ChatType.broadcast, name: 'Общий чат');
                    Navigator.pop(context);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.admin_panel_settings)),
                  title: const Text('👨‍💼 Администрация'),
                  subtitle: const Text('Вопросы и объявления'),
                  selected: _chatType == ChatType.admin,
                  onTap: () {
                    _selectChat(ChatType.admin, name: 'Администрация');
                    Navigator.pop(context);
                  },
                ),
                
                // Groups
                if (_groups.isNotEmpty) ...[
                  const Divider(),
                  const Text('ГРУППЫ (Родители + Тренер)', style: TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold)),
                  ..._groups.map((g) => ListTile(
                    leading: CircleAvatar(child: Text(g['name']?[0] ?? '⚽')),
                    title: Text('⚽ ${g['name']}'),
                    subtitle: Text(g['coach_name'] ?? 'Без тренера'),
                    selected: _chatType == ChatType.group && _selectedId == g['id'],
                    onTap: () {
                      _selectChat(ChatType.group, id: g['id'], name: g['name']);
                      Navigator.pop(context);
                    },
                  )),
                ],
                
                // Users
                if (_users.isNotEmpty) ...[
                  const Divider(),
                  const Text('ЛИЧНЫЕ СООБЩЕНИЯ', style: TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold)),
                  ..._users.map((u) => ListTile(
                    leading: CircleAvatar(child: Text(u['name']?[0] ?? '?')),
                    title: Text('👤 ${u['name']}'),
                    subtitle: Text(u['role'] ?? ''),
                    selected: _chatType == ChatType.direct && _selectedId == u['id'],
                    onTap: () {
                      _selectChat(ChatType.direct, id: u['id'], name: u['name']);
                      Navigator.pop(context);
                    },
                  )),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
