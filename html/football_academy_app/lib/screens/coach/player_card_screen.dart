import 'package:flutter/material.dart';
import 'dart:math' as math;
import '../../services/api_service.dart';
import '../../models/student.dart';
import '../../config/api_config.dart';
import '../../l10n/app_localizations.dart';

class PlayerCardScreen extends StatefulWidget {
  final Student student;

  const PlayerCardScreen({super.key, required this.student});

  @override
  State<PlayerCardScreen> createState() => _PlayerCardScreenState();
}

class _PlayerCardScreenState extends State<PlayerCardScreen> {
  final ApiService _apiService = ApiService();
  
  bool _isLoading = true;
  bool _isSaving = false;
  Map<String, dynamic>? _playerCard;
  Map<String, dynamic>? _latestSkills;
  List<dynamic> _skillsHistory = [];
  
  // Rating form
  int _technique = 3;
  int _speed = 3;
  int _discipline = 3;
  int _teamwork = 3;
  int _endurance = 3;
  String _comment = '';
  
  bool _isEditing = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      // Load player card data
      final cardData = await _apiService.getPlayerCard(widget.student.id);
      
      // Load skills history
      final skillsHistory = await _apiService.getStudentSkills(widget.student.id);
      
      setState(() {
        _playerCard = cardData;
        _skillsHistory = skillsHistory;
        
        // Get latest skills
        if (skillsHistory.isNotEmpty) {
          _latestSkills = skillsHistory.first;
          _technique = _latestSkills?['technique'] ?? 3;
          _speed = _latestSkills?['speed'] ?? 3;
          _discipline = _latestSkills?['discipline'] ?? 3;
          _teamwork = _latestSkills?['teamwork'] ?? 3;
          _endurance = _latestSkills?['endurance'] ?? 3;
          _comment = _latestSkills?['coach_comment'] ?? '';
        }
        
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading player card: $e');
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveRating() async {
    setState(() => _isSaving = true);
    try {
      final now = DateTime.now();
      await _apiService.createSkillRating(
        studentId: widget.student.id,
        ratingMonth: now.month,
        ratingYear: now.year,
        technique: _technique,
        speed: _speed,
        discipline: _discipline,
        teamwork: _teamwork,
        endurance: _endurance,
        coachComment: _comment.isNotEmpty ? _comment : null,
      );
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n.translate('rating_saved')),
          backgroundColor: Colors.green,
        ),
      );
      
      setState(() => _isEditing = false);
      _loadData(); // Reload to show updated data
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${context.l10n.translate('error')}: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() => _isSaving = false);
    }
  }

  double get _averageRating {
    return (_technique + _speed + _discipline + _teamwork + _endurance) / 5;
  }

  int? _calculateAge(String? dob) {
    if (dob == null || dob.isEmpty) return null;
    try {
      final birthDate = DateTime.parse(dob);
      final today = DateTime.now();
      int age = today.year - birthDate.year;
      if (today.month < birthDate.month || 
          (today.month == birthDate.month && today.day < birthDate.day)) {
        age--;
      }
      return age;
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final age = _calculateAge(widget.student.dob);
    final avatarUrl = widget.student.avatarUrl != null 
        ? '${ApiConfig.baseUrl.replaceAll('/api/v1', '')}${widget.student.avatarUrl}'
        : null;

    return Scaffold(
      backgroundColor: const Color(0xFF14181F),
      appBar: AppBar(
        backgroundColor: const Color(0xFF23272E),
        title: Text(context.l10n.translate('player_card')),
        actions: [
          if (!_isEditing)
            IconButton(
              icon: const Icon(Icons.edit, color: Color(0xFFFFC107)),
              onPressed: () => setState(() => _isEditing = true),
              tooltip: context.l10n.translate('evaluate'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFFFC107)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Player header
                  _buildPlayerHeader(avatarUrl, age),
                  const SizedBox(height: 24),
                  
                  // Skills radar/editor
                  _buildSkillsSection(),
                  const SizedBox(height: 24),
                  
                  // Additional info
                  if (_playerCard != null) ...[
                    _buildInfoCard(),
                    const SizedBox(height: 16),
                  ],
                  
                  // Skills history
                  if (_skillsHistory.isNotEmpty && !_isEditing)
                    _buildHistorySection(),
                ],
              ),
            ),
    );
  }

  Widget _buildPlayerHeader(String? avatarUrl, int? age) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF2D323B), Color(0xFF23272E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFFFC107).withOpacity(0.3)),
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: const Color(0xFFFFC107).withOpacity(0.2),
              borderRadius: BorderRadius.circular(40),
              border: Border.all(color: const Color(0xFFFFC107), width: 2),
              image: avatarUrl != null
                  ? DecorationImage(
                      image: NetworkImage(avatarUrl),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: avatarUrl == null
                ? Center(
                    child: Text(
                      widget.student.firstName.isNotEmpty 
                          ? widget.student.firstName[0].toUpperCase()
                          : '?',
                      style: const TextStyle(
                        color: Color(0xFFFFC107),
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 16),
          
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.student.firstName} ${widget.student.lastName}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (age != null) ...[
                      _buildTag('🎂 $age ${context.l10n.translate('years_old')}'),
                      const SizedBox(width: 8),
                    ],
                    _buildTag('⭐ ${_averageRating.toStringAsFixed(1)}'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTag(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFFFC107).withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Color(0xFFFFC107),
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildSkillsSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _isEditing ? context.l10n.translate('rate_skills') : context.l10n.translate('skills_label'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              if (_isEditing)
                TextButton(
                  onPressed: () => setState(() => _isEditing = false),
                  child: Text(context.l10n.translate('cancel'), style: const TextStyle(color: Colors.grey)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          
          if (!_isEditing)
            // Radar chart visualization
            _buildRadarChart()
          else
            // Rating sliders
            _buildRatingSliders(),
          
          const SizedBox(height: 16),
          
          // Skill bars
          _buildSkillBar(context.l10n.translate('technique'), _technique, const Color(0xFF4CAF50)),
          _buildSkillBar(context.l10n.translate('speed'), _speed, const Color(0xFF2196F3)),
          _buildSkillBar(context.l10n.translate('discipline'), _discipline, const Color(0xFFFFC107)),
          _buildSkillBar(context.l10n.translate('teamwork'), _teamwork, const Color(0xFF9C27B0)),
          _buildSkillBar(context.l10n.translate('endurance'), _endurance, const Color(0xFFFF5722)),
          
          if (_isEditing) ...[
            const SizedBox(height: 16),
            // Comment field
            TextField(
              onChanged: (value) => _comment = value,
              controller: TextEditingController(text: _comment),
              maxLines: 2,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: context.l10n.translate('coach_comment_hint'),
                hintStyle: TextStyle(color: Colors.grey[600]),
                filled: true,
                fillColor: const Color(0xFF23272E),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),
            // Save button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isSaving ? null : _saveRating,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFC107),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isSaving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                      )
                    : Text(
                        context.l10n.translate('save_rating'),
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRadarChart() {
    return SizedBox(
      height: 200,
      child: CustomPaint(
        size: const Size(200, 200),
        painter: RadarChartPainter(
          values: [
            _technique / 5,
            _speed / 5,
            _discipline / 5,
            _teamwork / 5,
            _endurance / 5,
          ],
          labels: ['TECH', 'SPD', 'DIS', 'TEAM', 'END'], // Simplified labels for chart
        ),
      ),
    );
  }

  Widget _buildRatingSliders() {
    return Column(
      children: [
        _buildSlider(context.l10n.translate('technique'), _technique, (v) => setState(() => _technique = v)),
        _buildSlider(context.l10n.translate('speed'), _speed, (v) => setState(() => _speed = v)),
        _buildSlider(context.l10n.translate('discipline'), _discipline, (v) => setState(() => _discipline = v)),
        _buildSlider(context.l10n.translate('teamwork'), _teamwork, (v) => setState(() => _teamwork = v)),
        _buildSlider(context.l10n.translate('endurance'), _endurance, (v) => setState(() => _endurance = v)),
      ],
    );
  }

  Widget _buildSlider(String label, int value, Function(int) onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey[300], fontSize: 14),
            ),
          ),
          Expanded(
            child: Slider(
              value: value.toDouble(),
              min: 1,
              max: 5,
              divisions: 4,
              activeColor: const Color(0xFFFFC107),
              inactiveColor: Colors.grey[700],
              onChanged: (v) => onChanged(v.round()),
            ),
          ),
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0xFFFFC107),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                '$value',
                style: const TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSkillBar(String label, int value, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(color: Colors.grey[400], fontSize: 12),
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                Container(
                  height: 8,
                  decoration: BoxDecoration(
                    color: Colors.grey[800],
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: value / 5,
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: color,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$value',
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard() {
    final card = _playerCard!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.translate('info_label'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          _buildInfoRow(context.l10n.translate('group_label'), card['group_name'] ?? '-'),
          _buildInfoRow(context.l10n.translate('dob_label'), widget.student.dob ?? '-'),
          _buildInfoRow(context.l10n.translate('status_label'), widget.student.status ?? 'active'),
          if (card['attendance_rate'] != null)
            _buildInfoRow(context.l10n.translate('attendance_label'), '${card['attendance_rate']}%'),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.grey[500])),
          Text(value, style: const TextStyle(color: Colors.white)),
        ],
      ),
    );
  }

  Widget _buildHistorySection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2D323B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n.translate('rating_history'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          ..._skillsHistory.take(5).map((skill) => _buildHistoryItem(skill)),
        ],
      ),
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> skill) {
    final months = ['', 
      context.l10n.translate('jan'), context.l10n.translate('feb'), 
      context.l10n.translate('mar'), context.l10n.translate('apr'), 
      context.l10n.translate('may'), context.l10n.translate('jun'), 
      context.l10n.translate('jul'), context.l10n.translate('aug'), 
      context.l10n.translate('sep'), context.l10n.translate('oct'), 
      context.l10n.translate('nov'), context.l10n.translate('dec')
    ];
    final month = skill['rating_month'] ?? 1;
    final year = skill['rating_year'] ?? 2024;
    final avg = ((skill['technique'] ?? 3) + (skill['speed'] ?? 3) + 
                 (skill['discipline'] ?? 3) + (skill['teamwork'] ?? 3) + 
                 (skill['endurance'] ?? 3)) / 5;
    
    // Safety check for month index
    String monthName = '';
    if (month >= 1 && month <= 12) {
      monthName = months[month];
    }
    
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF23272E),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            '$monthName $year',
            style: TextStyle(color: Colors.grey[400]),
          ),
          Row(
            children: [
              const Text('⭐ ', style: TextStyle(fontSize: 14)),
              Text(
                avg.toStringAsFixed(1),
                style: const TextStyle(
                  color: Color(0xFFFFC107),
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// Simple radar chart painter
class RadarChartPainter extends CustomPainter {
  final List<double> values;
  final List<String> labels;

  RadarChartPainter({required this.values, required this.labels});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 30;
    final angle = 2 * math.pi / values.length;

    // Draw background circles
    final bgPaint = Paint()
      ..color = Colors.grey.withOpacity(0.2)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    for (int i = 1; i <= 5; i++) {
      canvas.drawCircle(center, radius * i / 5, bgPaint);
    }

    // Draw axes
    for (int i = 0; i < values.length; i++) {
      final x = center.dx + radius * math.cos(angle * i - math.pi / 2);
      final y = center.dy + radius * math.sin(angle * i - math.pi / 2);
      canvas.drawLine(center, Offset(x, y), bgPaint);
      
      // Draw labels
      final labelX = center.dx + (radius + 20) * math.cos(angle * i - math.pi / 2);
      final labelY = center.dy + (radius + 20) * math.sin(angle * i - math.pi / 2);
      final textPainter = TextPainter(
        text: TextSpan(
          text: labels[i],
          style: TextStyle(color: Colors.grey[400], fontSize: 10),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(canvas, Offset(labelX - textPainter.width / 2, labelY - textPainter.height / 2));
    }

    // Draw value polygon
    final valuePaint = Paint()
      ..color = const Color(0xFFFFC107).withOpacity(0.3)
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = const Color(0xFFFFC107)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    final path = Path();
    for (int i = 0; i < values.length; i++) {
      final x = center.dx + radius * values[i] * math.cos(angle * i - math.pi / 2);
      final y = center.dy + radius * values[i] * math.sin(angle * i - math.pi / 2);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    path.close();

    canvas.drawPath(path, valuePaint);
    canvas.drawPath(path, borderPaint);

    // Draw points
    final pointPaint = Paint()
      ..color = const Color(0xFFFFC107)
      ..style = PaintingStyle.fill;

    for (int i = 0; i < values.length; i++) {
      final x = center.dx + radius * values[i] * math.cos(angle * i - math.pi / 2);
      final y = center.dy + radius * values[i] * math.sin(angle * i - math.pi / 2);
      canvas.drawCircle(Offset(x, y), 4, pointPaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
