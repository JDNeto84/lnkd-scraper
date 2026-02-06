import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { userRoutes } from './routes/user.routes';
import { authRoutes } from './routes/auth.routes';
import { TelegramService } from './services/telegram.service';
import { ScraperService } from './services/scraper.service';
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fix BigInt serialization for JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = fastify({
  logger: true
});

// Add schema validator and serializer
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register CORS
app.register(cors, {
  origin: true,
});

// Register Swagger
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

app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
});

// Register routes
app.register(userRoutes);
app.register(authRoutes);

// Rota manual para forçar o scraping
app.get('/api/scrape', async (request: any, reply) => {
  const scraper = new ScraperService();
  const { keyword } = request.query as { keyword?: string };
  
  try {
    const result = await scraper.scrapeJobs(keyword);
    return reply.send({ message: 'Scraping executado', result });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ message: 'Erro ao executar scraping' });
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

// Initialize Services
const telegramService = process.env.TELEGRAM_TOKEN ? new TelegramService(process.env.TELEGRAM_TOKEN) : null;
const scraperService = new ScraperService();

// Start Telegram Bot
if (telegramService) {
  telegramService.launch().catch(err => {
    app.log.error(err, 'Failed to launch Telegram Bot');
  });
} else {
  app.log.warn('TELEGRAM_TOKEN not provided. Bot will not start.');
}

// Schedule Scraping Job (Every 30 minutes)
cron.schedule('*/30 * * * *', async () => {
  app.log.info('Running scheduled scraping task...');
  try {
    await scraperService.scrapeJobs(); // Runs with default or logic to iterate users can be added later
    app.log.info('Scraping task completed successfully.');
  } catch (error) {
    app.log.error(error, 'Error executing scheduled scraping task');
  }
});

const PORT = Number(process.env.PORT) || 3000;

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
