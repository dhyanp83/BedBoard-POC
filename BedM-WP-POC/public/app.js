const state = {
  token: localStorage.getItem("bmp_token"),
  user: JSON.parse(localStorage.getItem("bmp_user") || "null"),
  beds: [],
  sites: [],
  sdos: [],
  dashboardFilters: {
    sdo: {},
    provincial: {}
  },
  dashboard: null
};

const app = document.getElementById("app");
const routeByRole = {
  SITE_USER: "/beds",
  SDO_USER: "/dashboard/sdo",
  PROVINCIAL_USER: "/dashboard/provincial",
  ADMIN: "/admin"
};

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  });
}

function navigate(path) {
  history.pushState(null, "", path);
  render();
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("bmp_token", token);
  localStorage.setItem("bmp_user", JSON.stringify(user));
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("bmp_token");
  localStorage.removeItem("bmp_user");
  navigate("/login");
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => { node.hidden = true; }, 3000);
}

function statusBadge(status) {
  return `<span class="badge ${status === "OPEN" ? "open" : "occupied"}">${status === "OPEN" ? "Open" : "Occupied"}</span>`;
}

function fmtDate(value) {
  if (!value) return "Not updated";
  return new Date(value).toLocaleString();
}

function pct(open, total) {
  return total ? Math.round((open / total) * 100) : 0;
}

function shell(content) {
  const links = [
    ["Beds", "/beds", ["SITE_USER", "ADMIN"]],
    ["SDO Dashboard", "/dashboard/sdo", ["SDO_USER", "PROVINCIAL_USER", "ADMIN"]],
    ["Provincial", "/dashboard/provincial", ["PROVINCIAL_USER", "ADMIN"]],
    ["Admin", "/admin", ["ADMIN"]]
  ].filter(([, , roles]) => roles.includes(state.user.role));

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">BM</span><span>Bed Management Portal</span></div>
        <nav class="nav">
          ${links.map(([label, href]) => `<a href="${href}" data-link class="${location.pathname === href ? "active" : ""}">${label}</a>`).join("")}
        </nav>
        <div class="user-box">
          <span>${state.user.firstName} ${state.user.lastName} · ${state.user.role.replaceAll("_", " ")}</span>
          <button class="secondary" data-logout>Logout</button>
        </div>
      </header>
      <main>${content}</main>
    </div>
  `;
}

function loginPage() {
  app.innerHTML = `
    <div class="login-shell">
      <section class="login-panel">
        <h1>Bed Management Portal</h1>
        <p>Proof of concept for daily bed availability updates and dashboard views.</p>
        <form id="loginForm">
          <label>Email <input name="email" type="email" value="site.user@example.com" autocomplete="username" required></label>
          <label>Password <input name="password" type="password" value="Password123!" autocomplete="current-password" required></label>
          <button type="submit">Login</button>
          <div id="loginError" class="error"></div>
        </form>
        <div class="sample-logins">
          <strong>Sample accounts, all using Password123!</strong>
          <span>site.user@example.com · sdo.user@example.com · provincial.user@example.com · admin.user@example.com</span>
        </div>
      </section>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      setSession(data.token, data.user);
      navigate(routeByRole[data.user.role] || "/beds");
    } catch (err) {
      document.getElementById("loginError").textContent = err.message;
    }
  });
}

async function bedsPage() {
  shell(`<p class="muted">Loading beds...</p>`);
  const data = await api("/api/beds");
  state.beds = data.beds;
  state.sites = data.sites;
  state.sdos = data.sdos || [];
  renderBeds();
}

function renderBeds() {
  const search = document.getElementById("search")?.value.toLowerCase() || "";
  const status = document.getElementById("statusFilter")?.value || "";
  const sdoName = document.getElementById("sdoFilter")?.value || "";
  const siteId = document.getElementById("siteFilter")?.value || "";
  const unit = document.getElementById("unitFilter")?.value || "";
  const filtered = state.beds.filter(bed =>
    (!search || bed.bedLabel.toLowerCase().includes(search) || bed.siteName.toLowerCase().includes(search)) &&
    (!status || bed.status === status) &&
    (!sdoName || bed.sdoName === sdoName) &&
    (!siteId || bed.siteId === siteId) &&
    (!unit || bed.unit === unit)
  );
  const total = filtered.length;
  const open = filtered.filter(bed => bed.status === "OPEN").length;
  const units = [...new Set(state.beds.map(bed => bed.unit))].sort();
  const visibleSites = sdoName ? state.sites.filter(site => state.beds.some(bed => bed.siteId === site.id && bed.sdoName === sdoName)) : state.sites;
  const scopeText = state.sites.length === 1
    ? state.sites[0].name
    : `${state.sites.length} visible sites across ${state.sdos.length || new Set(state.beds.map(bed => bed.sdoName)).size} SDOs`;

  shell(`
    <div class="page-head">
      <div class="page-title">
        <h1>Bed Management</h1>
        <p>${scopeText} · refreshed ${new Date().toLocaleString()}</p>
      </div>
      <button class="secondary" data-refresh-beds>Refresh</button>
    </div>
    <section class="cards">
      ${metric("Total beds", total)}
      ${metric("Open beds", open)}
      ${metric("Occupied beds", total - open)}
      ${metric("Open percentage", `${pct(open, total)}%`)}
      ${metric("Visible sites", state.sites.length)}
    </section>
    <section class="toolbar">
      <label>Search <input id="search" value="${escapeHtml(search)}" placeholder="Bed label or site"></label>
      <label>Status <select id="statusFilter"><option value="">All</option><option value="OPEN">Open</option><option value="OCCUPIED">Occupied</option></select></label>
      <label>SDO <select id="sdoFilter"><option value="">All SDOs</option>${[...new Set(state.beds.map(bed => bed.sdoName))].sort().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label>
      <label>Site <select id="siteFilter"><option value="">All visible sites</option>${visibleSites.map(site => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("")}</select></label>
      <label>Unit <select id="unitFilter"><option value="">All units</option>${units.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}</select></label>
      <button data-apply-filters>Apply</button>
    </section>
    <section class="panel table-wrap">
      <table>
        <thead><tr><th>Bed label</th><th>Site</th><th>Unit</th><th>Bed type</th><th>Status</th><th>Last updated</th><th>Updated by</th><th>Action</th></tr></thead>
        <tbody>
          ${filtered.slice(0, 500).map(bed => `
            <tr>
              <td><strong>${escapeHtml(bed.bedLabel)}</strong></td>
              <td>${escapeHtml(bed.siteName)}</td>
              <td>${escapeHtml(bed.unit)}</td>
              <td>${escapeHtml(bed.bedType)}</td>
              <td>${statusBadge(bed.status)}</td>
              <td>${fmtDate(bed.lastStatusUpdatedAt)}</td>
              <td>${escapeHtml(bed.updatedBy || "Not updated")}</td>
              <td><button class="${bed.status === "OCCUPIED" ? "open-action" : "occupied-action"}" data-toggle-bed="${bed.id}" data-next="${bed.status === "OCCUPIED" ? "OPEN" : "OCCUPIED"}">${bed.status === "OCCUPIED" ? "Set to Open" : "Set to Occupied"}</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
    ${filtered.length > 500 ? `<p class="muted">Showing first 500 matching beds. Narrow the filters for a smaller working list.</p>` : ""}
  `);
  if (status) document.getElementById("statusFilter").value = status;
  if (sdoName) document.getElementById("sdoFilter").value = sdoName;
  if (siteId) document.getElementById("siteFilter").value = siteId;
  if (unit) document.getElementById("unitFilter").value = unit;
}

function metric(label, value) {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

async function dashboardPage(kind) {
  shell(`<p class="muted">Loading dashboard...</p>`);
  const filters = state.dashboardFilters[kind] || {};
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const endpoint = kind === "provincial" ? "/api/dashboard/provincial" : "/api/dashboard/sdo";
  const data = await api(`${endpoint}${params.toString() ? `?${params}` : ""}`);
  state.dashboard = data;
  const isProv = kind === "provincial";
  const rows = isProv ? data.sdos.flatMap(sdo => sdo.sites.map(site => ({ ...site, sdoName: sdo.sdoName }))) : data.sites;
  const chartRows = isProv ? data.sdos.map(sdo => ({ name: sdo.sdoName, openBeds: sdo.openBeds, totalBeds: sdo.totalBeds })) : data.sites.map(site => ({ name: site.siteName, openBeds: site.openBeds, totalBeds: site.totalBeds }));
  const sdos = isProv ? data.allSdos : data.sdos;
  const sitesForFilter = (data.availableSites || []).filter(site => !filters.sdoId || site.sdoId === filters.sdoId);
  const topOpenSites = [...rows].sort((a, b) => b.openBeds - a.openBeds).slice(0, 8);
  const highPctSites = [...rows].filter(row => row.totalBeds).sort((a, b) => b.openPercentage - a.openPercentage).slice(0, 8);
  shell(`
    <div class="page-head">
      <div class="page-title">
        <h1>${isProv ? "Provincial Dashboard" : "SDO Dashboard"}</h1>
        <p>Current manual bed status summary · refreshed ${new Date().toLocaleString()}</p>
      </div>
      <button class="secondary" data-refresh-dashboard="${kind}">Refresh</button>
    </div>
    <section class="dashboard-filters">
      ${isProv || sdos.length > 1 ? `<label>SDO <select id="dashSdoFilter"><option value="">All SDOs</option>${sdos.map(sdo => `<option value="${sdo.id}">${escapeHtml(sdo.name)}</option>`).join("")}</select></label>` : ""}
      <label>Site <select id="dashSiteFilter"><option value="">All sites</option>${sitesForFilter.map(site => `<option value="${site.id}">${escapeHtml(site.name)}</option>`).join("")}</select></label>
      <label>Unit <select id="dashUnitFilter"><option value="">All units</option>${(data.availableUnits || []).map(unit => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`).join("")}</select></label>
      <label>Bed type <select id="dashBedTypeFilter"><option value="">All bed types</option>${(data.availableBedTypes || []).map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}</select></label>
      <button data-apply-dashboard="${kind}">Apply</button>
      <button class="secondary" data-clear-dashboard="${kind}">Clear</button>
    </section>
    <section class="cards">
      ${isProv ? metric("Total SDOs", data.totalSdos) : ""}
      ${metric("Total sites", data.totalSites)}
      ${metric("Total beds", data.totalBeds)}
      ${metric("Open beds", data.openBeds)}
      ${metric("Occupied beds", data.occupiedBeds)}
      ${metric("Open percentage", `${data.openPercentage}%`)}
    </section>
    <section class="chart-grid">
      <div class="panel bars"><h2>${isProv ? "Open Beds by SDO" : "Open Beds by Site"}</h2>${chartRows.slice(0, 12).map(row => bar(row.name, row.openBeds, row.totalBeds)).join("")}</div>
      <div class="panel donut"><h2>Status Split</h2><div class="donut-ring" style="--pct:${data.openPercentage}%"><div class="donut-center">${data.openPercentage}%</div></div><div class="legend"><span><i class="legend-open"></i>Open</span><span><i class="legend-occupied"></i>Occupied</span></div></div>
    </section>
    <section class="visual-grid">
      <div class="panel bars"><h2>Unit Availability</h2>${(data.units || []).map(row => stackedBar(row.name, row.openBeds, row.occupiedBeds, row.totalBeds)).join("")}</div>
      <div class="panel bars"><h2>Bed Type Availability</h2>${(data.bedTypes || []).map(row => stackedBar(row.name, row.openBeds, row.occupiedBeds, row.totalBeds)).join("")}</div>
      <div class="panel bars"><h2>Most Open Beds</h2>${topOpenSites.map(row => bar(row.siteName, row.openBeds, row.totalBeds)).join("")}</div>
    </section>
    <section class="panel bars spotlight">
      <h2>Highest Open Percentage</h2>
      <div class="spotlight-grid">${highPctSites.map(row => `<div class="spotlight-item"><strong>${escapeHtml(row.siteName)}</strong><span>${row.openPercentage}% open</span><small>${row.openBeds}/${row.totalBeds} beds</small></div>`).join("")}</div>
    </section>
    <section class="panel table-wrap">
      <table>
        <thead><tr>${isProv ? "<th>SDO</th>" : ""}<th>Site</th><th>Total beds</th><th>Open</th><th>Occupied</th><th>Open %</th><th>Last updated</th></tr></thead>
        <tbody>
          ${rows.map(row => `<tr>${isProv ? `<td>${escapeHtml(row.sdoName)}</td>` : ""}<td><strong>${escapeHtml(row.siteName)}</strong></td><td>${row.totalBeds}</td><td>${row.openBeds}</td><td>${row.occupiedBeds}</td><td>${row.openPercentage}%</td><td>${fmtDate(row.lastUpdatedAt)}</td></tr>`).join("")}
        </tbody>
      </table>
    </section>
  `);
  setIfPresent("dashSdoFilter", filters.sdoId);
  setIfPresent("dashSiteFilter", filters.siteId);
  setIfPresent("dashUnitFilter", filters.unit);
  setIfPresent("dashBedTypeFilter", filters.bedType);
}

function bar(name, openBeds, totalBeds) {
  return `
    <div class="bar-row">
      <strong>${escapeHtml(name)}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${pct(openBeds, totalBeds)}%"></div></div>
      <span>${openBeds}/${totalBeds}</span>
    </div>
  `;
}

function stackedBar(name, openBeds, occupiedBeds, totalBeds) {
  const openPct = pct(openBeds, totalBeds);
  const occupiedPct = totalBeds ? 100 - openPct : 0;
  return `
    <div class="stack-row">
      <div><strong>${escapeHtml(name)}</strong><span>${openBeds} open / ${occupiedBeds} occupied</span></div>
      <div class="stack-track">
        <div class="stack-open" style="width:${openPct}%"></div>
        <div class="stack-occupied" style="width:${occupiedPct}%"></div>
      </div>
      <span>${openPct}%</span>
    </div>
  `;
}

function setIfPresent(id, value) {
  const node = document.getElementById(id);
  if (node && value) node.value = value;
}

async function adminPage() {
  shell(`<p class="muted">Loading admin overview...</p>`);
  const data = await api("/api/admin/overview");
  shell(`
    <div class="page-head">
      <div class="page-title">
        <h1>Admin</h1>
        <p>Reference data, user access, and recent audit activity.</p>
      </div>
    </div>
    <section class="cards">
      ${metric("Users", data.users.length)}
      ${metric("SDOs", data.sdos.length)}
      ${metric("Sites", data.sites.length)}
      ${metric("Beds", data.beds.length + "+")}
      ${metric("Audit logs", data.auditLogs.length)}
    </section>
    <section class="chart-grid">
      <div class="panel table-wrap">
        <table><thead><tr><th>User</th><th>Email</th><th>Role</th></tr></thead><tbody>
          ${data.users.map(user => `<tr><td>${escapeHtml(user.firstName)} ${escapeHtml(user.lastName)}</td><td>${escapeHtml(user.email)}</td><td>${user.role}</td></tr>`).join("")}
        </tbody></table>
      </div>
      <div class="panel table-wrap">
        <table><thead><tr><th>Changed at</th><th>Bed</th><th>Change</th><th>User</th></tr></thead><tbody>
          ${data.auditLogs.map(log => `<tr><td>${fmtDate(log.changedAt)}</td><td>${escapeHtml(log.bed?.bedLabel || "")}</td><td>${log.previousStatus} to ${log.newStatus}</td><td>${escapeHtml(log.changedBy?.email || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No status changes yet.</td></tr>`}
        </tbody></table>
      </div>
    </section>
    <section class="panel table-wrap">
      <table><thead><tr><th>SDO</th><th>Site</th><th>Address</th><th>Code</th></tr></thead><tbody>
        ${data.sites.map(site => {
          const sdo = data.sdos.find(item => item.id === site.sdoId);
          return `<tr><td>${escapeHtml(sdo?.name || "")}</td><td><strong>${escapeHtml(site.name)}</strong></td><td>${escapeHtml(site.address || "")}</td><td>${site.code}</td></tr>`;
        }).join("")}
      </tbody></table>
    </section>
  `);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function render() {
  const path = location.pathname;
  if (!state.token || !state.user) return loginPage();
  try {
    if (path === "/" || path === "/login") return navigate(routeByRole[state.user.role] || "/beds");
    if (path === "/beds") return bedsPage();
    if (path === "/dashboard/sdo") return dashboardPage("sdo");
    if (path === "/dashboard/provincial") return dashboardPage("provincial");
    if (path === "/admin") return adminPage();
    return navigate(routeByRole[state.user.role] || "/beds");
  } catch (err) {
    if (err.message.includes("Authentication")) return logout();
    shell(`<p class="error">${escapeHtml(err.message)}</p>`);
  }
}

document.addEventListener("click", async event => {
  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
  }
  if (event.target.matches("[data-logout]")) logout();
  if (event.target.matches("[data-refresh-beds]")) bedsPage();
  if (event.target.matches("[data-apply-filters]")) renderBeds();
  if (event.target.matches("[data-refresh-dashboard]")) dashboardPage(event.target.dataset.refreshDashboard);
  if (event.target.matches("[data-apply-dashboard]")) {
    const kind = event.target.dataset.applyDashboard;
    state.dashboardFilters[kind] = {
      sdoId: document.getElementById("dashSdoFilter")?.value || "",
      siteId: document.getElementById("dashSiteFilter")?.value || "",
      unit: document.getElementById("dashUnitFilter")?.value || "",
      bedType: document.getElementById("dashBedTypeFilter")?.value || ""
    };
    dashboardPage(kind);
  }
  if (event.target.matches("[data-clear-dashboard]")) {
    const kind = event.target.dataset.clearDashboard;
    state.dashboardFilters[kind] = {};
    dashboardPage(kind);
  }
  if (event.target.matches("[data-toggle-bed]")) {
    const button = event.target;
    button.disabled = true;
    try {
      const updated = await api(`/api/beds/${button.dataset.toggleBed}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.next })
      });
      state.beds = state.beds.map(bed => bed.id === updated.id ? updated : bed);
      toast(`Bed ${updated.bedLabel} set to ${updated.status.toLowerCase()}.`);
      renderBeds();
    } catch (err) {
      toast(err.message);
      button.disabled = false;
    }
  }
});

document.addEventListener("change", event => {
  if (event.target.matches("#dashSdoFilter")) {
    const kind = location.pathname.includes("provincial") ? "provincial" : "sdo";
    state.dashboardFilters[kind] = {
      ...(state.dashboardFilters[kind] || {}),
      sdoId: event.target.value,
      siteId: ""
    };
    dashboardPage(kind);
  }
});

window.addEventListener("popstate", render);
render();
