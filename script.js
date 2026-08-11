// Inisialisasi Lucide Icons
        lucide.createIcons();

/* =======================================================
   APPLICATION CONFIGURATION
======================================================= */

const SYSTEM_INFO = {
    environment: String(window.APP_CONFIG?.ENVIRONMENT || "development"),
    version: String(window.APP_CONFIG?.VERSION || "v2.0.0-foundation"),
    latestUpdate: "10 August 2026",
    status: window.APP_CONFIG?.GAS_URL ? "Online" : "Configuration Required"
};

const MODULES = {

    detailContract: {

        status: "Ready",

        updated: "",

        color: "green"

    },

    vendorCompany: {

        status: "Ready",

        updated: "",

        color: "blue"

    },

    procurementAdmin: {

        status: "Ready",

        updated: "",

        color: "amber"

    },

};

/* =======================================================
   LOAD MODULE STATUS FROM LOCAL STORAGE
======================================================= */

const savedModules = localStorage.getItem("MSW_MODULES");

if(savedModules){

    try{

        Object.assign(
            MODULES,
            JSON.parse(savedModules)
        );

    }catch(e){

        console.warn("Failed to load module status.");

    }

}

/* =======================================================
   RENDER SYSTEM INFORMATION
======================================================= */

function renderSystemInformation(){

    document.getElementById("appEnvironment").textContent =
        SYSTEM_INFO.environment;

    document.getElementById("appVersion").textContent =
        SYSTEM_INFO.version;

    document.getElementById("latestUpdate").textContent =
        SYSTEM_INFO.latestUpdate;

    document.getElementById("statusText").textContent =
        SYSTEM_INFO.status;

    const dot=document.getElementById("statusDot");

    dot.className="w-3 h-3 rounded-full";

    switch(SYSTEM_INFO.status){

        case "Online":

            dot.classList.add("bg-green-500");

            break;

        case "Maintenance":

            dot.classList.add("bg-yellow-500");

            break;

        default:

            dot.classList.add("bg-red-500");

    }

}

/* ======================================================
   RENDER QUICK ACCESS
====================================================== */

function renderModules(){

    document.querySelectorAll("[data-module]").forEach(card=>{

        const moduleName = card.dataset.module;

        const module = MODULES[moduleName];

        if(!module) return;

        const statusElement = card.querySelector(".module-status");
        const updatedElement = card.querySelector(".module-updated");
        const dot = card.querySelector(".module-dot");

        if (statusElement) statusElement.textContent = module.status;
        if (updatedElement) updatedElement.textContent = module.updated || "Not opened yet";
        if (!dot) return;

        dot.className = "w-3 h-3 rounded-full module-dot";

        switch(module.color){

            case "green":

                dot.classList.add("bg-green-300");

                break;

            case "blue":

                dot.classList.add("bg-blue-300");

                break;

            case "amber":

                dot.classList.add("bg-amber-300");

                break;

            case "purple":

                dot.classList.add("bg-violet-300");

                break;

            default:

                dot.classList.add("bg-yellow-500");

        }

    });

}

/* ======================================================
   ACCESS GATE & ROLE-BASED FRONT PAGE
====================================================== */

const SESSION_PROFILE_KEY = "MSW_ACTIVE_PROFILE";
const UI_SETTINGS_KEY = "MSW_UI_SETTINGS";
let ACTIVE_PROFILE = null;
let RESOLVED_AUTH_STORAGE = "";
const AUTH_TOKEN_KEY = "MSW_AUTH_TOKEN";

function normalizedFrontendRole(value) {
  const role = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliases = {
    ADMIN: "PROCUREMENT_ADMIN",
    SUPERADMIN: "SUPER_ADMIN",
    PROCUREMENT: "PROCUREMENT_ADMIN",
    PROCUREMENTADMIN: "PROCUREMENT_ADMIN",
    COMPANY: "VENDOR",
    SUPPLIER: "VENDOR",
    CONTRACTADMIN: "CONTRACT",
    CONTRACT_ADMIN: "CONTRACT",
    CONTRACTMANAGEMENT: "CONTRACT",
    CONTRACT_MANAGEMENT: "CONTRACT"
  };
  return aliases[role] || role;
}

function roleAllowedModules(role) {
  const normalized = normalizedFrontendRole(role);
  if (normalized === "SUPER_ADMIN") return ["*"];
  const shared = window.MSW_SHARED?.allowedModuleIds?.(normalized);
  if (Array.isArray(shared) && shared.length) return shared;
  const map = {
    PROCUREMENT_ADMIN: ["vendorCompany", "vendorRequests", "workspaceAiReminder"],
    BUYER: ["procurementAdmin", "vendorCompany", "vendorRequests", "detailContract"],
    CONTRACT: ["agreementDashboard", "detailContract", "agreementTracker"],
    VENDOR: ["vendorCompany"]
  };
  return map[normalized] || [];
}

function getStoredAuthToken() {
  if (typeof window.MSW_GET_AUTH_TOKEN === "function") {
    return String(window.MSW_GET_AUTH_TOKEN() || "").trim();
  }
  const sessionToken = String(sessionStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  const localToken = String(localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
  const sessionProfile = String(sessionStorage.getItem(SESSION_PROFILE_KEY) || "").trim();
  const localProfile = String(localStorage.getItem(SESSION_PROFILE_KEY) || "").trim();
  if (sessionToken && sessionProfile) return sessionToken;
  if (localToken && localProfile) return localToken;
  return sessionToken || localToken;
}

function clearStoredProfiles() {
  localStorage.removeItem(SESSION_PROFILE_KEY);
  sessionStorage.removeItem(SESSION_PROFILE_KEY);
}

function saveActiveProfile(profile, rememberMe) {
  clearStoredProfiles();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(SESSION_PROFILE_KEY, JSON.stringify(profile || {}));
}

function saveAuthToken(token, rememberMe) {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  // Profil harus dibersihkan bersamaan dengan token agar iframe tidak membaca
  // role lama dari storage yang berbeda (misalnya Buyer lama vs Admin baru).
  clearStoredProfiles();
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(AUTH_TOKEN_KEY, String(token || ""));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(SESSION_PROFILE_KEY);
  sessionStorage.removeItem(SESSION_PROFILE_KEY);
}

function clearUserScopedBrowserData() {
  // Cache bisnis tidak boleh terbawa ke akun berikutnya pada perangkat yang sama.
  // UI settings boleh dipertahankan karena tidak mengandung data procurement.
  const keepLocal = new Set([UI_SETTINGS_KEY]);
  [localStorage, sessionStorage].forEach(storage => {
    const remove = [];
    for (let i = 0; i < storage.length; i++) {
      const key = String(storage.key(i) || "");
      if (key.startsWith("MSW_") && !keepLocal.has(key)) remove.push(key);
      if (/^(procurementAdminSearchText|detailContractSearchText)$/i.test(key)) remove.push(key);
    }
    [...new Set(remove)].forEach(key => storage.removeItem(key));
  });
}

function applyFrontendRole(profile) {
  ACTIVE_PROFILE = profile || null;
  const role = normalizedFrontendRole(profile?.role);
  const allowed = roleAllowedModules(role);

  // Simpan role aktif pada <body> agar CSS dapat ikut menegakkan visibility
  // menu. Ini menjadi lapisan kedua selain JS dan mencegah menu lama muncul
  // akibat style/layout yang mengubah display setelah proses login.
  document.body.dataset.userRole = role;

  document.querySelectorAll("[data-module]").forEach(element => {
    const moduleName = String(element.dataset.module || "").trim();
    element.hidden = !(allowed.includes("*") || allowed.includes(moduleName));
  });

  // Procurement Admin tidak memiliki akses ke modul Procurement maupun Procurement Review.
  // Overdue tetap tersedia sebagai monitoring view-only, tanpa membuka data Procurement penuh.
  // Dashboard Procurement dan Contract Management tetap tidak ditampilkan untuk role ini.
  // AI Procurement Reminder tetap tersedia sesuai matriks akses.
  const adminHiddenNavigationIds = [
    "workspaceDashboard",
    "workspaceProcurement",
    "workspaceProcurementReview",
    "workspaceContract"
  ];
  adminHiddenNavigationIds.forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    const mustHide = role === "PROCUREMENT_ADMIN";
    element.hidden = mustHide;
    // Inline display sengaja dipakai sebagai fail-safe. Attribute hidden tetap
    // dipertahankan untuk aksesibilitas dan CSS role selector menjadi lapisan
    // ketiga. Role lain dipulihkan normal saat berganti akun tanpa reload.
    element.style.display = mustHide ? "none" : "";
    element.setAttribute("aria-hidden", mustHide ? "true" : "false");
  });

  // Role Contract berfokus pada Contract Management dan Recent Activity miliknya.
  // Menu lain disembunyikan agar akses sesuai bidang dan tidak membingungkan.
  const contractHiddenNavigationIds = [
    "workspaceProcurement",
    "workspaceVendor",
    "workspaceVendorRequests",
    "workspaceProcurementReview",
    "workspaceOverdue",
    "workspaceReporting"
  ];
  contractHiddenNavigationIds.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.hidden = role === "CONTRACT";
  });

  // Sidebar Contract dibuat khusus: Dashboard Agreement, Contract Management,
  // Agreement Tracker, Recent Activity, dan AI Contract Reminder.
  const workspaceKicker = document.querySelector(".workspace-navigation-kicker");
  if (workspaceKicker) workspaceKicker.textContent = role === "CONTRACT" ? "CONTRACT WORKSPACE" : "WORKSPACE";
  const aiReminderLabel = document.querySelector("#workspaceAiReminder span");
  if (aiReminderLabel) aiReminderLabel.textContent = role === "CONTRACT" ? "AI Contract Reminder" : "AI Procurement Reminder";

  const accountName = document.getElementById("accountName");
  const accountRole = document.getElementById("accountRole");
  if (accountName) accountName.textContent = profile?.name || profile?.email || "Account";
  if (accountRole) accountRole.textContent = role.replace(/_/g, " ");

  const adminTools = document.getElementById("adminToolsSection");
  if (adminTools) adminTools.hidden = role !== "SUPER_ADMIN";
  if (role === "SUPER_ADMIN") loadPendingUsers({ silent:true });
  if (["SUPER_ADMIN","PROCUREMENT_ADMIN","BUYER"].includes(role)) loadVendorRequestNotifications();

  const overview = document.getElementById("procurementAdminOverview");
  const canViewProcurementReview = ["BUYER", "SUPER_ADMIN"].includes(role);
  // Panel Review/Overdue hanya muncul ketika dipilih dari Workspace sidebar.
  if (overview) overview.hidden = true;

  const overviewTitle = document.getElementById("procurementOverviewTitle");
  const overviewDescription = document.getElementById("procurementOverviewDescription");
  const overviewSummary = document.getElementById("procurementOverviewSummary");
  if (overviewTitle) overviewTitle.textContent = role === "PROCUREMENT_ADMIN" ? "Overdue" : "Procurement Review";
  if (overviewDescription) overviewDescription.textContent =
    role === "PROCUREMENT_ADMIN"
      ? "Monitoring procurement overdue seluruh Buyer. Akses ini hanya menampilkan data overdue dan bersifat view only."
      : (role === "BUYER"
        ? "Monitoring procurement milik Buyer yang sedang login."
        : "Monitoring procurement seluruh Buyer atau Buyer yang dipilih.");
  if (overviewSummary) overviewSummary.hidden = false;

  const buyerPanel = document.getElementById("procurementOverviewBuyerPanel");
  if (buyerPanel) buyerPanel.hidden = role === "BUYER";

  if (canViewProcurementReview) loadProcurementAdminOverview();

  const accountButton = document.getElementById("openLoginModal");
  if (accountButton) {
    accountButton.setAttribute("aria-label", `Account menu for ${profile?.name || profile?.email || "user"}`);
    accountButton.title = `${profile?.name || profile?.email || "Account"} · ${role.replace(/_/g, " ")}`;
  }

  applyRoleDashboard(role);

  // Dashboard iframe dibuat lazy-load. Role Contract/Admin tidak boleh
  // menjalankan dashboard tersembunyi di background.
  if (canLoadProcurementDashboardForRole(role)) {
    ensureProcurementDashboardLoaded();
  } else {
    keepDashboardUnloadedForRestrictedRole(role);
  }

  // Karena Dashboard tidak tersedia untuk Procurement Admin,
  // buka modul pertama yang diizinkan, yaitu Vendor Management.
  if (role === "PROCUREMENT_ADMIN") {
    requestAnimationFrame(() => {
      const modulePage = document.getElementById("modulePage");
      const stillOnDashboard = (document.body.dataset.workspacePanel || "dashboard") === "dashboard";
      if (stillOnDashboard && modulePage?.classList.contains("hidden")) {
        document.getElementById("workspaceVendor")?.click();
      }
    });
  }

  if (role === "CONTRACT") {
    requestAnimationFrame(() => {
      const modulePage = document.getElementById("modulePage");
      const stillOnDashboard = (document.body.dataset.workspacePanel || "dashboard") === "dashboard";
      if (stillOnDashboard && modulePage?.classList.contains("hidden")) {
        document.getElementById("workspaceDashboard")?.click();
      }
    });
  }
}

function setRoleDashboardText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

let PROCUREMENT_OVERVIEW_LOADING = false;
let PROCUREMENT_OVERVIEW_SOURCE_ROWS = [];
let PROCUREMENT_OVERVIEW_YEAR = "ALL";
let PROCUREMENT_OVERVIEW_BUYER = "ALL";
const PROCUREMENT_REVIEW_PAGE_SIZE = 10;
let PROCUREMENT_REVIEW_ROWS = [];
let PROCUREMENT_REVIEW_FILTERS = Array(9).fill("");
let PROCUREMENT_REVIEW_PAGE = 1;
const PROCUREMENT_OVERDUE_PAGE_SIZE = 10;
let PROCUREMENT_OVERDUE_ROWS = [];
let PROCUREMENT_OVERDUE_PAGE = 1;

function overviewText(row, aliases) {
  return String(smartGetField(row, aliases) || "").trim();
}

function overviewEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
}

function overviewProcurementName(row) {
  return overviewText(row, ["Description"]);
}

function overviewFlow(row) {
  return overviewText(row, ["flowprocess", "Flow Process"]);
}

function overviewNormalizedFlow(row) {
  return overviewFlow(row).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function overviewStatus(row) {
  return overviewText(row, ["statuspr", "Status PR", "Status"]);
}

function overviewFinishDate(row) {
  if (!/rfq/i.test(overviewFlow(row))) return "";
  const statusRebid = overviewText(row, ["statusrebid", "Status Rebid"]);
  const thirdLine = statusRebid.split(/\r?\n/).map(value => value.trim()).filter(Boolean)[2] || "";
  const datePattern = /\b(\d{1,2})[\s\/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,\/-]+(\d{4})\b/i;
  const match = thirdLine.match(datePattern) || (statusRebid.match(/(?:^|\s)3\s+of\s+\d+[\s\S]*?(\d{1,2})[\s\/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,\/-]+(\d{4})/i));
  return match ? `${match[1]} ${match[2]} ${match[3]}` : "";
}

function overviewActualPODelDate(row) {
  return overviewText(row, ["actualpodeldate", "Actual PO Del. Date", "Actual PO Delivery Date"]);
}

function overviewRequirementDate(row) {
  return overviewActualPODelDate(row);
}

function overviewAssignDate(row) {
  return overviewText(row, ["assigndate", "Assign Date", "Assign PR", "Assign PR Date", "assignprdate"]);
}

function overviewDateYear(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return String(value.getFullYear());
  const text = String(value || "").trim();
  if (!text) return "";

  const fourDigit = text.match(/\b(20\d{2})\b/);
  if (fourDigit) return fourDigit[1];

  const shortYear = text.match(/(?:^|[\s\-/])(\d{2})$/);
  if (shortYear) return `20${shortYear[1]}`;

  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 20000 && numeric <= 80000) {
    const excelDate = new Date(Date.UTC(1899, 11, 30) + numeric * 86400000);
    if (!Number.isNaN(excelDate.getTime())) return String(excelDate.getUTCFullYear());
  }

  const parsed = overviewParseDate(text);
  return parsed ? String(parsed.getFullYear()) : "";
}

function overviewProcurementYear(row) {
  // Sama seperti Buyer Procurement Year: tahun berasal dari Assign Date.
  return overviewDateYear(overviewAssignDate(row));
}

function overviewBuyerLabel(row) {
  return overviewText(row, [
    "ownerName", "Owner Name", "Buyer (Ditambahkan)", "buyer", "Buyer",
    "Buyer Name", "Signature Buyer", "ownerEmail", "Owner Email"
  ]) || "Unassigned";
}

function overviewBuyerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function renderProcurementOverviewBuyerOptions(rows) {
  const select = document.getElementById("procurementOverviewBuyerSelect");
  const caption = document.getElementById("procurementOverviewBuyerCaption");
  if (!select) return;

  const labels = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const label = overviewBuyerLabel(row);
    const key = overviewBuyerKey(label);
    if (key && !labels.has(key)) labels.set(key, label);
  });
  const options = [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], "id"));
  if (PROCUREMENT_OVERVIEW_BUYER !== "ALL" && !labels.has(PROCUREMENT_OVERVIEW_BUYER)) {
    PROCUREMENT_OVERVIEW_BUYER = "ALL";
  }
  select.innerHTML = [
    '<option value="ALL">All Buyers</option>',
    ...options.map(([key, label]) =>
      `<option value="${overviewEscape(key)}">${overviewEscape(label)}</option>`
    )
  ].join("");
  select.value = PROCUREMENT_OVERVIEW_BUYER;
  if (caption) {
    caption.textContent = PROCUREMENT_OVERVIEW_BUYER === "ALL"
      ? "All Buyers"
      : (labels.get(PROCUREMENT_OVERVIEW_BUYER) || "Buyer");
  }
}

function renderProcurementOverviewYearButtons(rows) {
  const container = document.getElementById("procurementOverviewYearButtons");
  const caption = document.getElementById("procurementOverviewYearCaption");
  if (!container) return;

  const years = [...new Set((Array.isArray(rows) ? rows : [])
    .map(overviewProcurementYear)
    .filter(Boolean))]
    .sort((a, b) => Number(b) - Number(a));

  if (PROCUREMENT_OVERVIEW_YEAR !== "ALL" && !years.includes(PROCUREMENT_OVERVIEW_YEAR)) {
    PROCUREMENT_OVERVIEW_YEAR = "ALL";
  }

  container.innerHTML = ["ALL", ...years].map(year => {
    const label = year === "ALL" ? "All" : year;
    const active = year === PROCUREMENT_OVERVIEW_YEAR ? " is-active" : "";
    return `<button class="${active.trim()}" type="button" data-procurement-overview-year="${overviewEscape(year)}" aria-pressed="${year === PROCUREMENT_OVERVIEW_YEAR}">${overviewEscape(label)}</button>`;
  }).join("");

  if (caption) caption.textContent = PROCUREMENT_OVERVIEW_YEAR === "ALL"
    ? "All Years · berdasarkan Assign Date"
    : `${PROCUREMENT_OVERVIEW_YEAR} · berdasarkan Assign Date`;
}

function overviewActualPORelDate(row) {
  return overviewText(row, ["actualporeldate", "Actual PO Rel. Date", "actualporeleasedate", "Actual PO Release Date"]);
}

function overviewGrnDate(row) {
  return overviewText(row, ["actualreceivedpo", "Actual Received PO (GRN Date)", "GRN Date"]);
}

function overviewIsCancelled(row) {
  return /\bcancel(?:led)?\b/i.test(`${overviewStatus(row)} ${overviewFlow(row)}`);
}

function overviewIsCompleted(row) {
  return /completed/i.test(overviewFlow(row));
}

function overviewIsOngoing(row) {
  const flow = overviewNormalizedFlow(row);
  return !/completed/.test(flow) && /create\s*(bl|bidder\s*list)|rfq|create\s*cqs|\bcqs\b|create\s*po/.test(flow);
}

function overviewUniqueKey(row, index) {
  const raw = overviewText(row, ["noPR", "No PR", "PR Number"]);
  const normalized = raw.toUpperCase().replace(/\s*\(?LINE\b.*$/i, "").replace(/\s+/g, "").trim();
  return normalized || `__row_${index}`;
}

function overviewIsHiddenStatus(row) {
  return overviewIsCancelled(row) || (overviewIsCompleted(row) && Boolean(overviewGrnDate(row)));
}

function overviewReviewValues(row) {
  return [
    overviewText(row, ["noPR", "No PR", "PR Number"]),
    overviewProcurementName(row),
    overviewText(row, ["ownerName", "Owner Name", "Buyer (Ditambahkan)", "buyer", "Buyer", "Buyer Name", "Signature Buyer", "ownerEmail", "Owner Email"]),
    overviewText(row, ["pic", "PIC"]),
    overviewStatus(row),
    overviewFlow(row),
    overviewFinishDate(row),
    overviewRequirementDate(row),
    overviewText(row, ["notebuyer", "Note Buyer", "Buyer Note", "Note"])
  ];
}

function overviewFlowPriority(row) {
  const flow = overviewNormalizedFlow(row);
  if (/create\s*(bl|bidder\s*list)/.test(flow)) return 0;
  if (/\brfq\b/.test(flow)) return 1;
  if (/create\s*cqs|\bcqs\b/.test(flow)) return 2;
  return 3;
}

function overviewParseDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const numeric = text.match(/^\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s*$/);
  if (numeric) {
    const parsedNumeric = new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    return Number.isNaN(parsedNumeric.getTime()) ? null : parsedNumeric;
  }
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return new Date(direct.getFullYear(), direct.getMonth(), direct.getDate());
  const match = text.match(/\b(\d{1,2})[\s\/-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,\/-]+(\d{4})\b/i);
  if (!match) return null;
  const parsed = new Date(`${match[1]} ${match[2]} ${match[3]}`);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function overviewDaysUntil(value) {
  const target = overviewParseDate(value);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function overviewPaginationItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("ellipsis-start");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < total - 1) items.push("ellipsis-end");
  items.push(total);
  return items;
}

function renderProcurementReviewPage() {
  const filteredRows = PROCUREMENT_REVIEW_ROWS.filter(row => overviewReviewValues(row).every((value, index) =>
    !PROCUREMENT_REVIEW_FILTERS[index] || String(value || "").toLowerCase().includes(PROCUREMENT_REVIEW_FILTERS[index])
  ));
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PROCUREMENT_REVIEW_PAGE_SIZE));
  PROCUREMENT_REVIEW_PAGE = Math.min(Math.max(1, PROCUREMENT_REVIEW_PAGE), totalPages);
  const start = (PROCUREMENT_REVIEW_PAGE - 1) * PROCUREMENT_REVIEW_PAGE_SIZE;
  const pageRows = filteredRows.slice(start, start + PROCUREMENT_REVIEW_PAGE_SIZE);
  const tableBody = document.getElementById("procurementOverviewRows");
  if (tableBody) {
    tableBody.innerHTML = pageRows.length ? pageRows.map(row => {
      const values = overviewReviewValues(row);
      return `<tr>${values.map(value => `<td>${overviewEscape(value || "-")}</td>`).join("")}</tr>`;
    }).join("") : '<tr><td colspan="9" class="procurement-overview-state">Belum ada data procurement aktif.</td></tr>';
  }
  const info = document.getElementById("procurementReviewInfo");
  if (info) info.textContent = total ? `Showing ${start + 1} to ${Math.min(start + PROCUREMENT_REVIEW_PAGE_SIZE, total)} of ${total} entries` : "Showing 0 to 0 of 0 entries";
  const nav = document.getElementById("procurementReviewPagination");
  if (nav) {
    nav.hidden = totalPages <= 1;
    nav.innerHTML = totalPages <= 1 ? "" : [
      `<button type="button" data-overview-page="${PROCUREMENT_REVIEW_PAGE - 1}" ${PROCUREMENT_REVIEW_PAGE === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`,
      ...overviewPaginationItems(PROCUREMENT_REVIEW_PAGE, totalPages).map(item => typeof item === "number" ? `<button type="button" data-overview-page="${item}" class="${item === PROCUREMENT_REVIEW_PAGE ? "is-active" : ""}">${item}</button>` : '<span>…</span>'),
      `<button type="button" data-overview-page="${PROCUREMENT_REVIEW_PAGE + 1}" ${PROCUREMENT_REVIEW_PAGE === totalPages ? "disabled" : ""} aria-label="Next page">›</button>`
    ].join("");
  }
}

function renderOverduePage() {
  const total = PROCUREMENT_OVERDUE_ROWS.length;
  const totalPages = Math.max(1, Math.ceil(total / PROCUREMENT_OVERDUE_PAGE_SIZE));
  PROCUREMENT_OVERDUE_PAGE = Math.min(Math.max(1, PROCUREMENT_OVERDUE_PAGE), totalPages);
  const start = (PROCUREMENT_OVERDUE_PAGE - 1) * PROCUREMENT_OVERDUE_PAGE_SIZE;
  const pageRows = PROCUREMENT_OVERDUE_ROWS.slice(start, start + PROCUREMENT_OVERDUE_PAGE_SIZE);
  const body = document.getElementById("procurementOverdueRows");
  if (body) body.innerHTML = pageRows.length ? pageRows.map(item => `<tr><td>${overviewEscape(overviewText(item.row, ["noPR", "No PR", "PR Number"]) || "-")}</td><td>${overviewEscape(overviewProcurementName(item.row) || "-")}</td><td>${overviewEscape(overviewText(item.row, ["nopo", "noPO", "No PO", "PO Number"]) || "-")}</td><td>${overviewEscape(overviewText(item.row, ["winnerpo", "Winner PO"]) || "-")}</td><td>${overviewEscape(overviewActualPODelDate(item.row) || "-")}</td><td><span class="procurement-overdue-days">${Math.abs(item.days)} day${Math.abs(item.days) === 1 ? "" : "s"}</span></td></tr>`).join("") : '<tr><td colspan="6" class="procurement-overview-state">Tidak ada procurement overdue.</td></tr>';
  const info = document.getElementById("procurementOverdueInfo");
  if (info) info.textContent = total ? `Showing ${start + 1} to ${Math.min(start + PROCUREMENT_OVERDUE_PAGE_SIZE, total)} of ${total} entries` : "Showing 0 to 0 of 0 entries";
  const nav = document.getElementById("procurementOverduePagination");
  if (nav) {
    nav.hidden = totalPages <= 1;
    nav.innerHTML = totalPages <= 1 ? "" : [
      `<button type="button" data-overdue-page="${PROCUREMENT_OVERDUE_PAGE - 1}" ${PROCUREMENT_OVERDUE_PAGE === 1 ? "disabled" : ""} aria-label="Previous overdue page">‹</button>`,
      ...overviewPaginationItems(PROCUREMENT_OVERDUE_PAGE, totalPages).map(item => typeof item === "number" ? `<button type="button" data-overdue-page="${item}" class="${item === PROCUREMENT_OVERDUE_PAGE ? "is-active" : ""}">${item}</button>` : '<span>…</span>'),
      `<button type="button" data-overdue-page="${PROCUREMENT_OVERDUE_PAGE + 1}" ${PROCUREMENT_OVERDUE_PAGE === totalPages ? "disabled" : ""} aria-label="Next overdue page">›</button>`
    ].join("");
  }
}

function renderOverdueRows(rows) {
  PROCUREMENT_OVERDUE_ROWS = rows.map(row => ({ row, days: overviewDaysUntil(overviewActualPODelDate(row)) }))
    .filter(item => !overviewGrnDate(item.row) && item.days !== null && item.days < 0)
    .sort((a, b) => a.days - b.days);
  PROCUREMENT_OVERDUE_PAGE = 1;
  renderOverduePage();
}

function renderProcurementAdminOverview(rows) {
  if (Array.isArray(rows)) PROCUREMENT_OVERVIEW_SOURCE_ROWS = rows;

  const sourceRows = Array.isArray(PROCUREMENT_OVERVIEW_SOURCE_ROWS) ? PROCUREMENT_OVERVIEW_SOURCE_ROWS : [];
  const allValidRows = sourceRows.filter(row =>
    overviewText(row, ["noPR", "No PR", "PR Number", "procurementId", "Procurement ID"]) || overviewProcurementName(row)
  );

  renderProcurementOverviewYearButtons(allValidRows);
  renderProcurementOverviewBuyerOptions(allValidRows);

  const yearRows = PROCUREMENT_OVERVIEW_YEAR === "ALL"
    ? allValidRows
    : allValidRows.filter(row => overviewProcurementYear(row) === PROCUREMENT_OVERVIEW_YEAR);
  const validRows = PROCUREMENT_OVERVIEW_BUYER === "ALL"
    ? yearRows
    : yearRows.filter(row => overviewBuyerKey(overviewBuyerLabel(row)) === PROCUREMENT_OVERVIEW_BUYER);

  const currentRole = normalizedFrontendRole(ACTIVE_PROFILE?.role);
  if (currentRole === "PROCUREMENT_ADMIN") {
    // Endpoint Admin sudah mengirim hanya baris yang benar-benar overdue.
    // Jangan isi Procurement Review atau summary Procurement agar Admin tidak menerima akses tambahan.
    PROCUREMENT_REVIEW_ROWS = [];
    renderOverdueRows(validRows);
    const yearLabel = PROCUREMENT_OVERVIEW_YEAR === "ALL" ? "semua tahun" : `tahun ${PROCUREMENT_OVERVIEW_YEAR}`;
    const buyerLabel = PROCUREMENT_OVERVIEW_BUYER === "ALL"
      ? "semua Buyer"
      : (document.getElementById("procurementOverviewBuyerSelect")?.selectedOptions?.[0]?.textContent || "Buyer terpilih");
    setRoleDashboardText("procurementOverviewUpdated", `Overdue · ${yearLabel} · ${buyerLabel} · diperbarui ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`);
    return;
  }

  const visibleRows = validRows.filter(row => !overviewIsHiddenStatus(row));
  const totalKeys = new Set();
  const ongoingKeys = new Set();
  const completedKeys = new Set();
  const closingSoonKeys = new Set();
  const overdueKeys = new Set();
  validRows.forEach((row, index) => {
    const key = overviewUniqueKey(row, index);
    if (!overviewIsCancelled(row)) totalKeys.add(key);
    if (!overviewIsHiddenStatus(row) && overviewIsOngoing(row)) ongoingKeys.add(key);
    if (!overviewIsCancelled(row) && overviewIsCompleted(row)) completedKeys.add(key);
    const remainingDays = overviewDaysUntil(overviewRequirementDate(row));
    const overdueDays = overviewDaysUntil(overviewActualPODelDate(row));
    if (!overviewIsHiddenStatus(row) && !/completed/i.test(overviewFlow(row)) && remainingDays !== null && remainingDays >= 0 && remainingDays <= 7) closingSoonKeys.add(key);
    if (!overviewIsHiddenStatus(row) && !overviewIsCompleted(row) && !overviewGrnDate(row) && overdueDays !== null && overdueDays < 0) overdueKeys.add(key);
  });

  setRoleDashboardText("overviewTotal", totalKeys.size);
  setRoleDashboardText("overviewOngoing", ongoingKeys.size);
  setRoleDashboardText("overviewCompleted", completedKeys.size);
  setRoleDashboardText("overviewClosingSoon", closingSoonKeys.size);
  setRoleDashboardText("overviewOverdue", overdueKeys.size);

  PROCUREMENT_REVIEW_ROWS = visibleRows.map((row, index) => ({ row, index }))
    .sort((a, b) => overviewFlowPriority(a.row) - overviewFlowPriority(b.row) || a.index - b.index)
    .map(item => item.row);
  PROCUREMENT_REVIEW_PAGE = 1;
  renderProcurementReviewPage();
  renderOverdueRows(visibleRows.filter(row => !/completed/i.test(overviewFlow(row))));
  const yearLabel = PROCUREMENT_OVERVIEW_YEAR === "ALL" ? "semua tahun" : `tahun ${PROCUREMENT_OVERVIEW_YEAR}`;
  const buyerLabel = PROCUREMENT_OVERVIEW_BUYER === "ALL"
    ? "semua Buyer"
    : (document.getElementById("procurementOverviewBuyerSelect")?.selectedOptions?.[0]?.textContent || "Buyer terpilih");
  setRoleDashboardText("procurementOverviewUpdated", `Menampilkan ${yearLabel} · ${buyerLabel} · diperbarui ${new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`);
}

document.addEventListener("click", event => {
  const yearButton = event.target.closest("[data-procurement-overview-year]");
  if (yearButton) {
    const year = String(yearButton.dataset.procurementOverviewYear || "ALL").trim() || "ALL";
    PROCUREMENT_OVERVIEW_YEAR = year;
    PROCUREMENT_REVIEW_PAGE = 1;
    PROCUREMENT_OVERDUE_PAGE = 1;
    PROCUREMENT_REVIEW_FILTERS = Array(9).fill("");
    closeProcurementReviewFilter();
    updateProcurementFilterButtons();
    renderProcurementAdminOverview();
    return;
  }

  const filterButton = event.target.closest("[data-procurement-filter-button]");
  if (filterButton) {
    event.stopPropagation();
    openProcurementReviewFilter(filterButton);
    return;
  }
  const button = event.target.closest("[data-overview-page]");
  if (button && !button.disabled) {
    PROCUREMENT_REVIEW_PAGE = Number(button.dataset.overviewPage) || 1;
    renderProcurementReviewPage();
    return;
  }
  const overdueButton = event.target.closest("[data-overdue-page]");
  if (!overdueButton || overdueButton.disabled) return;
  PROCUREMENT_OVERDUE_PAGE = Number(overdueButton.dataset.overduePage) || 1;
  renderOverduePage();
});

function updateProcurementFilterButtons() {
  document.querySelectorAll("[data-procurement-filter-button]").forEach(button => {
    const index = Number(button.dataset.procurementFilterButton);
    button.classList.toggle("is-active", Boolean(PROCUREMENT_REVIEW_FILTERS[index]));
  });
}

function closeProcurementReviewFilter() {
  document.getElementById("procurementReviewFilterPopover")?.remove();
}

function openProcurementReviewFilter(button) {
  closeProcurementReviewFilter();
  const index = Number(button.dataset.procurementFilterButton);
  if (!Number.isInteger(index) || index < 0 || index >= PROCUREMENT_REVIEW_FILTERS.length) return;
  const popover = document.createElement("div");
  popover.id = "procurementReviewFilterPopover";
  popover.className = "procurement-filter-popover";
  popover.innerHTML = `<input type="search" data-procurement-review-filter="${index}" value="${overviewEscape(PROCUREMENT_REVIEW_FILTERS[index] || "")}" placeholder="Cari data…" aria-label="${overviewEscape(button.getAttribute("aria-label") || "Filter kolom")}"><div class="procurement-filter-popover-actions"><button type="button" data-procurement-filter-clear>Hapus</button><button type="button" data-procurement-filter-close>Selesai</button></div>`;
  document.body.appendChild(popover);
  const rect = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.right - popover.offsetWidth, window.innerWidth - popover.offsetWidth - 8));
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - popover.offsetHeight - 8)}px`;
  const input = popover.querySelector("input");
  input?.focus();
  input?.select();
  popover.addEventListener("click", event => {
    event.stopPropagation();
    if (event.target.closest("[data-procurement-filter-clear]")) {
      PROCUREMENT_REVIEW_FILTERS[index] = "";
      if (input) input.value = "";
      PROCUREMENT_REVIEW_PAGE = 1;
      renderProcurementReviewPage();
      updateProcurementFilterButtons();
      input?.focus();
    }
    if (event.target.closest("[data-procurement-filter-close]")) closeProcurementReviewFilter();
  });
}

document.addEventListener("click", event => {
  if (!event.target.closest("#procurementReviewFilterPopover") && !event.target.closest("[data-procurement-filter-button]")) closeProcurementReviewFilter();
});

document.addEventListener("input", event => {
  const input = event.target.closest("[data-procurement-review-filter]");
  if (!input) return;
  const index = Number(input.dataset.procurementReviewFilter);
  if (!Number.isInteger(index) || index < 0 || index >= PROCUREMENT_REVIEW_FILTERS.length) return;
  PROCUREMENT_REVIEW_FILTERS[index] = input.value.trim().toLowerCase();
  PROCUREMENT_REVIEW_PAGE = 1;
  renderProcurementReviewPage();
  updateProcurementFilterButtons();
});

async function loadProcurementAdminOverview() {
  if (!getStoredAuthToken()) return;
  const role = normalizedFrontendRole(ACTIVE_PROFILE?.role);
  if (PROCUREMENT_OVERVIEW_LOADING || !["BUYER", "SUPER_ADMIN", "PROCUREMENT_ADMIN"].includes(role)) return;
  PROCUREMENT_OVERVIEW_LOADING = true;

  // Procurement Admin tidak boleh membaca cache Procurement penuh dari akun/role lain.
  // Role ini selalu mengambil endpoint GET_OVERDUE yang sudah difilter di backend.
  const cachedRows = role === "PROCUREMENT_ADMIN" ? [] : smartLoadCache("MSW_PROCUREMENT_CACHE");
  if (cachedRows.length) renderProcurementAdminOverview(cachedRows);
  try {
    const rows = role === "PROCUREMENT_ADMIN"
      ? await smartFetchOverdueForAdmin()
      : await smartFetchSheet("Admin");
    renderProcurementAdminOverview(rows);
    if (role !== "PROCUREMENT_ADMIN") {
      try { window.MSW?.cache?.save("MSW_PROCUREMENT_CACHE", rows); } catch (_) {}
    }
  } catch (error) {
    console.warn("Procurement Overview belum dapat diperbarui:", error);
    if (!cachedRows.length) {
      const targetBody = role === "PROCUREMENT_ADMIN"
        ? document.getElementById("procurementOverdueRows")
        : document.getElementById("procurementOverviewRows");
      const colspan = role === "PROCUREMENT_ADMIN" ? 6 : 9;
      if (targetBody) targetBody.innerHTML = `<tr><td colspan="${colspan}" class="procurement-overview-state">${overviewEscape(error.message || "Ringkasan belum dapat dimuat.")}</td></tr>`;
    }
  } finally {
    PROCUREMENT_OVERVIEW_LOADING = false;
  }
}

function applyRoleDashboard(role) {
  const labels = {
    SUPER_ADMIN: {
      badge: "Super Admin Workspace",
      access: ["Full Access", "Full Access", "Full Access", "Full Access"]
    },
    PROCUREMENT_ADMIN: {
      badge: "Procurement Admin Workspace",
      access: ["Admin Access", "Full Access", "Full Access", "Process Requests"]
    },
    BUYER: {
      badge: "Buyer Workspace",
      access: ["Buyer Access", "View Only", "View Only", "My Requests"]
    },
    CONTRACT: {
      badge: "Contract Workspace",
      access: ["No Access", "No Access", "Full Access", "No Access"]
    },
    VENDOR: {
      badge: "Vendor Workspace",
      access: ["No Access", "Vendor Access", "No Access", "No Access"]
    }
  };
  const view = labels[role] || labels.BUYER;
  document.body.dataset.userRole = role;
  setRoleDashboardText("roleDashboardBadge", view.badge);
  setRoleDashboardText("dashboardHeroTitle", "MSW E-PROCUREMENT PORTAL");
  setRoleDashboardText("dashboardHeroSubtitle", "Integrated Procurement Management System");
  setRoleDashboardText(
    "dashboardHeroDescription",
    "Tampilan, tabel, filter, dan navigasi yang sama untuk seluruh role; data dan tindakan mengikuti permission akun."
  );
  setRoleDashboardText("procurementCardDescription", "Manage and monitor procurement activities.");
  setRoleDashboardText("procurementAccessLabel", view.access[0]);
  setRoleDashboardText("vendorCardDescription", "Vendor information, qualification, and contacts.");
  setRoleDashboardText("vendorAccessLabel", view.access[1]);
  setRoleDashboardText("contractCardDescription", "Contract database, status, and monitoring.");
  setRoleDashboardText("contractAccessLabel", view.access[2]);
  setRoleDashboardText("vendorRequestsCardDescription", "Submit, review, and monitor vendor addition requests.");
  setRoleDashboardText("vendorRequestsAccessLabel", view.access[3]);
  setRoleDashboardText("vendorRequestPrimaryAction", role === "BUYER" ? "+ Request Add Vendor" : "Open Vendor Requests");
}

async function loadVendorRequestNotifications() {
  try {
    const gasUrl=String(window.APP_CONFIG?.GAS_URL||"").trim();
    const response=await fetch(`${gasUrl}?action=LIST_VENDOR_REQUESTS&_=${Date.now()}`,{cache:"no-store"});
    const data=await response.json(); if(!data?.success) return;
    const badge=document.getElementById("vendorRequestBadge"), count=Number(data.unreadCount||0);
    if(badge){badge.textContent=String(count);badge.hidden=count===0;}
    if(count>0 && normalizedFrontendRole(ACTIVE_PROFILE?.role)==="BUYER") {
      const names=(data.requests||[]).filter(item=>item.status!=="PENDING REVIEW"&&!item.notificationReadAt).slice(0,3).map(item=>item.companyName).filter(Boolean);
      showDashboardNotification(`Ada ${count} pembaruan Vendor Request${names.length?`: ${names.join(", ")}`:"."}`);
    }
  } catch (_) {}
}

function showDashboardNotification(message) {
  let box=document.getElementById("vendorRequestNotification");
  if(!box){box=document.createElement("button");box.id="vendorRequestNotification";box.type="button";box.style.cssText="position:fixed;right:20px;top:82px;z-index:9999;max-width:380px;padding:13px 16px;border:0;border-radius:10px;background:#173d67;color:#fff;box-shadow:0 8px 30px #0003;text-align:left;cursor:pointer";box.addEventListener("click",()=>document.getElementById("workspaceVendorRequests")?.click());document.body.appendChild(box);}
  box.textContent=message;box.hidden=false;
}

function escapeApprovalHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}
async function loadPendingUsers({silent=false}={}) {
  if(normalizedFrontendRole(ACTIVE_PROFILE?.role)!=="SUPER_ADMIN") return;
  const status=document.getElementById("userApprovalsStatus");
  if(!silent&&status) status.textContent="Loading pending registrations...";
  try {
    const gasUrl=String(window.APP_CONFIG?.GAS_URL||"").trim();
    const response=await fetch(`${gasUrl}?action=listPendingUsers&authToken=${encodeURIComponent(getStoredAuthToken())}&_=${Date.now()}`,{cache:"no-store"});
    const data=await response.json(); if(!data?.success) throw new Error(data?.message||"Unable to load registrations.");
    renderPendingUsers(data.users||[]);
  } catch(error) { if(status) status.textContent=error?.message||String(error); }
}
function renderPendingUsers(users) {
  const list=document.getElementById("pendingUsersList"),status=document.getElementById("userApprovalsStatus"),badge=document.getElementById("pendingUserBadge");
  if(badge){badge.textContent=String(users.length);badge.hidden=users.length===0;}
  if(status) status.textContent=users.length?`${users.length} registration(s) awaiting review.`:"No pending registrations.";
  if(!list)return;
  list.innerHTML=users.map(user=>`<article class="approval-item" data-email="${escapeApprovalHtml(user.email)}"><div><strong>${escapeApprovalHtml(user.name||"Unnamed user")}</strong><span>${escapeApprovalHtml(user.email)}</span><small>${escapeApprovalHtml(user.phone)}${user.createdAt?` · ${escapeApprovalHtml(user.createdAt)}`:""}</small></div><label>Role<select class="approval-role"><option value="SUPER_ADMIN">Super Admin</option><option value="PROCUREMENT_ADMIN">Admin</option><option value="BUYER">Buyer</option><option value="CONTRACT">Contract</option><option value="VENDOR">Vendor</option></select></label><div class="approval-actions"><button type="button" class="approval-reject">Reject</button><button type="button" class="approval-approve">Approve</button></div></article>`).join("");
  list.querySelectorAll(".approval-item").forEach(item=>{item.querySelector(".approval-approve")?.addEventListener("click",()=>reviewPendingUser(item,"APPROVE"));item.querySelector(".approval-reject")?.addEventListener("click",()=>reviewPendingUser(item,"REJECT"));});
}
async function reviewPendingUser(item,decision) {
  const buttons=item.querySelectorAll("button");buttons.forEach(button=>button.disabled=true);
  try {await authPost({action:"REVIEW_PENDING_USER",authToken:getStoredAuthToken(),email:item.dataset.email,decision,role:item.querySelector(".approval-role")?.value||"BUYER"});await loadPendingUsers();}
  catch(error){document.getElementById("userApprovalsStatus").textContent=error?.message||String(error);buttons.forEach(button=>button.disabled=false);}
}
function openUserApprovals(){if(normalizedFrontendRole(ACTIVE_PROFILE?.role)!=="SUPER_ADMIN")return;toggleAccountMenu(false);document.getElementById("userApprovalsModal")?.classList.remove("hidden");loadPendingUsers();}
function closeUserApprovals(){document.getElementById("userApprovalsModal")?.classList.add("hidden");}
document.getElementById("userApprovalsButton")?.addEventListener("click",openUserApprovals);
document.querySelectorAll("[data-close-user-approvals]").forEach(element=>element.addEventListener("click",closeUserApprovals));

function hideAccessGate() {
  document.getElementById("accessGate")?.classList.add("is-hidden");
  document.body.classList.remove("app-locked");
}

function showAccessGate(message = "") {
  document.body.classList.add("app-locked");
  document.getElementById("accessGate")?.classList.remove("is-hidden");
  document.getElementById("accountMenu")?.classList.add("hidden");
  if (message) document.getElementById("accessGateStatus").textContent = message;
}

async function authPost(payload) {
  const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
  if (!gasUrl) throw new Error("GAS_URL is not configured.");
  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch (_) { throw new Error("Apps Script returned an invalid response. Please verify the /exec deployment."); }
  if (!data?.success) throw new Error(data?.message || "Request failed.");
  return data;
}

function setAuthTab(tab) {
  const signin = tab === "signin";
  document.getElementById("signInForm").hidden = !signin;
  document.getElementById("signUpForm").hidden = signin;
  document.getElementById("signInTab").classList.toggle("is-active", signin);
  document.getElementById("signUpTab").classList.toggle("is-active", !signin);
}

async function signIn(event) {
  event.preventDefault();
  const button = document.getElementById("signInButton");
  const status = document.getElementById("accessGateStatus");
  const rememberMe = document.getElementById("rememberMe").checked;
  button.disabled = true;
  status.textContent = "Verifying your account...";

  try {
    const result = await authPost({
      action: "LOGIN_USER",
      email: document.getElementById("signInEmail").value,
      password: document.getElementById("signInPassword").value,
      rememberMe
    });
    clearUserScopedBrowserData();
    saveAuthToken(result.token, rememberMe);
    saveActiveProfile(result.profile, rememberMe);
    applyFrontendRole(result.profile);
    hideAccessGate();
    initializeAuthenticatedFeatures();
  } catch (error) {
    status.textContent = error?.message || String(error);
  } finally {
    button.disabled = false;
  }
}

async function signUp(event) {
  event.preventDefault();
  const button = document.getElementById("signUpButton");
  const status = document.getElementById("signUpStatus");
  const password = document.getElementById("signUpPassword").value;
  if (password !== document.getElementById("signUpConfirm").value) {
    status.textContent = "Passwords do not match.";
    return;
  }
  button.disabled = true;
  status.textContent = "Submitting registration...";
  try {
    const result = await authPost({
      action: "REGISTER_USER",
      name: document.getElementById("signUpName").value,
      phone: document.getElementById("signUpPhone").value,
      email: document.getElementById("signUpEmail").value,
      password
    });
    status.textContent = result.message;
    document.getElementById("signUpForm").reset();
  } catch (error) {
    status.textContent = error?.message || String(error);
  } finally {
    button.disabled = false;
  }
}

async function resolveActiveProfile() {
  const gasUrl = String(window.APP_CONFIG?.GAS_URL || "").trim();
  if (!gasUrl) return null;

  const candidates = [
    { name: "session", storage: sessionStorage },
    { name: "local", storage: localStorage }
  ].map(item => ({
    ...item,
    token: String(item.storage.getItem(AUTH_TOKEN_KEY) || "").trim(),
    profileRaw: String(item.storage.getItem(SESSION_PROFILE_KEY) || "").trim()
  })).filter(item => item.token);

  // Storage yang memiliki profile diprioritaskan, lalu sessionStorage.
  candidates.sort((a, b) => Number(Boolean(b.profileRaw)) - Number(Boolean(a.profileRaw)) || (a.name === "session" ? -1 : 1));
  const seen = new Set();

  for (const candidate of candidates) {
    if (seen.has(candidate.token)) continue;
    seen.add(candidate.token);
    try {
      const response = await fetch(
        `${gasUrl}?action=getCurrentUserProfile&authToken=${encodeURIComponent(candidate.token)}`,
        { cache: "no-store" }
      );
      const raw = await response.text();
      let profile;
      try { profile = JSON.parse(raw); }
      catch (_) { throw new Error("Apps Script session response is not valid JSON."); }

      if (profile?.found && profile?.active && profile?.role) {
        RESOLVED_AUTH_STORAGE = candidate.name;
        // Hapus pasangan auth lain agar semua iframe membaca session yang sama.
        const other = candidate.name === "session" ? localStorage : sessionStorage;
        other.removeItem(AUTH_TOKEN_KEY);
        other.removeItem(SESSION_PROFILE_KEY);
        return profile;
      }

      // Token kandidat tidak valid; bersihkan hanya kandidat itu lalu coba storage lain.
      candidate.storage.removeItem(AUTH_TOKEN_KEY);
      candidate.storage.removeItem(SESSION_PROFILE_KEY);
    } catch (error) {
      // Network/backend error bukan bukti token invalid. Lempar agar UI menampilkan
      // status koneksi tanpa menghapus session yang mungkin masih sah.
      throw error;
    }
  }
  RESOLVED_AUTH_STORAGE = "";
  return null;
}

async function logout() {
  const token = getStoredAuthToken();
  const button = document.getElementById("signOutButton");
  if (button) button.disabled = true;

  try {
    const pendingBefore = window.MSW?.sync?.getPendingCount?.() || 0;
    if (pendingBefore) {
      const synced = await window.MSW.sync.waitUntilSynced();
      const remaining = window.MSW.sync.getPendingCount();
      if (!synced || remaining) {
        alert(
          `Masih ada ${remaining} perubahan yang belum tersimpan ke Google Sheet.\n\n` +
          "Logout ditahan agar data tidak hilang. Periksa koneksi internet lalu coba kembali."
        );
        return;
      }
    }

    if (token) {
      try { await authPost({ action: "LOGOUT_USER", authToken: token }); } catch (_) {}
    }

    clearUserScopedBrowserData();
    clearAuthSession();
    ACTIVE_PROFILE = null;
    toggleAccountMenu(false);
    showAccessGate("You have signed out.");
    setAuthTab("signin");
    document.getElementById("signInForm")?.reset();
    document.getElementById("openLoginModal")?.setAttribute("aria-expanded", "false");
  } finally {
    if (button) button.disabled = false;
  }
}

function toggleAccountMenu(force) {
  const menu = document.getElementById("accountMenu");
  if (!menu) return;
  const shouldOpen = typeof force === "boolean" ? force : menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !shouldOpen);
}


function getUiSettings() {
  try {
    return Object.assign({ compactDashboard:false, reduceMotion:false, adminToolsNewTab:true }, JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || "{}"));
  } catch (_) {
    return { compactDashboard:false, reduceMotion:false, adminToolsNewTab:true };
  }
}

function applyUiSettings(settings = getUiSettings()) {
  document.body.classList.toggle("compact-dashboard", Boolean(settings.compactDashboard));
  document.body.classList.toggle("reduce-motion", Boolean(settings.reduceMotion));
}

function closeAccountModals() {
  document.querySelectorAll(".account-modal").forEach(modal => modal.classList.add("hidden"));
}

function openProfileModal() {
  const profile = ACTIVE_PROFILE || {};
  const role = normalizedFrontendRole(profile.role || "");
  document.getElementById("profileModalName").textContent = profile.name || "-";
  document.getElementById("profileModalRole").textContent = role ? role.replace(/_/g, " ") : "-";
  document.getElementById("profileModalEmail").textContent = profile.email || "-";
  document.getElementById("profileModalPhone").textContent = profile.phone || "-";
  document.getElementById("profileModalCompany").textContent = profile.companyId || "INTERNAL";
  document.getElementById("profileModalStatus").textContent = profile.status || (profile.active ? "ACTIVE" : "-");
  toggleAccountMenu(false);
  document.getElementById("profileModal")?.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function openSettingsModal() {
  const settings = getUiSettings();
  document.getElementById("compactDashboardSetting").checked = Boolean(settings.compactDashboard);
  document.getElementById("reduceMotionSetting").checked = Boolean(settings.reduceMotion);
  document.getElementById("adminToolsNewTabSetting").checked = settings.adminToolsNewTab !== false;
  toggleAccountMenu(false);
  document.getElementById("settingsModal")?.classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function saveUiSettings() {
  const settings = {
    compactDashboard: document.getElementById("compactDashboardSetting").checked,
    reduceMotion: document.getElementById("reduceMotionSetting").checked,
    adminToolsNewTab: document.getElementById("adminToolsNewTabSetting").checked
  };
  localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings));
  applyUiSettings(settings);
  closeAccountModals();
}


let AUTHENTICATED_FEATURES_INITIALIZED = false;
let AUTH_RECOVERY_IN_PROGRESS = false;

function initializeAuthenticatedFeatures() {
  if (!getStoredAuthToken()) return;
  if (!AUTHENTICATED_FEATURES_INITIALIZED) {
    AUTHENTICATED_FEATURES_INITIALIZED = true;
    initSmartAlerts();
    initRecentActivity();
  } else {
    loadSmartAlerts({ silent: true });
    loadRecentActivity({ silent: true });
  }
}

function recoverExpiredSession(message) {
  if (AUTH_RECOVERY_IN_PROGRESS) return;
  AUTH_RECOVERY_IN_PROGRESS = true;
  clearAuthSession();
  ACTIVE_PROFILE = null;

  try {
    const frame = document.getElementById("procurementDashboardFrame");
    if (frame) frame.src = "about:blank";
    if (typeof moduleFrame !== "undefined" && moduleFrame) moduleFrame.src = "";
  } catch (_) {}

  showAccessGate(message || "Sesi login berakhir. Silakan sign in kembali.");
  setAuthTab("signin");
  setTimeout(() => { AUTH_RECOVERY_IN_PROGRESS = false; }, 300);
}

window.addEventListener("MSW_AUTH_REQUIRED", event => {
  // Abaikan event ketika memang belum login (mis. halaman sign-in baru dibuka).
  if (!getStoredAuthToken() && !ACTIVE_PROFILE) return;
  recoverExpiredSession(event?.detail?.message);
});

window.addEventListener("message", event => {
  if (event?.data?.type !== "MSW_AUTH_REQUIRED") return;
  if (!getStoredAuthToken() && !ACTIVE_PROFILE) return;
  recoverExpiredSession(event.data.message);
});

function initializeAccessGate() {
  document.getElementById("signInTab")?.addEventListener("click", () => setAuthTab("signin"));
  document.getElementById("signUpTab")?.addEventListener("click", () => setAuthTab("signup"));
  document.getElementById("signInForm")?.addEventListener("submit", signIn);
  document.getElementById("signUpForm")?.addEventListener("submit", signUp);

  document.querySelectorAll("[data-password-target]").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordTarget);
      input.type = input.type === "password" ? "text" : "password";
    });
  });

  document.getElementById("openLoginModal")?.addEventListener("click", event => {
    event.stopPropagation();
    toggleAccountMenu();
  });
  document.getElementById("signOutButton")?.addEventListener("click", logout);
  document.getElementById("myProfileButton")?.addEventListener("click", openProfileModal);
  document.getElementById("settingsButton")?.addEventListener("click", openSettingsModal);
  document.getElementById("saveSettingsButton")?.addEventListener("click", saveUiSettings);
  document.querySelectorAll("[data-close-account-modal]").forEach(element => element.addEventListener("click", closeAccountModals));
  document.addEventListener("click", event => {
    if (!event.target.closest("#accountMenuWrapper")) toggleAccountMenu(false);
  });

  applyUiSettings();

  document.addEventListener("keydown", event => { if (event.key === "Escape") closeAccountModals(); });

  resolveActiveProfile()
    .then(profile => {
      if (profile) {
        const rememberProfile = RESOLVED_AUTH_STORAGE === "local";
        saveActiveProfile(profile, rememberProfile);
        applyFrontendRole(profile);
        hideAccessGate();
        initializeAuthenticatedFeatures();
      } else {
        clearAuthSession();
        showAccessGate();
      }
    })
    .catch(error => {
      clearAuthSession();
      ACTIVE_PROFILE = null;
      showAccessGate(error?.message || "Please sign in to continue.");
    });

  if (window.lucide) lucide.createIcons();
}

/* ======================================================
   SMART PROCUREMENT REMINDER
   Sumber: Admin Procurement + Detail Contract
====================================================== */

const SMART_ALERT_CONFIG = Object.freeze({
    gasUrl: String(window.APP_CONFIG?.GAS_URL || "").trim(),
    cqsApproachingDay: 23,
    cqsTargetDay: 30,
    rfqClosingWindowDays: 7,
    poSignReminderDelayDays: 1,
    contractWindowMonths: 3,
    refreshIntervalMs: 5 * 60 * 1000,
    previewLimit: 3
});

const SMART_ALERT_STATE = {
    alerts: [],
    lastUpdated: null,
    modalFilter: "all",
    loading: false,
    refreshTimer: null
};

function smartNormalizeKey(value){
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

function smartGetField(row, aliases){
    if (!row || typeof row !== "object") return "";

    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, alias)) {
            const value = row[alias];
            if (String(value ?? "").trim() !== "") return value;
        }
    }

    const normalized = {};
    Object.keys(row).forEach(key => {
        const normalizedKey = smartNormalizeKey(key);
        if (!Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
            normalized[normalizedKey] = row[key];
        }
    });

    for (const alias of aliases) {
        const value = normalized[smartNormalizeKey(alias)];
        if (String(value ?? "").trim() !== "") return value;
    }

    return "";
}

function smartValidDate(year, monthIndex, day){
    const date = new Date(Number(year), Number(monthIndex), Number(day));
    if (
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(monthIndex) ||
        date.getDate() !== Number(day)
    ) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function smartParseDate(value){
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return smartValidDate(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        if (value > 20000 && value < 80000) {
            const excelDate = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
            return smartValidDate(
                excelDate.getUTCFullYear(),
                excelDate.getUTCMonth(),
                excelDate.getUTCDate()
            );
        }
    }

    const text = String(value ?? "").trim();
    if (!text) return null;

    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s|T|$)/);
    if (match) return smartValidDate(match[1], Number(match[2]) - 1, match[3]);

    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (match) {
        const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
        return smartValidDate(year, Number(match[2]) - 1, match[1]);
    }

    const monthMap = {
        jan: 0, january: 0, januari: 0,
        feb: 1, february: 1, februari: 1,
        mar: 2, march: 2, maret: 2,
        apr: 3, april: 3,
        may: 4, mei: 4,
        jun: 5, june: 5, juni: 5,
        jul: 6, july: 6, juli: 6,
        aug: 7, august: 7, agu: 7, agustus: 7,
        sep: 8, sept: 8, september: 8,
        oct: 9, october: 9, okt: 9, oktober: 9,
        nov: 10, november: 10,
        dec: 11, december: 11, des: 11, desember: 11
    };

    match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
    if (match) {
        const month = monthMap[match[2].toLowerCase()];
        const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
        if (month !== undefined) return smartValidDate(year, month, match[1]);
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return smartValidDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function smartToday(){
    const now = new Date();
    return smartValidDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function smartDaysBetween(fromDate, toDate){
    return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function smartAddDays(date, days){
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + Number(days || 0));
    return smartValidDate(result.getFullYear(), result.getMonth(), result.getDate());
}

function smartAddCalendarMonths(date, months){
    const targetMonth = date.getMonth() + months;
    const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
    return smartValidDate(
        new Date(date.getFullYear(), targetMonth, 1).getFullYear(),
        new Date(date.getFullYear(), targetMonth, 1).getMonth(),
        Math.min(date.getDate(), lastDay)
    );
}

function smartFormatDate(date){
    if (!date) return "-";
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function smartEscape(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function smartActiveRfqFinishDate(row){
    const roundValue = String(smartGetField(row, ["Round PR", "Round PO", "roundpr", "roundpo"]) || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
    const roundMatch = roundValue.match(/^R([0-5])$/);

    if (roundMatch) {
        const round = `R${roundMatch[1]}`;
        const activeDate = smartParseDate(smartGetField(row, [
            `${round} Finish Date`,
            `${round.toLowerCase()}finishdate`
        ]));
        if (activeDate) return activeDate;
    }

    const genericDate = smartParseDate(smartGetField(row, [
        "Finish Date",
        "roundfinishdate",
        "Closing Date",
        "RFQ Closing Date"
    ]));
    if (genericDate) return genericDate;

    for (let index = 5; index >= 0; index -= 1) {
        const round = `R${index}`;
        const date = smartParseDate(smartGetField(row, [
            `${round} Finish Date`,
            `${round.toLowerCase()}finishdate`
        ]));
        if (date) return date;
    }

    return null;
}

function smartIsCancelled(row){
    const status = String(smartGetField(row, ["Status PR", "statuspr"]) || "").toLowerCase();
    return /cancel|batal|void/.test(status);
}

function smartIsTerminalFlow(row){
    const flowProcess = String(smartGetField(row, ["Flow Process", "flowprocess"]) || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    // Reminder proses hanya untuk pekerjaan yang masih berjalan. Semua Flow
    // Process yang sudah Complete/Completed atau Cancel dikeluarkan, termasuk
    // variasi seperti "Completed Sign PO" dan "Complete Contract and Cancel PR".
    return /\bcomplet(?:e|ed)\b|\bcancel(?:led)?\b|\bbatal\b|\bvoid\b/.test(flowProcess);
}

function smartProcessText(row){
    return [
        smartGetField(row, ["Status PR", "statuspr"]),
        smartGetField(row, ["Status Rebid", "statusrebid"]),
        smartGetField(row, ["Flow Process", "flowprocess"]),
        smartGetField(row, ["RFQ", "rfq"]),
        smartGetField(row, ["Note", "note"])
    ]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .join(" | ")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

function smartPOStage(row){
    const normalize = value => String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    const detectStage = value => {
        const text = normalize(value);
        if (!text) return "";

        // Vendor dinyatakan sudah mengembalikan countersigned PO/TC hanya
        // ketika proses sudah masuk status penyelesaian tanda tangan PO.
        if (/\b(?:completed?|complete) sign po(?: contract)?\b/.test(text)) {
            return "vendor-returned";
        }

        // PO Sign Vendor adalah tahap menunggu feedback vendor.
        if (/\b(?:po sign vendor|sign po vendor)\b/.test(text)) {
            return "vendor-pending";
        }

        // Sign PO PROC adalah tahap tanda tangan di sisi Procurement.
        if (/\b(?:sign po proc|po sign proc)\b/.test(text)) {
            return "proc-signing";
        }

        return "";
    };

    // Flow Process adalah status aktif dan harus menang atas catatan historis.
    const currentFlowStage = detectStage(smartGetField(row, ["Flow Process", "flowprocess"]));
    if (currentFlowStage) return currentFlowStage;

    // Fallback untuk data lama yang menyimpan status hanya di kolom Note/status.
    return detectStage(smartProcessText(row));
}

function smartPOVendor(row){
    return String(smartGetField(row, [
        "Winner PO",
        "winnerpo",
        "Final Submit Vendor",
        "finalsubmitvendor",
        "Final Vendor List",
        "finalvendorlist"
    ]) || "").trim();
}

function buildSmartAlerts(adminRows, contractRows){
    const today = smartToday();
    const contractLimit = smartAddCalendarMonths(today, SMART_ALERT_CONFIG.contractWindowMonths);
    const alerts = [];

    (Array.isArray(adminRows) ? adminRows : []).forEach((row, index) => {
        const noPR = String(smartGetField(row, ["No PR", "noPR"]) || "").trim();
        const description = String(smartGetField(row, ["Description", "description"]) || "").trim();
        const pic = String(smartGetField(row, ["PIC", "pic"]) || "").trim();
        const status = String(smartGetField(row, ["Status PR", "statuspr"]) || "").trim();
        const cqsCreateDate = smartParseDate(smartGetField(row, ["CQS Create Date", "CQS Created Date", "cqscreatedate"]));
        const cqsApprovalDate = smartParseDate(smartGetField(row, ["CQS Approval Date", "CQS Approved Date", "cqsapprovaldate"]));
        const noPO = String(smartGetField(row, ["No PO", "nopo"]) || "").trim();
        const actualPORelease = smartParseDate(smartGetField(row, ["Actual PO Rel. Date", "actualporeldate", "Actual PO Release Date", "actualporeleasedate"]));
        const actualReceived = smartParseDate(smartGetField(row, ["Actual Received PO (GRN Date)", "actualreceivedpo"]));
        const terminalFlow = smartIsTerminalFlow(row);
        const cancelled = smartIsCancelled(row) || terminalFlow;
        const processText = smartProcessText(row);
        const poStage = smartPOStage(row);
        const alreadyInPOStage = Boolean(poStage);
        const isRebidProcess = /\brebid\b/.test(processText);

        const cqsStillOpen = Boolean(
            cqsCreateDate &&
            !cqsApprovalDate &&
            !noPO &&
            !actualPORelease &&
            !actualReceived &&
            !alreadyInPOStage &&
            !cancelled
        );

        if (cqsStillOpen) {
            const age = smartDaysBetween(cqsCreateDate, today);
            if (age >= SMART_ALERT_CONFIG.cqsApproachingDay) {
                const remaining = SMART_ALERT_CONFIG.cqsTargetDay - age;
                let message = `${remaining} hari menuju batas 30 hari`;
                let severity = remaining <= 0 ? "danger" : "warning";
                if (remaining === 0) message = "Mencapai batas 30 hari hari ini";
                if (remaining < 0) message = `Lewat ${Math.abs(remaining)} hari dari batas 30 hari`;

                alerts.push({
                    id: `cqs-${index}-${noPR || "tanpa-pr"}`,
                    type: "cqs",
                    typeLabel: "CQS",
                    severity,
                    priorityDays: remaining,
                    noPR: noPR || "No PR belum diisi",
                    title: noPR || "No PR belum diisi",
                    description,
                    pic,
                    status,
                    reference: `CQS Create Date ${smartFormatDate(cqsCreateDate)} · Hari ke-${age}`,
                    message,
                    search: noPR || description,
                    module: "procurementAdmin"
                });
            }
        }

        const statusAlreadyCqs = /\bcqs\b/i.test(status);
        const rfqStillOpen = Boolean(
            !cqsCreateDate &&
            !cqsApprovalDate &&
            !noPO &&
            !actualPORelease &&
            !actualReceived &&
            !statusAlreadyCqs &&
            !alreadyInPOStage &&
            !cancelled
        );

        if (rfqStillOpen) {
            const finishDate = smartActiveRfqFinishDate(row);
            if (finishDate) {
                const remaining = smartDaysBetween(today, finishDate);
                if (remaining <= SMART_ALERT_CONFIG.rfqClosingWindowDays) {
                    let message = `${remaining} hari menuju closing`;
                    let severity = remaining <= 3 ? "warning" : "info";
                    if (remaining === 0) {
                        message = "Closing hari ini";
                        severity = "danger";
                    }
                    if (remaining < 0) {
                        message = `Closing lewat ${Math.abs(remaining)} hari`;
                        severity = "danger";
                    }

                    alerts.push({
                        id: `rfq-${index}-${noPR || "tanpa-pr"}`,
                        type: "rfq",
                        typeLabel: isRebidProcess ? "REBID" : "RFQ",
                        severity,
                        priorityDays: remaining,
                        noPR: noPR || "No PR belum diisi",
                        title: noPR || "No PR belum diisi",
                        description,
                        pic,
                        status,
                        reference: `Closing Date ${smartFormatDate(finishDate)}`,
                        message,
                        search: noPR || description,
                        module: "procurementAdmin"
                    });
                }
            }
        }

        // PO Sign Vendor berdiri sebagai reminder terpisah. Baris ini tidak
        // lagi masuk reminder RFQ/CQS/Rebid. Reminder mulai satu hari setelah
        // Actual PO Rel. Date dan berhenti hanya setelah countersigned PO
        // beserta TC sudah dikembalikan (status Completed Sign PO/Contract).
        if (poStage === "vendor-pending" && actualPORelease && !cancelled) {
            const reminderDate = smartAddDays(actualPORelease, SMART_ALERT_CONFIG.poSignReminderDelayDays);
            const daysSinceRelease = smartDaysBetween(actualPORelease, today);

            if (reminderDate && today >= reminderDate) {
                const vendor = smartPOVendor(row);
                let message = `Countersigned PO dan TC belum diterima ${daysSinceRelease} hari sejak dikirim`;
                if (daysSinceRelease === 1) {
                    message = "Countersigned PO dan TC belum diterima 1 hari setelah dikirim";
                }

                alerts.push({
                    id: `po-sign-${index}-${noPR || "tanpa-pr"}`,
                    type: "po",
                    typeLabel: "PO SIGN",
                    severity: daysSinceRelease >= 3 ? "danger" : "warning",
                    priorityDays: -daysSinceRelease,
                    noPR: noPR || "No PR belum diisi",
                    title: noPR || "No PR belum diisi",
                    description: vendor ? `Vendor ${vendor}` : (description || "Vendor belum diisi"),
                    pic,
                    status: "PO Sign Vendor",
                    reference: `PO Actual Release Date ${smartFormatDate(actualPORelease)}`,
                    message,
                    search: noPR || vendor || description,
                    module: "procurementAdmin"
                });
            }
        }
    });

    (Array.isArray(contractRows) ? contractRows : []).forEach((row, index) => {
        const dueDate = smartParseDate(smartGetField(row, ["Due Date", "End Date", "dueDate", "endDate"]));
        if (!dueDate || dueDate < today || dueDate > contractLimit) return;

        const remaining = smartDaysBetween(today, dueDate);
        const contractName = String(smartGetField(row, ["Contract Name", "contractName"]) || "").trim();
        const noContract = String(smartGetField(row, ["No Contract", "coContract"]) || "").trim();
        const prNo = String(smartGetField(row, ["PR No", "prNo", "No PR", "noPR"]) || "").trim();
        const company = String(smartGetField(row, ["Company Name", "companyName"]) || "").trim();
        const pic = String(smartGetField(row, ["PIC User", "picUser"]) || "").trim();

        let message = `Sisa ${remaining} hari sebelum berakhir`;
        if (remaining === 0) message = "Kontrak berakhir hari ini";

        alerts.push({
            id: `contract-${index}-${noContract || prNo || "tanpa-nomor"}`,
            type: "contract",
            typeLabel: "CONTRACT",
            severity: remaining <= 30 ? "danger" : (remaining <= 60 ? "warning" : "info"),
            priorityDays: remaining,
            noPR: prNo,
            title: noContract || contractName || prNo || "Kontrak tanpa nomor",
            description: [contractName, company].filter(Boolean).join(" · "),
            pic,
            status: "",
            reference: `End Date ${smartFormatDate(dueDate)}`,
            message,
            search: prNo || noContract || contractName,
            module: "detailContract"
        });
    });

    const severityRank = { danger: 0, warning: 1, info: 2 };
    alerts.sort((a, b) =>
        (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) ||
        a.priorityDays - b.priorityDays ||
        a.title.localeCompare(b.title, "id", { numeric: true })
    );

    return alerts;
}

function smartAlertItemMarkup(alert, compact = false){
    const detail = [alert.description, alert.pic ? `PIC ${alert.pic}` : ""]
        .filter(Boolean)
        .join(" · ");

    return `
        <button type="button" class="smart-alert-item is-${smartEscape(alert.severity)} ${compact ? "is-compact" : ""}" data-smart-alert-id="${smartEscape(alert.id)}">
            <span class="smart-alert-badge is-${smartEscape(alert.type)}">${smartEscape(alert.typeLabel)}</span>
            <span class="smart-alert-item-body">
                <span class="smart-alert-item-title">${smartEscape(alert.title)}</span>
                ${detail ? `<span class="smart-alert-item-detail">${smartEscape(detail)}</span>` : ""}
                <span class="smart-alert-item-reference">${smartEscape(alert.reference)}</span>
            </span>
            <span class="smart-alert-item-message">${smartEscape(alert.message)}</span>
            <i data-lucide="chevron-right" class="smart-alert-chevron"></i>
        </button>
    `;
}

function smartAlertCount(type){
    return SMART_ALERT_STATE.alerts.filter(alert => alert.type === type).length;
}

function renderSmartAlertPreview(){
    const preview = document.getElementById("smartAlertPreview");
    if (!preview) return;

    const cqsCount = smartAlertCount("cqs");
    const rfqCount = smartAlertCount("rfq");
    const poCount = smartAlertCount("po");
    const contractCount = smartAlertCount("contract");
    const total = SMART_ALERT_STATE.alerts.length;

    const countMap = {
        smartCqsCount: cqsCount,
        smartRfqCount: rfqCount,
        smartPoCount: poCount,
        smartContractCount: contractCount,
        smartAllModalCount: total,
        smartCqsModalCount: cqsCount,
        smartRfqModalCount: rfqCount,
        smartPoModalCount: poCount,
        smartContractModalCount: contractCount
    };

    Object.entries(countMap).forEach(([id, count]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(count);
    });

    if (!total) {
        preview.innerHTML = `
            <div class="smart-alert-empty">
                <i data-lucide="circle-check" class="w-5 h-5"></i>
                <div>
                    <strong>Tidak ada reminder aktif</strong>
                    <span>Semua tanggal masih berada di luar batas pengingat.</span>
                </div>
            </div>
        `;
    } else {
        const visible = SMART_ALERT_STATE.alerts.slice(0, SMART_ALERT_CONFIG.previewLimit);
        preview.innerHTML = visible.map(alert => smartAlertItemMarkup(alert, true)).join("");
        if (total > visible.length) {
            preview.insertAdjacentHTML(
                "beforeend",
                `<button type="button" id="smartAlertMore" class="smart-alert-more">+${total - visible.length} reminder lainnya</button>`
            );
        }
    }

    const updated = document.getElementById("smartAlertUpdated");
    if (updated && SMART_ALERT_STATE.lastUpdated) {
        updated.textContent = `Diperbarui ${SMART_ALERT_STATE.lastUpdated.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })} WIB`;
    }

    if (window.lucide) lucide.createIcons();
}

function renderSmartAlertModal(){
    const list = document.getElementById("smartAlertModalList");
    if (!list) return;

    const alerts = SMART_ALERT_STATE.modalFilter === "all"
        ? SMART_ALERT_STATE.alerts
        : SMART_ALERT_STATE.alerts.filter(alert => alert.type === SMART_ALERT_STATE.modalFilter);

    document.querySelectorAll("[data-alert-modal-filter]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.alertModalFilter === SMART_ALERT_STATE.modalFilter);
    });

    if (!alerts.length) {
        list.innerHTML = `
            <div class="smart-alert-modal-empty">
                <i data-lucide="circle-check" class="w-8 h-8"></i>
                <strong>Tidak ada reminder pada kategori ini.</strong>
            </div>
        `;
    } else {
        list.innerHTML = alerts.map(alert => smartAlertItemMarkup(alert, false)).join("");
    }

    const updated = document.getElementById("smartAlertModalUpdated");
    if (updated) {
        updated.textContent = SMART_ALERT_STATE.lastUpdated
            ? `Data diperbarui ${SMART_ALERT_STATE.lastUpdated.toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            })} WIB`
            : "Data belum diperbarui";
    }

    if (window.lucide) lucide.createIcons();
}

function openSmartAlertModal(filter = "all"){
    SMART_ALERT_STATE.modalFilter = ["all", "cqs", "rfq", "po", "contract"].includes(filter) ? filter : "all";
    renderSmartAlertModal();
    const modal = document.getElementById("smartAlertModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.classList.add("smart-alert-modal-open");
}

function closeSmartAlertModal(){
    document.getElementById("smartAlertModal")?.classList.add("hidden");
    document.body.classList.remove("smart-alert-modal-open");
}

function openSmartAlertRecord(alertId){
    const alert = SMART_ALERT_STATE.alerts.find(item => item.id === alertId);
    if (!alert) return;

    closeSmartAlertModal();

    if (alert.module === "detailContract") {
        try {
            if (alert.search) localStorage.setItem("detailContractSearchText", alert.search);
        } catch (_) {}
        openModule("detailContract", "Contract Management", "detail-contract/index.html");
        return;
    }

    try {
        if (alert.search) localStorage.setItem("procurementAdminSearchText", alert.search);
    } catch (_) {}
    openModule("procurementAdmin", "Admin Procurement", "procurement-admin/index.html?v=20260810-contract-dashboard-v28");
}

async function smartFetchSheet(sheetName){
    const response = await fetch(
        `${SMART_ALERT_CONFIG.gasUrl}?sheet=${encodeURIComponent(sheetName)}`,
        { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.success && payload?.message) {
        throw new Error(payload.message);
    }
    if (!payload || !Array.isArray(payload.rows)) {
        throw new Error(`Data sheet ${sheetName} tidak valid`);
    }
    return payload.rows;
}

async function smartFetchOverdueForAdmin(){
    const params = new URLSearchParams({
        action: "GET_OVERDUE",
        authToken: getStoredAuthToken()
    });
    const response = await fetch(`${SMART_ALERT_CONFIG.gasUrl}?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.success && payload?.message) throw new Error(payload.message);
    if (!payload || !Array.isArray(payload.rows)) throw new Error("Data Overdue tidak valid");
    return payload.rows;
}

function smartLoadCache(key){
    try {
        const cached = window.MSW?.cache?.load(key);
        return Array.isArray(cached) ? cached : [];
    } catch (_) {
        return [];
    }
}

async function loadSmartAlerts(options = {}){
    if (!getStoredAuthToken()) return;
    if (SMART_ALERT_STATE.loading) return;
    SMART_ALERT_STATE.loading = true;

    const refreshButton = document.getElementById("smartAlertRefresh");
    refreshButton?.classList.add("is-loading");

    const cachedAdmin = smartLoadCache("MSW_PROCUREMENT_CACHE");
    const cachedContract = smartLoadCache("MSW_CONTRACT_CACHE");

    if (!options.silent && (cachedAdmin.length || cachedContract.length)) {
        SMART_ALERT_STATE.alerts = buildSmartAlerts(cachedAdmin, cachedContract);
        renderSmartAlertPreview();
    }

    try {
        const [adminResult, contractResult] = await Promise.allSettled([
            smartFetchSheet("Admin"),
            smartFetchSheet("Contract")
        ]);

        const adminRows = adminResult.status === "fulfilled" ? adminResult.value : cachedAdmin;
        const contractRows = contractResult.status === "fulfilled" ? contractResult.value : cachedContract;

        if (
            adminResult.status === "rejected" &&
            contractResult.status === "rejected" &&
            !adminRows.length &&
            !contractRows.length
        ) {
            throw new Error("Data reminder belum dapat dibaca");
        }

        SMART_ALERT_STATE.alerts = buildSmartAlerts(adminRows, contractRows);
        SMART_ALERT_STATE.lastUpdated = new Date();
        renderSmartAlertPreview();

        const modal = document.getElementById("smartAlertModal");
        if (modal && !modal.classList.contains("hidden")) renderSmartAlertModal();
    } catch (error) {
        console.error("Smart Procurement Reminder:", error);
        const preview = document.getElementById("smartAlertPreview");
        if (preview && !SMART_ALERT_STATE.alerts.length) {
            preview.innerHTML = `
                <div class="smart-alert-error">
                    <i data-lucide="wifi-off" class="w-5 h-5"></i>
                    <div>
                        <strong>Data belum dapat diperbarui</strong>
                        <span>Klik tombol refresh untuk mencoba kembali.</span>
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    } finally {
        SMART_ALERT_STATE.loading = false;
        refreshButton?.classList.remove("is-loading");
    }
}

function initSmartAlerts(){
    if (!document.getElementById("smartAlertCard")) return;

    document.getElementById("smartAlertRefresh")?.addEventListener("click", () => loadSmartAlerts());
    document.getElementById("smartAlertViewAll")?.addEventListener("click", () => openSmartAlertModal("all"));

    document.addEventListener("click", event => {
        const alertButton = event.target.closest("[data-smart-alert-id]");
        if (alertButton) {
            openSmartAlertRecord(alertButton.dataset.smartAlertId);
            return;
        }

        const countButton = event.target.closest("[data-smart-filter]");
        if (countButton) {
            openSmartAlertModal(countButton.dataset.smartFilter);
            return;
        }

        if (event.target.closest("#smartAlertMore")) {
            openSmartAlertModal("all");
            return;
        }

        const modalFilter = event.target.closest("[data-alert-modal-filter]");
        if (modalFilter) {
            SMART_ALERT_STATE.modalFilter = modalFilter.dataset.alertModalFilter;
            renderSmartAlertModal();
            return;
        }

        if (event.target.closest("[data-smart-close]")) closeSmartAlertModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSmartAlertModal();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) loadSmartAlerts({ silent: true });
    });

    loadSmartAlerts();
    SMART_ALERT_STATE.refreshTimer = setInterval(
        () => loadSmartAlerts({ silent: true }),
        SMART_ALERT_CONFIG.refreshIntervalMs
    );
}

/* ======================================================
   RECENT ACTIVITY
====================================================== */

const RECENT_ACTIVITY_STATE = {
    items: [],
    loading: false,
    lastUpdated: null,
    displayLimit: 6
};

function normalizeRecentActivity(row){
    if (!row || typeof row !== "object") return null;
    const timestamp = String(smartGetField(row, ["timestamp", "Timestamp", "Created At"]) || "").trim();
    const parsedTime = new Date(timestamp);
    const validTimestamp = Number.isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();

    return {
        id: String(smartGetField(row, ["id", "ID"]) || `activity-${validTimestamp}-${Math.random().toString(36).slice(2,7)}`),
        timestamp: validTimestamp,
        type: String(smartGetField(row, ["type", "Type", "Document Type"]) || "PROCUREMENT").trim().toUpperCase(),
        noPR: String(smartGetField(row, ["noPR", "No PR"]) || "").trim(),
        documentNo: String(smartGetField(row, ["documentNo", "Document No", "No Document"]) || "").trim(),
        status: String(smartGetField(row, ["status", "Status"]) || "Updated").trim(),
        detail: String(smartGetField(row, ["detail", "Detail"]) || "").trim(),
        round: String(smartGetField(row, ["round", "Round"]) || "").trim().toUpperCase(),
        user: String(smartGetField(row, ["user", "User", "Updated By"]) || "").trim(),
        fileName: String(smartGetField(row, ["fileName", "File Name"]) || "").trim(),
        userEmail: String(smartGetField(row, ["userEmail", "User Email"]) || "").trim().toLowerCase(),
        userRole: normalizedFrontendRole(smartGetField(row, ["userRole", "User Role", "Role"]) || "")
    };
}

function recentActivityVisibleForCurrentRole(item){
    const role = normalizedFrontendRole(ACTIVE_PROFILE?.role || "");
    if (role !== "CONTRACT") return true;
    const type = String(item?.type || "").trim().toUpperCase();
    return type === "CONTRACT" || type === "AGREEMENT";
}

function mergeRecentActivities(remoteRows, localRows){
    const byId = new Map();
    [...(Array.isArray(remoteRows) ? remoteRows : []), ...(Array.isArray(localRows) ? localRows : [])]
        .map(normalizeRecentActivity)
        .filter(Boolean)
        .filter(recentActivityVisibleForCurrentRole)
        .forEach(item => {
            const existing = byId.get(item.id);
            if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) byId.set(item.id, item);
        });

    return Array.from(byId.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 50);
}

function recentActivityTitle(item){
    if (/^Note (Added|Updated)$/i.test(String(item.status || "")) && item.detail) {
        return item.detail;
    }
    const type = item.type === "BIDDERLIST" ? "BidderList" : item.type;
    const documentNo = String(item.documentNo || "").trim();
    if (!documentNo) return type;
    if (documentNo.toUpperCase().startsWith(type.toUpperCase())) return documentNo;
    return `${type} ${documentNo}`;
}

function recentActivityTimeLabel(timestamp){
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    const sameDate = date.toDateString() === today.toDateString();
    return sameDate
        ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) + " WIB"
        : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " +
          date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderRecentActivity(){
    const list = document.getElementById("recentActivityList");
    if (!list) return;

    const visible = RECENT_ACTIVITY_STATE.items.slice(0, RECENT_ACTIVITY_STATE.displayLimit);
    if (!visible.length) {
        list.innerHTML = `
            <div class="recent-activity-empty">
                <div>
                    <i data-lucide="history" class="w-6 h-6 mx-auto mb-2"></i>
                    Belum ada aktivitas penyimpanan BidderList, RFQ, atau CQS.
                </div>
            </div>
        `;
    } else {
        list.innerHTML = visible.map(item => {
            const typeClass = smartEscape(item.type.toLowerCase().replace(/[^a-z0-9]+/g, ""));
            const meta = [item.noPR ? `PR ${item.noPR}` : "", item.round, item.status]
                .filter(Boolean)
                .join(" · ");
            const activityDetail = /^Note (Added|Updated)$/i.test(String(item.status || ""))
                ? ""
                : item.detail;
            const actorLabel = item.user
                ? `Oleh ${item.user}${item.userRole ? ` (${item.userRole.replace(/_/g, " ")})` : ""}`
                : "";
            const detail = [activityDetail, actorLabel]
                .filter(Boolean)
                .join(" · ");
            return `
                <button type="button" class="recent-activity-item" data-recent-pr="${smartEscape(item.noPR)}" data-recent-type="${smartEscape(item.type)}">
                    <span class="recent-activity-type is-${typeClass}">${smartEscape(item.type === "BIDDERLIST" ? "BIDDER" : item.type)}</span>
                    <span class="recent-activity-body">
                        <span class="recent-activity-title">${smartEscape(recentActivityTitle(item))}</span>
                        <span class="recent-activity-meta">${smartEscape(meta || "Updated")}</span>
                        ${detail ? `<span class="recent-activity-detail">${smartEscape(detail)}</span>` : ""}
                    </span>
                    <span class="recent-activity-time">${smartEscape(recentActivityTimeLabel(item.timestamp))}</span>
                </button>
            `;
        }).join("");
    }

    const updated = document.getElementById("recentActivityUpdated");
    if (updated && RECENT_ACTIVITY_STATE.lastUpdated) {
        updated.textContent = `Diperbarui ${RECENT_ACTIVITY_STATE.lastUpdated.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })} WIB`;
    }

    if (window.lucide) lucide.createIcons();
}

function getLocalRecentActivities(){
    try {
        if (window.MSW?.activity?.list) return MSW.activity.list(50);
        return JSON.parse(localStorage.getItem("MSW_RECENT_ACTIVITY_V1") || "[]");
    } catch (_) {
        return [];
    }
}

async function loadRecentActivity(options = {}){
    if (!getStoredAuthToken()) return;
    if (RECENT_ACTIVITY_STATE.loading) return;
    RECENT_ACTIVITY_STATE.loading = true;
    const refreshButton = document.getElementById("recentActivityRefresh");
    refreshButton?.classList.add("is-loading");

    const localRows = getLocalRecentActivities();
    if (!options.silent && localRows.length) {
        RECENT_ACTIVITY_STATE.items = mergeRecentActivities([], localRows);
        renderRecentActivity();
    }

    try {
        const response = await fetch(
            `${SMART_ALERT_CONFIG.gasUrl}?action=loadRecentActivity&limit=50`,
            { cache: "no-store" }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const remoteRows = Array.isArray(payload?.activities)
            ? payload.activities
            : (Array.isArray(payload?.rows) ? payload.rows : []);

        RECENT_ACTIVITY_STATE.items = mergeRecentActivities(remoteRows, localRows);
        RECENT_ACTIVITY_STATE.lastUpdated = new Date();
        renderRecentActivity();
    } catch (error) {
        console.warn("Recent Activity belum dapat disinkronkan:", error);
        RECENT_ACTIVITY_STATE.items = mergeRecentActivities([], localRows);
        RECENT_ACTIVITY_STATE.lastUpdated = new Date();
        renderRecentActivity();
    } finally {
        RECENT_ACTIVITY_STATE.loading = false;
        refreshButton?.classList.remove("is-loading");
    }
}

function initRecentActivity(){
    if (!document.getElementById("recentActivityList")) return;

    document.getElementById("recentActivityRefresh")?.addEventListener("click", () => loadRecentActivity());
    document.getElementById("recentActivityList")?.addEventListener("click", event => {
        const item = event.target.closest("[data-recent-pr]");
        if (!item) return;
        const type = String(item.dataset.recentType || "").trim().toUpperCase();
        const noPR = String(item.dataset.recentPr || "").trim();
        if (type === "AGREEMENT") {
            openModule("agreementTracker", "Agreement Tracker", "agreement-tracker/index.html");
            return;
        }
        if (type === "CONTRACT") {
            openModule("detailContract", "Contract Management", "detail-contract/index.html");
            return;
        }
        if (!noPR) return;
        try { localStorage.setItem("procurementAdminSearchText", noPR); } catch (_) {}
        openModule("procurementAdmin", "Admin Procurement", "procurement-admin/index.html?v=20260810-contract-dashboard-v28");
    });

    window.addEventListener("MSW_RECENT_ACTIVITY_UPDATED", () => loadRecentActivity({ silent: true }));
    window.addEventListener("storage", event => {
        if (event.key === "MSW_RECENT_ACTIVITY_V1") loadRecentActivity({ silent: true });
    });
    window.addEventListener("message", event => {
        if (event.data?.action !== "MSW_RECENT_ACTIVITY_UPDATED") return;
        loadRecentActivity({ silent: true });
    });

    loadRecentActivity();
}


/* ======================================================
   QUICK ACCESS UPDATE HISTORY
====================================================== */

const MODULE_LABELS = Object.freeze({
    detailContract: "Contract Management",
    vendorCompany: "Vendor Management",
    procurementAdmin: "Procurement"
});

function escapeModuleHistory(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openModuleHistory(moduleName) {
    const module = MODULES[moduleName];
    const modal = document.getElementById("moduleHistoryModal");
    const list = document.getElementById("moduleHistoryList");
    const title = document.getElementById("moduleHistoryTitle");
    if (!module || !modal || !list || !title) return;

    title.textContent = `${MODULE_LABELS[moduleName] || moduleName} Update History`;
    const history = Array.isArray(module.history) ? module.history : [];
    list.innerHTML = history.length
        ? history.map(item => `
            <article class="module-history-item">
                <span class="module-history-dot"></span>
                <div>
                    <strong>${escapeModuleHistory(item.action || "Module updated")}</strong>
                    <p>${escapeModuleHistory(item.timestamp || "-")}</p>
                    <small>${escapeModuleHistory(item.user || "Current user")}</small>
                </div>
            </article>
        `).join("")
        : `
            <div class="module-history-empty">
                <i data-lucide="history"></i>
                <strong>No update history yet</strong>
                <span>History is recorded whenever this Quick Access module is opened and you return to the Dashboard.</span>
            </div>
        `;
    modal.classList.remove("hidden");
    document.body.classList.add("account-modal-open");
    if (window.lucide) lucide.createIcons();
}

function closeModuleHistory() {
    document.getElementById("moduleHistoryModal")?.classList.add("hidden");
    document.body.classList.remove("account-modal-open");
}

document.addEventListener("click", event => {
    const historyButton = event.target.closest("[data-module-history]");
    if (historyButton) {
        event.preventDefault();
        event.stopPropagation();
        openModuleHistory(historyButton.dataset.moduleHistory);
        return;
    }
    if (event.target.closest("[data-close-module-history]")) closeModuleHistory();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModuleHistory();
});

/* =======================================================
   SYSTEM INFORMATION
======================================================= */

function updateDateTime(){

    const now = new Date();

    const date = now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    const time = now.toLocaleTimeString("en-GB", {
        hour12: false
    });

    const el = document.getElementById("currentDateTime");

    if(el){

        el.innerHTML = `
            <div class="font-semibold">
                ${date}
            </div>
            <div class="text-gray-600">
                ${time} WIB
            </div>
        `;

    }

}

/* ======================================================
   FOOTER
====================================================== */

function renderFooter(){

    const year = new Date().getFullYear();

    const footer = document.getElementById("footerCopyright");

    if(!footer) return;

    footer.innerHTML =
        `© ${year} PT Makmur Sejahtera Wisesa | Procurement Division`;

}

renderSystemInformation();

renderModules();

renderFooter();

updateDateTime();

setInterval(updateDateTime,1000);

/* =======================================================
   MODULE ROUTER
======================================================= */

const dashboardPage = document.getElementById("dashboardPage");

const modulePage = document.getElementById("modulePage");

const moduleFrame = document.getElementById("moduleFrame");

const moduleTitle = document.getElementById("moduleTitle");

const procurementCard = document.getElementById("procurementCard");

const mainLayout = document.getElementById("mainLayout");

const vendorCard = document.getElementById("vendorCard");

const contractCard = document.getElementById("contractCard");
const vendorRequestsButton = document.getElementById("workspaceVendorRequests");

const appsScriptCard = document.getElementById("appsScriptCard");

const googleSheetCard = document.getElementById("googleSheetCard");

const btnBackDashboard = document.getElementById("btnBackDashboard");

/* =======================================================
   OPEN MODULE
======================================================= */

let currentModule = "";

function openModule(moduleName, title, url){

    const activeRole = normalizedFrontendRole(ACTIVE_PROFILE?.role);
    const allowedModules = roleAllowedModules(activeRole);
    const hasAccess = allowedModules.includes("*") || allowedModules.includes(moduleName);

    // Jangan hanya menyembunyikan menu: blokir juga semua jalur internal
    // (Recent Activity, AI Reminder, shortcut, atau pemanggilan manual) yang
    // mencoba membuka modul di luar hak akses role.
    if (!hasAccess) {
        const message = activeRole === "PROCUREMENT_ADMIN" && moduleName === "procurementAdmin"
            ? "Procurement tidak tersedia untuk akun Procurement Admin."
            : "Anda tidak memiliki akses ke modul ini.";
        if (typeof window.showToast === "function") window.showToast(message, "warning");
        else console.warn(message);
        return false;
    }

    currentModule = moduleName;

    const workspaceMap = {
        agreementDashboard: "workspaceDashboard",
        procurementAdmin: "workspaceProcurement",
        vendorCompany: "workspaceVendor",
        vendorRequests: "workspaceVendorRequests",
        detailContract: "workspaceContract",
        agreementTracker: "workspaceAgreementTracker"
    };
    setWorkspaceNavigationActive(workspaceMap[moduleName] || "workspaceDashboard");

    hideSidebar();

    if(mainLayout){
        mainLayout.classList.add("module-open");
    }

    dashboardPage.classList.add("hidden");

    modulePage.classList.remove("hidden");

    moduleTitle.textContent = title;

    // Tata letak yang ditandai pengguna berada pada header pembungkus modul
    // (di halaman utama), bukan pada header di dalam iframe.
    const usesInnerModuleHeader = ["agreementDashboard", "procurementAdmin", "vendorCompany", "detailContract", "vendorRequests", "agreementTracker"].includes(moduleName);
    const modulePageHeader = document.getElementById("modulePageHeader");
    if (modulePageHeader) {
        modulePageHeader.classList.toggle("buyer-module-header", usesInnerModuleHeader);
    }
    if (btnBackDashboard) {
        btnBackDashboard.hidden = usesInnerModuleHeader;
    }

    moduleFrame.onload = () => {

        try {

            moduleFrame.contentWindow.focus();

        } catch (e) {}

    };

    moduleFrame.src = url;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });

}

function updateModule(moduleName){

    if(!MODULES[moduleName]) return;

    const updatedAt = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }) + " WIB";

    MODULES[moduleName].updated = updatedAt;
    const history = Array.isArray(MODULES[moduleName].history)
        ? MODULES[moduleName].history
        : [];
    history.unshift({
        timestamp: updatedAt,
        action: "Module opened and returned to Dashboard",
        user: ACTIVE_PROFILE?.name || ACTIVE_PROFILE?.email || "Current user"
    });
    MODULES[moduleName].history = history.slice(0, 20);
    
    
    /* simpan ke local storage */
    localStorage.setItem(
        "MSW_MODULES",
        JSON.stringify(MODULES)
    );
    
    renderModules();

}

/* =======================================================
   BACK TO DASHBOARD
======================================================= */

function updateDashboard(moduleName){

    updateModule(moduleName);

    renderModules();
    renderSystemInformation();
    renderFooter();

}

function backDashboard(){

    showMainWorkspacePanel("dashboard");
    setWorkspaceNavigationActive("workspaceDashboard");
    moduleFrame.src = "";

    modulePage.classList.add("hidden");
    dashboardPage.classList.remove("hidden");

    if(mainLayout){
        mainLayout.classList.remove("module-open");
    }

    leftSidebar.classList.remove("overlay");
    leftSidebar.classList.remove("sidebar-hidden");
    mainLayout?.classList.remove("sidebar-collapsed");

    if(sidebarTrigger){
        sidebarTrigger.classList.add("hidden");
    }

    scheduleSidebarAutoHide();

    updateDashboard(currentModule);   // <-- satu perintah saja

    loadSmartAlerts({ silent: true });
    loadRecentActivity({ silent: true });

    window.scrollTo({
        top: 0,
        left: 0,
        behavior: "instant"
    });

}

/* =======================================================
   EVENT
======================================================= */


if (procurementCard) {

    procurementCard.addEventListener("click", function(e){

        e.preventDefault();

        openModule(
            "procurementAdmin",
            "Admin Procurement",
            "procurement-admin/index.html?v=20260810-contract-dashboard-v28"
        );

    });

}

if (vendorCard) {

    vendorCard.addEventListener("click", function(e){

        e.preventDefault();

        openModule(
            "vendorCompany",
            "Vendor Management",
            "vendor-company/index.html"
        );

    });
}

if (contractCard) {

    contractCard.addEventListener("click", function(e){

        e.preventDefault();

        openModule(
            "detailContract",
            "Contract Management",
            "detail-contract/index.html"
        );

    });
}

if(appsScriptCard){

    appsScriptCard.addEventListener("click", function(e){

        e.preventDefault();

        openModule(
            "appsScript",
            "Google Apps Script",
            ""
        );

    });

}

if(googleSheetCard){

    googleSheetCard.addEventListener("click", function(e){

        e.preventDefault();

        openModule(
            "googleSheet",
            "Google Sheet",
            "Google Sheet Database - GS.html"
        );

    });

}

if (btnBackDashboard) {

    btnBackDashboard.addEventListener("click", backDashboard);

}

/* =======================================================
   AUTO HIDE SIDEBAR
======================================================= */

const leftSidebar = document.getElementById("leftSidebar");
const sidebarTrigger = document.getElementById("sidebarTrigger");
const SIDEBAR_AUTO_HIDE_DELAY = 4000;
let sidebarAutoHideTimer = null;

function clearSidebarAutoHideTimer(){
    if(sidebarAutoHideTimer){
        window.clearTimeout(sidebarAutoHideTimer);
        sidebarAutoHideTimer = null;
    }
}

function scheduleSidebarAutoHide(){
    clearSidebarAutoHideTimer();

    if(window.innerWidth <= 860) return;

    sidebarAutoHideTimer = window.setTimeout(function(){
        hideSidebar();
    }, SIDEBAR_AUTO_HIDE_DELAY);
}

function hideSidebar(){

    if(!leftSidebar) return;

    clearSidebarAutoHideTimer();

    leftSidebar.classList.add("overlay");
    leftSidebar.classList.add("sidebar-hidden");
    mainLayout?.classList.add("sidebar-collapsed");

    if(sidebarTrigger){
        sidebarTrigger.classList.remove("hidden");
    }

}

function showSidebar(){

    if(!leftSidebar) return;

    clearSidebarAutoHideTimer();

    leftSidebar.classList.add("overlay");
    leftSidebar.classList.remove("sidebar-hidden");
    mainLayout?.classList.remove("sidebar-collapsed");

    if(sidebarTrigger){
        sidebarTrigger.classList.add("hidden");
    }

}

if(sidebarTrigger){

    sidebarTrigger.addEventListener("mouseenter",showSidebar);
    sidebarTrigger.addEventListener("click",showSidebar);

}

if(leftSidebar){

    leftSidebar.addEventListener("mouseenter", showSidebar);

    leftSidebar.addEventListener("mouseleave", function(){
        scheduleSidebarAutoHide();

    });

}

window.addEventListener("resize", function(){
    if(window.innerWidth <= 860){
        clearSidebarAutoHideTimer();
        leftSidebar?.classList.remove("sidebar-hidden");
        mainLayout?.classList.remove("sidebar-collapsed");
        sidebarTrigger?.classList.add("hidden");
        return;
    }

    scheduleSidebarAutoHide();
});

scheduleSidebarAutoHide();


function canLoadProcurementDashboardForRole(role = ACTIVE_PROFILE?.role) {
    return ["SUPER_ADMIN", "BUYER"].includes(normalizedFrontendRole(role));
}

function ensureProcurementDashboardLoaded() {
    const frame = document.getElementById("procurementDashboardFrame");
    if (!frame || !canLoadProcurementDashboardForRole()) return;
    const current = String(frame.getAttribute("src") || "").trim();
    if (current && current !== "about:blank") return;
    frame.src = frame.dataset.src || "dashboard/index.html?embedded=1";
}

function keepDashboardUnloadedForRestrictedRole(role = ACTIVE_PROFILE?.role) {
    if (canLoadProcurementDashboardForRole(role)) return;
    const frame = document.getElementById("procurementDashboardFrame");
    if (frame && String(frame.getAttribute("src") || "") !== "about:blank") {
        frame.src = "about:blank";
    }
}

function showMainWorkspacePanel(panel = "dashboard") {
    const normalized = ["dashboard", "review", "overdue", "recent", "ai"].includes(panel)
        ? panel
        : "dashboard";
    const activeRole = normalizedFrontendRole(ACTIVE_PROFILE?.role);
    if (activeRole === "PROCUREMENT_ADMIN" && ["dashboard", "review"].includes(normalized)) {
        if (typeof window.showToast === "function") window.showToast("Procurement Review tidak tersedia untuk akun Procurement Admin.", "warning");
        return false;
    }
    document.body.dataset.workspacePanel = normalized;

    if (normalized === "dashboard") {
        if (canLoadProcurementDashboardForRole()) ensureProcurementDashboardLoaded();
        else keepDashboardUnloadedForRestrictedRole();
    }

    moduleFrame.src = "";
    modulePage.classList.add("hidden");
    dashboardPage.classList.remove("hidden");
    mainLayout?.classList.remove("module-open");

    const overview = document.getElementById("procurementAdminOverview");
    if (overview) overview.hidden = !["review", "overdue"].includes(normalized);

    if (["review", "overdue"].includes(normalized)) {
        loadProcurementAdminOverview();
    }
    if (normalized === "recent") loadRecentActivity({ silent: true });
    if (normalized === "ai") loadSmartAlerts({ silent: true });

    leftSidebar?.classList.remove("overlay", "sidebar-hidden");
    mainLayout?.classList.remove("sidebar-collapsed");
    if (window.innerWidth <= 860) {
        document.body.classList.remove("mobile-sidebar-open");
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

/* =======================================================
   WORKSPACE SIDEBAR NAVIGATION
======================================================= */
function setWorkspaceNavigationActive(targetId = "workspaceDashboard") {
    document.querySelectorAll(".workspace-navigation-item").forEach(item => {
        item.classList.toggle("is-active", item.id === targetId);
    });
}

function initializeWorkspaceNavigation() {
    const bindings = [
        ["workspaceDashboard", () => {
            if (normalizedFrontendRole(ACTIVE_PROFILE?.role) === "CONTRACT") {
                openModule("agreementDashboard", "Agreement Tracker Dashboard", "agreement-dashboard/index.html?v=20260810-contract-dashboard-v28");
            } else {
                showMainWorkspacePanel("dashboard");
                setWorkspaceNavigationActive("workspaceDashboard");
            }
        }],
        ["workspaceProcurement", () => { procurementCard?.click(); setWorkspaceNavigationActive("workspaceProcurement"); }],
        ["workspaceVendor", () => { vendorCard?.click(); setWorkspaceNavigationActive("workspaceVendor"); }],
        ["workspaceVendorRequests", () => { openModule("vendorRequests", "Vendor Requests", "vendor-requests/index.html"); }],
        ["workspaceContract", () => { contractCard?.click(); setWorkspaceNavigationActive("workspaceContract"); }],
        ["workspaceAgreementTracker", () => { openModule("agreementTracker", "Agreement Tracker", "agreement-tracker/index.html"); setWorkspaceNavigationActive("workspaceAgreementTracker"); }],
        ["workspaceProcurementReview", () => { showMainWorkspacePanel("review"); setWorkspaceNavigationActive("workspaceProcurementReview"); }],
        ["workspaceOverdue", () => { showMainWorkspacePanel("overdue"); setWorkspaceNavigationActive("workspaceOverdue"); }],
        ["workspaceRecentActivity", () => { showMainWorkspacePanel("recent"); setWorkspaceNavigationActive("workspaceRecentActivity"); }],
        ["workspaceAiReminder", () => { showMainWorkspacePanel("ai"); setWorkspaceNavigationActive("workspaceAiReminder"); }]
    ];
    bindings.forEach(([id, handler]) => document.getElementById(id)?.addEventListener("click", handler));
    document.getElementById("workspaceReporting")?.addEventListener("click", () => {
        const element = document.getElementById("workspaceReporting");
        if (element) element.title = "Reporting module is under development.";
    });
}

window.addEventListener("message", event => {
    const payload = event?.data || {};
    if (payload.type !== "MSW_OPEN_MODULE") return;
    if (payload.module === "agreementTracker") {
        openModule("agreementTracker", "Agreement Tracker", "agreement-tracker/index.html?v=20260810-contract-dashboard-v28");
        setWorkspaceNavigationActive("workspaceAgreementTracker");
    }
});

initializeWorkspaceNavigation();

document.getElementById("vendorRequestsCard")?.addEventListener("click", event => {
    event.preventDefault();
    openModule("vendorRequests", "Vendor Requests", "vendor-requests/index.html");
    setWorkspaceNavigationActive("workspaceVendorRequests");
});

document.getElementById("procurementOverviewBuyerSelect")?.addEventListener("change", event => {
    PROCUREMENT_OVERVIEW_BUYER = String(event.target.value || "ALL");
    PROCUREMENT_REVIEW_PAGE = 1;
    PROCUREMENT_OVERDUE_PAGE = 1;
    renderProcurementAdminOverview();
});

window.addEventListener("focus", () => {
    const panel = document.body.dataset.workspacePanel || "dashboard";
    if (["review", "overdue"].includes(panel)) loadProcurementAdminOverview();
    try {
        document.getElementById("procurementDashboardFrame")?.contentWindow?.postMessage(
            { action: "MSW_REFRESH_DASHBOARD" },
            "*"
        );
    } catch (_) {}
});
setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const panel = document.body.dataset.workspacePanel || "dashboard";
    if (["review", "overdue"].includes(panel)) loadProcurementAdminOverview();
}, 2 * 60 * 1000);

document.body.dataset.workspacePanel = "dashboard";

// Data dashboard/reminder/activity hanya mulai setelah session backend tervalidasi.
document.addEventListener("DOMContentLoaded", initializeAccessGate);
