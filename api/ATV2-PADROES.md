# ATV2 — Padrões Criacionais: Prototype, Factory Method e Abstract Factory

## O que foi implementado

### 1. Prototype (`src/prototypes/projeto.prototype.ts`)

- Interface `ProjetoPrototype` com método `clone()`.
- Classes concretas:
  - `ProjetoDocumentario` — restrições de pesquisa de campo e narração.
  - `ProjetoAnimacao` — software 3D preferido, FPS, render farm.
  - `ProjetoPublicitario` — prazo máximo, motion design, métricas de conversão.
- Cada `clone()` realiza **cópia profunda** (papéis e restrições independentes).
- `RegistroPrototipos` — registry de protótipos pré-configurados.
- `inicializarPrototiposPadrao()` — registra os três modelos da plataforma.

### 2. Factory Method + Abstract Factory (`src/factories/fabrica.projeto.ts`)

- Interface `FabricaProjeto`:
  - `criarProjeto(dados?)` → projeto do tipo (via Prototype)
  - `criarValidador()` → validador específico
  - `criarRecomendador(estrategia?)` → Strategy adequada
  - `criarNotificador()` → NotificationSubject com observers
- Fábricas concretas:
  - `FabricaDocumentario`
  - `FabricaAnimacao`
  - `FabricaPublicitario`
- `SeletorFabrica` — obtém a fábrica pelo tipo sem `if/switch` no cliente.

### 3. Validadores específicos (`src/validators/project.validators.ts`)

- `ValidadorDocumentario` — exige pesquisador, orçamento mínimo de pesquisa.
- `ValidadorAnimacao` — exige papéis de pipeline 3D, software adequado.
- `ValidadorPublicitario` — exige motion designer, valida prazos.

### 4. Orquestrador atualizado (`src/template/team-composition.orchestrator.ts`)

- Aceita opcionalmente `FabricaProjeto` no construtor.
- Obtém validador e notificador da fábrica.
- **Nenhuma condicional baseada no tipo de projeto** — o Template Method permanece invariável.
- Compatível com o uso antigo (apenas Strategy).

### 5. RecommendationService atualizado (`src/services/recommendation.service.ts`)

- Resolve o tipo do projeto (`tipoCaptacao` / `genero`).
- Seleciona a fábrica via `SeletorFabrica`.
- Cria estratégia, orquestrador e ecossistema a partir da fábrica.
- Expõe `criarProjetoAPartirDePrototipo`, `listarPrototipos`, `obterFabrica`.

### 6. Testes de integração (`tests/factories.integration.test.ts`)

Cobrem:

- Clonagem profunda (Prototype)
- Criação de famílias de objetos (Abstract Factory / Factory Method)
- Alternância de fábricas **sem alterar o código do orquestrador**
- Validadores específicos por tipo
- Integração com `RecommendationService`

## Como rodar os testes

```bash
npm install
npm test -- tests/factories.integration.test.ts
```

## Compatibilidade

O sistema continua baseado em Node.js + TypeScript + Docker, sendo compatível com:

- Windows 10 ou superior
- Linux Ubuntu 24.04.03 ou superior (e derivadas)

## Diagrama mental (relações)

```
Cliente / RecommendationService
        │
        ▼
  SeletorFabrica.obter(tipo)
        │
        ▼
  FabricaProjeto (Abstract Factory)
   ├── criarProjeto()      → ProjetoDocumentario | ProjetoAnimacao | ProjetoPublicitario  (Prototype)
   ├── criarValidador()    → ValidadorDocumentario | ValidadorAnimacao | ValidadorPublicitario
   ├── criarRecomendador() → Cosine | Collaborative | LowBudget  (Strategy)
   └── criarNotificador()  → NotificationSubject + Audit/Email  (Observer)
        │
        ▼
  DefaultTeamCompositionOrchestrator (Template Method)
        │  (sem ifs de tipo)
        ▼
  EquipeSugerida + validações + notificações
```

## Benefícios obtidos

| Problema anterior              | Solução com padrões                          |
|--------------------------------|----------------------------------------------|
| Criação repetitiva de projetos | Prototype + registry de modelos              |
| Condicionais por tipo no código| Abstract Factory + SeletorFabrica            |
| Validação genérica             | Validadores específicos por fábrica          |
| Dificuldade de adicionar tipo  | Nova fábrica concreta, zero mudança no core  |
| Acoplamento alto               | Orquestrador depende apenas de abstrações    |
