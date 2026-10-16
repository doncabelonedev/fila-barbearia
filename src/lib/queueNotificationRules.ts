import { QueueItem } from "./supabase";

/** Posicao a partir da qual o cliente recebe o aviso "sua vez esta se aproximando". */
const NEAR_POSITION = 3;

/** Tempo que o site do cliente tem para enviar a mensagem de entrada antes do painel assumir. */
const JOINED_FALLBACK_MIN_AGE_MS = 60 * 1000;

/** Depois disso a mensagem de entrada perde o sentido e nao e mais reenviada. */
const JOINED_FALLBACK_MAX_AGE_MS = 30 * 60 * 1000;

export type PositionEvent = "NEXT" | "NEAR" | "UPDATE";

/**
 * Convidado e cliente sem telefone ocupam cadeira (contam na posicao e no
 * ETA), mas nao recebem mensagem.
 */
export function canReceiveMessages(item: QueueItem): boolean {
  const phone = item.customer?.phone ?? "";
  return !item.parent_queue_id && phone !== "" && !phone.startsWith("manual_");
}

/**
 * Qual mensagem enviar quando a posicao do cliente muda.
 *
 * - NEXT: virou o primeiro da espera ("sua vez chegou").
 * - NEAR: entrou no top 3.
 * - UPDATE: qualquer outra mudanca (sujeito a regra de variacao do ETA).
 *
 * Quem esta na posicao de NEXT nunca recebe UPDATE: o "sua vez chegou" sai
 * uma unica vez, pelo NEXT.
 */
export function pickPositionEvent(
  position: number,
  lastPosition: number,
  servingCount: number,
): PositionEvent | null {
  if (position === lastPosition) return null;

  const nextPosition = servingCount + 1;
  if (position === nextPosition) {
    return lastPosition > position ? "NEXT" : null;
  }
  if (position <= NEAR_POSITION && lastPosition > NEAR_POSITION) return "NEAR";
  return "UPDATE";
}

/**
 * A mensagem de entrada sai do navegador do cliente e pode se perder (aba
 * fechada, tela bloqueada, rede). Se depois de 1 min ela ainda nao foi
 * marcada como enviada, o painel do barbeiro reenvia.
 */
export function needsJoinedFallback(item: QueueItem, now: Date): boolean {
  if (item.joined_notified_at) return false;

  const ageMs = now.getTime() - new Date(item.created_at).getTime();
  return ageMs >= JOINED_FALLBACK_MIN_AGE_MS && ageMs <= JOINED_FALLBACK_MAX_AGE_MS;
}
