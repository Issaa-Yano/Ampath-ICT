import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDOOlaIJL1A5trkzQ-Lz_8vn4eNsN-XzG8",
    authDomain: "dawa-login-c01b3.firebaseapp.com",
    projectId: "dawa-login-c01b3",
    storageBucket: "dawa-login-c01b3.appspot.com",
    messagingSenderId: "1012681172444",
    appId: "1:1012681172444:web:cf477ce6e592ab7c309b19"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const form = document.getElementById("unified-login-form");
const errorEl = document.getElementById("error-message");
const submitBtn = document.getElementById("login-submit-btn");
const titleEl = document.getElementById("auth-title");

const patientBtn = document.getElementById("patient-mode-btn");
const doctorBtn = document.getElementById("doctor-mode-btn");
const doctorFields = document.getElementById("doctor-extra-fields");
const toggleTextEl = document.getElementById("auth-toggle-text");
const toggleLink = document.getElementById("auth-toggle-link");

const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const licenseInput = document.getElementById("doctor-license-id");
const nationalIdInput = document.getElementById("doctor-national-id");

const eye = document.getElementById("eye-login");

let activeMode = "patient";
let activeAction = "login";

function showError(message) {
    if (errorEl) errorEl.textContent = message || "";
}

function getIsDoctorMode() {
    return activeMode === "doctor";
}

function getRouteForMode() {
    return getIsDoctorMode() ? "doctor.html" : "dashboard.html";
}

function updateSubmitLabel() {
    if (!submitBtn) return;
    if (activeAction === "register") {
        submitBtn.textContent = getIsDoctorMode() ? "Create Doctor Account" : "Create Patient Account";
    } else {
        submitBtn.textContent = getIsDoctorMode() ? "Login to Doctor Portal" : "Login to Dashboard";
    }
}

function setMode(mode) {
    activeMode = mode === "doctor" ? "doctor" : "patient";
    const isDoctor = getIsDoctorMode();

    if (doctorFields) doctorFields.classList.toggle("hidden-field", !isDoctor);
    updateSubmitLabel();

    if (licenseInput) licenseInput.required = isDoctor;
    if (nationalIdInput) nationalIdInput.required = isDoctor;

    if (patientBtn) {
        patientBtn.classList.toggle("active", !isDoctor);
        patientBtn.setAttribute("aria-pressed", String(!isDoctor));
    }
    if (doctorBtn) {
        doctorBtn.classList.toggle("active", isDoctor);
        doctorBtn.setAttribute("aria-pressed", String(isDoctor));
    }

    showError("");
}

function setAction(action) {
    activeAction = action === "register" ? "register" : "login";

    if (titleEl) {
        titleEl.textContent = activeAction === "register" ? "Create Your Account" : "Unified Login Portal";
    }
    if (toggleTextEl) {
        toggleTextEl.textContent = activeAction === "register" ? "Already have an account?" : "New here?";
    }
    if (toggleLink) {
        toggleLink.textContent = activeAction === "register" ? "Sign In" : "Create Account";
    }

    updateSubmitLabel();
    showError("");
}

if (patientBtn) {
    patientBtn.addEventListener("click", () => setMode("patient"));
}
if (doctorBtn) {
    doctorBtn.addEventListener("click", () => setMode("doctor"));
}
if (toggleLink) {
    toggleLink.addEventListener("click", () => {
        setAction(activeAction === "login" ? "register" : "login");
    });
}

if (eye && passwordInput) {
    eye.addEventListener("click", () => {
        const showing = passwordInput.type === "text";
        passwordInput.type = showing ? "password" : "text";
        eye.classList.toggle("fa-eye", showing);
        eye.classList.toggle("fa-eye-slash", !showing);
    });
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        showError("");

        const email = String((emailInput && emailInput.value) || "").trim();
        const password = String((passwordInput && passwordInput.value) || "").trim();
        const licenseId = String((licenseInput && licenseInput.value) || "").trim();
        const nationalId = String((nationalIdInput && nationalIdInput.value) || "").trim();

        if (!email || !password) {
            showError("Email and password are required.");
            return;
        }

        if (getIsDoctorMode() && licenseId.length < 6) {
            showError("Medical License ID must be at least 6 characters.");
            return;
        }
        if (getIsDoctorMode() && !nationalId) {
            showError("National ID is required for Doctor Mode.");
            return;
        }
        if (activeAction === "register" && password.length < 6) {
            showError("Password must be at least 6 characters.");
            return;
        }

        try {
            if (activeAction === "register") {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            window.location.href = getRouteForMode();
        } catch (error) {
            const actionWord = activeAction === "register" ? "Account creation" : "Login";
            showError(error && error.message ? `${actionWord} failed: ${error.message}` : `${actionWord} failed. Please try again.`);
        }
    });
}

setMode("patient");
setAction("login");
