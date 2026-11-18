import 'dotenv/config';
import Fastify from 'fastify';
import amqp, { Channel, Connection } from 'amqplib';

const PORT = Number(process.env.PORT) || 3001;
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

// Dados de exemplo (em produção viriam do PostgreSQL)
const PROFISSIONAIS = [
  {
    id: 'p1',
    nome: 'Ana Silva',
    especialidades: ['diretor', 'roteirista'],
    precoMedio: 12000,
    localizacao: 'são paulo',
    vetorCompetencias: [9, 8, 7, 6, 9],
    historico: ['proj1', 'proj2'],
    competencias: [
      { nome: 'direção', nivel: 9 },
      { nome: 'roteiro', nivel: 8 }
    ],
    avaliacoes: [{ projetoId: 'proj1', nota: 4.8, comentario: 'Excelente' }]
  },
  {
    id: 'p2',
    nome: 'Bruno Costa',
    especialidades: ['diretor de fotografia', 'colorista'],
    precoMedio: 8500,
    localizacao: 'rio de janeiro',
    vetorCompetencias: [8, 9, 7, 8, 6],
    historico: ['proj3'],
    competencias: [
      { nome: 'fotografia', nivel: 9 },
      { nome: 'color grading', nivel: 8 }
    ],
    avaliacoes: [{ projetoId: 'proj3', nota: 4.5, comentario: null }]
  },
  {
    id: 'p3',
    nome: 'Carla Mendes',
    especialidades: ['editor', 'montador'],
    precoMedio: 6500,
    localizacao: 'são paulo',
    vetorCompetencias: [7, 8, 9, 7, 8],
    historico: ['proj1', 'proj4'],
    competencias: [
      { nome: 'edição', nivel: 9 },
      { nome: 'som', nivel: 7 }
    ],
    avaliacoes: [{ projetoId: 'proj1', nota: 4.9, comentario: 'Muito boa' }]
  },
  {
    id: 'p4',
    nome: 'Diego Alves',
    especialidades: ['produtor', 'assistente de direção'],
    precoMedio: 9000,
    localizacao: 'belo horizonte',
    vetorCompetencias: [8, 7, 6, 9, 7],
    historico: ['proj2', 'proj5'],
    competencias: [
      { nome: 'produção', nivel: 9 },
      { nome: 'logística', nivel: 8 }
    ],
    avaliacoes: []
  },
  {
    id: 'p5',
    nome: 'Elena Rocha',
    especialidades: ['figurino', 'maquiagem'],
    precoMedio: 4500,
    localizacao: 'são paulo',
    vetorCompetencias: [6, 7, 8, 9, 8],
    historico: ['proj3'],
    competencias: [
      { nome: 'figurino', nivel: 9 },
      { nome: 'maquiagem', nivel: 8 }
    ],
    avaliacoes: [{ projetoId: 'proj3', nota: 4.7, comentario: 'Criativa' }]
  }
];

let connection: Connection | null = null;
let channel: Channel | null = null;

async function connectRabbitMQ(retries = 15): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertQueue('consulta-profissionais', { durable: true });
      console.log('[profissionais] Conectado ao RabbitMQ e fila "consulta-profissionais" declarada');

      // Consumidor principal
      await channel.consume('consulta-profissionais', async (msg) => {
        if (!msg || !channel) return;

        try {
          const content = JSON.parse(msg.content.toString());
          console.log('[profissionais] Recebida consulta:', content.correlationId || content.requestId);

          const replyTo = msg.properties.replyTo;
          const correlationId = msg.properties.correlationId;

          // Filtra profissionais conforme filtros recebidos (opcional)
          let resultado = PROFISSIONAIS;
          if (content.filtros) {
            const { especialidades, localizacao, precoMaximo } = content.filtros;
            resultado = PROFISSIONAIS.filter((p) => {
              if (especialidades && especialidades.length > 0) {
                const match = especialidades.some((e: string) =>
                  p.especialidades.some((pe) => pe.toLowerCase().includes(e.toLowerCase()))
                );
                if (!match) return false;
              }
              if (localizacao && !p.localizacao.toLowerCase().includes(localizacao.toLowerCase())) {
                return false;
              }
              if (precoMaximo && p.precoMedio > precoMaximo) return false;
              return true;
            });
          }

          const response = {
            requestId: content.requestId || correlationId,
            profissionais: resultado,
            total: resultado.length,
            timestamp: new Date().toISOString()
          };

          if (replyTo) {
            channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
              correlationId: correlationId,
              persistent: true
            });
          }

          channel.ack(msg);
          console.log(`[profissionais] Resposta enviada (${resultado.length} profissionais)`);
        } catch (err) {
          console.error('[profissionais] Erro ao processar mensagem:', err);
          channel.nack(msg, false, false);
        }
      });

      connection.on('error', (err) => {
        console.error('[profissionais] Erro na conexão RabbitMQ:', err.message);
      });
      connection.on('close', () => {
        console.warn('[profissionais] Conexão RabbitMQ fechada. Tentando reconectar...');
        setTimeout(() => connectRabbitMQ(5), 5000);
      });

      return;
    } catch (err: any) {
      console.warn(`[profissionais] Tentativa ${i + 1}/${retries} de conexão RabbitMQ falhou: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.error('[profissionais] Não foi possível conectar ao RabbitMQ após várias tentativas');
}

async function start() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'cinebridge-profissionais',
    rabbitmq: channel ? 'connected' : 'disconnected',
    profissionaisCount: PROFISSIONAIS.length
  }));

  app.get('/profissionais', async () => ({
    profissionais: PROFISSIONAIS,
    total: PROFISSIONAIS.length
  }));

  await connectRabbitMQ();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`CineBridge Profissionais rodando em http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
