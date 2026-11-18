import 'dotenv/config';
import Fastify from 'fastify';
import amqp, { Channel, Connection } from 'amqplib';

const PORT = Number(process.env.PORT) || 3002;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

interface Projeto {
  id: string;
  genero: string;
  duracaoEstimada: number;
  orcamentoTotal: number;
  dataEntrega: string;
  tipoCaptacao: string;
  localizacao: string;
  estrategia?: string;
  papeis: Array<{ papel: string; peso: number }>;
  createdAt: string;
  updatedAt: string;
}

const projetos: Projeto[] = [];

let connection: Connection | null = null;
let channel: Channel | null = null;

async function connectRabbitMQ(retries = 15): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertQueue('eventos-projetos', { durable: true });
      await channel.assertQueue('criar-projeto', { durable: true });

      console.log('[projetos] Conectado ao RabbitMQ');

      // Consumidor para criação de projetos via MQ (opcional)
      await channel.consume('criar-projeto', async (msg) => {
        if (!msg || !channel) return;
        try {
          const data = JSON.parse(msg.content.toString());
          const projeto: Projeto = {
            id: data.id || `proj-${Date.now()}`,
            genero: data.genero,
            duracaoEstimada: data.duracaoEstimada,
            orcamentoTotal: data.orcamentoTotal,
            dataEntrega: data.dataEntrega,
            tipoCaptacao: data.tipoCaptacao,
            localizacao: data.localizacao,
            estrategia: data.estrategia,
            papeis: data.papeis || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          projetos.push(projeto);

          // Publica evento de projeto criado
          channel.sendToQueue(
            'eventos-projetos',
            Buffer.from(
              JSON.stringify({
                tipo: 'projeto.criado',
                projeto,
                timestamp: new Date().toISOString()
              })
            ),
            { persistent: true }
          );

          const replyTo = msg.properties.replyTo;
          if (replyTo) {
            channel.sendToQueue(
              replyTo,
              Buffer.from(JSON.stringify({ success: true, projeto })),
              { correlationId: msg.properties.correlationId }
            );
          }

          channel.ack(msg);
          console.log(`[projetos] Projeto criado: ${projeto.id}`);
        } catch (err) {
          console.error('[projetos] Erro:', err);
          channel.nack(msg, false, false);
        }
      });

      connection.on('close', () => {
        console.warn('[projetos] Conexão fechada. Reconectando...');
        setTimeout(() => connectRabbitMQ(5), 5000);
      });

      return;
    } catch (err: any) {
      console.warn(`[projetos] Tentativa ${i + 1}/${retries}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function start() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cinebridge-projetos',
    rabbitmq: channel ? 'connected' : 'disconnected',
    projetosCount: projetos.length
  }));

  app.get('/projetos', async () => ({ projetos, total: projetos.length }));

  app.post('/projetos', async (request, reply) => {
    const body = request.body as any;
    const projeto: Projeto = {
      id: body.id || `proj-${Date.now()}`,
      genero: body.genero,
      duracaoEstimada: body.duracaoEstimada,
      orcamentoTotal: body.orcamentoTotal,
      dataEntrega: body.dataEntrega,
      tipoCaptacao: body.tipoCaptacao,
      localizacao: body.localizacao,
      estrategia: body.estrategia,
      papeis: body.papeis || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projetos.push(projeto);

    if (channel) {
      channel.sendToQueue(
        'eventos-projetos',
        Buffer.from(
          JSON.stringify({
            tipo: 'projeto.criado',
            projeto,
            timestamp: new Date().toISOString()
          })
        ),
        { persistent: true }
      );
    }

    return reply.code(201).send(projeto);
  });

  await connectRabbitMQ();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`CineBridge Projetos rodando em http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
