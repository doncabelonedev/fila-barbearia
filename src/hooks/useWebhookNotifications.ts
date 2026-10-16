import { useEffect, useRef } from "react";
import { QueueItem, supabase } from "../lib/supabase";
import { sendOnce } from "../lib/queueNotificationFlags";
import {
  canReceiveMessages,
  needsJoinedFallback,
  pickPositionEvent,
} from "../lib/queueNotificationRules";
import { WebhookEvent, webhookService } from "../services/webhookService";
import { calculateEstimatedMinutes } from "./useQueue";

interface Params {
  isAuthenticated: boolean;
  queue: QueueItem[];
  baseQueueTime: number | null;
  shopName: string;
  webhookUrl: string | null;
  trackingUrlBase: string | null;
  isPreOpening: boolean;
  isLunchPaused: boolean;
}

/** UPDATE so sai se o ETA mudou pelo menos isso desde o ultimo envio... */
const UPDATE_MIN_ETA_DIFF_MINUTES = 10;
/** ...e se o ultimo UPDATE foi ha pelo menos isso. */
const UPDATE_COOLDOWN_MS = 5 * 60 * 1000;

export function useWebhookNotifications({
  isAuthenticated,
  queue,
  baseQueueTime,
  shopName,
  webhookUrl,
  trackingUrlBase,
  isPreOpening,
  isLunchPaused,
}: Params) {
  const notifiedPositionMap = useRef<Map<string, number>>(new Map());
  const processingWebhooksRef = useRef(false);

  useEffect(() => {
    if (
      !isAuthenticated ||
      isPreOpening ||
      isLunchPaused ||
      queue.length === 0 ||
      processingWebhooksRef.current
    )
      return;

    const processWebhooks = async () => {
      processingWebhooksRef.current = true;
      try {
        const servingCount = queue.filter((i) => i.status === "serving").length;
        // Convidados entram na contagem: ocupam cadeira mesmo sem receber mensagem.
        const waitingItems = queue
          .filter((i) => i.status === "waiting")
          .sort((a, b) => a.position - b.position);
        const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;

        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          if (!canReceiveMessages(item)) continue;

          const position = servingCount + index + 1;
          const send = (event: WebhookEvent) =>
            webhookService.sendWebhook(
              event,
              item,
              position,
              position - 1,
              currentBaseTime,
              shopName,
              webhookUrl,
              trackingUrlBase,
            );

          let webhookSent = false;

          if (needsJoinedFallback(item, new Date())) {
            webhookSent = await sendOnce(item.id, "joined_notified_at", () =>
              send("JOINED"),
            );
          }

          const lastPos = notifiedPositionMap.current.get(item.id);
          notifiedPositionMap.current.set(item.id, position);

          if (lastPos === undefined) {
            const etaMinutes = await calculateEstimatedMinutes(position);
            await supabase
              .from("queue")
              .update({ last_sent_eta: etaMinutes })
              .eq("id", item.id);
          } else {
            const event = pickPositionEvent(position, lastPos, servingCount);
            // Quem ja recebeu "sua vez chegou" nao recebe mais NEAR/UPDATE.
            const alreadyCalled = item.notified_next === true;

            if (event === "NEXT") {
              webhookSent = await sendOnce(item.id, "notified_next", () =>
                send("NEXT"),
              );
            } else if (event === "NEAR" && !alreadyCalled) {
              webhookSent = await sendOnce(item.id, "notified_near", () =>
                send("NEAR"),
              );
            } else if (event === "UPDATE" && !alreadyCalled) {
              webhookSent = await sendUpdateIfEtaDrifted(item, position, send);
            }
          }

          if (webhookSent) await new Promise((r) => setTimeout(r, 500));
        }
      } finally {
        processingWebhooksRef.current = false;
      }
    };

    processWebhooks();
  }, [queue, isAuthenticated, baseQueueTime, shopName, webhookUrl, trackingUrlBase, isPreOpening, isLunchPaused]);

}

/** Envia UPDATE so quando o ETA mudou o bastante e o cooldown ja passou. */
async function sendUpdateIfEtaDrifted(
  item: QueueItem,
  position: number,
  send: (event: WebhookEvent) => Promise<boolean>,
): Promise<boolean> {
  try {
    const etaMinutes = await calculateEstimatedMinutes(position);
    const prevSentAt = item.last_update_sent_at
      ? new Date(item.last_update_sent_at)
      : null;
    const now = new Date();
    const etaDiff =
      item.last_sent_eta == null
        ? Infinity
        : Math.abs(etaMinutes - item.last_sent_eta);

    const cooldownPassed =
      prevSentAt == null ||
      now.getTime() - prevSentAt.getTime() >= UPDATE_COOLDOWN_MS;
    if (etaDiff < UPDATE_MIN_ETA_DIFF_MINUTES || !cooldownPassed) return false;

    const sent = await send("UPDATE");
    if (sent) {
      await supabase
        .from("queue")
        .update({
          last_update_sent_at: now.toISOString(),
          last_sent_eta: etaMinutes,
        })
        .eq("id", item.id);
    }
    return sent;
  } catch (e) {
    console.error("Erro ao processar UPDATE:", e);
    return false;
  }
}
