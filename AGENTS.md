# Contexto do Projeto - Agentes

## Visão Geral do Sistema

Sistema de fila para barbearia com gerenciamento via dashboard admin e check-in via app web.

---

## Tabelas do Banco de Dados

### 1. `customers`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `name` | Nome do cliente |
| `phone` | Telefone (único) |
| `created_at` | Data de criação |

---

### 2. `queue`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `customer_id` | Referência para cliente |
| `code` | Código de 4 caracteres (ex: "1CMI6") |
| `position` | **ID sequencial acumulativo** (100, 101, 102...). Usado para ordenação no banco. |
| `status` | "waiting", "serving", "completed", "cancelled" |
| `created_at` | Data de entrada na fila |
| `service_start` | Timestamp início do atendimento |
| `service_end` | Timestamp fim do atendimento |
| `notified_next` | Flag para evitar re-envio de webhook NEXT |
| `notified_near` | Flag para evitar re-envio de webhook NEAR |
| `last_update_sent_at` | Timestamp do último webhook UPDATE |
| `last_sent_eta` | Último ETA enviado |

---

### 3. `services` (Histórico)

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `customer_id` | Referência para cliente |
| `duration_minutes` | Duração do serviço em minutos |
| `created_at` | Data de realização |

---

### 4. `barbershop_schedule`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `weekday` | Dia da semana (0-6, sendo 0 = domingo) |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Se o dia está fechado |

---

### 5. `schedule_exceptions`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `date` | Data específica |
| `open_time` | Horário de abertura |
| `close_time` | Horário de fechamento |
| `is_closed` | Se está fechado |

---

### 6. `shop_settings`

| Campo | Descrição |
|-------|------------|
| `id` | UUID único |
| `manual_status` | "auto", "open", "closed" |
| `whatsapp_number` | Número para contato |
| `theme` | "light" ou "dark" |
| `shop_name` | Nome da barbearia |
| `logo_url` | URL do logo |
| `webhook_url` | URL do webhook para n8n |
| `tracking_url_base` | URL base para rastreamento |
| `base_queue_time` | Tempo base por cliente (minutos) |
| `max_queue_time` | Hora máxima para entrar na fila |

---

## Webhooks

O sistema envia webhooks para integração externa (ex: n8n). Tipos de evento:

| Evento | Quando é enviado |
|--------|-------------------|
| `JOINED` | Cliente entra na fila (Home/Join) |
| `NEXT` | Cliente chega no topo da fila (`peopleAhead === 0`) |
| `NEAR` | Cliente está próximo (`peopleAhead <= 2`) |
| `UPDATE` | Posição muda e ETA muda >= 10min (com cooldown de 5min) |

**Importante**: O `position` enviado no webhook deve ser a **posição real na fila** (1, 2, 3...), não o ID sequencial do banco.

---

## Posição no Webhook

**Problema identificado**: O campo `position` no banco é um ID sequencial que acumula (100, 101...). Para o webhook, deve-se usar a posição real na fila.

**Solução aplicada**: Nos arquivos `Home.tsx` e `Join.tsx`, o webhook agora envia `queueCount + 1` em vez do ID sequencial do banco.

```typescript
// Home.tsx e Join.tsx - ANTES (incorreto)
webhookService.sendWebhook("JOINED", queueEntry, nextPosition, ...)

// DEPOIS (corrigido)
webhookService.sendWebhook("JOINED", queueEntry, queueCount + 1, ...)
```

---

## AdminDashboard - Lógica de Notificações

O AdminDashboard processa webhooks em tempo real para notificar clientes. Fluxo:

1. Carrega todos os itens com status "waiting" ou "serving"
2. Calcula posição real com `index + 1` (ignora valor do banco)
3. Verifica flags `notified_next` e `notified_near` do banco
4. Se conditions atendidas e flags false → envia webhook

**Importante**: Não fazer reset automático das flags baseado apenas no `peopleAhead`. Isso causava re-envio ao abrir o dashboard após período offline. O reset só deve ocorrer em reorder manual (drag and drop).

---

## Campos `position` vs Posição Real

O campo `position` no banco é usado para:
- Ordenação no Supabase (`order("position", { ascending: true })`)
- Eficiência em queries (`.lt("position", x)` mais rápido que datas)
- Persistência de ordem se houver reorder manual

O AdminDashboard ignora o valor e recalcula com índice do array (`index + 1`) para exibir ao usuário.

**Decisão**: Manter o campo `position` no banco por enquanto.

---

## Decisões de Desenvolvimento

1. **Webhook position**: Alterado de ID sequencial para posição real (queueCount + 1)
2. **Reset de notificações**: Removido reset automático que causava re-envio indevido ao abrir dashboard
3. **Position no banco**: Mantido para ordenação e eficiência
4. **Schema**: Todas as tabelas documentadas conforme supabase_schema.sql

---

## Estrutura de Arquivos

```
src/
├── lib/
│   └── supabase.ts          # Cliente Supabase
├── hooks/
│   ├── useQueue.ts         # Hooks de fila (contagem, tempo estimado)
│   └── useShopSettings.ts  # Configurações da loja
├── services/
│   └── webhookService.ts   # Serviço de webhooks
├── pages/
│   ├── Home.tsx            # Entrar na fila
│   ├── Join.tsx            # Entrar via código (alternativo)
│   ├── QueueStatus.tsx     # Ver status na fila
│   └── AdminDashboard.tsx  # Painel admin
└── constants/
    └── constants.ts        # DDDs, etc
```

---

## Comandos Úteis

```bash
# Verificar lint
npm run lint

# Verificar build
npm run build

# Verificar erros TypeScript
npm run typecheck
```