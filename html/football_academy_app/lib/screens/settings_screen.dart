import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final ApiService _apiService = ApiService();
  bool _loadingPassword = false;
  Map<String, dynamic>? _myPassword;

  Future<void> _viewPassword() async {
    setState(() => _loadingPassword = true);
    try {
      final data = await _apiService.getMyPassword();
      setState(() => _myPassword = data);
      if (mounted) {
        _showPasswordDialog();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _loadingPassword = false);
    }
  }

  void _showPasswordDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: Row(
          children: [
            const Icon(Icons.lock, color: Color(0xFFFFC107)),
            const SizedBox(width: 8),
            Text(context.l10n.translate('your_password'), style: const TextStyle(color: Colors.white)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1C2127),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.translate('login_credential'), style: TextStyle(color: Colors.grey[400], fontSize: 12)),
                  const SizedBox(height: 4),
                  Text(
                    _myPassword?['login'] ?? '',
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontFamily: 'monospace'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1C2127),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.translate('password'), style: TextStyle(color: Colors.grey[400], fontSize: 12)),
                  const SizedBox(height: 4),
                  Text(
                    _myPassword?['password'] ?? '',
                    style: const TextStyle(color: Colors.white, fontSize: 16, fontFamily: 'monospace'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.amber.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber, color: Colors.amber, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      context.l10n.translate('contact_admin_for_password'),
                      style: TextStyle(color: Colors.amber[300], fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(context.l10n.translate('close'), style: const TextStyle(color: Color(0xFFFFC107))),
          ),
        ],
      ),
    );
  }

  void _showChangePasswordDialog() {
    final currentPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    bool isLoading = false;
    String? error;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF23272E),
          title: Row(
            children: [
              const Icon(Icons.lock, color: Color(0xFFFFC107)),
              const SizedBox(width: 8),
              Text(context.l10n.translate('change_password_title'), style: const TextStyle(color: Colors.white)),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.withOpacity(0.3)),
                    ),
                    child: Text(error!, style: const TextStyle(color: Colors.red)),
                  ),
                TextField(
                  controller: currentPasswordController,
                  obscureText: true,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('current_password'),
                    labelStyle: TextStyle(color: Colors.grey[400]),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFFFC107)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: newPasswordController,
                  obscureText: true,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('new_password'),
                    labelStyle: TextStyle(color: Colors.grey[400]),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFFFC107)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: confirmPasswordController,
                  obscureText: true,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: context.l10n.translate('confirm_password'),
                    labelStyle: TextStyle(color: Colors.grey[400]),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey[700]!),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: Color(0xFFFFC107)),
                    ),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(context.l10n.translate('cancel'), style: TextStyle(color: Colors.grey[400])),
            ),
            ElevatedButton(
              onPressed: isLoading ? null : () async {
                if (newPasswordController.text != confirmPasswordController.text) {
                  setDialogState(() => error = context.l10n.translate('passwords_do_not_match'));
                  return;
                }
                if (newPasswordController.text.length < 6) {
                  setDialogState(() => error = context.l10n.translate('password_min_length'));
                  return;
                }
                setDialogState(() {
                  isLoading = true;
                  error = null;
                });
                try {
                  await _apiService.changePassword(
                    currentPasswordController.text,
                    newPasswordController.text,
                  );
                  if (context.mounted) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(context.l10n.translate('password_changed_success')), backgroundColor: Colors.green),
                    );
                  }
                } catch (e) {
                  setDialogState(() {
                    error = '${context.l10n.translate('error')}: $e';
                    isLoading = false;
                  });
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                foregroundColor: Colors.black,
              ),
              child: isLoading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(context.l10n.translate('save')),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final langProvider = context.watch<LanguageProvider>();
    final authProvider = context.watch<AuthProvider>();
    final user = authProvider.user;
    final isOwner = user?.role.toLowerCase() == 'super_admin';
    
    return Scaffold(
      backgroundColor: const Color(0xFF1C2127),
      appBar: AppBar(
        title: Text(context.l10n.translate('settings')),
        backgroundColor: const Color(0xFF23272E),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile section
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: CircleAvatar(
                radius: 30,
                backgroundColor: const Color(0xFFFFC107),
                backgroundImage: user?.avatarUrl != null 
                    ? NetworkImage(user!.avatarUrl!) 
                    : null,
                child: user?.avatarUrl == null
                    ? Text(
                        user?.fullName.isNotEmpty == true
                            ? user!.fullName[0].toUpperCase()
                            : 'U',
                        style: const TextStyle(
                          color: Colors.black,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      )
                    : null,
              ),
              title: Text(
                user?.fullName ?? 'User',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              subtitle: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 4),
                  Text(
                    user?.phone ?? '',
                    style: TextStyle(color: Colors.grey[400]),
                  ),
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFC107).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      user?.role ?? 'User',
                      style: const TextStyle(
                        color: Color(0xFFFFC107),
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              trailing: const Icon(Icons.chevron_right, color: Colors.grey),
              onTap: () => Navigator.pushNamed(context, '/profile'),
            ),
          ),
          const SizedBox(height: 24),
          
          // Password section
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              context.l10n.translate('password').toUpperCase(),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.grey[400],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                // View password - for all users
                ListTile(
                  leading: const Icon(
                    Icons.visibility,
                    color: Color(0xFFFFC107),
                  ),
                  title: Text(
                    context.l10n.translate('view_password'),
                    style: const TextStyle(color: Colors.white),
                  ),
                  subtitle: Text(
                    context.l10n.translate('password_view_subtitle'),
                    style: TextStyle(color: Colors.grey[400], fontSize: 12),
                  ),
                  trailing: _loadingPassword
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.chevron_right, color: Colors.grey),
                  onTap: _loadingPassword ? null : _viewPassword,
                ),
                // Change password - only for owner
                if (isOwner) ...[  
                  Divider(height: 1, color: Colors.grey.withOpacity(0.1)),
                  ListTile(
                    leading: const Icon(
                      Icons.edit,
                      color: Colors.orange,
                    ),
                    title: Text(
                      context.l10n.translate('change_password_title'),
                      style: const TextStyle(color: Colors.white),
                    ),
                    subtitle: Text(
                      context.l10n.translate('only_owner_can_change'),
                      style: TextStyle(color: Colors.grey[400], fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: Colors.grey),
                    onTap: _showChangePasswordDialog,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),
          
          // Language
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              'Language / Язык / Limbă'.toUpperCase(),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.grey[400],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                _LanguageTile(
                  title: 'Русский',
                  subtitle: 'Russian',
                  locale: const Locale('ru'),
                  currentLocale: langProvider.locale,
                  onTap: () => langProvider.setLocale(const Locale('ru')),
                ),
                Divider(height: 1, color: Colors.grey.withOpacity(0.1)),
                _LanguageTile(
                  title: 'Română',
                  subtitle: 'Limba română',
                  locale: const Locale('ro'),
                  currentLocale: langProvider.locale,
                  onTap: () => langProvider.setLocale(const Locale('ro')),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Notifications
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              context.l10n.translate('notifications').toUpperCase(),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.grey[400],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: SwitchListTile(
              title: Text(
                context.l10n.translate('notifications'),
                style: const TextStyle(color: Colors.white),
              ),
              subtitle: Text(
                'Push notifications',
                style: TextStyle(color: Colors.grey[400]),
              ),
              value: true,
              activeThumbColor: const Color(0xFFFFC107),
              onChanged: (value) {},
              secondary: const Icon(Icons.notifications, color: Color(0xFFFFC107)),
            ),
          ),
          const SizedBox(height: 24),

          // About
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              context.l10n.translate('about').toUpperCase(),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.grey[400],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.info, color: Colors.blue),
                  title: Text(context.l10n.translate('version'), style: const TextStyle(color: Colors.white)),
                  trailing: Text('1.0.0', style: TextStyle(color: Colors.grey[400])),
                ),
                Divider(height: 1, color: Colors.grey.withOpacity(0.1)),
                ListTile(
                  leading: const Icon(Icons.code, color: Colors.purple),
                  title: Text(context.l10n.translate('developer'), style: const TextStyle(color: Colors.white)),
                  trailing: Text('Sunny Football Academy', style: TextStyle(color: Colors.grey[400])),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // Logout button
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: () async {
                // Show confirmation dialog
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    backgroundColor: const Color(0xFF23272E),
                    title: Text(
                      context.l10n.translate('logout'),
                      style: const TextStyle(color: Colors.white),
                    ),
                    content: Text(
                      context.l10n.translate('logout_confirmation'),
                      style: TextStyle(color: Colors.grey[300]),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: Text(
                          context.l10n.translate('cancel'),
                          style: TextStyle(color: Colors.grey[400]),
                        ),
                      ),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: Text(
                          context.l10n.translate('confirm'),
                          style: const TextStyle(color: Colors.red),
                        ),
                      ),
                    ],
                  ),
                );
                
                if (confirmed == true) {
                  // Logout and navigate to login
                  await authProvider.logout();
                  if (context.mounted) {
                    Navigator.pushNamedAndRemoveUntil(
                      context,
                      '/login',
                      (route) => false,
                    );
                  }
                }
              },
              icon: const Icon(Icons.logout, color: Colors.red),
              label: Text(
                context.l10n.translate('logout'),
                style: const TextStyle(
                  color: Colors.red,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2D323B),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: Colors.red.withOpacity(0.3)),
                ),
                elevation: 0,
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class _LanguageTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final Locale locale;
  final Locale currentLocale;
  final VoidCallback onTap;

  const _LanguageTile({
    required this.title,
    required this.subtitle,
    required this.locale,
    required this.currentLocale,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isSelected = locale.languageCode == currentLocale.languageCode;
    
    return ListTile(
      title: Text(title, style: const TextStyle(color: Colors.white)),
      subtitle: Text(subtitle, style: TextStyle(color: Colors.grey[400])),
      trailing: isSelected
          ? const Icon(Icons.check_circle, color: Color(0xFFFFC107))
          : null,
      onTap: onTap,
    );
  }
}
