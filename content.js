// Updated content.js with dynamic Canvas scraping

(async function() {
  // Utility fetch with same-origin
  async function apiFetch(url) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function getCourses() {
    const envCourses = window.ENV?.STUDENT_PLANNER_COURSES || [];
    return envCourses.map(c => ({ id: c.id, name: c.shortName || c.longName, href: c.href }));
  }

  async function getGrades(courseId) {
    const url = `/api/v1/courses/${courseId}/enrollments?user_id=self&type[]=StudentEnrollment&include[]=current_grade&include[]=final_grade&include[]=current_score&include[]=final_score`;
    const data = await apiFetch(url);
    if (!data || !data.length) return null;
    return data[0].current_grade || data[0].final_grade || null;
  }

  async function getAssignments() {
    const now = new Date();
    const future = new Date(now.getTime() + 14 * 86400000);
    const params = new URLSearchParams({ start_date: now.toISOString(), end_date: future.toISOString(), order: "asc" });
    const items = await apiFetch(`/api/v1/planner/items?${params}`) || [];
    return items.filter(i => i.plannable_type === "assignment").map(i => ({
      title: i.plannable.title,
      date: i.plannable.due_at,
      course: i.context_name
    }));
  }

  let courses = [];
  let assignments = [];

  async function loadData() {
    courses = await getCourses();
    for (let c of courses) c.grade = await getGrades(c.id);
    assignments = await getAssignments();
  }

  let currentView = "home";

  function render() {
    const root = document.getElementById("my-extension-root");
    if (!root) return;

    const courseHTML = courses.map(c => `
      <div class="course-pill">
        <div>
          <h3>${c.name}</h3>
          <p>${c.href}</p>
        </div>
        <div>${c.grade || "-"}</div>
      </div>`).join("");

    const assignHTML = assignments.map(a => `
      <div class="assignment-item">
        <div>${a.title}</div>
        <div>${new Date(a.date).toLocaleString()}</div>
        <div>${a.course}</div>
      </div>`).join("");

    root.innerHTML = `
      <nav class="custom-nav">
        <div class="nav-item" data-view="home">Home</div>
        <div class="nav-item" data-view="calendar">Calendar</div>
      </nav>
      <div class="dashboard-container">
        <div class="left-column">${courseHTML}</div>
        <div class="right-column">${assignHTML}</div>
      </div>`;

    document.querySelectorAll(".nav-item").forEach(el => {
      el.onclick = () => { currentView = el.dataset.view; render(); };
    });
  }

  async function init() {
    if (document.getElementById("my-extension-root")) return;
    const root = document.createElement("div");
    root.id = "my-extension-root";
    document.body.appendChild(root);
    await loadData();
    render();
  }

  init();
})();
