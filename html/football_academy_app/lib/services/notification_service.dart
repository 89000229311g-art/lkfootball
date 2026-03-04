import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Simple notification service for in-app notifications
/// For full push notifications, Firebase Cloud Messaging would be needed
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  bool _notificationsEnabled = true;
  final List<AppNotification> _notifications = [];

  bool get notificationsEnabled => _notificationsEnabled;
  List<AppNotification> get notifications => List.unmodifiable(_notifications);
  int get unreadCount => _notifications.where((n) => !n.isRead).length;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _notificationsEnabled = prefs.getBool('notifications_enabled') ?? true;
  }

  Future<void> setNotificationsEnabled(bool enabled) async {
    _notificationsEnabled = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notifications_enabled', enabled);
  }

  void addNotification({
    required String title,
    required String body,
    String? type,
    Map<String, dynamic>? data,
  }) {
    if (!_notificationsEnabled) return;
    
    _notifications.insert(0, AppNotification(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      title: title,
      body: body,
      type: type ?? 'general',
      data: data,
      createdAt: DateTime.now(),
    ));
  }

  void markAsRead(String id) {
    final index = _notifications.indexWhere((n) => n.id == id);
    if (index != -1) {
      _notifications[index] = _notifications[index].copyWith(isRead: true);
    }
  }

  void markAllAsRead() {
    for (int i = 0; i < _notifications.length; i++) {
      _notifications[i] = _notifications[i].copyWith(isRead: true);
    }
  }

  void clear() {
    _notifications.clear();
  }

  /// Show a snackbar notification
  static void showSnackBar(BuildContext context, String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : const Color(0xFF1B5E20),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  /// Show a success notification
  static void showSuccess(BuildContext context, String message) {
    showSnackBar(context, message, isError: false);
  }

  /// Show an error notification
  static void showError(BuildContext context, String message) {
    showSnackBar(context, message, isError: true);
  }

  /// Show a dialog notification
  static Future<void> showNotificationDialog(
    BuildContext context, {
    required String title,
    required String message,
    String? confirmText,
    VoidCallback? onConfirm,
  }) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.notifications, color: Color(0xFF1B5E20)),
            const SizedBox(width: 8),
            Text(title),
          ],
        ),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
          if (onConfirm != null)
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                onConfirm();
              },
              child: Text(confirmText ?? 'Go'),
            ),
        ],
      ),
    );
  }
}

class AppNotification {
  final String id;
  final String title;
  final String body;
  final String type;
  final Map<String, dynamic>? data;
  final DateTime createdAt;
  final bool isRead;

  AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.type,
    this.data,
    required this.createdAt,
    this.isRead = false,
  });

  AppNotification copyWith({
    String? id,
    String? title,
    String? body,
    String? type,
    Map<String, dynamic>? data,
    DateTime? createdAt,
    bool? isRead,
  }) {
    return AppNotification(
      id: id ?? this.id,
      title: title ?? this.title,
      body: body ?? this.body,
      type: type ?? this.type,
      data: data ?? this.data,
      createdAt: createdAt ?? this.createdAt,
      isRead: isRead ?? this.isRead,
    );
  }

  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

    if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }
}

/// Notification types
class NotificationTypes {
  static const String eventReminder = 'event_reminder';
  static const String paymentReminder = 'payment_reminder';
  static const String attendanceMarked = 'attendance_marked';
  static const String newStudent = 'new_student';
  static const String general = 'general';
}

/// Payment Reminder Helper
class PaymentReminderService {
  static const String _lastReminderKey = 'last_payment_reminder_shown';
  
  /// Check if we should show payment reminder
  /// Returns true if it's 25th or later and we haven't shown today
  static Future<bool> shouldShowReminder() async {
    final today = DateTime.now();
    
    // Only show on 25th-31st of the month
    if (today.day < 25) return false;
    
    // Check if we already showed today
    final prefs = await SharedPreferences.getInstance();
    final lastShown = prefs.getString(_lastReminderKey);
    
    if (lastShown != null) {
      final lastShownDate = DateTime.tryParse(lastShown);
      if (lastShownDate != null && 
          lastShownDate.year == today.year &&
          lastShownDate.month == today.month &&
          lastShownDate.day == today.day) {
        return false; // Already shown today
      }
    }
    
    return true;
  }
  
  /// Mark that we showed the reminder today
  static Future<void> markReminderShown() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastReminderKey, DateTime.now().toIso8601String());
  }
  
  /// Show payment reminder dialog for unpaid subscriptions
  static Future<void> showPaymentReminderIfNeeded(
    BuildContext context,
    List<Map<String, dynamic>> unpaidChildren,
  ) async {
    if (unpaidChildren.isEmpty) return;
    
    final shouldShow = await shouldShowReminder();
    if (!shouldShow) return;
    
    await markReminderShown();
    
    // Build children list for dialog
    final childrenText = unpaidChildren.map((child) {
      return '• ${child['name']}: ${child['target_month']}';
    }).join('\n');
    
    // Get next month name for reminder
    final now = DateTime.now();
    final nextMonth = now.month == 12 ? 1 : now.month + 1;
    final monthNames = {
      1: 'Январь', 2: 'Февраль', 3: 'Март', 4: 'Апрель',
      5: 'Май', 6: 'Июнь', 7: 'Июль', 8: 'Август',
      9: 'Сентябрь', 10: 'Октябрь', 11: 'Ноябрь', 12: 'Декабрь'
    };
    
    // ignore: use_build_context_synchronously
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.payment, color: Colors.orange, size: 24),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Напоминание об оплате',
                style: TextStyle(color: Colors.white, fontSize: 18),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Пора оплатить абонемент за ${monthNames[nextMonth]}!',
              style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
            const SizedBox(height: 12),
            const Text(
              'Период оплаты: 25-31 числа текущего месяца',
              style: TextStyle(color: Colors.grey, fontSize: 14),
            ),
            const SizedBox(height: 16),
            const Text(
              'Требуется оплата:',
              style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text(
              childrenText,
              style: const TextStyle(color: Colors.orange, fontSize: 14),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Понятно', style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFFC107),
              foregroundColor: Colors.black,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              // Could navigate to payments screen here
            },
            child: const Text('Оплатить'),
          ),
        ],
      ),
    );
  }
}

/// SMS Templates for payment reminders
class SmsTemplates {
  /// Payment reminder SMS (sent on 25th of month)
  /// Parameters:
  /// - childName: Name of the child
  /// - monthName: Month for which payment is due (e.g., "Февраль")
  /// - academyName: Name of the academy
  static String paymentReminder({
    required String childName,
    required String monthName,
    String academyName = 'Sunny Academy',
  }) {
    return '''
🏆 $academyName

Уважаемый родитель!

Напоминаем, что подходит срок оплаты абонемента за $monthName для вашего ребёнка $childName.

⏰ Период оплаты: 25-31 числа текущего месяца

Спасибо, что вы с нами! ⚽
''';
  }

  /// Debt reminder SMS (sent after payment deadline)
  /// Parameters:
  /// - childName: Name of the child  
  /// - monthName: Month for which payment is overdue
  /// - academyName: Name of the academy
  static String debtReminder({
    required String childName,
    required String monthName,
    String academyName = 'Sunny Academy',
  }) {
    return '''
🏆 $academyName

Уважаемый родитель!

Обращаем внимание, что у вас имеется задолженность по абонементу за $monthName для $childName.

⚠️ Пожалуйста, оплатите в ближайшее время для продолжения занятий.

По вопросам оплаты обращайтесь к администратору.

С уважением, $academyName ⚽
''';
  }

  /// Payment confirmation SMS
  /// Parameters:
  /// - childName: Name of the child
  /// - monthName: Month that was paid for
  /// - academyName: Name of the academy
  static String paymentConfirmation({
    required String childName,
    required String monthName,
    String academyName = 'Sunny Academy',
  }) {
    return '''
🏆 $academyName

✅ Оплата принята!

Абонемент за $monthName для $childName успешно оплачен.

Ждём вас на тренировках! ⚽
''';
  }
}
