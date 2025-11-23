// --- 0. CONFIG / HELPERS ---

const COLOR_PALETTE = [
    "#B1C5FF",
    "#B1FFB5",
    "#FFB1B2",
    "#FFD7B1",
    "#D2B1FF",
    "#B1FFF3",
    "#FFC9DE"
];

const API_HEADERS = {
    "Accept": "application/json+canvas-string-ids, application/json",
    "X-Requested-With": "XMLHttpRequest"
};

// simple fetch wrapper
async function fetchJson(url) {
    const res = await fetch(url, {
        credentials: "same-origin",
        headers: API_HEADERS
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${url}`);
    return res.json();
}

// map course name/id → color for consistent styling
const courseColorMap = new Map();

function getColorForCourse(key) {
    if (!key) key = `course_${courseColorMap.size}`;
    if (courseColorMap.has(key)) return courseColorMap.get(key);
    const color = COLOR_PALETTE[courseColorMap.size % COLOR_PALETTE.length];
    courseColorMap.set(key, color);
    return color;
}

function formatDateLabel(raw) {
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d)) return "";
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

// --- 1. FALLBACK STATIC DATA (used if API fails) ---

const fallbackCourses = [
    { name: "Introduction to Computer Science", time: "M/W/F 9:30-10:45", grade: "91%", bg: "#B1C5FF" },
    { name: "New Product Development",          time: "Th 3:30-6:00",     grade: "88%", bg: "#B1FFB5" },
    { name: "Materials Science",                time: "M/W/F 12:30-1:45", grade: "75%", bg: "#FFB1B2" },
    { name: "Fundamentals of Real Estate Analysis", time: "T/Th 9:30-10:45", grade: "94%", bg: "#FFD7B1" },
    { name: "Introduction to Macroeconomics",   time: "M/W/F 11:00-11:50", grade: "92%", bg: "#D2B1FF" }
];

// seed color map with fallback colors
fallbackCourses.forEach(c => {
    if (c.name && c.bg) courseColorMap.set(c.name, c.bg);
});

// fallback assignments now have rawDate + dateLabel
const fallbackAssignments = [
    {
        title: "Midterm Exam",
        rawDate: "2026-05-09T09:00:00",
        dateLabel: "Tue, May 9, 2026",
        course: "Real Estate Analysis",
        bg: "#FFD7B1"
    },
    {
        title: "Project Presentation",
        rawDate: "2026-05-12T09:00:00",
        dateLabel: "Fri, May 12, 2026",
        course: "Computer Science",
        bg: "#B1C5FF"
    },
    {
        title: "Lab Report Due",
        rawDate: "2026-05-16T09:00:00",
        dateLabel: "Tue, May 16, 2026",
        course: "Real Estate Analysis",
        bg: "#FFD7B1"
    },
    {
        title: "Group Discussion",
        rawDate: "2026-05-19T09:00:00",
        dateLabel: "Fri, May 19, 2026",
        course: "Macroeconomics",
        bg: "#D2B1FF"
    },
    {
        title: "Final Paper Due",
        rawDate: "2026-05-26T09:00:00",
        dateLabel: "Fri, May 26, 2026",
        course: "Materials Science",
        bg: "#FFB1B2"
    }
];

// --- 2. LIVE DATA STATE ---

let courses = [...fallbackCourses];
let assignments = [...fallbackAssignments];
let currentView = "home"; // 'home', 'connect', 'calendar', 'todo', 'profile', 'settings'
let currentUpcomingView = 'list'; // 'list' or 'calendar'
let dataLoaded = false;

// --- 3. CANVAS DATA LOADERS ---

async function fetchCourseGrades(courseId) {
    try {
        const enrollments = await fetchJson(
            `/api/v1/courses/${courseId}/enrollments?user_id=self&type[]=StudentEnrollment`
        );
        const e = Array.isArray(enrollments) ? enrollments[0] : null;
        const g = e && e.grades;
        const score =
            (g && typeof g.current_score === "number" && g.current_score) ??
            (g && typeof g.final_score === "number" && g.final_score) ??
            (g && typeof g.computed_current_score === "number" && g.computed_current_score) ??
            null;

        if (typeof score === "number") {
            return `${Math.round(score)}%`;
        }
        return "–";
    } catch (err) {
        console.warn("Failed to fetch grade for course", courseId, err);
        return "–";
    }
}

async function fetchAssignmentsFromPlanner() {
    try {
        const now = new Date();
        const startISO = now.toISOString();
        const items = await fetchJson(
            `/api/v1/planner/items?start_date=${encodeURIComponent(startISO)}&per_page=50`
        );

        const upcoming = items.filter(
            (item) => item.plannable_type === "assignment" && item.plannable
        );

        const result = upcoming.slice(0, 20).map((item) => {
            const courseName =
                item.context_name ||
                (item.course && item.course.name) ||
                "Canvas course";
            const dueRaw =
                item.plannable.due_at ||
                item.plannable_date ||
                item.plannable.created_at ||
                null;

            const bg = getColorForCourse(courseName);
            return {
                title: item.plannable.title || "Assignment",
                rawDate: dueRaw,
                dateLabel: formatDateLabel(dueRaw),
                course: courseName,
                bg,
                url: item.html_url || item.plannable.html_url || null 
            };
        });

        if (result.length === 0) return fallbackAssignments;
        return result;
    } catch (err) {
        console.warn("Failed to load planner assignments", err);
        return fallbackAssignments;
    }
}

async function loadCanvasData() {
    if (loadCanvasData._loading) return;
    loadCanvasData._loading = true;

    try {
        // 1) COURSES from dashboard_cards
        const dashboardCards = await fetchJson("/api/v1/dashboard/dashboard_cards");

        const apiCourses = dashboardCards.map((c) => {
            const name =
                c.longName ||
                c.shortName ||
                c.originalName ||
                c.courseCode ||
                "Untitled course";
            const code = c.courseCode || "";
            const key = name || c.id;

            const bg = getColorForCourse(key);

            return {
                id: c.id,
                name,
                time: code || c.term || "",
                href: c.href,
                bg,
                colorKey: key
            };
        });

        // 2) GRADES for each course (in parallel)
        const gradePromises = apiCourses.map((c) => fetchCourseGrades(c.id));
        const grades = await Promise.all(gradePromises);

        courses = apiCourses.map((c, idx) => ({
            name: c.name,
            time: c.time,
            grade: grades[idx],
            bg: c.bg,
            href: c.href   
        }));

        // 3) UPCOMING ASSIGNMENTS from planner
        assignments = await fetchAssignmentsFromPlanner();

        dataLoaded = true;
    } catch (err) {
        console.error("Failed to fully load Canvas data, using fallbacks", err);
        // leave courses/assignments as fallback
    } finally {
        loadCanvasData._loading = false;
        render();
    }
}

// --- 4. HTML GENERATORS ---

function getNavHTML() {
    const getActive = (view) => (currentView === view ? "active" : "");

    return `
    <nav class="custom-nav">
        <div class="nav-group">
            <div class="nav-item ${getActive("home")}" data-view="home"><span>🏠</span> Home</div>
            <div class="nav-item ${getActive("connect")}" data-view="connect"><span>👥</span> Connect Your Classes</div>
            <div class="nav-item ${getActive("calendar")}" data-view="calendar"><span>📅</span> Calendar</div>
            <div class="nav-item ${getActive("todo")}" data-view="todo"><span>✅</span> Todo</div>
        </div>
        <div class="nav-group">
            <div class="nav-item ${getActive("profile")}" data-view="profile"><span>👤</span> Profile</div>
            <div class="nav-item ${getActive("settings")}" data-view="settings"><span>⚙️</span> Settings</div>
        </div>
    </nav>
    `;
}

// -- HOME VIEW GENERATORS --
function getHomeContent() {
    const courseHTML = courses.map(c => `
        <div class="course-pill" style="background-color: ${c.bg};" data-url="${c.url || '#'}">
            <div>
                <h3 class="course-title">${c.name}</h3>
                <p class="course-time">${c.time}</p>
            </div>
            <div class="course-grade">${c.grade}</div>
        </div>
    `).join('');

    // List view HTML
    const listHTML = assignments.map(a => `
        <div class="assignment-item" data-url="${a.url || '#'}">
            <div class="assignment-top-row">
                <span>${a.title}</span>
                <span class="assignment-date">${a.date}</span>
            </div>
            <div class="assignment-course">${a.course}</div>
        </div>
    `).join('');

    // Calendar view HTML (for Upcoming pane)
    let calDaysHTML = '';
    for (let i = 1; i <= 31; i++) {
        const dayStr = `May ${i},`; // keep your fake-March logic or replace with real dates later

        const events = assignments.filter(a => a.date.includes(dayStr));
        const eventHTML = events.map(e => `
            <div class="cal-event" 
                 style="background:${e.bg};" 
                 data-url="${e.url || '#'}">
                ${e.title}
            </div>
        `).join('');

        calDaysHTML += `
            <div class="cal-cell">
                <strong>${i}</strong>
                ${eventHTML}
            </div>
        `;
    }

    const upcomingBodyHTML = currentUpcomingView === 'calendar'
        ? `
            <div class="upcoming-calendar-wrapper">
                <div class="calendar-grid">
                    <div class="cal-day-header">Mon</div>
                    <div class="cal-day-header">Tue</div>
                    <div class="cal-day-header">Wed</div>
                    <div class="cal-day-header">Thu</div>
                    <div class="cal-day-header">Fri</div>
                    <div class="cal-day-header">Sat</div>
                    <div class="cal-day-header">Sun</div>
                    ${calDaysHTML}
                </div>
            </div>
        `
        : `
            <div class="assignments-list scrollable-panel">
                ${listHTML}
            </div>
        `;

    // checked attribute when calendar mode
    const toggleChecked = currentUpcomingView === 'calendar' ? 'checked' : '';

    return `
    <div class="dashboard-container">
        <!-- LEFT: Courses (slightly shrunk) -->
        <div class="left-column left-column-condensed">
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
        <!-- RIGHT: Upcoming with toggle + wider frame -->
        <div class="right-column right-column-wide">
            <div class="upcoming-header">
                <div class="upcoming-title">Upcoming</div>
                <label class="upcoming-toggle-label">
                    <span>List</span>
                    <label class="switch">
                        <input type="checkbox" class="upcoming-toggle" ${toggleChecked}>
                        <span class="slider"></span>
                    </label>
                    <span>Calendar</span>
                </label>
            </div>
            <div class="upcoming-body scrollable-panel">
                ${upcomingBodyHTML}
            </div>
        </div>
    </div>`;
}


function getCalendarGridHTML() {
    // TODO: replace "May 2026" logic later with real dates if you want
    let daysHTML = '';
    for (let i = 1; i <= 31; i++) {
        const events = assignments.filter(a => a.date.includes(`May ${i},`));

        const eventHTML = events.map(e => `
            <a
                href="${e.url || '#'}"
                class="cal-event"
                style="background:${e.bg}"
                target="_blank"
                rel="noopener noreferrer"
            >
                ${e.title}
            </a>
        `).join('');

        daysHTML += `
            <div class="cal-cell">
                <strong>${i}</strong>
                ${eventHTML}
            </div>
        `;
    }

    return `
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
    `;
}

// -- CALENDAR VIEW GENERATOR --
function getCalendarContent() {
    const now = new Date();
    const year = now.getFullYear();
    const monthIndex = now.getMonth(); // 0-based
    const monthName = now.toLocaleDateString("en-US", { month: "long" });
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    let daysHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
        const events = assignments.filter((a) => {
            if (!a.rawDate) return false;
            const d = new Date(a.rawDate);
            if (Number.isNaN(d)) return false;
            return (
                d.getFullYear() === year &&
                d.getMonth() === monthIndex &&
                d.getDate() === i
            );
        });

        const eventHTML = events
            .map(
                (e) =>
                    `<div class="cal-event" style="background:${e.bg}">${e.title}</div>`
            )
            .join("");

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
            ${getCalendarGridHTML()}
        </div>
    </div>`;
}

// -- CONNECT VIEW GENERATOR --
function getConnectContent() {
    const apps = [
        { name: "Gradescope", icon: "📄" },
        { name: "Blackboard", icon: "🎓" },
        { name: "WebWork", icon: "🔢" },
        { name: "Google Classroom", icon: "🏫" },
        { name: "McGraw Hill", icon: "📚" }
    ];

    const appsHTML = apps
        .map(
            (app) => `
        <div class="connect-row">
            <div style="display:flex; align-items:center; gap: 15px;">
                <span style="font-size:30px;">${app.icon}</span>
                <span style="font-size:20px; font-weight:bold;">${app.name}</span>
            </div>
            <a href="#" class="btn-connect">Visit Site</a>
        </div>
    `
        )
        .join("");

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
    const root = document.getElementById("my-extension-root");
    if (!root) return;

    let contentHTML = "";
    if (currentView === "home") contentHTML = getHomeContent();
    else if (currentView === "calendar") contentHTML = getCalendarContent();
    else if (currentView === "connect") contentHTML = getConnectContent();
    else
        contentHTML = `
        <div class="dashboard-container">
            <div class="full-width-column">
                <h1>${currentView.toUpperCase()} View Coming Soon</h1>
            </div>
        </div>`;

    root.innerHTML = getNavHTML() + contentHTML;
    attachListeners();
}

function attachListeners() {
    // Top nav
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const newView = item.dataset.view;
            if (!newView) return;
            currentView = newView;
            render();
        });
    });

    // Upcoming toggle (only exists in Home view)
    const upcomingToggle = document.querySelector('.upcoming-toggle');
    if (upcomingToggle) {
        upcomingToggle.addEventListener('change', (e) => {
            currentUpcomingView = e.target.checked ? 'calendar' : 'list';
            render();
        });
    }

    // Make assignment items clickable (list view)
    document.querySelectorAll('.assignment-item[data-url]').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.getAttribute('data-url');
            if (url) window.location.href = url;
        });
    });

    // Make calendar events clickable
    document.querySelectorAll('.cal-event[data-url]').forEach(ev => {
        ev.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = ev.getAttribute('data-url');
            if (url) window.location.href = url;
        });
    });

    // Make course pills clickable
    document.querySelectorAll('.course-pill[data-url]').forEach(pill => {
        pill.addEventListener('click', () => {
            const url = pill.getAttribute('data-url');
            if (url) window.location.href = url;
        });
    });
}


// --- 6. INIT ---

function init() {
    if (location.href !== "https://canvas.its.virginia.edu/") return;
    if (document.getElementById("my-extension-root")) return;
    const root = document.createElement("div");
    root.id = "my-extension-root";
    document.body.appendChild(root);

    // initial render with fallback data
    render();

    // async load real Canvas data and re-render when ready
    loadCanvasData();
}

// Run
init();
