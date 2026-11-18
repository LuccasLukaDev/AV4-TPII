import amqp, { Channel, Connection, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'crypto';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ(retries = 12): Promise<Channel> {
  if (channel) return channel;

  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertQueue('consulta-profissionais', { durable: true });
      await channel.assertQueue('eventos-projetos', { durable: true });
      await channel.assertQueue('notificacoes', { durable: true });

      connection.on('error', (err) => {
        console.error('[api] RabbitMQ error:', err.message);
      });
      connection.on('close', () => {
        console.warn('[api] RabbitMQ connection closed');
        channel = null;
        connection = null;
      });

      console.log('[api] Conectado ao RabbitMQ');
      return channel;
    } catch (err: any) {
      console.warn(`[api] RabbitMQ tentativa ${i + 1}/${retries}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw new Error('Não foi possível conectar ao RabbitMQ');
}

/**
 * Request-Reply: publica na fila consulta-profissionais e aguarda resposta
 * em uma fila temporária exclusiva.
 */
export async function consultarProfissionaisViaMQ(
  filtros?: {
    especialidades?: string[];
    localizacao?: string;
    precoMaximo?: number;
  },
  timeoutMs = 8000
): Promise<any[]> {
  const ch = await connectRabbitMQ();

  const correlationId = randomUUID();
  const replyQueue = await ch.assertQueue('', { exclusive: true, autoDelete: true });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout ao consultar profissionais via RabbitMQ'));
    }, timeoutMs);

    ch.consume(
      replyQueue.queue,
      (msg: ConsumeMessage | null) => {
        if (!msg) return;
        if (msg.properties.correlationId === correlationId) {
          clearTimeout(timer);
          try {
            const data = JSON.parse(msg.content.toString());
            resolve(data.profissionais || []);
          } catch (e) {
            reject(e);
          }
        }
      },
      { noAck: true }
    );

    ch.sendToQueue(
      'consulta-profissionais',
      Buffer.from(
        JSON.stringify({
          requestId: correlationId,
          filtros: filtros || {},
          timestamp: new Date().toISOString()
        })
      ),
      {
        correlationId,
        replyTo: replyQueue.queue,
        persistent: true
      }
    );
  });
}

export async function publicarEventoProjeto(evento: {
  tipo: string;
  projeto: any;
}): Promise<void> {
  try {
    const ch = await connectRabbitMQ();
    ch.sendToQueue(
      'eventos-projetos',
      Buffer.from(
        JSON.stringify({
          ...evento,
          timestamp: new Date().toISOString()
        })
      ),
      { persistent: true }
    );
    console.log(`[api] Evento publicado: ${evento.tipo}`);
  } catch (err) {
    console.error('[api] Falha ao publicar evento:', err);
  }
}

export async function publicarNotificacao(notif: {
  tipo?: string;
  destinatario?: string;
  assunto: string;
  corpo: string;
}): Promise<void> {
  try {
    const ch = await connectRabbitMQ();
    ch.sendToQueue(
      'notificacoes',
      Buffer.from(JSON.stringify(notif)),
      { persistent: true }
    );
  } catch (err) {
    console.error('[api] Falha ao publicar notificação:', err);
  }
}

export function getChannel(): Channel | null {
  return channel;
}
