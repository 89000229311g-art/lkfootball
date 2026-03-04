import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/lead.dart';
import 'api_service.dart';

class CrmService {
  final Dio _dio = ApiService().dio;

  Future<List<Lead>> getLeads({String? status}) async {
    try {
      final response = await _dio.get(
        ApiConfig.leads,
        queryParameters: status != null ? {'status': status} : null,
      );
      
      if (response.data is List) {
        return (response.data as List).map((e) => Lead.fromJson(e)).toList();
      }
      return [];
    } catch (e) {
      print('Error fetching leads: $e');
      rethrow;
    }
  }

  Future<Lead> createLead(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post(ApiConfig.leads, data: data);
      return Lead.fromJson(response.data);
    } catch (e) {
      print('Error creating lead: $e');
      rethrow;
    }
  }

  Future<Lead> updateLeadStatus(int id, String status) async {
    try {
      final response = await _dio.patch(
        '${ApiConfig.leads}$id/status',
        queryParameters: {'status': status},
      );
      return Lead.fromJson(response.data);
    } catch (e) {
      print('Error updating lead status: $e');
      rethrow;
    }
  }

  Future<Lead> updateLead(int id, Map<String, dynamic> data) async {
    try {
      final response = await _dio.put('${ApiConfig.leads}$id', data: data);
      return Lead.fromJson(response.data);
    } catch (e) {
      print('Error updating lead: $e');
      rethrow;
    }
  }

  Future<void> deleteLead(int id) async {
    try {
      await _dio.delete('${ApiConfig.leads}$id');
    } catch (e) {
      print('Error deleting lead: $e');
      rethrow;
    }
  }
}
