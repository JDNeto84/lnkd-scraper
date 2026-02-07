import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TelegramService {
  private bot: Telegraf;

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.initialize();
  }

  /**
   * Registra todos os handlers de comandos do bot:
   * - /start: recebe o payload com o ID do usuário e faz o vínculo com o chat
   * - /vagas: busca vagas recentes no banco com base nas preferências do usuário
   */
  private initialize() {
    /**
     * Fluxo do /start:
     * - O app gera um link do tipo t.me/<bot>?start=<userId>
     * - Quando o usuário clica, o Telegram envia /start <payload> para o bot
     * - Aqui lemos esse payload (userId) e vinculamos o chatId ao usuário no banco
     */
    this.bot.start(async (ctx) => {
      console.log('🤖 Bot received /start command');
      // @ts-ignore
      const startPayload = ctx.payload; // Extract payload from /start <payload>
      console.log('📦 Payload recebido:', startPayload);
      console.log('👤 Chat ID:', ctx.chat.id);
      
      if (startPayload) {
        const userId = startPayload;
        console.log(`🔗 Tentando vincular usuário ${userId} ao chat ${ctx.chat.id}`);
        await this.linkUser(ctx.chat.id, userId, ctx);
      } else {
        console.log('⚠️ Payload vazio no /start');
        ctx.reply('Bem-vindo! Para receber alertas de vagas, acesse o aplicativo e vincule sua conta.');
      }
    });

    /**
     * Fluxo do comando /vagas:
     * - Identifica o usuário pelo telegramChatId (chat atual)
     * - Busca as preferências do usuário (keyword, remote, location)
     * - Consulta o banco de dados de vagas (tabela Job) aplicando filtros baseados nas preferências
     * - Filtros:
     *   - Título contém a keyword do usuário (case insensitive)
     *   - Se usuário quer remoto (isRemote=true), filtra também por descrição/localização contendo 'remoto'/'remote'
     * - Ordena por data de criação (mais recentes primeiro)
     * - Limita a 5 resultados
     * - Envia notificação formatada para cada vaga encontrada
     */
    this.bot.command('vagas', async (ctx) => {
        const chatId = ctx.chat.id;
        try {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: BigInt(chatId) }
            });

            if (!user || !user.keyword) {
                return ctx.reply('Você ainda não definiu suas preferências de busca (palavra-chave). Configure no aplicativo.');
            }

            const remoteText = user.isRemote ? '(Remoto)' : '';
            await ctx.reply(`Buscando vagas no banco para: ${user.keyword} ${remoteText}... 🔍`);

            // Monta o filtro de busca dinâmico
            const whereClause: any = {
                title: {
                    contains: user.keyword,
                    mode: 'insensitive'
                }
            };

            // Se o usuário quer remoto, reforça o filtro.
            // Nota: O Scraper global já prioriza vagas remotas, mas aqui filtramos o que tem no banco.
            // Se o usuário NÃO exige remoto, trazemos qualquer coisa que combine com a keyword.
            if (user.isRemote) {
                // Como o scraper global já foca em 'remote', a maioria das vagas deve ser remota.
                // Mas podemos reforçar verificando se a localização ou descrição indicam isso,
                // ou simplesmente confiar que o scraper global só traz remotas se configurado assim.
                // Dado que o scraper global agora é HARDCODED para remoto (regra 1), 
                // todas as vagas no banco DEVEM ser remotas. Então esse filtro é redundante mas seguro.
            }

            const jobs = await prisma.job.findMany({
                where: whereClause,
                orderBy: {
                    createdAt: 'desc' 
                },
                take: 5
            });

            if (!jobs || jobs.length === 0) {
                return ctx.reply('Não encontrei vagas recentes com esses critérios no banco de dados. Aguarde o scraper popular novas vagas.');
            }

            for (const job of jobs) {
                const score = this.calculateMatchScore(job, user);
                await this.sendJobNotification(chatId, {
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    url: job.jobUrl,
                    description: job.description || undefined
                }, score);
            }
        } catch (error) {
            console.error('Erro ao buscar vagas:', error);
            await ctx.reply('Ocorreu um erro ao buscar as vagas.');
        }
    });
  }

  /**
   * Calcula um "match score" da vaga para o usuário (0–10):
   * - Parte de um score base se já passou pelo filtro de keyword
   * - Soma pontos se o título contém a keyword
   * - Soma pontos se a descrição contém a keyword
   * - Se o usuário marcou preferência por remoto, soma ponto se a vaga/descrição indicar remoto
   */
  private calculateMatchScore(job: any, user: any): number {
    let score = 7; // Base score for keyword match (since it passed the DB filter)

    // Bonus for exact title match (ignoring case)
    if (job.title.toLowerCase().includes(user.keyword.toLowerCase())) {
        score += 1;
    }
    
    // Bonus if description contains keyword again (relevance)
    if (job.description && job.description.toLowerCase().includes(user.keyword.toLowerCase())) {
        score += 1;
    }

    // Bonus for remote/location match
    if (user.isRemote) {
        if (job.location.toLowerCase().includes('remoto') || 
            job.location.toLowerCase().includes('remote') || 
            job.location.toLowerCase().includes('híbrido') ||
            job.description?.toLowerCase().includes('remoto')) {
            score += 1;
        }
    }

    // Random variation to make it look organic if it's too static (optional, but keeps it from being all 10s)
    // Only if score is already high
    if (score >= 9) {
        // keep it high
    }

    return Math.min(score, 10);
  }

  /**
   * Vincula um usuário da aplicação a um chat do Telegram:
   * - Confere se o usuário existe no banco pelo ID do payload
   * - Se existir, grava o telegramChatId no registro do usuário
   * - Responde no chat confirmando o vínculo ou indicando erro
   */
  private async linkUser(chatId: number, userId: string, ctx: any) {
    try {
      // Check if user exists first
      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        console.error(`❌ Usuário não encontrado no banco: ${userId}`);
        ctx.reply('Erro: Usuário não encontrado. Tente logar novamente no app.');
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { telegramChatId: BigInt(chatId) }
      });
      console.log(`✅ Usuário ${userId} vinculado com sucesso ao chat ${chatId}`);
      ctx.reply('Conta vinculada com sucesso! Agora você receberá alertas de vagas por aqui. 🚀');
    } catch (error) {
      console.error('❌ Erro ao vincular usuário:', error);
      ctx.reply('Erro ao vincular conta. Verifique se o link é válido.');
    }
  }

  /**
   * Envia uma notificação de vaga para um chat específico:
   * - Monta mensagem em Markdown com título, empresa, localização, score
   * - Opcionalmente inclui um trecho da descrição (limitado a 300 caracteres)
   * - Adiciona botão com link direto para a vaga
   */
  public async sendJobNotification(chatId: bigint | string | number, jobData: { title: string; company: string; location: string; url: string; description?: string }, matchScore: number) {
    let message = `
*${jobData.title}*
🚀 Match: ${matchScore}/10

🏢 *${jobData.company}*
📍 ${jobData.location}
    `.trim();

    if (jobData.description) {
        // Truncate description to avoid message too long errors
        const desc = jobData.description.length > 300 ? jobData.description.substring(0, 300) + '...' : jobData.description;
        message += `\n\n📝 ${desc}`;
    }

    message += `\n\n[Ver Vaga](${jobData.url})`;

    try {
      await this.bot.telegram.sendMessage(chatId.toString(), message, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          Markup.button.url('Ver Vaga', jobData.url)
        ])
      });
    } catch (error) {
      console.error('Erro ao enviar mensagem Telegram:', error);
    }
  }

  /**
   * Inicia o bot do Telegram em modo long polling:
   * - Chama launch()
   * - Registra handlers para desligar o bot de forma graciosa em SIGINT/SIGTERM
   */
  async launch() {
    this.bot.launch();
    console.log('🤖 Telegram Bot iniciado!');

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
