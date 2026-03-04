/// Firebase Push Notification Service
/// Handles FCM push notifications for mobile and backend
library;

import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Background message handler (must be top-level)
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print('Background message: ${message.messageId}');
  await PushNotificationService._handleMessage(message, isBackground: true);
}

class PushNotificationService {
  static final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  static final FlutterLocalNotificationsPlugin _localNotifications = 
      FlutterLocalNotificationsPlugin();
  
  static String? _fcmToken;
  static Function(Map<String, dynamic>)? _onNotificationTap;
  
  // Notification channel for Android
  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'sunny_academy_channel',
    'Sunny Academy',
    description: 'Уведомления от Sunny Football Academy',
    importance: Importance.high,
    playSound: true,
  );

  /// Initialize push notification service
  static Future<void> init({
    Function(Map<String, dynamic>)? onNotificationTap,
  }) async {
    _onNotificationTap = onNotificationTap;
    
    // Request permissions
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    
    print('FCM Permission: ${settings.authorizationStatus}');
    
    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      
      // Initialize local notifications
      await _initLocalNotifications();
      
      // Get FCM token
      _fcmToken = await _messaging.getToken();
      print('FCM Token: $_fcmToken');
      
      // Listen for token refresh
      _messaging.onTokenRefresh.listen((token) {
        _fcmToken = token;
        print('FCM Token refreshed: $token');
        // TODO: Send to backend
      });
      
      // Setup message handlers
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      
      // Check for initial notification (app opened via notification)
      final initialMessage = await _messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }
    }
  }

  /// Initialize local notifications
  static Future<void> _initLocalNotifications() async {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    
    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );
    
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        if (response.payload != null) {
          final data = jsonDecode(response.payload!);
          _onNotificationTap?.call(data);
        }
      },
    );
    
    // Create notification channel for Android
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
  }

  /// Handle foreground messages
  static Future<void> _handleForegroundMessage(RemoteMessage message) async {
    print('Foreground message: ${message.messageId}');
    await _handleMessage(message, isBackground: false);
    
    // Show local notification
    _showLocalNotification(message);
  }

  /// Handle notification tap
  static void _handleNotificationTap(RemoteMessage message) {
    print('Notification tapped: ${message.messageId}');
    _onNotificationTap?.call(message.data);
  }

  /// Handle message (common logic)
  static Future<void> _handleMessage(RemoteMessage message, {required bool isBackground}) async {
    final data = message.data;
    final notificationType = data['type'];
    
    print('🔔 Notification type: $notificationType');
    print('   Data: $data');
    
    // Handle different notification types
    switch (notificationType) {
      case 'payment_reminder':
        // Handle payment reminder
        print('   💰 Payment reminder received');
        break;
        
      case 'attendance':
        // Handle attendance notification
        print('   📝 Attendance notification received');
        break;
        
      case 'announcement':
        // Handle announcement - navigate to /news
        print('   📢 Announcement received');
        break;
        
      case 'post':
        // Handle new post - navigate to /news
        print('   📰 New post received');
        break;
        
      case 'booking':
        // Handle booking confirmation - navigate to /booking
        print('   ✅ Booking confirmation received');
        break;
        
      case 'new_booking':
        // Handle new booking for coach - navigate to /schedule
        print('   📅 New booking received (coach)');
        break;
        
      case 'training_reminder':
        // Handle training reminder - navigate to /schedule
        print('   ⏰ Training reminder received');
        break;
        
      case 'message':
        // Handle new message
        print('   💬 Message received');
        break;
        
      case 'skill_update':
        // Handle skill evaluation update
        print('   ⚽ Skill update received');
        break;
        
      default:
        print('   ❓ Unknown notification type: $notificationType');
    }
  }

  /// Show local notification
  static Future<void> _showLocalNotification(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;
    
    await _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          icon: '@mipmap/ic_launcher',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  /// Get current FCM token
  static String? get fcmToken => _fcmToken;

  /// Subscribe to topic
  static Future<void> subscribeToTopic(String topic) async {
    await _messaging.subscribeToTopic(topic);
    print('Subscribed to topic: $topic');
  }

  /// Unsubscribe from topic
  static Future<void> unsubscribeFromTopic(String topic) async {
    await _messaging.unsubscribeFromTopic(topic);
    print('Unsubscribed from topic: $topic');
  }

  /// Subscribe to group notifications
  static Future<void> subscribeToGroup(int groupId) async {
    await subscribeToTopic('group_$groupId');
  }

  /// Subscribe to student notifications
  static Future<void> subscribeToStudent(int studentId) async {
    await subscribeToTopic('student_$studentId');
  }

  /// Subscribe to role-based notifications
  static Future<void> subscribeToRole(String role) async {
    await subscribeToTopic('role_$role');
  }
  
  /// Subscribe to common topics based on user role
  static Future<void> subscribeToUserTopics(String role, {List<int>? groupIds}) async {
    // All users get general announcements
    await subscribeToTopic('announcements');
    
    // Role-specific subscriptions
    await subscribeToRole(role.toLowerCase());
    
    // Group-specific subscriptions
    if (groupIds != null) {
      for (final groupId in groupIds) {
        await subscribeToGroup(groupId);
      }
    }
    
    print('🔔 Subscribed to topics for role: $role');
  }
  
  /// Get navigation route for notification type
  static String? getRouteForNotification(Map<String, dynamic> data) {
    final screen = data['screen'];
    if (screen != null) return screen;
    
    // Fallback based on type
    switch (data['type']) {
      case 'announcement':
      case 'post':
        return '/news';
      case 'booking':
        return '/booking';
      case 'new_booking':
      case 'training_reminder':
        return '/schedule';
      case 'payment_reminder':
        return '/payments';
      case 'skill_update':
        return '/students';
      default:
        return null;
    }
  }

  /// Cancel all notifications
  static Future<void> cancelAllNotifications() async {
    await _localNotifications.cancelAll();
  }

  /// Update badge count (iOS)
  static Future<void> updateBadgeCount(int count) async {
    // iOS specific badge update
  }
}


// ==================== BACKEND FCM SERVICE ====================

/// Backend service for sending push notifications via Firebase Admin SDK
/// This would be used in the Python backend
/// 
/// Example Python implementation:
/// ```python
/// import firebase_admin
/// from firebase_admin import credentials, messaging
/// 
/// cred = credentials.Certificate('firebase-adminsdk.json')
/// firebase_admin.initialize_app(cred)
/// 
/// def send_push_notification(token, title, body, data=None):
///     message = messaging.Message(
///         notification=messaging.Notification(title=title, body=body),
///         data=data or {},
///         token=token,
///     )
///     return messaging.send(message)
/// 
/// def send_to_topic(topic, title, body, data=None):
///     message = messaging.Message(
///         notification=messaging.Notification(title=title, body=body),
///         data=data or {},
///         topic=topic,
///     )
///     return messaging.send(message)
/// ```
