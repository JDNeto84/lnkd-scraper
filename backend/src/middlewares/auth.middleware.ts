import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      plan: string;
    };
  }
}

export async function authenticateJWT(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ message: 'Missing Authorization header' });
  }

  const [, token] = authHeader.split(' ');

  if (!token) {
    return reply.status(401).send({ message: 'Missing token' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: string; plan: string };
    request.user = decoded;
  } catch (err) {
    return reply.status(401).send({ message: 'Invalid token' });
  }
}
