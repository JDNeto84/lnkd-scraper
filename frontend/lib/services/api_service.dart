import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiService {
  static String get baseUrl {
    const url = String.fromEnvironment('API_BASE_URL');
    return url;
  }
  
  final _storage = const FlutterSecureStorage();

  Future<Map<String, String>> _getHeaders() async {
    String? token = await _storage.read(key: 'jwt_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Auth: Login
  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      await _storage.write(key: 'jwt_token', value: data['token']);
      return data;
    } else {
      print('❌ Erro no login: ${response.statusCode} - ${response.body}');
      throw Exception('Login failed: ${response.body}');
    }
  }

  // User: Register
  Future<void> register(String name, String email, String password, String location) async {
    final response = await http.post(
      Uri.parse('$baseUrl/users/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'name': name,
        'email': email,
        'password': password,
        'location': location,
      }),
    );

    if (response.statusCode != 201) {
      throw Exception('Registration failed: ${response.body}');
    }
  }

  // User: Telegram Setup
  Future<void> linkTelegram(String telegramChatId) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse('$baseUrl/users/telegram-setup'),
      headers: headers,
      body: jsonEncode({'telegramChatId': telegramChatId}),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to link Telegram: ${response.body}');
    }
  }

  // User: Update Preferences
  Future<void> updatePreferences(String userId, String keyword, String location, bool isRemote) async {
    final headers = await _getHeaders();
    final response = await http.patch(
      Uri.parse('$baseUrl/users/$userId/preferences'),
      headers: headers,
      body: jsonEncode({
        'keyword': keyword,
        'location': location,
        'isRemote': isRemote,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to update preferences: ${response.body}');
    }
  }

  // User: Get Me
  Future<Map<String, dynamic>> getMe() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/me'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to get user profile: ${response.body}');
    }
  }

  // CV: Upload
  Future<Map<String, dynamic>> uploadCV(List<int> fileBytes, String filename) async {
    String? token = await _storage.read(key: 'jwt_token');
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/upload-cv'));
    
    if (token != null) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    
    request.files.add(http.MultipartFile.fromBytes(
      'file',
      fileBytes,
      filename: filename,
    ));
    
    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      print('❌ Erro no uploadCV: ${response.statusCode} - ${response.body}');
      throw Exception('Failed to upload CV: ${response.body}');
    }
  }
  
  // Logout
  Future<void> logout() async {
    await _storage.delete(key: 'jwt_token');
  }
}
