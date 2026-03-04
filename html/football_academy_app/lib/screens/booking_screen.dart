import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// Booking Screen - Book individual training sessions with coaches
class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key});

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  bool _isBooking = false;
  List<dynamic> _coaches = [];
  List<Map<String, dynamic>> _availableSlots = [];
  List<dynamic> _myBookings = [];
  
  int? _selectedCoachId;
  DateTime _selectedDate = DateTime.now();
  Map<String, dynamic>? _selectedSlot;
  
  final _studentNameController = TextEditingController();
  final _phoneController = TextEditingController(text: '+373');
  final _notesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _studentNameController.dispose();
    _phoneController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _apiService.getUsers(role: 'coach'),
        _apiService.getMyBookings().catchError((_) => []),
      ]);
      
      _coaches = results[0];
      _myBookings = results[1];
      
      if (_selectedCoachId != null) {
        await _loadAvailableSlots();
      }
    } catch (e) {
      debugPrint('Error loading data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadAvailableSlots() async {
    if (_selectedCoachId == null) return;
    
    try {
      // Generate time slots (9:00 - 18:00 every 2 hours)
      final List<Map<String, dynamic>> slots = [];
      for (var hour = 9; hour < 18; hour += 2) {
        final startTime = DateTime(
          _selectedDate.year,
          _selectedDate.month,
          _selectedDate.day,
          hour,
        );
        
        // Check if slot is in the past
        if (startTime.isBefore(DateTime.now())) {
          continue;
        }
        
        // Check if already booked (simplified - in real app would query API)
        final isBooked = _myBookings.any((b) {
          final bookingTime = DateTime.tryParse(b['start_time'] ?? '');
          return bookingTime != null &&
              bookingTime.year == startTime.year &&
              bookingTime.month == startTime.month &&
              bookingTime.day == startTime.day &&
              bookingTime.hour == startTime.hour;
        });
        
        slots.add({
          'time': '${hour.toString().padLeft(2, '0')}:00',
          'end_time': '${(hour + 2).toString().padLeft(2, '0')}:00',
          'start_datetime': startTime,
          'booked': isBooked,
        });
      }
      
      setState(() => _availableSlots = slots);
    } catch (e) {
      debugPrint('Error loading slots: $e');
    }
  }

  Future<void> _bookSlot() async {
    if (_selectedSlot == null || _selectedCoachId == null) return;
    if (_studentNameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите имя ученика'), backgroundColor: Colors.red),
      );
      return;
    }
    if (_phoneController.text.trim().length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите номер телефона'), backgroundColor: Colors.red),
      );
      return;
    }
    
    setState(() => _isBooking = true);
    try {
      await _apiService.bookIndividualTraining(
        coachId: _selectedCoachId!,
        startTime: _selectedSlot!['start_datetime'] as DateTime,
        studentName: _studentNameController.text.trim(),
        phone: _phoneController.text.trim(),
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Тренировка забронирована!'),
            backgroundColor: Colors.green,
          ),
        );
        
        // Reset form
        setState(() {
          _selectedSlot = null;
          _studentNameController.clear();
          _notesController.clear();
        });
        
        // Reload data
        _loadData();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isBooking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1D23),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: const Row(
          children: [
            Text('📅 ', style: TextStyle(fontSize: 24)),
            Text('Бронирование'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // My bookings summary
                  if (_myBookings.isNotEmpty) ...[
                    _buildMyBookingsSection(),
                    const SizedBox(height: 24),
                  ],
                  
                  // Step 1: Select coach
                  _buildSectionTitle('1. Выберите тренера'),
                  const SizedBox(height: 12),
                  _buildCoachSelector(),
                  
                  const SizedBox(height: 24),
                  
                  // Step 2: Select date
                  if (_selectedCoachId != null) ...[
                    _buildSectionTitle('2. Выберите дату'),
                    const SizedBox(height: 12),
                    _buildDateSelector(),
                    
                    const SizedBox(height: 24),
                    
                    // Step 3: Select time slot
                    _buildSectionTitle('3. Выберите время'),
                    const SizedBox(height: 12),
                    _buildTimeSlots(),
                  ],
                  
                  // Step 4: Enter details
                  if (_selectedSlot != null) ...[
                    const SizedBox(height: 24),
                    _buildSectionTitle('4. Введите данные'),
                    const SizedBox(height: 12),
                    _buildBookingForm(),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.bold,
      ),
    );
  }

  Widget _buildMyBookingsSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.event_available, color: Color(0xFFFFC107)),
              SizedBox(width: 8),
              Text(
                'Мои бронирования',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ..._myBookings.take(3).map((booking) {
            final startTime = DateTime.tryParse(booking['start_time'] ?? '');
            final dateStr = startTime != null
                ? '${startTime.day}.${startTime.month} в ${startTime.hour}:00'
                : '';
            
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF1A1D23),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.sports_soccer, color: Color(0xFFFFC107), size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          booking['title'] ?? 'Индивидуальная тренировка',
                          style: const TextStyle(color: Colors.white),
                        ),
                        Text(
                          dateStr,
                          style: const TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.cancel_outlined, color: Colors.red, size: 20),
                    onPressed: () => _cancelBooking(booking['id']),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildCoachSelector() {
    return SizedBox(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _coaches.length,
        itemBuilder: (context, index) {
          final coach = _coaches[index];
          final isSelected = _selectedCoachId == coach['id'];
          
          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedCoachId = coach['id'];
                _selectedSlot = null;
              });
              _loadAvailableSlots();
            },
            child: Container(
              width: 100,
              margin: const EdgeInsets.only(right: 12),
              decoration: BoxDecoration(
                color: isSelected 
                    ? const Color(0xFFFFC107).withOpacity(0.2) 
                    : const Color(0xFF23272E),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isSelected ? const Color(0xFFFFC107) : Colors.white10,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: isSelected 
                        ? const Color(0xFFFFC107) 
                        : Colors.white10,
                    child: Text(
                      (coach['full_name'] ?? 'T')[0].toUpperCase(),
                      style: TextStyle(
                        color: isSelected ? Colors.black : Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    coach['full_name'] ?? 'Тренер',
                    style: TextStyle(
                      color: isSelected ? const Color(0xFFFFC107) : Colors.white,
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    ),
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDateSelector() {
    final today = DateTime.now();
    final dates = List.generate(14, (i) => today.add(Duration(days: i)));
    final weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    
    return SizedBox(
      height: 80,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: dates.length,
        itemBuilder: (context, index) {
          final date = dates[index];
          final isSelected = _selectedDate.year == date.year &&
              _selectedDate.month == date.month &&
              _selectedDate.day == date.day;
          final isToday = date.day == today.day && 
              date.month == today.month &&
              date.year == today.year;
          
          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedDate = date;
                _selectedSlot = null;
              });
              _loadAvailableSlots();
            },
            child: Container(
              width: 60,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: isSelected 
                    ? const Color(0xFFFFC107) 
                    : const Color(0xFF23272E),
                borderRadius: BorderRadius.circular(12),
                border: isToday && !isSelected
                    ? Border.all(color: const Color(0xFFFFC107))
                    : null,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    weekDays[date.weekday % 7],
                    style: TextStyle(
                      color: isSelected ? Colors.black : Colors.grey,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${date.day}',
                    style: TextStyle(
                      color: isSelected ? Colors.black : Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  if (isToday)
                    Container(
                      width: 6,
                      height: 6,
                      margin: const EdgeInsets.only(top: 4),
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.black : const Color(0xFFFFC107),
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTimeSlots() {
    if (_availableSlots.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF23272E),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text(
            'Нет доступных слотов на выбранную дату',
            style: TextStyle(color: Colors.grey),
          ),
        ),
      );
    }
    
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: _availableSlots.map((slot) {
        final isSelected = _selectedSlot == slot;
        final isBooked = slot['booked'] == true;
        
        return GestureDetector(
          onTap: isBooked ? null : () {
            setState(() => _selectedSlot = slot);
          },
          child: Container(
            width: (MediaQuery.of(context).size.width - 56) / 3,
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(
              color: isBooked 
                  ? Colors.red.withOpacity(0.2)
                  : isSelected 
                      ? const Color(0xFFFFC107).withOpacity(0.2)
                      : const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isBooked 
                    ? Colors.red.withOpacity(0.5)
                    : isSelected 
                        ? const Color(0xFFFFC107) 
                        : Colors.white10,
              ),
            ),
            child: Column(
              children: [
                Text(
                  '${slot['time']} - ${slot['end_time']}',
                  style: TextStyle(
                    color: isBooked 
                        ? Colors.red 
                        : isSelected 
                            ? const Color(0xFFFFC107) 
                            : Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isBooked ? '🔒 Занято' : '✅ Свободно',
                  style: TextStyle(
                    color: isBooked ? Colors.red : Colors.green,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildBookingForm() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          // Selected info
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFFFC107).withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.access_time, color: Color(0xFFFFC107)),
                const SizedBox(width: 12),
                Text(
                  '${_selectedDate.day}.${_selectedDate.month} в ${_selectedSlot!['time']}',
                  style: const TextStyle(
                    color: Color(0xFFFFC107),
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
          
          const SizedBox(height: 16),
          
          // Student name
          TextField(
            controller: _studentNameController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Имя ученика *',
              labelStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.person, color: Colors.grey),
              filled: true,
              fillColor: const Color(0xFF1A1D23),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFFFC107)),
              ),
            ),
          ),
          
          const SizedBox(height: 12),
          
          // Phone
          TextField(
            controller: _phoneController,
            style: const TextStyle(color: Colors.white),
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              labelText: 'Телефон *',
              labelStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.phone, color: Colors.grey),
              filled: true,
              fillColor: const Color(0xFF1A1D23),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFFFC107)),
              ),
            ),
          ),
          
          const SizedBox(height: 12),
          
          // Notes
          TextField(
            controller: _notesController,
            style: const TextStyle(color: Colors.white),
            maxLines: 2,
            decoration: InputDecoration(
              labelText: 'Примечания (опционально)',
              labelStyle: const TextStyle(color: Colors.grey),
              prefixIcon: const Icon(Icons.note, color: Colors.grey),
              filled: true,
              fillColor: const Color(0xFF1A1D23),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xFFFFC107)),
              ),
            ),
          ),
          
          const SizedBox(height: 20),
          
          // Book button
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _isBooking ? null : _bookSlot,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFFC107),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: _isBooking 
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2),
                    )
                  : const Icon(Icons.check_circle, color: Colors.black),
              label: Text(
                _isBooking ? 'Бронирование...' : 'Забронировать',
                style: const TextStyle(
                  color: Colors.black,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _cancelBooking(int? id) async {
    if (id == null) return;
    
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF23272E),
        title: const Text('Отмена бронирования', style: TextStyle(color: Colors.white)),
        content: const Text('Вы уверены?', style: TextStyle(color: Colors.grey)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Нет'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Да, отменить'),
          ),
        ],
      ),
    );
    
    if (confirm == true) {
      try {
        await _apiService.cancelBooking(id);
        _loadData();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Бронирование отменено'), backgroundColor: Colors.orange),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Ошибка: $e'), backgroundColor: Colors.red),
          );
        }
      }
    }
  }
}
