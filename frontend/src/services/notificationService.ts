/**
 * NotificationService — Standalone browser notification manager
 *
 * Self-contained: uses Web Notification API exclusively.
 * No external files, no dependencies, no imports required.
 *
 * Portable: copy this single file to any web project and it works.
 *
 * Usage:
 *   const granted = await NotificationService.requestPermission();
 *   NotificationService.show({ title: '...', body: '...', onClick: () => {} });
 *
 * Browser support: Chrome, Firefox, Safari (desktop), Edge.
 * Falls back silently if Notifications are not supported or denied.
 *
 * @version 1.0.0
 * @license MIT
 */

export interface NotifPayload {
  title:    string;
  body?:    string;
  tag?:     string;
  onClick?: () => void;
}

export const NotificationService = {
  get supported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  get permission(): NotificationPermission {
    return this.supported ? Notification.permission : 'denied';
  },

  /**
   * Ask the user for notification permission.
   * Returns true if granted, false otherwise.
   * Safe to call multiple times — no-ops if already decided.
   */
  async requestPermission(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.permission === 'granted') return true;
    if (this.permission === 'denied')  return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  },

  /**
   * Display a browser notification.
   * No-op if permission is not granted or API is unavailable.
   * Auto-closes after 8 seconds.
   */
  show(payload: NotifPayload): void {
    if (!this.supported || this.permission !== 'granted') return;
    try {
      const n = new Notification(payload.title, {
        body:              payload.body,
        tag:               payload.tag,
        icon:              '/favicon.ico',
        requireInteraction: false,
        silent:            false,
      });
      if (payload.onClick) {
        n.onclick = () => {
          window.focus();
          payload.onClick!();
          n.close();
        };
      }
      setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
    } catch {
      /* Silently ignore — notification may fail in some browsers/contexts */
    }
  },
};
