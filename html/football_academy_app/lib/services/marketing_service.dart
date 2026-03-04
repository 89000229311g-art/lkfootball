import 'package:dio/dio.dart';
import '../config/api_config.dart';
import '../models/campaign.dart';
import 'api_service.dart';

class MarketingService {
  final Dio _dio = ApiService().dio;

  Future<List<Campaign>> getCampaigns() async {
    try {
      final response = await _dio.get(ApiConfig.campaigns);
      
      if (response.data is List) {
        return (response.data as List).map((e) => Campaign.fromJson(e)).toList();
      }
      return [];
    } catch (e) {
      print('Error fetching campaigns: $e');
      rethrow;
    }
  }

  Future<Campaign> createCampaign(Map<String, dynamic> data) async {
    try {
      final response = await _dio.post(ApiConfig.campaigns, data: data);
      return Campaign.fromJson(response.data);
    } catch (e) {
      print('Error creating campaign: $e');
      rethrow;
    }
  }

  Future<Campaign> updateCampaign(int id, Map<String, dynamic> data) async {
    try {
      final response = await _dio.patch('${ApiConfig.campaigns}$id', data: data);
      return Campaign.fromJson(response.data);
    } catch (e) {
      print('Error updating campaign: $e');
      rethrow;
    }
  }

  Future<void> deleteCampaign(int id) async {
    try {
      await _dio.delete('${ApiConfig.campaigns}$id');
    } catch (e) {
      print('Error deleting campaign: $e');
      rethrow;
    }
  }
}
