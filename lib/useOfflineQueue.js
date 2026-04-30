"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const QUEUE_KEY = "pos_offline_queue";

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function generateId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);

  // Load queue from localStorage on mount
  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  // Online/offline event listeners
  useEffect(() => {
    function onOnline()  { setIsOnline(true); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      const pending = loadQueue().filter((e) => e.status === "pending");
      if (pending.length > 0) {
        syncQueue();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Add a transaction to the offline queue
  const enqueue = useCallback((txData) => {
    const entry = {
      id:        generateId(),
      ...txData,
      queuedAt:  new Date().toISOString(),
      status:    "pending",
    };
    const q = [...loadQueue(), entry];
    saveQueue(q);
    setQueue(q);
    return entry.id;
  }, []);

  // Sync all pending entries to the server
  const syncQueue = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    try {
      let q = loadQueue();
      const pending = q.filter((e) => e.status === "pending");
      for (const entry of pending) {
        try {
          const res = await fetch("/api/transactions", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              items:          entry.items,
              paymentMethod:  entry.paymentMethod,
              discountAmount: entry.discountAmount,
              amountPaid:     entry.amountPaid,
              branchId:       entry.branchId,
              note:           entry.note,
            }),
          });
          q = q.map((e) =>
            e.id === entry.id
              ? { ...e, status: res.ok ? "synced" : "failed", syncedAt: new Date().toISOString() }
              : e
          );
          saveQueue(q);
          setQueue([...q]);
        } catch {
          q = q.map((e) =>
            e.id === entry.id ? { ...e, status: "failed" } : e
          );
          saveQueue(q);
          setQueue([...q]);
        }
      }
    } finally {
      syncRef.current = false;
      setSyncing(false);
    }
  }, []);

  const pendingCount  = queue.filter((e) => e.status === "pending").length;
  const failedCount   = queue.filter((e) => e.status === "failed").length;

  // Clear synced entries older than 24h
  const clearSynced = useCallback(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const q = loadQueue().filter(
      (e) => !(e.status === "synced" && new Date(e.syncedAt).getTime() < cutoff)
    );
    saveQueue(q);
    setQueue(q);
  }, []);

  return { isOnline, queue, pendingCount, failedCount, syncing, enqueue, syncQueue, clearSynced };
}
