import { supabase } from "./supabase";

/** Colunas da `queue` que registram que uma mensagem ja foi enviada. */
export type NotificationFlag = "notified_next" | "notified_near" | "joined_notified_at";

const isTimestampFlag = (flag: NotificationFlag) => flag === "joined_notified_at";

/**
 * Marca a flag somente se ela ainda nao estiver marcada. Retorna `true` para
 * quem conseguiu marcar. O filtro no proprio UPDATE faz o banco decidir, entao
 * dois paineis abertos ao mesmo tempo nunca ganham os dois.
 */
async function claimFlag(queueId: string, flag: NotificationFlag): Promise<boolean> {
  const query = supabase
    .from("queue")
    .update({ [flag]: isTimestampFlag(flag) ? new Date().toISOString() : true })
    .eq("id", queueId);

  const { data, error } = await (isTimestampFlag(flag)
    ? query.is(flag, null)
    : query.not(flag, "is", true)
  ).select("id");

  if (error) {
    console.error(`Falha ao marcar ${flag} para ${queueId}:`, error);
    return false;
  }
  return (data ?? []).length > 0;
}

async function releaseFlag(queueId: string, flag: NotificationFlag): Promise<void> {
  await supabase
    .from("queue")
    .update({ [flag]: isTimestampFlag(flag) ? null : false })
    .eq("id", queueId);
}

/** Registra que a mensagem foi enviada (no-op se ja estava marcada). */
export async function markNotified(queueId: string, flag: NotificationFlag): Promise<void> {
  await claimFlag(queueId, flag);
}

/**
 * Envia a mensagem uma unica vez por cliente, mesmo com mais de um painel
 * aberto: so quem marca a flag primeiro envia. Se o envio falhar, desmarca
 * para que o proximo ciclo tente de novo.
 */
export async function sendOnce(
  queueId: string,
  flag: NotificationFlag,
  send: () => Promise<boolean>,
): Promise<boolean> {
  if (!(await claimFlag(queueId, flag))) return false;

  const sent = await send();
  if (!sent) await releaseFlag(queueId, flag);
  return sent;
}
