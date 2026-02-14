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
Você é um especialista em Análise de Vagas Técnicas. Sua tarefa é analisar descrições de vagas de TI e extrair apenas as informações técnicas e funcionais cruciais para avaliar a compatibilidade com currículos. Reformate essas informações em uma estrutura concisa, objetiva e categorizada, removendo todo o texto de marketing e focando no que é essencial para o match técnico.

Passo a Passo da Análise (Sua Lógica Interna):
Identifique o Cargo e Sênioridade: Pegue o título principal da vaga.
Extraia os "Must-Have" (Obrigatórios): Foque nas tecnologias, linguagens, frameworks e formações acadêmicas listadas como requisitos essenciais. Seja específico com versões (ex: Java 11+, Angular 12).
Extraia os "Nice-to-Have" (Desejáveis): Liste as habilidades complementares ou diferenciais.
Resuma as Principais Atividades: Traduza as responsabilidades em verbos de ação claros no infinitivo (ex: Desenvolver, Manter, Otimizar).
Localidade e Regime: Identifique se é presencial, híbrido ou remoto, e a cidade/estado, se mencionado.

Formato de Saída OBRIGATÓRIO (Use esta estrutura exata):
🏢 Cargo: [Cargo e Nível]
📍 Local & Regime: [Cidade/Estado - Presencial/Híbrido/Remoto]
🎯 Hard Skills (Obrigatórias):
[Tecnologia 1], [Tecnologia 2], [Tecnologia 3]
✨ Hard Skills (Desejáveis/Diferenciais):
[Tecnologia 1], [Tecnologia 2]
📝 Formação/Certificação Exigida:
[Ex: Graduação em Ciência da Computação ou áreas correlatas]
⚙️ Atividades Principais:
[Verbo no infinitivo] [ação] usando/para [tecnologia/contexto].
[Verbo no infinitivo] [ação] em [área/contexto].

Regras Estritas:
Mantenha-se exclusivamente nos aspectos técnicos e funcionais.
Seja direto e use apenas tópicos.
Traduza responsabilidades genéricas em ações específicas: "Colaborar com equipes multidisciplinares" → "Trabalhar em equipe integrando front-end e back-end".
Se uma informação não for fornecida, marque como "Não informado".
Ignore completamente qualquer seção de benefícios, cultura corporativa ou textos de marketing.
`;

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

  private async callOllama(description: string): Promise<string | null> {
    try {
      console.log(`Sending request to Ollama (${this.model}) at ${this.ollama.config.host}...`);
      
      const response = await this.ollama.chat({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: `Job Description:\n${description}` }
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
