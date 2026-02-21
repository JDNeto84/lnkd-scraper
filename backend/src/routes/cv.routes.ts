import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import pdf from 'pdf-parse';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { jobProcessorService } from '../server';

const prisma = new PrismaClient();

export async function cvRoutes(app: FastifyInstance) {
  app.post('/upload-cv', { preHandler: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ message: 'No file uploaded' });
      }

      // Validação de tipo de arquivo (flexível para aceitar octet-stream se tiver extensão .pdf)
      const isPdfMime = data.mimetype === 'application/pdf';
      const isOctetStream = data.mimetype === 'application/octet-stream';
      const hasPdfExtension = data.filename.toLowerCase().endsWith('.pdf');

      if (!isPdfMime && !(isOctetStream && hasPdfExtension)) {
        return reply.status(400).send({
          message: `Only PDF files are allowed. Received mimetype: ${data.mimetype}`
        });
      }

      // @ts-ignore
      const userId = request.user.id;

      const buffer = await data.toBuffer();

      let text = '';
      try {
        const pdfData = await pdf(buffer);
        text = pdfData.text.trim();
      } catch (pdfError) {
        request.log.error(pdfError);
        return reply.status(400).send({ message: 'Failed to parse PDF file. It might be corrupted.' });
      }

      // Aviso se nenhum texto for extraído (PDF de imagem)
      if (!text) {
        text = "AVISO: Nenhum texto pôde ser extraído deste PDF. Ele pode ser uma imagem digitalizada (scanned) ou estar protegido. O sistema precisa de PDFs com texto selecionável.";
      }

      // Upsert: Create or Update existing CV for user
      const userCV = await prisma.userCV.upsert({
        where: {
          userId: userId,
        },
        update: {
          filename: data.filename,
          content: text,
          updatedAt: new Date(),
        },
        create: {
          userId: userId,
          filename: data.filename,
          content: text,
        },
      });

      // Dispara o processamento via Ollama em background
      // Não usamos await aqui para não bloquear a resposta do upload para o usuário
      jobProcessorService.processUserCV(userId, text).catch(err => {
        app.log.error(err, `Error triggering CV processing for user ${userId}`);
      });

      return reply.send({
        message: 'File uploaded and processing started',
        id: userCV.id,
        content: text
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ message: 'Error processing file' });
    }
  });

  app.post('/save-cv-text', { preHandler: [authenticateJWT] }, async (request, reply) => {
    try {
      const { content } = request.body as { content: string };
      // @ts-ignore
      const userId = request.user.id;

      if (!content) {
        return reply.status(400).send({ message: 'Content is required' });
      }

      const userCV = await prisma.userCV.upsert({
        where: { userId },
        update: {
          content,
          updatedAt: new Date(),
        },
        create: {
          userId,
          filename: 'manual_entry.txt',
          content,
        },
      });

      // Dispara o processamento via Ollama em background
      jobProcessorService.processUserCV(userId, content).catch(err => {
        app.log.error(err, `Error triggering CV processing for user ${userId}`);
      });

      return reply.send({
        message: 'CV content saved and processing started',
        id: userCV.id,
        content: content
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ message: 'Error saving CV content' });
    }
  });
}
