import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../l10n/app_localizations.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController(text: '+37360000001');
  final _passwordController = TextEditingController(text: 'admin123');
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    // Auto-login removed to allow manual testing
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_formKey.currentState!.validate()) {
      final authProvider = context.read<AuthProvider>();
      final success = await authProvider.login(
        _phoneController.text.trim(),
        _passwordController.text,
      );
      
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.translate('success')), backgroundColor: Colors.green),
        );
        // Explicitly navigate to home to ensure screen switch
        Navigator.of(context).pushReplacementNamed('/home');
      } else if (mounted) {
         // Error is handled by Consumer showing error box
      }
    }
  }

  // Quick login - fills credentials and logs in automatically
  Future<void> _quickLogin(String phone, String password, String roleName) async {
    _phoneController.text = phone;
    _passwordController.text = password;
    
    final authProvider = context.read<AuthProvider>();
    final success = await authProvider.login(phone, password);
    
    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ ${context.l10n.translate('login_as')} $roleName'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 1),
        ),
      );
      Navigator.of(context).pushReplacementNamed('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Background is handled by theme (ScaffoldBackgroundColor)
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: const Color(0xFF23272E), // Card color
                      borderRadius: BorderRadius.circular(60),
                      border: Border.all(
                        color: const Color(0xFFFFC107), // Gold border
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFFFC107).withOpacity(0.3),
                          blurRadius: 20,
                          spreadRadius: 5,
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.sports_soccer,
                      size: 80,
                      color: Color(0xFFFFC107), // Gold icon
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    'Sunny Football Academy',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    context.l10n.translate('quick_test_login'),
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.grey,
                    ),
                  ),
                  const SizedBox(height: 24),
                  
                  // Quick login buttons - ONE TAP LOGIN
                  Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      final isLoading = auth.status == AuthStatus.loading;
                      return Column(
                        children: [
                          Text(
                            context.l10n.translate('quick_login_title'),
                            style: const TextStyle(color: Colors.amber, fontSize: 12),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            alignment: WrapAlignment.center,
                            children: [
                              _QuickLoginButton(
                                label: '👑\nAdmin',
                                color: Colors.red,
                                isLoading: isLoading,
                                onTap: () => _quickLogin('+37360000001', 'admin123', 'Admin'),
                              ),
                              _QuickLoginButton(
                                label: '⚽\nCoach',
                                color: Colors.blue,
                                isLoading: isLoading,
                                onTap: () => _quickLogin('+37361000001', 'coach123', 'Coach'),
                              ),
                              _QuickLoginButton(
                                label: '👨‍👩‍👧\nParent',
                                color: Colors.green,
                                isLoading: isLoading,
                                onTap: () => _quickLogin('+37376000001', 'parent123', 'Parent'),
                              ),
                            ],
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                                    
                  const Divider(color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(context.l10n.translate('or_enter_manually'), style: const TextStyle(color: Colors.grey, fontSize: 12)),
                  const SizedBox(height: 16),

                  // Error message
                  Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      if (auth.error != null) {
                        return Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.red.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.red.withOpacity(0.5)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline, color: Colors.red),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  auth.error!,
                                  style: const TextStyle(color: Colors.red),
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      return const SizedBox.shrink();
                    },
                  ),

                  // Login field (phone number)
                  TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    autocorrect: false,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: context.l10n.translate('phone'),
                      hintText: '+373777777',
                      hintStyle: const TextStyle(color: Colors.grey, fontSize: 12),
                      prefixIcon: const Icon(Icons.phone),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return context.l10n.translate('enter_phone');
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // Password field
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    keyboardType: TextInputType.text,
                    autocorrect: false,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      labelText: context.l10n.translate('password'),
                      hintText: 'password123',
                      hintStyle: const TextStyle(color: Colors.grey, fontSize: 12),
                      prefixIcon: const Icon(Icons.lock),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility : Icons.visibility_off,
                        ),
                        onPressed: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return context.l10n.translate('enter_password');
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 32),

                  // Login button
                  Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      return SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: auth.status == AuthStatus.loading ? null : _login,
                          // Style comes from Theme, but we can override if needed
                          child: auth.status == AuthStatus.loading
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.black,
                                  ),
                                )
                              : Text(context.l10n.translate('login')),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// Quick login button widget with loading state
class _QuickLoginButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final Color color;
  final bool isLoading;

  const _QuickLoginButton({
    required this.label,
    required this.onTap,
    this.color = const Color(0xFFFFC107),
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: isLoading ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 85,
        height: 85,
        decoration: BoxDecoration(
          color: const Color(0xFF23272E),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isLoading ? Colors.grey : color.withOpacity(0.5),
            width: 2,
          ),
          boxShadow: isLoading ? null : [
            BoxShadow(
              color: color.withOpacity(0.2),
              blurRadius: 8,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Center(
          child: isLoading
              ? SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: color,
                  ),
                )
              : Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    height: 1.3,
                  ),
                ),
        ),
      ),
    );
  }
}
