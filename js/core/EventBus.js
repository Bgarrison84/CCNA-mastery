/**
 * EventBus.js — Pub/Sub Observer Pattern
 * Decouples modules: XP gain → HUD update, Level Up → notification, etc.
 */
export class EventBus {
  constructor() {
    this._listeners = {};
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data = {}) {
    (this._listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error(`EventBus error on "${event}":`, e); }
    });
  }

  once(event, callback) {
    const unsub = this.on(event, data => { callback(data); unsub(); });
  }
}

// Singleton instance shared across all modules
export const bus = new EventBus();
