/**
 * useSignalAlert — Global hook for signal sound + notification alerts
 *
 * Polls the signals API every POLL_INTERVAL_MS and triggers:
 *   - AudioService.playSignalAlert()       if soundEnabled
 *   - NotificationService.show(...)        if notifEnabled
 *
 * Only fires for signals with accepted=true and mode in (paper, live).
 * Skips the very first fetch (initialization) to avoid false alerts on load.
 *
 * Dependencies: AudioService, NotificationService, api
 */

import { useEffect, useRef } from 'react';
import { api } from '../services/api';
import type { Signal } from '../services/api';
import { AudioService } from '../services/audioService';
import { NotificationService } from '../services/notificationService';

const POLL_INTERVAL_MS = 15_000;

function buildNotifPayload(sig: Signal): { title: string; body: string } {
  const dirIcon  = sig.direction === 'LONG' ? '🟢' : sig.direction === 'SHORT' ? '🔴' : '⚡';
  const modeTag  = sig.mode === 'live' ? '🔴 Live' : '📋 Paper';
  const title    = `${dirIcon} Signal accepté — ${sig.symbol} ${sig.direction ?? ''}`.trim();

  const parts: string[] = [modeTag];
  if (sig.entry_price) parts.push(`Entry: ${sig.entry_price.toFixed(4)}`);
  if (sig.tp_price)    parts.push(`TP: ${sig.tp_price.toFixed(4)}`);
  if (sig.sl_price)    parts.push(`SL: ${sig.sl_price.toFixed(4)}`);
  if (sig.session_name) parts.push(sig.session_name);

  return { title, body: parts.join(' · ') };
}

export function useSignalAlert(
  soundEnabled:    boolean,
  notifEnabled:    boolean,
  onNavigate?:     () => void,
): void {
  const lastIdRef      = useRef<number>(-1);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await api.signals('?accepted=true&mode=paper,live&limit=10');
        const rows: Signal[] = result?.rows ?? [];

        const livePaper = rows.filter(
          s => s.accepted && (s.mode === 'paper' || s.mode === 'live'),
        );
        if (livePaper.length === 0) return;

        const maxId = Math.max(...livePaper.map(s => s.id));

        if (!initializedRef.current) {
          lastIdRef.current      = maxId;
          initializedRef.current = true;
          return;
        }

        const newSignals = livePaper.filter(s => s.id > lastIdRef.current);
        if (newSignals.length === 0) return;

        lastIdRef.current = maxId;

        if (soundEnabled) {
          AudioService.playSignalAlert();
        }

        if (notifEnabled) {
          for (const sig of newSignals.slice(0, 3)) {
            const { title, body } = buildNotifPayload(sig);
            NotificationService.show({
              title,
              body,
              tag:     `signal-${sig.id}`,
              onClick: onNavigate,
            });
          }
        }
      } catch {
        /* poll errors are non-fatal — ignore silently */
      }
    };

    poll();
    const timerId = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [soundEnabled, notifEnabled, onNavigate]);
}
