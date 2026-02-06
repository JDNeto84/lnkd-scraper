import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AuthController } from '../controllers/auth.controller';
import { loginSchema } from '../services/auth.service';
import { authenticateJWT } from '../middlewares/auth.middleware';

const authController = new AuthController();

export async function authRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post('/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Authenticate user',
      body: loginSchema,
      response: {
        200: z.object({
          token: z.string(),
          user: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            plan: z.string(), // Enum no prisma, string aqui
          }),
        }),
      },
    },
  }, authController.login);

  app.withTypeProvider<ZodTypeProvider>().get('/me', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Auth'],
      summary: 'Get current user',
      security: [{ bearerAuth: [] }],
      response: {
        200: z.object({
          user: z.object({
            id: z.string(),
            name: z.string().optional(),
            email: z.string().optional(),
            plan: z.string(),
            telegramChatId: z.string().nullable().optional(),
            keyword: z.string().nullable().optional(),
            isRemote: z.boolean().optional(),
          }),
        }),
      },
    },
  }, authController.me);
}
