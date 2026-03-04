class Group {
  final int id;
  final String name;
  final String? ageGroup;
  final int? coachId;
  final String? coachName;
  final double monthlyFee;
  
  // Subscription fields
  final String subscriptionType;  // by_class or by_calendar
  final int classesPerMonth;      // Number of classes per month
  final int paymentDueDay;        // Payment due day of month

  Group({
    required this.id,
    required this.name,
    this.ageGroup,
    this.coachId,
    this.coachName,
    required this.monthlyFee,
    this.subscriptionType = 'by_class',
    this.classesPerMonth = 8,
    this.paymentDueDay = 10,
  });
  
  String get subscriptionTypeDisplay {
    switch (subscriptionType) {
      case 'by_class':
        return '📊 По занятиям ($classesPerMonth зан/мес)';
      case 'by_calendar':
        return '📅 По календарю (до $paymentDueDay числа)';
      default:
        return subscriptionType;
    }
  }

  factory Group.fromJson(Map<String, dynamic> json) {
    return Group(
      id: json['id'],
      name: json['name'] ?? '',
      ageGroup: json['age_group'],
      coachId: json['coach_id'],
      coachName: json['coach']?['full_name'],
      monthlyFee: (json['monthly_fee'] ?? 0).toDouble(),
      subscriptionType: json['subscription_type'] ?? 'by_class',
      classesPerMonth: json['classes_per_month'] ?? 8,
      paymentDueDay: json['payment_due_day'] ?? 10,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'age_group': ageGroup,
      'coach_id': coachId,
      'monthly_fee': monthlyFee,
      'subscription_type': subscriptionType,
      'classes_per_month': classesPerMonth,
      'payment_due_day': paymentDueDay,
    };
  }
}
