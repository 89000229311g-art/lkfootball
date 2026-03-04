class Payment {
  final int id;
  final int studentId;
  final String? studentName;
  final double amount;
  final String paymentDate;
  final String paymentPeriod;
  final String method;
  final String status;           // completed, pending, cancelled
  final String? description;     // Описание

  Payment({
    required this.id,
    required this.studentId,
    this.studentName,
    required this.amount,
    required this.paymentDate,
    required this.paymentPeriod,
    required this.method,
    this.status = 'completed',
    this.description,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id'],
      studentId: json['student_id'],
      studentName: json['student_name'] ?? (json['student'] != null
          ? '${json['student']['first_name']} ${json['student']['last_name']}'
          : null),
      amount: (json['amount'] ?? 0).toDouble(),
      paymentDate: json['payment_date'] ?? '',
      paymentPeriod: json['payment_period'] ?? '',
      method: json['method'] ?? 'cash',
      status: json['status'] ?? 'completed',
      description: json['description'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'student_id': studentId,
      'amount': amount,
      'payment_date': paymentDate,
      'payment_period': paymentPeriod,
      'method': method,
      'status': status,
      'description': description,
    };
  }

  String get methodDisplayName {
    switch (method) {
      case 'cash':
        return '💵 Наличные';
      case 'card':
        return '💳 Карта';
      case 'bank_transfer':         // Changed from 'transfer' to match backend
        return '🏦 Банковский перевод';
      default:
        return method;
    }
  }
  
  String get statusDisplayName {
    switch (status) {
      case 'completed':
        return '✅ Оплачено';
      case 'pending':
        return '⏳ Ожидает';
      case 'cancelled':
        return '❌ Отменён';
      default:
        return status;
    }
  }

  String get formattedPeriod {
    try {
      final dt = DateTime.parse(paymentPeriod);
      const months = [
        'Январь', 'Февраль', 'Март', 'Апрель',
        'Май', 'Июнь', 'Июль', 'Август',
        'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];
      return '${months[dt.month - 1]} ${dt.year}';
    } catch (e) {
      return paymentPeriod;
    }
  }
  
  // Format amount with MDL currency
  String get formattedAmount {
    return '${amount.toStringAsFixed(0)} MDL';
  }
}
