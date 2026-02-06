// ================= STATE MANAGEMENT =================
// This replaces React's useState
let medications = [
    // Initial Dummy Data
    { id: 1, name: "Paracetamol", dosage: "1 Tablet", time: "08:00", taken: true },
    { id: 2, name: "Vitamin D", dosage: "500mg", time: "14:00", taken: false },
    { id: 3, name: "Amoxil", dosage: "1 Tablet", time: "20:00", taken: false }
];

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', () => {
    renderDashboard();
    updateTimeInputs(); // Initialize form times
    
    // Set Date
    const options = { month: 'short', day: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', options);
});

// ================= VIEW SWITCHER =================
// Replaces React Conditional Rendering
function switchView(viewName) {
    const dash = document.getElementById('view-dashboard');
    const add = document.getElementById('view-add');

    if (viewName === 'add') {
        dash.classList.add('hidden');
        add.classList.remove('hidden');
    } else {
        add.classList.add('hidden');
        dash.classList.remove('hidden');
        renderDashboard(); // Re-render when coming back
    }
}

// ================= DASHBOARD LOGIC =================
// Replaces Dashboard.tsx logic
function renderDashboard() {
    const listContainer = document.getElementById('schedule-list');
    listContainer.innerHTML = ''; // Clear current list

    // 1. Calculate Progress (Replaces useMemo for percentage)
    const total = medications.length;
    const taken = medications.filter(m => m.taken).length;
    const percent = total === 0 ? 0 : Math.round((taken / total) * 100);
    
    // Update Text
    document.getElementById('progress-percent').textContent = `${percent}%`;
    document.getElementById('doses-remaining').textContent = `${total - taken} doses remaining today`;
    
    // Update SVG Ring
    const circle = document.getElementById('progress-ring');
    const circumference = 2 * Math.PI * 30; // r=30
    const offset = circumference - (percent / 100) * circumference;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;

    // 2. Group Doses (Replaces useMemo for grouping)
    // We define buckets based on time
    const groups = {
        'Morning 🌅': [],
        'Noon ☀️': [],
        'Evening 🌆': [],
        'Night 🌙': []
    };

    // Sort by time first
    medications.sort((a, b) => a.time.localeCompare(b.time));

    medications.forEach(med => {
        const hour = parseInt(med.time.split(':')[0]);
        if (hour < 12) groups['Morning 🌅'].push(med);
        else if (hour < 17) groups['Noon ☀️'].push(med);
        else if (hour < 21) groups['Evening 🌆'].push(med);
        else groups['Night 🌙'].push(med);
    });

    // 3. Render Groups to HTML
    for (const [groupName, meds] of Object.entries(groups)) {
        if (meds.length > 0) {
            // Group Header
            const groupHtml = `
                <div class="group-section">
                    <h3 class="group-title">${groupName}</h3>
                    ${meds.map(med => createMedCard(med)).join('')}
                </div>
            `;
            listContainer.innerHTML += groupHtml;
        }
    }
}

// Helper to create HTML string for a card
function createMedCard(med) {
    return `
        <div class="med-card ${med.taken ? 'completed' : ''}">
            <div class="med-info">
                <div class="med-icon">💊</div>
                <div>
                    <h4>${med.name}</h4>
                    <p>${med.dosage} • ${formatTime(med.time)}</p>
                </div>
            </div>
            <button class="btn-action" onclick="toggleTaken(${med.id})">
                ${med.taken ? '<i class="ph-bold ph-check"></i>' : 'Take'}
            </button>
        </div>
    `;
}

function formatTime(timeStr) {
    const [hour, min] = timeStr.split(':');
    const h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${min} ${ampm}`;
}

// Action: Toggle Taken Status
function toggleTaken(id) {
    const med = medications.find(m => m.id === id);
    if (med) {
        med.taken = !med.taken;
        renderDashboard(); // Re-render to show changes
    }
}

// ================= FORM LOGIC =================
// Replaces AddMedicationForm.tsx logic

// 1. Dynamic Time Inputs
function updateTimeInputs() {
    const freq = parseInt(document.getElementById('med-frequency').value);
    const container = document.getElementById('time-slots-container');
    container.innerHTML = '';

    // Default times based on frequency (Logic from your TSX)
    const defaults = ["08:00", "14:00", "20:00", "22:00"];

    for (let i = 0; i < freq; i++) {
        const input = document.createElement('div');
        input.className = 'time-input-wrapper';
        input.innerHTML = `
            <i class="ph ph-clock"></i>
            <input type="time" class="time-slot" value="${defaults[i] || '08:00'}">
        `;
        container.appendChild(input);
    }
}

// 2. Handle Submit
document.getElementById('add-med-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('med-name').value;
    const amount = document.getElementById('med-amount').value;
    const unit = document.getElementById('med-unit').value;
    
    // Get all times from generated inputs
    const timeInputs = document.querySelectorAll('.time-slot');
    
    timeInputs.forEach(input => {
        medications.push({
            id: Date.now() + Math.random(),
            name: name,
            dosage: `${amount} ${unit}`,
            time: input.value,
            taken: false
        });
    });

    // Reset and go back
    e.target.reset();
    switchView('dashboard');
});