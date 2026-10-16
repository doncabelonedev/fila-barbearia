-- =====================================
-- V01 — Registro de envio da mensagem de entrada na fila (JOINED)
-- =====================================
-- A mensagem de entrada sai do navegador do cliente e pode se perder.
-- O site marca esta coluna quando o envio dá certo; se ficar vazia por
-- mais de 1 min, o painel do barbeiro reenvia a mensagem.
ALTER TABLE public.queue
  ADD COLUMN IF NOT EXISTS joined_notified_at timestamp with time zone null;

-- Linhas que já existem contam como avisadas. Sem isso o painel reenviaria
-- a mensagem de entrada para quem já está na fila no momento do deploy.
UPDATE public.queue
   SET joined_notified_at = created_at
 WHERE joined_notified_at IS NULL;
