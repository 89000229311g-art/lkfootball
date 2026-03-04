/// Deep Linking Service
/// Handles app links and navigation from external sources
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uni_links/uni_links.dart';

class DeepLinkService {
  static StreamSubscription? _linkSubscription;
  static Function(String)? _onLinkReceived;

  /// URI scheme for the app
  static const String scheme = 'sunnyacademy';
  
  /// Web domain for universal links
  static const String domain = 'app.sunnyacademy.md';

  /// Initialize deep link handling
  static Future<void> init({
    required Function(String) onLinkReceived,
  }) async {
    _onLinkReceived = onLinkReceived;

    // Handle initial link (app launched via link)
    try {
      final initialLink = await getInitialLink();
      if (initialLink != null) {
        _handleLink(initialLink);
      }
    } catch (e) {
      print('Error getting initial link: $e');
    }

    // Handle links while app is running
    _linkSubscription = linkStream.listen(
      (String? link) {
        if (link != null) {
          _handleLink(link);
        }
      },
      onError: (err) {
        print('Deep link error: $err');
      },
    );
  }

  /// Dispose resources
  static void dispose() {
    _linkSubscription?.cancel();
    _linkSubscription = null;
  }

  /// Handle incoming link
  static void _handleLink(String link) {
    print('Received deep link: $link');
    _onLinkReceived?.call(link);
  }

  /// Parse deep link and return route information
  static DeepLinkRoute? parseLink(String link) {
    try {
      final uri = Uri.parse(link);
      
      // Handle custom scheme: sunnyacademy://path
      if (uri.scheme == scheme) {
        return _parseRoute(uri.host, uri.pathSegments, uri.queryParameters);
      }
      
      // Handle universal links: https://app.sunnyacademy.md/path
      if (uri.host == domain) {
        return _parseRoute(
          uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '',
          uri.pathSegments.skip(1).toList(),
          uri.queryParameters,
        );
      }
      
      return null;
    } catch (e) {
      print('Error parsing deep link: $e');
      return null;
    }
  }

  /// Parse route from path segments
  static DeepLinkRoute? _parseRoute(
    String path, 
    List<String> segments, 
    Map<String, String> params,
  ) {
    switch (path) {
      case 'student':
        if (segments.isNotEmpty) {
          return DeepLinkRoute(
            route: '/student/${segments.first}',
            type: DeepLinkType.student,
            id: int.tryParse(segments.first),
          );
        }
        break;
        
      case 'payment':
        if (segments.isNotEmpty) {
          return DeepLinkRoute(
            route: '/payments/${segments.first}',
            type: DeepLinkType.payment,
            id: int.tryParse(segments.first),
          );
        }
        break;
        
      case 'attendance':
        return DeepLinkRoute(
          route: '/attendance',
          type: DeepLinkType.attendance,
          params: params,
        );
        
      case 'post':
      case 'news':
        if (segments.isNotEmpty) {
          return DeepLinkRoute(
            route: '/posts/${segments.first}',
            type: DeepLinkType.post,
            id: int.tryParse(segments.first),
          );
        }
        break;
        
      case 'schedule':
        return DeepLinkRoute(
          route: '/schedule',
          type: DeepLinkType.schedule,
          params: params,
        );
        
      case 'chat':
        if (segments.isNotEmpty) {
          return DeepLinkRoute(
            route: '/chat/${segments.first}',
            type: DeepLinkType.chat,
            id: int.tryParse(segments.first),
          );
        }
        break;
        
      default:
        return DeepLinkRoute(
          route: '/',
          type: DeepLinkType.home,
        );
    }
    
    return null;
  }

  /// Generate deep link for sharing
  static String generateLink({
    required DeepLinkType type,
    int? id,
    Map<String, String>? params,
  }) {
    String path;
    
    switch (type) {
      case DeepLinkType.student:
        path = 'student/$id';
        break;
      case DeepLinkType.payment:
        path = 'payment/$id';
        break;
      case DeepLinkType.post:
        path = 'post/$id';
        break;
      case DeepLinkType.attendance:
        path = 'attendance';
        break;
      case DeepLinkType.schedule:
        path = 'schedule';
        break;
      case DeepLinkType.chat:
        path = 'chat/$id';
        break;
      case DeepLinkType.home:
      default:
        path = '';
    }
    
    final uri = Uri(
      scheme: 'https',
      host: domain,
      path: path,
      queryParameters: params?.isNotEmpty == true ? params : null,
    );
    
    return uri.toString();
  }

  /// Generate app-scheme link
  static String generateAppLink({
    required DeepLinkType type,
    int? id,
  }) {
    String path;
    
    switch (type) {
      case DeepLinkType.student:
        path = 'student/$id';
        break;
      case DeepLinkType.payment:
        path = 'payment/$id';
        break;
      case DeepLinkType.post:
        path = 'post/$id';
        break;
      default:
        path = '';
    }
    
    return '$scheme://$path';
  }
}

/// Types of deep links
enum DeepLinkType {
  home,
  student,
  payment,
  post,
  attendance,
  schedule,
  chat,
}

/// Parsed deep link route
class DeepLinkRoute {
  final String route;
  final DeepLinkType type;
  final int? id;
  final Map<String, String>? params;

  DeepLinkRoute({
    required this.route,
    required this.type,
    this.id,
    this.params,
  });
}
