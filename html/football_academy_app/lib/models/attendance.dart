class Attendance {
  final int id;
  final int eventId;
  final int studentId;
  final String? studentName;
  final String status;
  final String? notes;

  Attendance({
    required this.id,
    required this.eventId,
    required this.studentId,
    this.studentName,
    required this.status,
    this.notes,
  });

  factory Attendance.fromJson(Map<String, dynamic> json) {
    return Attendance(
      id: json['id'],
      eventId: json['event_id'],
      studentId: json['student_id'],
      studentName: json['student']?['first_name'] != null
          ? '${json['student']['first_name']} ${json['student']['last_name']}'
          : null,
      status: json['status'] ?? 'present',
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'event_id': eventId,
      'student_id': studentId,
      'status': status,
      'notes': notes,
    };
  }
}
