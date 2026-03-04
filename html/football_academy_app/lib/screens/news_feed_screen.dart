import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/offline_storage_service.dart';

/// News Feed Screen - Announcements, posts, and updates
/// With offline caching support
class NewsFeedScreen extends StatefulWidget {
  const NewsFeedScreen({super.key});

  @override
  State<NewsFeedScreen> createState() => _NewsFeedScreenState();
}

class _NewsFeedScreenState extends State<NewsFeedScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  bool _isOffline = false;
  List<dynamic> _posts = [];
  List<dynamic> _announcements = [];
  List<dynamic> _groups = [];
  int? _selectedGroupId;
  bool _showOnlyUnread = false;
  
  // Cache keys
  static const String _cacheKeyPosts = 'news_posts';
  static const String _cacheKeyAnnouncements = 'news_announcements';
  static const String _cacheKeyGroups = 'news_groups';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    // Try cache first
    await _loadFromCache();
    
    try {
      final results = await Future.wait([
        _apiService.getPosts(groupId: _selectedGroupId),
        _apiService.getAnnouncements(groupId: _selectedGroupId),
        _apiService.getGroups(),
      ]);
      
      _posts = results[0];
      _announcements = results[1];
      _groups = results[2];
      _isOffline = false;
      
      // Save to cache
      await _saveToCache();
    } catch (e) {
      debugPrint('Error loading news: $e');
      _isOffline = true;
    } finally {
      setState(() => _isLoading = false);
    }
  }
  
  Future<void> _loadFromCache() async {
    try {
      final cachedPosts = await OfflineStorageService.getCache(_cacheKeyPosts);
      final cachedAnn = await OfflineStorageService.getCache(_cacheKeyAnnouncements);
      final cachedGroups = await OfflineStorageService.getCache(_cacheKeyGroups);
      
      if (cachedPosts != null) _posts = List<dynamic>.from(cachedPosts);
      if (cachedAnn != null) _announcements = List<dynamic>.from(cachedAnn);
      if (cachedGroups != null) _groups = List<dynamic>.from(cachedGroups);
      
      if (_posts.isNotEmpty || _announcements.isNotEmpty) {
        setState(() => _isLoading = false);
      }
    } catch (e) {
      debugPrint('Cache load error: $e');
    }
  }
  
  Future<void> _saveToCache() async {
    try {
      await Future.wait([
        OfflineStorageService.setCache(_cacheKeyPosts, _posts, ttl: const Duration(minutes: 30)),
        OfflineStorageService.setCache(_cacheKeyAnnouncements, _announcements, ttl: const Duration(minutes: 30)),
        OfflineStorageService.setCache(_cacheKeyGroups, _groups, ttl: const Duration(hours: 12)),
      ]);
    } catch (e) {
      debugPrint('Cache save error: $e');
    }
  }

  List<Map<String, dynamic>> _getCombinedFeed() {
    final List<Map<String, dynamic>> feed = [];
    
    // Add announcements
    for (var a in _announcements) {
      feed.add({
        ...Map<String, dynamic>.from(a),
        'feed_type': 'announcement',
        'sort_date': a['created_at'] ?? a['timestamp'] ?? DateTime.now().toIso8601String(),
      });
    }
    
    // Add posts
    for (var p in _posts) {
      feed.add({
        ...Map<String, dynamic>.from(p),
        'feed_type': 'post',
        'sort_date': p['created_at'] ?? p['timestamp'] ?? DateTime.now().toIso8601String(),
      });
    }
    
    // Sort by date (newest first)
    feed.sort((a, b) {
      final aDate = DateTime.tryParse(a['sort_date'] ?? '') ?? DateTime.now();
      final bDate = DateTime.tryParse(b['sort_date'] ?? '') ?? DateTime.now();
      return bDate.compareTo(aDate);
    });
    
    // Filter if needed
    if (_showOnlyUnread) {
      return feed.where((f) => f['is_read'] != true).toList();
    }
    
    return feed;
  }

  @override
  Widget build(BuildContext context) {
    final feed = _getCombinedFeed();
    
    return Scaffold(
      backgroundColor: const Color(0xFF1A1D23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: Row(
          children: [
            const Text('📰 ', style: TextStyle(fontSize: 24)),
            const Text('Новости'),
            if (_isOffline) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.cloud_off, size: 12, color: Colors.orange),
                    SizedBox(width: 4),
                    Text('Offline', style: TextStyle(fontSize: 10, color: Colors.orange)),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(
              _showOnlyUnread ? Icons.mark_email_unread : Icons.mark_email_read,
              color: _showOnlyUnread ? const Color(0xFFFFC107) : Colors.grey,
            ),
            onPressed: () {
              setState(() => _showOnlyUnread = !_showOnlyUnread);
            },
            tooltip: 'Только непрочитанные',
          ),
        ],
      ),
      body: Column(
        children: [
          // Group filter
          _buildGroupFilter(),
          
          // Feed content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
                : feed.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        color: const Color(0xFFFFC107),
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: feed.length,
                          itemBuilder: (context, index) {
                            final item = feed[index];
                            if (item['feed_type'] == 'announcement') {
                              return _buildAnnouncementCard(item);
                            } else {
                              return _buildPostCard(item);
                            }
                          },
                        ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _showCreatePostDialog,
        backgroundColor: const Color(0xFFFFC107),
        child: const Icon(Icons.add, color: Colors.black),
      ),
    );
  }

  Widget _buildGroupFilter() {
    return Container(
      height: 50,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _buildFilterChip(null, '🌐 Все'),
          ..._groups.map((g) => _buildFilterChip(g['id'], g['name'] ?? 'Группа')),
        ],
      ),
    );
  }

  Widget _buildFilterChip(int? groupId, String label) {
    final isSelected = _selectedGroupId == groupId;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        selected: isSelected,
        label: Text(label),
        labelStyle: TextStyle(
          color: isSelected ? Colors.black : Colors.white,
          fontSize: 12,
        ),
        backgroundColor: const Color(0xFF23272E),
        selectedColor: const Color(0xFFFFC107),
        side: BorderSide(color: isSelected ? const Color(0xFFFFC107) : Colors.white24),
        onSelected: (_) {
          setState(() => _selectedGroupId = groupId);
          _loadData();
        },
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.newspaper, size: 80, color: Colors.grey[700]),
          const SizedBox(height: 16),
          Text(
            'Нет новостей',
            style: TextStyle(color: Colors.grey[600], fontSize: 18),
          ),
          const SizedBox(height: 8),
          Text(
            'Здесь будут отображаться объявления и посты',
            style: TextStyle(color: Colors.grey[700], fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildAnnouncementCard(Map<String, dynamic> announcement) {
    final isImportant = announcement['is_important'] == true || announcement['requires_confirmation'] == true;
    final isConfirmed = announcement['is_confirmed'] == true;
    final createdAt = DateTime.tryParse(announcement['created_at'] ?? '');
    final timeAgo = createdAt != null ? _getTimeAgo(createdAt) : '';
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
        border: isImportant 
            ? Border.all(color: Colors.orange, width: 2) 
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isImportant 
                  ? Colors.orange.withOpacity(0.1) 
                  : Colors.transparent,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    isImportant ? Icons.campaign : Icons.notifications,
                    color: Colors.orange,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'Объявление',
                            style: TextStyle(
                              color: Colors.orange,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (isImportant) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.red,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Text(
                                'ВАЖНО',
                                style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                            ),
                          ],
                        ],
                      ),
                      Text(
                        timeAgo,
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
                ),
                if (announcement['is_read'] != true)
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(
                      color: Color(0xFFFFC107),
                      shape: BoxShape.circle,
                    ),
                  ),
              ],
            ),
          ),
          
          // Content
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              announcement['content'] ?? announcement['message'] ?? '',
              style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.5),
            ),
          ),
          
          // Confirmation button (if required)
          if (announcement['requires_confirmation'] == true && !isConfirmed)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _confirmAnnouncement(announcement['id']),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.check_circle, color: Colors.white),
                  label: const Text('Подтвердить прочтение', style: TextStyle(color: Colors.white)),
                ),
              ),
            ),
          
          if (isConfirmed)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.green, size: 16),
                  const SizedBox(width: 8),
                  Text('Прочитано', style: TextStyle(color: Colors.green[400], fontSize: 12)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPostCard(Map<String, dynamic> post) {
    final createdAt = DateTime.tryParse(post['created_at'] ?? '');
    final timeAgo = createdAt != null ? _getTimeAgo(createdAt) : '';
    final authorName = post['author_name'] ?? post['sender_name'] ?? 'Администратор';
    final likesCount = post['likes_count'] ?? 0;
    final commentsCount = post['comments_count'] ?? 0;
    final isLiked = post['is_liked'] == true;
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Author header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: const Color(0xFFFFC107).withOpacity(0.2),
                  child: Text(
                    authorName[0].toUpperCase(),
                    style: const TextStyle(color: Color(0xFFFFC107), fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authorName,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                      Text(
                        timeAgo,
                        style: TextStyle(color: Colors.grey[600], fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.more_vert, color: Colors.grey),
                  onPressed: () {},
                ),
              ],
            ),
          ),
          
          // Content
          if (post['title'] != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                post['title'],
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              post['content'] ?? post['message'] ?? '',
              style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.5),
            ),
          ),
          
          // Image (if any)
          if (post['image_url'] != null)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              height: 200,
              decoration: BoxDecoration(
                color: Colors.grey[800],
                borderRadius: BorderRadius.circular(12),
                image: DecorationImage(
                  image: NetworkImage(post['image_url']),
                  fit: BoxFit.cover,
                ),
              ),
            ),
          
          // Actions
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _buildActionButton(
                  icon: isLiked ? Icons.favorite : Icons.favorite_border,
                  label: '$likesCount',
                  color: isLiked ? Colors.red : Colors.grey,
                  onPressed: () => _toggleLike(post['id']),
                ),
                const SizedBox(width: 24),
                _buildActionButton(
                  icon: Icons.comment_outlined,
                  label: '$commentsCount',
                  color: Colors.grey,
                  onPressed: () {},
                ),
                const Spacer(),
                _buildActionButton(
                  icon: Icons.share_outlined,
                  label: '',
                  color: Colors.grey,
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onPressed,
  }) {
    return GestureDetector(
      onTap: onPressed,
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: color, fontSize: 14)),
          ],
        ],
      ),
    );
  }

  String _getTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);
    
    if (diff.inMinutes < 1) return 'только что';
    if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
    if (diff.inHours < 24) return '${diff.inHours} ч назад';
    if (diff.inDays < 7) return '${diff.inDays} дн назад';
    
    return '${dateTime.day}.${dateTime.month}.${dateTime.year}';
  }

  Future<void> _confirmAnnouncement(int? id) async {
    if (id == null) return;
    try {
      await _apiService.confirmAnnouncementRead(id);
      _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✓ Подтверждено'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      debugPrint('Error confirming: $e');
    }
  }

  Future<void> _toggleLike(int? id) async {
    if (id == null) return;
    try {
      await _apiService.reactToPost(id, 'like');
      _loadData();
    } catch (e) {
      debugPrint('Error liking: $e');
    }
  }

  void _showCreatePostDialog() {
    final contentController = TextEditingController();
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF23272E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Новый пост',
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.grey),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: contentController,
              maxLines: 4,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Что нового?',
                hintStyle: TextStyle(color: Colors.grey[600]),
                filled: true,
                fillColor: const Color(0xFF1A1D23),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () async {
                  if (contentController.text.trim().isEmpty) return;
                  try {
                    await _apiService.createPost({
                      'content': contentController.text.trim(),
                    });
                    Navigator.pop(context);
                    _loadData();
                  } catch (e) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFC107),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text(
                  'Опубликовать',
                  style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
