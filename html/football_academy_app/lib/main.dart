import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'providers/auth_provider.dart';
import 'l10n/app_localizations.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/students_screen.dart';
import 'screens/groups_screen.dart';
import 'screens/events_screen.dart';
import 'screens/attendance_screen.dart';
import 'screens/payments_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/calendar_screen.dart';
import 'screens/chat_screen.dart';
// New screens for feature parity with web
import 'screens/analytics_screen.dart';
import 'screens/coach_analytics_screen.dart';
import 'screens/schedule_screen.dart';
import 'screens/communications_screen.dart';
import 'screens/news_feed_screen.dart';
import 'screens/booking_screen.dart';
// Push notifications
import 'services/push_notification_service.dart';

// Global navigator key for push notification navigation
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize push notifications with navigation callback
  try {
    await PushNotificationService.init(
      onNotificationTap: (data) {
        final route = PushNotificationService.getRouteForNotification(data);
        if (route != null && navigatorKey.currentState != null) {
          navigatorKey.currentState!.pushNamed(route);
        }
      },
    );
  } catch (e) {
    debugPrint('⚠️ FCM init skipped: $e');
  }
  
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return Material(
      child: Scaffold(
        backgroundColor: const Color(0xFF1C2127),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(20.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 60, color: Colors.red),
                const SizedBox(height: 20),
                const Text(
                  'Произошла ошибка',
                  style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 10),
                Text(
                  details.exception.toString(),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: () {
                    // Try to pop, but we need context. Since this is a widget builder, we are building a widget.
                    // We can't easily pop from here without context if it's top level.
                    // But we can just show a message. 
                    // Actually, usually this widget replaces the broken widget.
                    // If it's a dialog that broke, this widget is inside the dialog.
                  },
                  child: const Text('Назад'),
                )
              ],
            ),
          ),
        ),
      ),
    );
  };
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => LanguageProvider()),
      ],
      child: Consumer2<AuthProvider, LanguageProvider>(
        builder: (context, auth, lang, _) {
          return MaterialApp(
            title: 'Sunny Football Academy',
            debugShowCheckedModeBanner: false,
            locale: lang.locale,
            supportedLocales: const [
              Locale('ru'),
              Locale('ro'),
            ],
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            theme: ThemeData(
              useMaterial3: true,
              brightness: Brightness.dark,
              scaffoldBackgroundColor: const Color(0xFF1C2127), // Background
              primaryColor: const Color(0xFFFFC107), // Electric Gold
              
              colorScheme: const ColorScheme.dark(
                primary: Color(0xFFFFC107),
                secondary: Color(0xFF23272E), // Card/Secondary
                surface: Color(0xFF23272E),
                onPrimary: Colors.black,
                onSecondary: Colors.white,
                onSurface: Color(0xFFFAFAFA),
                error: Color(0xFFEF4444),
              ),

              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFF1C2127),
                elevation: 0,
                centerTitle: true,
                iconTheme: IconThemeData(color: Colors.white),
                titleTextStyle: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),

              cardTheme: CardThemeData(
                color: const Color(0xFF23272E),
                elevation: 4,
                shadowColor: Colors.black26,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(
                    color: Color(0xFF2D323B), // Border color
                    width: 1,
                  ),
                ),
              ),

              inputDecorationTheme: InputDecorationTheme(
                filled: true,
                fillColor: const Color(0xFF23272E),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF2D323B)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFF2D323B)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFFFC107), width: 2),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 16,
                ),
                labelStyle: const TextStyle(color: Colors.grey),
              ),

              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFC107),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  textStyle: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
              
              textButtonTheme: TextButtonThemeData(
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFFFC107),
                ),
              ),

              iconTheme: const IconThemeData(
                color: Color(0xFFFFC107),
              ),
              
              dividerTheme: const DividerThemeData(
                color: Color(0xFF2D323B),
                thickness: 1,
              ),
            ),
            home: _buildHome(auth),
            navigatorKey: navigatorKey,  // Use global navigator key for push notifications
            routes: {
              '/login': (context) => const LoginScreen(),
              '/home': (context) => const HomeScreen(),
              '/students': (context) => const StudentsScreen(),
              '/groups': (context) => const GroupsScreen(),
              '/events': (context) => const EventsScreen(),
              '/attendance': (context) => const AttendanceScreen(),
              '/payments': (context) => const PaymentsScreen(),
              '/settings': (context) => const SettingsScreen(),
              '/profile': (context) => const ProfileScreen(),
              '/calendar': (context) => const CalendarScreen(),
              '/chat': (context) => const ChatScreen(),
              // New routes for feature parity with web
              '/analytics': (context) => const AnalyticsScreen(),
              '/coach-analytics': (context) => const CoachAnalyticsScreen(),
              '/schedule': (context) => const ScheduleScreen(),
              '/communications': (context) => const CommunicationsScreen(),
              '/news': (context) => const NewsFeedScreen(),
              '/booking': (context) => const BookingScreen(),
            },
          );
        },
      ),
    );
  }

  Widget _buildHome(AuthProvider auth) {
    switch (auth.status) {
      case AuthStatus.initial:
      case AuthStatus.loading:
        return const Scaffold(
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.sports_soccer,
                  size: 80,
                  color: Color(0xFFFFC107),
                ),
                SizedBox(height: 24),
                CircularProgressIndicator(
                  color: Color(0xFFFFC107),
                ),
                SizedBox(height: 16),
                Text(
                  'Sunny Football Academy',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFFFC107),
                  ),
                ),
              ],
            ),
          ),
        );
      case AuthStatus.authenticated:
        return const HomeScreen();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
    }
  }
}
