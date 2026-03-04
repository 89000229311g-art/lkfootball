class Student {
  final int id;
  final String firstName;
  final String lastName;
  final String? dob;
  final String? phone;
  final String? parentPhone;
  final int? groupId;
  final String? groupName;
  final int? coachId;
  final String? coachName;
  final String? avatarUrl;
  final String status;
  final double balance;
  
  // New fields from web version
  final int classesBalance;              // Остаток занятий
  final String? subscriptionExpires;     // Дата окончания абонемента
  final bool isDebtor;                   // Флаг должника
  final bool isFrozen;                   // Заморожен ли
  final String? freezeUntil;             // До какой даты заморожен
  final String? medicalInfo;             // Медицинская информация
  final List<int> guardianIds;           // ID родителей
  final List<ParentInfo> parents;        // Информация о родителях
  final double? height;                  // Рост
  final double? weight;                  // Вес
  
  // NEW: Monthly balance fields for subscription status
  final double monthlyBalance;           // +monthly_fee или -monthly_fee
  final bool isPaidThisMonth;            // Оплачен ли абонемент за месяц
  final double monthlyFee;               // Стоимость абонемента
  final String? targetMonth;             // За какой месяц
  final String balanceColor;             // "green", "red", "grey"
  
  // NEW: Individual fee fields (скидки)
  final double? individualFee;           // Индивидуальная оплата (скидка)
  final String? feeDiscountReason;       // Причина скидки
  final double? groupFee;                // Стоимость группы (для сравнения)

  Student({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.dob,
    this.phone,
    this.parentPhone,
    this.groupId,
    this.groupName,
    this.coachId,
    this.coachName,
    this.avatarUrl,
    required this.status,
    required this.balance,
    this.classesBalance = 0,
    this.subscriptionExpires,
    this.isDebtor = false,
    this.isFrozen = false,
    this.freezeUntil,
    this.medicalInfo,
    this.guardianIds = const [],
    this.parents = const [],
    this.height,
    this.weight,
    // NEW: Monthly balance fields
    this.monthlyBalance = 0,
    this.isPaidThisMonth = true,
    this.monthlyFee = 0,
    this.targetMonth,
    this.balanceColor = 'grey',
    // NEW: Individual fee fields
    this.individualFee,
    this.feeDiscountReason,
    this.groupFee,
  });

  String get fullName => '$firstName $lastName';

  factory Student.fromJson(Map<String, dynamic> json) {
    return Student(
      id: json['id'],
      firstName: json['first_name'] ?? '',
      lastName: json['last_name'] ?? '',
      dob: json['dob'],
      phone: json['phone'],
      parentPhone: json['parent_phone'],
      groupId: json['group_id'],
      groupName: json['group']?['name'],
      coachId: json['group']?['coach_id'],
      coachName: json['group']?['coach']?['full_name'],
      avatarUrl: json['avatar_url'],
      status: json['status'] ?? 'active',
      balance: (json['balance'] ?? 0).toDouble(),
      classesBalance: json['classes_balance'] ?? 0,
      subscriptionExpires: json['subscription_expires'],
      isDebtor: json['is_debtor'] ?? false,
      isFrozen: json['is_frozen'] ?? false,
      freezeUntil: json['freeze_until'],
      medicalInfo: json['medical_info'],
      guardianIds: json['guardian_ids'] != null 
          ? List<int>.from(json['guardian_ids'])
          : [],
      parents: json['guardians'] != null
          ? (json['guardians'] as List).map((g) => ParentInfo.fromJson(g)).toList()
          : [],
      height: json['height']?.toDouble(),
      weight: json['weight']?.toDouble(),
      // NEW: Monthly balance fields
      monthlyBalance: (json['monthly_balance'] ?? 0).toDouble(),
      isPaidThisMonth: json['is_paid_this_month'] ?? true,
      monthlyFee: (json['monthly_fee'] ?? 0).toDouble(),
      targetMonth: json['target_month'],
      balanceColor: json['balance_color'] ?? 'grey',
      // Individual fee fields
      individualFee: json['individual_fee']?.toDouble(),
      feeDiscountReason: json['fee_discount_reason'],
      groupFee: json['group_fee']?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'first_name': firstName,
      'last_name': lastName,
      'dob': dob,
      'phone': phone,
      'parent_phone': parentPhone,
      'group_id': groupId,
      'avatar_url': avatarUrl,
      'status': status,
      'classes_balance': classesBalance,
      'subscription_expires': subscriptionExpires,
      'is_debtor': isDebtor,
      'is_frozen': isFrozen,
      'freeze_until': freezeUntil,
      'medical_info': medicalInfo,
      'height': height,
      'weight': weight,
    };
  }
}

class ParentInfo {
  final int id;
  final String fullName;
  final String phone;
  final String? relationship;

  ParentInfo({
    required this.id,
    required this.fullName,
    required this.phone,
    this.relationship,
  });

  factory ParentInfo.fromJson(Map<String, dynamic> json) {
    return ParentInfo(
      id: json['id'],
      fullName: json['full_name'] ?? '',
      phone: json['phone'] ?? '',
      relationship: json['relationship_type'],
    );
  }
}
