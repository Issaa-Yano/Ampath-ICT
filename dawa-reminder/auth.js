import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 1. YOUR FIREBASE CONFIG
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
const errorDisplay = document.getElementById('error-message');

// 2. EYE ICON "HOLD-TO-PEEK" LOGIC
const setupPeekToggle = (eyeId, passwordId) => {
    const eye = document.getElementById(eyeId);
    const passInput = document.getElementById(passwordId);

    const showPassword = () => {
        passInput.type = 'text';
        eye.classList.remove('fa-eye');
        eye.classList.add('fa-eye-slash');
    };

    const hidePassword = () => {
        passInput.type = 'password';
        eye.classList.remove('fa-eye-slash');
        eye.classList.add('fa-eye');
    };

    // When the mouse button is pressed down
    eye.addEventListener('mousedown', showPassword);

    // When the mouse button is released
    eye.addEventListener('mouseup', hidePassword);

    // Security: hide if the mouse leaves the icon while still holding
    eye.addEventListener('mouseleave', hidePassword);

    // Support for touch screens (Mobile users)
    eye.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevents right-click menus on mobile
        showPassword();
    });
    eye.addEventListener('touchend', hidePassword);
};

// Initialize for both forms
setupPeekToggle('eye-login', 'login-password');
setupPeekToggle('eye-signup', 'signup-password');

// 3. SIGN UP LOGIC
document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const pw = document.getElementById('signup-password').value;
    
    createUserWithEmailAndPassword(auth, email, pw)
        .then(() => window.location.href = "dashboard.html")
        .catch(err => errorDisplay.innerText = "Signup failed: " + err.message);
});

// 4. SIGN IN LOGIC
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pw = document.getElementById('login-password').value;
    
    signInWithEmailAndPassword(auth, email, pw)
        .then(() => window.location.href = "dashboard.html")
        .catch(err => errorDisplay.innerText = "Wrong email or password.");
});