# Fluxo de Funcionamento: Scraper e Processamento de IA

Este documento descreve como o sistema coleta vagas do LinkedIn e processa as descrições usando Inteligência Artificial (OpenClaw + Google Gemini).

## Visão Geral do Fluxo

O sistema opera em dois processos distintos e independentes (assíncronos), mas complementares:

1.  **Coleta de Vagas (Scraper)**: Responsável por buscar vagas novas e salvar no banco de dados.
2.  **Processamento de IA (Job Processor)**: Responsável por pegar as vagas salvas e refinar suas descrições.

Eles **não rodam juntos no mesmo passo síncrono** (ou seja, o scraper não espera a IA terminar para salvar a vaga). Isso é intencional para garantir performance e evitar que falhas na IA bloqueiem a coleta de novas vagas.

---

## 1. O Job Scraper (Coleta)

O Scraper é o ponto de entrada das vagas no sistema.

*   **Gatilhos de Execução**:
    *   **Automático (Cron)**: Roda a cada **15 minutos** (`*/15 * * * *` no `server.ts`).
    *   **Manual (Telegram)**: Acionado quando um usuário envia `/vagas` e o bot não encontra resultados recentes no banco.
    *   **Manual (API)**: Endpoint `GET /api/scrape`.

*   **O que ele faz**:
    1.  Acessa o LinkedIn usando Playwright (navegador real simulado).
    2.  Busca vagas baseadas em keywords dos usuários ou busca geral (Brasil, Remoto, últimas 24h).
    3.  Itera por várias páginas de resultados.
    4.  Para cada vaga nova encontrada:
        *   Acessa a página de detalhes da vaga.
        *   Extrai a descrição completa (texto bruto).
        *   Filtra vagas indesejadas (ex: que exigem Inglês fluente, se configurado).
        *   Salva a vaga na tabela `Job` do banco de dados.
    5.  **Estado Inicial**: Ao salvar, define os campos:
        *   `adjustIA`: `false` (Pendente de processamento)
        *   `adjustedDescription`: `null` (Vazio)

---

## 2. O Job Processor (IA)

Este é o processo que refina as informações brutas coletadas.

*   **Gatilhos de Execução**:
    *   **Automático (Cron)**: Roda a cada **10 minutos** (`*/10 * * * *` no `server.ts`).
    *   **Manual (API)**: Endpoint `POST /api/process-jobs`.

*   **O que ele faz**:
    1.  Busca no banco de dados um lote de vagas (ex: 10 por vez) que atendam ao critério:
        *   `adjustIA: false` (Ainda não processadas)
        *   `description: not null` (Possuem descrição bruta)
    2.  Para cada vaga do lote:
        *   Envia a descrição bruta para o agente **OpenClaw** (container separado).
        *   O OpenClaw usa a LLM (Google Gemini) com um prompt especializado para:
            *   Extrair Hard Skills (Obrigatórias e Desejáveis).
            *   Resumir atividades principais.
            *   Identificar localidade e regime.
            *   Remover texto de marketing.
    3.  Recebe a resposta formatada da IA.
    4.  Atualiza a vaga no banco de dados:
        *   `adjustedDescription`: Preenchido com o texto tratado.
        *   `adjustIA`: `true` (Marcado como processado).

---

## Resumo da Resposta para o Usuário

**Pergunta**: "Documente todo o fluxo roda o job scraper e a descrption IA junto? Ou apos rodar scraper o job roda em todas vagas do banco que nao esta com o campo adjustIa false?"

**Resposta Técnica**:
O sistema funciona no modelo **"após rodar o scraper"**. Eles são processos desacoplados:

1.  O **Scraper** roda primeiro (a cada 15 min), coleta a vaga e a salva com `adjustIA: false`.
2.  O **Job Processor** roda em paralelo/sequência (a cada 10 min), pega essas vagas pendentes (`adjustIA: false`) e as processa.

Isso significa que pode haver um pequeno intervalo (minutos) entre a vaga ser coletada e a descrição ajustada estar disponível, o que é ideal para estabilidade do sistema.
