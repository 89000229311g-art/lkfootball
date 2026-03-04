class Lead {
  final int id;
  final String name;
  final String phone;
  final int? age;
  final DateTime? nextContactDate;
  final String status;
  final String? source;
  final String? notes;
  final int? responsibleId;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Lead({
    required this.id,
    required this.name,
    required this.phone,
    this.age,
    this.nextContactDate,
    required this.status,
    this.source,
    this.notes,
    this.responsibleId,
    this.createdAt,
    this.updatedAt,
  });

  factory Lead.fromJson(Map<String, dynamic> json) {
    return Lead(
      id: json['id'],
      name: json['name'],
      phone: json['phone'],
      age: json['age'],
      nextContactDate: json['next_contact_date'] != null
          ? DateTime.parse(json['next_contact_date'])
          : null,
      status: json['status'] ?? 'new',
      source: json['source'],
      notes: json['notes'],
      responsibleId: json['responsible_id'],
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : null,
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'phone': phone,
      'age': age,
      'next_contact_date': nextContactDate?.toIso8601String(),
      'status': status,
      'source': source,
      'notes': notes,
      'responsible_id': responsibleId,
      'created_at': createdAt?.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
    };
  }
}
