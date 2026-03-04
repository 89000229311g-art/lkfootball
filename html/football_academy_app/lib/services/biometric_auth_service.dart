/// Biometric Authentication Service
/// Provides fingerprint and face recognition login
library;

import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class BiometricAuthService {
  static final LocalAuthentication _localAuth = LocalAuthentication();
  static const FlutterSecureStorage _secureStorage = FlutterSecureStorage();
  
  // Keys for secure storage
  static const String _biometricEnabledKey = 'biometric_enabled';
  static const String _savedTokenKey = 'saved_auth_token';
  static const String _savedUserIdKey = 'saved_user_id';

  /// Check if device supports biometric authentication
  static Future<bool> isBiometricAvailable() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isDeviceSupported = await _localAuth.isDeviceSupported();
      return canCheck && isDeviceSupported;
    } on PlatformException catch (_) {
      return false;
    }
  }

  /// Get available biometric types
  static Future<List<BiometricType>> getAvailableBiometrics() async {
    try {
      return await _localAuth.getAvailableBiometrics();
    } on PlatformException catch (_) {
      return [];
    }
  }

  /// Authenticate using biometrics
  static Future<bool> authenticate({
    required String reason,
  }) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Allow PIN/pattern as fallback
          useErrorDialogs: true,
        ),
      );
    } on PlatformException catch (e) {
      print('Biometric auth error: $e');
      return false;
    }
  }

  /// Check if biometric login is enabled
  static Future<bool> isBiometricLoginEnabled() async {
    final value = await _secureStorage.read(key: _biometricEnabledKey);
    return value == 'true';
  }

  /// Enable biometric login and save credentials
  static Future<void> enableBiometricLogin({
    required String token,
    required String userId,
    required String localizedReason,
    required String errorMsg,
  }) async {
    // First verify biometric
    final authenticated = await authenticate(
      reason: localizedReason,
    );
    
    if (!authenticated) {
      throw Exception(errorMsg);
    }

    // Save credentials securely
    await _secureStorage.write(key: _biometricEnabledKey, value: 'true');
    await _secureStorage.write(key: _savedTokenKey, value: token);
    await _secureStorage.write(key: _savedUserIdKey, value: userId);
  }

  /// Disable biometric login
  static Future<void> disableBiometricLogin() async {
    await _secureStorage.delete(key: _biometricEnabledKey);
    await _secureStorage.delete(key: _savedTokenKey);
    await _secureStorage.delete(key: _savedUserIdKey);
  }

  /// Login with biometrics
  static Future<Map<String, String>?> loginWithBiometric({
    required String localizedReason,
  }) async {
    // Check if enabled
    final isEnabled = await isBiometricLoginEnabled();
    if (!isEnabled) {
      return null;
    }

    // Authenticate
    final authenticated = await authenticate(reason: localizedReason);
    if (!authenticated) {
      return null;
    }

    // Get saved credentials
    final token = await _secureStorage.read(key: _savedTokenKey);
    final userId = await _secureStorage.read(key: _savedUserIdKey);

    if (token == null || userId == null) {
      return null;
    }

    return {
      'token': token,
      'userId': userId,
    };
  }

  /// Update saved token (e.g., after token refresh)
  static Future<void> updateSavedToken(String newToken) async {
    final isEnabled = await isBiometricLoginEnabled();
    if (isEnabled) {
      await _secureStorage.write(key: _savedTokenKey, value: newToken);
    }
  }

  /// Get biometric type name key for Localization
  static Future<String> getBiometricTypeKey() async {
    final biometrics = await getAvailableBiometrics();
    
    if (biometrics.contains(BiometricType.face)) {
      return 'face_id';
    } else if (biometrics.contains(BiometricType.fingerprint)) {
      return 'fingerprint';
    } else if (biometrics.contains(BiometricType.iris)) {
      return 'iris_scanner';
    } else if (biometrics.contains(BiometricType.strong) || 
               biometrics.contains(BiometricType.weak)) {
      return 'biometrics';
    }
    
    return 'biometrics_unavailable';
  }
}
