// content.js

// Immediately-invoked function to avoid leaking variables
(function () {
  /**
   * Entry point. Only runs on the main Canvas dashboard.
   * Guards prevent this from touching course pages, etc. for now.
   */
  function init() {
    // Heuristic: dashboard has these containers
    const isDashboard =
      document.getElementById("dashboard-planner") ||
      document.getElementById("DashboardCard_Container") ||
      document.getElementById("dashboard-activity");

    if (!isDashboard) return;

    // Wait a bit for Canvas to finish its own DOM work, then reskin.
    // This keeps us from fighting their JS.
    setTimeout(applyReskin, 1000);
  }

  /**
   * Hides the default dashboard blocks and injects our custom layout.
   */
  function applyReskin() {
    // Do not inject twice
    if (document.getElementById("uva-dashboard-reskin-root")) return;

    // Add flag to body so styles can scope off it if needed
    document.body.classList.add("uva-dashboard-reskinned");

    // Hide core dashboard containers (planner stream, cards, activity)
    [
      "dashboard_header_container",
      "dashboard-planner",
      "dashboard-activity",
      "DashboardCard_Container"
    ].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = "none";
      }
    });

    // Choose a main mount point - Canvas's #content is usually safe.
    let mount =
      document.getElementById("content") ||
      document.querySelector("#main") ||
      document.querySelector("div[role='main']") ||
      document.body;

    // Create root wrapper for our reskinned dashboard
    const root = document.createElement("div");
    root.id = "uva-dashboard-reskin-root";
    root.className = "uva-dashboard-root";

    // Insert at the top of the main content
    if (mount.firstChild) {
      mount.insertBefore(root, mount.firstChild);
    } else {
      mount.appendChild(root);
    }

    // Build the entire UI in one shot so Canvas scripts are less likely to interfere
    root.innerHTML = getDashboardMarkup();
  }

  /**
   * Returns the HTML for the reskinned dashboard.
   * Static data is fine for MVP – this is about layout and visual reskin.
   */
  function getDashboardMarkup() {
    return `
      <div class="uva-dashboard-wrapper">
        <!-- Top navigation bar -->
        <header class="uva-nav">
          <div class="uva-nav-inner">
            <div class="uva-nav-left">
              <span class="uva-nav-logo">🏛️</span>
              <button class="uva-nav-item uva-nav-item-active">Home</button>
              <button class="uva-nav-item">Connect Your Classes</button>
              <button class="uva-nav-item">Calendar</button>
              <button class="uva-nav-item">Todo</button>
            </div>
            <div class="uva-nav-right">
              <button class="uva-nav-item">Profile</button>
              <button class="uva-nav-item">Settings</button>
            </div>
          </div>
        </header>

        <!-- Main content layout -->
        <div class="uva-main-layout">
          <!-- Left column: big action buttons + course list -->
          <div class="uva-left-column">
            <div class="uva-action-buttons-row">
              <button class="uva-action-button" title="Messages">
                <span class="uva-action-icon">💬</span>
              </button>
              <button class="uva-action-button" title="Assignments">
                <span class="uva-action-icon">📄</span>
              </button>
              <button class="uva-action-button" title="Groups">
                <span class="uva-action-icon">👥</span>
              </button>
              <button class="uva-action-button" title="Tasks">
                <span class="uva-action-icon">☰</span>
              </button>
            </div>

            <div class="uva-course-list">
              ${getCourseCardHtml(
                "Introduction to Computer Science",
                "M/W/F 9:30-10:45",
                "91%",
                "uva-course-card-blue"
              )}
              ${getCourseCardHtml(
                "New Product Development",
                "Th 3:30-6:00",
                "88%",
                "uva-course-card-green"
              )}
              ${getCourseCardHtml(
                "Materials Science",
                "M/W/F 12:30-1:45",
                "75%",
                "uva-course-card-red"
              )}
              ${getCourseCardHtml(
                "Fundamentals of Real Estate Analysis",
                "T/Th 9:30-10:45",
                "94%",
                "uva-course-card-orange"
              )}
              ${getCourseCardHtml(
                "Introduction to Macroeconomics",
                "M/W/F 11:00-11:50",
                "92%",
                "uva-course-card-purple"
              )}
            </div>
          </div>

          <!-- Right column: calendar -->
          <div class="uva-right-column">
            <div class="uva-calendar-header">
              <div>
                <div class="uva-calendar-month">May 2026</div>
                <div class="uva-calendar-weekday-row">
                  <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
                </div>
              </div>
              <label class="uva-toggle">
                <input type="checkbox" />
                <span class="uva-toggle-slider"></span>
              </label>
            </div>

            <div class="uva-calendar-grid">
              ${getCalendarGridHtml()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Small helper to build a course card.
   */
  function getCourseCardHtml(title, time, grade, colorClass) {
    return `
      <div class="uva-course-card ${colorClass}">
        <div class="uva-course-card-main">
          <div class="uva-course-title">${title}</div>
          <div class="uva-course-time">${time}</div>
        </div>
        <div class="uva-course-grade">${grade}</div>
      </div>
    `;
  }

  /**
   * Basic static calendar grid based on the Figma mock.
   * This does not try to be date-aware – it is purely a visual reskin.
   */
  function getCalendarGridHtml() {
    // Map: day -> [ { label, colorClass } ]
    const events = {
      9: [{ label: "Midterm Exam", color: "uva-cal-pill-peach" }],
      12: [{ label: "Project Presentation", color: "uva-cal-pill-blue" }],
      16: [{ label: "Lab Report Due", color: "uva-cal-pill-peach" }],
      19: [{ label: "Group Discussion", color: "uva-cal-pill-purple" }],
      23: [{ label: "Quiz", color: "uva-cal-pill-peach" }],
      26: [{ label: "Final Paper Due", color: "uva-cal-pill-red" }],
      30: [{ label: "Study Group", color: "uva-cal-pill-peach" }],
      2 + 31: [{ label: "Office Hours", color: "uva-cal-pill-blue" }] // maps to "day index 33" used below
    };

    // Figma month layout starts on Monday with 1st in first row, second column
    const daysInMonth = 31;
    const cells = [];
    const totalCells = 42; // 6 weeks * 7 days
    let currentDay = 0;

    for (let i = 0; i < totalCells; i++) {
      const colIndex = i % 7;
      const rowIndex = Math.floor(i / 7);

      // First row: leave column 0 blank, start day 1 at column 1
      if (rowIndex === 0 && colIndex === 0) {
        cells.push(buildEmptyDayCell());
        continue;
      }

      if (currentDay < daysInMonth) {
        currentDay++;
        cells.push(buildDayCell(currentDay, events));
      } else {
        cells.push(buildEmptyDayCell());
      }
    }

    return cells.join("");
  }

  function buildDayCell(dayNumber, eventsMap) {
    // Office hours in the mock appears on the first cell of the last row, which is index 35 (0-based).
    // Quick hack: treat "33" key as that pseudo day.
    const pseudoKey = dayNumber === 1 && eventsMap[33] ? 33 : dayNumber;

    const dayEvents = eventsMap[pseudoKey] || [];
    const eventsHtml = dayEvents
      .map(function (ev) {
        return `<div class="uva-cal-pill ${ev.color}">${ev.label}</div>`;
      })
      .join("");

    return `
      <div class="uva-calendar-cell">
        <div class="uva-calendar-day-number">${dayNumber}</div>
        <div class="uva-calendar-events">
          ${eventsHtml}
        </div>
      </div>
    `;
  }

  function buildEmptyDayCell() {
    return `
      <div class="uva-calendar-cell uva-calendar-cell-empty">
        <div class="uva-calendar-day-number"></div>
      </div>
    `;
  }

  // Kick off
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
