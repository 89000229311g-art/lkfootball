import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import '../services/api_service.dart';

enum AuthStatus { initial, authenticated, unauthenticated, loading }

class AuthProvider with ChangeNotifier {
  final ApiService _apiService = ApiService();
  
  AuthStatus _status = AuthStatus.initial;
  User? _user;
  String? _error;

  AuthStatus get status => _status;
  User? get user => _user;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  AuthProvider() {
    checkAuth();
  }

  Future<void> checkAuth() async {
    _status = AuthStatus.loading;
    notifyListeners();

    try {
      final token = await _apiService.getToken();
      if (token != null) {
        final userData = await _apiService.getMe();
        _user = User.fromJson(userData);
        _status = AuthStatus.authenticated;
        
        // Синхронизируем язык с бэкенда
        await _syncLanguageFromBackend(userData);
      } else {
        _status = AuthStatus.unauthenticated;
      }
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      await _apiService.clearToken();
    }
    notifyListeners();
  }

  Future<bool> login(String phone, String password) async {
    _status = AuthStatus.loading;
    _error = null;
    notifyListeners();

    try {
      final response = await _apiService.login(phone, password);
      final token = response['access_token'];
      await _apiService.saveToken(token);
      
      final userData = await _apiService.getMe();
      _user = User.fromJson(userData);
      _status = AuthStatus.authenticated;
      
      // Синхронизируем язык с бэкенда
      await _syncLanguageFromBackend(userData);
      
      notifyListeners();
      return true;
    } catch (e) {
      print("Login Error: $e");
      _status = AuthStatus.unauthenticated;
      _error = 'Ошибка входа: $e'; // Show real error for debugging
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _apiService.clearToken();
    _user = null;
    _status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  // Reload user data (useful after avatar upload)
  Future<void> loadUser() async {
    try {
      final userData = await _apiService.getMe();
      _user = User.fromJson(userData);
      notifyListeners();
    } catch (e) {
      print('Error loading user: $e');
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
  
  // Синхронизация языка с бэкенда
  Future<void> _syncLanguageFromBackend(Map<String, dynamic> userData) async {
    try {
      final backendLang = userData['preferred_language'] as String?;
      if (backendLang == null || (backendLang != 'ru' && backendLang != 'ro')) {
        return; // Не установлен или неподдерживаемый язык
      }
      
      final prefs = await SharedPreferences.getInstance();
      final localLang = prefs.getString('language_code');
      
      // Если язык в бэкенде отличается, обновляем локально
      if (localLang != backendLang) {
        await prefs.setString('language_code', backendLang);
        print('✅ Language synced from backend: $backendLang');
      }
    } catch (e) {
      print('❌ Failed to sync language from backend: $e');
    }
  }
}
