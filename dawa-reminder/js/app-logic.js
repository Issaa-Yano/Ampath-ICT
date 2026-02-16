// ================= 1. FIREBASE CONFIGURATION =================
const firebaseConfig = {
    apiKey: "AIzaSyDOOlaIJL1A5trkzQ-Lz_8vn4eNsN-XzG8",
    authDomain: "dawa-login-c01b3.firebaseapp.com",
    databaseURL: "https://dawa-login-c01b3-default-rtdb.firebaseio.com",
    projectId: "dawa-login-c01b3",
    storageBucket: "dawa-login-c01b3.appspot.com",
    messagingSenderId: "1012681172444",
    appId: "1:1012681172444:web:cf477ce6e592ab7c309b19"
};

if (typeof firebase !== "undefined" && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.database();
const auth = firebase.auth();

const DEFAULT_TIME_SLOTS = ["08:00", "14:00", "20:00"];

// ================= 2. SHARED HELPERS =================
function getDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
    const [y, m, d] = String(dateKey).split("-").map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(dateKey, days) {
    const date = parseDateKey(dateKey);
    date.setDate(date.getDate() + Number(days || 0));
    return getDateKey(date);
}

function compareDateKeys(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function isTimeValue(value) {
    return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function parseTimeToDate(timeHHMM, dateKey = getDateKey()) {
    const date = parseDateKey(dateKey);
    const [hours, mins] = String(timeHHMM || "00:00").split(":").map(Number);
    date.setHours(Number(hours) || 0, Number(mins) || 0, 0, 0);
    return date;
}

function timeToMinutes(timeHHMM) {
    const [hours, mins] = String(timeHHMM || "00:00").split(":").map(Number);
    return (Number(hours) || 0) * 60 + (Number(mins) || 0);
}

function formatDisplayTime(timeHHMM) {
    return parseTimeToDate(timeHHMM).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toJsonClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function getInitials(fullName) {
    const parts = String(fullName || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return "PT";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getFirstName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : "Patient";
}

function showInAppBanner(message, level = "info") {
    const banner = document.createElement("div");
    banner.className = `in-app-notification ${level === "warning" ? "warning" : ""}`;
    banner.textContent = message;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 4500);
}

function getTodayKey() {
    return getDateKey(new Date());
}

// ================= 3. UNDO MANAGER =================
const UndoManager = {
    previousRegimens: null,
    timer: null,
    timeoutMs: 7000,

    capture: function () {
        this.previousRegimens = toJsonClone(DataService.getLocalRegimens());
    },

    clear: function () {
        this.previousRegimens = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        const bar = document.getElementById("undo-snackbar");
        if (bar) bar.remove();
    },

    show: function (message) {
        this.clear();
        if (!this.previousRegimens) return;

        const bar = document.createElement("div");
        bar.id = "undo-snackbar";
        bar.className = "undo-snackbar";
        bar.innerHTML = `
            <span>${message}</span>
            <button type="button" class="undo-btn" id="undo-action-btn">Undo</button>
        `;
        document.body.appendChild(bar);

        const btn = document.getElementById("undo-action-btn");
        if (btn) {
            btn.addEventListener("click", () => {
                DataService.save(this.previousRegimens);
                this.clear();
            });
        }

        this.timer = setTimeout(() => this.clear(), this.timeoutMs);
    }
};

// ================= 4. REGIMEN DATA SERVICE (LOCAL + FIREBASE) =================
const DataService = {
    uid: null,
    keys: {
        regimens: "nimeza_regimens",
        meta: "nimeza_meta"
    },
    paths: {
        regimens: "",
        legacyMeds: "",
        history: ""
    },
    syncInProgress: false,
    regimensRef: null,

    init: async function (userId) {
        this.uid = userId;
        this.keys.regimens = `nimeza_regimens_${userId}`;
        this.keys.meta = `nimeza_meta_${userId}`;
        this.paths.regimens = `users/${userId}/regimens`;
        this.paths.legacyMeds = `users/${userId}/medications`;
        this.paths.history = `users/${userId}/history`;

        const localFirst = this.getLocalRegimens();
        renderAll(localFirst);
        NotificationSystem.onMedicationChanged();

        await this.bootstrapSync();
        this.attachRealtimeListener();
    },

    getLocalRegimens: function () {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.keys.regimens)) || [];
            const arr = Array.isArray(parsed) ? parsed : [];
            return this.normalizeRegimens(arr);
        } catch (error) {
            return [];
        }
    },

    setLocalRegimens: function (regimens) {
        localStorage.setItem(this.keys.regimens, JSON.stringify(this.normalizeRegimens(regimens)));
    },

    getLocalMeta: function () {
        try {
            return JSON.parse(localStorage.getItem(this.keys.meta)) || {};
        } catch (error) {
            return {};
        }
    },

    setLocalMeta: function (meta) {
        localStorage.setItem(this.keys.meta, JSON.stringify(meta));
    },

    normalizeCloudData: function (value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean);
        return Object.values(value).filter(Boolean);
    },

    normalizeRegimen: function (raw) {
        const nowKey = getTodayKey();
        const item = raw || {};

        const timesArray = Array.isArray(item.times) ? item.times : (isTimeValue(item.time) ? [item.time] : []);
        const times = Array.from(new Set(timesArray.filter(isTimeValue))).sort();
        const fallbackTimes = times.length ? times : [DEFAULT_TIME_SLOTS[0]];

        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.startDate || "")) ? item.startDate : nowKey;
        const rawEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.endDate || "")) ? item.endDate : addDays(startDate, 30);
        const endDate = compareDateKeys(rawEndDate, startDate) < 0 ? startDate : rawEndDate;

        return {
            id: String(item.id || makeId("regimen")),
            name: String(item.name || "Medication").trim(),
            amount: String(item.amount || "1").trim(),
            unit: String(item.unit || "Tablet").trim(),
            frequency: Number(item.frequency) || fallbackTimes.length,
            times: fallbackTimes,
            startDate,
            endDate,
            status: item.status === "completed" ? "completed" : "active",
            doseLog: item.doseLog && typeof item.doseLog === "object" ? item.doseLog : {},
            createdAt: Number(item.createdAt) || Date.now(),
            updatedAt: Number(item.updatedAt) || Date.now()
        };
    },

    normalizeRegimens: function (items) {
        return (items || [])
            .map((item) => this.normalizeRegimen(item))
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    },

    migrateFromLegacyItems: function (legacyItems) {
        const todayKey = getTodayKey();
        return this.normalizeRegimens((legacyItems || []).map((item) => {
            const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.startDate || "")) ? item.startDate : todayKey;
            const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.endDate || "")) ? item.endDate : addDays(startDate, 30);
            const doseLog = {};

            if (item.takenLog && typeof item.takenLog === "object") {
                Object.keys(item.takenLog).forEach((dateKey) => {
                    if (item.takenLog[dateKey]) {
                        const doseKey = `${dateKey}_${item.time || DEFAULT_TIME_SLOTS[0]}`;
                        doseLog[doseKey] = { status: "taken", takenAt: Date.now() };
                    }
                });
            } else if (item.taken && item.time) {
                doseLog[`${todayKey}_${item.time}`] = { status: "taken", takenAt: Date.now() };
            }

            return {
                id: String(item.id || makeId("regimen")),
                name: item.name || "Medication",
                amount: item.amount || "1",
                unit: item.unit || "Tablet",
                frequency: Number(item.frequency) || 1,
                times: isTimeValue(item.time) ? [item.time] : [DEFAULT_TIME_SLOTS[0]],
                startDate,
                endDate,
                status: "active",
                doseLog,
                createdAt: Number(item.createdAt) || Date.now(),
                updatedAt: Number(item.updatedAt) || Date.now()
            };
        }));
    },

    mergeWithFirebasePriority: function (localRegimens, cloudRegimens) {
        const map = new Map();
        localRegimens.forEach((item) => map.set(item.id, item));
        cloudRegimens.forEach((item) => map.set(item.id, item));
        return this.normalizeRegimens(Array.from(map.values()));
    },

    buildHistorySnapshot: function (regimens, dateKey) {
        const targetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) ? dateKey : getTodayKey();
        const normalized = this.normalizeRegimens(regimens || []);
        const medications = getOccurrencesForDate(normalized, targetDateKey).map((occurrence) => ({
            regimenId: occurrence.regimenId,
            name: occurrence.name,
            amount: occurrence.amount,
            unit: occurrence.unit,
            time: occurrence.time,
            taken: Boolean(occurrence.taken)
        }));

        const taken = medications.filter((item) => item.taken).length;
        const total = medications.length;

        return {
            dateKey: targetDateKey,
            taken,
            total,
            score: total ? Math.round((taken / total) * 100) : 0,
            medications,
            regimens: normalized,
            updatedAt: Date.now()
        };
    },

    writeHistorySnapshot: async function (regimens, dateKey) {
        if (!this.uid || !navigator.onLine || !this.paths.history) return;

        const snapshot = this.buildHistorySnapshot(regimens, dateKey);
        try {
            await db.ref(`${this.paths.history}/${snapshot.dateKey}`).set(snapshot);
        } catch (error) {
            // preserve local behavior if history write fails
        }
    },

    bootstrapSync: async function () {
        let localRegimens = this.getLocalRegimens();
        let cloudRegimens = [];

        try {
            const snapshot = await db.ref(this.paths.regimens).once("value");
            cloudRegimens = this.normalizeRegimens(this.normalizeCloudData(snapshot.val()));
        } catch (error) {
            cloudRegimens = [];
        }

        if (!localRegimens.length) {
            try {
                const legacyLocal = JSON.parse(localStorage.getItem(`nimeza_meds_${this.uid}`)) || [];
                if (Array.isArray(legacyLocal) && legacyLocal.length) {
                    localRegimens = this.migrateFromLegacyItems(legacyLocal);
                }
            } catch (error) {
                // ignore parse errors
            }
        }

        if (!cloudRegimens.length) {
            try {
                const legacyCloudSnapshot = await db.ref(this.paths.legacyMeds).once("value");
                const legacyCloud = this.normalizeCloudData(legacyCloudSnapshot.val());
                if (legacyCloud.length) {
                    cloudRegimens = this.migrateFromLegacyItems(legacyCloud);
                }
            } catch (error) {
                // ignore legacy cloud failures
            }
        }

        const merged = this.mergeWithFirebasePriority(localRegimens, cloudRegimens);
        this.setLocalRegimens(merged);
        renderAll(merged);
        NotificationSystem.onMedicationChanged();
        await this.writeHistorySnapshot(merged);

        if (navigator.onLine && merged.length && !cloudRegimens.length) {
            await this.pushToCloud(merged);
        }
    },

    attachRealtimeListener: function () {
        if (this.regimensRef) this.regimensRef.off();
        this.regimensRef = db.ref(this.paths.regimens);

        this.regimensRef.on("value", (snapshot) => {
            const cloudRegimens = this.normalizeRegimens(this.normalizeCloudData(snapshot.val()));
            const localRegimens = this.getLocalRegimens();
            const merged = this.mergeWithFirebasePriority(localRegimens, cloudRegimens);
            this.setLocalRegimens(merged);
            renderAll(merged);
            NotificationSystem.onMedicationChanged();
            void this.writeHistorySnapshot(merged);
        });
    },

    pushToCloud: async function (regimens) {
        if (!this.uid || !navigator.onLine || this.syncInProgress) return;

        this.syncInProgress = true;
        try {
            await db.ref(this.paths.regimens).set(this.normalizeRegimens(regimens));
            await this.writeHistorySnapshot(regimens);
            const meta = this.getLocalMeta();
            meta.lastSyncedAt = Date.now();
            meta.pendingSync = false;
            this.setLocalMeta(meta);
        } catch (error) {
            const meta = this.getLocalMeta();
            meta.pendingSync = true;
            this.setLocalMeta(meta);
        } finally {
            this.syncInProgress = false;
        }
    },

    save: function (regimens) {
        const normalized = this.normalizeRegimens(regimens).map((regimen) => ({
            ...regimen,
            updatedAt: Date.now()
        }));

        this.setLocalRegimens(normalized);
        renderAll(normalized);
        NotificationSystem.onMedicationChanged();

        const meta = this.getLocalMeta();
        meta.pendingSync = true;
        this.setLocalMeta(meta);

        void this.writeHistorySnapshot(normalized);
        this.pushToCloud(normalized);
    }
};

// ================= 5. PROFILE DATA SERVICE =================
const ProfileService = {
    uid: null,
    key: "nimeza_profile",
    path: "",
    current: null,
    syncInProgress: false,
    profileRef: null,

    buildDefaultProfile: function (user) {
        const uid = String((user && user.uid) || this.uid || "000000").replace(/[^a-zA-Z0-9]/g, "");
        return {
            fullName: (user && user.displayName) || "Patient",
            patientId: `#${uid.slice(-6).toUpperCase() || "000000"}`,
            age: "",
            weight: "",
            bloodGroup: "",
            email: (user && user.email) || "",
            updatedAt: Date.now()
        };
    },

    normalize: function (profile) {
        const fallback = this.buildDefaultProfile(null);
        const merged = { ...fallback, ...(profile || {}) };
        merged.fullName = String(merged.fullName || fallback.fullName).trim() || fallback.fullName;
        merged.patientId = String(merged.patientId || fallback.patientId).trim() || fallback.patientId;
        merged.age = merged.age === null || merged.age === undefined ? "" : String(merged.age).trim();
        merged.weight = merged.weight === null || merged.weight === undefined ? "" : String(merged.weight).trim();
        merged.bloodGroup = merged.bloodGroup === null || merged.bloodGroup === undefined ? "" : String(merged.bloodGroup).trim();
        merged.email = merged.email === null || merged.email === undefined ? "" : String(merged.email).trim();
        merged.updatedAt = Number(merged.updatedAt) || Date.now();
        return merged;
    },

    getLocal: function () {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.key));
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    },

    setLocal: function (profile) {
        localStorage.setItem(this.key, JSON.stringify(profile));
    },

    getCurrent: function () {
        return this.current || this.getLocal();
    },

    init: async function (user) {
        this.uid = (user && user.uid) || "test_patient_001";
        this.key = `nimeza_profile_${this.uid}`;
        this.path = `users/${this.uid}/profile`;

        const seeded = this.normalize({
            ...this.buildDefaultProfile(user),
            ...this.getLocal()
        });

        this.current = seeded;
        this.setLocal(seeded);
        renderProfile(seeded);

        let cloudProfile = null;
        try {
            const snapshot = await db.ref(this.path).once("value");
            const value = snapshot.val();
            cloudProfile = value && typeof value === "object" ? value : null;
        } catch (error) {
            cloudProfile = null;
        }

        if (cloudProfile) {
            const merged = this.normalize({ ...seeded, ...cloudProfile });
            this.current = merged;
            this.setLocal(merged);
            renderProfile(merged);
        } else if (navigator.onLine) {
            await this.pushToCloud(seeded);
        }

        this.attachRealtimeListener();
    },

    attachRealtimeListener: function () {
        if (this.profileRef) this.profileRef.off();

        this.profileRef = db.ref(this.path);
        this.profileRef.on("value", (snapshot) => {
            const cloud = snapshot.val();
            if (!cloud || typeof cloud !== "object") return;

            const merged = this.normalize({ ...this.getLocal(), ...cloud });
            this.current = merged;
            this.setLocal(merged);
            renderProfile(merged);
        });
    },

    pushToCloud: async function (profile) {
        if (!this.uid || !navigator.onLine || this.syncInProgress) return;

        this.syncInProgress = true;
        try {
            await db.ref(this.path).set(this.normalize(profile));
        } catch (error) {
            // keep local state
        } finally {
            this.syncInProgress = false;
        }
    },

    save: function (patch) {
        const next = this.normalize({
            ...this.getCurrent(),
            ...patch,
            updatedAt: Date.now()
        });
        this.current = next;
        this.setLocal(next);
        renderProfile(next);
        this.pushToCloud(next);
    }
};

// ================= 6. NOTIFICATION SYSTEM =================
const NotificationSystem = {
    uid: "guest",
    settingsKey: "nimeza_notify_settings_guest",
    historyKey: "nimeza_notify_history_guest",
    settings: { enabled: true },
    history: {},
    ticker: null,
    uiBound: false,
    soundUrl: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
    audioUnlocked: false,
    lastAudioAt: 0,

    start: function () {
        if (this.ticker) clearInterval(this.ticker);
        this.bindUI();
        this.updateStatusUI();

        this.checkNow();
        this.ticker = setInterval(() => this.checkNow(), 30000);

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) this.checkNow();
        });

        window.addEventListener("focus", () => this.checkNow());
    },

    setUser: function (userId) {
        this.uid = userId || "test_patient_001";
        this.settingsKey = `nimeza_notify_settings_${this.uid}`;
        this.historyKey = `nimeza_notify_history_${this.uid}`;
        this.settings = this.loadSettings();
        this.history = this.loadHistory();
        this.cleanupHistory();
        this.updateStatusUI();
        this.checkNow();
    },

    loadSettings: function () {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.settingsKey));
            return {
                enabled: parsed && typeof parsed.enabled === "boolean" ? parsed.enabled : true
            };
        } catch (error) {
            return { enabled: true };
        }
    },

    saveSettings: function () {
        localStorage.setItem(this.settingsKey, JSON.stringify(this.settings));
    },

    loadHistory: function () {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.historyKey));
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    },

    saveHistory: function () {
        localStorage.setItem(this.historyKey, JSON.stringify(this.history));
    },

    cleanupHistory: function () {
        const keepDateKeys = new Set();
        const now = new Date();
        for (let i = 0; i < 4; i += 1) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            keepDateKeys.add(getDateKey(date));
        }

        Object.keys(this.history).forEach((occurrenceKey) => {
            const parts = occurrenceKey.split("|");
            const dateKey = parts[1];
            if (!keepDateKeys.has(dateKey)) {
                delete this.history[occurrenceKey];
            }
        });

        this.saveHistory();
    },

    playReminderSound: function () {
        const nowMs = Date.now();
        if (nowMs - this.lastAudioAt < 1200) return;
        this.lastAudioAt = nowMs;

        const audio = new Audio(this.soundUrl);
        audio.play()
            .then(() => {
                this.audioUnlocked = true;
            })
            .catch(() => {
                // Browser blocks autoplay until user interaction.
            });
    },

    playTestSound: function () {
        const audio = new Audio(this.soundUrl);
        return audio.play().then(() => {
            this.audioUnlocked = true;
        });
    },

    bindUI: function () {
        if (this.uiBound) return;
        const btn = document.getElementById("notification-toggle-btn");
        if (btn) {
            btn.addEventListener("click", () => this.toggleEnabled());
        }
        this.uiBound = true;
    },

    getPermissionStatus: function () {
        if (!("Notification" in window)) return "unsupported";
        return Notification.permission;
    },

    canSendBrowserNotification: function () {
        return this.getPermissionStatus() === "granted";
    },

    updateStatusUI: function () {
        const status = document.getElementById("notification-status-text");
        const btn = document.getElementById("notification-toggle-btn");
        if (!status || !btn) return;

        const permission = this.getPermissionStatus();

        if (!this.settings.enabled) {
            status.textContent = "Off";
            btn.textContent = "Enable";
            btn.classList.add("is-off");
            return;
        }

        if (permission === "granted") {
            status.textContent = "On (Browser + In-App)";
        } else if (permission === "denied" || permission === "unsupported") {
            status.textContent = "On (In-App only)";
        } else {
            status.textContent = "On (Permission needed)";
        }

        btn.textContent = "Disable";
        btn.classList.remove("is-off");
    },

    toggleEnabled: async function () {
        this.settings.enabled = !this.settings.enabled;
        this.saveSettings();

        if (this.settings.enabled && this.getPermissionStatus() === "default" && "Notification" in window) {
            try {
                await Notification.requestPermission();
            } catch (error) {
                // ignore
            }
        }

        this.updateStatusUI();
        this.checkNow();

        if (!this.settings.enabled) {
            showInAppBanner("Medication reminders disabled.");
        } else if (this.getPermissionStatus() === "denied") {
            showInAppBanner("Browser notifications blocked. In-app reminders are active.", "warning");
        } else {
            showInAppBanner("Medication reminders enabled.");
        }
    },

    hasSent: function (occurrenceKey, type) {
        return !!(this.history[occurrenceKey] && this.history[occurrenceKey][type]);
    },

    markSent: function (occurrenceKey, type) {
        if (!this.history[occurrenceKey]) this.history[occurrenceKey] = {};
        this.history[occurrenceKey][type] = Date.now();
        this.saveHistory();
    },

    onMedicationChanged: function () {
        this.checkNow();
    },

    checkNow: function () {
        if (!this.settings.enabled) return;

        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const todayOccurrences = getOccurrencesForDate(DataService.getLocalRegimens(), getTodayKey());

        todayOccurrences.forEach((occurrence) => {
            if (occurrence.taken) return;

            const diffMinutes = nowMinutes - timeToMinutes(occurrence.time);

            if (diffMinutes >= 0 && diffMinutes <= 1 && !this.hasSent(occurrence.key, "due")) {
                this.playReminderSound();
                this.alertUser(occurrence, "due");
                this.markSent(occurrence.key, "due");
            } else if (diffMinutes >= 20 && diffMinutes <= 180 && !this.hasSent(occurrence.key, "missed")) {
                this.playReminderSound();
                this.alertUser(occurrence, "missed");
                this.markSent(occurrence.key, "missed");
            }
        });

        this.cleanupHistory();
    },

    alertUser: function (occurrence, type) {
        const title = type === "missed" ? "Missed Medication Reminder" : "Medication Reminder";
        const message = type === "missed"
            ? `You missed ${occurrence.name} at ${formatDisplayTime(occurrence.time)}.`
            : `Take ${occurrence.amount} ${occurrence.unit} of ${occurrence.name} at ${formatDisplayTime(occurrence.time)}.`;

        if (this.canSendBrowserNotification()) {
            try {
                new Notification(title, {
                    body: message,
                    tag: `regimen_${occurrence.key}_${type}`
                });
            } catch (error) {
                // fall back to in-app
            }
        }

        showInAppBanner(message, type === "missed" ? "warning" : "info");
    }
};

// ================= 7. OCCURRENCE ENGINE =================
function isRegimenActiveOnDate(regimen, dateKey) {
    if (!regimen || regimen.status !== "active") return false;
    return compareDateKeys(dateKey, regimen.startDate) >= 0 && compareDateKeys(dateKey, regimen.endDate) <= 0;
}

function getDoseStatus(regimen, dateKey, time) {
    const log = regimen.doseLog || {};
    const entry = log[`${dateKey}_${time}`];
    return entry && entry.status === "taken";
}

function getOccurrencesForDate(regimens, dateKey) {
    const list = [];

    (regimens || []).forEach((regimen) => {
        if (!isRegimenActiveOnDate(regimen, dateKey)) return;

        regimen.times.forEach((time) => {
            const taken = getDoseStatus(regimen, dateKey, time);
            list.push({
                key: `${regimen.id}|${dateKey}|${time}`,
                regimenId: regimen.id,
                dateKey,
                time,
                dateTime: parseTimeToDate(time, dateKey),
                taken,
                name: regimen.name,
                amount: regimen.amount,
                unit: regimen.unit,
                frequencyLabel: regimen.frequency === 1 ? "Once a day" : regimen.frequency === 2 ? "Twice a day" : `${regimen.frequency}x/day`,
                startDate: regimen.startDate,
                endDate: regimen.endDate
            });
        });
    });

    return list.sort((a, b) => a.time.localeCompare(b.time));
}

function parseOccurrenceKey(key) {
    const parts = String(key || "").split("|");
    return {
        regimenId: parts[0] || "",
        dateKey: parts[1] || "",
        time: parts[2] || ""
    };
}

// ================= 8. UI RENDERING =================
let currentFilter = "today";
let editingRegimenId = null;

function getFilteredOccurrences(regimens, filterType) {
    const now = new Date();
    const today = getTodayKey();
    const todayOccurrences = getOccurrencesForDate(regimens, today);

    if (filterType === "today") return todayOccurrences;
    if (filterType === "upcoming") {
        return todayOccurrences.filter((occ) => !occ.taken && occ.dateTime >= now);
    }
    if (filterType === "past") {
        return todayOccurrences.filter((occ) => occ.taken || occ.dateTime < now);
    }
    return todayOccurrences;
}

function renderSchedule(regimens) {
    const container = document.getElementById("schedule-list");
    if (!container) return;

    const occurrences = getFilteredOccurrences(regimens || [], currentFilter);
    container.innerHTML = "";

    if (!occurrences.length) {
        container.innerHTML = "<p style='text-align:center; color:#64748b; margin-top:20px;'>No scheduled doses in this view.</p>";
        return;
    }

    occurrences.forEach((occurrence) => {
        const card = document.createElement("div");
        card.className = `med-card ${occurrence.taken ? "completed" : ""}`;
        card.innerHTML = `
            <div class="med-info">
                <div class="med-icon"><i class="ph-fill ph-pill"></i></div>
                <div>
                    <h4>${occurrence.name}</h4>
                    <p>${occurrence.amount} ${occurrence.unit} | ${occurrence.frequencyLabel} | <strong>${formatDisplayTime(occurrence.time)}</strong></p>
                    <p><span class="timeline-badge">${occurrence.startDate} to ${occurrence.endDate}</span></p>
                </div>
            </div>
            <div class="card-actions">
                <button class="btn-edit" onclick="editMedication('${occurrence.regimenId}')" aria-label="Edit regimen">
                    Edit
                </button>
                <button class="btn-action" onclick="toggleTaken('${occurrence.key}')">
                    ${occurrence.taken ? '<i class="ph-bold ph-check"></i>' : "Take"}
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateDosesRemaining(regimens) {
    const target = document.getElementById("doses-remaining");
    if (!target) return;

    const todayOccurrences = getOccurrencesForDate(regimens || [], getTodayKey());
    const total = todayOccurrences.length;
    const taken = todayOccurrences.filter((occ) => occ.taken).length;
    const remaining = Math.max(total - taken, 0);
    target.textContent = `${remaining} dose${remaining === 1 ? "" : "s"} remaining today`;
}

function updateProgress(regimens) {
    const todayOccurrences = getOccurrencesForDate(regimens || [], getTodayKey());
    const total = todayOccurrences.length;
    const taken = todayOccurrences.filter((occ) => occ.taken).length;
    const percent = total === 0 ? 0 : Math.round((taken / total) * 100);

    const textEl = document.getElementById("progress-percent");
    if (textEl) textEl.textContent = `${percent}%`;

    const ring = document.getElementById("progress-ring");
    if (ring) {
        const radius = ring.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        ring.style.strokeDasharray = `${circumference} ${circumference}`;
        ring.style.strokeDashoffset = circumference - (percent / 100) * circumference;
        ring.style.stroke = percent >= 80 ? "#10b981" : percent >= 40 ? "#f59e0b" : "#ef4444";
    }
}

function renderAll(regimens) {
    renderSchedule(regimens);
    updateProgress(regimens);
    updateDosesRemaining(regimens);
}

function setActiveFilterButton(type) {
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === type);
    });
}

function renderProfile(profile) {
    const normalized = ProfileService.normalize(profile);
    const initials = getInitials(normalized.fullName);
    const firstName = getFirstName(normalized.fullName);

    const profileName = document.getElementById("profile-name");
    const profileId = document.getElementById("profile-patient-id");
    const profileAge = document.getElementById("profile-age");
    const profileWeight = document.getElementById("profile-weight");
    const profileBlood = document.getElementById("profile-blood");
    const profileAvatar = document.getElementById("profile-avatar");
    const headerAvatar = document.getElementById("header-profile-pic");
    const greeting = document.getElementById("greeting");

    if (profileName) profileName.textContent = normalized.fullName;
    if (profileId) profileId.textContent = `Patient ID: ${normalized.patientId}`;
    if (profileAge) profileAge.textContent = normalized.age || "--";
    if (profileWeight) profileWeight.textContent = normalized.weight || "--";
    if (profileBlood) profileBlood.textContent = normalized.bloodGroup || "--";
    if (profileAvatar) profileAvatar.textContent = initials;
    if (headerAvatar) headerAvatar.textContent = initials;
    if (greeting) greeting.textContent = `Hello, ${firstName}`;
}

// ================= 9. INTERACTION LOGIC =================
window.toggleTaken = function (occurrenceKey) {
    const parsed = parseOccurrenceKey(occurrenceKey);
    if (!parsed.regimenId || !parsed.dateKey || !parsed.time) return;

    UndoManager.capture();
    const regimens = DataService.getLocalRegimens();
    const regimen = regimens.find((item) => item.id === parsed.regimenId);
    if (!regimen) return;

    const doseKey = `${parsed.dateKey}_${parsed.time}`;
    regimen.doseLog = regimen.doseLog || {};

    if (regimen.doseLog[doseKey] && regimen.doseLog[doseKey].status === "taken") {
        delete regimen.doseLog[doseKey];
    } else {
        regimen.doseLog[doseKey] = {
            status: "taken",
            takenAt: Date.now()
        };
    }

    regimen.updatedAt = Date.now();
    DataService.save(regimens);
    UndoManager.show("Dose status updated.");
};

window.deleteMedication = function (regimenId) {
    UndoManager.capture();
    const regimens = DataService.getLocalRegimens();
    const next = regimens.filter((item) => item.id !== regimenId);
    if (next.length === regimens.length) return;

    DataService.save(next);
    UndoManager.show("Medication regimen deleted.");
};

function setMedicationFormModeLabel() {
    const submitBtn = document.querySelector("#add-med-form button[type='submit']");
    if (!submitBtn) return;
    submitBtn.textContent = editingRegimenId ? "Update Schedule" : "Save Schedule";
}

function resetMedicationFormMode(clearFields) {
    editingRegimenId = null;
    setMedicationFormModeLabel();

    const form = document.getElementById("add-med-form");
    if (clearFields && form) {
        form.reset();
    }
}

window.editMedication = function (regimenId) {
    const regimens = DataService.getLocalRegimens();
    const regimen = regimens.find((item) => item.id === regimenId);
    if (!regimen) {
        showInAppBanner("Medication not found.", "warning");
        return;
    }

    const nameInput = document.getElementById("med-name");
    const amountInput = document.getElementById("med-amount");
    const unitInput = document.getElementById("med-unit");
    const freqInput = document.getElementById("med-frequency");
    const startInput = document.getElementById("med-start-date");
    const endInput = document.getElementById("med-end-date");

    if (!nameInput || !amountInput || !unitInput || !freqInput || !startInput || !endInput) {
        showInAppBanner("Edit form is unavailable.", "warning");
        return;
    }

    editingRegimenId = regimen.id;
    setMedicationFormModeLabel();
    window.switchView("add", true);

    nameInput.value = regimen.name || "";
    amountInput.value = regimen.amount || "1";
    unitInput.value = regimen.unit || "Tablet";
    freqInput.value = String((Array.isArray(regimen.times) && regimen.times.length) ? regimen.times.length : (Number(regimen.frequency) || 1));
    startInput.value = regimen.startDate || getTodayKey();
    endInput.value = regimen.endDate || addDays(startInput.value, 30);

    window.updateTimeInputs();
    const slots = document.querySelectorAll(".time-slot");
    const times = Array.isArray(regimen.times) ? regimen.times : [];
    slots.forEach((slot, index) => {
        if (times[index]) slot.value = times[index];
    });
};

window.updateTimeInputs = function () {
    const freq = Number(document.getElementById("med-frequency").value || 1);
    const container = document.getElementById("time-slots-container");
    if (!container) return;

    container.innerHTML = "";
    for (let i = 0; i < freq; i += 1) {
        const wrapper = document.createElement("div");
        wrapper.className = "time-input-wrapper";
        wrapper.innerHTML = `
            <i class="ph ph-clock"></i>
            <input type="time" class="time-slot" value="${DEFAULT_TIME_SLOTS[i] || "08:00"}">
        `;
        container.appendChild(wrapper);
    }
};

window.switchView = function (viewName, preserveMedicationFormState) {
    const views = {
        dashboard: document.getElementById("view-dashboard"),
        add: document.getElementById("view-add"),
        profile: document.getElementById("view-profile")
    };

    Object.values(views).forEach((view) => view && view.classList.add("hidden"));
    if (views[viewName]) views[viewName].classList.remove("hidden");

    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => item.classList.remove("active"));
    if (viewName === "dashboard" && navItems[0]) navItems[0].classList.add("active");
    if (viewName === "profile" && navItems[1]) navItems[1].classList.add("active");

    if (viewName === "add" && !preserveMedicationFormState) {
        resetMedicationFormMode(true);
        window.updateTimeInputs();
        setDefaultRegimenDates();
    }
};

window.filterMeds = function (type) {
    currentFilter = type;
    setActiveFilterButton(type);
    renderSchedule(DataService.getLocalRegimens());
};

function installFilterButtons() {
    const bar = document.getElementById("med-filter-bar");
    if (!bar) return;

    bar.innerHTML = "";
    ["today", "upcoming", "past"].forEach((type) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "filter-btn";
        btn.dataset.filter = type;
        btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        btn.onclick = () => window.filterMeds(type);
        bar.appendChild(btn);
    });

    setActiveFilterButton(currentFilter);
}

function setDefaultRegimenDates() {
    const startInput = document.getElementById("med-start-date");
    const endInput = document.getElementById("med-end-date");
    if (!startInput || !endInput) return;

    const today = getTodayKey();
    const next30 = addDays(today, 30);
    if (!startInput.value) startInput.value = today;
    if (!endInput.value) endInput.value = next30;
}

function bindRegimenDateValidation() {
    const startInput = document.getElementById("med-start-date");
    const endInput = document.getElementById("med-end-date");
    if (!startInput || !endInput) return;

    startInput.addEventListener("change", () => {
        if (!endInput.value || compareDateKeys(endInput.value, startInput.value) < 0) {
            endInput.value = addDays(startInput.value, 30);
        }
        endInput.min = startInput.value;
    });

    endInput.addEventListener("change", () => {
        if (startInput.value && compareDateKeys(endInput.value, startInput.value) < 0) {
            endInput.value = startInput.value;
        }
    });

    endInput.min = startInput.value;
}

function bindMedicationForm() {
    const form = document.getElementById("add-med-form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = String(document.getElementById("med-name").value || "").trim();
        const amount = String(document.getElementById("med-amount").value || "1").trim();
        const unit = String(document.getElementById("med-unit").value || "Tablet").trim();
        const frequency = Number(document.getElementById("med-frequency").value || 1);
        const startDate = String(document.getElementById("med-start-date").value || "");
        const endDate = String(document.getElementById("med-end-date").value || "");

        const rawTimes = Array.from(document.querySelectorAll(".time-slot"))
            .map((input) => String(input.value || "").trim())
            .filter(isTimeValue);
        const times = Array.from(new Set(rawTimes)).sort();

        if (!name) {
            showInAppBanner("Medication name is required.", "warning");
            return;
        }
        if (!startDate || !endDate) {
            showInAppBanner("Please set start and end dates.", "warning");
            return;
        }
        if (compareDateKeys(endDate, startDate) < 0) {
            showInAppBanner("End date cannot be before start date.", "warning");
            return;
        }
        if (!times.length) {
            showInAppBanner("Add at least one intake time.", "warning");
            return;
        }

        UndoManager.capture();
        const regimens = DataService.getLocalRegimens();

        if (editingRegimenId) {
            const existingIndex = regimens.findIndex((item) => item.id === editingRegimenId);
            if (existingIndex >= 0) {
                const existing = regimens[existingIndex];
                regimens[existingIndex] = {
                    ...existing,
                    name,
                    amount,
                    unit,
                    frequency: Number(frequency) || times.length,
                    times,
                    startDate,
                    endDate,
                    status: "active",
                    updatedAt: Date.now()
                };
                DataService.save(regimens);
                UndoManager.show("Medication regimen updated.");
            } else {
                const regimen = {
                    id: makeId("regimen"),
                    name,
                    amount,
                    unit,
                    frequency: Number(frequency) || times.length,
                    times,
                    startDate,
                    endDate,
                    status: "active",
                    doseLog: {},
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                DataService.save([...regimens, regimen]);
                UndoManager.show("Medication regimen saved.");
            }
        } else {
            const regimen = {
                id: makeId("regimen"),
                name,
                amount,
                unit,
                frequency: Number(frequency) || times.length,
                times,
                startDate,
                endDate,
                status: "active",
                doseLog: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            DataService.save([...regimens, regimen]);
            UndoManager.show("Medication regimen saved.");
        }

        form.reset();
        resetMedicationFormMode(false);
        window.updateTimeInputs();
        setDefaultRegimenDates();
        window.switchView("dashboard");
    });
}

function bindProfileForm() {
    // ================= REAL PROFILE MODAL LOGIC =================
    const profileModal = document.getElementById("profile-modal");
    const editProfileBtn = document.getElementById("edit-profile-btn");
    const profileAvatarBtn = document.getElementById("profile-avatar");
    const closeProfileBtn = document.getElementById("cancel-profile-btn");
    const profileForm = document.getElementById("profile-edit-form") || document.getElementById("profile-form");

    if (!profileModal || !closeProfileBtn || !profileForm) return;

    const ageInput = document.getElementById("profile-input-age");
    const weightInput = document.getElementById("profile-input-weight");
    const bloodInput = document.getElementById("profile-input-blood");
    const nameInput = document.getElementById("profile-input-name");

    const closeModal = () => {
        profileModal.classList.add("hidden");
    };

    const openModal = () => {
        profileModal.classList.remove("hidden");

        const cachedProfile = JSON.parse(localStorage.getItem("cached_profile") || "{}");
        const currentProfile = typeof ProfileService.getCurrent === "function" ? ProfileService.getCurrent() : {};
        const currentData = { ...cachedProfile, ...currentProfile };

        if (ageInput) ageInput.value = currentData.age || "";
        if (weightInput) weightInput.value = currentData.weight || "";
        if (bloodInput) bloodInput.value = currentData.blood || currentData.bloodGroup || "";
        if (nameInput) nameInput.value = currentData.fullName || "";
    };

    if (editProfileBtn) {
        editProfileBtn.addEventListener("click", openModal);
    }

    if (profileAvatarBtn) {
        profileAvatarBtn.addEventListener("click", openModal);
    }

    closeProfileBtn.addEventListener("click", closeModal);
    profileModal.addEventListener("click", (event) => {
        if (event.target === profileModal) closeModal();
    });

    profileForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const newAge = ageInput ? ageInput.value : "";
        const newWeight = weightInput ? weightInput.value : "";
        const newBlood = bloodInput ? bloodInput.value : "";
        const fullName = nameInput ? String(nameInput.value || "").trim() : undefined;

        ProfileService.save({
            ...(fullName ? { fullName } : {}),
            age: newAge,
            weight: newWeight,
            blood: newBlood,
            bloodGroup: newBlood
        });

        localStorage.setItem("cached_profile", JSON.stringify({
            ...(fullName ? { fullName } : {}),
            age: newAge,
            weight: newWeight,
            blood: newBlood
        }));

        closeModal();
        alert("Profile Updated! ✅");
    });
}

function setDateLabel() {
    const dateEl = document.getElementById("current-date");
    if (!dateEl) return;
    dateEl.textContent = new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric"
    });
}

function bindSyncEvents() {
    window.addEventListener("online", () => {
        DataService.pushToCloud(DataService.getLocalRegimens());
        ProfileService.pushToCloud(ProfileService.getCurrent());
    });
}

// ================= 10. APP SETTINGS & SHARING =================
function playTestNotificationSound() {
    if (!NotificationSystem || typeof NotificationSystem.playTestSound !== "function") {
        showInAppBanner("Sound system unavailable.", "warning");
        return;
    }

    NotificationSystem.playTestSound()
        .then(() => showInAppBanner("Notification sound is enabled.", "info"))
        .catch(() => showInAppBanner("Tap Test Sound again to allow browser audio.", "warning"));
}

function setSharingPatientId(uid) {
    const idInput = document.getElementById("my-patient-id");
    if (idInput) idInput.value = String(uid || "");
}

async function copySharingPatientId() {
    const idInput = document.getElementById("my-patient-id");
    const raw = idInput ? String(idInput.value || "").trim() : "";
    if (!raw) {
        showInAppBanner("Patient ID is empty.", "warning");
        return;
    }

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(raw);
        } else if (idInput) {
            idInput.focus();
            idInput.select();
            document.execCommand("copy");
            idInput.setSelectionRange(0, 0);
            idInput.blur();
        } else {
            throw new Error("No input available");
        }
        showInAppBanner("Patient ID copied.", "info");
    } catch (error) {
        showInAppBanner("Unable to copy. Please copy manually.", "warning");
    }
}

function bindAppSettingsAndSharing() {
    const testSoundBtn = document.getElementById("test-sound-btn");
    const copyIdBtn = document.getElementById("copy-patient-id-btn");

    if (testSoundBtn) {
        testSoundBtn.addEventListener("click", playTestNotificationSound);
    }
    if (copyIdBtn) {
        copyIdBtn.addEventListener("click", () => {
            copySharingPatientId();
        });
    }
}

// ================= 11. BOOTSTRAP =================
document.addEventListener("DOMContentLoaded", () => {
    window.updateTimeInputs();
    setDefaultRegimenDates();
    bindRegimenDateValidation();
    installFilterButtons();
    bindMedicationForm();
    bindProfileForm();
    bindAppSettingsAndSharing();
    setDateLabel();
    NotificationSystem.start();
    bindSyncEvents();

    auth.onAuthStateChanged((user) => {
        const uid = (user && user.uid) || "test_patient_001";
        DataService.init(uid);
        ProfileService.init(user || null);
        NotificationSystem.setUser(uid);
        setSharingPatientId(uid);
    });
});
