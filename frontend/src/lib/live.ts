import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUi } from "./store";

/** Keeps one WebSocket open to the twin and fans updates out to the store and query cache. */
export function useLiveTwin() {
  const qc = useQueryClient();
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const ui = useUi.getState();

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/ws`);
      ws.onopen = () => ui.setConnected(true);
      ws.onclose = () => {
        useUi.getState().setConnected(false);
        if (!closed) retry = setTimeout(connect, 2500);
      };
      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        const s = useUi.getState();
        if (data.type === "hello") {
          s.setSummary(data.summary);
          s.setEvents(data.events);
        } else if (data.type === "event") {
          s.pushEvent(data.event);
          qc.invalidateQueries({ queryKey: ["events"] });
        } else if (data.type === "risk") {
          s.setSnapshot(data.snapshot);
          s.setSummary(data.summary);
          for (const key of ["graph", "risk", "asset", "timeline", "spof", "drift", "certin", "forecast", "vulns", "feed"]) {
            qc.invalidateQueries({ queryKey: [key] });
          }
        } else if (data.type === "demo") {
          const cur = s.summary;
          if (cur) s.setSummary({ ...cur, demo: data.demo });
        } else if (data.type === "reset") {
          s.setSummary(data.summary);
          s.setEvents([]);
          s.setScenario(null);
          qc.invalidateQueries();
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [qc]);
}
