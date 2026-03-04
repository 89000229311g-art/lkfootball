class Campaign {
  final int id;
  final String name;
  final String status;
  final double budget;
  final double spend;
  final int leads;
  final int payingStudents;
  final double revenue;
  final String? source;
  final double totalSpend;

  Campaign({
    required this.id,
    required this.name,
    required this.status,
    required this.budget,
    required this.spend,
    required this.leads,
    required this.payingStudents,
    required this.revenue,
    this.source,
    required this.totalSpend,
  });

  factory Campaign.fromJson(Map<String, dynamic> json) {
    return Campaign(
      id: json['id'],
      name: json['name'],
      status: json['status'] ?? 'planning',
      budget: (json['budget'] ?? 0).toDouble(),
      spend: (json['spend'] ?? 0).toDouble(),
      leads: json['leads'] ?? 0,
      payingStudents: json['paying_students'] ?? 0,
      revenue: (json['revenue'] ?? 0).toDouble(),
      source: json['source'],
      totalSpend: (json['total_spend'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'status': status,
      'budget': budget,
      'spend': spend,
      'leads': leads,
      'paying_students': payingStudents,
      'revenue': revenue,
      'source': source,
      'total_spend': totalSpend,
    };
  }
}
