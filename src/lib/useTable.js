import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

// Loads a table scoped to the signed-in user, then keeps it live via
// Supabase Realtime — this is what makes edits made on your phone show up
// on your laptop (and vice versa) without a manual refresh.
//
// Writes are applied locally first and rolled back if the server rejects them,
// so tapping a checkbox feels instant instead of waiting on a round trip.
export function useTable(table, userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Snapshot of the last committed list, used to roll a write back if the
  // server rejects it. Kept in an effect rather than assigned during render so
  // it can never capture a render React threw away.
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const fetchAll = useCallback(async () => {
    const { data, error: err } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (err) { setError(err.message); return false; }
    setItems(data || []);
    return true;
  }, [table, userId]);

  useEffect(() => {
    if (!userId) return;
    let channel;
    let cancelled = false;

    (async () => {
      await fetchAll();
      if (cancelled) return;
      setLoading(false);

      channel = supabase
        .channel(`${table}-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
          (payload) => {
            setItems((prev) => {
              if (payload.eventType === "INSERT") {
                if (prev.some((i) => i.id === payload.new.id)) return prev;
                return [payload.new, ...prev];
              }
              if (payload.eventType === "UPDATE") {
                return prev.map((i) => (i.id === payload.new.id ? payload.new : i));
              }
              if (payload.eventType === "DELETE") {
                return prev.filter((i) => i.id !== payload.old.id);
              }
              return prev;
            });
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [table, userId, fetchAll]);

  // A phone suspends its websocket the moment the app goes to the background,
  // and Realtime events sent in the meantime are simply gone. Re-reading on
  // the way back in is what stops you staring at yesterday's list.
  useEffect(() => {
    if (!userId) return;
    function onVisible() {
      if (document.visibilityState === "visible") fetchAll();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [userId, fetchAll]);

  const insert = useCallback(
    async (row) => {
      const { data, error: err } = await supabase
        .from(table)
        .insert({ ...row, user_id: userId })
        .select()
        .single();
      if (err) { setError(err.message); return null; }
      // Realtime will deliver this too; the id check in the handler dedupes.
      setItems((prev) => (prev.some((i) => i.id === data.id) ? prev : [data, ...prev]));
      return data;
    },
    [table, userId]
  );

  const update = useCallback(
    async (id, patch) => {
      const before = itemsRef.current.find((i) => i.id === id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const { error: err } = await supabase.from(table).update(patch).eq("id", id);
      if (err) {
        setError(err.message);
        if (before) setItems((prev) => prev.map((i) => (i.id === id ? before : i)));
      }
    },
    [table]
  );

  const remove = useCallback(
    async (id) => {
      const before = itemsRef.current;
      setItems((prev) => prev.filter((i) => i.id !== id));
      const { error: err } = await supabase.from(table).delete().eq("id", id);
      if (err) { setError(err.message); setItems(before); }
    },
    [table]
  );

  const clearError = useCallback(() => setError(null), []);

  return { items, loading, error, insert, update, remove, clearError, refresh: fetchAll };
}
