import Gyos from "gyosjs/csp";
import {
  sampleDocument,
  blankDocument,
  numericInput,
  rowTotal,
  parseDocument,
  exportJSON,
  exportCSV,
  MAX_FILE_BYTES,
} from "./model.js";
import { Persistence, STORAGE_KEY } from "./persistence.js";
import { createSheet } from "./sheet.js";
import "./style.css";

const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});
const money = (value) => moneyFormatter.format(value) + " ₫";

Gyos.scope("Sumboard", () => {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const persistence = new Persistence(storage);
  const loaded = persistence.load();
  const sheet = createSheet(loaded.document || sampleDocument());
  const saveState = Gyos.signal(
    loaded.kind === "saved" ? "saved" : loaded.kind === "new" ? "new" : "error",
  );
  const error = Gyos.signal(loaded.kind === "error" ? loaded.message : "");
  const notice = Gyos.signal("");
  const editing = Gyos.signal(false),
    importing = Gyos.signal(false);
  const dialogMode = Gyos.signal(""),
    dialogTitle = Gyos.signal(""),
    dialogText = Gyos.signal("");
  const remaining = Gyos.computed(
    () => sheet.document().budget - sheet.summary().total,
  );
  const progress = Gyos.computed(() =>
    sheet.document().budget > 0
      ? Math.min(100, (sheet.summary().total / sheet.document().budget) * 100)
      : 0,
  );
  const budgetCaption = Gyos.computed(() =>
    sheet.document().budget === 0
      ? "Đặt ngân sách ở phần bên cạnh"
      : "So với ngân sách " + money(sheet.document().budget),
  );
  const budgetMessage = Gyos.computed(() =>
    sheet.document().budget === 0
      ? "Đặt một giới hạn để theo dõi chi phí."
      : remaining() < 0
        ? "Cần cân đối thêm " + money(-remaining())
        : "Còn dư " + money(remaining()) + " cho ý tưởng khác.",
  );
  const emptyTitle = Gyos.computed(() =>
    sheet.document().rows.length === 0
      ? "Chỗ cho kế hoạch mới."
      : "Chưa tìm thấy hạng mục.",
  );
  const emptyText = Gyos.computed(() =>
    sheet.document().rows.length === 0
      ? "Thêm khoản đầu tiên, những con số còn lại sẽ tự nối tiếp."
      : "Thử một từ khóa khác hoặc bỏ bộ lọc đang dùng.",
  );
  const saveLabel = Gyos.computed(() =>
    editing()
      ? "Đang sửa ô · Enter để ghi"
      : {
          saved: "Đã lưu trên máy này",
          new: "Bảng mẫu · chưa lưu",
          error: "Chưa lưu · cần xử lý",
          conflict: "Có bản lưu khác · đang tạm dừng",
        }[saveState()],
  );
  let alive = true,
    generation = 0,
    pending = null,
    returnFocus = null;
  const lifetime = new AbortController();
  const urls = new Set(),
    timers = new Set();
  const app = () => document.getElementById("app");
  const dialog = () => document.getElementById("sheet-dialog");
  function report(message) {
    error(message);
    notice("");
  }
  function save(doc, force = false) {
    const result = persistence.save(doc, force);
    saveState(result.kind);
    if (result.kind === "error")
      report(
        "Trình duyệt không lưu được dữ liệu. Hãy xuất JSON để giữ một bản sao; bạn vẫn có thể tiếp tục sửa.",
      );
    if (result.kind === "conflict")
      report(
        "Bản lưu đã thay đổi hoặc chưa đọc được. Tự lưu đang tạm dừng để không ghi đè dữ liệu khác.",
      );
    return result.kind === "saved";
  }
  sheet.onChange((doc) => {
    editing(false);
    save(doc);
  });
  function action(fn) {
    if (!alive) return false;
    error("");
    try {
      return fn();
    } catch (problem) {
      report(problem.message);
      return false;
    }
  }
  function focusCell(id, field = "name") {
    queueMicrotask(() => {
      if (!alive) return;
      const target = app().querySelector(
        `[data-row="${id}"] [data-field="${field}"]`,
      );
      target?.focus();
      target?.select?.();
    });
  }
  function editCell(event, id, field) {
    if (!alive) return false;
    const target = event.target;
    // Enter commits before moving focus; the following native change is a no-op.
    // Do not clear a storage failure produced by the first commit.
    if (target.value === String(sheet.row(id)[field])) {
      editing(false);
      return true;
    }
    let success = true;
    action(() => {
      try {
        const value = ["quantity", "price"].includes(field)
          ? numericInput(target.value, field)
          : target.value;
        sheet.updateRow(id, field, value);
        target.value = String(sheet.row(id)[field]);
        target.removeAttribute("aria-invalid");
      } catch (problem) {
        target.value = String(sheet.row(id)[field]);
        target.setAttribute("aria-invalid", "true");
        success = false;
        throw problem;
      } finally {
        editing(false);
      }
    });
    return success;
  }
  function editPlan(event, field) {
    action(() => {
      try {
        sheet.updatePlan(
          field,
          field === "budget"
            ? numericInput(event.target.value, field)
            : event.target.value,
        );
      } finally {
        event.target.value = String(sheet.document()[field]);
        editing(false);
      }
    });
  }
  function close() {
    generation++;
    importing(false);
    pending = null;
    dialog()?.close();
    dialogMode("");
    if (returnFocus?.isConnected) returnFocus.focus();
  }
  function open(mode, title, detail, callback, trigger) {
    if (!alive) return;
    generation++;
    importing(false);
    pending = callback;
    returnFocus = trigger || document.activeElement;
    Gyos.batch(() => {
      dialogMode(mode);
      dialogTitle(title);
      dialogText(detail);
    });
    dialog().showModal();
  }
  function replacePlan(next, message) {
    sheet.replace(next);
    sheet.clearFilters();
    sheet.sort("original");
    notice(message);
  }
  function download(content, suffix, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sumboard-${new Date().toISOString().slice(0, 10)}.${suffix}`;
    link.click();
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
      timers.delete(timer);
    }, 10000);
    timers.add(timer);
    notice(
      `Đã tạo bản xuất ${suffix.toUpperCase()} từ toàn bộ bảng. Kiểm tra thư mục tải xuống.`,
    );
  }
  function exportFile(kind) {
    action(() =>
      download(
        kind === "csv"
          ? exportCSV(sheet.document())
          : exportJSON(sheet.document()),
        kind,
        kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
      ),
    );
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !alive) return;
    if (file.size > MAX_FILE_BYTES) {
      report("File quá lớn. Giới hạn 2 MB.");
      return;
    }
    const current = ++generation,
      revision = sheet.revision;
    importing(true);
    error("");
    try {
      const raw = await file.text();
      if (!alive || current !== generation) return;
      if (revision !== sheet.revision || editing()) {
        report(
          "Bảng đã thay đổi khi đang đọc file. Hãy chọn lại file khi sửa xong.",
        );
        return;
      }
      const next = parseDocument(raw);
      open(
        "confirm",
        "Thay bảng bằng file nhập?",
        `${next.title} · ${next.rows.length} dòng. Bạn có thể hoàn tác sau khi nhập.`,
        () =>
          replacePlan(
            next,
            "Đã nhập bảng. Có thể hoàn tác để trở về bản trước.",
          ),
        event.target,
      );
    } catch (problem) {
      if (alive && current === generation) report(problem.message);
    } finally {
      if (alive && current === generation) importing(false);
    }
  }
  function restore(event) {
    open(
      "confirm",
      "Mở bản lưu trên máy?",
      "Bản đang mở và lịch sử hoàn tác sẽ được thay thế. Hãy xuất JSON trước nếu muốn giữ lại.",
      () => {
        const saved = persistence.load();
        if (saved.kind === "error") {
          saveState("error");
          report(saved.message);
          return;
        }
        sheet.load(saved.document || blankDocument());
        notice("Đã mở bản lưu trên máy.");
      },
      event?.currentTarget,
    );
  }
  return {
    budgetCaption,
    budgetMessage,
    emptyTitle,
    emptyText,
    doc: sheet.document,
    summary: sheet.summary,
    visible: sheet.visible,
    filtered: sheet.filteredSummary,
    categories: sheet.categories,
    search: sheet.search,
    category: sheet.category,
    status: sheet.status,
    sort: sheet.sort,
    undoCount: sheet.undoCount,
    redoCount: sheet.redoCount,
    remaining,
    progress,
    saveState,
    saveLabel,
    error,
    notice,
    importing,
    dialogMode,
    dialogTitle,
    dialogText,
    money,
    amount: rowTotal,
    percent(value) {
      return sheet.summary().total > 0
        ? Math.round((value / sheet.summary().total) * 100)
        : 0;
    },
    draft() {
      editing(true);
    },
    editCell,
    editPlan,
    cellKey(event, id, field) {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.target.value = String(sheet.row(id)[field]);
        event.target.removeAttribute("aria-invalid");
        editing(false);
        error("");
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const ids = sheet.visible().map((row) => row.id),
          position = ids.indexOf(id);
        if (editCell(event, id, field))
          focusCell(ids[position + (event.shiftKey ? -1 : 1)] || id, field);
      }
    },
    planKey(event, field) {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.target.blur();
      }
      if (event.key === "Escape") {
        event.target.value = String(sheet.document()[field]);
        editing(false);
        error("");
      }
    },
    toggle(event, id, field) {
      action(() => sheet.updateRow(id, field, event.target.checked));
    },
    add() {
      action(() => {
        const id = sheet.add();
        notice("Đã thêm dòng. Bộ lọc đã được bỏ để hiện dòng mới.");
        focusCell(id);
      });
    },
    duplicate(id) {
      action(() => {
        const next = sheet.add(id);
        notice("Đã nhân đôi dòng.");
        focusCell(next);
      });
    },
    remove(id) {
      action(() => {
        const ids = sheet.visible().map((row) => row.id),
          index = ids.indexOf(id);
        sheet.remove(id);
        notice("Đã xóa dòng. Dùng Hoàn tác để lấy lại.");
        const next = ids[index + 1] || ids[index - 1];
        if (next) focusCell(next);
        else
          queueMicrotask(() => {
            if (alive) document.getElementById("add-row").focus();
          });
      });
    },
    undo() {
      action(() => {
        if (sheet.undo()) notice("Đã hoàn tác thay đổi.");
      });
    },
    redo() {
      action(() => {
        if (sheet.redo()) notice("Đã làm lại thay đổi.");
      });
    },
    clearFilters: sheet.clearFilters,
    reset(event) {
      open(
        "confirm",
        "Bắt đầu bảng trống?",
        "Bảng hiện tại sẽ được thay thế. Bạn vẫn có thể hoàn tác, hoặc xuất JSON trước để giữ bản sao.",
        () => replacePlan(blankDocument(), "Đã tạo bảng trống."),
        event?.currentTarget,
      );
    },
    sample(event) {
      open(
        "confirm",
        "Mở lại bảng mẫu?",
        "Thay bảng đang mở bằng workshop mẫu. Bạn có thể hoàn tác.",
        () => replacePlan(sampleDocument(), "Đã mở bảng mẫu."),
        event?.currentTarget,
      );
    },
    help(event) {
      open(
        "help",
        "Một bảng gọn, một kế hoạch rõ.",
        "",
        null,
        event?.currentTarget,
      );
    },
    close,
    confirm() {
      const callback = pending;
      close();
      action(() => callback?.());
    },
    exportFile,
    importFile,
    restore,
    overwrite(event) {
      open(
        "confirm",
        "Ghi bản đang mở lên máy?",
        "Thao tác này ghi đè bản lưu cũ hoặc bản từ tab khác. Xuất JSON trước nếu bạn cần giữ cả hai.",
        () => {
          if (save(sheet.document(), true)) {
            error("");
            notice("Đã ghi bản đang mở lên máy.");
          }
        },
        event?.currentTarget,
      );
    },
    onMount() {
      const signal = lifetime.signal;
      dialog().addEventListener(
        "cancel",
        (event) => {
          event.preventDefault();
          close();
        },
        { signal },
      );
      window.addEventListener(
        "storage",
        (event) => {
          if (
            (event.key === STORAGE_KEY || event.key === null) &&
            persistence.changed()
          ) {
            persistence.blocked = true;
            saveState("conflict");
            report(
              "Một tab khác vừa thay đổi bản lưu. Bảng đang mở vẫn được giữ; chọn bản muốn tiếp tục.",
            );
          }
        },
        { signal },
      );
      document.addEventListener(
        "keydown",
        (event) => {
          if (
            event.isComposing ||
            dialog().open ||
            !(event.ctrlKey || event.metaKey)
          )
            return;
          const input = event.target.closest?.(
            "input, textarea, select, [contenteditable]",
          );
          if (event.key.toLowerCase() === "s") {
            event.preventDefault();
            document.activeElement?.blur();
            exportFile("json");
            return;
          }
          if (input) return; // Preserve native text undo while editing.
          if (event.key.toLowerCase() === "z") {
            event.preventDefault();
            action(() => (event.shiftKey ? sheet.redo() : sheet.undo()));
          }
          if (event.key.toLowerCase() === "y") {
            event.preventDefault();
            action(() => sheet.redo());
          }
        },
        { signal },
      );
      window.addEventListener(
        "beforeunload",
        (event) => {
          if (editing() || ["error", "conflict"].includes(saveState())) {
            event.preventDefault();
            event.returnValue = "";
          }
        },
        { signal },
      );
      if (import.meta.env.DEV)
        window.__sumboard = {
          snapshot: () => structuredClone(sheet.document()),
          dispose: () => Gyos.cleanup(app()),
          version: Gyos.version,
        };
    },
    onUnmount() {
      alive = false;
      generation++;
      pending = null;
      sheet.dispose();
      lifetime.abort();
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
      dialog()?.close();
      if (import.meta.env.DEV) delete window.__sumboard;
    },
  };
});
Gyos.mountAll();
