import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export class UserService {
  async register(data: Prisma.UserCreateInput) {
    const userExists = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (userExists) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 6);

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  async updateTelegramId(userId: string, telegramChatId: string) {
    // telegramChatId vem como string do JSON, convertemos para BigInt
    return await prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: BigInt(telegramChatId) },
    });
  }

  async updatePreferences(userId: string, data: { keyword?: string; isRemote?: boolean }) {
    return await prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
