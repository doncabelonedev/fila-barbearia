-- =====================================
-- V02 — Remove a coluna do antigo aviso de atraso ao cliente
-- =====================================
-- O aviso de atraso ao cliente foi removido (workflow n8n "Barbearia -
-- Atendimento Estourado"). A coluna guardava o cooldown desse aviso e não
-- é mais lida nem escrita por ninguém.
--
-- Rodar SOMENTE depois de substituir no n8n o workflow antigo de aviso de
-- atraso: a query dele lê e grava esta coluna e passaria a falhar.
ALTER TABLE public.queue
  DROP COLUMN IF EXISTS last_delay_sent_at;
