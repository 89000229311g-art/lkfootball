class Event {
  final int id;
  final int groupId;
  final String startTime;
  final String endTime;
  final String type;
  final String? location;
  final String? groupName;

  Event({
    required this.id,
    required this.groupId,
    required this.startTime,
    required this.endTime,
    required this.type,
    this.location,
    this.groupName,
  });

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'],
      groupId: json['group_id'],
      startTime: json['start_time'] ?? '',
      endTime: json['end_time'] ?? '',
      type: json['type'] ?? 'training',
      location: json['location'],
      groupName: json['group']?['name'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'group_id': groupId,
      'start_time': startTime,
      'end_time': endTime,
      'type': type,
      'location': location,
    };
  }

  // Helper to get formatted date
  String get formattedDate {
    try {
      final dt = DateTime.parse(startTime);
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (e) {
      return startTime;
    }
  }

  // Helper to get formatted time range
  String get formattedTimeRange {
    try {
      final start = DateTime.parse(startTime);
      final end = DateTime.parse(endTime);
      return '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')} - ${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return '$startTime - $endTime';
    }
  }

  // Get type display name
  String get typeDisplayName {
    switch (type) {
      case 'training':
        return 'Тренировка';
      case 'game':
        return 'Игра';
      case 'medical':
        return 'Медосмотр';
      default:
        return type;
    }
  }
}
