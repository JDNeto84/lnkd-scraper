import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TelegramService {
  private bot: Telegraf;

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.initialize();
  }

  private initialize() {
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

    this.bot.command('vagas', async (ctx) => {
        const chatId = ctx.chat.id;
        try {
            const user = await prisma.user.findFirst({
                where: { telegramChatId: BigInt(chatId) }
            });

            if (!user || !user.keyword) {
                return ctx.reply('Você ainda não definiu suas preferências de busca (palavra-chave). Configure no aplicativo.');
            }

            await ctx.reply(`Buscando vagas para: ${user.keyword} ${user.isRemote ? '(Remoto)' : ''}... 🔍`);

            const jobs = await prisma.job.findMany({
                where: {
                    title: {
                        contains: user.keyword,
                        mode: 'insensitive'
                    },
                },
                orderBy: {
                    createdAt: 'desc' 
                },
                take: 5
            });

            if (!jobs || jobs.length === 0) {
                return ctx.reply('Não encontrei vagas recentes com esses critérios no banco de dados. Tente simplificar sua palavra-chave no App ou aguarde o próximo ciclo de busca.');
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

  async launch() {
    this.bot.launch();
    console.log('🤖 Telegram Bot iniciado!');

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
