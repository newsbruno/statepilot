# StatePilot — Arquitetura Técnica

## 1. Visão Geral

Este documento descreve a arquitetura de uma biblioteca/runtime em TypeScript para criar **AI browser agents leves, preditivos e escaláveis**, inspirados no conceito de JEPA, mas adaptados para automação real de browser.

A ideia central não é criar um modelo neural gigante no início. A proposta é construir um runtime que:

- observa o estado do browser;
- transforma a tela/DOM em uma representação compacta;
- prevê a próxima ação provável;
- executa a ação;
- valida se o estado real bateu com o estado esperado;
- só usa LLM quando o fluxo diverge ou quando falta contexto.

A tese principal:

> Browser agents should not think from zero every time.  
> They should predict, execute, validate, and only reason when reality diverges.

---

## 2. Objetivo do Projeto

Criar uma biblioteca leve e extensível para permitir que agents interajam com browsers de forma mais eficiente que o modelo tradicional baseado em LLM a cada passo.

O sistema deve ser capaz de:

- executar fluxos repetitivos em browser;
- aprender transições entre estados;
- reutilizar fluxos já conhecidos;
- rodar múltiplas tarefas simultâneas;
- controlar concorrência sem travar o host;
- reduzir custo de LLM;
- detectar divergências no fluxo;
- recuperar falhas usando LLM, regras ou replay;
- registrar evidências, logs e métricas de execução;
- permitir testes unitários, integração e E2E desde o início.

---

## 3. Inspiração JEPA

A inspiração vem do conceito de prever representações futuras, e não pixels, HTML bruto ou texto completo.

No contexto do browser, a ideia é:

```txt
estado atual + ação candidata -> representação esperada do próximo estado
```

Em vez de:

```txt
screenshot completo -> LLM -> próxima ação
```

Usamos:

```txt
BrowserState compactado -> Predictor -> Action -> Validation
```

A versão prática:

```txt
E(s_t) + A(a_t) -> predicted E(s_t+1)
```

Depois da execução:

```txt
real E(s_t+1) vs predicted E(s_t+1)
```

Se a distância for baixa, o fluxo continua.  
Se a distância for alta, o sistema entra em modo de recuperação.

---

## 4. Nome do Projeto

Nomes possíveis:

- `StatePilot`
- `LightAgent Runtime`
- `Browser-JEPA`
- `Latent Browser Agent`
- `Predictive DOM Agent`
- `Crayons Predictive Engine`

Nome técnico recomendado:

```txt
StatePilot
```

Nome comercial possível:

```txt
Crayons Predictive Engine
```

---

## 5. Stack Principal

### Linguagem

O projeto deve começar em **TypeScript**.

Motivos:

- melhor velocidade de desenvolvimento;
- ecossistema forte para Playwright;
- integração natural com NestJS, Next.js, workers e APIs;
- tipagem forte suficiente para contratos complexos;
- fácil empacotamento como lib NPM;
- familiaridade com o stack atual.

### Runtime

- Node.js 20+
- TypeScript
- pnpm
- Playwright
- Vitest
- tsup
- Zod
- BullMQ ou fila própria
- Redis opcional
- SQLite no MVP
- Postgres em produção
- OpenTelemetry opcional
- Pino para logs

---

## 6. Princípios Técnicos

1. **LLM como fallback, não como motor principal**
   - A LLM só deve ser chamada quando o predictor ou replay não tiver confiança suficiente.

2. **Prediction antes de reasoning**
   - O runtime deve tentar prever e executar usando memória, regras e histórico antes de pedir raciocínio externo.

3. **Estado compacto**
   - Nunca depender de HTML completo ou screenshot completo como primeira fonte.

4. **Replay validado**
   - Repetir fluxo conhecido, mas sempre validar se o próximo estado bateu.

5. **Concorrência controlada**
   - Não criar browsers infinitos. Usar fila, pool e backpressure.

6. **Observabilidade desde o início**
   - Cada task precisa ter logs, timeline, screenshots opcionais, eventos, métricas e motivo de falha.

7. **Testes obrigatórios**
   - Todo módulo novo deve ter arquivo de teste.
   - Nenhum package core deve existir sem testes unitários.

8. **Adapters desacoplados**
   - O core não deve depender diretamente de Playwright.
   - Playwright deve ser apenas um adapter.

9. **Extensibilidade**
   - Futuramente deve permitir CDP direto, Electron, accessibility APIs e outros navegadores.

10. **Determinismo sempre que possível**
    - Quanto mais previsível o fluxo, menor o custo, maior a escala e menor a necessidade de IA.

---

## 7. Arquitetura Geral

```txt
User Task
   ↓
Task Scheduler
   ↓
Execution Engine
   ↓
Browser Adapter
   ↓
State Encoder
   ↓
Prediction Engine
   ↓
Action Executor
   ↓
State Observer
   ↓
Prediction Validator
   ↓
Memory Update / Recovery / Continue
```

---

## 8. Componentes Principais

### 8.1 Task Scheduler

Responsável por receber, priorizar e distribuir tarefas.

Deve controlar:

- prioridade;
- retries;
- timeout;
- concorrência;
- tasks por site;
- tasks por cliente;
- limite de browsers;
- limite de páginas por browser;
- cancelamento;
- checkpoints.

Contrato inicial:

```ts
export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface AgentTask<TInput = unknown> {
  id: string;
  goal: string;
  siteKey?: string;
  input: TInput;
  priority: TaskPriority;
  timeoutMs: number;
  retryLimit: number;
  createdAt: Date;
}
```

---

### 8.2 Execution Engine

Orquestra a execução de uma task.

Responsabilidades:

- iniciar contexto de execução;
- abrir browser/page;
- capturar estado;
- pedir próxima previsão;
- executar ação;
- validar próximo estado;
- persistir transição;
- acionar fallback;
- finalizar ou falhar task.

Contrato inicial:

```ts
export interface ExecutionEngine {
  run<TInput, TResult>(task: AgentTask<TInput>): Promise<AgentTaskResult<TResult>>;
}
```

Resultado:

```ts
export interface AgentTaskResult<TResult = unknown> {
  taskId: string;
  status: "success" | "failed" | "cancelled" | "timeout";
  result?: TResult;
  error?: AgentTaskError;
  metrics: TaskMetrics;
}
```

---

### 8.3 Browser Adapter

Interface genérica para controlar browser sem acoplar o core ao Playwright.

```ts
export interface BrowserAdapter {
  createSession(config: BrowserSessionConfig): Promise<BrowserSession>;
}

export interface BrowserSession {
  id: string;
  openPage(url?: string): Promise<BrowserPage>;
  close(): Promise<void>;
}

export interface BrowserPage {
  id: string;
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
  waitFor(condition: WaitCondition): Promise<void>;
  extractText(): Promise<string>;
  getState(): Promise<RawBrowserState>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  close(): Promise<void>;
}
```

Adapters possíveis:

```txt
packages/adapters/playwright
packages/adapters/cdp
packages/adapters/electron
packages/adapters/accessibility
```

No MVP, criar apenas Playwright.

---

### 8.4 State Encoder

Transforma o estado bruto do browser em uma representação compacta.

Fontes possíveis:

- URL;
- título;
- DOM simplificado;
- accessibility tree;
- texto visível;
- elementos interativos;
- bounding boxes;
- hashes;
- screenshot opcional.

Contrato:

```ts
export interface StateEncoder {
  encode(rawState: RawBrowserState): Promise<BrowserState>;
}
```

Estado:

```ts
export interface BrowserState {
  id: string;
  url: string;
  title?: string;
  urlHash: string;
  domHash: string;
  visibleTextHash: string;
  semanticHash?: string;
  interactiveElements: ElementSignature[];
  viewport: ViewportInfo;
  createdAt: Date;
}
```

Elemento:

```ts
export interface ElementSignature {
  id: string;
  role: ElementRole;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  selector: string;
  stableSelector?: string;
  bbox?: BoundingBox;
  visible: boolean;
  enabled: boolean;
  stableHash: string;
}
```

Roles:

```ts
export type ElementRole =
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "link"
  | "table"
  | "file"
  | "unknown";
```

---

### 8.5 Action Model

Toda ação deve ser serializável, auditável e testável.

```ts
export type AgentAction =
  | ClickAction
  | FillAction
  | PressAction
  | WaitForAction
  | NavigateAction
  | ExtractAction
  | UploadFileAction
  | SelectAction
  | NoopAction;
```

Exemplo:

```ts
export interface ClickAction {
  type: "click";
  selector: string;
  elementId?: string;
  timeoutMs?: number;
}
```

```ts
export interface FillAction {
  type: "fill";
  selector: string;
  value: string;
  sensitive?: boolean;
  timeoutMs?: number;
}
```

```ts
export interface ExtractAction {
  type: "extract";
  schema: Record<string, unknown>;
  source?: "dom" | "text" | "screenshot" | "mixed";
}
```

---

### 8.6 Prediction Engine

Responsável por decidir a próxima ação provável.

Contrato:

```ts
export interface PredictionEngine {
  predict(input: PredictionInput): Promise<Prediction>;
}
```

Input:

```ts
export interface PredictionInput {
  task: AgentTask;
  currentState: BrowserState;
  flow?: KnownFlow;
  memory?: PredictionMemory;
  previousActions: AgentAction[];
}
```

Output:

```ts
export interface Prediction {
  action: AgentAction;
  expectedNextState?: ExpectedState;
  confidence: number;
  source: PredictionSource;
  reason?: string;
}
```

Source:

```ts
export type PredictionSource =
  | "recorded_flow"
  | "transition_memory"
  | "heuristic"
  | "semantic_match"
  | "small_model"
  | "llm_fallback";
```

---

### 8.7 Prediction Memory

Banco de transições aprendidas.

```ts
export interface LearnedTransition {
  id: string;
  siteKey?: string;
  goalHash?: string;
  fromStateHash: string;
  action: AgentAction;
  toStateHash: string;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  lastSeenAt: Date;
  createdAt: Date;
}
```

A memória deve permitir:

```ts
export interface PredictionMemory {
  findBestTransition(input: FindTransitionInput): Promise<LearnedTransition | null>;
  saveTransition(transition: SaveTransitionInput): Promise<void>;
  markSuccess(id: string, metrics: TransitionMetrics): Promise<void>;
  markFailure(id: string, error: AgentTaskError): Promise<void>;
}
```

---

### 8.8 Prediction Validator

Compara o estado previsto com o estado real.

```ts
export interface PredictionValidator {
  validate(input: ValidationInput): Promise<ValidationResult>;
}
```

Input:

```ts
export interface ValidationInput {
  previousState: BrowserState;
  action: AgentAction;
  expectedNextState?: ExpectedState;
  actualNextState: BrowserState;
}
```

Resultado:

```ts
export interface ValidationResult {
  ok: boolean;
  confidence: number;
  energy: EnergyScore;
  mismatchReasons: string[];
}
```

Energy score:

```ts
export interface EnergyScore {
  urlDistance: number;
  domDistance: number;
  textDistance: number;
  elementDistance: number;
  semanticDistance?: number;
  total: number;
}
```

Regra prática:

```txt
energy baixo = ação funcionou
energy alto = fluxo divergiu
```

---

### 8.9 Recovery Engine

Quando o fluxo diverge, o sistema tenta recuperar.

Estratégia em ordem:

```txt
1. Retry controlado da última ação
2. Reobservar estado
3. Buscar transição parecida na memória
4. Aplicar heurística
5. Usar LLM fallback
6. Marcar task como failed com evidência
```

Contrato:

```ts
export interface RecoveryEngine {
  recover(input: RecoveryInput): Promise<RecoveryResult>;
}
```

```ts
export interface RecoveryResult {
  recovered: boolean;
  action?: AgentAction;
  strategy: RecoveryStrategy;
  reason?: string;
}
```

```ts
export type RecoveryStrategy =
  | "retry"
  | "refresh_state"
  | "memory_match"
  | "heuristic"
  | "llm"
  | "fail";
```

---

### 8.10 Flow Recorder

Permite gravar um fluxo executado por humano ou agent.

Deve capturar:

- estado inicial;
- ações;
- estados intermediários;
- estado final;
- seletores;
- screenshots opcionais;
- tempo entre ações;
- resultado esperado.

Contrato:

```ts
export interface FlowRecorder {
  start(input: StartRecordingInput): Promise<RecordingSession>;
}
```

```ts
export interface RecordedStep {
  index: number;
  beforeState: BrowserState;
  action: AgentAction;
  afterState: BrowserState;
  validation?: ValidationResult;
  timestamp: Date;
}
```

---

## 9. Organização do Projeto

Estrutura recomendada em monorepo:

```txt
statepilot/
  apps/
    runtime-api/
    studio/
    worker/

  packages/
    core/
    browser-state/
    action-model/
    predictor/
    memory/
    validator/
    recovery/
    recorder/
    scheduler/
    observability/
    adapters/
      playwright/
      cdp/
    llm/
    testing/

  examples/
    basic-login/
    extract-table/
    recorded-flow/
    multi-task-runner/

  docs/
    architecture.md
    development.md
    testing.md
    runtime.md
    memory.md
    roadmap.md

  scripts/
    dev.ts
    seed.ts
    clean.ts

  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  turbo.json
  vitest.config.ts
  eslint.config.js
  README.md
```

---

## 10. Packages

### 10.1 `packages/core`

Contém contratos principais e orquestração base.

```txt
packages/core/
  src/
    engine/
      execution-engine.ts
      execution-context.ts
      execution-loop.ts
      execution-engine.test.ts

    task/
      agent-task.ts
      task-result.ts
      task-error.ts
      task.test.ts

    runtime/
      create-runtime.ts
      runtime-config.ts
      runtime.test.ts

    index.ts
```

---

### 10.2 `packages/browser-state`

Responsável por estado e encoding.

```txt
packages/browser-state/
  src/
    encoder/
      state-encoder.ts
      default-state-encoder.ts
      default-state-encoder.test.ts

    dom/
      dom-simplifier.ts
      dom-simplifier.test.ts

    accessibility/
      accessibility-normalizer.ts
      accessibility-normalizer.test.ts

    hash/
      state-hash.ts
      state-hash.test.ts

    types/
      browser-state.ts
      raw-browser-state.ts
      element-signature.ts

    index.ts
```

---

### 10.3 `packages/action-model`

Define ações serializáveis.

```txt
packages/action-model/
  src/
    actions/
      click-action.ts
      fill-action.ts
      press-action.ts
      wait-action.ts
      navigate-action.ts
      extract-action.ts

    validation/
      action-schema.ts
      action-schema.test.ts

    index.ts
```

---

### 10.4 `packages/predictor`

Camada preditiva.

```txt
packages/predictor/
  src/
    prediction-engine.ts
    hybrid-prediction-engine.ts
    hybrid-prediction-engine.test.ts

    strategies/
      recorded-flow-strategy.ts
      recorded-flow-strategy.test.ts

      transition-memory-strategy.ts
      transition-memory-strategy.test.ts

      heuristic-strategy.ts
      heuristic-strategy.test.ts

      semantic-match-strategy.ts
      semantic-match-strategy.test.ts

      llm-fallback-strategy.ts
      llm-fallback-strategy.test.ts

    scoring/
      confidence-score.ts
      confidence-score.test.ts

    types/
      prediction.ts
      prediction-input.ts
      prediction-source.ts

    index.ts
```

---

### 10.5 `packages/memory`

Persistência de transições e histórico.

```txt
packages/memory/
  src/
    prediction-memory.ts

    sqlite/
      sqlite-prediction-memory.ts
      sqlite-prediction-memory.test.ts
      migrations/

    postgres/
      postgres-prediction-memory.ts
      postgres-prediction-memory.test.ts
      migrations/

    models/
      learned-transition.ts
      execution-record.ts

    index.ts
```

MVP:

```txt
SQLite primeiro.
Postgres depois.
```

---

### 10.6 `packages/validator`

Validação entre estado previsto e estado real.

```txt
packages/validator/
  src/
    prediction-validator.ts
    default-prediction-validator.ts
    default-prediction-validator.test.ts

    energy/
      energy-score.ts
      energy-score.test.ts

    distance/
      url-distance.ts
      url-distance.test.ts

      dom-distance.ts
      dom-distance.test.ts

      text-distance.ts
      text-distance.test.ts

      element-distance.ts
      element-distance.test.ts

    index.ts
```

---

### 10.7 `packages/recovery`

Recuperação de fluxo.

```txt
packages/recovery/
  src/
    recovery-engine.ts
    default-recovery-engine.ts
    default-recovery-engine.test.ts

    strategies/
      retry-recovery.ts
      retry-recovery.test.ts

      memory-recovery.ts
      memory-recovery.test.ts

      heuristic-recovery.ts
      heuristic-recovery.test.ts

      llm-recovery.ts
      llm-recovery.test.ts

    index.ts
```

---

### 10.8 `packages/recorder`

Gravação de fluxos.

```txt
packages/recorder/
  src/
    flow-recorder.ts
    playwright-flow-recorder.ts
    playwright-flow-recorder.test.ts

    models/
      recorded-flow.ts
      recorded-step.ts

    storage/
      flow-storage.ts
      file-flow-storage.ts
      file-flow-storage.test.ts

    index.ts
```

---

### 10.9 `packages/scheduler`

Fila e concorrência.

```txt
packages/scheduler/
  src/
    task-scheduler.ts
    in-memory-scheduler.ts
    in-memory-scheduler.test.ts

    bullmq/
      bullmq-scheduler.ts
      bullmq-scheduler.test.ts

    concurrency/
      browser-pool.ts
      browser-pool.test.ts

      backpressure.ts
      backpressure.test.ts

    index.ts
```

---

### 10.10 `packages/adapters/playwright`

Adapter concreto com Playwright.

```txt
packages/adapters/playwright/
  src/
    playwright-adapter.ts
    playwright-adapter.test.ts

    playwright-session.ts
    playwright-session.test.ts

    playwright-page.ts
    playwright-page.test.ts

    state/
      playwright-state-reader.ts
      playwright-state-reader.test.ts

    index.ts
```

---

### 10.11 `packages/llm`

Fallback de LLM.

```txt
packages/llm/
  src/
    llm-planner.ts
    llm-planner.test.ts

    providers/
      openai-provider.ts
      anthropic-provider.ts
      gemini-provider.ts

    prompts/
      browser-recovery.prompt.ts
      action-selection.prompt.ts

    schemas/
      llm-action-response.schema.ts
      llm-action-response.schema.test.ts

    index.ts
```

Importante: o core não deve depender diretamente de OpenAI, Anthropic ou Gemini.

---

### 10.12 `packages/observability`

Logs, eventos, métricas e traces.

```txt
packages/observability/
  src/
    logger.ts
    logger.test.ts

    events/
      runtime-event.ts
      event-bus.ts
      event-bus.test.ts

    metrics/
      task-metrics.ts
      metrics-reporter.ts
      metrics-reporter.test.ts

    timeline/
      execution-timeline.ts
      execution-timeline.test.ts

    index.ts
```

---

### 10.13 `packages/testing`

Ferramentas internas para testes.

```txt
packages/testing/
  src/
    fixtures/
      browser-state.fixture.ts
      action.fixture.ts
      task.fixture.ts

    mocks/
      mock-browser-adapter.ts
      mock-prediction-memory.ts
      mock-prediction-engine.ts

    assertions/
      expect-valid-transition.ts
      expect-valid-transition.test.ts

    index.ts
```

---

## 11. Apps

### 11.1 `apps/runtime-api`

API para criar tasks, acompanhar execução e consultar resultados.

Stack:

- Fastify ou NestJS;
- Zod;
- OpenAPI;
- autenticação opcional;
- endpoints REST.

Estrutura:

```txt
apps/runtime-api/
  src/
    modules/
      tasks/
        tasks.controller.ts
        tasks.service.ts
        tasks.service.test.ts
        dto/
          create-task.dto.ts
          task-response.dto.ts

      flows/
        flows.controller.ts
        flows.service.ts
        flows.service.test.ts

      executions/
        executions.controller.ts
        executions.service.ts
        executions.service.test.ts

    main.ts
```

Endpoints iniciais:

```txt
POST   /tasks
GET    /tasks/:id
GET    /tasks/:id/events
GET    /tasks/:id/timeline
POST   /flows
GET    /flows
GET    /flows/:id
```

---

### 11.2 `apps/worker`

Processo que executa as tasks.

```txt
apps/worker/
  src/
    main.ts
    worker.ts
    worker.test.ts

    config/
      worker-config.ts

    health/
      health-server.ts
      health-server.test.ts
```

Responsabilidades:

- consumir fila;
- gerenciar browser pool;
- executar tasks;
- salvar resultados;
- reportar métricas;
- lidar com shutdown gracioso.

---

### 11.3 `apps/studio`

UI para visualizar e treinar fluxos.

Stack recomendado:

- Next.js;
- Tailwind;
- shadcn/ui ou Untitled UI;
- React Flow opcional para visualizar steps;
- timeline de execução;
- visualização de estados;
- comparação expected vs actual.

Telas iniciais:

```txt
Dashboard
Tasks
Task Detail
Flows
Flow Detail
Recorder
Memory
Settings
```

---

## 12. Configuração do Runtime

Exemplo de uso:

```ts
import { createRuntime } from "@statepilot/core";
import { playwrightAdapter } from "@statepilot/playwright";
import { sqliteMemory } from "@statepilot/memory";

const runtime = createRuntime({
  adapter: playwrightAdapter({
    headless: true,
  }),

  memory: sqliteMemory({
    path: "./runtime.db",
  }),

  predictor: {
    mode: "hybrid",
    confidenceThreshold: 0.75,
    llmFallback: true,
  },

  concurrency: {
    maxBrowsers: 8,
    maxPagesPerBrowser: 3,
    maxTasksPerSite: 2,
  },

  observability: {
    logs: true,
    screenshotsOnFailure: true,
    timeline: true,
  },
});
```

Executando task:

```ts
await runtime.run({
  id: crypto.randomUUID(),
  goal: "Login, search case, download latest document",
  siteKey: "projudi",
  input: {
    processNumber: "0000000-00.0000.0.00.0000",
  },
  priority: "normal",
  timeoutMs: 120_000,
  retryLimit: 2,
  createdAt: new Date(),
});
```

---

## 13. Estratégia de Concorrência

Não criar uma instância completa de browser para cada task sem controle.

Modelo recomendado:

```txt
100 tasks na fila
8 browsers vivos
2 a 3 pages por browser
limite por domínio/site
backpressure quando CPU/RAM passar limite
```

Config:

```ts
export interface ConcurrencyConfig {
  maxBrowsers: number;
  maxPagesPerBrowser: number;
  maxTasksPerSite: number;
  maxQueueSize?: number;
  taskTimeoutMs: number;
}
```

Browser pool:

```ts
export interface BrowserPool {
  acquire(input: AcquireBrowserInput): Promise<BrowserPageLease>;
  release(lease: BrowserPageLease): Promise<void>;
  drain(): Promise<void>;
}
```

Lease:

```ts
export interface BrowserPageLease {
  sessionId: string;
  page: BrowserPage;
  release: () => Promise<void>;
}
```

---

## 14. Fluxo de Execução Detalhado

```txt
1. Task entra na fila
2. Scheduler escolhe task
3. Worker solicita browser/page ao pool
4. Engine carrega flow/memory
5. Engine captura estado inicial
6. Predictor escolhe próxima ação
7. Executor executa ação
8. Observer captura novo estado
9. Validator calcula energy score
10. Memory registra sucesso/falha
11. Loop continua até atingir objetivo
12. Resultado é salvo
13. Browser/page é liberado
```

---

## 15. Modos de Predição

### 15.1 Recorded Flow

Usado quando há um fluxo gravado.

Vantagem:

- barato;
- rápido;
- previsível;
- ótimo para sistemas repetitivos.

### 15.2 Transition Memory

Usado quando o sistema já viu uma transição parecida.

Vantagem:

- aprende com o uso;
- reduz LLM;
- melhora com repetição.

### 15.3 Heuristics

Regras simples.

Exemplos:

```txt
Se existe input type=password, provavelmente é login.
Se existe botão com texto "Entrar", provável ação é click.
Se existe tabela com links PDF, provável ação é extract/download.
```

### 15.4 Semantic Match

Matching aproximado entre elementos e intenção.

Exemplo:

```txt
"buscar processo" pode bater com:
- "Pesquisar"
- "Consulta"
- "Número do processo"
- "Buscar"
```

### 15.5 LLM Fallback

Usado apenas quando:

- confiança baixa;
- layout desconhecido;
- erro inesperado;
- recuperação falhou;
- precisa interpretar instrução aberta.

---

## 16. Testes Obrigatórios

Regra principal:

> Todo arquivo importante deve ter um arquivo `.test.ts` correspondente.

Exemplo:

```txt
state-hash.ts
state-hash.test.ts
```

### Tipos de teste

#### Unit Tests

Obrigatórios em todos os packages core.

Testar:

- hashing;
- scoring;
- validators;
- reducers;
- selectors;
- action schemas;
- memory logic;
- confidence score;
- energy score.

#### Integration Tests

Testar integração entre:

- predictor + memory;
- engine + adapter mock;
- scheduler + worker;
- recorder + storage;
- validator + state encoder.

#### E2E Tests

Usar Playwright com páginas locais mockadas.

Exemplo:

```txt
examples/e2e-pages/login.html
examples/e2e-pages/table.html
examples/e2e-pages/multi-step-form.html
```

Testar:

- login flow;
- formulário multi-step;
- extração de tabela;
- download simulado;
- recuperação após erro;
- mudança de texto em botão;
- mudança de selector.

#### Load Tests

Importante para provar escala.

Testar:

- 10 tasks simultâneas;
- 50 tasks na fila;
- limite de browsers;
- timeout;
- memory leak;
- CPU/RAM;
- backpressure.

---

## 17. Padrão de Testes

Exemplo unitário:

```ts
import { describe, expect, it } from "vitest";
import { createStateHash } from "./state-hash";

describe("createStateHash", () => {
  it("should return the same hash for equivalent states", () => {
    const stateA = {
      url: "https://example.com/login",
      domHash: "abc",
      visibleTextHash: "def",
    };

    const stateB = {
      url: "https://example.com/login",
      domHash: "abc",
      visibleTextHash: "def",
    };

    expect(createStateHash(stateA)).toBe(createStateHash(stateB));
  });
});
```

Exemplo integration:

```ts
import { describe, expect, it } from "vitest";
import { HybridPredictionEngine } from "./hybrid-prediction-engine";
import { createMockMemory } from "@statepilot/testing";

describe("HybridPredictionEngine", () => {
  it("should prefer memory transition when confidence is high", async () => {
    const memory = createMockMemory({
      confidence: 0.92,
    });

    const engine = new HybridPredictionEngine({
      memory,
      strategies: [],
    });

    const prediction = await engine.predict({
      task: mockTask(),
      currentState: mockBrowserState(),
      previousActions: [],
    });

    expect(prediction.source).toBe("transition_memory");
    expect(prediction.confidence).toBeGreaterThan(0.85);
  });
});
```

---

## 18. Qualidade e Checks

Scripts obrigatórios:

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test",
    "test:watch": "turbo test --watch",
    "test:e2e": "playwright test",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "format": "prettier --write .",
    "check": "pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

Antes de merge:

```txt
pnpm check
pnpm test:e2e
```

---

## 19. Validação de Estado

A validação deve considerar múltiplas dimensões.

```txt
URL mudou como esperado?
DOM mudou como esperado?
Texto visível bate parcialmente?
Elementos esperados apareceram?
Elementos anteriores sumiram?
A task avançou?
A ação causou erro?
```

Não confiar em apenas um sinal.

Exemplo:

```ts
const energy = calculateEnergyScore({
  expected,
  actual,
});

if (energy.total < 0.25) {
  return "success";
}

if (energy.total < 0.55) {
  return "uncertain";
}

return "diverged";
```

---

## 20. Observabilidade

Cada task precisa gerar uma timeline.

```ts
export interface RuntimeEvent {
  id: string;
  taskId: string;
  type: RuntimeEventType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
```

Tipos:

```ts
export type RuntimeEventType =
  | "task.created"
  | "task.started"
  | "browser.acquired"
  | "state.captured"
  | "prediction.created"
  | "action.executed"
  | "validation.completed"
  | "memory.updated"
  | "recovery.started"
  | "recovery.completed"
  | "task.completed"
  | "task.failed";
```

Métricas úteis:

```txt
task duration
actions count
LLM calls count
prediction confidence average
recovery count
success rate per flow
success rate per site
browser memory usage
queue waiting time
average action latency
```

---

## 21. Segurança

O runtime deve tratar dados sensíveis com cuidado.

Regras:

- não logar senha;
- marcar fields sensíveis;
- mascarar valores em logs;
- criptografar secrets;
- separar sessões por cliente;
- evitar compartilhar browser context entre clientes;
- screenshots com dados sensíveis devem ser opcionais;
- storage deve ter política de retenção.

Exemplo:

```ts
export interface FillAction {
  type: "fill";
  selector: string;
  value: string;
  sensitive?: boolean;
}
```

Se `sensitive` for `true`, logs devem exibir:

```txt
********
```

---

## 22. Persistência

### MVP

SQLite.

Tabelas:

```txt
tasks
task_events
execution_records
browser_states
learned_transitions
recorded_flows
recorded_steps
artifacts
```

### Produção

Postgres.

Possível schema:

```sql
CREATE TABLE learned_transitions (
  id TEXT PRIMARY KEY,
  site_key TEXT,
  goal_hash TEXT,
  from_state_hash TEXT NOT NULL,
  action_json JSONB NOT NULL,
  to_state_hash TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

---

## 23. LLM Fallback

A LLM deve receber apenas o necessário.

Não enviar HTML completo por padrão.

Enviar:

```txt
goal
current URL
visible text resumido
lista de elementos interativos
últimas ações
erro de validação
```

Schema de resposta obrigatório:

```ts
export const LlmActionResponseSchema = z.object({
  action: z.discriminatedUnion("type", [
    ClickActionSchema,
    FillActionSchema,
    PressActionSchema,
    WaitActionSchema,
    NavigateActionSchema,
    ExtractActionSchema,
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
```

Nunca confiar em resposta livre da LLM.

---

## 24. MVP Recomendado

### Fase 1 — Core Local

Entregáveis:

- monorepo;
- contratos core;
- Playwright adapter;
- state encoder básico;
- action model;
- execution engine simples;
- validator simples;
- memory SQLite;
- testes unitários.

Objetivo:

```txt
Executar uma task simples com replay e validação.
```

---

### Fase 2 — Recorder

Entregáveis:

- gravar fluxo manual;
- salvar steps;
- replay;
- validar steps;
- tela simples ou CLI.

Objetivo:

```txt
Gravar login + busca + extração em site demo.
```

---

### Fase 3 — Predictor Híbrido

Entregáveis:

- transition memory strategy;
- heuristic strategy;
- confidence score;
- fallback LLM;
- recovery básico.

Objetivo:

```txt
Rodar fluxo conhecido sem LLM e usar LLM só em divergência.
```

---

### Fase 4 — Concorrência

Entregáveis:

- scheduler;
- worker;
- browser pool;
- limite por site;
- timeout;
- retries;
- load tests.

Objetivo:

```txt
Rodar múltiplas tasks simultâneas sem travar.
```

---

### Fase 5 — Studio

Entregáveis:

- dashboard;
- lista de tasks;
- timeline;
- visualização de flow;
- comparação expected vs actual;
- memória de transições.

Objetivo:

```txt
Dar visibilidade operacional para debug e venda.
```

---

## 25. Roadmap Técnico

### Curto prazo

```txt
- criar monorepo
- definir contratos
- criar Playwright adapter
- criar state encoder
- criar validator
- criar memory SQLite
- rodar primeiro fluxo local
```

### Médio prazo

```txt
- flow recorder
- replay inteligente
- recovery engine
- LLM fallback
- worker pool
- load tests
```

### Longo prazo

```txt
- embeddings de estado
- modelo pequeno para next-action prediction
- suporte a Electron
- CDP direto
- OS accessibility APIs
- visual browser understanding opcional
- marketplace de flows
```

---

## 26. Diferencial do Projeto

A maioria dos browser agents tenta resolver tudo com LLM.

Este projeto segue outra direção:

```txt
menos LLM
mais runtime
mais memória
mais previsão
mais validação
mais confiabilidade
```

Mensagem comercial:

> Nosso agent não pensa do zero a cada execução.  
> Ele aprende o fluxo, prevê os próximos estados, executa com validação e só usa IA quando algo sai do caminho esperado.

---

## 27. Exemplo de README Inicial

```md
# StatePilot

A lightweight TypeScript runtime for predictive browser agents.

Instead of calling an LLM for every browser step, this runtime observes browser states, predicts the next action, validates the result, and only falls back to LLMs when reality diverges.

## Features

- Playwright adapter
- Compact browser state encoder
- Predictive action engine
- Transition memory
- Recorded flow replay
- Validation with energy score
- Recovery engine
- Worker pool
- Full test-first architecture

## Install

\`\`\`bash
pnpm add @statepilot/core
\`\`\`

## Usage

\`\`\`ts
const runtime = createRuntime({
  adapter: playwrightAdapter(),
  memory: sqliteMemory("./runtime.db"),
});

await runtime.run({
  goal: "Login and extract latest documents",
  siteKey: "demo",
  input: {},
});
\`\`\`
```

---

## 28. Primeiros Arquivos a Criar

Ordem recomendada:

```txt
1. package.json
2. pnpm-workspace.yaml
3. tsconfig.base.json
4. turbo.json
5. packages/core/src/runtime/create-runtime.ts
6. packages/core/src/runtime/runtime-config.ts
7. packages/action-model/src/actions/*
8. packages/browser-state/src/types/*
9. packages/browser-state/src/hash/state-hash.ts
10. packages/validator/src/energy/energy-score.ts
11. packages/adapters/playwright/src/playwright-adapter.ts
12. packages/core/src/engine/execution-engine.ts
13. packages/memory/src/sqlite/sqlite-prediction-memory.ts
14. examples/basic-login
```

Sempre criar o `.test.ts` junto.

---

## 29. Regra de Ouro

Não construir primeiro o “modelo inteligente”.

Construir primeiro o runtime que gera dados bons.

O modelo vem depois.

A ordem correta:

```txt
runtime -> logs -> memória -> replay -> validação -> dados -> modelo
```

Não:

```txt
modelo -> tentativa de agent -> caos -> custo alto -> difícil debug
```

---

## 30. Conclusão

Este projeto pode se tornar a base técnica de um agent muito mais eficiente que os modelos tradicionais de browser automation com LLM.

A vantagem não está em parecer mais inteligente.  
A vantagem está em ser:

- mais barato;
- mais previsível;
- mais auditável;
- mais escalável;
- mais fácil de vender para operações reais;
- mais próximo de automação empresarial confiável.

O objetivo final é transformar browser automation em um runtime preditivo:

```txt
Observe -> Predict -> Execute -> Validate -> Learn -> Recover
```

Esse é o núcleo do projeto.
