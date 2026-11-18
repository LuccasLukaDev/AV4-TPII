# CineBridge – ATV IV: Containerização e Arquitetura de Microsserviços

Plataforma de recomendação de profissionais para projetos audiovisuais, agora **totalmente containerizada** com comunicação assíncrona via **RabbitMQ** e bancos de dados isolados por domínio.

## Arquitetura

```
                    ┌─────────────────────┐
                    │   cinebridge-api    │ :3000
                    │  (recomendação +    │
                    │   orquestração)     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
   │cinebridge-       │ │cinebridge-mq │ │cinebridge-       │
   │profissionais     │ │  (RabbitMQ)  │ │projetos          │
   │:3001             │ │ :5672/:15672 │ │:3002             │
   └────────┬─────────┘ └──────────────┘ └────────┬─────────┘
            │                                     │
            ▼                                     ▼
   ┌──────────────────┐                 ┌──────────────────┐
   │ profissionais-db │                 │  projetos-db     │
   │ (PostgreSQL 15)  │                 │ (PostgreSQL 15)  │
   └──────────────────┘                 └──────────────────┘

                    ┌──────────────────┐
                    │cinebridge-       │
                    │notificacoes :3003│
                    └──────────────────┘
```

### Containers

| Serviço                    | Porta  | Responsabilidade                                      |
|----------------------------|--------|-------------------------------------------------------|
| `cinebridge-api`           | 3000   | Recomendação, orquestração e ponto de entrada REST    |
| `cinebridge-profissionais` | 3001   | Cadastro/consulta de profissionais (consome fila)     |
| `cinebridge-projetos`      | 3002   | Ciclo de vida de projetos + publicação de eventos     |
| `cinebridge-notificacoes`  | 3003   | Envio de alertas/e-mails (consome eventos)            |
| `cinebridge-mq`            | 5672 / 15672 | RabbitMQ + Management UI                          |
| `profissionais-db`         | –      | PostgreSQL isolado do domínio profissionais           |
| `projetos-db`              | –      | PostgreSQL isolado do domínio projetos                |
| `api-db`                   | –      | PostgreSQL da API de recomendação                     |

### Comunicação

- **Request-Reply**: `cinebridge-api` publica em `consulta-profissionais` e aguarda resposta em fila temporária.
- **Eventos**: criação/atualização de projetos publica em `eventos-projetos`; `cinebridge-notificacoes` consome e registra alertas.
- Rede interna Docker `cinebridge-net` (bridge). Os serviços se descobrem pelo nome do container.

## Pré-requisitos

- Docker Desktop (Windows/macOS) **ou** Docker Engine + Docker Compose (Linux)
- Windows 10+ ou Linux Ubuntu 24.04+ (e derivados)

Verifique:

```bash
docker --version
docker compose version
```

## Como executar

### 1. Subir toda a stack

Na raiz do projeto (`cinebridge-atv4/`):

```bash
docker compose up -d --build
```

Aguarde os healthchecks (pode levar 1–2 minutos na primeira vez).

### 2. Verificar status

```bash
docker compose ps
docker compose logs -f
```

### 3. Interface do RabbitMQ

Abra: http://localhost:15672  
Usuário/senha: `guest` / `guest`

Você verá as filas `consulta-profissionais`, `eventos-projetos` e `notificacoes`.

### 4. Health checks

```bash
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### 5. Testar recomendação

Envie um POST para o endpoint de recomendação (exemplo):

```bash
curl -X POST http://localhost:3000/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "id": "proj-demo-1",
    "genero": "drama",
    "duracaoEstimada": 90,
    "orcamentoTotal": 150000,
    "dataEntrega": "2027-06-01",
    "tipoCaptacao": "ficcao",
    "localizacao": "são paulo",
    "estrategia": "cosine",
    "papeis": [
      { "papel": "diretor", "peso": 0.4 },
      { "papel": "diretor de fotografia", "peso": 0.3 },
      { "papel": "editor", "peso": 0.3 }
    ]
  }'
```

(Verifique o path exato no controller; pode ser `/recommend` ou `/recomendacao`.)

A API consultará os profissionais **via RabbitMQ**. Nos logs do `cinebridge-profissionais` você verá a mensagem sendo consumida.

### 6. Parar

```bash
docker compose down
```

Para remover volumes (dados):

```bash
docker compose down -v
```

## Estrutura de pastas

```
cinebridge-atv4/
├── docker-compose.yml          # Orquestração completa
├── README.md
├── api/                        # Microsserviço de recomendação (legado ATV1–3 + MQ)
│   ├── Dockerfile
│   ├── package.json
│   ├── server.ts
│   ├── app.ts
│   ├── prisma/
│   ├── src/
│   │   ├── messaging/rabbitmq.ts   # Cliente AMQP (request-reply + eventos)
│   │   ├── services/
│   │   ├── controllers/
│   │   └── ...
│   └── ...
├── profissionais/              # Microsserviço de profissionais
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.ts
├── projetos/                   # Microsserviço de projetos
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.ts
└── notificacoes/               # Microsserviço de notificações
    ├── Dockerfile
    ├── package.json
    └── src/server.ts
```

## Decisões técnicas (ATV IV)

1. **Imagens base**: `node:18-alpine`, `postgres:15-alpine`, `rabbitmq:3-management-alpine` (conforme enunciado).
2. **Rede**: `cinebridge-net` (bridge) – comunicação apenas por nomes de serviço.
3. **Healthchecks**: HTTP `/health` nos serviços Node e `pg_isready` nos bancos; RabbitMQ via `rabbitmq-diagnostics`.
4. **Filas duráveis** + confirmação de entrega para resiliência.
5. **Fallback**: se o RabbitMQ estiver indisponível, a API continua usando o repositório local (Prisma), garantindo que o sistema não fique inoperante.
6. **Isolamento de dados**: cada domínio possui seu próprio PostgreSQL.

## Compatibilidade

O sistema é compatível com:

- Windows 10 ou superior
- Linux Ubuntu 24.04.3 ou superior (e distribuições derivadas do Ubuntu)

## Atividades anteriores

- ATV II / III: padrões de projeto (Strategy, Observer, Adapter, Decorator, etc.) e containerização básica.
- ATV IV: expansão para arquitetura de microsserviços containerizados com mensageria.

