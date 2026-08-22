// Текущее состояние черновика и операции над его структурой.

/** Текущий черновик. Меняется при переключении в боковой панели. */
export let currentDraft = null;

export function setCurrentDraft(draft) {
  currentDraft = draft;
  currentDraft.cases = currentDraft.cases || [];
  currentDraft.bugs = currentDraft.bugs || [];
}

/** Черновик считается пустым, пока в нём нет ни кейсов, ни багов. */
export const isDraftEmpty = (draft = currentDraft) =>
  !draft.cases.length && !draft.bugs.length;

/** Стоит ли вообще создавать файл черновика на сервере. */
export const isDraftWorthSaving = (draft = currentDraft) =>
  !isDraftEmpty(draft) || Boolean(draft._title);

// ─── операции над кейсами и багами ───

export const createTestCase = () => ({
  name: "",
  tasks: [""],
  precondition: [""],
  steps: [""],
  expected: [""],
  expected_images: [],
  result: [""],
  result_images: [],
  status: "",
});

export const createBug = () => ({
  title: "",
  tasks: [""],
  desc: "",
  status: "",
  images: [],
});

// Поля-списки, которые нужно подчищать от пустых пунктов.
const LIST_FIELDS = {
  case: ["tasks", "precondition", "steps", "expected", "result"],
  bug: ["tasks"],
};

/**
 * Убирает пустые пункты из полей-списков всего черновика.
 * Единственный пункт оставляем, даже пустой, — поле не должно исчезать.
 * Вызывается при открытии черновика, чтобы забытые пустые строки не копились.
 */
export function cleanupEmptyListItems(draft) {
  const clean = (items, fields) => {
    for (const item of items) {
      for (const field of fields) {
        const filled = (item[field] || []).filter((value) => value.trim() !== "");
        item[field] = filled.length ? filled : [""];
      }
    }
  };

  clean(draft.cases || [], LIST_FIELDS.case);
  clean(draft.bugs || [], LIST_FIELDS.bug);
}

/** Список кейсов или багов по типу элемента. */
export const itemsOf = (itemType) =>
  itemType === "case" ? currentDraft.cases : currentDraft.bugs;
