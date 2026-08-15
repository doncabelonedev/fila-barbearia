import { Check, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import { BarberService } from "../lib/supabase";

export function calculatePersonDuration(
  services: string[],
  catalog: BarberService[],
): number {
  return services.reduce((sum, id) => {
    const svc = catalog.find((s) => s.id === id);
    return sum + (svc?.duration_minutes ?? 0);
  }, 0);
}

interface ServiceSelectionDialogProps {
  personName: string;
  personIndex: number;
  totalPeople: number;
  services: BarberService[];
  selectedServices: string[];
  loading?: boolean;
  onToggle: (id: string) => void;
  onDismiss: () => void;
  onBack: () => void;
  onNext: () => void;
}

export default function ServiceSelectionDialog({
  personName,
  personIndex,
  totalPeople,
  services,
  selectedServices,
  loading = false,
  onToggle,
  onDismiss,
  onBack,
  onNext,
}: ServiceSelectionDialogProps) {
  const isLast = personIndex === totalPeople - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onDismiss}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDismiss();
      }}
      tabIndex={-1}
      autoFocus
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl bg-neutral-900 p-6 border border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          {totalPeople > 1 ? (
            <p className="text-xs text-neutral-500">
              {personIndex + 1} de {totalPeople}
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="text-neutral-500 hover:text-neutral-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <h3 className="mb-1 text-lg font-semibold text-white">
          Serviços para:{" "}
          <span className="text-emerald-400">{personName}</span>
        </h3>
        <p className="mb-4 text-xs text-neutral-500">
          Selecione os serviços desejados
        </p>

        <div className="space-y-2 mb-4">
          {services.map((svc) => {
            const selected = selectedServices.includes(svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => onToggle(svc.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all ${
                  selected
                    ? "border-emerald-500 bg-emerald-900/20 text-emerald-400"
                    : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
                      selected
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-neutral-600"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <span className="font-medium">
                    {svc.label}
                    {svc.id === "cabelo" && (
                      <span className="text-sm text-neutral-500">
                        &nbsp;- Pezinho incluso
                      </span>
                    )}
                  </span>
                </div>
                <span className="text-sm text-neutral-400">
                  {svc.duration_minutes} min
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-neutral-800 px-4 py-2">
          <span className="text-sm text-neutral-400">Tempo total</span>
          <span className="font-bold text-white">
            {calculatePersonDuration(selectedServices, services)} min
          </span>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 h-12 rounded-xl border border-neutral-700 text-neutral-300 font-medium transition-colors hover:bg-neutral-800"
          >
            {personIndex > 0 ? "Voltar" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={loading || selectedServices.length === 0}
            className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-medium transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : isLast ? (
              "Confirmar"
            ) : (
              "Próximo"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
