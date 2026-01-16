// server/core/events/bus.js
// Minimaler async Event-Bus (in-memory), ohne Dependencies.

export class EventBus {
  constructor() {
    this._listeners = new Map();   // eventName -> Set(fn)
    this._anyListeners = new Set(); // fn(eventName, payload, ctx)
  }

  on(eventName, fn) {
    if (!eventName || typeof fn !== "function") return;
    const set = this._listeners.get(eventName) || new Set();
    set.add(fn);
    this._listeners.set(eventName, set);
  }

  off(eventName, fn) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    set.delete(fn);
  }

  onAny(fn) {
    if (typeof fn !== "function") return;
    this._anyListeners.add(fn);
  }

  offAny(fn) {
    this._anyListeners.delete(fn);
  }

  // ctx: { tenantId, user, requestId?, source? ... }
  async emit(eventName, payload = {}, ctx = {}) {
    // Copy => safety against mutations
    const listeners = this._listeners.get(eventName)
      ? Array.from(this._listeners.get(eventName))
      : [];

    const anyListeners = Array.from(this._anyListeners);

    // zuerst spezifische, dann any (damit any "alles" sieht)
    for (const fn of listeners) {
      // jeden Handler awaiten (sauber, deterministisch)
      await fn(payload, ctx);
    }

    for (const fn of anyListeners) {
      await fn(eventName, payload, ctx);
    }
  }
}

// Singleton (ein Bus für die ganze App)
export const events = new EventBus();
