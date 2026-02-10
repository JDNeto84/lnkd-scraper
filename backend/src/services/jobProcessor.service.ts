import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { promisify } from 'util';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

export class JobProcessorService {
  private openClawToken: string;

  constructor() {
    this.openClawToken = process.env.OPENCLAW_GATEWAY_TOKEN || '';
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
          const processedDescription = await this.callOpenClaw(job.description);
          
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
            console.warn(`Failed to process job ${job.id}: No response from OpenClaw.`);
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

  private async callOpenClaw(description: string): Promise<string | null> {
    try {
      const fullPrompt = `${this.systemPrompt}\n\nJob Description:\n${description}`;
      
      // Use the local npm package binary
      // The backend container has WORKDIR /app, so this is relative to that
      const openclawPath = './node_modules/.bin/openclaw';
      
      const args = [
        'agent',
        '--agent', 'main',
        '--session-id', `job-${Date.now()}`, // Unique session per call or reuse? 
                                            // Reusing session might accumulate context which is bad for independent job descriptions.
                                            // Using unique session ID ensures clean slate.
        '--message', fullPrompt,
        '--json'
      ];

      console.log('Executing OpenClaw CLI...');
      const { stdout, stderr } = await execFileAsync(openclawPath, args, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 120000 // 2 minutes timeout
      });

      if (stderr) {
        // stderr might contain logs even on success, so we just log it as debug/warn
        console.warn('OpenClaw CLI stderr (might be logs):', stderr);
      }

      console.log('OpenClaw response received.');
      
      try {
        const json = JSON.parse(stdout);
        
        if (json.status !== 'ok' || !json.result || !json.result.payloads || json.result.payloads.length === 0) {
           console.warn('Invalid OpenClaw JSON response:', JSON.stringify(json).slice(0, 200));
           return null;
        }

        const responseText = json.result.payloads.map((p: any) => p.text).join('\n');
        
        if (!responseText.trim()) {
          console.warn('Empty text in OpenClaw response');
          return null;
        }

        return responseText.trim();

      } catch (parseError) {
        console.error('Failed to parse OpenClaw JSON output:', parseError);
        console.log('Raw output start:', stdout.slice(0, 500));
        return null;
      }

    } catch (error) {
      console.error('Error calling OpenClaw CLI:', error);
      return null;
    }
  }
}
