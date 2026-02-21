import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fastifyMultipart from '@fastify/multipart';
import { userRoutes } from './routes/user.routes';
import { authRoutes } from './routes/auth.routes';
import { cvRoutes } from './routes/cv.routes';
import { TelegramService } from './services/telegram.service';
import { ScraperService } from './services/scraper.service';
import { JobProcessorService } from './services/jobProcessor.service';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

// Cliente Prisma compartilhado para rotas, cron e serviços auxiliares
const prisma = new PrismaClient();

// Ajuste global para serializar BigInt em JSON (por exemplo, telegramChatId)
// Sem isso, qualquer resposta contendo BigInt quebraria o JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Instância principal do servidor Fastify com logs habilitados
const app = fastify({
  logger: true
});

// Configura o Fastify para usar o Zod como validador/serializador de schemas
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Libera CORS para qualquer origem (frontend web acessar a API)
app.register(cors, {
  origin: true,
});

// Registra a documentação OpenAPI/Swagger da API
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'JobMatch AI API',
      description: 'API for JobMatch AI service',
      version: '1.0.0',
    },
    servers: [],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  transform: jsonSchemaTransform,
});

// Exposição da UI do Swagger em /docs
app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
});

// Registra rotas de domínio
app.register(fastifyMultipart);
app.register(userRoutes);
app.register(authRoutes);
app.register(cvRoutes);

// Endpoint para disparar o scraping manualmente via HTTP:
// - Permite passar keyword/location e flags last24h/remote pela query string
app.get('/api/scrape', async (request: any, reply) => {
  const scraper = new ScraperService();
  const { keyword, location, last24h, remote } = request.query as {
    keyword?: string;
    location?: string;
    last24h?: string;
    remote?: string;
  };
  const last24hFlag = last24h !== 'false';
  const remoteFlag = remote === 'true';

  try {
    const result = await scraper.scrapeJobs({
      keyword,
      location,
      last24h: last24hFlag,
      remote: remoteFlag,
    });
    return reply.send({ message: 'Scraping executado', result });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Erro ao executar scraping' });
  }
});

// Endpoint para disparar o processamento de IA manualmente
app.post('/api/process-jobs', async (request, reply) => {
  try {
    // Processa em background (sem await) ou com await?
    // Com await para dar feedback imediato de "feito" ou "erro"
    // Mas se demorar muito, pode dar timeout.
    // Melhor retornar que começou.
    jobProcessorService.processPendingJobs();
    return reply.send({ message: 'Processamento de vagas iniciado em background.' });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Erro ao iniciar processamento' });
  }
});

// Rota para listar vagas (API Jobs)
app.get('/api/jobs', async (request: any, reply) => {
  const { keyword, location, page } = request.query as { keyword?: string, location?: string, page?: string };

  const jobs = await prisma.job.findMany({
    where: {
      title: { contains: keyword || '', mode: 'insensitive' },
      location: { contains: location || '', mode: 'insensitive' }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return jobs;
});

// Inicialização de serviços auxiliares compartilhados
const scraperService = new ScraperService();
export const jobProcessorService = new JobProcessorService();
const telegramService = process.env.TELEGRAM_TOKEN ? new TelegramService(process.env.TELEGRAM_TOKEN, scraperService) : null;

// Inicializa o bot do Telegram, caso exista TELEGRAM_TOKEN configurado
if (telegramService) {
  telegramService.launch().catch(err => {
    app.log.error(err, 'Failed to launch Telegram Bot');
  });
} else {
  app.log.warn('TELEGRAM_TOKEN not provided. Bot will not start.');
}

// Agenda a tarefa de scraping automático para rodar a cada 15 minutos:
// - Busca vagas de forma ampla (sem keyword específica) para popular o banco
// - Foca em vagas do Brasil, Remotas e das últimas 24h
// - Limpa vagas antigas (mais de 25h) para manter frescor
cron.schedule('*/15 * * * *', async () => {
  app.log.info('Running global scheduled scraping task...');
  try {
    // 1) Executa scraping baseado nas keywords dos usuários
    // Busca keywords únicas na tabela User e executa uma busca para cada
    app.log.info(`Scraping jobs based on user keywords...`);

    await scraperService.scrapeForUsers();

    // 2) Limpa vagas antigas (mais de 25h) conforme regra de negócio
    // Regra: "remove populated from 48 hours to 25 hours"
    const cutoffDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

    const deleted = await prisma.job.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    app.log.info(`Cleaned up ${deleted.count} old jobs (older than 25 hours).`);

    app.log.info('Global scraping task completed successfully.');
  } catch (error) {
    app.log.error(error, 'Error executing scheduled scraping task');
  }
});

// Agenda a tarefa de processamento de vagas com IA a cada 10 minutos
cron.schedule('*/10 * * * *', async () => {
  app.log.info('Running job processing task (AI adjustment)...');
  try {
    await jobProcessorService.processPendingJobs();
    app.log.info('Job processing task completed.');
  } catch (error) {
    app.log.error(error, 'Error executing job processing task');
  }
});

// Inicialização do servidor HTTP Fastify
const PORT = Number(process.env.PORT) || 3000;

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
