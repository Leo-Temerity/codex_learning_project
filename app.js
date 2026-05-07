const MODES = {
  focus: {
    label: "Focus",
    settingKey: "focusMinutes",
    defaultMinutes: 25,
    next: "shortBreak",
  },
  shortBreak: {
    label: "Short break",
    settingKey: "shortBreakMinutes",
    defaultMinutes: 5,
    next: "focus",
  },
  longBreak: {
    label: "Long break",
    settingKey: "longBreakMinutes",
    defaultMinutes: 15,
    next: "focus",
  },
};

const STORAGE_KEY = "chrome-pomodoro-settings-v1";
const TASKS_STORAGE_KEY = "chrome-pomodoro-tasks-v1";

const defaults = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4,
  autoStart: false,
  notificationsEnabled: false,
};

const elements = {
  timerFace: document.querySelector(".timer-face"),
  timeDisplay: document.querySelector("#timeDisplay"),
  modeLabel: document.querySelector("#modeLabel"),
  timerState: document.querySelector("#timerState"),
  sessionStatus: document.querySelector("#sessionStatus"),
  startPauseButton: document.querySelector("#startPauseButton"),
  resetButton: document.querySelector("#resetButton"),
  skipButton: document.querySelector("#skipButton"),
  flowSteps: {
    focus: document.querySelector("#focusStep"),
    shortBreak: document.querySelector("#shortBreakStep"),
    longBreak: document.querySelector("#longBreakStep"),
  },
  focusMinutes: document.querySelector("#focusMinutes"),
  shortBreakMinutes: document.querySelector("#shortBreakMinutes"),
  longBreakMinutes: document.querySelector("#longBreakMinutes"),
  roundsBeforeLongBreak: document.querySelector("#roundsBeforeLongBreak"),
  settingsForm: document.querySelector("#settingsForm"),
  autoStartToggle: document.querySelector("#autoStartToggle"),
  autoStartCopy: document.querySelector("#autoStartCopy"),
  notificationButton: document.querySelector("#notificationButton"),
  notificationStatus: document.querySelector("#notificationStatus"),
  restoreDefaultsButton: document.querySelector("#restoreDefaultsButton"),
  completedFocus: document.querySelector("#completedFocus"),
  roundProgress: document.querySelector("#roundProgress"),
  currentModeSummary: document.querySelector("#currentModeSummary"),
  nextMode: document.querySelector("#nextMode"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskCount: document.querySelector("#taskCount"),
  activeTaskSummary: document.querySelector("#activeTaskSummary"),
  taskList: document.querySelector("#taskList"),
  cutTaskList: document.querySelector("#cutTaskList"),
  emptyTasks: document.querySelector("#emptyTasks"),
  emptyCutTasks: document.querySelector("#emptyCutTasks"),
  restoreLastTaskButton: document.querySelector("#restoreLastTaskButton"),
};

let settings = loadSettings();
let tasks = loadTasks();
let currentMode = "focus";
let isRunning = false;
let targetTime = null;
let remainingSeconds = getModeSeconds(currentMode);
let timerId = null;
let completedFocusCount = 0;
let audioContext = null;

initialize();

function initialize() {
  syncSettingsForm();
  updateNotificationUi();
  bindEvents();
  resetTimer("focus");
  renderTasks();
}

function bindEvents() {
  elements.startPauseButton.addEventListener("click", toggleTimer);
  elements.resetButton.addEventListener("click", () => resetTimer(currentMode));
  elements.skipButton.addEventListener("click", skipTimer);
  elements.restoreDefaultsButton.addEventListener("click", restoreDefaults);
  elements.notificationButton.addEventListener("click", enableNotifications);
  elements.settingsForm.addEventListener("submit", (event) => event.preventDefault());
  elements.taskForm.addEventListener("submit", addTask);
  elements.taskList.addEventListener("click", handleTaskListClick);
  elements.cutTaskList.addEventListener("click", handleTaskListClick);
  elements.restoreLastTaskButton.addEventListener("click", restoreLastCutTask);

  [elements.focusMinutes, elements.shortBreakMinutes, elements.longBreakMinutes, elements.roundsBeforeLongBreak].forEach((input) => {
    input.addEventListener("input", () => updateNumericSetting(input));
    input.addEventListener("change", () => updateNumericSetting(input, { clampInput: true }));
  });

  elements.autoStartToggle.addEventListener("change", () => {
    settings.autoStart = elements.autoStartToggle.checked;
    saveSettings();
    render();
  });

  document.addEventListener("visibilitychange", () => {
    if (isRunning) {
      tick();
    }
  });
}

function addTask(event) {
  event.preventDefault();

  const title = elements.taskInput.value.trim().replace(/\s+/g, " ");

  if (!title) {
    elements.taskInput.focus();
    return;
  }

  tasks.unshift({
    id: createTaskId(),
    title,
    isCut: false,
    createdAt: Date.now(),
    cutAt: null,
  });

  elements.taskInput.value = "";
  saveTasks();
  renderTasks();
}

function handleTaskListClick(event) {
  const button = event.target.closest("button[data-task-action]");

  if (!button) {
    return;
  }

  const task = tasks.find((item) => item.id === button.dataset.taskId);

  if (!task) {
    return;
  }

  if (button.dataset.taskAction === "cut") {
    cutTask(task.id);
  }

  if (button.dataset.taskAction === "restore") {
    restoreTask(task.id);
  }

  if (button.dataset.taskAction === "archive") {
    archiveTask(task.id);
  }
}

function cutTask(taskId) {
  tasks = tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      isCut: true,
      cutAt: Date.now(),
    };
  });

  saveTasks();
  renderTasks();
}

function restoreTask(taskId) {
  tasks = tasks.map((task) => {
    if (task.id !== taskId) {
      return task;
    }

    return {
      ...task,
      isCut: false,
      cutAt: null,
    };
  });

  saveTasks();
  renderTasks();
}

function restoreLastCutTask() {
  const lastCutTask = getCutTasks()[0];

  if (!lastCutTask) {
    return;
  }

  restoreTask(lastCutTask.id);
}

function archiveTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId || !task.isCut);
  saveTasks();
  renderTasks();
}

function toggleTimer() {
  unlockAudio();

  if (isRunning) {
    pauseTimer();
    return;
  }

  startTimer();
}

function startTimer() {
  if (remainingSeconds <= 0) {
    remainingSeconds = getModeSeconds(currentMode);
  }

  isRunning = true;
  targetTime = Date.now() + remainingSeconds * 1000;
  window.clearInterval(timerId);
  timerId = window.setInterval(tick, 250);
  tick();
}

function pauseTimer() {
  isRunning = false;
  targetTime = null;
  window.clearInterval(timerId);
  timerId = null;
  render();
}

function resetTimer(mode = currentMode) {
  isRunning = false;
  targetTime = null;
  window.clearInterval(timerId);
  timerId = null;
  currentMode = mode;
  remainingSeconds = getModeSeconds(currentMode);
  render();
}

function updateNumericSetting(input, { clampInput = false } = {}) {
  let value = clampMinutes(input.value, input.min, input.max);

  if (Number.isNaN(value)) {
    if (!clampInput) {
      return;
    }

    value = Number(input.min);
  }

  if (clampInput) {
    input.value = value;
  }

  settings[input.id] = value;
  saveSettings();

  if (!isRunning && getModeConfig(currentMode).settingKey === input.id) {
    remainingSeconds = getModeSeconds(currentMode);
  }

  render();
}

function skipTimer() {
  if (currentMode === "focus") {
    return;
  }

  completeTimer({ skipped: true });
}

function tick() {
  if (!targetTime) {
    return;
  }

  remainingSeconds = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));

  if (remainingSeconds <= 0) {
    completeTimer();
    return;
  }

  render();
}

function completeTimer({ skipped = false } = {}) {
  const completedMode = currentMode;
  const shouldCountFocus = completedMode === "focus" && !skipped;
  const nextMode = getNextMode(completedMode, shouldCountFocus);

  isRunning = false;
  targetTime = null;
  window.clearInterval(timerId);
  timerId = null;

  if (shouldCountFocus) {
    completedFocusCount += 1;
  }

  if (!skipped) {
    playCompletionSound();
    showCompletionNotification(completedMode, nextMode);
  }

  currentMode = nextMode;
  remainingSeconds = getModeSeconds(currentMode);
  render();

  if (settings.autoStart && !skipped) {
    startTimer();
  }
}

function getNextMode(mode, countedFocus) {
  if (mode === "focus") {
    const focusTotal = completedFocusCount + (countedFocus ? 1 : 0);
    return focusTotal > 0 && focusTotal % settings.roundsBeforeLongBreak === 0 ? "longBreak" : "shortBreak";
  }

  return MODES[mode].next;
}

function render() {
  const config = getModeConfig(currentMode);
  const totalSeconds = getModeSeconds(currentMode);
  const progress = totalSeconds === 0 ? 0 : 1 - remainingSeconds / totalSeconds;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const topSandScale = Math.max(0.08, 1 - clampedProgress);
  const bottomSandScale = Math.max(0.04, clampedProgress);

  document.body.dataset.mode = currentMode;
  document.body.dataset.running = String(isRunning);
  elements.timerFace.style.setProperty("--sand-top-scale", topSandScale.toFixed(3));
  elements.timerFace.style.setProperty("--sand-bottom-scale", bottomSandScale.toFixed(3));
  elements.timeDisplay.textContent = formatTime(remainingSeconds);
  elements.modeLabel.textContent = config.label;
  elements.timerState.textContent = getStateText();
  elements.startPauseButton.textContent = isRunning ? "Pause" : "Start";
  elements.skipButton.disabled = currentMode === "focus";
  elements.skipButton.title = currentMode === "focus" ? "Breaks unlock after focus" : "Skip break";
  elements.skipButton.setAttribute(
    "aria-label",
    currentMode === "focus" ? "Breaks unlock after focus" : "Skip break",
  );
  elements.completedFocus.textContent = completedFocusCount;
  elements.currentModeSummary.textContent = config.label;
  elements.nextMode.textContent = getModeConfig(getNextMode(currentMode, currentMode === "focus")).label;
  elements.roundProgress.textContent = `${getCurrentRound()} / ${settings.roundsBeforeLongBreak}`;
  elements.sessionStatus.textContent = getSessionStatus();
  elements.autoStartCopy.textContent = settings.autoStart ? "Continue automatically" : "Wait after each session";

  Object.entries(elements.flowSteps).forEach(([mode, step]) => {
    step.classList.toggle("is-active", mode === currentMode);
  });
}

function renderTasks() {
  const activeTasks = getActiveTasks();
  const cutTasks = getCutTasks();

  elements.taskCount.textContent = `${activeTasks.length} active`;
  elements.activeTaskSummary.textContent = `${activeTasks.length} ${activeTasks.length === 1 ? "item" : "items"}`;
  elements.emptyTasks.hidden = activeTasks.length > 0;
  elements.emptyCutTasks.hidden = cutTasks.length > 0;
  elements.restoreLastTaskButton.disabled = cutTasks.length === 0;
  elements.taskList.replaceChildren(...activeTasks.map((task) => createTaskElement(task)));
  elements.cutTaskList.replaceChildren(...cutTasks.map((task) => createTaskElement(task)));
}

function createTaskElement(task) {
  const item = document.createElement("li");
  item.className = task.isCut ? "task-item is-cut" : "task-item";

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const actions = document.createElement("div");
  actions.className = "task-actions";

  if (task.isCut) {
    actions.append(
      createTaskActionButton({
        task,
        action: "restore",
        label: "Put back",
        className: "quiet-button task-action-button",
      }),
      createTaskActionButton({
        task,
        action: "archive",
        label: "Archive",
        className: "quiet-button task-action-button archive-task-button",
      }),
    );
  } else {
    actions.append(
      createTaskActionButton({
        task,
        action: "cut",
        label: "✂",
        title: "Cut out",
        className: "icon-button task-action-button",
      }),
    );
  }

  item.append(title, actions);

  return item;
}

function createTaskActionButton({ task, action, label, title = label, className }) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.taskId = task.id;
  button.dataset.taskAction = action;
  button.title = title;
  button.setAttribute("aria-label", `${title} ${task.title}`);
  button.textContent = label;

  return button;
}

function getActiveTasks() {
  return tasks.filter((task) => !task.isCut);
}

function getCutTasks() {
  return tasks
    .filter((task) => task.isCut)
    .sort((first, second) => second.cutAt - first.cutAt);
}

function createTaskId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCurrentRound() {
  return (completedFocusCount % settings.roundsBeforeLongBreak) + 1;
}

function getSessionStatus() {
  if (currentMode === "focus") {
    return `Focus ${getCurrentRound()} of ${settings.roundsBeforeLongBreak}`;
  }

  if (currentMode === "longBreak") {
    return `Long break after ${settings.roundsBeforeLongBreak}`;
  }

  const lastFocus = completedFocusCount % settings.roundsBeforeLongBreak || settings.roundsBeforeLongBreak;
  return `Break after focus ${lastFocus}`;
}

function getStateText() {
  if (isRunning) {
    return "Running";
  }

  if (remainingSeconds < getModeSeconds(currentMode)) {
    return "Paused";
  }

  return "Ready";
}

function syncSettingsForm() {
  elements.focusMinutes.value = settings.focusMinutes;
  elements.shortBreakMinutes.value = settings.shortBreakMinutes;
  elements.longBreakMinutes.value = settings.longBreakMinutes;
  elements.roundsBeforeLongBreak.value = settings.roundsBeforeLongBreak;
  elements.autoStartToggle.checked = settings.autoStart;
}

function restoreDefaults() {
  settings = { ...defaults };
  saveSettings();
  syncSettingsForm();
  updateNotificationUi();
  resetTimer(currentMode);
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    settings.notificationsEnabled = false;
    saveSettings();
    updateNotificationUi("Notifications unavailable");
    return;
  }

  if (!window.isSecureContext) {
    updateNotificationUi("Use localhost for alerts");
    return;
  }

  const permission = await Notification.requestPermission();
  settings.notificationsEnabled = permission === "granted";
  saveSettings();
  updateNotificationUi();
}

function updateNotificationUi(customStatus) {
  const supported = "Notification" in window;
  const permission = supported ? Notification.permission : "unsupported";
  const enabled = settings.notificationsEnabled && permission === "granted";

  elements.notificationButton.disabled = !supported || permission === "denied";
  elements.notificationButton.textContent = enabled ? "Enabled" : "Enable";

  if (customStatus) {
    elements.notificationStatus.textContent = customStatus;
  } else if (!supported) {
    elements.notificationStatus.textContent = "Notifications unavailable";
  } else if (permission === "denied") {
    elements.notificationStatus.textContent = "Notifications blocked";
  } else if (enabled) {
    elements.notificationStatus.textContent = "Sound and notification";
  } else {
    elements.notificationStatus.textContent = "Sound is on";
  }
}

function showCompletionNotification(mode, nextMode) {
  if (!settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const nextLabel = getModeConfig(nextMode).label.toLowerCase();
  new Notification(`${getModeConfig(mode).label} complete`, {
    body: `Next up: ${nextLabel}.`,
    silent: true,
  });
}

function unlockAudio() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioContext = new AudioContext();
    }
  }

  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
}

function playCompletionSound() {
  unlockAudio();

  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const notes = [660, 880, 990];

  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.13;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.14);
  });
}

function getModeConfig(mode) {
  return MODES[mode];
}

function getModeSeconds(mode) {
  return settings[getModeConfig(mode).settingKey] * 60;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function clampMinutes(value, min, max) {
  const number = Number.parseInt(value, 10);

  if (Number.isNaN(number)) {
    return Number.NaN;
  }

  return Math.min(Math.max(number, Number(min)), Number(max));
}

function loadSettings() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY));

    return {
      focusMinutes: sanitizeStoredMinutes(parsed?.focusMinutes, defaults.focusMinutes, 1, 180),
      shortBreakMinutes: sanitizeStoredMinutes(parsed?.shortBreakMinutes, defaults.shortBreakMinutes, 1, 60),
      longBreakMinutes: sanitizeStoredMinutes(parsed?.longBreakMinutes, defaults.longBreakMinutes, 1, 120),
      roundsBeforeLongBreak: sanitizeStoredMinutes(parsed?.roundsBeforeLongBreak, defaults.roundsBeforeLongBreak, 1, 999),
      autoStart: Boolean(parsed?.autoStart),
      notificationsEnabled: Boolean(parsed?.notificationsEnabled),
    };
  } catch {
    return { ...defaults };
  }
}

function loadTasks() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((task) => ({
        id: typeof task?.id === "string" ? task.id : createTaskId(),
        title: typeof task?.title === "string" ? task.title.trim() : "",
        isCut: Boolean(task?.isCut),
        createdAt: Number.isFinite(task?.createdAt) ? task.createdAt : Date.now(),
        cutAt: Number.isFinite(task?.cutAt) ? task.cutAt : null,
      }))
      .filter((task) => task.title);
  } catch {
    return [];
  }
}

function sanitizeStoredMinutes(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);

  if (Number.isNaN(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function saveSettings() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function saveTasks() {
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}
