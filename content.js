// content.js - dynamic Canvas dashboard overlay

(function () {
  const CANVAS_HOST = "canvas.its.virginia.edu";

  if (!location.host.includes(CANVAS_HOST)) return;

  // Only run on main dashboard, but allow tweak if Canvas changes
  const body = document.body;
  if (!body || !body.classList.contains("dashboard-is-planner")) {
    // If you want this to run everywhere, comment this out
    // return;
  }

  // Basic state
  const state = {
    courses: [],
    assignments: [],
    loading: true,
    error: null,
  };

  function log(...args) {
    console.log("[Canvas+ Ext]", ...args);
  }

  async function fetchJSON(url) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json+canvas-string-ids, application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.json();
  }

  async function loadCourses() {
    // /api/v1/dashboard/dashboard_cards
    const cards = await fetchJSON("/api/v1/dashboard/dashboard_cards");
    return cards.map((c) => ({
      id: c.id,
      name: c.shortName || c.course_code || "Untitled course",
      code: c.course_code || "",
      href: c.href || `/courses/${c.id}`,
      image: c.image_url || null,
      // grades will be populated later if we implement scraping
      grade: "N/A",
    }));
  }

  async function loadAssignments() {
    // Planner items: upcoming items from "now"
    const nowIso = new Date().toISOString();
    const url = `/api/v1/planner/items?start_date=${encodeURIComponent(
      nowIso
    )}&order=asc&per_page=50`;

    const items = await fetchJSON(url);

    const assignments = items
      .filter((item) => {
        // Typical planner item:
        // { plannable_type: 'assignment', plannable: { title, due_at, html_url }, course_id, ...}
        const type = item.plannable_type || item.plannable?.plannable_type;
        return (
          type === "assignment" ||
          type === "quiz" ||
          type === "discussion_topic"
        );
      })
      .map((item) => {
        const plannable = item.plannable || {};
        const courseId =
          item.course_id ||
          item.context_id ||
          (plannable.course_id ? plannable.course_id : null);

        return {
          id: item.id || plannable.id,
          title: plannable.title || "Untitled item",
          dueAt: plannable.due_at || item.plannable_date || null,
          htmlUrl: plannable.html_url || item.html_url || null,
          courseId,
          type: item.plannable_type || plannable.plannable_type || "item",
        };
      });

    return assignments;
  }

  async function loadData() {
    state.loading = true;
    state.error = null;
    renderShell();

    try {
      const [courses, assignments] = await Promise.all([
        loadCourses(),
        loadAssignments(),
      ]);

      state.courses = courses;
      state.assignments = assignments;
      state.loading = false;
      state.error = null;
    } catch (err) {
      console.error("[Canvas+ Ext] Failed to load data", err);
      state.loading = false;
      state.error = err.message || "Failed to load data";
    }

    renderShell();
  }

  // Inject our UI
  function ensureRoot() {
    let root = document.getElementById("canvas-plus-root");
    if (root) return root;

    root = document.createElement("div");
    root.id = "canvas-plus-root";

    // Let Canvas render first, then we overlay
    document.body.appendChild(root);

    return root;
  }

  function formatDueDate(iso) {
    if (!iso) return "No due date";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "No due date";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderShell() {
    const root = ensureRoot();

    // Minimal shell; styling comes from styles.css
    root.innerHTML = `
      <div class="canvas-plus-overlay">
        <div class="cp-header">
          <div class="cp-header-left">
            <h1 class="cp-title">Canvas, but less trash</h1>
            <p class="cp-subtitle">Your classes, grades, and upcoming work in one view.</p>
          </div>
          <div class="cp-header-right">
            ${state.loading ? `<span class="cp-badge cp-badge-loading">Loading...</span>` : ""}
            ${
              state.error
                ? `<span class="cp-badge cp-badge-error">Error: ${state.error}</span>`
                : ""
            }
          </div>
        </div>

        <div class="cp-main-grid">
          <section class="cp-panel cp-panel-courses">
            <div class="cp-panel-header">
              <h2>Courses</h2>
              <a href="/courses" class="cp-link-small">View all</a>
            </div>
            <div class="cp-panel-body">
              ${renderCourses()}
            </div>
          </section>

          <section class="cp-panel cp-panel-assignments">
            <div class="cp-panel-header">
              <h2>Upcoming</h2>
              <a href="/calendar" class="cp-link-small">Calendar</a>
            </div>
            <div class="cp-panel-body">
              ${renderAssignments()}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderCourses() {
    if (state.loading && !state.courses.length) {
      return `<div class="cp-empty">Pulling your courses from Canvas...</div>`;
    }

    if (state.error && !state.courses.length) {
      return `<div class="cp-empty cp-empty-error">Could not load courses.</div>`;
    }

    if (!state.courses.length) {
      return `<div class="cp-empty">No active courses found.</div>`;
    }

    return `
      <div class="cp-course-grid">
        ${state.courses
          .map((c) => {
            return `
            <a class="cp-course-card" href="${c.href}">
              <div class="cp-course-header">
                <div class="cp-course-color-bar"></div>
                <div class="cp-course-text">
                  <div class="cp-course-name">${escapeHtml(c.name)}</div>
                  ${
                    c.code
                      ? `<div class="cp-course-code">${escapeHtml(c.code)}</div>`
                      : ``
                  }
                </div>
              </div>
              <div class="cp-course-footer">
                <span class="cp-course-grade-label">Grade</span>
                <span class="cp-course-grade-value">${c.grade || "N/A"}</span>
              </div>
            </a>
          `;
          })
          .join("")}
      </div>
    `;
  }

  function renderAssignments() {
    if (state.loading && !state.assignments.length) {
      return `<div class="cp-empty">Loading upcoming assignments...</div>`;
    }

    if (state.error && !state.assignments.length) {
      return `<div class="cp-empty cp-empty-error">Could not load assignments.</div>`;
    }

    if (!state.assignments.length) {
      return `<div class="cp-empty">No upcoming work found.</div>`;
    }

    // Build map from courseId -> course name for labels
    const courseMap = {};
    state.courses.forEach((c) => {
      courseMap[String(c.id)] = c.name;
    });

    return `
      <ul class="cp-assignment-list">
        ${state.assignments
          .slice(0, 10)
          .map((a) => {
            const courseName =
              (a.courseId && courseMap[String(a.courseId)]) || "Unknown course";
            const dueText = formatDueDate(a.dueAt);
            const typeLabel = a.type.replace("_", " ");

            const content = `
              <div class="cp-assignment-main">
                <div class="cp-assignment-title">${escapeHtml(a.title)}</div>
                <div class="cp-assignment-meta">
                  <span class="cp-assignment-course">${escapeHtml(
                    courseName
                  )}</span>
                  <span class="cp-assignment-dot">•</span>
                  <span class="cp-assignment-type">${escapeHtml(
                    typeLabel
                  )}</span>
                </div>
              </div>
              <div class="cp-assignment-side">
                <div class="cp-assignment-due-label">Due</div>
                <div class="cp-assignment-due-value">${escapeHtml(
                  dueText
                )}</div>
              </div>
            `;

            if (a.htmlUrl) {
              return `
                <li class="cp-assignment-item">
                  <a href="${a.htmlUrl}" class="cp-assignment-link">
                    ${content}
                  </a>
                </li>
              `;
            } else {
              return `
                <li class="cp-assignment-item">
                  <div class="cp-assignment-link cp-assignment-link--nohref">
                    ${content}
                  </div>
                </li>
              `;
            }
          })
          .join("")}
      </ul>
    `;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Kick everything off
  function init() {
    log("Initializing Canvas overlay");
    renderShell();
    loadData();
  }

  // Wait for DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
