# JobMatch AI - Frontend Web

Este é o cliente web do **JobMatch AI**, uma aplicação desenvolvida em Flutter para conectar profissionais de tecnologia às melhores vagas, utilizando inteligência artificial para matchings precisos.

O projeto foi otimizado exclusivamente para execução na **Web** (Chrome/Edge).

## 🚀 Funcionalidades

-   **Autenticação de Usuários**: Login e Cadastro seguros via JWT.
-   **Gerenciamento de Perfil**: Visualização de dados do usuário.
-   **Preferências de Vagas**: Definição de palavras-chave (ex: "React", "Flutter") e filtro para trabalho remoto.
-   **Integração com Telegram**: Conexão com bot do Telegram para recebimento de notificações de vagas.
-   **Interface Responsiva**: Design moderno e adaptado para navegadores desktop e mobile.

## 🏗 Arquitetura do Projeto

O projeto segue uma arquitetura limpa e modular baseada no padrão **Provider** para gerenciamento de estado e injeção de dependências.

### Padrões e Tecnologias

-   **Gerenciamento de Estado**: `Provider` (ChangeNotifier) para estados globais (como Autenticação) e `StatefulWidget` para estados efêmeros de UI.
-   **Serviços**: Camada dedicada (`services/`) para comunicação com APIs REST e armazenamento local.
-   **Armazenamento Seguro**: Utilização do `flutter_secure_storage` para persistência de tokens JWT.
-   **Navegação**: Sistema de rotas nomeadas (`/`, `/register`, `/home`) centralizado no `MaterialApp`.
-   **HTTP Client**: Pacote `http` para requisições ao backend.

### Estrutura de Pastas

```
lib/
├── main.dart           # Ponto de entrada (Configuração do App, Rotas e Tema)
├── providers/          # Gerenciadores de estado (Logic)
│   └── auth_provider.dart  # Lógica de autenticação e sessão
├── screens/            # Telas da aplicação (UI)
│   ├── home_screen.dart    # Dashboard principal e preferências
│   ├── login_screen.dart   # Tela de login
│   └── register_screen.dart # Tela de cadastro
└── services/           # Camada de infraestrutura e dados
    ├── api_service.dart    # Comunicação com o Backend REST
    └── auth_service.dart   # Serviços específicos de auth
```

## 🛠 Pré-requisitos

-   [Flutter SDK](https://flutter.dev/docs/get-started/install) instalado.
-   Navegador (Chrome ou Edge) instalado.
-   Backend do JobMatch AI rodando localmente na porta `3000` (ou configurado conforme necessário).

## ⚙️ Como Rodar

1.  **Clone o repositório** e acesse a pasta do projeto.

2.  **Instale as dependências**:
    ```bash
    flutter pub get
    ```

3.  **Habilite o suporte Web** (caso não esteja ativo):
    ```bash
    flutter config --enable-web
    ```

4.  **Execute o projeto no Chrome**:
    ```bash
    flutter run -d chrome
    ```

    *Nota: O projeto está configurado para acessar o backend em `http://localhost:3000`.*

## 🎨 Design System

O projeto utiliza o **Material Design 3** com uma paleta de cores personalizada:
-   **Primária**: Azul Profissional (`#0D47A1`)
-   **Secundária**: Ciano Vibrante (`#00E5FF`)
-   **Fundo**: Off-white (`#F5F7FA`) para conforto visual.
