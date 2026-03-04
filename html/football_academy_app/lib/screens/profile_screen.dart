import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../providers/auth_provider.dart';
import '../l10n/app_localizations.dart';
import '../services/api_service.dart';
import '../config/api_config.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final ImagePicker _picker = ImagePicker();
  final ApiService _apiService = ApiService();
  bool _uploading = false;
  bool _isEditing = false;
  
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _phoneSecondaryController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _phoneSecondaryController.dispose();
    super.dispose();
  }

  String _getRoleDisplay(String? role, BuildContext context) {
    if (role == null) return '-';
    switch (role.toLowerCase()) {
      case 'super_admin':
        return context.l10n.translate('academy_director');
      case 'admin':
        return context.l10n.translate('administrator');
      case 'coach':
        return context.l10n.translate('trainer');
      case 'parent':
        return context.l10n.translate('parent');
      default:
        return role;
    }
  }

  Future<void> _pickAndUploadImage() async {
    try {
      // Show options: camera or gallery
      final source = await showDialog<ImageSource>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(context.l10n.translate('choose_photo_source')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: Text(context.l10n.translate('camera')),
                onTap: () => Navigator.pop(context, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: Text(context.l10n.translate('gallery')),
                onTap: () => Navigator.pop(context, ImageSource.gallery),
              ),
            ],
          ),
        ),
      );

      if (source == null) return;

      final XFile? image = await _picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );

      if (image == null) return;

      setState(() => _uploading = true);

      // Upload to server
      await _apiService.uploadUserAvatar(image.path);

      // Refresh user data
      if (mounted) {
        await context.read<AuthProvider>().loadUser();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.translate('photo_uploaded'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('upload_error')}: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Future<void> _deleteAvatar() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.translate('delete_photo')),
        content: Text(context.l10n.translate('delete_photo_confirm')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.translate('cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.translate('delete')),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      setState(() => _uploading = true);
      await _apiService.deleteUserAvatar();
      
      if (mounted) {
        await context.read<AuthProvider>().loadUser();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.translate('photo_deleted'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('delete_error')}: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Future<void> _saveProfile() async {
    try {
      setState(() => _uploading = true);
      
      await _apiService.updateUserProfile(
        fullName: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
        phoneSecondary: _phoneSecondaryController.text.trim().isEmpty 
            ? null 
            : _phoneSecondaryController.text.trim(),
      );
      
      if (mounted) {
        await context.read<AuthProvider>().loadUser();
        setState(() => _isEditing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.translate('profile_updated'))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _uploading = false);
      }
    }
  }

  Future<void> _showChangePasswordDialog() async {
    final currentPasswordController = TextEditingController();
    final newPasswordController = TextEditingController();
    final confirmPasswordController = TextEditingController();
    bool isLoading = false;

    await showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(context.l10n.translate('change_password_title')),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: currentPasswordController,
                obscureText: true,
                decoration: InputDecoration(labelText: context.l10n.translate('current_password')),
              ),
              TextField(
                controller: newPasswordController,
                obscureText: true,
                decoration: InputDecoration(labelText: context.l10n.translate('new_password')),
              ),
              TextField(
                controller: confirmPasswordController,
                obscureText: true,
                decoration: InputDecoration(labelText: context.l10n.translate('confirm_password')),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(context.l10n.translate('cancel')),
            ),
            ElevatedButton(
              onPressed: isLoading ? null : () async {
                if (newPasswordController.text != confirmPasswordController.text) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(context.l10n.translate('passwords_do_not_match'))),
                  );
                  return;
                }
                if (newPasswordController.text.length < 6) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(context.l10n.translate('password_min_length'))),
                  );
                  return;
                }

                setDialogState(() => isLoading = true);
                try {
                  await _apiService.changePassword(
                    currentPasswordController.text,
                    newPasswordController.text,
                  );
                  if (mounted) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(context.l10n.translate('password_changed_success'))),
                    );
                  }
                } catch (e) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('${context.l10n.translate('error')}: $e')),
                    );
                  }
                } finally {
                  setDialogState(() => isLoading = false);
                }
              },
              child: isLoading 
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) 
                : Text(context.l10n.translate('change_password')),
            ),
          ],
        ),
      ),
    );
  }

  void _startEditing(user) {
    setState(() {
      _isEditing = true;
      _nameController.text = user?.fullName ?? '';
      _phoneController.text = user?.phone ?? '';
      _phoneSecondaryController.text = user?.phoneSecondary ?? '';
    });
  }

  void _cancelEditing() {
    setState(() {
      _isEditing = false;
      _nameController.clear();
      _phoneController.clear();
      _phoneSecondaryController.clear();
    });
  }
  
  Widget _buildViewMode(BuildContext context, user) {
    return Column(
      children: [
        _ProfileInfoCard(
          icon: Icons.person,
          title: context.l10n.translate('full_name'),
          value: user?.fullName ?? '-',
        ),
        const SizedBox(height: 12),
        _ProfileInfoCard(
          icon: Icons.phone,
          title: context.l10n.translate('phone'),
          value: user?.phone ?? '-',
        ),
        if (user?.phoneSecondary != null && user!.phoneSecondary!.isNotEmpty) ...[
          const SizedBox(height: 12),
          _ProfileInfoCard(
            icon: Icons.phone_android,
            title: context.l10n.translate('phone_secondary'),
            value: user.phoneSecondary!,
          ),
        ],
        const SizedBox(height: 12),
        _ProfileInfoCard(
          icon: Icons.badge,
          title: context.l10n.translate('role'),
          value: _getRoleDisplay(user?.role, context),
        ),
        
        const SizedBox(height: 24),
        
        // Settings Section
        _SettingsCard(
          title: context.l10n.translate('settings'),
          children: [
            ListTile(
              leading: const Icon(Icons.language, color: Colors.blue),
              title: const Text('Язык / Limba'),
              trailing: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: context.read<LanguageProvider>().locale.languageCode,
                  items: const [
                    DropdownMenuItem(value: 'ru', child: Text('🇷🇺 Русский')),
                    DropdownMenuItem(value: 'ro', child: Text('🇲🇩 Română')),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      context.read<LanguageProvider>().setLocale(Locale(val));
                    }
                  },
                ),
              ),
            ),
            if (user?.role?.toLowerCase() == 'super_admin')
              ListTile(
                leading: const Icon(Icons.lock_outline, color: Colors.orange),
                title: Text(context.l10n.translate('change_password')),
                subtitle: Text(context.l10n.translate('only_for_director')),
                onTap: _showChangePasswordDialog,
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildEditForm(BuildContext context) {
    return Column(
      children: [
        TextField(
          controller: _nameController,
          decoration: InputDecoration(
            labelText: context.l10n.translate('full_name'),
            prefixIcon: const Icon(Icons.person),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneController,
          decoration: InputDecoration(
            labelText: context.l10n.translate('phone'),
            prefixIcon: const Icon(Icons.phone),
            border: const OutlineInputBorder(),
          ),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneSecondaryController,
          decoration: InputDecoration(
            labelText: context.l10n.translate('phone_secondary'),
            prefixIcon: const Icon(Icons.phone_android),
            border: const OutlineInputBorder(),
            hintText: context.l10n.translate('optional'),
          ),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _cancelEditing,
                child: Text(context.l10n.translate('cancel')),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: ElevatedButton(
                onPressed: _uploading ? null : _saveProfile,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1B5E20),
                  foregroundColor: Colors.white,
                ),
                child: _uploading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(context.l10n.translate('save')),
              ),
            ),
          ],
        ),
      ],
    );
  }
  
  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;

    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.translate('profile')),
        backgroundColor: const Color(0xFF1B5E20),
        foregroundColor: Colors.white,
        actions: [
          if (!_isEditing)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => _startEditing(user),
            ),
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
          children: [
            // Profile header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(32),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF1B5E20), Color(0xFF4CAF50)],
                ),
              ),
              child: Column(
                children: [
                  // Avatar
                  Stack(
                    children: [
                      GestureDetector(
                        onLongPress: user?.avatarUrl != null ? _deleteAvatar : null,
                        child: CircleAvatar(
                          radius: 60,
                          backgroundColor: Colors.white,
                          backgroundImage: user?.avatarUrl != null
                              ? NetworkImage('${ApiConfig.baseUrl}${user!.avatarUrl}')
                              : null,
                          child: user?.avatarUrl == null
                              ? Text(
                                  user?.fullName.isNotEmpty == true
                                      ? user!.fullName[0].toUpperCase()
                                      : 'U',
                                  style: const TextStyle(
                                    fontSize: 48,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF1B5E20),
                                  ),
                                )
                              : null,
                        ),
                      ),
                      if (_uploading)
                        Positioned.fill(
                          child: CircleAvatar(
                            radius: 60,
                            backgroundColor: Colors.black54,
                            child: const CircularProgressIndicator(
                              color: Colors.white,
                            ),
                          ),
                        ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: IconButton(
                            icon: const Icon(Icons.camera_alt, color: Color(0xFF1B5E20)),
                            onPressed: _uploading ? null : _pickAndUploadImage,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    user?.fullName ?? 'User',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _getRoleDisplay(user?.role, context),
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),

            // Profile info
            Padding(
              padding: const EdgeInsets.all(16),
              child: _isEditing ? _buildEditForm(context) : _buildViewMode(context, user),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileInfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final Color? valueColor;

  const _ProfileInfoCard({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xFF1B5E20).withAlpha(25),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: const Color(0xFF1B5E20)),
        ),
        title: Text(
          title,
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey[600],
          ),
        ),
        subtitle: Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: valueColor,
          ),
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const _StatCard({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: const Color(0xFF1B5E20)),
            const SizedBox(height: 8),
            Text(
              value,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1B5E20),
              ),
            ),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SettingsCard({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1B5E20),
              ),
            ),
          ),
          const Divider(height: 1),
          ...children,
        ],
      ),
    );
  }
}
