"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "./ui";
type Resource = { id: string; revision: number; updatedAt: string };
export function useAutosave<T extends Resource>(
  initial: T,
  endpoint: string,
  onSaved: (v: T) => void,
  beforeNavigate: RefObject<(() => Promise<boolean>) | null>,
) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const current = useRef(initial);
  const dirty = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!dirty.current) return true;
    const run = async () => {
      setState("saving");
      setError("");
      while (dirty.current) {
        const sent = current.current;
        const version = generation.current;
        try {
          const result = await api<T>(endpoint, "PUT", sent);
          current.current = {
            ...current.current,
            revision: result.revision,
            updatedAt: result.updatedAt,
          };
          setValue(current.current);
          savedCallback.current(result);
          dirty.current = generation.current !== version;
        } catch (e) {
          setState("error");
          setError((e as Error).message);
          return false;
        }
      }
      setState("saved");
      return true;
    };
    inFlight.current = run();
    try {
      return await inFlight.current;
    } finally {
      inFlight.current = null;
    }
  }, [endpoint]);
  const change = useCallback(
    (patch: Partial<T>) => {
      current.current = { ...current.current, ...patch };
      generation.current++;
      dirty.current = true;
      setValue(current.current);
      setState("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, 900);
    },
    [flush],
  );
  useEffect(() => {
    beforeNavigate.current = flush;
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", key);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (beforeNavigate.current === flush) beforeNavigate.current = null;
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", key);
    };
  }, [beforeNavigate, flush]);
  return { value, change, flush, state, error, getCurrent: () => current.current };
}
