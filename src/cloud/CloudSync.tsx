import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  getWatchlistSnapshot,
  replaceWatchlistFromCloud,
  setWatchlistCloudAdapter,
} from '@/data/store';
import {
  clearRemoteAlerts,
  replaceAlertsFromCloud,
  setAlertsCloudAdapter,
} from '@/features/alerts/alertsStore';
import { apiFetch } from '@/live/apiClient';
import type { AlertsResponse, ServerPriceAlert, WatchlistResponse } from '@/shared/api';
import { useAuth } from './AuthProvider.js';
import { getSupabaseBrowserClient } from './supabase.js';

function sameSymbols(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((symbol, index) => symbol === b[index]);
}

function mergeSymbols(local: readonly string[], remote: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([...local, ...remote])].slice(0, 100));
}

export default function CloudSync() {
  const { accessToken, user } = useAuth();

  useEffect(() => {
    if (!accessToken || !user) {
      setWatchlistCloudAdapter(null);
      setAlertsCloudAdapter(null);
      clearRemoteAlerts();
      return;
    }

    let active = true;
    let initialised = false;
    let interval: number | undefined;
    let channel: RealtimeChannel | null = null;
    let watchlistRequest = 0;
    let alertsRequest = 0;

    const loadWatchlist = async (mergeInitial = false) => {
      const request = ++watchlistRequest;
      const remote = await apiFetch<WatchlistResponse>('/api/watchlist', {}, accessToken);
      if (!active || request !== watchlistRequest) return;
      if (mergeInitial && !initialised) {
        const merged = mergeSymbols(getWatchlistSnapshot(), remote.symbols);
        replaceWatchlistFromCloud(merged);
        if (!sameSymbols(merged, remote.symbols)) {
          await apiFetch<WatchlistResponse>(
            '/api/watchlist',
            { method: 'PUT', body: JSON.stringify({ symbols: merged }) },
            accessToken,
          );
        }
      } else {
        replaceWatchlistFromCloud(remote.symbols);
      }
      if (!active || request !== watchlistRequest) return;
      initialised = true;
    };

    const loadAlerts = async () => {
      const request = ++alertsRequest;
      const response = await apiFetch<AlertsResponse>('/api/alerts', {}, accessToken);
      if (active && request === alertsRequest) replaceAlertsFromCloud(response.alerts);
    };

    setWatchlistCloudAdapter({
      save: async (symbols) => {
        watchlistRequest += 1;
        await apiFetch<WatchlistResponse>(
          '/api/watchlist',
          { method: 'PUT', body: JSON.stringify({ symbols }) },
          accessToken,
        );
      },
    });

    setAlertsCloudAdapter({
      create: async (input) => {
        alertsRequest += 1;
        const response = await apiFetch<{ requestId: string; alert: ServerPriceAlert }>(
          '/api/alerts',
          { method: 'POST', body: JSON.stringify(input) },
          accessToken,
        );
        return response.alert;
      },
      remove: async (id) => {
        alertsRequest += 1;
        await apiFetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, accessToken);
      },
      markSeen: async () => {
        alertsRequest += 1;
        await apiFetch('/api/alerts', {
          method: 'PATCH',
          body: JSON.stringify({ action: 'seen' }),
        }, accessToken);
      },
    });

    const client = getSupabaseBrowserClient();
    const start = async () => {
      try {
        await Promise.all([loadWatchlist(true), loadAlerts()]);
      } catch (error: unknown) {
        console.warn('[cloud-sync-initial]', error);
      }
      if (!active) return;

      interval = window.setInterval(() => {
        void Promise.all([loadWatchlist(false), loadAlerts()]).catch((error: unknown) => {
          console.warn('[cloud-sync-poll]', error);
        });
      }, 60_000);

      channel = client
        ?.channel(`pf-cloud-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'watchlists', filter: `user_id=eq.${user.id}` },
          () => void loadWatchlist(false),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'price_alerts', filter: `user_id=eq.${user.id}` },
          () => void loadAlerts(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'alert_deliveries', filter: `user_id=eq.${user.id}` },
          () => void loadAlerts(),
        )
        .subscribe() ?? null;
    };

    void start();

    return () => {
      active = false;
      watchlistRequest += 1;
      alertsRequest += 1;
      if (interval !== undefined) window.clearInterval(interval);
      setWatchlistCloudAdapter(null);
      setAlertsCloudAdapter(null);
      if (channel && client) void client.removeChannel(channel);
    };
  }, [accessToken, user]);

  return null;
}
