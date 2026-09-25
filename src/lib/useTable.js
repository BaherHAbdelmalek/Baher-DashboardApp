import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

// Loads a table scoped to the signed-in user, then keeps it live via
// Supabase Realtime — this is what makes edits made on your phone show up
// on your laptop (and vice versa) without a manual refresh.
export function useTable(table, userId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error: err } = await supabase
        .from(table)
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (err) setError(err.message);
      setItems(data || []);
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
  }, [table, userId]);

  const insert = useCallback(
    async (row) => {
      const { error: err } = await supabase.from(table).insert({ ...row, user_id: userId });
      if (err) setError(err.message);
    },
    [table, userId]
  );

  const update = useCallback(
    async (id, patch) => {
      const { error: err } = await supabase.from(table).update(patch).eq("id", id);
      if (err) setError(err.message);
    },
    [table]
  );

  const remove = useCallback(
    async (id) => {
      const { error: err } = await supabase.from(table).delete().eq("id", id);
      if (err) setError(err.message);
    },
    [table]
  );

  return { items, loading, error, insert, update, remove };
}
