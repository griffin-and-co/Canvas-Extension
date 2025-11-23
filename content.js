// content.js
// Inject a reskinned Canvas dashboard on the main dashboard page.
// - Hides the default Canvas dashboard grid
// - Builds a custom layout based on your Figma mockups
// - Populates courses from the real dashboard cards
// - Populates calendar events from the Canvas planner API

(function () {
  if (window.hasRunUvaCanvasReskin) return;
  window.hasRunUvaCanvasReskin = true;

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReskin);
  } else {
    initReskin();
  }

  const state = {
    month: null,
    year: null,
    calendarGridEl: null,
    courses: [],
    events: []
  };

  function initReskin() {
    // Only act on the main Canvas dashboard
    const url = window.location.href;
    if (!url.includes("/dashboard")) return;

    // Best effort: hide the stock dashboard cards so our reskin dominates
    hideNativeDashboard();

    // Scrape existing dashboard content to get dynamic data
    state.courses = scrapeCoursesFromDashboardDom();

    // Build the reskinned UI shell
    const root = buildReskinShell(state.courses);

    // Attach nav button routing
    wireNavigationButtons(root);

    // Fetch calendar events and render into the calendar
    fetchUpcomingEvents()
      .then((events) => {
        state.events = events;
        renderCalendarEvents();
      })
      .catch((err) => {
        console.error("[Canvas Reskin] Failed to fetch planner items", err);
      });
  }

  // ------------------------------------------------------------
  // Native Canvas DOM helpers
  // ------------------------------------------------------------

  function hideNativeDashboard() {
    // Common Canvas containers for the dashboard card grid / content
    const selectors = [
      "#DashboardCard_Container",
      ".ic-DashboardCard__box",
      "#DashboardContainer",
      "#dashboard",
      ".ic-Dashboard-content"
    ];

    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.style.display = "none";
      }
    });
  }

  function scrapeCoursesFromDashboardDom() {
    const courses = [];
    // Standard Canvas dashboard card selector
    const cardNodes = document.querySelectorAll(".ic-DashboardCard");

    cardNodes.forEach((card) => {
      try {
        const link =
          card.querySelector("a.ic-DashboardCard__link") ||
          card.querySelector("a");

        const titleEl = card.querySelector(
          ".ic-DashboardCard__header-title, .ic-DashboardCard__header-text"
        );
        const codeEl = card.querySelector(
          ".ic-DashboardCard__header-subtitle, .ic-DashboardCard__header-term"
        );
        const gradeEl = card.querySelector(
          ".ic-DashboardCard__progress .progress_score, .ic-DashboardCard__grade"
        );

        const title = (titleEl && titleEl.textContent.trim()) || "Untitled course";
        const code = (codeEl && codeEl.textContent.trim()) || "";
        const gradeRaw = gradeEl ? gradeEl.textContent.trim() : "";
        const grade =
          gradeRaw &&
          (gradeRaw.includes("%") ? gradeRaw : gradeRaw.replace(/\s+/g, " "));
        const url = link ? link.href : null;

        courses.push({
          title,
          code,
          grade: grade || "--",
          url
        });
      } catch (e) {
        console.warn("[Canvas Reskin] Failed to parse a course card", e);
      }
    });

    // If for some reason nothing detected, provide at least a dummy item
    if (!courses.length) {
      courses.push({
        title: "Example Course",
        code: "M/W/F 9:30–10:45",
        grade: "92%",
        url: null
      });
    }

    // Limit to 5 like your mock
    return courses.slice(0, 5);
  }

  // ------------------------------------------------------------
  // Planner / calendar data
  // ------------------------------------------------------------

  async function fetchUpcomingEvents() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Canvas planner API (works from same-origin extension)
    const url = `/api/v1/planner/items?start_date=${encodeURIComponent(
      startISO
    )}&end_date=${encodeURIComponent(endISO)}`;

    const res = await fetch(url, {
      credentials: "include"
    });

    if (!res.ok) {
      console.warn(
        "[Canvas Reskin] Planner API not accessible, status:",
        res.status
      );
      return [];
    }

    const raw = await res.json();

    const events = [];

    raw.forEach((item) => {
      const plannable = item.plannable || {};
      const due =
        plannable.due_at ||
        plannable.all_day_date ||
        plannable.todo_date ||
        item.plannable_date;

      if (!due) return;

      const date = new Date(due);
      const title =
        plannable.title || item.title || plannable.assignment && plannable.assignment.name || "Item";
      const context =
        item.context_name ||
        (plannable.course && plannable.course.name) ||
        "";

      events.push({
        title,
        course: context,
        date
      });
    });

    return events;
  }

  // ------------------------------------------------------------
  // Reskin shell builders
  // ------------------------------------------------------------

  function buildReskinShell(courses) {
    const existingRoot = document.getElementById("uva-canvas-reskin-root");
    if (existingRoot) {
      existingRoot.remove();
    }

    const root = document.createElement("div");
    root.id = "uva-canvas-reskin-root";

    // Top navigation bar (matches your Figma)
    const nav = document.createElement("div");
    nav.className = "uva-reskin-nav";

    const leftNavGroup = document.createElement("div");
    leftNavGroup.className = "uva-reskin-nav-left";

    leftNavGroup.appendChild(createNavItem("Home", "home"));

    // Middle nav (Connect, Calendar, Todo)
    const centerNavGroup = document.createElement("div");
    centerNavGroup.className = "uva-reskin-nav-center";
    centerNavGroup.appendChild(
      createNavItem("Connect Your Classes", "connect-classes")
    );
    centerNavGroup.appendChild(createNavItem("Calendar", "calendar"));
    centerNavGroup.appendChild(createNavItem("Todo", "todo"));

    const rightNavGroup = document.createElement("div");
    rightNavGroup.className = "uva-reskin-nav-right";
    rightNavGroup.appendChild(createNavItem("Profile", "profile"));
    rightNavGroup.appendChild(createNavItem("Settings", "settings"));

    nav.appendChild(leftNavGroup);
    nav.appendChild(centerNavGroup);
    nav.appendChild(rightNavGroup);

    // Main content wrapper (course list + calendar)
    const main = document.createElement("div");
    main.className = "uva-reskin-main";

    const leftCol = document.createElement("div");
    leftCol.className = "uva-reskin-left-column";

    const actionRow = document.createElement("div");
    actionRow.className = "uva-reskin-action-row";

    // Four big icon tiles – add IDs so we can wire routing later
    actionRow.appendChild(
      createActionButton("Messages", "💬", "messages", "reskin-btn-messages")
    );
    actionRow.appendChild(
      createActionButton("Assignments", "📄", "assignments", "reskin-btn-assignments")
    );
    actionRow.appendChild(
      createActionButton("Groups", "👥", "groups", "reskin-btn-groups")
    );
    actionRow.appendChild(
      createActionButton("List", "≡", "list", "reskin-btn-list")
    );

    const courseList = document.createElement("div");
    courseList.className = "uva-reskin-course-list";

    courses.forEach((course) => {
      courseList.appendChild(createCourseRow(course));
    });

    leftCol.appendChild(actionRow);
    leftCol.appendChild(courseList);

    // Right column calendar
    const rightCol = document.createElement("div");
    rightCol.className = "uva-reskin-right-column";

    const calendarHeader = document.createElement("div");
    calendarHeader.className = "uva-reskin-calendar-header";

    const heading = document.createElement("h2");
    heading.textContent = getCurrentMonthLabel();
    calendarHeader.appendChild(heading);

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "uva-reskin-toggle";
    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "";
    toggleContainer.appendChild(toggleLabel);
    calendarHeader.appendChild(toggleContainer);

    const calendar = document.createElement("div");
    calendar.className = "uva-reskin-calendar";

    const dayHeaderRow = document.createElement("div");
    dayHeaderRow.className = "uva-reskin-calendar-day-header-row";

    ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach((d) => {
      const dayEl = document.createElement("div");
      dayEl.className = "uva-reskin-calendar-day-header";
      dayEl.textContent = d;
      dayHeaderRow.appendChild(dayEl);
    });

    const grid = document.createElement("div");
    grid.className = "uva-reskin-calendar-grid";
    state.calendarGridEl = grid;

    buildCalendarDays(grid); // fills grid with date cells

    calendar.appendChild(dayHeaderRow);
    calendar.appendChild(grid);

    rightCol.appendChild(calendarHeader);
    rightCol.appendChild(calendar);

    main.appendChild(leftCol);
    main.appendChild(rightCol);

    root.appendChild(nav);
    root.appendChild(main);

    const body = document.body;
    body.appendChild(root);

    return root;
  }

  function createNavItem(label, key) {
    const el = document.createElement("div");
    el.className = "uva-reskin-nav-item uva-reskin-nav-item-" + key;
    el.textContent = label;
    return el;
  }

  function createActionButton(label, symbol, key, id) {
    const btn = document.createElement("button");
    btn.className = "uva-reskin-action-button uva-reskin-action-" + key;
    if (id) btn.id = id;

    const iconWrap = document.createElement("div");
    iconWrap.className = "uva-reskin-action-icon";
    iconWrap.textContent = symbol;

    const text = document.createElement("div");
    text.className = "uva-reskin-action-label";
    text.textContent = label;

    btn.appendChild(iconWrap);
    btn.appendChild(text);
    return btn;
  }

  function createCourseRow(course) {
    const row = document.createElement("div");
    row.className = "uva-reskin-course-row";

    if (course.url) {
      row.addEventListener("click", () => {
        window.location.href = course.url;
      });
      row.style.cursor = "pointer";
    }

    const title = document.createElement("div");
    title.className = "uva-reskin-course-title";
    title.textContent = course.title;

    const meta = document.createElement("div");
    meta.className = "uva-reskin-course-meta";
    meta.textContent = course.code || "";

    const grade = document.createElement("div");
    grade.className = "uva-reskin-course-grade";
    grade.textContent = course.grade || "--";

    row.appendChild(title);
    row.appendChild(meta);
    row.appendChild(grade);

    return row;
  }

  // ------------------------------------------------------------
  // Calendar rendering
  // ------------------------------------------------------------

  function getCurrentMonthLabel() {
    const today = new Date();
    const monthLabel = today.toLocaleString("default", { month: "long" });
    const yearLabel = today.getFullYear();
    state.month = today.getMonth();
    state.year = today.getFullYear();
    return `${monthLabel} ${yearLabel}`;
  }

  function buildCalendarDays(grid) {
    grid.innerHTML = "";

    const month = state.month;
    const year = state.year;

    const first = new Date(year, month, 1);
    const firstDayIndex = (first.getDay() + 6) % 7; // convert Sun=0 to last

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Leading empty cells
    for (let i = 0; i < firstDayIndex; i++) {
      const empty = document.createElement("div");
      empty.className = "uva-reskin-calendar-cell uva-reskin-calendar-cell-empty";
      grid.appendChild(empty);
    }

    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("div");
      cell.className = "uva-reskin-calendar-cell";
      cell.dataset.day = String(d);

      const label = document.createElement("div");
      label.className = "uva-reskin-calendar-date-label";
      label.textContent = String(d);
      cell.appendChild(label);

      const eventsContainer = document.createElement("div");
      eventsContainer.className = "uva-reskin-calendar-events";
      cell.appendChild(eventsContainer);

      grid.appendChild(cell);
    }
  }

  function renderCalendarEvents() {
    if (!state.calendarGridEl || !state.events || !state.events.length) return;

    // Clear old event pills
    const allEventContainers = state.calendarGridEl.querySelectorAll(
      ".uva-reskin-calendar-events"
    );
    allEventContainers.forEach((c) => {
      c.innerHTML = "";
    });

    const month = state.month;
    const year = state.year;

    state.events.forEach((evt) => {
      const d = evt.date;
      if (
        d.getMonth() !== month ||
        d.getFullYear() !== year
      ) {
        return;
      }

      const dayNum = d.getDate();
      const cell = state.calendarGridEl.querySelector(
        `.uva-reskin-calendar-cell[data-day="${dayNum}"]`
      );
      if (!cell) return;

      const container = cell.querySelector(".uva-reskin-calendar-events");
      if (!container) return;

      const pill = document.createElement("div");
      pill.className = "uva-reskin-calendar-event-pill";
      pill.textContent = evt.title;

      // Optional tooltip with course context
      if (evt.course) {
        pill.title = `${evt.course} – ${evt.title}`;
      }

      container.appendChild(pill);
    });
  }

  // ------------------------------------------------------------
  // Navigation wiring
  // ------------------------------------------------------------

  function wireNavigationButtons(root) {
    const messagesBtn = root.querySelector("#reskin-btn-messages");
    const groupsBtn = root.querySelector("#reskin-btn-groups");

    if (messagesBtn) {
      messagesBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = "https://canvas.its.virginia.edu/conversations";
      });
    }

    if (groupsBtn) {
      groupsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.href = "https://canvas.its.virginia.edu/groups";
      });
    }
  }
})();
