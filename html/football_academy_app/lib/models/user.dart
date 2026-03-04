class User {
  final int id;
  final String phone;
  final String? phoneSecondary;
  final String fullName;
  final String role;  // super_admin, admin, coach, parent
  final String? avatarUrl;

  User({
    required this.id,
    required this.phone,
    this.phoneSecondary,
    required this.fullName,
    required this.role,
    this.avatarUrl,
  });

  String get roleDisplay {
    switch (role.toLowerCase()) {
      case 'super_admin':
        return '👑 Руководитель';
      case 'admin':
        return '🔧 Администратор';
      case 'coach':
        return '🏃 Тренер';
      case 'parent':
        return '👨‍👩‍👧 Родитель';
      default:
        return role;
    }
  }

  bool get isAdmin => role.toLowerCase() == 'super_admin' || role.toLowerCase() == 'admin';
  bool get isCoach => role.toLowerCase() == 'coach';
  bool get isParent => role.toLowerCase() == 'parent';

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      phone: json['phone'] ?? '',
      phoneSecondary: json['phone_secondary'],
      fullName: json['full_name'] ?? '',
      role: json['role'] ?? 'parent',
      avatarUrl: json['avatar_url'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'phone': phone,
      'phone_secondary': phoneSecondary,
      'full_name': fullName,
      'role': role,
      'avatar_url': avatarUrl,
    };
  }
}
