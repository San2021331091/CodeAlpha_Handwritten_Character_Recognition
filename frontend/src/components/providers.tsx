"use client";
import { FC, JSX, useEffect, useRef, useState } from "react";
import { Provider } from "react-redux";
import {
  makeStore,
  loadLab,
  restoreHistory,
  useAppSelector,
  type AppStore,
} from "@/lib/store";
import type { HistoryItem } from "@/lib/types";

const Persistence: FC<{ store: AppStore }> = ({ store }) => {
  const history = useAppSelector((s) => s.lab.history);
  const [ready, setReady] = useState<boolean>(false);
  useEffect((): void => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("inklab-history-v1") || "[]",
      );
      if (Array.isArray(saved))
        store.dispatch(
          restoreHistory(
            saved.filter(
              (item): item is HistoryItem =>
                item &&
                typeof item.id === "string" &&
                typeof item.prediction === "string" &&
                typeof item.timestamp === "string" &&
                typeof item.source === "string" &&
                typeof item.image === "string" &&
                item.image.startsWith("data:image/") &&
                typeof item.confidence === "number" &&
                typeof item.latency_ms === "number",
            ),
          ),
        );
    } catch (e) {
      console.error(e);
    }
    setReady(true);
    void store.dispatch(loadLab());
  }, [store]);
  useEffect(():void => {
    if (ready) {
      try {
        localStorage.setItem("inklab-history-v1", JSON.stringify(history));
      } catch(err) {
        console.error(err)
      }
    }
  }, [history, ready]);
  return null;
};
export const Providers:FC< { children: React.ReactNode }> = ({ children }):JSX.Element =>{
  const store = useRef<AppStore | null>(null);
  if (!store.current) store.current = makeStore();
  return (
    <Provider store={store.current}>
      <Persistence store={store.current} />
      {children}
    </Provider>
  );
}
