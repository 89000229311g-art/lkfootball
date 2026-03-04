import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/api_config.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // Expose Dio for other services
  Dio get dio => _dio;

  ApiService._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) {
        if (error.response?.statusCode == 401) {
          // Token expired, clear storage
          _storage.deleteAll();
        }
        return handler.next(error);
      },
    ));
  }

  // Auth
  Future<Map<String, dynamic>> login(String phone, String password) async {
    print('=== LOGIN DEBUG ===');
    print('URL: ${ApiConfig.baseUrl}${ApiConfig.login}');
    print('Phone: $phone');
    
    // Manual encoding for x-www-form-urlencoded
    final body = {
      'username': phone,
      'password': password,
    };
    
    try {
      final response = await _dio.post(
        ApiConfig.login,
        data: body,
        options: Options(
          contentType: Headers.formUrlEncodedContentType,
        ),
      );
      print('Response: ${response.data}');
      return response.data;
    } catch (e) {
      print('Login error: $e');
      rethrow;
    }
  }

  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get(ApiConfig.me);
    return response.data;
  }

  Future<Map<String, dynamic>> changePassword(String currentPassword, String newPassword) async {
    final response = await _dio.put(
      '${ApiConfig.apiPrefix}/auth/me/password',
      queryParameters: {
        'current_password': currentPassword,
        'new_password': newPassword,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getMyPassword() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/auth/me/password');
    return response.data;
  }

  Future<Map<String, dynamic>> resetUserPassword(int userId, String newPassword) async {
    final response = await _dio.put(
      '${ApiConfig.apiPrefix}/auth/users/$userId/password',
      queryParameters: {
        'new_password': newPassword,
      },
    );
    return response.data;
  }

  Future<Map<String, dynamic>> updateUserProfile({
    String? fullName,
    String? phone,
    String? phoneSecondary,
  }) async {
    final data = <String, dynamic>{};
    if (fullName != null) data['full_name'] = fullName;
    if (phone != null) data['phone'] = phone;
    if (phoneSecondary != null) {
      data['phone_secondary'] = phoneSecondary;
    }
    
    final response = await _dio.put(ApiConfig.me, data: data);
    return response.data;
  }

  // Avatar upload/delete for current user
  Future<Map<String, dynamic>> uploadUserAvatar(String filePath) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });
    final response = await _dio.post('${ApiConfig.apiPrefix}/users/avatar', data: formData);
    return response.data;
  }

  Future<void> deleteUserAvatar() async {
    await _dio.delete('${ApiConfig.apiPrefix}/users/avatar');
  }

  // Token management
  Future<void> saveToken(String token) async {
    await _storage.write(key: 'access_token', value: token);
  }

  Future<String?> getToken() async {
    return await _storage.read(key: 'access_token');
  }

  Future<void> clearToken() async {
    await _storage.delete(key: 'access_token');
  }

  // Users
  Future<List<dynamic>> getUsers({String? role, int skip = 0, int limit = 10000}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (role != null) params['role'] = role;
    final response = await _dio.get('${ApiConfig.apiPrefix}/auth/users', queryParameters: params);
    return _extractList(response.data);
  }

  Future<Map<String, dynamic>> createUser(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/auth/users', data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updateUser(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.apiPrefix}/auth/users/$id', data: data);
    return response.data;
  }

  Future<void> deleteUser(int id) async {
    await _dio.delete('${ApiConfig.apiPrefix}/auth/users/$id');
  }

  // Students
  Future<List<dynamic>> getStudents({int skip = 0, int limit = 10000}) async {
    final response = await _dio.get(
      ApiConfig.students,
      queryParameters: {'skip': skip, 'limit': limit},
    );
    return _extractList(response.data);
  }

  /// Get students with total count for pagination
  Future<Map<String, dynamic>> getStudentsWithTotal({int skip = 0, int limit = 10000}) async {
    final response = await _dio.get(
      ApiConfig.students,
      queryParameters: {'skip': skip, 'limit': limit},
    );
    if (response.data is Map) {
      return {
        'data': response.data['data'] ?? [],
        'total': response.data['total'] ?? 0,
      };
    }
    return {'data': response.data is List ? response.data : [], 'total': 0};
  }

  Future<Map<String, dynamic>> getStudent(int id) async {
    final response = await _dio.get('${ApiConfig.students}/$id');
    return response.data;
  }

  Future<Map<String, dynamic>> createStudent(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConfig.students, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updateStudent(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.students}/$id', data: data);
    return response.data;
  }

  Future<void> deleteStudent(int id) async {
    await _dio.delete('${ApiConfig.students}/$id');
  }

  // Student avatar upload/delete
  Future<Map<String, dynamic>> uploadStudentAvatar(int studentId, String filePath) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });
    // ApiConfig.students already has trailing slash: /api/v1/students/
    final response = await _dio.post('${ApiConfig.students}$studentId/avatar', data: formData);
    return response.data;
  }

  Future<void> deleteStudentAvatar(int studentId) async {
    await _dio.delete('${ApiConfig.students}$studentId/avatar');
  }

  // Get subscription payment status for a student
  Future<Map<String, dynamic>> getSubscriptionStatus(int studentId) async {
    final response = await _dio.get('${ApiConfig.students}$studentId/subscription-status');
    return response.data;
  }

  Future<void> notifyPayment(int studentId) async {
    await _dio.post('${ApiConfig.students}$studentId/notify-payment');
  }

  Future<void> transferStudent(int studentId, int newGroupId) async {
    await _dio.post('${ApiConfig.students}$studentId/transfer', queryParameters: {'new_group_id': newGroupId});
  }

  // 💰 Individual Fee Management (скидки)
  Future<Map<String, dynamic>> setIndividualFee(int studentId, {double? individualFee, String? reason}) async {
    final params = <String, dynamic>{};
    if (individualFee != null) params['individual_fee'] = individualFee;
    if (reason != null) params['fee_discount_reason'] = reason;
    final response = await _dio.put(
      '${ApiConfig.students}$studentId/individual-fee',
      queryParameters: params,
    );
    return response.data;
  }

  Future<Map<String, dynamic>> getFeeInfo(int studentId) async {
    final response = await _dio.get('${ApiConfig.students}$studentId/fee-info');
    return response.data;
  }

  Future<void> clearIndividualFee(int studentId) async {
    await _dio.put('${ApiConfig.students}$studentId/individual-fee');
  }

  // Helper to extract list from paginated response
  List<dynamic> _extractList(dynamic responseData) {
    if (responseData is Map && responseData.containsKey('data')) {
      return responseData['data'] as List<dynamic>;
    }
    if (responseData is List) {
      return responseData;
    }
    return [];
  }

  // Groups
  Future<List<dynamic>> getGroups({int skip = 0, int limit = 10000}) async {
    final response = await _dio.get(
      ApiConfig.groups,
      queryParameters: {'skip': skip, 'limit': limit},
    );
    return _extractList(response.data);
  }

  Future<Map<String, dynamic>> getGroup(int id) async {
    final response = await _dio.get('${ApiConfig.groups}/$id');
    return response.data;
  }

  Future<Map<String, dynamic>> createGroup(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConfig.groups, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updateGroup(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.groups}/$id', data: data);
    return response.data;
  }

  Future<void> deleteGroup(int id) async {
    await _dio.delete('${ApiConfig.groups}/$id');
  }

  // Events
  Future<List<dynamic>> getEvents({int skip = 0, int limit = 10000, DateTime? startDate, DateTime? endDate}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (startDate != null) params['start_date'] = startDate.toIso8601String();
    if (endDate != null) params['end_date'] = endDate.toIso8601String();
    
    final response = await _dio.get(
      ApiConfig.events,
      queryParameters: params,
    );
    return _extractList(response.data);
  }

  Future<Map<String, dynamic>> getEvent(int id) async {
    final response = await _dio.get('${ApiConfig.events}/$id');
    return response.data;
  }

  Future<Map<String, dynamic>> createEvent(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConfig.events, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updateEvent(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.events}/$id', data: data);
    return response.data;
  }

  Future<void> deleteEvent(int id) async {
    await _dio.delete('${ApiConfig.events}/$id');
  }

  // Attendance
  Future<List<dynamic>> getAttendance({int? eventId, int skip = 0, int limit = 10000}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (eventId != null) params['event_id'] = eventId;
    final response = await _dio.get(ApiConfig.attendance, queryParameters: params);
    return _extractList(response.data);
  }

  Future<Map<String, dynamic>> createAttendance(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConfig.attendance, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updateAttendance(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.attendance}/$id', data: data);
    return response.data;
  }

  Future<List<dynamic>> getStudentAttendance(int studentId) async {
    final response = await _dio.get('${ApiConfig.attendance}student/$studentId');
    return _extractList(response.data);
  }

  /// Get monthly attendance statistics for a student
  Future<Map<String, dynamic>> getStudentAttendanceStats(int studentId, {int? year}) async {
    final params = <String, dynamic>{};
    if (year != null) params['year'] = year;
    final response = await _dio.get(
      '${ApiConfig.students}$studentId/attendance-stats',
      queryParameters: params,
    );
    return response.data;
  }

  /// 🆕 Get monthly attendance report for a group (timesheet/табель)
  Future<Map<String, dynamic>> getMonthlyAttendanceReport(int groupId, int year, int month) async {
    final response = await _dio.get(
      '${ApiConfig.attendance}monthly-report',
      queryParameters: {
        'group_id': groupId,
        'year': year,
        'month': month,
      },
    );
    return response.data;
  }

  // Payments
  Future<List<dynamic>> getPayments({int? studentId, int skip = 0, int limit = 10000}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (studentId != null) params['student_id'] = studentId;
    final response = await _dio.get(ApiConfig.payments, queryParameters: params);
    return _extractList(response.data);
  }

  Future<Map<String, dynamic>> createPayment(Map<String, dynamic> data) async {
    final response = await _dio.post(ApiConfig.payments, data: data);
    return response.data;
  }

  Future<Map<String, dynamic>> updatePayment(int id, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.payments}/$id', data: data);
    return response.data;
  }

  Future<void> deletePayment(int id) async {
    await _dio.delete('${ApiConfig.payments}/$id');
  }

  // ==================== PAYMENT STATUS (Parent) ====================
  
  /// Get payment status for current parent - shows debt info
  Future<Map<String, dynamic>> getMyPaymentStatus({String? period}) async {
    final params = <String, dynamic>{};
    if (period != null) params['period'] = period;
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/payments/status',
      queryParameters: params,
    );
    return response.data;
  }

  /// Get list of pending payments (debts) for current parent
  Future<List<dynamic>> getMyDebts() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/payments/my-debts');
    return _extractList(response.data);
  }

  /// Get pending payments for admin (all or by group)
  Future<List<dynamic>> getPendingPayments({int? groupId}) async {
    final params = <String, dynamic>{};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/payments/pending',
      queryParameters: params,
    );
    return _extractList(response.data);
  }

  /// Invoice entire group (Admin only)
  Future<Map<String, dynamic>> invoiceGroup(int groupId, String paymentPeriod, {double? customAmount}) async {
    final data = <String, dynamic>{'payment_period': paymentPeriod};
    if (customAmount != null) data['custom_amount'] = customAmount;
    final response = await _dio.post(
      '${ApiConfig.apiPrefix}/payments/invoice/group/$groupId',
      data: data,
    );
    return response.data;
  }

  /// Invoice individual student (Admin only)
  Future<Map<String, dynamic>> invoiceStudent(int studentId, String paymentPeriod, double amount) async {
    final response = await _dio.post(
      '${ApiConfig.apiPrefix}/payments/invoice/student/$studentId',
      data: {'payment_period': paymentPeriod, 'amount': amount},
    );
    return response.data;
  }

  /// Confirm payment - change from pending to completed (Admin only)
  Future<Map<String, dynamic>> confirmPayment(int paymentId, {String method = 'cash', String? referenceId}) async {
    final data = <String, dynamic>{'method': method};
    if (referenceId != null) data['reference_id'] = referenceId;
    final response = await _dio.put(
      '${ApiConfig.apiPrefix}/payments/$paymentId/confirm',
      data: data,
    );
    return response.data;
  }

  // ==================== DEBTORS (Admin) ====================
  
  /// Get list of debtors - students with overdue payments (Admin only)
  Future<Map<String, dynamic>> getDebtors({int minDebtDays = 0, int? groupId}) async {
    final params = <String, dynamic>{'min_debt_days': minDebtDays};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/admin-improvements/debtors',
      queryParameters: params,
    );
    return response.data;
  }

  // Messages
  Future<List<dynamic>> getMessages({int? userId, int skip = 0, int limit = 10000}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (userId != null) params['user_id'] = userId;
    final response = await _dio.get(ApiConfig.messages, queryParameters: params);
    return _extractList(response.data);
  }

  Future<List<dynamic>> getAnnouncements({int? groupId, bool generalOnly = false, int skip = 0, int limit = 50}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (groupId != null) params['group_id'] = groupId;
    if (generalOnly) params['general_only'] = true;
    final response = await _dio.get('${ApiConfig.messages}announcements', queryParameters: params);
    return _extractList(response.data);
  }

  Future<List<dynamic>> createAnnouncement(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.messages}announcements', data: data);
    return response.data; // Returns list of messages created
  }

  Future<Map<String, dynamic>> sendGroupMessage(int groupId, Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.messages}group/$groupId', data: data);
    return response.data;
  }

  Future<List<dynamic>> getGroupMessages(int groupId, {int skip = 0, int limit = 100}) async {
    final response = await _dio.get(
      '${ApiConfig.messages}group/$groupId',
      queryParameters: {'skip': skip, 'limit': limit},
    );
    return _extractList(response.data);
  }

  Future<List<dynamic>> getChatUsers() async {
    final response = await _dio.get(ApiConfig.messagesUsers);
    return response.data;
  }

  Future<List<dynamic>> getChatGroups() async {
    final response = await _dio.get(ApiConfig.messagesGroups);
    return response.data;
  }

  // DEPRECATED: Use sendDirectMessage, sendGroupMessage, or createAnnouncement instead
  Future<Map<String, dynamic>> sendMessage(Map<String, dynamic> data) async {
    // Route to correct endpoint based on chat_type
    final chatType = data['chat_type']?.toString() ?? '';
    final content = data['content'] ?? '';
    
    if (chatType == 'direct' && data['recipient_id'] != null) {
      return await sendDirectMessage(data['recipient_id'], {'content': content});
    } else if (chatType == 'group' && data['group_id'] != null) {
      return await sendGroupMessage(data['group_id'], {'content': content});
    } else {
      // Broadcast/Admin - create announcement
      final result = await createAnnouncement({
        'content': content,
        'is_general': true,
        'group_ids': [],
      });
      // createAnnouncement returns List, convert to Map
      return result.isNotEmpty ? (result[0] as Map<String, dynamic>) : {};
    }
  }

  Future<Map<String, dynamic>> sendDirectMessage(int userId, Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.messages}direct/$userId', data: data);
    return response.data;
  }

  Future<List<dynamic>> getDirectMessages(int userId, {int skip = 0, int limit = 100}) async {
    final response = await _dio.get(
      '${ApiConfig.messages}direct/$userId',
      queryParameters: {'skip': skip, 'limit': limit},
    );
    return _extractList(response.data);
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get(ApiConfig.messagesUnread);
    return response.data['unread_count'] ?? 0;
  }

  Future<void> markMessageAsRead(int id) async {
    await _dio.put('${ApiConfig.messages}$id/read');
  }

  // Media Upload
  Future<Map<String, dynamic>> uploadMedia(String filePath) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
    });
    final response = await _dio.post('${ApiConfig.apiPrefix}/media', data: formData);
    return response.data;
  }

  // ==================== ANALYTICS ====================
  
  /// Get analytics summary for admin dashboard
  Future<Map<String, dynamic>> getAnalyticsSummary() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/summary');
    return response.data;
  }

  /// Get revenue analytics by period
  Future<Map<String, dynamic>> getRevenueAnalytics({
    String period = 'month',
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    final params = <String, dynamic>{'period': period};
    if (startDate != null) params['start_date'] = startDate.toIso8601String().split('T')[0];
    if (endDate != null) params['end_date'] = endDate.toIso8601String().split('T')[0];
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/revenue', queryParameters: params);
    return response.data;
  }

  /// Get attendance analytics
  Future<Map<String, dynamic>> getAttendanceAnalytics({
    int? groupId,
    String period = 'month',
  }) async {
    final params = <String, dynamic>{'period': period};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/attendance', queryParameters: params);
    return response.data;
  }

  /// Get students funnel analytics (trial -> enrolled -> active)
  Future<Map<String, dynamic>> getFunnelAnalytics() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/funnel');
    return response.data;
  }

  /// Get debtors list with details
  Future<List<dynamic>> getDebtorsList() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/debtors');
    return _extractList(response.data);
  }

  // ==================== COACH ANALYTICS ====================
  
  /// Get coach performance metrics
  Future<Map<String, dynamic>> getCoachAnalytics({int? coachId}) async {
    final params = <String, dynamic>{};
    if (coachId != null) params['coach_id'] = coachId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/analytics/coach', queryParameters: params);
    return response.data;
  }

  /// Get coach schedule and workload
  Future<List<dynamic>> getCoachSchedule(int coachId, {DateTime? weekStart}) async {
    final params = <String, dynamic>{};
    if (weekStart != null) params['week_start'] = weekStart.toIso8601String().split('T')[0];
    final response = await _dio.get('${ApiConfig.apiPrefix}/coach/$coachId/schedule', queryParameters: params);
    return _extractList(response.data);
  }

  // ==================== SCHEDULE ====================
  
  /// Get weekly schedule for all groups/coaches
  Future<List<dynamic>> getWeeklySchedule({DateTime? weekStart, int? groupId, int? coachId}) async {
    final params = <String, dynamic>{};
    if (weekStart != null) params['week_start'] = weekStart.toIso8601String().split('T')[0];
    if (groupId != null) params['group_id'] = groupId;
    if (coachId != null) params['coach_id'] = coachId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/events/schedule', queryParameters: params);
    return _extractList(response.data);
  }

  // ==================== COMMUNICATIONS ====================
  
  /// Send bulk SMS to multiple recipients
  Future<Map<String, dynamic>> sendBulkSMS({
    required String message,
    List<int>? studentIds,
    List<int>? groupIds,
    bool allStudents = false,
    bool debtorsOnly = false,
  }) async {
    final data = {
      'message': message,
      'student_ids': studentIds ?? [],
      'group_ids': groupIds ?? [],
      'all_students': allStudents,
      'debtors_only': debtorsOnly,
    };
    final response = await _dio.post('${ApiConfig.apiPrefix}/messages/bulk-sms', data: data);
    return response.data;
  }

  /// Send reminder to all debtors
  Future<Map<String, dynamic>> sendReminderToAllDebtors() async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/students/notify-all-debtors');
    return response.data;
  }

  /// Get communication templates
  Future<List<dynamic>> getMessageTemplates() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/messages/templates');
    return _extractList(response.data);
  }

  // ==================== NEWS FEED / POSTS ====================
  
  /// Get posts/news feed
  Future<List<dynamic>> getPosts({int? groupId, int skip = 0, int limit = 20}) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/posts/', queryParameters: params);
    return _extractList(response.data);
  }

  /// Create new post
  Future<Map<String, dynamic>> createPost(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/posts/', data: data);
    return response.data;
  }

  /// React to post (like, etc)
  Future<void> reactToPost(int postId, String reactionType) async {
    await _dio.post('${ApiConfig.apiPrefix}/posts/$postId/react', data: {'reaction_type': reactionType});
  }

  /// Confirm announcement read
  Future<void> confirmAnnouncementRead(int postId) async {
    await _dio.post('${ApiConfig.apiPrefix}/posts/$postId/confirm');
  }

  // ==================== BOOKING (Individual Training) ====================
  
  /// Get available booking slots for a coach
  Future<List<dynamic>> getAvailableSlots({
    required int coachId,
    required DateTime date,
  }) async {
    final params = <String, dynamic>{
      'coach_id': coachId,
      'date': date.toIso8601String().split('T')[0],
    };
    final response = await _dio.get('${ApiConfig.apiPrefix}/events/available-slots', queryParameters: params);
    return _extractList(response.data);
  }

  /// Book individual training slot
  Future<Map<String, dynamic>> bookIndividualTraining({
    required int coachId,
    required DateTime startTime,
    required String studentName,
    required String phone,
    String? notes,
  }) async {
    final data = {
      'coach_id': coachId,
      'start_time': startTime.toIso8601String(),
      'student_name': studentName,
      'phone': phone,
      'notes': notes,
      'type': 'individual',
    };
    final response = await _dio.post('${ApiConfig.apiPrefix}/events/book', data: data);
    return response.data;
  }

  /// Get my bookings (for parent)
  Future<List<dynamic>> getMyBookings() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/events/my-bookings');
    return _extractList(response.data);
  }

  /// Cancel booking
  Future<void> cancelBooking(int eventId) async {
    await _dio.delete('${ApiConfig.apiPrefix}/events/$eventId/cancel');
  }

  // ==================== SCHEDULE TEMPLATES ====================
  
  /// Get schedule templates list
  Future<List<dynamic>> getScheduleTemplates({int? groupId}) async {
    final params = <String, dynamic>{};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/schedule/templates', queryParameters: params);
    return response.data is List ? response.data : [];
  }
  
  /// Get group schedule preview
  Future<Map<String, dynamic>> getGroupSchedulePreview(int groupId) async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/schedule/groups/$groupId/schedule-preview');
    return response.data;
  }
  
  /// Get calendar for month
  Future<Map<String, dynamic>> getScheduleCalendar(int year, int month, {int? groupId}) async {
    final params = <String, dynamic>{'year': year, 'month': month};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/schedule/calendar/month', queryParameters: params);
    return response.data;
  }
  
  /// Create schedule template
  Future<Map<String, dynamic>> createScheduleTemplate(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/schedule/templates', data: data);
    return response.data;
  }
  
  /// Update schedule template
  Future<Map<String, dynamic>> updateScheduleTemplate(int templateId, Map<String, dynamic> data) async {
    final response = await _dio.put('${ApiConfig.apiPrefix}/schedule/templates/$templateId', data: data);
    return response.data;
  }
  
  /// Delete schedule template
  Future<void> deleteScheduleTemplate(int templateId) async {
    await _dio.delete('${ApiConfig.apiPrefix}/schedule/templates/$templateId');
  }
  
  /// Generate events from template
  Future<Map<String, dynamic>> generateEventsFromTemplate(int templateId, {String? startDate, String? endDate}) async {
    final params = <String, dynamic>{};
    if (startDate != null) params['start_date'] = startDate;
    if (endDate != null) params['end_date'] = endDate;
    final response = await _dio.post(
      '${ApiConfig.apiPrefix}/schedule/templates/$templateId/generate',
      queryParameters: params,
    );
    return response.data;
  }
  
  /// Add exclusion date (holiday, vacation)
  Future<Map<String, dynamic>> addScheduleExclusion(int templateId, String dateStr, {String? reason}) async {
    final params = <String, dynamic>{'date_str': dateStr};
    if (reason != null) params['reason'] = reason;
    final response = await _dio.post(
      '${ApiConfig.apiPrefix}/schedule/templates/$templateId/add-exclusion',
      queryParameters: params,
    );
    return response.data;
  }

  // ==================== SKILLS & PLAYER CARDS ====================
  
  /// Get student skills history
  Future<List<dynamic>> getStudentSkills(int studentId) async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/skills/student/$studentId');
    return response.data is List ? response.data : [];
  }
  
  /// Get student skills history for charts
  Future<Map<String, dynamic>> getStudentSkillsHistory(int studentId, {int limit = 12}) async {
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/skills/student/$studentId/history',
      queryParameters: {'limit': limit},
    );
    return response.data;
  }
  
  /// Create or update skill rating
  Future<Map<String, dynamic>> createSkillRating({
    required int studentId,
    required int ratingMonth,
    required int ratingYear,
    required int technique,
    required int speed,
    required int discipline,
    required int teamwork,
    required int endurance,
    String? coachComment,
  }) async {
    final data = {
      'student_id': studentId,
      'rating_month': ratingMonth,
      'rating_year': ratingYear,
      'technique': technique,
      'speed': speed,
      'discipline': discipline,
      'teamwork': teamwork,
      'endurance': endurance,
      if (coachComment != null) 'coach_comment': coachComment,
    };
    final response = await _dio.post('${ApiConfig.apiPrefix}/skills/', data: data);
    return response.data;
  }
  
  /// Get player card data (full info with skills, payments, attendance)
  Future<Map<String, dynamic>> getPlayerCard(int studentId) async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/skills/player-card/$studentId');
    return response.data;
  }

  // ==================== SALARY MANAGEMENT ====================
  
  /// Get salary contracts for a user
  Future<List<dynamic>> getSalaryContracts({int? userId, bool activeOnly = true}) async {
    final params = <String, dynamic>{'active_only': activeOnly};
    if (userId != null) params['user_id'] = userId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/salaries/contracts', queryParameters: params);
    return _extractList(response.data);
  }
  
  /// Create salary contract
  Future<Map<String, dynamic>> createSalaryContract(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/salaries/contracts', data: data);
    return response.data;
  }
  
  /// Get salary payments with filters
  Future<Map<String, dynamic>> getSalaryPayments({
    int? userId,
    int? year,
    int? month,
    String? paymentType,
    int skip = 0,
    int limit = 100,
  }) async {
    final params = <String, dynamic>{'skip': skip, 'limit': limit};
    if (userId != null) params['user_id'] = userId;
    if (year != null) params['year'] = year;
    if (month != null) params['month'] = month;
    if (paymentType != null) params['payment_type'] = paymentType;
    final response = await _dio.get('${ApiConfig.apiPrefix}/salaries/payments', queryParameters: params);
    return response.data;
  }
  
  /// Create salary payment
  Future<Map<String, dynamic>> createSalaryPayment(Map<String, dynamic> data) async {
    final response = await _dio.post('${ApiConfig.apiPrefix}/salaries/payments', data: data);
    return response.data;
  }
  
  /// Get my salary payments (for current user)
  Future<Map<String, dynamic>> getMySalaryPayments() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/salaries/my-payments');
    return response.data;
  }
  
  /// Calculate salary for a user for a specific period
  Future<Map<String, dynamic>> calculateSalary(int userId, int year, int month) async {
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/salaries/calculate/$userId',
      queryParameters: {'year': year, 'month': month},
    );
    return response.data;
  }
  
  /// Get salary report for a period
  Future<Map<String, dynamic>> getSalaryReport(int year, int month) async {
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/salaries/report',
      queryParameters: {'year': year, 'month': month},
    );
    return response.data;
  }
  
  /// Get staff list (employees that can receive salary)
  Future<List<dynamic>> getStaff() async {
    final response = await _dio.get('${ApiConfig.apiPrefix}/salaries/staff');
    return _extractList(response.data);
  }

  // ==================== SCHEDULE CHANGES ====================
  
  /// Get schedule changes (notifications about cancelled/rescheduled events)
  Future<List<dynamic>> getScheduleChanges({int? groupId, int limit = 50}) async {
    final params = <String, dynamic>{'limit': limit};
    if (groupId != null) params['group_id'] = groupId;
    final response = await _dio.get('${ApiConfig.apiPrefix}/schedule/changes', queryParameters: params);
    return (response.data['data'] ?? []) as List<dynamic>;
  }
  
  /// Get my schedule changes (for current user's groups)
  Future<List<dynamic>> getMyScheduleChanges({int limit = 20}) async {
    final response = await _dio.get(
      '${ApiConfig.apiPrefix}/schedule/changes/my',
      queryParameters: {'limit': limit},
    );
    return (response.data['changes'] ?? []) as List<dynamic>;
  }
}
