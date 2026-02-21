import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../widgets/responsive_layout.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _apiService = ApiService();
  final _locationController = TextEditingController(text: 'Brasil');
  bool _isLoading = false;

  void _register() async {
    if (_nameController.text.isEmpty ||
        _emailController.text.isEmpty ||
        _passwordController.text.isEmpty ||
        _locationController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Por favor, preencha todos os campos.')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      await _apiService.register(
        _nameController.text.trim(),
        _emailController.text.trim(),
        _passwordController.text,
        _locationController.text.trim().isEmpty ? 'Brasil' : _locationController.text.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Cadastro realizado com sucesso! Faça login.'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context); // Voltar para login
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao cadastrar: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('Nova Conta'),
      ),
      body: ResponsiveLayout(
        maxWidth: 500,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(vertical: 24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.person_add_rounded,
                  size: 80,
                  color: colorScheme.primary,
                ),
                const SizedBox(height: 16),
                Text(
                  'Comece agora',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: colorScheme.primary,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Crie seu perfil e deixe a IA encontrar as melhores vagas.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.hintColor,
                  ),
                ),
                const SizedBox(height: 40),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _nameController,
                          decoration: const InputDecoration(
                            labelText: 'Nome Completo',
                            prefixIcon: Icon(Icons.person_rounded),
                          ),
                          textInputAction: TextInputAction.next,
                        ),
                        const SizedBox(height: 20),
                        TextField(
                          controller: _emailController,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            prefixIcon: Icon(Icons.alternate_email_rounded),
                          ),
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                        ),
                        const SizedBox(height: 20),
                        TextField(
                          controller: _passwordController,
                          decoration: const InputDecoration(
                            labelText: 'Senha',
                            prefixIcon: Icon(Icons.lock_person_rounded),
                          ),
                          obscureText: true,
                          onSubmitted: (_) => _register(),
                        ),
                        const SizedBox(height: 20),
                        TextField(
                          controller: _locationController,
                          decoration: const InputDecoration(
                            labelText: 'Localização',
                            hintText: 'Ex: Brasil, São Paulo',
                            prefixIcon: Icon(Icons.location_on_rounded),
                          ),
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _register(),
                        ),
                        const SizedBox(height: 32),
                        _isLoading
                            ? const Center(child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 8.0),
                              child: CircularProgressIndicator(),
                            ))
                            : ElevatedButton(
                                onPressed: _register,
                                style: ElevatedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(vertical: 20),
                                ),
                                child: const Text('CADASTRAR'),
                              ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 32),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Já possui uma conta?',
                      style: TextStyle(color: theme.hintColor),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                      },
                      child: const Text('Fazer Login'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
