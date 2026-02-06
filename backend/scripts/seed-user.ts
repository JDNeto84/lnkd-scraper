import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'testuser@example.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 6);

  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: 'Test User',
        email,
        password: hashedPassword,
      },
    });
    console.log('User ready:', user.email);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
