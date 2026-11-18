import 'dotenv/config';
import Fastify from 'fastify';
import amqp, { Channel, Connection } from 'amqplib';

const PORT = Number(process.env.PORT) || 3003;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

interface Notificacao {
  id: string;
  tipo: string;
  destinatario?: string;
  assunto: string;
  corpo: string;
  timestamp: string;
  lida: boolean;
}

const notificacoes: Notificacao[] = [];

let connection: Connection | null = null;
let channel: Channel | null = null;

async function connectRabbitMQ(retries = 15): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertQueue('eventos-projetos', { durable: true });
      await channel.assertQueue('notificacoes', { durable: true });

      console.log('[notificacoes] Conectado ao RabbitMQ');

      // Consome eventos de projetos
      await channel.consume('eventos-projetos', async (msg) => {
        if (!msg || !channel) return;
        try {
          const evento = JSON.parse(msg.content.toString());
          console.log('[notificacoes] Evento recebido:', evento.tipo);

          const notif: Notificacao = {
            id: `notif-${Date.now()}`,
            tipo: evento.tipo,
            assunto: `Evento: ${evento.tipo}`,
            corpo: JSON.stringify(evento.projeto || evento, null, 2),
            timestamp: new Date().toISOString(),
            lida: false
          };
          notificacoes.push(notif);

          // Simula envio de e-mail / alerta
          console.log(`[notificacoes] ALERTA enviado → ${notif.assunto}`);

          channel.ack(msg);
        } catch (err) {
          console.error('[notificacoes] Erro:', err);
          channel.nack(msg, false, false);
        }
      });

      // Fila genérica de notificações
      await channel.consume('notificacoes', async (msg) => {
        if (!msg || !channel) return;
        try {
          const data = JSON.parse(msg.content.toString());
          const notif: Notificacao = {
            id: `notif-${Date.now()}`,
            tipo: data.tipo || 'geral',
            destinatario: data.destinatario,
            assunto: data.assunto || 'Notificação CineBridge',
            corpo: data.corpo || data.message || '',
            timestamp: new Date().toISOString(),
            lida: false
          };
          notificacoes.push(notif);
          console.log(`[notificacoes] Notificação registrada: ${notif.assunto}`);
          channel.ack(msg);
        } catch (err) {
          console.error('[notificacoes] Erro:', err);
          channel.nack(msg, false, false);
        }
      });

      connection.on('close', () => {
        console.warn('[notificacoes] Conexão fechada. Reconectando...');
        setTimeout(() => connectRabbitMQ(5), 5000);
      });

      return;
    } catch (err: any) {
      console.warn(`[notificacoes] Tentativa ${i + 1}/${retries}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function start() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cinebridge-notificacoes',
    rabbitmq: channel ? 'connected' : 'disconnected',
    notificacoesCount: notificacoes.length
  }));

  app.get('/notificacoes', async () => ({
    notificacoes: notificacoes.slice(-50),
    total: notificacoes.length
  }));

  await connectRabbitMQ();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`CineBridge Notificações rodando em http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
