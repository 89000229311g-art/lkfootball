import 'package:flutter/foundation.dart';

class ApiConfig {
  // 📱 Для тестирования на эмуляторе:
  // Android эмулятор: 10.0.2.2 (специальный IP для доступа к localhost хоста)
  // iOS симулятор: localhost
  // Реальное устройство: IP вашего Mac
  
  static String get baseUrl {
    if (kIsWeb) {
      return 'http://localhost:8000';
    }
    // ✅ Для Android эмулятора - используем 10.0.2.2
    return 'http://10.0.2.2:8000';
  }
  
  // API prefix
  static const String apiPrefix = '/api/v1';
  
  // API endpoints (with trailing slash for POST compatibility)
  static const String login = '$apiPrefix/auth/login';
  static const String me = '$apiPrefix/auth/me';
  static const String students = '$apiPrefix/students/';
  static const String groups = '$apiPrefix/groups/';
  static const String events = '$apiPrefix/events/';
  static const String attendance = '$apiPrefix/attendance/';
  static const String payments = '$apiPrefix/payments/';
  static const String messages = '$apiPrefix/messages/';
  static const String messagesUsers = '$apiPrefix/messages/users';
  static const String messagesGroups = '$apiPrefix/messages/groups';
  static const String messagesUnread = '$apiPrefix/messages/unread/count';
  
  // CRM & Marketing
  static const String leads = '$apiPrefix/leads/';
  static const String campaigns = '$apiPrefix/marketing/campaigns/';
}
