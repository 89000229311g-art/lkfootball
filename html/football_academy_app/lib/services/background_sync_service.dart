/// Background Sync Service
/// Handles syncing offline data when connection is restored
library;

import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:workmanager/workmanager.dart';
import 'offline_storage_service.dart';

/// Workmanager callback dispatcher (must be top-level function)
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    print('Background task: $task');
    
    switch (task) {
      case BackgroundSyncService.syncTaskName:
        await BackgroundSyncService.performSync();
        break;
      case BackgroundSyncService.cleanupTaskName:
        await BackgroundSyncService.performCleanup();
        break;
    }
    
    return Future.value(true);
  });
}

class BackgroundSyncService {
  static const String syncTaskName = 'sync_offline_data';
  static const String cleanupTaskName = 'cleanup_cache';
  
  static StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  static bool _isSyncing = false;
  
  /// Initialize background sync
  static Future<void> init() async {
    // Initialize Workmanager
    await Workmanager().initialize(
      callbackDispatcher,
      isInDebugMode: false,
    );
    
    // Register periodic sync task (every 15 minutes)
    await Workmanager().registerPeriodicTask(
      'periodic_sync',
      syncTaskName,
      frequency: const Duration(minutes: 15),
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );
    
    // Register daily cleanup task
    await Workmanager().registerPeriodicTask(
      'daily_cleanup',
      cleanupTaskName,
      frequency: const Duration(hours: 24),
    );
    
    // Listen for connectivity changes
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen(_onConnectivityChanged);
  }
  
  /// Dispose resources
  static void dispose() {
    _connectivitySubscription?.cancel();
  }
  
  /// Handle connectivity changes
  static Future<void> _onConnectivityChanged(List<ConnectivityResult> results) async {
    final hasConnection = results.any((r) => 
      r == ConnectivityResult.wifi || 
      r == ConnectivityResult.mobile ||
      r == ConnectivityResult.ethernet
    );
    
    if (hasConnection && !_isSyncing) {
      print('Connection restored, syncing offline data...');
      await performSync();
    }
  }
  
  /// Check if device is online
  static Future<bool> isOnline() async {
    final result = await Connectivity().checkConnectivity();
    return result.any((r) => 
      r == ConnectivityResult.wifi || 
      r == ConnectivityResult.mobile ||
      r == ConnectivityResult.ethernet
    );
  }
  
  /// Perform sync of all offline data
  static Future<SyncResult> performSync() async {
    if (_isSyncing) {
      return SyncResult(success: false, message: 'Sync already in progress');
    }
    
    _isSyncing = true;
    int syncedCount = 0;
    int failedCount = 0;
    List<String> errors = [];
    
    try {
      // Check connectivity
      if (!await isOnline()) {
        return SyncResult(
          success: false,
          message: 'No internet connection',
        );
      }
      
      // Sync attendance records
      final attendanceResult = await _syncAttendance();
      syncedCount += attendanceResult.synced;
      failedCount += attendanceResult.failed;
      if (attendanceResult.error != null) {
        errors.add('Attendance: ${attendanceResult.error}');
      }
      
      // Sync payment records
      final paymentsResult = await _syncPayments();
      syncedCount += paymentsResult.synced;
      failedCount += paymentsResult.failed;
      if (paymentsResult.error != null) {
        errors.add('Payments: ${paymentsResult.error}');
      }
      
      return SyncResult(
        success: failedCount == 0,
        syncedCount: syncedCount,
        failedCount: failedCount,
        message: errors.isEmpty 
            ? 'Synced $syncedCount items'
            : errors.join('; '),
      );
      
    } catch (e) {
      return SyncResult(
        success: false,
        message: 'Sync error: $e',
      );
    } finally {
      _isSyncing = false;
    }
  }
  
  /// Sync attendance records
  static Future<_SyncItemResult> _syncAttendance() async {
    int synced = 0;
    int failed = 0;
    
    try {
      final records = await OfflineStorageService.getUnsyncedAttendance();
      
      for (final record in records) {
        try {
          // TODO: Call actual API
          // await ApiService.syncAttendance(record);
          
          // For now, just simulate success
          await Future.delayed(const Duration(milliseconds: 100));
          
          // Mark as synced
          await OfflineStorageService.markAttendanceSynced(record['id'] as int);
          synced++;
          
        } catch (e) {
          failed++;
          print('Failed to sync attendance ${record['id']}: $e');
        }
      }
      
      return _SyncItemResult(synced: synced, failed: failed);
      
    } catch (e) {
      return _SyncItemResult(synced: synced, failed: failed, error: e.toString());
    }
  }
  
  /// Sync payment records
  static Future<_SyncItemResult> _syncPayments() async {
    // Similar implementation to attendance
    return _SyncItemResult(synced: 0, failed: 0);
  }
  
  /// Perform cache cleanup
  static Future<void> performCleanup() async {
    try {
      // Clear expired cache
      final cleared = await OfflineStorageService.clearExpiredCache();
      print('Cleared $cleared expired cache entries');
      
      // Cleanup synced attendance records (older than 7 days)
      final cleaned = await OfflineStorageService.cleanupSyncedAttendance();
      print('Cleaned $cleaned synced attendance records');
      
    } catch (e) {
      print('Cleanup error: $e');
    }
  }
  
  /// Trigger immediate sync
  static Future<void> triggerImmediateSync() async {
    await Workmanager().registerOneOffTask(
      'immediate_sync_${DateTime.now().millisecondsSinceEpoch}',
      syncTaskName,
      constraints: Constraints(
        networkType: NetworkType.connected,
      ),
    );
  }
  
  /// Cancel all background tasks
  static Future<void> cancelAllTasks() async {
    await Workmanager().cancelAll();
  }
}

/// Result of sync operation
class SyncResult {
  final bool success;
  final int syncedCount;
  final int failedCount;
  final String? message;
  
  SyncResult({
    required this.success,
    this.syncedCount = 0,
    this.failedCount = 0,
    this.message,
  });
}

/// Internal sync item result
class _SyncItemResult {
  final int synced;
  final int failed;
  final String? error;
  
  _SyncItemResult({
    required this.synced,
    required this.failed,
    this.error,
  });
}
