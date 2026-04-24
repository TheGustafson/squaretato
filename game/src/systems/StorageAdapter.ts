import type { SaveData } from '../types';

const STORAGE_KEY = 'squaretato_save';
const LEGACY_KEY = 'roguelikeGameData';
const SAVE_THROTTLE_MS = 500;

export abstract class StorageAdapter {
  abstract load(): SaveData | null;
  abstract save(data: SaveData): void;
  abstract flush(): void;
}

export class LocalStorageAdapter extends StorageAdapter {
  private lastWriteAt = 0;
  private pending: SaveData | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  load(): SaveData | null {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    } catch {
      return null;
    }
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      // Reject non-object / array roots — they cannot be a valid SaveData.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed as SaveData;
    } catch {
      return null;
    }
  }

  // Throttled save. Coalesces bursts (e.g. many kills in a flood wave) into
  // at most one localStorage write per SAVE_THROTTLE_MS, with a trailing flush.
  save(data: SaveData): void {
    this.pending = data;
    const now = Date.now();
    const elapsed = now - this.lastWriteAt;
    if (elapsed >= SAVE_THROTTLE_MS) {
      this.writeNow();
      return;
    }
    if (this.timerId !== null) return;
    const delay = SAVE_THROTTLE_MS - elapsed;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.writeNow();
    }, delay);
  }

  flush(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.pending) this.writeNow();
  }

  private writeNow(): void {
    if (!this.pending) return;
    const data = this.pending;
    this.pending = null;
    this.lastWriteAt = Date.now();
    const envelope = {
      version: data.version,
      settings: data.settings,
      slots: data.slots,
    };
    try {
      const json = JSON.stringify(envelope);
      localStorage.setItem(STORAGE_KEY, json);
      if (localStorage.getItem(LEGACY_KEY)) {
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch {
      // Swallow quota/security errors — next save() attempt will retry.
    }
  }
}
