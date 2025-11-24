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
    { name: "Classes loading...", time: "Course code loading...", grade: "-", bg: "#969aa4ff" }
];

// seed color map with fallback colors
fallbackCourses.forEach(c => {
    if (c.name && c.bg) courseColorMap.set(c.name, c.bg);
});

// fallback assignments now have rawDate + dateLabel
const fallbackAssignments = [
    {
        title: "Assignments loading...",
        rawDate: "2026-05-09T09:00:00",
        dateLabel: "Tue, May 9, 2026",
        course: "Course loading...",
        bg: "#969aa4ff"
    },
    
];

// --- 2. LIVE DATA STATE ---

let courses = [...fallbackCourses];
let assignments = [...fallbackAssignments];
let currentView = "home"; // 'home', 'connect', 'calendar', 'todo', 'profile', 'settings'
let upcomingView = 'list'; // 'list' or 'calendar'
let calendarMonthOffset = 0; // 0 = current month, +/- for navigation
let dataLoaded = false;

let todos = loadTodos();

function loadTodos() {
    try {
        const raw = localStorage.getItem("canvasPlus_todos");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.map((t) => ({
            text: t.text || "",
            done: !!t.done,
            createdAt: t.createdAt || new Date().toISOString()
        }));
    } catch (e) {
        console.warn("Failed to load todos", e);
        return [];
    }
}


function saveTodos() {
    try {
        localStorage.setItem("canvasPlus_todos", JSON.stringify(todos));
    } catch (e) {
        console.warn("Failed to save todos", e);
    }
}

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
    const courseHTML = courses
        .map(
            (c) => `
        <div class="course-pill" style="background-color: ${c.bg}; cursor:pointer;"
         onclick="window.location.href='${c.href}'">
            <div>
                <h3 class="course-title">${c.name}</h3>
                <p class="course-time">${c.time || ""}</p>
            </div>
            <div class="course-grade">${c.grade || "–"}</div>
        </div>
    `
        )
        .join("");

    const assignmentHTML = assignments
    .map((a) => {
        const color = a.bg || getColorForCourse(a.course);
        const click = a.url ? `window.location.href='${a.url}'` : "";
        return `
        <div class="assignment-item" 
         style="cursor:pointer; border-left: 6px solid ${color}; padding-left: 16px;"
         onclick="${click}">
            <div class="assignment-top-row">
                <span>${a.title}</span>
                <span class="assignment-date">${a.dateLabel || ""}</span>
            </div>
            <div class="assignment-course">${a.course}</div>
        </div>
    `;
    })
    .join("");


    return `
    <div class="dashboard-container">
        <!-- LEFT: Courses -->
        <div class="left-column">
            <div class="icon-row">
                <div class="icon-card" data-icon="inbox">💬</div>
                <div class="icon-card" data-icon="files">📄</div>
                <div class="icon-card" data-icon="groups">👥</div>
                <div class="icon-card" data-icon="menu">☰</div>
            </div>
            <div class="course-list">
                ${courseHTML}
            </div>
        </div>
                <!-- RIGHT: Upcoming -->
        <div class="right-column">
            <div class="upcoming-header">
                <div class="upcoming-title">Upcoming</div>
                <div class="upcoming-toggle">
                    <span class="${upcomingView === 'list' ? 'toggle-label toggle-active' : 'toggle-label'}">
                        List
                    </span>
                    <label class="toggle-switch">
                        <input
                            type="checkbox"
                            id="upcomingToggle"
                            ${upcomingView === 'calendar' ? 'checked' : ''}
                        />
                        <span class="slider"></span>
                    </label>
                    <span class="${upcomingView === 'calendar' ? 'toggle-label toggle-active' : 'toggle-label'}">
                        Calendar
                    </span>
                </div>
            </div>
            ${
                upcomingView === 'list'
                    ? `<div class="upcoming-scroll assignments-list">
                           ${assignmentHTML}
                       </div>`
                    : getUpcomingCalendarHTML()
            }
        </div>

    </div>`;
}
function getCalendarItemsForDay(year, monthIndex, day) {
    const events = [];

    // assignments
    assignments.forEach((a) => {
        if (!a.rawDate) return;
        const d = new Date(a.rawDate);
        if (Number.isNaN(d)) return;
        if (
            d.getFullYear() === year &&
            d.getMonth() === monthIndex &&
            d.getDate() === day
        ) {
            events.push({
                title: a.title,
                bg: a.bg || getColorForCourse(a.course),
                url: a.url || null,
                kind: "assignment"
            });
        }
    });

    // todos: show on the day they were created
    todos.forEach((t) => {
        if (!t.createdAt) return;
        const d = new Date(t.createdAt);
        if (Number.isNaN(d)) return;
        if (
            d.getFullYear() === year &&
            d.getMonth() === monthIndex &&
            d.getDate() === day
        ) {
            events.push({
                title: t.text,
                bg: getColorForCourse("__TODO__"),
                url: null,
                kind: "todo"
            });
        }
    });

    return events;
}



// -- CALENDAR VIEW GENERATOR --
function getCalendarContent() {
    const now = new Date();
    const target = new Date(
        now.getFullYear(),
        now.getMonth() + calendarMonthOffset,
        1
    );
    const year = target.getFullYear();
    const monthIndex = target.getMonth();
    const monthName = target.toLocaleDateString("en-US", { month: "long" });
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    let daysHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
        const events = getCalendarItemsForDay(year, monthIndex, i);

        const eventHTML = events
            .map(
                (e) => `
                <div
                    class="cal-event"
                    style="background:${e.bg};"
                    ${e.url ? `data-url="${e.url}"` : ""}
                >
                    ${e.title}
                </div>`
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
                <h2 class="upcoming-title">${monthName} ${year}</h2>
                <div class="calendar-nav-buttons">
                    <button class="cal-nav-btn" data-cal-dir="prev">&lt;</button>
                    <button class="cal-nav-btn" data-cal-dir="next">&gt;</button>
                </div>
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


function getUpcomingCalendarHTML() {
    const now = new Date();
    const target = new Date(
        now.getFullYear(),
        now.getMonth() + calendarMonthOffset,
        1
    );
    const year = target.getFullYear();
    const monthIndex = target.getMonth();
    const monthName = target.toLocaleDateString("en-US", { month: "long" });
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    let daysHTML = "";
    for (let i = 1; i <= daysInMonth; i++) {
        const events = getCalendarItemsForDay(year, monthIndex, i);

        const eventHTML = events
            .map(
                (e) => `
                <div
                    class="cal-event upcoming-cal-event"
                    style="background:${e.bg};"
                    ${e.url ? `data-url="${e.url}"` : ""}
                >
                    ${e.title}
                </div>`
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
        <div class="upcoming-scroll">
            <div class="calendar-header mini-calendar-header">
                <h2 class="upcoming-title">${monthName} ${year}</h2>
                <div class="calendar-nav-buttons">
                    <button class="cal-nav-btn" data-cal-dir="prev">&lt;</button>
                    <button class="cal-nav-btn" data-cal-dir="next">&gt;</button>
                </div>
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
    `;
}



function getTodoContent() {
    const itemsHtml = todos.map((t, idx) => `
        <li class="todo-item" data-idx="${idx}">
            <div class="todo-main">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" class="todo-toggle" ${t.done ? "checked" : ""} />
                    <span class="todo-text ${t.done ? "todo-done" : ""}">
                        ${t.text}
                    </span>
                </label>
                <div class="todo-meta">
                    <span class="todo-date">
                        ${formatDateLabel(t.createdAt)}
                    </span>
                </div>
            </div>
            <button class="todo-delete" aria-label="Delete task">✕</button>
        </li>
    `).join("");


    return `
        <div class="dashboard-container">
            <div class="full-width-column">
                <h2 class="upcoming-title" style="margin-bottom:20px;">Todo</h2>
                <div class="todo-input-row">
                    <input
                        id="todoInput"
                        class="todo-input"
                        type="text"
                        placeholder="Add a task..."
                    />
                    <button id="todoAddBtn" class="btn-connect">Add</button>
                </div>
                <ul class="todo-list">
                    ${itemsHtml || '<li class="todo-empty">No tasks yet.</li>'}
                </ul>
            </div>
        </div>
    `;
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
    else if (currentView === "todo") contentHTML = getTodoContent();

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
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            const view = item.dataset.view;

            // Hard redirects for profile / settings
            if (view === "profile") {
                window.location.href = "https://canvas.its.virginia.edu/profile/";
                return;
            }
            if (view === "settings") {
                window.location.href = "https://canvas.its.virginia.edu/profile/settings";
                return;
            }

            // Normal in-extension routing for everything else
            currentView = view;
            render();
        });
    });

        // Icon shortcuts: inbox, files, groups
    document.querySelectorAll(".icon-card[data-icon]").forEach((card) => {
        card.addEventListener("click", () => {
            const type = card.dataset.icon;
            if (type === "inbox") {
                window.location.href = "https://canvas.its.virginia.edu/conversations";
            } else if (type === "files") {
                window.location.href = "https://canvas.its.virginia.edu/files";
            } else if (type === "groups") {
                window.location.href = "https://canvas.its.virginia.edu/groups";
            } else if (type === "menu") {
                // placeholder for future menu behavior
            }
        });
    });

        // Upcoming view toggle
    const upcomingToggle = document.getElementById('upcomingToggle');
    if (upcomingToggle) {
        upcomingToggle.addEventListener('change', () => {
            upcomingView = upcomingToggle.checked ? 'calendar' : 'list';
            render();
        });
    }

    // Make calendar events clickable (mini + full calendar)
    document.querySelectorAll('.upcoming-cal-event[data-url], .cal-event[data-url]').forEach(el => {
        const url = el.getAttribute('data-url');
        if (!url) return;
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            window.location.href = url;
        });
    });

        // Month navigation on the full calendar page
        // calendar month navigation (applies to both full + mini calendars)
    document.querySelectorAll(".cal-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const dir = btn.getAttribute("data-cal-dir");
            if (dir === "prev") calendarMonthOffset -= 1;
            if (dir === "next") calendarMonthOffset += 1;
            render();
        });
    });

    // make full calendar events clickable
    document.querySelectorAll(".cal-event[data-url]").forEach((el) => {
        const url = el.getAttribute("data-url");
        if (!url) return;
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
            window.location.href = url;
        });
    });


        // --- TODO VIEW BEHAVIOR ---

    const todoInput = document.getElementById("todoInput");
    const todoAddBtn = document.getElementById("todoAddBtn");

    if (todoInput && todoAddBtn) {
        const addTodo = () => {
            const text = todoInput.value.trim();
            if (!text) return;
            todos.push({ text, done: false, createdAt: new Date().toISOString() });
            saveTodos();
            render();
        };


        todoAddBtn.addEventListener("click", addTodo);
        todoInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") addTodo();
        });
    }

    document.querySelectorAll(".todo-item").forEach((li) => {
        const idx = Number(li.dataset.idx);
        const toggle = li.querySelector(".todo-toggle");
        const del = li.querySelector(".todo-delete");

        if (toggle) {
            toggle.addEventListener("change", () => {
                if (!Number.isInteger(idx) || idx < 0 || idx >= todos.length) return;
                todos[idx].done = !todos[idx].done;
                saveTodos();
                render();
            });
        }

        if (del) {
            del.addEventListener("click", () => {
                if (!Number.isInteger(idx) || idx < 0 || idx >= todos.length) return;
                todos.splice(idx, 1);
                saveTodos();
                render();
            });
        }
    });


}

// --- 6. INIT ---

function init() {
    if (location.href !== "https://canvas.its.virginia.edu/") return;
    if (document.getElementById("my-extension-root")) return;

    document.body.classList.add("extension-overlay-active");  // <-- add this

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
