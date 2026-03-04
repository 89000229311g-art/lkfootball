import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../../services/api_service.dart';
import '../../models/group.dart';
import '../../config/api_config.dart';
import '../../l10n/app_localizations.dart';

class PhotoReportScreen extends StatefulWidget {
  const PhotoReportScreen({super.key});

  @override
  State<PhotoReportScreen> createState() => _PhotoReportScreenState();
}

class _PhotoReportScreenState extends State<PhotoReportScreen> {
  final ApiService _apiService = ApiService();
  final ImagePicker _picker = ImagePicker();
  
  List<Group> _groups = [];
  Group? _selectedGroup;
  bool _isLoading = true;
  bool _isUploading = false;
  
  File? _selectedFile;
  String? _fileType; // 'image' or 'video'
  final TextEditingController _commentController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }
  
  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _loadGroups() async {
    try {
      final data = await _apiService.getGroups();
      setState(() {
        _groups = data.map((g) => Group.fromJson(g)).toList();
        if (_groups.isNotEmpty) {
          _selectedGroup = _groups.first;
        }
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('failed_to_load')}: $e')),
        );
      }
    }
  }

  Future<void> _pickImage() async {
    try {
      final XFile? image = await _picker.pickImage(source: ImageSource.gallery);
      if (image != null) {
        setState(() {
          _selectedFile = File(image.path);
          _fileType = 'image';
        });
      }
    } catch (e) {
      print('Error picking image: $e');
    }
  }

  Future<void> _pickVideo() async {
    try {
      final XFile? video = await _picker.pickVideo(source: ImageSource.gallery);
      if (video != null) {
        setState(() {
          _selectedFile = File(video.path);
          _fileType = 'video';
        });
      }
    } catch (e) {
      print('Error picking video: $e');
    }
  }
  
  Future<void> _sendReport() async {
    if (_selectedGroup == null) return;
    if (_selectedFile == null && _commentController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.translate('select_media_or_text'))),
      );
      return;
    }

    setState(() => _isUploading = true);

    try {
      String content = _commentController.text;
      
      // 1. Upload file if selected
      if (_selectedFile != null) {
        final result = await _apiService.uploadMedia(_selectedFile!.path);
        final url = '${ApiConfig.baseUrl}${result['url']}';
        
        // Append Markdown/Link to content
        if (_fileType == 'image') {
          content += '\n\n![Фото]($url)';
        } else {
          content += '\n\n[🎥 Видео]($url)';
        }
      }
      
      // 2. Send as Group Announcement
      // We use createAnnouncement so it appears in the "Announcements" tab for parents
      await _apiService.createAnnouncement({
        'content': content,
        'is_general': false,
        'group_ids': [_selectedGroup!.id],
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.translate('photo_report_published')), backgroundColor: Colors.green),
        );
        setState(() {
          _selectedFile = null;
          _fileType = null;
          _commentController.clear();
          _isUploading = false;
        });
      }
    } catch (e) {
      setState(() => _isUploading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${context.l10n.translate('error')}: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_groups.isEmpty) {
      return Center(
        child: Text(
          context.l10n.translate('no_active_groups'),
          style: const TextStyle(color: Colors.white),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Group Selector
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFF23272E),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF2D323B)),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<Group>(
                value: _selectedGroup,
                dropdownColor: const Color(0xFF23272E),
                isExpanded: true,
                hint: Text(context.l10n.translate('select_group'), style: const TextStyle(color: Colors.grey)),
                items: _groups.map((Group group) {
                  return DropdownMenuItem<Group>(
                    value: group,
                    child: Text(
                      group.name,
                      style: const TextStyle(color: Colors.white),
                    ),
                  );
                }).toList(),
                onChanged: (Group? newValue) {
                  setState(() {
                    _selectedGroup = newValue;
                  });
                },
              ),
            ),
          ),
          
          const SizedBox(height: 24),
          
          // Media Picker Area
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              height: 200,
              decoration: BoxDecoration(
                color: const Color(0xFF23272E),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFFFFC107).withOpacity(0.5),
                  style: BorderStyle.solid,
                  width: 1,
                ),
              ),
              child: _selectedFile != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: _fileType == 'image'
                          ? Image.file(_selectedFile!, fit: BoxFit.cover)
                          : Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.videocam, size: 48, color: Colors.white),
                                  const SizedBox(height: 8),
                                  Text(
                                    _selectedFile!.path.split('/').last,
                                    style: const TextStyle(color: Colors.white),
                                  ),
                                ],
                              ),
                            ),
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.add_a_photo, size: 48, color: Colors.grey),
                        const SizedBox(height: 12),
                        Text(
                          context.l10n.translate('click_to_select_photo'),
                          style: const TextStyle(color: Colors.grey),
                        ),
                        TextButton.icon(
                          onPressed: _pickVideo,
                          icon: const Icon(Icons.videocam),
                          label: Text(context.l10n.translate('or_select_video')),
                        ),
                      ],
                    ),
            ),
          ),
          
          if (_selectedFile != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () {
                    setState(() {
                      _selectedFile = null;
                      _fileType = null;
                    });
                  },
                  icon: const Icon(Icons.close, color: Colors.red),
                  label: Text(context.l10n.translate('delete'), style: const TextStyle(color: Colors.red)),
                ),
              ),
            ),
            
          const SizedBox(height: 24),
          
          // Comment Field
          TextField(
            controller: _commentController,
            style: const TextStyle(color: Colors.white),
            maxLines: 3,
            decoration: InputDecoration(
              labelText: context.l10n.translate('report_comment'),
              hintText: context.l10n.translate('report_hint'),
              alignLabelWithHint: true,
            ),
          ),
          
          const SizedBox(height: 32),
          
          // Send Button
          SizedBox(
            height: 50,
            child: ElevatedButton.icon(
              onPressed: _isUploading ? null : _sendReport,
              icon: _isUploading 
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send),
              label: Text(_isUploading ? context.l10n.translate('sending') : context.l10n.translate('send_report')),
            ),
          ),
        ],
      ),
    );
  }
}
