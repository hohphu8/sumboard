export const MAX_ROWS = 500;
export const MAX_FILE_BYTES = 2_000_000;
export const HISTORY_LIMIT = 80;
export const CATEGORIES = ['Không gian', 'Nội dung', 'Ăn uống', 'Vật dụng', 'Khác'];
const ROW_KEYS = ['id', 'name', 'category', 'quantity', 'price', 'included', 'paid'];
const DOC_KEYS = ['format', 'version', 'title', 'budget', 'rows'];
const fail = (message) => { throw new Error(message); };
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} không hợp lệ.`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label} có trường không được hỗ trợ.`);
}
function text(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b-\u001f]/u.test(value)) fail(`${label}: tối đa ${max} ký tự, không chứa ký tự điều khiển.`);
  const normalized = value.trim();
  if (!empty && !normalized) fail(`${label} không được để trống.`);
  return normalized;
}
function integer(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) fail(`${label}: số nguyên từ 0 đến ${max}.`);
  return value;
}
export function quantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000 || Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-7) fail('Số lượng: từ 0 đến 10.000, tối đa 3 chữ số thập phân.');
  return value;
}
export function numericInput(raw, field) {
  const value = String(raw).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/u.test(value)) fail('Nhập số không âm; dùng dấu phẩy hoặc chấm cho phần thập phân, không dùng dấu phân cách hàng nghìn.');
  const number = Number(value);
  return field === 'quantity' ? quantity(number) : integer(number, field === 'budget' ? 1e15 : 1e9, field === 'budget' ? 'Ngân sách' : 'Đơn giá');
}
export function rowTotal(row) {
  // Decimal quantity is represented in thousandths; integer VND rounds half up.
  return Number((BigInt(Math.round(row.quantity * 1000)) * BigInt(row.price) + 500n) / 1000n);
}
export function validateDocument(value) {
  record(value, DOC_KEYS, 'Bảng');
  if (value.format !== 'sumboard' || value.version !== 1) fail('Chỉ hỗ trợ file Sumboard phiên bản 1.');
  if (!Array.isArray(value.rows) || value.rows.length > MAX_ROWS) fail(`Một bảng có tối đa ${MAX_ROWS} dòng.`);
  const ids = new Set();
  const rows = value.rows.map((row, index) => {
    record(row, ROW_KEYS, `Dòng ${index + 1}`);
    if (typeof row.id !== 'string' || !/^r_[a-z0-9-]{1,70}$/u.test(row.id) || ids.has(row.id)) fail(`ID dòng ${index + 1} không hợp lệ hoặc bị trùng.`);
    ids.add(row.id);
    if (typeof row.included !== 'boolean' || typeof row.paid !== 'boolean') fail(`Trạng thái dòng ${index + 1} không hợp lệ.`);
    return Object.freeze({ id: row.id, name: text(row.name, 160, 'Hạng mục'), category: text(row.category, 48, 'Nhóm'), quantity: quantity(row.quantity), price: integer(row.price, 1e9, 'Đơn giá'), included: row.included, paid: row.paid });
  });
  return Object.freeze({ format: 'sumboard', version: 1, title: text(value.title, 100, 'Tên bảng'), budget: integer(value.budget, 1e15, 'Ngân sách'), rows: Object.freeze(rows) });
}
export function blankDocument() { return validateDocument({ format: 'sumboard', version: 1, title: 'Kế hoạch mới', budget: 0, rows: [] }); }
export function sampleDocument() {
  const items = [
    ['Không gian workshop', 'Không gian', 1, 1800000, true],
    ['Hoa & góc check-in', 'Không gian', 1, 650000, false],
    ['Bộ dụng cụ thực hành', 'Nội dung', 20, 85000, false],
    ['Thiệp hướng dẫn', 'Nội dung', 25, 12000, true],
    ['Cà phê & trà', 'Ăn uống', 25, 45000, false],
    ['Bánh ngọt', 'Ăn uống', 25, 30000, false],
    ['Túi giấy mang về', 'Vật dụng', 25, 8000, false],
    ['Chi phí dự phòng', 'Khác', 1, 500000, false],
  ];
  return validateDocument({ format: 'sumboard', version: 1, title: 'Workshop cuối tuần', budget: 8000000, rows: items.map(([name, category, quantity, price, paid], i) => ({ id: `r_sample-${i + 1}`, name, category, quantity, price, paid, included: true })) });
}
export function summarize(rows) {
  let total = 0, paid = 0, included = 0;
  const groups = new Map();
  for (const row of rows) {
    if (!row.included) continue;
    const amount = rowTotal(row);
    included++; total += amount;
    if (row.paid) paid += amount;
    groups.set(row.category, (groups.get(row.category) || 0) + amount);
  }
  return { total, paid, unpaid: total - paid, included, groups: [...groups].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'vi')) };
}
export const normalizeSearch = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/giu, 'd').toLocaleLowerCase('vi');
export function visibleRows(rows, { search = '', category = '', status = '', sort = 'original' } = {}) {
  const query = normalizeSearch(search.trim());
  const selected = rows.filter(row => (!query || normalizeSearch(`${row.name} ${row.category}`).includes(query)) && (!category || row.category === category) && (!status || (status === 'paid' ? row.paid && row.included : status === 'unpaid' ? !row.paid && row.included : !row.included)));
  if (sort === 'name') selected.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (sort === 'amount-desc') selected.sort((a, b) => rowTotal(b) - rowTotal(a));
  if (sort === 'amount-asc') selected.sort((a, b) => rowTotal(a) - rowTotal(b));
  return selected;
}
export function parseDocument(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_FILE_BYTES) fail('File quá lớn. Giới hạn 2 MB.');
  let value;
  try { value = JSON.parse(raw); } catch { fail('File không phải JSON hợp lệ. Bảng đang mở vẫn được giữ nguyên.'); }
  return validateDocument(value);
}
export const exportJSON = (document) => JSON.stringify(validateDocument(document), null, 2) + '\n';
export function exportCSV(document) {
  const safe = value => {
    let text = String(value);
    // Spreadsheet programs may execute formulas after ignoring leading whitespace.
    if (/^[\s]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [['Hạng mục', 'Nhóm', 'Số lượng', 'Đơn giá (VND)', 'Thành tiền (VND)', 'Tính vào tổng', 'Đã thanh toán'], ...document.rows.map(row => [row.name, row.category, row.quantity, row.price, rowTotal(row), row.included ? 'Có' : 'Không', row.paid ? 'Có' : 'Không'])].map(row => row.map(safe).join(',')).join('\r\n') + '\r\n';
}
export class History {
  constructor(document, limit = HISTORY_LIMIT) { this.current = validateDocument(document); this.past = []; this.future = []; this.limit = limit; this.revision = 0; }
  commit(document) {
    const next = validateDocument(document);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next; this.future = []; this.revision++; return true;
  }
  undo() { if (!this.past.length) return false; this.future.push(this.current); this.current = this.past.pop(); this.revision++; return true; }
  redo() { if (!this.future.length) return false; this.past.push(this.current); this.current = this.future.pop(); this.revision++; return true; }
  reset(document) { this.current = validateDocument(document); this.past = []; this.future = []; this.revision++; }
}
