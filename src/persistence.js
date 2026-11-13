import { parseDocument, exportJSON } from './model.js';
export const STORAGE_KEY = 'sumboard.document.v1';

// Compare-before-write prevents a stale tab overwriting a newer observed save.
// localStorage is not transactional: simultaneous writes remain a documented limit.
export class Persistence {
  constructor(storage) { this.storage = storage; this.expected = null; this.blocked = false; }
  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      this.expected = raw;
      const document = raw === null ? null : parseDocument(raw);
      this.blocked = false;
      return { kind: document ? 'saved' : 'new', document };
    } catch (error) { this.blocked = true; return { kind: 'error', message: 'Không đọc được bản lưu. Bản gốc chưa bị ghi đè; bạn có thể xuất bảng đang mở hoặc chọn ghi lại.', error }; }
  }
  changed() {
    try { return this.storage.getItem(STORAGE_KEY) !== this.expected; } catch { return true; }
  }
  save(document, force = false) {
    try {
      if (!force && (this.blocked || this.changed())) { this.blocked = true; return { kind: 'conflict' }; }
      const raw = exportJSON(document);
      this.storage.setItem(STORAGE_KEY, raw);
      this.expected = raw; this.blocked = false;
      return { kind: 'saved' };
    } catch { this.blocked = true; return { kind: 'error' }; }
  }
}
