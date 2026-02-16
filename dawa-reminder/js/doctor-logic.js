// ================= 1. FIREBASE CONFIGURATION =================
// Replace placeholders with your Firebase project keys.
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

const db = typeof firebase !== "undefined" ? firebase.database() : null;
const DOCTOR_RECENTS_KEY = "doctor_recents";
const DOCTOR_REPORT_CACHE_KEY = "doctor_report_cache_v1";
const DOCTOR_TAB_TO_PANEL = {
    live: "doctor-live-panel",
    weekly: "doctor-weekly-panel",
    monthly: "doctor-monthly-panel"
};

let activeDoctorPatientId = "";
let currentDoctorUser = null;

function readJson(key, fallback) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
        return fallback;
    }
}

function toArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === "object") return Object.values(value).filter(Boolean);
    return [];
}

function getInitials(value, fallback) {
    const text = String(value || "").trim();
    if (!text) return fallback || "DR";
    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return fallback || "DR";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function isTimeValue(value) {
    return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function getTodayKey() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function getPastDateKeys(days) {
    const keys = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i += 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        keys.push(formatDateKey(date));
    }

    return keys;
}

function formatShortDate(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric"
    });
}

function compareDateKeys(a, b) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
}

function isRegimenActiveOnDate(regimen, dateKey) {
    if (!regimen || typeof regimen !== "object") return false;
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(regimen.startDate || "")) ? regimen.startDate : dateKey;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(regimen.endDate || "")) ? regimen.endDate : dateKey;
    return compareDateKeys(dateKey, startDate) >= 0 && compareDateKeys(dateKey, endDate) <= 0;
}

function normalizeMedication(item) {
    return {
        id: String(item.id || `med_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
        name: String(item.name || "Medication").trim(),
        amount: String(item.amount || "1").trim(),
        unit: String(item.unit || "Tablet").trim(),
        time: isTimeValue(item.time) ? item.time : "08:00",
        taken: item.taken === true
    };
}

function regimensToMedicationRows(regimens, dateKey) {
    const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) ? dateKey : getTodayKey();
    const rows = [];

    toArray(regimens).forEach((regimen) => {
        if (!regimen || typeof regimen !== "object") return;
        if (regimen.status === "completed") return;
        if (!isRegimenActiveOnDate(regimen, dayKey)) return;

        const times = Array.isArray(regimen.times) ? regimen.times.filter(isTimeValue) : [];
        const usableTimes = times.length ? times : (isTimeValue(regimen.time) ? [regimen.time] : ["08:00"]);
        const doseLog = regimen.doseLog && typeof regimen.doseLog === "object" ? regimen.doseLog : {};

        usableTimes.forEach((time) => {
            const doseKey = `${dayKey}_${time}`;
            const isTaken = Boolean(doseLog[doseKey] && doseLog[doseKey].status === "taken");
            rows.push({
                id: `${String(regimen.id || "regimen")}_${dayKey}_${time}`,
                name: String(regimen.name || "Medication").trim(),
                amount: String(regimen.amount || "1").trim(),
                unit: String(regimen.unit || "Tablet").trim(),
                time,
                taken: isTaken
            });
        });
    });

    return rows.sort((a, b) => a.time.localeCompare(b.time));
}

function calculateAdherenceFromMedicationRows(rows) {
    const total = rows.length;
    const taken = rows.filter((item) => item.taken).length;
    const score = total ? Math.round((taken / total) * 100) : 0;
    return { taken, total, score };
}

function getTakenState(entry) {
    if (typeof entry === "boolean") return entry;
    if (!entry || typeof entry !== "object") return null;

    if (typeof entry.taken === "boolean") return entry.taken;
    if (typeof entry.status === "string") return entry.status.toLowerCase() === "taken";

    return null;
}

function calculateAdherenceFromDoseCollection(collection) {
    const entries = toArray(collection);
    let taken = 0;
    let total = 0;

    entries.forEach((entry) => {
        const state = getTakenState(entry);
        if (state === null) return;
        total += 1;
        if (state) taken += 1;
    });

    const score = total ? Math.round((taken / total) * 100) : 0;
    return { taken, total, score };
}

function calculateAdherenceFromDayData(dayData, dateKey) {
    if (!dayData) return { taken: 0, total: 0, score: 0 };

    if (typeof dayData.taken === "number" && typeof dayData.total === "number") {
        const taken = Math.max(0, Number(dayData.taken) || 0);
        const total = Math.max(0, Number(dayData.total) || 0);
        const score = total ? Math.round((taken / total) * 100) : 0;
        return { taken, total, score };
    }

    if (Object.prototype.hasOwnProperty.call(dayData, "doses")) {
        const doseMetrics = calculateAdherenceFromDoseCollection(dayData.doses);
        if (doseMetrics.total > 0) return doseMetrics;
    }

    const directMetrics = calculateAdherenceFromDoseCollection(dayData);
    if (directMetrics.total > 0) return directMetrics;

    if (dayData.regimens) {
        return calculateAdherenceFromMedicationRows(regimensToMedicationRows(dayData.regimens, dateKey));
    }

    return calculateAdherenceFromMedicationRows(regimensToMedicationRows(dayData, dateKey));
}

async function fetchAdherenceSeries(patientId, dayCount) {
    const dateKeys = getPastDateKeys(dayCount);
    try {
        if (!db) throw new Error("Firebase unavailable");

        const dayEntries = await Promise.all(dateKeys.map(async (dateKey) => {
            const historySnap = await db.ref(`users/${patientId}/history/${dateKey}`).once("value");
            return {
                dateKey,
                dayData: historySnap.val()
            };
        }));

        const needsFallback = dayEntries.some((entry) => !hasDataRecord(entry.dayData));

        let fallbackRegimens = [];
        if (needsFallback) {
            const regimensSnap = await db.ref(`users/${patientId}/regimens`).once("value");
            fallbackRegimens = toArray(regimensSnap.val());
        }

        const series = dayEntries.map(({ dateKey, dayData }) => {
            let metrics = calculateAdherenceFromDayData(dayData, dateKey);

            if (metrics.total === 0 && fallbackRegimens.length) {
                metrics = calculateAdherenceFromMedicationRows(regimensToMedicationRows(fallbackRegimens, dateKey));
            }

            return {
                dateKey,
                taken: metrics.taken,
                total: metrics.total,
                score: metrics.score
            };
        });

        writeCachedReportSeries(patientId, dayCount, series);
        return series;
    } catch (error) {
        const cachedSeries = readCachedReportSeries(patientId, dayCount);
        if (cachedSeries.length) return cachedSeries;
        throw error;
    }
}

function getRecents() {
    const raw = readJson(DOCTOR_RECENTS_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && item.id).slice(0, 10);
}

function saveRecents(items) {
    localStorage.setItem(DOCTOR_RECENTS_KEY, JSON.stringify(items.slice(0, 10)));
}

function getReportCache() {
    const raw = readJson(DOCTOR_REPORT_CACHE_KEY, {});
    return raw && typeof raw === "object" ? raw : {};
}

function saveReportCache(cache) {
    localStorage.setItem(DOCTOR_REPORT_CACHE_KEY, JSON.stringify(cache || {}));
}

function buildReportCacheKey(patientId, dayCount) {
    return `${String(patientId || "")}_${Number(dayCount) || 0}`;
}

function readCachedReportSeries(patientId, dayCount) {
    const cache = getReportCache();
    const key = buildReportCacheKey(patientId, dayCount);
    const value = cache[key];
    return Array.isArray(value) ? value : [];
}

function writeCachedReportSeries(patientId, dayCount, series) {
    const rows = Array.isArray(series) ? series : [];
    const cache = getReportCache();
    const key = buildReportCacheKey(patientId, dayCount);
    cache[key] = rows;
    saveReportCache(cache);
}

function hasDataRecord(value) {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
}

function setSearchStatus(message, warning) {
    const statusEl = document.getElementById("doctor-search-status");
    if (!statusEl) return;

    statusEl.textContent = message;
    if (warning) {
        statusEl.style.background = "#fee2e2";
        statusEl.style.color = "#b91c1c";
    } else {
        statusEl.style.background = "#e2e8f0";
        statusEl.style.color = "#475569";
    }
}

function normalizePatientCode(value) {
    const token = String(value || "").trim().replace(/\s+/g, "");
    if (!token) return "";
    const upper = token.toUpperCase();
    return upper.startsWith("#") ? upper : `#${upper}`;
}

function parsePermissionError(error) {
    const text = String((error && (error.code || error.message)) || "");
    return /permission|denied|unauthorized/i.test(text);
}

async function resolvePatientUid(rawInput) {
    const token = String(rawInput || "").trim();
    if (!token || !db) return "";

    const directSnap = await db.ref(`users/${token}`).once("value");
    if (directSnap.exists()) return token;

    const targetPatientCode = normalizePatientCode(token);
    if (!targetPatientCode) return "";
    const byPatientIdSnap = await db
        .ref("users")
        .orderByChild("profile/patientId")
        .equalTo(targetPatientCode)
        .limitToFirst(1)
        .once("value");
    const byPatientIdValue = byPatientIdSnap.val();
    if (byPatientIdValue && typeof byPatientIdValue === "object") {
        const matched = Object.keys(byPatientIdValue)[0];
        if (matched) return matched;
    }

    return "";
}

function bindDoctorAuthGuard() {
    if (typeof firebase === "undefined" || typeof firebase.auth !== "function") return;

    firebase.auth().onAuthStateChanged((user) => {
        if (!user) {
            currentDoctorUser = null;
            renderDoctorProfile(null);
            setSearchStatus("Session not found. Please sign in again from Login.", true);
            return;
        }

        currentDoctorUser = user;
        renderDoctorProfile(user);
    });
}

function renderDoctorProfile(user) {
    const profileUser = user || currentDoctorUser;
    const displayName = String((profileUser && profileUser.displayName) || "").trim();
    const email = String((profileUser && profileUser.email) || "").trim();
    const uid = String((profileUser && profileUser.uid) || "").trim();
    const fallbackName = email ? email.split("@")[0] : "Doctor";
    const fullName = displayName || fallbackName || "Doctor";
    const initials = getInitials(fullName, "DR");

    const headerAvatar = document.getElementById("doctor-profile-avatar");
    const modalAvatar = document.getElementById("doctor-profile-avatar-large");
    const nameEl = document.getElementById("doctor-profile-name");
    const emailEl = document.getElementById("doctor-profile-email");
    const uidEl = document.getElementById("doctor-profile-uid");

    if (headerAvatar) headerAvatar.textContent = initials;
    if (modalAvatar) modalAvatar.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email || "No email available";
    if (uidEl) uidEl.textContent = `UID: ${uid || "--"}`;
}

function openDoctorProfileModal() {
    const modal = document.getElementById("doctor-profile-modal");
    if (!modal) return;
    renderDoctorProfile(currentDoctorUser);
    modal.classList.remove("hidden");
}

function closeDoctorProfileModal() {
    const modal = document.getElementById("doctor-profile-modal");
    if (!modal) return;
    modal.classList.add("hidden");
}

async function logoutDoctor() {
    try {
        if (typeof firebase !== "undefined" && typeof firebase.auth === "function") {
            await firebase.auth().signOut();
        }
    } catch (error) {
        // Continue with redirect even if sign-out call fails.
    }
    window.location.href = "index.html";
}

function bindDoctorProfileActions() {
    const avatar = document.getElementById("doctor-profile-avatar");
    const closeBtn = document.getElementById("doctor-profile-close-btn");
    const logoutBtn = document.getElementById("doctor-logout-btn");
    const modal = document.getElementById("doctor-profile-modal");

    if (avatar) {
        avatar.addEventListener("click", openDoctorProfileModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", closeDoctorProfileModal);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            void logoutDoctor();
        });
    }

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeDoctorProfileModal();
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeDoctorProfileModal();
        }
    });
}

function renderRecentPatients() {
    const container = document.getElementById("recent-patients");
    if (!container) return;

    const recents = getRecents();
    container.innerHTML = "";

    if (!recents.length) {
        container.innerHTML = "<p style='color:#64748b;'>No recent patients yet.</p>";
        return;
    }

    recents.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "menu-toggle-btn";
        btn.textContent = `${item.name || "Patient"} (${item.id.slice(0, 8)}...)`;
        btn.title = item.id;
        btn.addEventListener("click", () => {
            const input = document.getElementById("patient-id-input");
            if (input) input.value = item.id;
            loadPatient(item.id);
        });
        container.appendChild(btn);
    });
}

function upsertRecentPatient(id, name) {
    const next = getRecents().filter((item) => item.id !== id);
    next.unshift({
        id,
        name: name || `Patient ${id.slice(0, 6)}`
    });
    saveRecents(next);
    renderRecentPatients();
}

function updateDoctorProgress(percent) {
    const textEl = document.getElementById("doctor-progress-percent");
    if (textEl) textEl.textContent = `${percent}%`;

    const ring = document.getElementById("doctor-progress-ring");
    if (!ring) return;

    const radius = ring.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    ring.style.strokeDashoffset = circumference - (percent / 100) * circumference;
}

function renderMedicationList(meds) {
    const container = document.getElementById("doctor-med-list");
    if (!container) return;

    container.innerHTML = "";
    if (!meds.length) {
        container.innerHTML = "<p style='text-align:center; color:#64748b; margin-top:20px;'>No medication records available.</p>";
        return;
    }

    meds.forEach((med) => {
        const card = document.createElement("div");
        card.className = `med-card ${med.taken ? "completed" : ""}`;
        card.innerHTML = `
            <div class="med-info">
                <div class="med-icon"><i class="ph-fill ph-pill"></i></div>
                <div>
                    <h4>${med.name}</h4>
                    <p>${med.amount} ${med.unit} | <strong>${med.time}</strong></p>
                </div>
            </div>
            <div class="card-actions" aria-label="${med.taken ? "Taken" : "Pending"}">
                <i class="${med.taken ? "ph-fill ph-check-circle" : "ph ph-clock"}" style="font-size:28px; color:${med.taken ? "#10b981" : "#94a3b8"};"></i>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderWeeklyReport(series) {
    const container = document.getElementById("doctor-weekly-report");
    if (!container) return;

    container.innerHTML = "";
    if (!series.length) {
        container.innerHTML = "<p style='text-align:center; color:#64748b;'>No weekly report data available.</p>";
        return;
    }

    const chart = document.createElement("div");
    chart.className = "doctor-weekly-chart";

    series.forEach((day) => {
        const row = document.createElement("div");
        row.className = "doctor-weekly-row";

        const label = document.createElement("span");
        label.className = "doctor-weekly-date";
        label.textContent = formatShortDate(day.dateKey);

        const track = document.createElement("div");
        track.className = "doctor-weekly-track";

        const bar = document.createElement("div");
        bar.className = "doctor-weekly-bar";
        if (day.score >= 80) bar.classList.add("good");
        else if (day.score >= 50) bar.classList.add("mid");
        else bar.classList.add("low");
        bar.style.width = `${day.score}%`;
        track.appendChild(bar);

        const value = document.createElement("span");
        value.className = "doctor-weekly-value";
        value.textContent = `${day.score}% (${day.taken}/${day.total})`;

        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        chart.appendChild(row);
    });

    container.appendChild(chart);
}

function renderMonthlyReport(series) {
    const summaryEl = document.getElementById("doctor-monthly-summary");
    const historyEl = document.getElementById("doctor-monthly-history");
    if (!summaryEl || !historyEl) return;

    historyEl.innerHTML = "";
    if (!series.length) {
        summaryEl.textContent = "Monthly Average: 0%";
        historyEl.innerHTML = "<p style='text-align:center; color:#64748b;'>No monthly history data available.</p>";
        return;
    }

    const totals = series.reduce((acc, day) => {
        acc.taken += day.taken;
        acc.total += day.total;
        return acc;
    }, { taken: 0, total: 0 });

    const monthlyAverage = totals.total ? Math.round((totals.taken / totals.total) * 100) : 0;
    summaryEl.textContent = `Monthly Average: ${monthlyAverage}%`;

    series.forEach((day) => {
        const row = document.createElement("div");
        row.className = "doctor-history-row";

        const dateCell = document.createElement("span");
        dateCell.className = "doctor-history-date";
        dateCell.textContent = formatShortDate(day.dateKey);

        const valueCell = document.createElement("span");
        valueCell.className = "doctor-history-value";
        valueCell.textContent = `${day.score}% (${day.taken}/${day.total})`;

        row.appendChild(dateCell);
        row.appendChild(valueCell);
        historyEl.appendChild(row);
    });
}

async function loadWeeklyReport(patientId) {
    const container = document.getElementById("doctor-weekly-report");
    if (!container) return;

    if (!patientId) {
        container.innerHTML = "<p style='text-align:center; color:#64748b;'>Search for a patient to view weekly report.</p>";
        return;
    }

    container.innerHTML = "<p style='text-align:center; color:#64748b;'>Loading weekly report...</p>";

    try {
        const series = await fetchAdherenceSeries(patientId, 7);
        renderWeeklyReport(series);
    } catch (error) {
        container.innerHTML = "<p style='text-align:center; color:#b91c1c;'>Unable to load weekly report.</p>";
    }
}

async function loadMonthlyReport(patientId) {
    const summaryEl = document.getElementById("doctor-monthly-summary");
    const historyEl = document.getElementById("doctor-monthly-history");
    if (!summaryEl || !historyEl) return;

    if (!patientId) {
        summaryEl.textContent = "Monthly Average: 0%";
        historyEl.innerHTML = "<p style='text-align:center; color:#64748b;'>Search for a patient to view monthly history.</p>";
        return;
    }

    summaryEl.textContent = "Monthly Average: --";
    historyEl.innerHTML = "<p style='text-align:center; color:#64748b;'>Loading monthly history...</p>";

    try {
        const series = await fetchAdherenceSeries(patientId, 30);
        renderMonthlyReport(series);
    } catch (error) {
        summaryEl.textContent = "Monthly Average: 0%";
        historyEl.innerHTML = "<p style='text-align:center; color:#b91c1c;'>Unable to load monthly history.</p>";
    }
}

function setActiveDoctorTab(tabKey) {
    const nextTab = DOCTOR_TAB_TO_PANEL[tabKey] ? tabKey : "live";
    const tabButtons = document.querySelectorAll(".doctor-tab");

    tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === nextTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    Object.keys(DOCTOR_TAB_TO_PANEL).forEach((key) => {
        const panel = document.getElementById(DOCTOR_TAB_TO_PANEL[key]);
        if (!panel) return;
        panel.classList.toggle("hidden", key !== nextTab);
    });
}

function renderPatientSummary(patientUid, profile, medications) {
    const profileData = profile && typeof profile === "object" ? profile : {};
    const fullName = profileData.fullName || profileData.name || `Patient ${patientUid.slice(0, 6)}`;
    const age = profileData.age || "--";
    const blood = profileData.bloodGroup || profileData.blood || "--";
    const profilePatientId = String(profileData.patientId || "").trim();

    const nameEl = document.getElementById("doctor-patient-name");
    const idEl = document.getElementById("doctor-patient-id");
    const ageEl = document.getElementById("doctor-age");
    const bloodEl = document.getElementById("doctor-blood");
    const totalEl = document.getElementById("doctor-total-doses");

    if (nameEl) nameEl.textContent = fullName;
    if (idEl) idEl.textContent = profilePatientId || patientUid;
    if (ageEl) ageEl.textContent = String(age);
    if (bloodEl) bloodEl.textContent = String(blood);
    if (totalEl) totalEl.textContent = String(medications.length);

    const takenCount = medications.filter((item) => item.taken).length;
    const percent = medications.length ? Math.round((takenCount / medications.length) * 100) : 0;
    updateDoctorProgress(percent);
    renderMedicationList(medications);

    const searchArea = document.getElementById("doctor-search-area");
    const patientView = document.getElementById("doctor-patient-view");
    if (searchArea) searchArea.classList.add("hidden");
    if (patientView) patientView.classList.remove("hidden");

    setActiveDoctorTab("live");
    upsertRecentPatient(patientUid, fullName);
}

async function loadPatient(rawId) {
    const patientInput = String(rawId || "").trim();
    if (!patientInput) {
        setSearchStatus("Please enter a patient ID.", true);
        return;
    }
    if (!db) {
        setSearchStatus("Firebase is unavailable on this page.", true);
        return;
    }

    setSearchStatus("Loading patient data...", false);

    try {
        const patientUid = await resolvePatientUid(patientInput);
        if (!patientUid) {
            setSearchStatus("No patient found. Use Firebase UID or the profile Patient ID (e.g. #ABC123).", true);
            return;
        }

        const profileRef = db.ref(`users/${patientUid}/profile`);
        const medsRef = db.ref(`users/${patientUid}/medications`);
        const [profileSnap, medsSnap] = await Promise.all([
            profileRef.once("value"),
            medsRef.once("value")
        ]);

        const profile = profileSnap.val();
        let medications = toArray(medsSnap.val()).map(normalizeMedication);

        if (!medications.length) {
            const regimensSnap = await db.ref(`users/${patientUid}/regimens`).once("value");
            medications = regimensToMedicationRows(regimensSnap.val(), getTodayKey());
        }

        const hasProfile = Boolean(profile && typeof profile === "object");
        const hasMeds = medications.length > 0;
        if (!hasProfile && !hasMeds) {
            setSearchStatus("Patient exists but has no profile or medication data yet.", true);
            return;
        }

        activeDoctorPatientId = patientUid;
        renderPatientSummary(patientUid, profile, medications);
        setSearchStatus("Patient data loaded.", false);

        void loadWeeklyReport(patientUid);
        void loadMonthlyReport(patientUid);
    } catch (error) {
        if (parsePermissionError(error)) {
            setSearchStatus("Permission denied. Ensure doctor account has Firebase read access and is logged in.", true);
            return;
        }
        setSearchStatus("Failed to load patient data. Check ID format and connection.", true);
    }
}

function bindDoctorSearch() {
    const form = document.getElementById("doctor-search-form");
    const searchBtn = document.getElementById("search-patient-btn");
    const input = document.getElementById("patient-id-input");
    const searchAgainBtn = document.getElementById("doctor-search-again-btn");

    if (form) {
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            loadPatient(input ? input.value : "");
        });
    }

    if (searchBtn && !form) {
        searchBtn.addEventListener("click", () => {
            loadPatient(input ? input.value : "");
        });
    }

    if (searchAgainBtn) {
        searchAgainBtn.addEventListener("click", () => {
            const searchArea = document.getElementById("doctor-search-area");
            const patientView = document.getElementById("doctor-patient-view");
            if (searchArea) searchArea.classList.remove("hidden");
            if (patientView) patientView.classList.add("hidden");
            if (input) input.focus();
            activeDoctorPatientId = "";
            setActiveDoctorTab("live");
        });
    }
}

function bindDoctorTabs() {
    const tabButtons = document.querySelectorAll(".doctor-tab");
    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const nextTab = button.dataset.tab || "live";
            setActiveDoctorTab(nextTab);

            if (!activeDoctorPatientId) return;
            if (nextTab === "weekly") {
                void loadWeeklyReport(activeDoctorPatientId);
            } else if (nextTab === "monthly") {
                void loadMonthlyReport(activeDoctorPatientId);
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    bindDoctorAuthGuard();
    bindDoctorProfileActions();
    renderDoctorProfile(null);
    bindDoctorSearch();
    bindDoctorTabs();
    renderRecentPatients();
    setActiveDoctorTab("live");
    setSearchStatus("Enter a Patient ID to begin.", false);
});

window.loadPatient = loadPatient;
window.loadWeeklyReport = loadWeeklyReport;
window.loadMonthlyReport = loadMonthlyReport;
window.logoutDoctor = logoutDoctor;
