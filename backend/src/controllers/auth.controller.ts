import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, LoginInput } from '../services/auth.service';
import { prisma } from '../lib/prisma';

const authService = new AuthService();

export class AuthController {
  async login(request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) {
    const { email, password } = request.body;

    try {
      const result = await authService.authenticate({ email, password });
      return reply.send(result);
    } catch (err: any) {
      if (err.message === 'Invalid email or password') {
        return reply.status(401).send({ message: err.message });
      }
      console.error(err);
      return reply.status(500).send({ message: 'Internal Server Error' });
    }
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ message: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        userCV: true
      }
    });

    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    // Convert BigInt to string manually to satisfy Zod schema
    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        telegramChatId: user.telegramChatId ? user.telegramChatId.toString() : null,
        keyword: user.keyword,
        location: user.location,
        isRemote: user.isRemote,
        extractedText: user.userCV?.content || null
      }
    });
  }
}
