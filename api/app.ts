import Fastify from 'fastify';
import cors from '@fastify/cors';
import { recommendationRoutes } from './src/controllers/recommendation.controller.js';
import { getChannel } from './src/messaging/rabbitmq.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(recommendationRoutes);

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cinebridge-api',
    rabbitmq: getChannel() ? 'connected' : 'disconnected'
  }));

  return app;
}
