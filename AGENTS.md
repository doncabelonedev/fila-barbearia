# Contexto do Projeto - Agentes

## n8n Skills (oficiais)

This project uses n8n. When working with workflows, nodes, expressions, or
the n8n MCP tools, always start by loading the `using-n8n-skills-official` meta-skill
and follow its routing into the matching capability skill before acting.

## Visão Geral do Sistema

Sistema de fila para barbearia com gerenciamento via dashboard admin e check-in via app web. Suporta múltiplas pessoas por entrada (convidados), modo almoço, modo pré-abertura e notificações automáticas via webhook (n8n → WhatsApp).

## Fluxo do Cliente (App Web)

### 1. Home (`/`) — Entrada na Fila

- URL: `https://www.doncabellone.com.br`
- Campos: **Quantas pessoas vão cortar** (select 1–5, padrão 1), **Nome** e **Telefone** (com máscara)
- Informações exibidas abaixo dos campos: **posição estimada** e **horário estimado** (formato `"HH:mm"`)
  - Horário estimado é **ocultado** quando `isLunchPaused === true`
- Botão: "Entrar na fila"
- Ao clicar, abre **dialog multi-step de seleção de serviços** — um passo por pessoa
  - Cada passo exibe checkboxes: Cabelo (30min, padrão), Pezinho (10min), Barba (30min), Sobrancelha (5min)
  - Botão "Próximo" avança entre passos; "Confirmar" no último submete
- Ao confirmar, sistema insere entrada principal + entradas de convidados na fila e envia webhook:
  - `JOINED_IN_LUNCH` se `isLunchPaused`
  - `JOINED_IN_PRE_OPENING` se `isPreOpening`
  - `JOINED` caso contrário

### 2. Queue (`/queue`) — Status na Fila

- Exibe: **código da fila**, **posição na fila**
- Horário estimado: formato `"HH:mm"` arredondado para múltiplo de 5 min
- Horário estimado ocultado em modo almoço
- Botões: seguir no **Instagram**, chamar no **WhatsApp**
- Botão **sair da fila** — se cliente tem convidados ativos (`parent_queue_id`), exibe diálogo com opções "Somente eu" e "Eu e os convidados"
- Webhooks de acompanhamento via n8n: NEXT, NEAR, UPDATE, DELAYED

### 3. InService (`/in-service`)

Tela exibida quando cliente está em atendimento (`status === "serving"`).

## Posição na Fila — Contagem Inclui "serving"

**Regra fundamental**: A pessoa em atendimento (`status === "serving"`) é contada na posição da fila. Se alguém está sendo atendido, próximo cliente vê posição 2, não 1.

| Onde                              | Como calcula                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `useQueueCount()`                 | Conta itens `status in ("waiting","serving")`. Posição do novo cliente = `queueCount + 1` |
| `QueueStatus.calculatePosition()` | Conta itens `status in ("waiting","serving")` e `position < currentPosition`, depois `+1` |
| `useWebhookNotifications`         | `position = servingCount + waitingIndex + 1`, `peopleAhead = position - 1`                |
| NEXT trigger                      | Dispara quando `position === servingCount + 1` (topo da fila de espera)                   |
| `normalizeQueuePositions()`       | Serving items recebem primeiras posições, depois waiting                                  |

---

## Webhooks

POST para URL configurada em `shop_settings.webhook_url` (n8n em `https://n8n.doncabellone.com.br/`). n8n processa payload e envia **mensagens WhatsApp** automatizadas.

### Eventos

| Evento                  | Quando                                        | Condições                                                                                                                                   | Cooldown    | Flag                                   |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------- |
| `JOINED`                | Cliente entra na fila em horário normal       | Imediato no insert (Home, AddCustomerForm). **Não** envia se phone começa com `manual_`                                                     | —           | —                                      |
| `JOINED_IN_LUNCH`       | Cliente entra na fila durante `isLunchPaused` | Substitui `JOINED` quando flag ativa                                                                                                        | —           | —                                      |
| `JOINED_IN_PRE_OPENING` | Cliente entra na fila durante `isPreOpening`  | Substitui `JOINED` quando flag ativa                                                                                                        | —           | —                                      |
| `LUNCH_START`           | Admin ativa modo almoço                       | Loop por todos `waiting`+`serving`                                                                                                          | —           | —                                      |
| `LUNCH_END`             | Admin desativa modo almoço                    | Loop por todos `waiting`                                                                                                                    | —           | —                                      |
| `PRE_OPENING_START`     | Admin ativa pré-abertura                      | Loop por todos `waiting`+`serving`                                                                                                          | —           | —                                      |
| `PRE_OPENING_END`       | Admin desativa pré-abertura                   | Loop por todos `waiting`                                                                                                                    | —           | —                                      |
| `NEXT`                  | Cliente chega ao topo da espera               | `position === servingCount + 1` E `lastPos > servingCount + 1` E `!notified_next`                                                           | One-time    | `notified_next`                        |
| `NEAR`                  | Cliente próximo (posição ≤ 3)                 | `position <= 3` E `lastPos > 3` E `!notified_near`                                                                                          | One-time    | `notified_near`                        |
| `UPDATE`                | Posição mudou e ETA mudou                     | `\|ETA_novo - ETA_antigo\| >= 10min` E cooldown 5min. **Não dispara junto com JOINED**: primeira observação seta `last_sent_eta` sem enviar | 5 min       | `last_update_sent_at`, `last_sent_eta` |
| `DELAYED`               | Atendimento em atraso                         | `elapsed > service_duration` do serving. Enviado para cada `waiting` individualmente, cooldown 10min por item                               | 10 min/item | `last_delay_sent_at`                   |

**Prioridade entre NEXT/NEAR/UPDATE**: NEXT > NEAR > UPDATE. Se NEXT dispara, NEAR e UPDATE não disparam para o mesmo item na mesma verificação.

**Payload position**: rank ativo (`queueCount + 1`), nunca o campo DB `position`.

### Payload

```typescript
{
  type: "QUEUE_UPDATE",
  event: WebhookEvent,
  user: { name: string, phone: string },  // phone com "55" prefixo
  queue: { position: number, peopleAhead: number, etaMinutes: number, estimatedWait: string },
  establishment: { name: string },
  trackingUrl: string
}
```

### DELAYED — detalhes

- `elapsed` = min desde `service_start` do serving; `plannedDuration = service_duration ?? 30`. Dispara quando `elapsed > plannedDuration`
- Loop por `waiting`, cooldown 10min por item (`last_delay_sent_at`), verificação `setInterval` 1 min
- Posição enviada: `itemPosition = i + 2` (1 = serving)

### AddCustomerForm — phone "manual\_"

Admin pode adicionar cliente manualmente. Se phone começa com `manual_`, webhook `JOINED*` **não é enviado**.

## Tempo Estimado de Serviço — Dinâmico por `service_duration`

ETA = soma de `service_duration` real de cada entrada à frente (não média fixa).

| Função                                             | Comportamento                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `calculateEstimatedServiceTimeDynamic(pos)`        | Busca ativos com `service_duration`. Soma à frente. Retorna `"HH:mm"` |
| `calculateEstimatedMinutes(pos)`                   | Mesma lógica, retorna minutos numéricos (para `etaMinutes`)           |
| `calculateEstimatedServiceTime(pos, avgDuration?)` | Fallback estático síncrono; default 37                                |
| `useAverageServiceTime()`                          | Retorna `37` — fallback quando `service_duration` ausente             |

**Fallback**: `service_duration` null → 30 min (default DB) ou 37 min (heurística antiga).

- **Arredondamento** (`roundToNearest5`): múltiplo de 5 min mais próximo (9:47 → 9:45)
- **Formato**: string única `"HH:mm"` (não mais intervalo)
- **Drift**: `useWebhookNotifications` envia UPDATE mesmo com posição constante se ETA drift ≥ 10min e cooldown OK
- **Não duplicar serving**: `remainingCurrent` (atendimento atual) separado de `waitingAhead`; posição 1 usa só `remainingCurrent`

```typescript
const waitingAhead = Math.max(0, posicaoNaFila - 1 - servingCount);
// totalMin = remainingCurrent + waitingAhead * avg
```

## Convidados (Múltiplas Pessoas)

### Padrão de criação

- Responsável preenche nome/telefone + quantidade (1–5)
- Confirma serviços por pessoa
- Sistema cria 1 entrada normal + N entradas com `parent_queue_id = queueEntry.id`

### Identificação

| Campo                     | Valor                                    |
| ------------------------- | ---------------------------------------- |
| `customers.phone`         | `manual_${Date.now()}_${i}`              |
| `customers.name`          | `"Convidado de ${nome}"`                 |
| `queue.parent_queue_id`   | ID do responsável                        |
| `queue.service_duration`  | Calculado dos serviços daquele convidado |
| `queue.selected_services` | Array dos IDs escolhidos                 |

### Dashboard (QueueItemCard)

Prefixo `manual_` aciona comportamento existente:

- Oculta telefone
- Oculta botão WhatsApp
- Mantém "Iniciar atendimento" e "Excluir"
- Exibe ícone link para `parent_queue_id`
- Exibe chips de `selected_services`

### Saída com convidados (QueueStatus)

- Consulta `queue WHERE parent_queue_id = queueId AND status IN ('waiting','serving')`
- Se há convidados: diálogo "Somente eu" / "Eu e os convidados"
- **Sem localStorage** — relação 100% via DB

### Webhooks

- `JOINED*` enviado só para responsável
- Convidados com `manual_` filtrados em todos webhooks

---

## Serviços Disponíveis

`src/constants/constants.ts → BARBER_SERVICES`:

| id          | label       | duration |
| ----------- | ----------- | -------- |
| cabelo      | Cabelo      | 30 min   |
| pezinho     | Só pezinho  | 10 min   |
| barba       | Barba       | 30 min   |
| sobrancelha | Sobrancelha | 5 min    |

`ServiceId = "cabelo" | "pezinho" | "barba" | "sobrancelha"`

---

## Campo `position` — Detalhes

`position` no DB é:

- Chave de ordenação SQL (`order("position", { ascending: true })`)
- Persistência de ordem após drag/drop manual
- **Não é rank visual**

### Cálculo do próximo `position`

Tanto `Home.tsx` quanto `AddCustomerForm.tsx`:

```ts
const { data: last } = await supabase
  .from("queue")
  .select("position")
  .in("status", ["waiting", "serving"]) // filtra ativos
  .order("position", { ascending: false })
  .limit(1)
  .maybeSingle();
const nextPos = (last?.position || 0) + 1;
```

Filtro por status ativo garante que `position` reseta para 1 quando fila esvazia. Antes (sem filtro) crescia para sempre incluindo `completed`/`cancelled`.

Rank visual é sempre runtime — ver tabela em [Posição na Fila](#posição-na-fila--contagem-inclui-serving).

## AdminDashboard — Notificações

`useWebhookNotifications` processa webhooks em tempo real:

1. Carrega itens `waiting`+`serving`
2. Calcula rank `servingCount + waitingIndex + 1`
3. Verifica flags `notified_next` / `notified_near` no DB
4. Verifica `last_sent_eta` / `last_update_sent_at` para UPDATE
5. Se condições atendidas → envia webhook + atualiza flag/timestamp

**Não há reset automático de flags** baseado em `peopleAhead`. Reset só em reorder manual (drag/drop).

## AdminDashboard — Card do Cliente (QueueItemCard)

Por item exibe:

- Código, nome, telefone (oculto se `manual_`)
- **Horário de entrada** (`created_at`) com segundos: `DD/MM/AA, HH:mm:ss`
- **Início do atendimento** (`service_start`) para `serving`: `"Iniciou: HH:mm:ss"` em verde
- **Chips de serviços** (`selected_services`)
- **Ícone link** se `parent_queue_id` (convidado)

## Modo Almoço e Pré-Abertura

### Controle (AdminHeader)

- Botões dedicados para alternar `is_lunch_paused` e `is_pre_opening`
- Almoço só ativa com loja aberta
- Pré-abertura só ativa em modo `auto` E loja fechada (antes do `open_time`)

### Estado (useShopSettings)

- Provê `isLunchPaused` e `isPreOpening`
- Atualiza via realtime (`postgres_changes` em `shop_settings`)

### Efeito no cliente

- Home: oculta horário estimado durante `isLunchPaused`
- QueueStatus: idem
- Novo entrante recebe webhook `JOINED_IN_LUNCH` ou `JOINED_IN_PRE_OPENING`

### Webhooks de transição

- `LUNCH_START` / `PRE_OPENING_START`: notifica todos ativos
- `LUNCH_END` / `PRE_OPENING_END`: notifica só `waiting`
- Após `LUNCH_END`: recálculo do tempo médio

## Campanhas de WhatsApp

`AdminCampaigns`:

- URL fixa: `https://n8ndes.ltech.app.br/webhook/campanha`
- Tabela única `campaigns` com `is_draft`
- Formatação: `**negrito**`, `*itálico*`
