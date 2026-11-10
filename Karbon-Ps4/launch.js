const TARGET = {
  hen: "log=1&KarbonBurnt=run&payload=hen.bin",
  goldhen: "log=1&KarbonBurnt=run&mode=goldhen",
};

const STORE_KEY = "Karbon.choice";
const picker = document.getElementById("pick");
const startButton = document.getElementById("startBtn");
const countEl = document.getElementById("count");
const cacheEl = document.getElementById("cache");
let started = false;
let waitingForCache = false;
const loadingScreen = document.getElementById("loadingScreen");

const appCache = window.applicationCache || null;

function selectedPayload() {
  return picker.querySelector('input[name="payload"]:checked')?.value || "goldhen";
}

function saveSelection() {
  try {
    localStorage.setItem(STORE_KEY, selectedPayload());
  } catch {}
}

function restoreSelection() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (TARGET[saved]) {
      const radio = picker.querySelector(`input[name="payload"][value="${saved}"]`);
      if (radio) radio.checked = true;
    }
  } catch {}
}

function cacheBusy() {
  if (!appCache || navigator.onLine === false) return false;
  return appCache.status === appCache.CHECKING || appCache.status === appCache.DOWNLOADING;
}

function updateCacheNote() {
  if (!cacheEl || !appCache) return;
  const status = appCache.status;
  if (status === appCache.CHECKING) cacheEl.textContent = "checking for updates";
  else if (status === appCache.DOWNLOADING) cacheEl.textContent = "loading files - hold on";
  else if (status === appCache.UPDATEREADY) cacheEl.textContent = "an update is cached - reopen this page to use it";
  else if (status === appCache.OBSOLETE) cacheEl.textContent = "offline cache unavailable";
  else cacheEl.textContent = "";
}

function start() {
  if (started) return;
  if (cacheBusy()) {
    waitingForCache = true;
    countEl.textContent = "waiting for the cache";
    return;
  }
  started = true;
  loadingScreen.classList.add("visible");
  startButton.disabled = true;
  setTimeout(() => { location.href = `jb.html?${TARGET[selectedPayload()]}`; }, 180);
}

restoreSelection();
picker.addEventListener("change", saveSelection);
startButton.addEventListener("click", start);

if (appCache) {
  for (const eventName of ["checking", "downloading", "progress", "cached", "noupdate", "updateready", "error", "obsolete"]) {
    appCache.addEventListener(eventName, () => {
      updateCacheNote();
      if (waitingForCache && !cacheBusy()) start();
    });
  }
  updateCacheNote();
}

