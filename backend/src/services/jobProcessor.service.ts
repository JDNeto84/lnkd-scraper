import { PrismaClient } from '@prisma/client';
import { Ollama } from 'ollama';

const prisma = new PrismaClient();

export class JobProcessorService {
  private ollama: Ollama;
  private model: string;

  constructor() {
    this.ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    });
    this.model = process.env.OLLAMA_MODEL || 'llama3';
  }

  private systemPrompt = `
Você é um Engenheiro de Dados de Recrutamento especializado em extração de entidades técnicas. Sua tarefa é processar descrições de vagas de TI e extrair informações puramente técnicas e funcionais.

### DIRETRIZES DE EXTRAÇÃO:
1. **Foco Técnico**: Ignore benefícios, cultura da empresa ou textos motivacionais.
2. **Padronização**: Traduza sinônimos para termos padrão (ex: "Experiência em ReactJS" -> "React").
3. **Senioridade**: Identifique explicitamente (Junior, Pleno, Sênior, Especialista). Se não houver, use "Não informado".
4. **Verbos de Ação**: Atividades devem começar com verbos no infinitivo.

### EXEMPLO DE REFERÊNCIA:
**Entrada:** "Buscamos desenvolvedor Backend Java Sênior para trabalhar em São Paulo (Híbrido). Requisitos: Java 17, Spring Boot, Microserviços, SQL e vivência com AWS. Desejável Kafka."
**Saída:**
🏢 Cargo: Desenvolvedor Backend
📈 Nível: Sênior
📍 Local & Regime: São Paulo - Híbrido
🎯 Hard Skills (Obrigatórias): Java 17, Spring Boot, Microserviços, SQL, AWS
✨ Hard Skills (Desejáveis): Kafka
📝 Formação: Não informado
⚙️ Atividades Principais:
- Desenvolver sistemas backend robustos em Java.
- Projetar e manter arquitetura de microserviços.

### FORMATO DE SAÍDA OBRIGATÓRIO:
🏢 Cargo: [Título do Cargo]
📈 Nível: [Junior/Pleno/Sênior/Especialista/Não informado]
📍 Local & Regime: [Cidade/Estado - Presencial/Híbrido/Remoto]
🎯 Hard Skills (Obrigatórias): [Lista de tecnologias separadas por vírgula]
✨ Hard Skills (Desejáveis): [Lista de tecnologias separadas por vírgula]
📝 Formação/Certificação: [Requisitos acadêmicos ou certificações]
⚙️ Atividades Principais:
- [Atividade 1]
- [Atividade 2]

**IMPORTANTE:** Não adicione saudações, explicações ou qualquer texto fora desse formato.
`;

  private cvPrompt = `
Você é um Tech Recruiter Senior e Especialista em Perfilamento de Talentos. Sua tarefa é transformar textos brutos de currículos em perfis técnicos altamente estruturados e padronizados.

### DIRETRIZES DE EXTRAÇÃO:
1. **Síntese Profissional**: Crie um parágrafo que resuma os anos de experiência, cargo atual e principais domínios.
2. **Padronização**: Use termos de mercado (ex: "NodeJS/JavaScript" -> "Node").
3. **Pilha Tecnológica**: Liste linguagens, frameworks e ferramentas essenciais.
4. **Experiências**: Foque no cargo, empresa e tecnologias aplicadas em cada uma (limite as últimas 3).

### EXEMPLO DE REFERÊNCIA:
**Entrada:** "Meu nome é João, sou dev Java há 10 anos. Trabalhei na Empresa X com Spring e Oracle. Recentemente estou focando em Cloud com AWS e Kubernetes. Sou formado em ADS."
**Saída:**
📝 **Resumo:** Desenvolvedor Java com 10 anos de experiência, especializado em sistemas corporativos e em transição para arquiteturas Cloud Native.
🚀 **Tecnologias Core:** Java, Spring, Oracle, AWS, Kubernetes
🏗️ **Experiência Relevante:**
- **Desenvolvedor Java** (Empresa X): Desenvolvimento de sistemas com Spring e banco de dados Oracle.
🎓 **Formação:** Análise e Desenvolvimento de Sistemas (ADS)

### FORMATO DE SAÍDA OBRIGATÓRIO:
📝 **Resumo:** [Parágrafo de síntese]
🚀 **Tecnologias Core:** [Lista separada por vírgula]
🏗️ **Experiência Relevante:**
- **[Cargo]** ([Empresa]): [Resumo da atuação e tecnologias]
🎓 **Formação:** [Cursos e Certificações]

**IMPORTANTE:** Retorne apenas o conteúdo estruturado. Não adicione saudações ou comentários.
`;

  async processUserCV(userId: string, content: string) {
    console.log(`[JobProcessor] Processing CV for user ${userId}...`);
    try {
      const processedCV = await this.callOllama(content, true);

      if (processedCV) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            resumeText: processedCV,
          },
        });
        console.log(`[JobProcessor] CV for user ${userId} processed and saved.`);
      } else {
        console.warn(`[JobProcessor] Failed to process CV for user ${userId}: No response from Ollama.`);
      }
    } catch (error) {
      console.error(`[JobProcessor] Error processing CV for user ${userId}:`, error);
    }
  }

  async processPendingJobs() {
    console.log('Starting job processing...');
    try {
      // Find jobs that haven't been processed yet
      const jobs = await prisma.job.findMany({
        where: {
          adjustIA: false,
          description: {
            not: null,
          },
        },
        take: 10, // Process in batches to avoid overloading
      });

      console.log(`Found ${jobs.length} jobs to process.`);

      for (const job of jobs) {
        if (!job.description) continue;

        try {
          console.log(`Processing job ${job.id}...`);
          const processedDescription = await this.callOllama(job.description);

          if (processedDescription) {
            await prisma.job.update({
              where: { id: job.id },
              data: {
                adjustedDescription: processedDescription,
                adjustIA: true,
              },
            });
            console.log(`Job ${job.id} processed successfully.`);
          } else {
            console.warn(`Failed to process job ${job.id}: No response from Ollama.`);
          }
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
          // Optionally mark as failed or retry count? For now, just skip.
        }
      }
    } catch (error) {
      console.error('Error in processPendingJobs:', error);
    }
  }

  private async callOllama(text: string, isCV: boolean = false): Promise<string | null> {
    try {
      console.log(`Sending request to Ollama (${this.model}) at ${this.ollama.config.host}...`);

      const response = await this.ollama.chat({
        model: this.model,
        messages: [
          { role: 'system', content: isCV ? this.cvPrompt : this.systemPrompt },
          { role: 'user', content: `${isCV ? 'Resume Content' : 'Job Description'}:\n${text}` }
        ],
        stream: false,
      });

      if (!response || !response.message || !response.message.content) {
        console.warn('Invalid Ollama response structure:', response);
        return null;
      }

      const content = response.message.content.trim();

      if (!content) {
        console.warn('Empty content in Ollama response');
        return null;
      }

      console.log('Ollama response received successfully.');
      return content;

    } catch (error) {
      console.error('Error calling Ollama:', error);
      return null;
    }
  }
}
