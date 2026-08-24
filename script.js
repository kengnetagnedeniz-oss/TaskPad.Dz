/* 1. RÉFÉRENCES AUX ÉLÉMENTS DU DOM */

const taskListEl = document.getElementById("task-list");
const taskInputEl = document.getElementById("task-input");
const prioritySelectEl = document.getElementById("priority-select");
const dateInputEl = document.getElementById("date-input");
const addBtnEl = document.getElementById("add-btn");

const shownCountEl = document.getElementById("shown-count");
const completeCountEl = document.getElementById("complete-count");
const clearCompletedEl = document.getElementById("clear-completed");
const successBannerEl = document.getElementById("success-banner");
const emptyStateEl = document.getElementById("empty-state");

const viewTitleEl = document.getElementById("view-title");
const viewButtons = document.querySelectorAll(".view-item");

const searchInputEl = document.getElementById("search-input");
const sortSelectEl = document.getElementById("sort-select");

const themeToggleEl = document.getElementById("theme-toggle");

const ringFillEl = document.querySelector(".ring-fill");
const progressValueEl = document.getElementById("progress-value");

//  la date affichée sous "All tasks" / "Active" / "Completed"
const viewDateEl = document.getElementById("view-date");

//  toast d'annulation
const toastEl = document.getElementById("toast");
const toastMessageEl = document.getElementById("toast-message");
const toastUndoEl = document.getElementById("toast-undo");


/* 2. PERSISTANCE — clés et fonctions de lecture/écriture */

const TASKS_KEY = "taskpad.tasks";
const SESSION_KEY = "taskpad.session";
const THEME_KEY = "taskpad.theme";

function loadTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Lecture des tâches impossible, on repart à vide :", err);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { view: "all", draft: "" };
    const parsed = JSON.parse(raw);
    return {
      view: parsed.view || "all",
      draft: parsed.draft || "",
    };
  } catch (err) {
    console.error("Lecture de la session impossible, valeurs par défaut :", err);
    return { view: "all", draft: "" };
  }
}

function saveSession() {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      view: currentView,
      draft: taskInputEl.value,
    })
  );
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light";
}

function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleEl.textContent = theme === "dark" ? "☀️" : "🌙";
  // NOUVEAU : aria-pressed + aria-label reflètent l'état pour un lecteur d'écran
  themeToggleEl.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  themeToggleEl.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}


/* 3. L'ÉTAT (state)*/

let tasks = loadTasks();
let nextId = tasks.length ? Math.max(...tasks.map((t) => t.id)) + 1 : 1;

const session = loadSession();
let currentView = session.view;

let searchQuery = "";
let sortBy = "created";

let currentTheme = loadTheme();
applyTheme(currentTheme);

// Nmémorise la dernière suppression (tâche seule ou lot "clear
// completed") pour permettre l'annulation depuis le toast.
let lastRemoved = null; // { type: "single"|"clear", tasks: [...], index?: number }
let toastTimer = null;


/*  4. CRÉATION D'UN <li> À PARTIR D'UNE TÂCHE */


function formatFullDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

// compare la date d'échéance ("YYYY-MM-DD") à aujourd'hui et
// renvoie un statut. Tout est comparé en chaînes "YYYY-MM-DD", qui se
// trient/comparent correctement sans avoir besoin d'objets Date.
function getDueStatus(dateStr) {
  if (!dateStr) return null;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (dateStr === todayStr) return { status: "today", label: "Today" };
  if (dateStr === tomorrowStr) return { status: "tomorrow", label: "Tomorrow" };
  if (dateStr < todayStr) return { status: "overdue", label: "Overdue" };
  return { status: "future", label: dateStr };
}

const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

function createTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.done ? " done" : "");
  li.dataset.id = task.id;
  li.dataset.priority = task.priority;

  const checkBtn = document.createElement("button");
  checkBtn.className = "task-check";
  checkBtn.type = "button";
  checkBtn.textContent = "✓";
  checkBtn.dataset.action = "toggle";
  //libellé explicite pour un lecteur d'écran (le ✓ seul ne
  // dit pas "coché" ou "à faire")
  checkBtn.setAttribute(
    "aria-label",
    task.done ? `Mark "${task.text}" as not done` : `Mark "${task.text}" as done`
  );

  const dot = document.createElement("span");
  dot.className = "task-dot";
  dot.setAttribute("aria-hidden", "true"); // décoratif : le texte à côté porte déjà l'info

  const textEl = document.createElement("span");
  textEl.className = "task-text";
  textEl.textContent = task.text;
  textEl.dataset.action = "edit-start";

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "task-edit-input";
  editInput.value = task.text;
  editInput.hidden = true;
  editInput.setAttribute("aria-label", "Edit task text");

  // texte de priorité (le point coloré seul ne suffit pas
  // pour quelqu'un qui distingue mal les couleurs, ou pour un lecteur d'écran)
  const priorityLabelEl = document.createElement("span");
  priorityLabelEl.className = "task-priority-label";
  priorityLabelEl.textContent = PRIORITY_LABELS[task.priority] || "";

  // date de création, toujours affichée (jour/mois/année complets)
  const createdEl = document.createElement("span");
  createdEl.className = "task-created";
  createdEl.textContent = task.createdAt ? `Created ${formatFullDate(task.createdAt)}` : "";

  // badge d'échéance (Today / Tomorrow / Overdue / date brute)
  const dueInfo = getDueStatus(task.date);
  const dueEl = document.createElement("span");
  dueEl.className = "task-due";
  if (dueInfo) {
    dueEl.textContent = dueInfo.label;
    dueEl.dataset.due = dueInfo.status;
  } else {
    dueEl.hidden = true; // pas de date d'échéance -> rien à afficher
  }

  const editBtn = document.createElement("button");
  editBtn.className = "task-edit-btn";
  editBtn.type = "button";
  editBtn.textContent = "✎";
  editBtn.title = "Edit";
  editBtn.dataset.action = "edit-start";
  editBtn.setAttribute("aria-label", `Edit "${task.text}"`);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "task-delete-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "✕";
  deleteBtn.title = "Delete";
  deleteBtn.dataset.action = "delete";
  deleteBtn.setAttribute("aria-label", `Delete "${task.text}"`);

  // MODIFIÉ : la ligne principale regroupe tout SAUF la date de création,
  // qui doit apparaître seule, en dessous — pas à côté du badge d'échéance.
  const mainRow = document.createElement("div");
  mainRow.className = "task-main";
  mainRow.append(checkBtn, dot, textEl, editInput, priorityLabelEl, dueEl, editBtn, deleteBtn);

  li.append(mainRow, createdEl);

  return li;
}


/* 5. render() — LA FONCTION CENTRALE */

function render() {
  viewButtons.forEach((btn) => {
    const isActive = btn.dataset.view === currentView;
    btn.classList.toggle("active", isActive);
    // aria-pressed suit l'état visuel, pour un lecteur d'écran
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (currentView === "active") {
    viewTitleEl.textContent = "Active";
  } else if (currentView === "completed") {
    viewTitleEl.textContent = "Completed";
  } else {
    viewTitleEl.textContent = "All tasks";
  }

  let visibleTasks = tasks.filter((task) => {
    if (currentView === "active") return !task.done;
    if (currentView === "completed") return task.done;
    return true;
  });

  if (searchQuery !== "") {
    const q = searchQuery.toLowerCase();
    visibleTasks = visibleTasks.filter((task) =>
      task.text.toLowerCase().includes(q)
    );
  }

  visibleTasks = sortTasks(visibleTasks.slice());

  taskListEl.replaceChildren();
  visibleTasks.forEach((task) => {
    const li = createTaskElement(task);
    taskListEl.appendChild(li);
  });

  updateStatsAndMessages(visibleTasks);
  updateProgressRing();
  saveTasks();
}

function sortTasks(list) {
  if (sortBy === "due") {
    return list.sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
  }

  if (sortBy === "priority") {
    const weight = { high: 3, medium: 2, low: 1 };
    return list.sort((a, b) => (weight[b.priority] || 0) - (weight[a.priority] || 0));
  }

  return list;
}

function updateStatsAndMessages(visibleTasks) {
  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;
  const activeCount = total - doneCount;

  shownCountEl.textContent = visibleTasks.length;
  completeCountEl.textContent = doneCount;
  clearCompletedEl.textContent = `Clear completed (${doneCount})`;
  // NOUVEAU : bouton désactivé s'il n'y a rien à effacer (évite un clic inutile)
  clearCompletedEl.disabled = doneCount === 0;

  viewButtons.forEach((btn) => {
    const countEl = btn.querySelector(".view-count");
    if (btn.dataset.view === "all") countEl.textContent = total;
    if (btn.dataset.view === "active") countEl.textContent = activeCount;
    if (btn.dataset.view === "completed") countEl.textContent = doneCount;
  });

  //  la bannière de félicitation
  const allDone = total > 0 && doneCount === total;
  successBannerEl.hidden = !allDone;

  emptyStateEl.hidden = visibleTasks.length !== 0;
}

const RING_CIRCUMFERENCE = 163;

function updateProgressRing() {
  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const offset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * percent) / 100;

  ringFillEl.style.strokeDashoffset = offset;
  progressValueEl.textContent = `${percent}%`;

  // couleur de l'anneau
  const hue = (percent / 100) * 120;
  ringFillEl.style.stroke = `hsl(${hue}, 72%, 45%)`;
}


/* 6. NOUVEAU — TOAST D'ANNULATION */


function showUndoToast(message, onUndo) {
  // Si un toast précédent était encore affiché, on l'annule proprement
  // avant d'en montrer un nouveau (évite deux timers qui se chevauchent).
  if (toastTimer) clearTimeout(toastTimer);

  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  lastRemoved = { onUndo };

  toastTimer = setTimeout(() => {
    hideToast();
  }, 5000);
}

function hideToast() {
  toastEl.hidden = true;
  lastRemoved = null;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

toastUndoEl.addEventListener("click", () => {
  if (lastRemoved && lastRemoved.onUndo) {
    lastRemoved.onUndo();
  }
  hideToast();
});


/* 7. AJOUT D'UNE TÂCHE (avec validation) */

function addTask() {
  const rawText = taskInputEl.value;
  const text = rawText.trim();

  if (text === "") {
    showInputError();
    return;
  }

  tasks.push({
    id: nextId++,
    text: text,
    done: false,
    priority: prioritySelectEl.value === "none" ? null : prioritySelectEl.value,
    date: dateInputEl.value || "",
    createdAt: new Date().toISOString(), // NOUVEAU : horodatage de création
  });

  taskInputEl.value = "";
  dateInputEl.value = "";
  prioritySelectEl.value = "none";
  taskInputEl.focus();

  saveSession();
  render();
}

function showInputError() {
  taskInputEl.classList.add("input-error");
  taskInputEl.focus();
  setTimeout(() => {
    taskInputEl.classList.remove("input-error");
  }, 250);
}


/* 8. COCHER / DÉCOCHER, SUPPRIMER, ÉDITER */

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  render();
}

// la suppression garde une copie de la tâche + sa position,
// et propose l'annulation via le toast.
function deleteTask(id) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  const [removedTask] = tasks.splice(index, 1); // retire ET récupère l'élément retiré
  render();

  showUndoToast(`"${removedTask.text}" deleted`, () => {
    tasks.splice(index, 0, removedTask); // le remet exactement où il était
    render();
  });
}

// efface toutes les tâches terminées d'un coup, avec annulation groupée.
function clearCompleted() {
  const removedTasks = tasks.filter((t) => t.done);
  if (removedTasks.length === 0) return;

  tasks = tasks.filter((t) => !t.done);
  render();

  const label = removedTasks.length === 1 ? "1 task" : `${removedTasks.length} tasks`;
  showUndoToast(`${label} cleared`, () => {
    // Remises à la fin du tableau 
    tasks = tasks.concat(removedTasks);
    render();
  });
}

function startEdit(li) {
  const textEl = li.querySelector(".task-text");
  const editInput = li.querySelector(".task-edit-input");
  textEl.hidden = true;
  editInput.hidden = false;
  editInput.focus();
  editInput.select();
}

function commitEdit(li, { cancel = false } = {}) {
  const id = Number(li.dataset.id);
  const editInput = li.querySelector(".task-edit-input");
  const newText = editInput.value.trim();

  if (!cancel && newText !== "") {
    const task = tasks.find((t) => t.id === id);
    if (task) task.text = newText;
  }
  render();
}


/* 9. ÉVÉNEMENTS — DÉLÉGATION SUR LA LISTE */

taskListEl.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const li = event.target.closest(".task-item");
  const id = Number(li.dataset.id);
  const action = actionEl.dataset.action;

  if (action === "toggle") {
    toggleTask(id);
  } else if (action === "delete") {
    deleteTask(id);
  } else if (action === "edit-start") {
    startEdit(li);
  }
});

taskListEl.addEventListener("dblclick", (event) => {
  const textEl = event.target.closest(".task-text");
  if (!textEl) return;
  const li = textEl.closest(".task-item");
  startEdit(li);
});

taskListEl.addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("task-edit-input")) return;
  const li = event.target.closest(".task-item");
  commitEdit(li);
});

taskListEl.addEventListener("keydown", (event) => {
  if (!event.target.classList.contains("task-edit-input")) return;
  const li = event.target.closest(".task-item");

  if (event.key === "Enter") {
    commitEdit(li);
  } else if (event.key === "Escape") {
    commitEdit(li, { cancel: true });
  }
});


/* 10. ÉVÉNEMENTS — FORMULAIRE D'AJOUT */

addBtnEl.addEventListener("click", addTask);

taskInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTask();
  }
});

taskInputEl.addEventListener("input", () => {
  saveSession();
});

clearCompletedEl.addEventListener("click", clearCompleted);


/* 11. ÉVÉNEMENTS — CHANGEMENT DE VUE (sidebar) */

viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    saveSession();
    render();
  });
});


/* 12. ÉVÉNEMENTS — RECHERCHE + TRI */

searchInputEl.addEventListener("input", () => {
  searchQuery = searchInputEl.value.trim();
  render();
});

sortSelectEl.addEventListener("change", () => {
  sortBy = sortSelectEl.value;
  render();
});


/* 13. ÉVÉNEMENT MODE SOMBRE */

themeToggleEl.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(currentTheme);
  saveTheme(currentTheme);
});


/* 14. PREMIER AFFICHAGE */

// MODIFIÉ : locale "en-US" — la date sous le titre est maintenant en anglais.
viewDateEl.textContent = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

taskInputEl.value = session.draft;
render();