/// Offline Data Storage Service
/// Provides SQLite database for caching data offline
library;

import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'dart:convert';

class OfflineStorageService {
  static Database? _database;
  static const String _dbName = 'sunny_academy_offline.db';
  static const int _dbVersion = 1;

  /// Get database instance (singleton)
  static Future<Database> get database async {
    _database ??= await _initDatabase();
    return _database!;
  }

  /// Initialize database
  static Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _dbName);

    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  /// Create database tables
  static Future<void> _onCreate(Database db, int version) async {
    // Students cache
    await db.execute('''
      CREATE TABLE students (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    // Groups cache
    await db.execute('''
      CREATE TABLE groups (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    // Attendance cache (for offline marking)
    await db.execute('''
      CREATE TABLE attendance_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    ''');

    // Payments cache
    await db.execute('''
      CREATE TABLE payments_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_period TEXT NOT NULL,
        synced INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    ''');

    // Posts/News cache
    await db.execute('''
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    // Generic cache table for any data
    await db.execute('''
      CREATE TABLE cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )
    ''');
  }

  /// Upgrade database schema
  static Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Handle migrations here
  }

  // ==================== STUDENTS ====================

  /// Cache students list
  static Future<void> cacheStudents(List<Map<String, dynamic>> students) async {
    final db = await database;
    final batch = db.batch();
    final now = DateTime.now().millisecondsSinceEpoch;

    for (final student in students) {
      batch.insert(
        'students',
        {
          'id': student['id'],
          'data': jsonEncode(student),
          'updated_at': now,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }

    await batch.commit(noResult: true);
  }

  /// Get cached students
  static Future<List<Map<String, dynamic>>> getCachedStudents() async {
    final db = await database;
    final results = await db.query('students');
    
    return results.map((row) {
      return jsonDecode(row['data'] as String) as Map<String, dynamic>;
    }).toList();
  }

  /// Get single cached student
  static Future<Map<String, dynamic>?> getCachedStudent(int id) async {
    final db = await database;
    final results = await db.query(
      'students',
      where: 'id = ?',
      whereArgs: [id],
    );
    
    if (results.isEmpty) return null;
    return jsonDecode(results.first['data'] as String) as Map<String, dynamic>;
  }

  // ==================== ATTENDANCE ====================

  /// Save attendance for later sync
  static Future<int> saveAttendanceOffline({
    required int studentId,
    required String date,
    required String status,
  }) async {
    final db = await database;
    
    return db.insert('attendance_cache', {
      'student_id': studentId,
      'date': date,
      'status': status,
      'synced': 0,
      'created_at': DateTime.now().millisecondsSinceEpoch,
    });
  }

  /// Get unsynced attendance records
  static Future<List<Map<String, dynamic>>> getUnsyncedAttendance() async {
    final db = await database;
    return db.query(
      'attendance_cache',
      where: 'synced = ?',
      whereArgs: [0],
    );
  }

  /// Mark attendance as synced
  static Future<void> markAttendanceSynced(int id) async {
    final db = await database;
    await db.update(
      'attendance_cache',
      {'synced': 1},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  /// Delete synced attendance (cleanup)
  static Future<int> cleanupSyncedAttendance() async {
    final db = await database;
    return db.delete(
      'attendance_cache',
      where: 'synced = ?',
      whereArgs: [1],
    );
  }

  // ==================== GENERIC CACHE ====================

  /// Set cache value with optional expiry
  static Future<void> setCache(String key, dynamic value, {Duration? ttl}) async {
    final db = await database;
    final expiresAt = ttl != null 
        ? DateTime.now().add(ttl).millisecondsSinceEpoch 
        : null;

    await db.insert(
      'cache',
      {
        'key': key,
        'value': jsonEncode(value),
        'expires_at': expiresAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Get cache value
  static Future<dynamic> getCache(String key) async {
    final db = await database;
    final results = await db.query(
      'cache',
      where: 'key = ?',
      whereArgs: [key],
    );

    if (results.isEmpty) return null;

    final row = results.first;
    final expiresAt = row['expires_at'] as int?;

    // Check expiry
    if (expiresAt != null && DateTime.now().millisecondsSinceEpoch > expiresAt) {
      await deleteCache(key);
      return null;
    }

    return jsonDecode(row['value'] as String);
  }

  /// Delete cache value
  static Future<void> deleteCache(String key) async {
    final db = await database;
    await db.delete('cache', where: 'key = ?', whereArgs: [key]);
  }

  /// Clear all cache
  static Future<void> clearAllCache() async {
    final db = await database;
    await db.delete('cache');
    await db.delete('students');
    await db.delete('groups');
    await db.delete('posts');
  }

  /// Clear expired cache entries
  static Future<int> clearExpiredCache() async {
    final db = await database;
    final now = DateTime.now().millisecondsSinceEpoch;
    
    return db.delete(
      'cache',
      where: 'expires_at IS NOT NULL AND expires_at < ?',
      whereArgs: [now],
    );
  }
}
