import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { UserController, registerUserSchema, telegramSetupSchema, userPreferencesSchema } from '../controllers/user.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const userController = new UserController();

export async function userRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post('/users/register', {
    schema: {
      tags: ['Users'],
      summary: 'Register a new user',
      body: registerUserSchema,
      response: {
        201: z.object({
          message: z.string(),
          user: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
          }),
        }),
      },
    },
  }, userController.register);

  app.withTypeProvider<ZodTypeProvider>().patch('/users/telegram-setup', {
    schema: {
      tags: ['Users'],
      summary: 'Link Telegram Chat ID',
      body: telegramSetupSchema,
      response: {
        200: z.object({
            message: z.string()
        })
      }
    }
  }, userController.setupTelegram);

  app.withTypeProvider<ZodTypeProvider>().patch('/users/:id/preferences', {
    preHandler: [authenticateJWT],
    schema: {
      tags: ['Users'],
      summary: 'Update user search preferences',
      params: z.object({
        id: z.string(),
      }),
      body: userPreferencesSchema,
      response: {
        200: z.object({
          message: z.string(),
          user: z.object({
            keyword: z.string().optional().nullable(),
            isRemote: z.boolean(),
          })
        })
      }
    }
  }, userController.updatePreferences);
}
