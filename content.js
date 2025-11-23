// --- 1. DATA: COURSES ---
const courses = [
    { name: "Introduction to Computer Science", time: "M/W/F 9:30-10:45", grade: "91%", bg: "#B1C5FF" },
    { name: "New Product Development", time: "Th 3:30-6:00", grade: "88%", bg: "#B1FFB5" },
    { name: "Materials Science", time: "M/W/F 12:30-1:45", grade: "75%", bg: "#FFB1B2" },
    { name: "Fundamentals of Real Estate Analysis", time: "T/Th 9:30-10:45", grade: "94%", bg: "#FFD7B1" },
    { name: "Introduction to Macroeconomics", time: "M/W/F 11:00-11:50", grade: "92%", bg: "#D2B1FF" }
];

// --- 2. DATA: ASSIGNMENTS ---
const assignments = [
    { title: "Midterm Exam", date: "Tue, May 9, 2026", course: "Real Estate Analysis", bg: "#FFD7B1" },
    { title: "Project Presentation", date: "Fri, May 12, 2026", course: "Computer Science", bg: "#B1C5FF" },
    { title: "Lab Report Due", date: "Tue, May 16, 2026", course: "Real Estate Analysis", bg: "#FFD7B1" },
    { title: "Group Discussion", date: "Fri, May 19, 2026", course: "Macroeconomics", bg: "#D2B1FF" },
    { title: "Final Paper Due", date: "Fri, May 26, 2026", course: "Materials Science", bg: "#FFB1B2" }
];

// --- 3. STATE MANAGEMENT ---
let currentView = 'home'; // Options: 'home', 'connect', 'calendar', 'todo', 'profile', 'settings'

// --- 4. HTML GENERATORS ---

function getNavHTML() {
    // We add onclick handlers via class targeting later, so we use data-attributes here
    const getActive = (view) => currentView === view ? 'active' : '';
    
    return `
    <nav class="custom-nav">
        <div class="nav-group">
            <div class="nav-item ${getActive('home')}" data-view="home"><span>🏠</span> Home</div>
            <div class="nav-item ${getActive('connect')}" data-view="connect"><span>👥</span> Connect Your Classes</div>
            <div class="nav-item ${getActive('calendar')}" data-view="calendar"><span>📅</span> Calendar</div>
            <div class="nav-item ${getActive('todo')}" data-view="todo"><span>✅</span> Todo</div>
        </div>
        <div class="nav-group">
            <div class="nav-item ${getActive('profile')}" data-view="profile"><span>👤</span> Profile</div>
            <div class="nav-item ${getActive('settings')}" data-view="settings"><span>⚙️</span> Settings</div>
        </div>
    </nav>
    `;
}

// -- HOME VIEW GENERATORS --
function getHomeContent() {
    const courseHTML = courses.map(c => `
        <div class="course-pill" style="background-color: ${c.bg};">
            <div>
                <h3 class="course-title">${c.name}</h3>
                <p class="course-time">${c.time}</p>
            </div>
            <div class="course-grade">${c.grade}</div>
        </div>
    `).join('');

    const assignmentHTML = assignments.map(a => `
        <div class="assignment-item">
            <div class="assignment-top-row">
                <span>${a.title}</span>
                <span class="assignment-date">${a.date}</span>
            </div>
            <div class="assignment-course">${a.course}</div>
        </div>
    `).join('');

    return `
    <div class="dashboard-container">
        <!-- LEFT: Courses -->
        <div class="left-column">
            <div class="icon-row">
                <div class="icon-card">💬</div>
                <div class="icon-card">📄</div>
                <div class="icon-card">👥</div>
                <div class="icon-card">☰</div>
            </div>
            <div class="course-list">
                ${courseHTML}
            </div>
        </div>
        <!-- RIGHT: Upcoming -->
        <div class="right-column">
            <div class="upcoming-header">
                <div class="upcoming-title">Upcoming</div>
            </div>
            <div class="assignments-list">
                ${assignmentHTML}
            </div>
        </div>
    </div>`;
}

// -- CALENDAR VIEW GENERATOR --
function getCalendarContent() {
    // Fake calendar grid generation for May 2026
    let daysHTML = '';
    for(let i=1; i<=31; i++) {
        // Find events for this "fake" date day
        // This is a simple matcher for MVP visuals
        const events = assignments.filter(a => a.date.includes(`May ${i},`));
        const eventHTML = events.map(e => `<div class="cal-event" style="background:${e.bg}">${e.title}</div>`).join('');
        
        daysHTML += `
            <div class="cal-cell">
                <strong>${i}</strong>
                ${eventHTML}
            </div>
        `;
    }

    return `
    <div class="dashboard-container">
        <div class="full-width-column">
            <div class="calendar-header">
                <h2 class="upcoming-title">May 2026</h2>
                <div style="font-size: 20px;">Reference Mode</div>
            </div>
            <div class="calendar-grid">
                <div class="cal-day-header">Mon</div>
                <div class="cal-day-header">Tue</div>
                <div class="cal-day-header">Wed</div>
                <div class="cal-day-header">Thu</div>
                <div class="cal-day-header">Fri</div>
                <div class="cal-day-header">Sat</div>
                <div class="cal-day-header">Sun</div>
                ${daysHTML}
            </div>
        </div>
    </div>`;
}

// -- CONNECT VIEW GENERATOR --
function getConnectContent() {
    const apps = [
        {name: "Gradescope", icon: "📄"},
        {name: "Blackboard", icon: "🎓"},
        {name: "WebWork", icon: "🔢"},
        {name: "Google Classroom", icon: "🏫"},
        {name: "McGraw Hill", icon: "📚"}
    ];

    const appsHTML = apps.map(app => `
        <div class="connect-row">
            <div style="display:flex; align-items:center; gap: 15px;">
                <span style="font-size:30px;">${app.icon}</span>
                <span style="font-size:20px; font-weight:bold;">${app.name}</span>
            </div>
            <a href="#" class="btn-connect">Visit Site</a>
        </div>
    `).join('');

    return `
    <div class="dashboard-container">
        <div class="full-width-column">
            <h2 class="upcoming-title" style="margin-bottom:30px;">Connect Your Classes</h2>
            ${appsHTML}
        </div>
    </div>`;
}

// --- 5. RENDER LOGIC ---

function render() {
    const root = document.getElementById('my-extension-root');
    if (!root) return;

    // 1. Generate Content based on State
    let contentHTML = '';
    if (currentView === 'home') contentHTML = getHomeContent();
    else if (currentView === 'calendar') contentHTML = getCalendarContent();
    else if (currentView === 'connect') contentHTML = getConnectContent();
    else contentHTML = `<div class="dashboard-container"><div class="full-width-column"><h1>${currentView.toUpperCase()} View Coming Soon</h1></div></div>`;

    // 2. Inject HTML (Nav + Content)
    root.innerHTML = getNavHTML() + contentHTML;

    // 3. Re-attach Event Listeners
    attachListeners();
}

function attachListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            currentView = item.dataset.view;
            render(); // Re-render page with new view
        });
    });
}

function init() {
    if (document.getElementById('my-extension-root')) return;
    const root = document.createElement('div');
    root.id = 'my-extension-root';
    document.body.appendChild(root);
    render();
}

// Run
init();