import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final _apiService = ApiService();
  Map<String, dynamic>? _user;
  bool _isLoading = true;

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
      setState(() => _user = user);
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

  void _updatePreferences(String keyword, bool isRemote) async {
    final userId = _user?['user']['id'];
    if (userId == null) return;

    try {
      await _apiService.updatePreferences(userId, keyword, isRemote);
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
    bool isRemote = _user?['user']['isRemote'] ?? false;
    bool isSaving = false;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              title: Row(
                children: [
                  Icon(Icons.tune, color: Theme.of(context).primaryColor),
                  const SizedBox(width: 8),
                  const Text('Preferências'),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: keywordController,
                    decoration: InputDecoration(
                      labelText: 'Cargo ou Tecnologia',
                      hintText: 'Ex: Desenvolvedor React',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      filled: true,
                      fillColor: Colors.grey.shade50,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    decoration: BoxDecoration(
                      color: isRemote ? Colors.green.shade50 : Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isRemote ? Colors.green.shade200 : Colors.grey.shade300,
                      ),
                    ),
                    child: SwitchListTile(
                      title: const Text('Apenas Vagas Remotas'),
                      subtitle: Text(
                        isRemote ? 'Você verá apenas vagas home office' : 'Mostrando todas as vagas',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                      value: isRemote,
                      activeThumbColor: Colors.green,
                      onChanged: (val) => setState(() => isRemote = val),
                      secondary: Icon(
                        isRemote ? Icons.home_work : Icons.business,
                        color: isRemote ? Colors.green : Colors.grey,
                      ),
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  onPressed: isSaving ? null : () async {
                    setState(() => isSaving = true);
                    Navigator.pop(context);
                    _updatePreferences(keywordController.text, isRemote);
                  },
                  style: ElevatedButton.styleFrom(
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                  child: isSaving 
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Salvar'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _activateTelegram() async {
    final userId = _user?['user']['id'];
    if (userId == null) return;

    final botBaseUrl = dotenv.env['TELEGRAM_BOT_URL']!;
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
    final userName = _user?['user']['name'] ?? 'Usuário';
    final userInitial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.work_outline_rounded, color: Color(0xFF0D47A1)),
            SizedBox(width: 8),
            Text(
              'JobMatch AI',
              style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF0D47A1)),
            ),
          ],
        ),
        centerTitle: false,
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async => _loadUser(),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header com Avatar
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: Theme.of(context).colorScheme.primary,
                          child: Text(
                            userInitial,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Olá, $userName!',
                              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                            ),
                            Text(
                              'Plano: ${_user!['user']['plan']}',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),

                    // Seção de Preferências
                    Text(
                      'Sua Busca Ideal',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Icon(Icons.manage_search, size: 32, color: Color(0xFF0D47A1)),
                                IconButton(
                                  icon: const Icon(Icons.edit, color: Colors.grey),
                                  onPressed: _showPreferencesDialog,
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Wrap(
                              spacing: 8,
                              children: [
                                Chip(
                                  avatar: const Icon(Icons.search, size: 18),
                                  label: Text(_user?['user']['keyword'] ?? 'Nenhum termo definido'),
                                  backgroundColor: Colors.blue.shade50,
                                ),
                                if (_user?['user']['isRemote'] == true)
                                  Chip(
                                    avatar: const Icon(Icons.home_work, size: 18),
                                    label: const Text('Remoto'),
                                    backgroundColor: Colors.green.shade50,
                                  )
                                else
                                  Chip(
                                    avatar: const Icon(Icons.location_on, size: 18),
                                    label: const Text('Presencial/Híbrido'),
                                    backgroundColor: Colors.orange.shade50,
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Seção de Integrações
                    Text(
                      'Canais de Notificação',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    const SizedBox(height: 12),
                    
                    // Card Telegram
                    Card(
                      elevation: _isTelegramConnected() ? 2 : 4,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(
                          color: _isTelegramConnected() ? Colors.green.withOpacity(0.5) : Colors.transparent,
                          width: 1,
                        ),
                      ),
                      color: _isTelegramConnected() ? Colors.green.shade50 : Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(20.0),
                        child: Column(
                          children: [
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.blue.shade50,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.telegram, size: 32, color: Colors.blue),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text(
                                        'Notificações no Telegram',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        _isTelegramConnected()
                                            ? 'Bot ativo e monitorando vagas'
                                            : 'Receba vagas novas instantaneamente',
                                        style: TextStyle(
                                          color: _isTelegramConnected() ? Colors.green[800] : Colors.grey[600],
                                          fontSize: 13,
                                          fontWeight: _isTelegramConnected() ? FontWeight.w500 : FontWeight.normal,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (_isTelegramConnected())
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.green.shade100,
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(Icons.check, size: 16, color: Colors.green),
                                        SizedBox(width: 4),
                                        Text(
                                          'ATIVO',
                                          style: TextStyle(
                                            color: Colors.green,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                            if (!_isTelegramConnected()) ...[
                              const SizedBox(height: 20),
                              const Divider(),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  onPressed: _activateTelegram,
                                  icon: const Icon(Icons.rocket_launch),
                                  label: const Text('ATIVAR NOTIFICAÇÕES AGORA'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFF0088cc), // Telegram Blue
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    elevation: 2,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'Você será redirecionado para o Telegram. Clique em "Começar" ou "/start" no bot.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[500],
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
