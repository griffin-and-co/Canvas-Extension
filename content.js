// content.js
// Canvas UVA Reskin - safer version that won't blank the page if something fails

(function () {
  // Prevent double-running
  if (window.__uvaCanvasReskinLoaded) return;
  window.__uvaCanvasReskinLoaded = true;

  const HOST = "canvas.its.virginia.edu";

  // Run when DOM is ready
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(initReskin);

  function initReskin() {
    try {
      if (location.host !== HOST) return;

      // We only want to reskin the main dashboard page.
      // On UVA Canvas, that's the root URL "/".
      const path = location.pathname || "/";
      if (path !== "/" && path !== "/dashboard") {
        return;
      }

      // Grab the main Canvas app container so we can hide (not delete) it
      const appRoot =
        document.querySelector("#application") ||
        document.querySelector("#main") ||
        document.body;

      if (!appRoot) return;

      const courses = scrapeCourses();
      const todos = scrapeTodoItems();

      // Build our new UI
      const overlay = buildReskinRoot(courses, todos);

      // Hide Canvas, add overlay
      appRoot.style.display = "none";
      document.body.appendChild(overlay);

      // Wire up interactions
      wireInteractions(overlay, courses);
    } catch (err) {
      console.error("[UVA Canvas Reskin] Failed to initialize:", err);
      // If anything blows up, do nothing and keep default Canvas visible
    }
  }

  // -----------------------------
  // SCRAPING
  // -----------------------------

  function scrapeCourses() {
    const result = [];

    // Old Canvas card selector
    const dashboardCards = document.querySelectorAll(
      ".ic-DashboardCard, .ic-DashboardCard__box"
    );

    // Newer Canvas course links sometimes use this data-testid
    const cardLinks = document.querySelectorAll(
      '[data-testid="course-card-link"]'
    );

    if (dashboardCards.length) {
      dashboardCards.forEach((card) => {
        try {
          const link =
            card.querySelector("a.ic-DashboardCard__link") ||
            card.querySelector("a[href*='/courses/']");
          if (!link) return;

          const nameEl =
            card.querySelector(".ic-DashboardCard__header-title") ||
            card.querySelector(".ic-DashboardCard__title") ||
            link;

          const subtitleEl =
            card.querySelector(".ic-DashboardCard__header-term") ||
            card.querySelector(".course-list-term");

          result.push({
            name: (nameEl.textContent || "").trim() || "Course",
            subtitle: (subtitleEl && subtitleEl.textContent.trim()) || "",
            href: link.href,
          });
        } catch (e) {
          console.warn("[UVA Canvas Reskin] Failed to parse course card", e);
        }
      });
    } else if (cardLinks.length) {
      cardLinks.forEach((link) => {
        try {
          const name = (link.textContent || "").trim() || "Course";
          result.push({
            name,
            subtitle: "",
            href: link.href,
          });
        } catch (e) {
          console.warn(
            "[UVA Canvas Reskin] Failed to parse course card (new UI)",
            e
          );
        }
      });
    }

    // Fallback if nothing scraped
    if (!result.length) {
      console.warn(
        "[UVA Canvas Reskin] No course cards found. Using placeholder data."
      );
      return [
        {
          name: "Example Course 1",
          subtitle: "M/W/F 9:30-10:45",
          href: "#",
        },
        {
          name: "Example Course 2",
          subtitle: "T/Th 3:30-6:00",
          href: "#",
        },
      ];
    }

    return result;
  }

  function scrapeTodoItems() {
    const items = [];

    // Try multiple likely structures for Canvas "To Do" sidebar
    const todoContainers = [
      document.querySelector("#right-side .to-do-list"),
      document.querySelector("#right-side .ToDoSidebar"),
      document.querySelector(".ic-RightSidebar .to-do-list"),
      document.querySelector(".ic-RightSidebar"),
    ].filter(Boolean);

    const container = todoContainers[0];
    if (!container) {
      console.warn(
        "[UVA Canvas Reskin] No To Do container found. Calendar will be empty."
      );
      return items;
    }

    const links = container.querySelectorAll("a[href]");
    links.forEach((link) => {
      try {
        const text = (link.textContent || "").trim();
        if (!text) return;

        // Look for a due date nearby
        const li = link.closest("li, .ToDoSidebarItem");
        let dateText = "";
        if (li) {
          const dateEl =
            li.querySelector("time") ||
            li.querySelector(".item_due") ||
            li.querySelector(".ToDoDate");
          if (dateEl) {
            dateText = (dateEl.textContent || "").trim();
          }
        }

        items.push({
          title: text,
          date: dateText,
          href: link.href,
        });
      } catch (e) {
        console.warn("[UVA Canvas Reskin] Failed to parse To Do item", e);
      }
    });

    return items;
  }

  // -----------------------------
  // BUILDING THE RESKIN UI
  // -----------------------------

  function buildReskinRoot(courses, todos) {
    const root = document.createElement("div");
    root.id = "uva-reskin-root";

    // Simple mapping to pastel classes for courses
    const pastelClasses = [
      "uva-course-card-blue",
      "uva-course-card-green",
      "uva-course-card-pink",
      "uva-course-card-orange",
      "uva-course-card-purple",
    ];

    const courseCardsHTML = courses
      .slice(0, 5)
      .map((course, idx) => {
        const pastelClass =
          pastelClasses[idx % pastelClasses.length] || pastelClasses[0];
        return `
          <button class="uva-course-card ${pastelClass}" data-course-index="${idx}">
            <div class="uva-course-name">${escapeHtml(course.name)}</div>
            ${
              course.subtitle
                ? `<div class="uva-course-subtitle">${escapeHtml(
                    course.subtitle
                  )}</div>`
                : ""
            }
            <div class="uva-course-grade">--</div>
          </button>
        `;
      })
      .join("");

    const todoHTML =
      todos && todos.length
        ? todos
            .slice(0, 7)
            .map(
              (item, i) => `
          <div class="uva-event-pill" data-todo-index="${i}">
            <div class="uva-event-title">${escapeHtml(item.title)}</div>
            ${
              item.date
                ? `<div class="uva-event-date">${escapeHtml(item.date)}</div>`
                : ""
            }
          </div>`
            )
            .join("")
        : `<div class="uva-empty-state">No upcoming items detected.</div>`;

    root.innerHTML = `
      <div class="uva-reskin">
        <!-- Top nav bar -->
        <header class="uva-nav">
          <div class="uva-nav-left">
            <span class="uva-logo-icon">🏠</span>
            <span class="uva-logo-text">Home</span>
          </div>
          <nav class="uva-nav-center">
            <button class="uva-nav-link uva-nav-link-active">Home</button>
            <button class="uva-nav-link">Connect Your Classes</button>
            <button class="uva-nav-link">Calendar</button>
            <button class="uva-nav-link">Todo</button>
          </nav>
          <div class="uva-nav-right">
            <button class="uva-nav-profile">Profile</button>
            <button class="uva-nav-settings">Settings</button>
          </div>
        </header>

        <main class="uva-layout">
          <section class="uva-left-pane">
            <!-- Action buttons -->
            <div class="uva-action-row">
              <button class="uva-action-btn" data-action="messages">
                <div class="uva-action-icon">💬</div>
              </button>
              <button class="uva-action-btn" data-action="files">
                <div class="uva-action-icon">📄</div>
              </button>
              <button class="uva-action-btn" data-action="groups">
                <div class="uva-action-icon">👥</div>
              </button>
              <button class="uva-action-btn" data-action="list">
                <div class="uva-action-icon">☰</div>
              </button>
            </div>

            <!-- Course list -->
            <div class="uva-course-list">
              ${courseCardsHTML}
            </div>
          </section>

          <section class="uva-right-pane">
            <div class="uva-calendar-header-row">
              <h2 class="uva-calendar-title">May 2026</h2>
            </div>
            <div class="uva-calendar-grid">
              <div class="uva-calendar-weekdays">
                <div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div><div>Su</div>
              </div>
              <div class="uva-calendar-days">
                ${buildCalendarSkeleton()}
              </div>
            </div>
            <div class="uva-calendar-events">
              ${todoHTML}
            </div>
          </section>
        </main>
      </div>
    `;

    return root;
  }

  function buildCalendarSkeleton() {
    // Simple 5x7 skeleton like your mock; we are not mapping real dates yet.
    const days = [];
    for (let i = 1; i <= 35; i++) {
      days.push(`<div class="uva-calendar-day">${i <= 31 ? i : ""}</div>`);
    }
    return days.join("");
  }

  // -----------------------------
  // INTERACTIONS
  // -----------------------------

  function wireInteractions(root, courses) {
    // Action buttons: messages + groups routing
    root
      .querySelectorAll(".uva-action-btn")
      .forEach((btn) =>
        btn.addEventListener("click", () => handleActionClick(btn))
      );

    // Course cards: navigate to course
    root.querySelectorAll(".uva-course-card").forEach((card) => {
      card.addEventListener("click", () => {
        const idxStr = card.getAttribute("data-course-index");
        const idx = idxStr ? parseInt(idxStr, 10) : NaN;
        if (!Number.isNaN(idx) && courses[idx] && courses[idx].href) {
          window.location.href = courses[idx].href;
        }
      });
    });

    // Todo events: open original link if we captured it
    const todos = scrapeTodoItems(); // re-use scraped list for hrefs
    root.querySelectorAll("[data-todo-index]").forEach((pill) => {
      pill.addEventListener("click", () => {
        const idxStr = pill.getAttribute("data-todo-index");
        const idx = idxStr ? parseInt(idxStr, 10) : NaN;
        if (!Number.isNaN(idx) && todos[idx] && todos[idx].href) {
          window.location.href = todos[idx].href;
        }
      });
    });
  }

  function handleActionClick(btn) {
    const action = btn.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "messages":
        window.location.href = "https://canvas.its.virginia.edu/conversations";
        break;
      case "groups":
        window.location.href = "https://canvas.its.virginia.edu/groups";
        break;
      case "files":
        // You can point this at whatever makes sense later
        window.location.href = "https://canvas.its.virginia.edu/files";
        break;
      case "list":
        // Maybe a todo or list view later
        window.location.href = "https://canvas.its.virginia.edu/calendar";
        break;
      default:
        break;
    }
  }

  // -----------------------------
  // UTIL
  // -----------------------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
