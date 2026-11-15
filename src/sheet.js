import Gyos from "gyosjs/csp";
import { History, summarize, visibleRows, MAX_ROWS } from "./model.js";

export function createSheet(initial) {
  const history = new History(initial);
  const document = Gyos.signal(history.current);
  const undoCount = Gyos.signal(0),
    redoCount = Gyos.signal(0);
  const search = Gyos.signal(""),
    category = Gyos.signal(""),
    status = Gyos.signal(""),
    sort = Gyos.signal("original");
  const summary = Gyos.computed(() => summarize(document().rows));
  const visible = Gyos.computed(() =>
    visibleRows(document().rows, {
      search: search(),
      category: category(),
      status: status(),
      sort: sort(),
    }),
  );
  const filteredSummary = Gyos.computed(() => summarize(visible()));
  const pageSize = Gyos.signal(50);
  const requestedPage = Gyos.signal(1);
  const pageCount = Gyos.computed(() => Math.max(1, Math.ceil(visible().length / pageSize())));
  const page = Gyos.computed(() => Math.min(requestedPage(), pageCount()));
  const offset = Gyos.computed(() => (page() - 1) * pageSize());
  const pageRows = Gyos.computed(() => visible().slice(offset(), offset() + pageSize()));
  function goToPage(next) {
    if (!Number.isInteger(next)) return;
    requestedPage(Math.max(1, Math.min(next, pageCount())));
  }
  function revealRow(id) {
    const index = visible().findIndex(row => row.id === id);
    if (index < 0) return false;
    goToPage(Math.floor(index / pageSize()) + 1);
    return true;
  }
  function setPageSize(size) {
    if (![50, 100].includes(size)) return;
    const first = offset();
    Gyos.batch(() => {
      pageSize(size);
      goToPage(Math.floor(first / size) + 1);
    });
  }
  function setQuery(field, value) {
    const target = { search, category, status, sort }[field];
    if (!target) return;
    Gyos.batch(() => { target(value); requestedPage(1); });
  }
  const categories = Gyos.computed(() =>
    [...new Set(document().rows.map((row) => row.category))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    ),
  );
  let changed = () => {},
    disposed = false;
  function publish() {
    Gyos.batch(() => {
      document(history.current);
      // Persist the clamp so undo cannot unexpectedly jump back to an old page.
      requestedPage(page());
      undoCount(history.past.length);
      redoCount(history.future.length);
    });
    changed(history.current);
  }
  function commit(next) {
    if (disposed) return false;
    const result = history.commit(next);
    if (result) publish();
    return result;
  }
  function row(id) {
    const found = history.current.rows.find((row) => row.id === id);
    if (!found) throw Error("Dòng này không còn trong bảng.");
    return found;
  }
  function clearFilters() {
    Gyos.batch(() => {
      search("");
      category("");
      status("");
      requestedPage(1);
    });
  }
  return {
    document,
    undoCount,
    redoCount,
    search,
    category,
    status,
    sort,
    summary,
    visible,
    pageRows,
    page,
    pageSize,
    pageCount,
    offset,
    goToPage,
    revealRow,
    setPageSize,
    setQuery,
    filteredSummary,
    categories,
    get revision() {
      return history.revision;
    },
    onChange(fn) {
      changed = fn;
    },
    row,
    clearFilters,
    updateRow(id, field, value) {
      row(id);
      return commit({
        ...history.current,
        rows: history.current.rows.map((row) =>
          row.id === id ? { ...row, [field]: value } : row,
        ),
      });
    },
    updatePlan(field, value) {
      return commit({ ...history.current, [field]: value });
    },
    add(copyId) {
      if (history.current.rows.length >= MAX_ROWS)
        throw Error(
          `Bảng đã đủ ${MAX_ROWS} dòng. Hãy xuất bản sao và bắt đầu bảng mới.`,
        );
      const id = "r_" + crypto.randomUUID();
      const item = copyId
        ? {
            ...row(copyId),
            id,
            name: row(copyId).name.slice(0, 150) + " (bản sao)",
          }
        : {
            id,
            name: "Hạng mục mới",
            category: "Khác",
            quantity: 1,
            price: 0,
            included: true,
            paid: false,
          };
      commit({ ...history.current, rows: [...history.current.rows, item] });
      clearFilters();
      sort("original");
      return id;
    },
    remove(id) {
      row(id);
      return commit({
        ...history.current,
        rows: history.current.rows.filter((row) => row.id !== id),
      });
    },
    replace(next) {
      return commit(next);
    },
    load(next) {
      if (disposed) return;
      history.reset(next);
      clearFilters();
      sort("original");
      publish();
    },
    undo() {
      if (disposed || !history.undo()) return false;
      publish();
      return true;
    },
    redo() {
      if (disposed || !history.redo()) return false;
      publish();
      return true;
    },
    dispose() {
      disposed = true;
      changed = () => {};
    },
  };
}
