import React, { createContext, useContext, ReactNode, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase, BarberService } from "../lib/supabase";

interface BarberServicesContextType {
  services: BarberService[];
  activeServices: BarberService[];
  loading: boolean;
}

const BarberServicesContext = createContext<
  BarberServicesContextType | undefined
>(undefined);

export function useBarberServicesHook() {
  const location = useLocation();
  const [services, setServices] = useState<BarberService[]>([]);
  const [loading, setLoading] = useState(true);

  const enabled =
    location.pathname === "/" || location.pathname.startsWith("/admin");

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    async function fetchServices() {
      const { data } = await supabase
        .from("barber_services")
        .select("*")
        .order("display_order", { ascending: true })
        .order("label", { ascending: true });
      if (data) {
        setServices(data);
      }
      setLoading(false);
    }

    fetchServices();

    const channel = supabase
      .channel("barber_services_updates")
      .on(
        "postgres_changes",
        { event: "*", table: "barber_services" },
        () => {
          fetchServices();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  const activeServices = services.filter((s) => s.is_active);

  return { services, activeServices, loading };
}

export function BarberServicesProvider({ children }: { children: ReactNode }) {
  const value = useBarberServicesHook();

  return (
    <BarberServicesContext.Provider value={value}>
      {children}
    </BarberServicesContext.Provider>
  );
}

export function useBarberServices() {
  const context = useContext(BarberServicesContext);
  if (context === undefined) {
    return { services: [] as BarberService[], activeServices: [] as BarberService[], loading: true };
  }
  return context;
}
