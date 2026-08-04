import { useEffect, useRef } from "react";
import { QueueItem, supabase } from "../lib/supabase";
import { webhookService } from "../services/webhookService";
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
        const waitingItems = queue
          .filter((i) => i.status === "waiting")
          .sort((a, b) => a.position - b.position);
        const currentBaseTime = baseQueueTime == null ? 30 : baseQueueTime;

        for (let index = 0; index < waitingItems.length; index++) {
          const item = waitingItems[index];
          const position = servingCount + index + 1;
          const peopleAhead = position - 1;
          const lastPos = notifiedPositionMap.current.get(item.id);

          if (lastPos === undefined) {
            notifiedPositionMap.current.set(item.id, position);
            const etaMinutes = await calculateEstimatedMinutes(position);
            await supabase
              .from("queue")
              .update({ last_sent_eta: etaMinutes })
              .eq("id", item.id);
            continue;
          }

          if (lastPos !== position) {
            const notifiedNext = (item as any).notified_next ?? false;
            const notifiedNear = (item as any).notified_near ?? false;
            let webhookSent = false;

            const nextTriggerPosition = servingCount + 1;
            if (
              position === nextTriggerPosition &&
              lastPos > nextTriggerPosition &&
              !notifiedNext
            ) {
              webhookSent = await webhookService.sendWebhook(
                "NEXT",
                item,
                position,
                peopleAhead,
                currentBaseTime,
                shopName,
                webhookUrl,
                trackingUrlBase,
              );
              if (webhookSent) {
                await supabase
                  .from("queue")
                  .update({ notified_next: true })
                  .eq("id", item.id);
              }
            } else if (position <= 3 && lastPos > 3 && !notifiedNear) {
              webhookSent = await webhookService.sendWebhook(
                "NEAR",
                item,
                position,
                peopleAhead,
                currentBaseTime,
                shopName,
                webhookUrl,
                trackingUrlBase,
              );
              if (webhookSent) {
                await supabase
                  .from("queue")
                  .update({ notified_near: true })
                  .eq("id", item.id);
              }
            } else {
              try {
                const etaMinutes = await calculateEstimatedMinutes(position);
                const prevSentEta = (item as any).last_sent_eta;
                const prevSentAt = (item as any).last_update_sent_at
                  ? new Date((item as any).last_update_sent_at)
                  : null;
                const now = new Date();
                const cooldownMs = 5 * 60 * 1000;
                const etaDiff =
                  prevSentEta == null
                    ? Infinity
                    : Math.abs(etaMinutes - prevSentEta);

                if (
                  etaDiff >= 10 &&
                  (prevSentAt == null ||
                    now.getTime() - prevSentAt.getTime() >= cooldownMs)
                ) {
                  webhookSent = await webhookService.sendWebhook(
                    "UPDATE",
                    item,
                    position,
                    peopleAhead,
                    currentBaseTime,
                    shopName,
                    webhookUrl,
                    trackingUrlBase,
                  );
                  if (webhookSent) {
                    await supabase
                      .from("queue")
                      .update({
                        last_update_sent_at: now.toISOString(),
                        last_sent_eta: etaMinutes,
                      })
                      .eq("id", item.id);
                  }
                }
              } catch (e) {
                console.error("Erro ao processar UPDATE:", e);
              }
            }

            notifiedPositionMap.current.set(item.id, position);
            if (webhookSent) await new Promise((r) => setTimeout(r, 500));
          }
        }
      } finally {
        processingWebhooksRef.current = false;
      }
    };

    processWebhooks();
  }, [queue, isAuthenticated, baseQueueTime, shopName, webhookUrl, trackingUrlBase, isPreOpening, isLunchPaused]);

}
