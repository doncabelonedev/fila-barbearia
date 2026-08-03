## Fila — Barbearia

Sistema de fila virtual para barbearia com painel admin, app web de check-in e
notificações automáticas via WhatsApp (n8n).

Documentação completa: [`AGENTS.md`](./AGENTS.md).

## Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind v4
- **Backend**: Supabase (Postgres + Realtime)
- **Notificações**: n8n (webhook → WhatsApp)
- **Drag & drop**: @hello-pangea/dnd

## Setup

```bash
npm install
cp .env.example .env       # preencher VITE_SUPABASE_URL, VITE_SUPABASE_API_KEY, VITE_ADMIN_PIN
npm run dev                # http://localhost:3000
```

Banco: rodar `supabase_schema.sql` no painel do Supabase (SQL Editor) antes do
primeiro start. Alterações de schema = atualizar `supabase_schema.sql` e o tipo
correspondente em `src/lib/supabase.ts`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite dev server (porta 3000, HMR ativo) |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | `tsc --noEmit` (verifica tipos sem emitir) |
| `npm run clean` | Remove `dist/` |

## n8n / Skills

O projeto consome 15 skills n8n via `.opencode/skills/` (lock em
`skills-lock.json`). O meta-skill `using-n8n-mcp-skills` é o ponto de entrada —
sempre carregue antes de qualquer ação em workflows.

Para configurar o servidor n8n-mcp, adicione um bloco `mcp` em
`opencode.json` apontando para a instância (`n8ndes.ltech.app.br` neste
projeto).

## Estrutura

```
src/
├── lib/        # supabase client, storage, nameUtils
├── hooks/      # useQueue, useQueueActions, useShopSettings, useWebhookNotifications
├── services/   # webhookService (JOINED, NEXT, NEAR, UPDATE, DELAYED, etc.)
├── components/admin/   # QueueItemCard, QueueList, AddCustomerForm, AdminHeader, ...
├── pages/      # Home, QueueStatus, InService, AdminDashboard, AdminSettings, ...
└── constants/  # BARBER_SERVICES, DDDs, weekdays
```

## Regras críticas

Ver `AGENTS.md` para as regras não-óbvias: contagem de `serving` na posição,
ETA dinâmico por `service_duration`, dedupe de webhooks (flags `notified_*`),
convidados com `parent_queue_id` e `manual_*`, modos almoço/pré-abertura.
