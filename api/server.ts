import { buildApp } from './app.js';
import { connectRabbitMQ } from './src/messaging/rabbitmq.js';

const PORT = Number(process.env.PORT) || 3000;

async function start() {
  // Tenta conectar ao RabbitMQ (não bloqueia se falhar – fallback local)
  if (process.env.RABBITMQ_URL) {
    try {
      await connectRabbitMQ();
    } catch (err: any) {
      console.warn('[api] RabbitMQ indisponível no startup:', err.message);
    }
  }

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Cinebridge Recommendation Service (API) rodando em http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
