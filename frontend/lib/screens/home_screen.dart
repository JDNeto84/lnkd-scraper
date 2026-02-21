import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:file_picker/file_picker.dart';
import '../services/api_service.dart';
import '../widgets/responsive_layout.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final _apiService = ApiService();
  Map<String, dynamic>? _user;
  String? _extractedCVText;
  bool _isLoading = true;
  final _cvTextController = TextEditingController();
  bool _isEditingCV = false;
  bool _isSavingCV = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUser();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadUser();
    }
  }

  void _loadUser() async {
    try {
      final user = await _apiService.getMe();
      setState(() {
        _user = user;
        // Carrega o texto extraído persistido no banco
        if (user['user'] != null && user['user']['extractedText'] != null) {
          _extractedCVText = user['user']['extractedText'];
          _cvTextController.text = _extractedCVText!;
        }
      });
    } catch (e) {
      if (mounted) {
        _showSnackBar('Erro ao carregar perfil: $e', isError: true);
        Navigator.pushReplacementNamed(context, '/');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  bool _isTelegramConnected() {
    final chatId = _user?['user']['telegramChatId'];
    return chatId != null && chatId.toString().isNotEmpty;
  }

  void _updatePreferences(String keyword, String location, bool isRemote) async {
    final userId = _user?['user']['id'];
    if (userId == null) return;

    try {
      await _apiService.updatePreferences(userId, keyword, location, isRemote);
      _showSnackBar('Preferências atualizadas com sucesso!', isError: false);
      _loadUser();
    } catch (e) {
      if (mounted) {
        _showSnackBar('Erro ao atualizar: $e', isError: true);
      }
    }
  }

  void _showPreferencesDialog() {
  final keywordController = TextEditingController(text: _user?['user']['keyword'] ?? '');
  final locationController = TextEditingController(text: _user?['user']['location'] ?? 'Brasil');
  bool isRemote = _user?['user']['isRemote'] ?? false;
  bool isSaving = false;

  showDialog(
    context: context,
    builder: (context) {
      final theme = Theme.of(context);
      final isDark = theme.brightness == Brightness.dark;

      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            backgroundColor: theme.canvasColor,
            elevation: 8,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
            title: Row(
              children: [
                Icon(Icons.tune_rounded, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                const Text('Preferências'),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                   const SizedBox(height: 8),
                  TextField(
                    controller: keywordController,
                    decoration: const InputDecoration(
                      labelText: 'Cargo ou Tecnologia',
                      hintText: 'Ex: Java, NextJs',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: locationController,
                    decoration: const InputDecoration(
                      labelText: 'Localização',
                      hintText: 'Ex: São Paulo',
                      prefixIcon: Icon(Icons.location_on_rounded),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    decoration: BoxDecoration(
                      color: isRemote 
                          ? (isDark ? Colors.green.withOpacity(0.1) : Colors.green.shade50)
                          : (isDark ? Colors.white.withOpacity(0.05) : Colors.grey.shade50),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isRemote 
                            ? (isDark ? Colors.green.withOpacity(0.3) : Colors.green.shade200)
                            : (isDark ? Colors.white10 : Colors.grey.shade300),
                      ),
                    ),
                    child: SwitchListTile(
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      title: const Text('Apenas Vagas Remotas', style: TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text(
                        isRemote ? 'Filtro por Home Office ativado' : 'Mostrando todos os modelos',
                        style: theme.textTheme.bodySmall,
                      ),
                      value: isRemote,
                      activeColor: Colors.green,
                      onChanged: (val) => setState(() => isRemote = val),
                      secondary: Icon(
                        isRemote ? Icons.home_work_rounded : Icons.business_rounded,
                        color: isRemote ? Colors.green : theme.hintColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text('Cancelar', style: TextStyle(color: theme.hintColor)),
              ),
              ElevatedButton(
                onPressed: isSaving ? null : () async {
                  setState(() => isSaving = true);
                  Navigator.pop(context);
                  _updatePreferences(
                    keywordController.text,
                    locationController.text,
                    isRemote,
                  );
                },
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                ),
                child: isSaving 
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Salvar'),
              ),
            ],
          );
        },
      );
    },
  );
}

  void _pickAndUploadCV() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
        withData: true,
      );

      if (result != null) {
        final file = result.files.single;
        
        if (file.bytes == null) {
          throw Exception('Não foi possível ler o arquivo. Tente novamente.');
        }

        setState(() => _isLoading = true);
        
        final response = await _apiService.uploadCV(
          file.bytes!, 
          file.name,
        );
        
        if (mounted) {
          setState(() {
            _extractedCVText = response['content'];
            if (_extractedCVText != null) {
              _cvTextController.text = _extractedCVText!;
            }
          });
        }
        _showSnackBar('CV enviado com sucesso! ID: ${response['id']}', isError: false);
      }
    } catch (e) {
      _showSnackBar('Erro ao enviar CV: $e', isError: true);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showEditCVDialog() {
    _cvTextController.text = _extractedCVText ?? '';
    bool isSaving = false;

    showDialog(
      context: context,
      builder: (context) {
        final theme = Theme.of(context);
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              backgroundColor: theme.canvasColor,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
              title: Row(
                children: [
                   Icon(Icons.edit_note_rounded, color: theme.colorScheme.primary),
                   const SizedBox(width: 12),
                   const Text('Editar Currículo'),
                ],
              ),
              content: SizedBox(
                width: 600,
                child: TextField(
                  controller: _cvTextController,
                  maxLines: 15,
                  decoration: InputDecoration(
                    hintText: 'Cole ou edite seu currículo aqui...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text('Cancelar', style: TextStyle(color: theme.hintColor)),
                ),
                ElevatedButton(
                  onPressed: isSaving ? null : () async {
                    setState(() => isSaving = true);
                    try {
                      await _apiService.updateCVText(_cvTextController.text);
                      if (mounted) {
                        this.setState(() {
                          _extractedCVText = _cvTextController.text;
                        });
                        Navigator.pop(context);
                        _showSnackBar('Currículo atualizado!', isError: false);
                      }
                    } catch (e) {
                      if (mounted) {
                        _showSnackBar('Erro ao salvar: $e', isError: true);
                      }
                    } finally {
                      if (mounted) setState(() => isSaving = false);
                    }
                  },
                  child: isSaving 
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Salvar'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _saveManualCV() async {
    // Mantendo para compatibilidade se necessário, mas o fluxo principal agora é via Diálogo
    _showEditCVDialog();
  }

  void _disconnectTelegram() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Desconectar Telegram?'),
        content: const Text('Você deixará de receber notificações de vagas instantâneas.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(context, true), 
            child: const Text('Desconectar', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        setState(() => _isLoading = true);
        await _apiService.disconnectTelegram();
        _showSnackBar('Telegram desconectado com sucesso!', isError: false);
        _loadUser();
      } catch (e) {
        _showSnackBar('Erro ao desconectar: $e', isError: true);
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }
  }

  void _activateTelegram() async {
    final userId = _user?['user']['id'];
    if (userId == null) return;

    const botBaseUrl = String.fromEnvironment('TELEGRAM_BOT_URL');
    final botUrl = '$botBaseUrl?start=$userId';
    
    try {
      if (!await launchUrl(Uri.parse(botUrl), mode: LaunchMode.externalApplication)) {
        throw Exception('Could not launch $botUrl');
      }
    } catch (e) {
      if (mounted) {
        _showSnackBar('Não foi possível abrir o Telegram: $e', isError: true);
      }
    }
  }

  void _logout() async {
    await _apiService.logout();
    if (mounted) {
      Navigator.pushReplacementNamed(context, '/');
    }
  }

  void _showSnackBar(String message, {bool isError = false}) {
    // Log do erro para o console, pois o SnackBar pode sumir rápido
    if (isError) {
      print('🔴 ERRO (SnackBar): $message');
    } else {
      print('🟢 INFO (SnackBar): $message');
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;

    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    final userData = _user?['user'];
    final userName = userData?['name'] ?? 'Usuário';
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';

    return Scaffold(
      appBar: AppBar(
        title: const Text('JobMatch AI'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Sair',
            onPressed: _logout,
          ),
        ],
      ),
      body: ResponsiveLayout(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Card
              Card(
                color: colorScheme.primaryContainer.withOpacity(isDark ? 0.2 : 0.9),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 35,
                        backgroundColor: colorScheme.onPrimary,
                        child: Text(
                          userInitial,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: colorScheme.primary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 20),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Bem-vindo, $userName!',
                              style: theme.textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: isDark ? colorScheme.onSurface : colorScheme.onPrimary,
                              ),
                            ),
                            Text(
                              'Plano: ${userData?['plan'] ?? 'Free'}',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: (isDark ? colorScheme.onSurface : colorScheme.onPrimary).withOpacity(0.8),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 32),

              // Overview Stats
              Row(
                children: [
                  Expanded(
                    child: _buildStatCard(
                      'Perfil Completo',
                      '${_calculateProfileCompletion()}%',
                      Icons.verified_user_rounded,
                      colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _buildStatCard(
                      'Notificações',
                      _isTelegramConnected() ? 'Ativas' : 'Inativas',
                      Icons.notifications_active_rounded,
                      _isTelegramConnected() ? Colors.green : colorScheme.secondary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 32),

              // Search Preferences Section
              Text(
                'O que você procura?',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(Icons.search_rounded, color: colorScheme.primary),
                      title: const Text('Cargo ou Palavra-chave'),
                      subtitle: Text(userData?['keyword'] ?? 'Não definido'),
                      trailing: const Icon(Icons.edit_rounded, size: 20),
                      onTap: _showPreferencesDialog,
                    ),
                    Divider(height: 1, indent: 64, color: isDark ? Colors.white10 : Colors.black12),
                    ListTile(
                      leading: Icon(Icons.location_on_rounded, color: colorScheme.primary),
                      title: const Text('Localização Preferencial'),
                      subtitle: Text(userData?['location'] ?? 'Brasil'),
                      trailing: const Icon(Icons.edit_rounded, size: 20),
                      onTap: _showPreferencesDialog,
                    ),
                    Divider(height: 1, indent: 64, color: isDark ? Colors.white10 : Colors.black12),
                    SwitchListTile(
                      secondary: Icon(Icons.home_work_rounded, color: colorScheme.primary),
                      title: const Text('Apenas Vagas Remotas'),
                      value: userData?['isRemote'] ?? false,
                      onChanged: (val) => _updatePreferences(
                        userData?['keyword'] ?? '',
                        userData?['location'] ?? '',
                        val,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // CV Section
              Text(
                'Seu Perfil Profissional',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: Icon(Icons.description_rounded, color: colorScheme.primary),
                      title: const Text('Currículo (PDF)'),
                      subtitle: Text(_extractedCVText != null ? 'Currículo Processado' : 'Ainda não enviado'),
                      trailing: OutlinedButton.icon(
                        onPressed: _pickAndUploadCV,
                        icon: const Icon(Icons.upload_file_rounded, size: 18),
                        label: const Text('Upload PDF'),
                      ),
                    ),
                    if (_extractedCVText != null) ...[
                      Divider(height: 1, indent: 64, color: isDark ? Colors.white10 : Colors.black12),
                      ListTile(
                        leading: Icon(Icons.edit_note_rounded, color: colorScheme.primary),
                        title: const Text('Editar Texto do Currículo'),
                        subtitle: const Text('Ajuste as informações extraídas pela IA'),
                        trailing: const Icon(Icons.chevron_right_rounded),
                        onTap: _showEditCVDialog,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 32),

              // Telegram Integration
              Text(
                'Avisos Instantâneos',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0088CC).withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.telegram, color: Color(0xFF0088CC), size: 32),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Bot do Telegram',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            Text(
                              _isTelegramConnected() 
                                ? 'Recebendo vagas em tempo real' 
                                : 'Ative para receber vagas no celular',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      if (_isTelegramConnected())
                        TextButton(
                          onPressed: _disconnectTelegram,
                          child: const Text('DESATIVAR', style: TextStyle(color: Colors.red)),
                        )
                      else
                        ElevatedButton(
                          onPressed: _activateTelegram,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF0088CC),
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('ATIVAR'),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }

  int _calculateProfileCompletion() {
    int percentage = 0;
    final userData = _user?['user'];
    
    // Keyword (33%)
    final keyword = userData?['keyword'] as String?;
    if (keyword != null && keyword.trim().isNotEmpty) {
      percentage += 33;
    }
    
    // Location (33%)
    final location = userData?['location'] as String?;
    if (location != null && location.trim().isNotEmpty) {
      percentage += 33;
    }
    
    // CV Text (34%)
    if (_extractedCVText != null && _extractedCVText!.trim().isNotEmpty) {
      percentage += 34;
    }
    
    return percentage;
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    final theme = Theme.of(context);
    return Card(
      elevation: 0,
      color: color.withOpacity(0.05),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: color.withOpacity(0.1)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 12),
            Text(
              value,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.hintColor),
            ),
          ],
        ),
      ),
    );
  }
}
