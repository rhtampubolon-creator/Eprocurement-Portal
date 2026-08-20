lucide.createIcons();

const MSW_ROLE_MODULE = "vendorCompany";

function isBuyerCompanyViewOnly() {
    const role = String(window.MSW?.auth?.getRole?.() || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    return role === "BUYER"
        || Boolean(window.MSW?.auth?.isViewOnlyModule(MSW_ROLE_MODULE));
}

function canManageCompany(showMessage = true) {
    const role = String(window.MSW?.auth?.getRole?.() || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    // Vendor master hanya boleh dimutasi oleh role pengelola. Gunakan allow-list
    // supaya Buyer (atau sesi yang belum terbaca) tidak sempat menghapus cache lokal.
    const profile = window.MSW?.auth?.getProfile?.() || {};
    const permissions = Array.isArray(profile.permissions) ? profile.permissions : [];
    const allowedByRole = ["PROCUREMENT_ADMIN", "SUPER_ADMIN"].includes(role);
    const allowedByPermission = permissions.includes("*") || permissions.includes("company.manage");
    const allowed = (allowedByRole || allowedByPermission) && !isBuyerCompanyViewOnly();
    if (!allowed && showMessage) window.MSW?.auth?.showViewOnlyMessage?.();
    return allowed;
}

const COMPANY_CACHE_KEY = "MSW_COMPANY_CACHE";

function saveCompanyCache() {

    MSW.cache.save(
        COMPANY_CACHE_KEY,
        companyData
    );

}

function loadCompanyCache() {

    const cache = MSW.cache.load(
        COMPANY_CACHE_KEY
    );

    if (!cache) return false;

    companyData = cache.map(row => applyDerivedCoreBusinessFields({
        ...row,
        noCompany: String(row?.noCompany ?? "").trim(),
        companyphone: normalizePhoneText(row?.companyphone)
    }));

    renderTable();

    console.log(
        "✅ Company dimuat dari Cache"
    );

    return true;

}

    /* Kolom */
    const COLUMNS = [
      { key: "no",                label: "No",                         width: "100px" },
      { key: "noCompany",         label: "No Company",                width: "200px" },
      { key: "companyName",       label: "Company Name",              width: "400px" },
      { key: "email",             label: "Email",                     width: "500px" },
      { key: "customercontact",   label: "Customer Contact",          width: "300px" },
      { key: "companyphone",      label: "Company Phone",             width: "200px" },
      { key: "address",           label: "Address Company",           width: "400px" },
      { key: "status",   	  label: "Status Register", 	      width: "150px" },
      { key: "companystatus",     label: "Company Status", 	      width: "150px" },
      { key: "corebusiness",      label: "Core Business",             width: "150px" },
      { key: "corebusinessdesc",  label: "Description Core Business", width: "500px" },
      { key: "soleagent",         label: "Sole Agent",                width: "200px" },
      { key: "principalbrand",    label: "Principal Brand",           width: "150px" },
    ];

    const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
    const SHEET_NAME = "Company";
    const CORE_BUSINESS_OPTIONS = [
    "GT","GT - ID","GT - CHE","GT - SP","GT - OF","GT - ME","GT - EL","GT - IC","GT - HSE",

    "MF","MF - ID","MF - CH","MF - MC","MF - EL","MF - OT",

    "SJ","SJ - CHE","SJ - MT","SJ - HVAC","SJ - EV","SJ - HR","SJ - MC","SJ - CT","SJ - ME","SJ - EL","SJ - IC",

    "RL","RL - OF","RL - EM","RL - DM","RL - IM","RL - ST",

    "LG","LG - FF","LG - TR","LG - SH","LG - WH","LG - PJ","LG - MR",

    "KR","KR - EX","KR - RG","KR - DO",

    "CN","CN - CV","CN - ME","CN - EL","CN - MP","CN - IN","CN - LS","CN - RN","CN - SC",

    "IT","IT - HW","IT - SW","IT - SV","IT - NT","IT - CL","IT - MS",

    "FM","FM - CL","FM - SC","FM - PE","FM - MT","FM - GA","FM - WM",

    "PR","PR - LG","PR - NOT","PR - AU","PR - CS","PR - TX","PR - HR","PR - IR","PR - TR",

    "RM","RM - ST","RM - DG","RM - SH","RM - AR","RM - BK",

    "TR","TR - CR","TR - BS","TR - HT","TR - HR","TR - DR","TR - TS",

    "UT","UT - FS","UT - WT","UT - LO","UT - L","UT - W","UT - T",

    "PP","PP - TG","PP - BH","PP - DCS","PP - VA","PP - NDT","PP - CP","PP - CS","PP - AH","PP - RA",

    "ENV","ENV - EM","ENV - B3","ENV - IM","ENV - AC","ENV - SL",

    "MK","MK - EV","MK - BR","MK - MD",

    "SC","SC - SV","SC - RT","SC - CS"
    ];

    const CORE_BUSINESS_DESC = {
    "GT - ID": "General Trading - Industrial Goods",
    "GT - CHE": "General Trading - Chemical",
    "GT - SP": "General Trading - Sparepart",
    "GT - OF": "General Trading - Office Supplies",
    "GT - ME": "General Trading - Mechanical",
    "GT - EL": "General Trading - Electrical",
    "GT - IC": "General Trading - Instrument",
    "GT - HSE": "General Trading - HSE and Safety",

    "MF - ID": "Manufacturer - Industrial Manufacturer",
    "MF - CH": "Manufacturer - Chemical Manufacturer",
    "MF - MC": "Manufacturer - Machinery Manufacturer",
    "MF - EL": "Manufacturer - Electrical Manufacturer",
    "MF - OT": "Manufacturer - Other Manufacturer",
   
    "SJ - CHE": "Service Jasa - Chemical Service",
    "SJ - MT": "Service Jasa - General Maintenance",
    "SJ - HVAC": "Service Jasa - HVAC (AC) Service",
    "SJ - EV": "Service Jasa - Event Organizer / Meal Service",
    "SJ - HR": "Service Jasa - Outsourcing & Manpower",
    "SJ - MC": "Service Jasa - Medical Service",
    "SJ - CT": "Service Jasa - Calibration and Testing",
    "SJ - ME": "Service Jasa - Mechanical Service",
    "SJ - EL": "Service Jasa - Electrical Service",
    "SJ - IC": "Service Jasa - Instrument Service",

    "RL - OF": "Relocation - Office Relocation",
    "RL - EM": "Relocation - Employee / Expat Relocation",
    "RL - DM": "Relocation - Domestic Moving",
    "RL - IM": "Relocation - International Moving",
    "RL - ST": "Relocation - Storage & Warehouse",

    "LG - FF": "Logistics - Air freight",
    "LG - TR": "Logistics - Trucking",
    "LG - SH": "Logistics - Sea Freight",
    "LG - WH": "Logistics - Warehouse",
    "LG - PJ": "Logistics - Project Logistics",
    "LG - MR": "Logistics - Marine Logistics",

    "KR - EX": "Courier - Express Courier",
    "KR - RG": "Courier - Regular Courier",
    "KR - DO": "Courier - Document Courier",

    "CN - CV": "Construction - Civil Construction",
    "CN - ME": "Construction - Mechanical Construction",
    "CN - EL": "Construction - Electrical Construction",
    "CN - MP": "Construction - MEP (Mechanical Electrical Plumbing)",
    "CN - IN": "Construction - Interior Fit Out",
    "CN - LS": "Construction - Landscape",
    "CN - RN": "Construction - Renovation",
    "CN - SC": "Construction - Scaffolding",

    "IT - HW": "IT & System - Hardware",
    "IT - SW": "IT & System - Software",
    "IT - SV": "IT & System - IT Services",
    "IT - NT": "IT & System - Network & Infrastructure",
    "IT - CL": "IT & System - Cloud Services",
    "IT - MS": "IT & System - Managed Services",

    "FM - CL": "Facility Management - Cleaning",
    "FM - SC": "Facility Management - Security",
    "FM - PE": "Facility Management - Pest Control",
    "FM - MT": "Facility Management - Building Maintenance",
    "FM - GA": "Facility Management - Gardening",
    "FM - WM": "Facility Management - Waste Management",
    
    "PR - LG": "Professional Services - Legal",
    "PR - NOT": "Professional Services - Notary",
    "PR - AU": "Professional Services - Audit",
    "PR - CS": "Professional Services - Consulting",
    "PR - TX": "Professional Services - Tax",
    "PR - HR": "Professional Services - HR Consulting",
    "PR - IR": "Professional Services - Insurance Broker",
    "PR - TR": "Professional Services - Training",

    "RM - ST": "Records Management - Document Storage",
    "RM - DG": "Records Management - Digitalization",
    "RM - SH": "Records Management - Secure Shredding",
    "RM - AR": "Records Management - Archive Management",
    "RM - BK": "Records Management - Backup & Recovery",

    "TR - CR": "Transportation - Car Rental",
    "TR - BS": "Transportation - Bus Rental",
    "TR - HT": "Transportation - Hotel",
    "TR - HR": "Transportation - Heavy Equipment Rental",
    "TR - DR": "Transportation - Driver Services",
    "TR - TS": "Transportation - Travel Service / Travel Agent",

    "UT - FS": "Utilities - Fuel Supply (Coal / Gas / Diesel / Biomass)",
    "UT - WT": "Utilities - Water Treatment & Demineralized Water",
    "UT - LO": "Utilities - Lubricant and Industrial Oil",
    "UT - L": "Utilities - Electricity",
    "UT - W": "Utilities - Water Supply",
    "UT - T": "Utilities - Telecom & Internet",

    "PP - TG": "Power Plant - Turbine & Generator Service",
    "PP - BH": "Power Plant - Boiler and HRSG Service",
    "PP - DCS": "Power Plant - DCS / SCADA Specialist",
    "PP - VA": "Power Plant - Vibration Analysis & Thermography",
    "PP - NDT": "Power Plant - Non-Destructive Testing",
    "PP - CP": "Power Plant - Commissioning & Performance Test",
    "PP - CS": "Power Plant - Cooling System Service",
    "PP - AH": "Power Plant - Ash Handling & Disposal",
    "PP - RA": "Power Plant - Rope Access Service",

    "ENV - EM": "Environment & Compliance - Emission Monitoring (CEMS)",
    "ENV - B3": "Environment & Compliance - B3 Waste Treatment",
    "ENV - IM": "Environment & Compliance - Environmental Impact Monitoring",
    "ENV - AC": "Environment & Compliance - AMDAL / UKL-UPL Consultant",
    "ENV - SL": "Environment & Compliance - Sampling and Lab",

    "MK - EV": "Marketing - Event Organizer",
    "MK - BR": "Marketing - Branding",
    "MK - MD": "Marketing - Media & Advertising",

    "SC - SV": "Sister Company - Shared Services",
    "SC - RT": "Sister Company - Rental",
    "SC - CS": "Sister Company - Consulting",

    "GT": "General Trading",
    "MF": "Manufacturer",
    "SJ": "Service Jasa",
    "RL": "Relocation",
    "LG": "Logistics",
    "KR": "Courier",
    "CN": "Construction",
    "IT": "IT & System",
    "FM": "Facility Management",
    "PR": "Professional Services",
    "RM": "Records Management",
    "TR": "Transportation",
    "UT": "Utilities",
    "PP": "Power Plant",
    "ENV": "Environment & Compliance",
    "MK": "Marketing",
    "SC": "Sister Company"
    };

    let lastGoogleSheetMtime = 0;

    let companyData = [];

    const editingRows = new Set();
    const originalRows = {};
    const newRows = new Set();

    let rowActionVisible = false;

    function emptyRow(){
      const r={};
      COLUMNS.forEach(c=>r[c.key]="");
      r.soleagent = "";
      return r;
    }

    /* Company Phone wajib disimpan sebagai teks agar angka 0 di depan tidak hilang. */
    function normalizePhoneText(value) {
      if (value === null || value === undefined) return "";

      let text = String(value).trim();
      if (!text) return "";

      text = text.replace(/^(\d+)\.0$/, "$1");

      // Perbaiki nomor seluler Indonesia yang telanjur menjadi angka Excel,
      // misalnya 8115001141 menjadi 08115001141.
      text = text.replace(/(^|[^\d+])(8\d{8,12})(?=$|[^\d])/g, (match, prefix, digits) => {
        return `${prefix}0${digits}`;
      });

      return text;
    }

    function normalizeCoreBusinessToken(value) {
      return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[–—−]/g, "-")
        .replace(/\s*-\s*/g, " - ")
        .replace(/\s+/g, " ");
    }

    const CORE_BUSINESS_LOOKUP = new Map(
      CORE_BUSINESS_OPTIONS.map(item => [
        normalizeCoreBusinessToken(item),
        item
      ])
    );

    function splitCoreBusinessValues(coreBusinessText) {
      return String(coreBusinessText ?? "")
        .split(/[;,|\r\n]+/)
        .map(item => item.trim())
        .filter(Boolean);
    }

    function getCanonicalCoreBusinessItems(coreBusinessText) {
      const unique = new Set();
      splitCoreBusinessValues(coreBusinessText).forEach(item => {
        const canonical = CORE_BUSINESS_LOOKUP.get(
          normalizeCoreBusinessToken(item)
        );
        if (canonical) unique.add(canonical);
      });
      return [...unique];
    }

    function normalizeCoreBusinessImportedValue(coreBusinessText) {
      const unique = new Map();
      splitCoreBusinessValues(coreBusinessText).forEach(item => {
        const canonical = CORE_BUSINESS_LOOKUP.get(
          normalizeCoreBusinessToken(item)
        );
        const storedValue = canonical || item;
        const key = normalizeCoreBusinessToken(storedValue);
        if (key && !unique.has(key)) unique.set(key, storedValue);
      });
      return [...unique.values()].join(";");
    }

    function getCompanyStatusFromCoreBusiness(coreBusinessText) {
      const statuses = new Set();

      // Company Status hanya dibuat dari Core Business yang memang ada
      // di daftar resmi. Nilai yang tidak dikenali tidak menghasilkan status.
      getCanonicalCoreBusinessItems(coreBusinessText).forEach(item => {
        statuses.add(item.split(" - ")[0].trim());
      });

      return [...statuses].join(";");
    }

    function getCoreBusinessDescription(coreBusinessText) {
      return getCanonicalCoreBusinessItems(coreBusinessText)
        .map(item => CORE_BUSINESS_DESC[item] || item)
        .join(";");
    }

    function applyDerivedCoreBusinessFields(row) {
      const target = row || {};
      target.corebusiness = normalizeCoreBusinessImportedValue(
        target.corebusiness
      );
      target.companystatus = getCompanyStatusFromCoreBusiness(
        target.corebusiness
      );
      target.corebusinessdesc = getCoreBusinessDescription(
        target.corebusiness
      );
      return target;
    }
    /*=====================================================
      ACTION DROPDOWN — sama dengan BidderList
      Hover pada desktop, klik pada touch/keyboard.
    ===================================================== */
    const menuBtn = document.getElementById("menuBtn");
    const menu = document.getElementById("menu");
    const actionDropdown = document.getElementById("actionDropdown") || menuBtn?.closest(".action-dropdown");

    function setActionMenuOpen(open) {
      if (!menuBtn || !menu || !actionDropdown) return;
      const isOpen = Boolean(open);
      actionDropdown.classList.toggle("open", isOpen);
      menuBtn.setAttribute("aria-expanded", String(isOpen));
      menu.setAttribute("aria-hidden", String(!isOpen));
    }

    function closeActionMenu() {
      setActionMenuOpen(false);
    }

    menuBtn?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setActionMenuOpen(!actionDropdown.classList.contains("open"));
    });

    document.addEventListener("click", event => {
      if (actionDropdown && !actionDropdown.contains(event.target)) {
        closeActionMenu();
      }
    });

    menu?.addEventListener("click", event => {
      if (event.target.closest("button, label, a, [role='menuitem']")) {
        closeActionMenu();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeActionMenu();
        menuBtn?.focus();
      }
    });

    // Tutup panel checkbox Core Business saat klik di luar panel itu
    document.addEventListener("click", e => {
      document.querySelectorAll(".core-business-panel").forEach(panel => {
        if (!panel.contains(e.target) && !panel.previousElementSibling?.contains(e.target)) {
          panel.classList.add("hidden");
        }
      });
    });

    function handleAdd() {
      closeActionMenu();
      if (!canManageCompany()) return;
      if (isSearchActive()) {
          document.getElementById("searchInput").value = "";
      }
      const newIndex = companyData.length;
      companyData.push(emptyRow());
      editingRows.add(newIndex);
      newRows.add(newIndex);
      updateActionColumn();
      renderTable();
      MSW.table.afterAdd();
  }

    function toggleRowEdit(index) {
        if (!canManageCompany()) return;
        if (editingRows.has(index)) return;
        originalRows[index] = structuredClone(companyData[index]);
        editingRows.add(index);
        updateActionColumn();
        if (isSearchActive()) {
            filterTable();
        } else {
            renderTable();
        }
    }
    
    const savingRows = new Set();

    async function saveRow(index) {
      if (!canManageCompany()) return;
      if (savingRows.has(index)) return;
      savingRows.add(index);
      try {
        const tr = document.querySelector(
            `#tableBody tr[data-index="${index}"]`
        );
          if (!tr) return;

          tr.querySelectorAll("td[data-key]").forEach(td => {
              const key = td.dataset.key;
              if (key === "corebusiness") return;
              if (key === "soleagent") {
                  const status = td.querySelector(".soleagent-status");
                  const brand  = td.querySelector(".soleagent-brand");
                  companyData[index].soleagent =
                      status ? status.value : "";
                  companyData[index].principalbrand =
                      brand ? brand.value : "";
                  return;
              }
              const value = td.innerText.trim();
              companyData[index][key] = key === "companyphone"
                  ? normalizePhoneText(value)
                  : value;
          });
          if (
              companyData[index].soleagent === "Yes" &&
              !companyData[index].principalbrand.trim()
          ) {
              alert("Principal Brand wajib diisi jika Sole Agent = Yes");
              return;
          }
          companyData[index].companystatus =
            getCompanyStatusFromCoreBusiness(
                companyData[index].corebusiness
            );
          companyData[index].corebusinessdesc =
            getCoreBusinessDescription(
                companyData[index].corebusiness
            );

          const rowToSave = structuredClone(companyData[index]);
          const isNewRow = newRows.has(index);
          const originalNoCompany =
              !isNewRow && originalRows[index]
                  ? originalRows[index].noCompany
                  : "";

          saveCompanyCache();
          delete originalRows[index];
          newRows.delete(index);
          editingRows.delete(index);
          updateActionColumn();
          filterTable();
          await saveToGoogleSheet(
              rowToSave,
              isNewRow ? "ADD_COMPANY" : "EDIT_COMPANY",
              originalNoCompany
          );
         
    } finally {
       savingRows.delete(index);
    }
    }
    
    function cancelRow(index) {
        if (!canManageCompany()) return;
        if (newRows.has(index)) {
            companyData.splice(index, 1);
            newRows.delete(index);
        } else {
            companyData[index] = structuredClone(originalRows[index]);
            delete originalRows[index];
        }
        editingRows.delete(index);
        updateActionColumn();
        filterTable();
    }

    async function handleDelete(i){
      if (!canManageCompany()) return;
      if (isSearchActive()) {
        alert("Kosongkan Search terlebih dahulu sebelum hapus data, supaya baris yang dihapus tidak salah.");
        return;
      }
      if(!confirm("Hapus baris ini?")) return;
      companyData.splice(i,1);
      saveCompanyCache();
      await saveToGoogleSheet();
    
      filterTable();
    }

    /* ========== Klik-kanan baris -> menu Delete ========== */

    let rowContextMenu = null;

    function ensureRowContextMenu(){
        if (!canManageCompany(false)) return null;
        if (rowContextMenu) return rowContextMenu;

        rowContextMenu = document.createElement("div");
        rowContextMenu.id = "rowContextMenu";
        rowContextMenu.style.cssText = `
            position:fixed;
            z-index:600;
            min-width:150px;
            background:#fff;
            border:1px solid #d1d5db;
            border-radius:8px;
            box-shadow:0 10px 25px rgba(0,0,0,.2);
            overflow:hidden;
            display:none;
        `;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.id = "rowContextDeleteBtn";
        delBtn.textContent = "🗑  Delete Row";
        delBtn.style.cssText = `
            width:100%;
            text-align:left;
            padding:8px 14px;
            background:#fff;
            border:none;
            cursor:pointer;
            color:#dc2626;
            font-weight:600;
            font-size:13px;
        `;
        delBtn.onmouseenter = () => delBtn.style.background = "#fef2f2";
        delBtn.onmouseleave = () => delBtn.style.background = "#fff";

        rowContextMenu.appendChild(delBtn);
        document.body.appendChild(rowContextMenu);

        document.addEventListener("click", () => {
            rowContextMenu.style.display = "none";
        });
        document.addEventListener("contextmenu", (e) => {
            if (!e.target.closest("tr[data-index]")) {
                rowContextMenu.style.display = "none";
            }
        });
        window.addEventListener("scroll", () => {
            rowContextMenu.style.display = "none";
        }, true);

        return rowContextMenu;
    }

    function showRowContextMenu(e, realIndex){
        if (!canManageCompany()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (rowContextMenu) rowContextMenu.style.display = "none";
            return;
        }
        const menuEl = ensureRowContextMenu();
        if (!menuEl) return;
        const delBtn = menuEl.querySelector("#rowContextDeleteBtn");

        delBtn.onclick = async (ev) => {
            ev.stopPropagation();
            menuEl.style.display = "none";
            await handleDelete(realIndex);
        };

        menuEl.style.display = "block";

        const menuWidth = 160;
        const menuHeight = 40;
        let left = e.clientX;
        let top = e.clientY;

        if (left + menuWidth > window.innerWidth - 8) {
            left = window.innerWidth - menuWidth - 8;
        }
        if (top + menuHeight > window.innerHeight - 8) {
            top = window.innerHeight - menuHeight - 8;
        }

        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;
    }



    /* ========== FILTER DROPDOWN SEPERTI EXCEL ========== */
    const COLUMN_FILTER_STORAGE_KEY = "vendorCompanyExcelColumnFilters";
    let columnFilters = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(COLUMN_FILTER_STORAGE_KEY) || "{}");
        return Object.fromEntries(Object.entries(saved || {}).filter(([, v]) => Array.isArray(v)));
      } catch (_) { return {}; }
    })();
    let activeColumnFilterMenu = null;

    function getColumnFilterSourceRows() {
      return (companyData || []).map((row, index) => ({ ...row, __realIndex: row?.__realIndex ?? index }));
    }
    function hasActiveColumnFilters() { return Object.keys(columnFilters).length > 0; }
    function persistColumnFilters() {
      try {
        if (hasActiveColumnFilters()) localStorage.setItem(COLUMN_FILTER_STORAGE_KEY, JSON.stringify(columnFilters));
        else localStorage.removeItem(COLUMN_FILTER_STORAGE_KEY);
      } catch (_) {}
    }
    function getColumnFilterValue(row, key) {
      if (key === "no") return String((row?.__realIndex ?? 0) + 1);
      return String(row?.[key] ?? "");
    }
    function matchesColumnFilters(row, exceptKey = null) {
      return Object.entries(columnFilters).every(([key, selected]) => {
        if (key === exceptKey || !Array.isArray(selected)) return true;
        return selected.includes(getColumnFilterValue(row, key));
      });
    }
    function updateColumnFilterHeaderState() {
      document.querySelectorAll("#theadRow [data-column-filter-button]").forEach(button => {
        const active = Object.prototype.hasOwnProperty.call(columnFilters, button.dataset.columnFilterButton);
        button.classList.toggle("is-active", active);
        button.closest("th")?.classList.toggle("has-column-filter", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        button.title = active ? "Filter aktif — klik untuk mengubah" : "Filter kolom";
      });
    }
    function applyColumnFilterRefresh() {
      persistColumnFilters();
      updateColumnFilterHeaderState();
      if (typeof filterTable === "function") filterTable({ preserveSearchFocus: false });
    }
    function clearColumnFilters() {
      columnFilters = {};
      closeColumnFilterMenu();
      applyColumnFilterRefresh();
    }
    function closeColumnFilterMenu() {
      activeColumnFilterMenu?.remove();
      activeColumnFilterMenu = null;
    }
    function formatColumnFilterLabel(value) { return value === "" ? "(Kosong)" : value; }
    function getColumnUniqueValues(key) {
      const values = new Set(
        getColumnFilterSourceRows()
          .filter(row => matchesColumnFilters(row, key))
          .map(row => getColumnFilterValue(row, key))
      );
      (columnFilters[key] || []).forEach(value => values.add(String(value)));
      return Array.from(values).sort((a, b) => formatColumnFilterLabel(a).localeCompare(
        formatColumnFilterLabel(b), "id", { numeric: true, sensitivity: "base" }
      ));
    }
    function positionColumnFilterMenu(menu, button) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(320, Math.max(260, window.innerWidth - 16));
      menu.style.width = `${width}px`;
      const height = menu.getBoundingClientRect().height;
      let left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }
    function openColumnFilterMenu(button, col) {
      closeColumnFilterMenu();
      const allValues = getColumnUniqueValues(col.key);
      const hasFilter = Object.prototype.hasOwnProperty.call(columnFilters, col.key);
      const draft = new Set(hasFilter ? columnFilters[col.key].map(String) : allValues);
      let selectionChanged = false;

      const menu = document.createElement("div");
      menu.className = "excel-column-filter-menu";
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", `Filter ${col.label}`);
      menu.addEventListener("pointerdown", e => e.stopPropagation());
      menu.addEventListener("click", e => e.stopPropagation());

      const title = document.createElement("div");
      title.className = "excel-filter-menu-title";
      title.textContent = `Filter: ${col.label}`;

      const search = document.createElement("input");
      search.type = "search";
      search.className = "excel-filter-search";
      search.placeholder = "Cari nilai...";
      search.autocomplete = "off";
      search.spellcheck = false;

      const selectAllLabel = document.createElement("label");
      selectAllLabel.className = "excel-filter-select-all";
      const selectAll = document.createElement("input");
      selectAll.type = "checkbox";
      const selectAllText = document.createElement("span");
      selectAllText.textContent = "Pilih Semua";
      selectAllLabel.append(selectAll, selectAllText);

      const list = document.createElement("div");
      list.className = "excel-filter-values";
      const empty = document.createElement("div");
      empty.className = "excel-filter-empty";
      empty.textContent = "Tidak ada nilai yang cocok.";

      const footer = document.createElement("div");
      footer.className = "excel-filter-footer";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "excel-filter-clear";
      clear.textContent = "Hapus Filter";
      clear.disabled = !hasFilter;
      const actions = document.createElement("div");
      actions.className = "excel-filter-footer-right";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "excel-filter-cancel";
      cancel.textContent = "Batal";
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "excel-filter-apply";
      apply.textContent = "Terapkan";
      actions.append(cancel, apply);
      footer.append(clear, actions);
      menu.append(title, search, selectAllLabel, list, empty, footer);
      document.body.appendChild(menu);
      activeColumnFilterMenu = menu;

      const visibleValues = () => {
        const terms = search.value.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
        if (!terms.length) return allValues;
        return allValues.filter(value => {
          const text = formatColumnFilterLabel(value).toLocaleLowerCase("id");
          return terms.every(term => text.includes(term));
        });
      };
      const updateSelectAll = values => {
        const count = values.filter(value => draft.has(value)).length;
        selectAll.checked = values.length > 0 && count === values.length;
        selectAll.indeterminate = count > 0 && count < values.length;
        apply.disabled = allValues.length === 0;
      };
      const renderValues = () => {
        const values = visibleValues();
        list.innerHTML = "";
        empty.hidden = values.length > 0;
        values.forEach(value => {
          const label = document.createElement("label");
          label.className = "excel-filter-value";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = draft.has(value);
          checkbox.addEventListener("change", () => {
            selectionChanged = true;
            if (checkbox.checked) draft.add(value); else draft.delete(value);
            updateSelectAll(visibleValues());
          });
          const text = document.createElement("span");
          text.textContent = formatColumnFilterLabel(value);
          text.title = formatColumnFilterLabel(value);
          label.append(checkbox, text);
          list.appendChild(label);
        });
        updateSelectAll(values);
      };

      search.addEventListener("input", renderValues);
      search.addEventListener("keydown", e => {
        if (e.key === "Escape") { closeColumnFilterMenu(); button.focus({ preventScroll: true }); e.preventDefault(); }
      });
      selectAll.addEventListener("change", () => {
        selectionChanged = true;
        visibleValues().forEach(value => selectAll.checked ? draft.add(value) : draft.delete(value));
        renderValues();
      });
      clear.addEventListener("click", () => {
        delete columnFilters[col.key];
        closeColumnFilterMenu();
        applyColumnFilterRefresh();
      });
      cancel.addEventListener("click", () => { closeColumnFilterMenu(); button.focus({ preventScroll: true }); });
      apply.addEventListener("click", () => {
        const searchedValues = visibleValues();
        const selected = (!selectionChanged && search.value.trim())
          ? searchedValues
          : allValues.filter(value => draft.has(value));
        if (selected.length === allValues.length) delete columnFilters[col.key];
        else columnFilters[col.key] = selected;
        closeColumnFilterMenu();
        applyColumnFilterRefresh();
      });

      renderValues();
      requestAnimationFrame(() => { positionColumnFilterMenu(menu, button); search.focus({ preventScroll: true }); });
    }
    function buildHeaderFilter(th, col) {
      const wrap = document.createElement("div");
      wrap.className = "excel-filter-header";
      const label = document.createElement("span");
      label.className = "excel-filter-header-label";
      label.textContent = col.label;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "excel-filter-button";
      button.dataset.columnFilterButton = col.key;
      button.setAttribute("aria-label", `Filter ${col.label}`);
      button.setAttribute("aria-haspopup", "dialog");
      button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 3.25h11.2L9.25 8.1v3.65l-2.5 1V8.1L2.4 3.25Z"></path></svg>';
      button.addEventListener("pointerdown", e => e.stopPropagation());
      button.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); openColumnFilterMenu(button, col); });
      wrap.append(label, button);
      th.appendChild(wrap);
    }
    document.addEventListener("pointerdown", e => {
      if (!activeColumnFilterMenu || e.target.closest(".excel-column-filter-menu, .excel-filter-button")) return;
      closeColumnFilterMenu();
    });
    document.addEventListener("scroll", closeColumnFilterMenu, true);
    window.addEventListener("resize", closeColumnFilterMenu);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && activeColumnFilterMenu) closeColumnFilterMenu(); });

    function filterTable(){
        const q = document
            .getElementById("searchInput")
            .value
            .toLowerCase();
        updateActionColumn();
        const f = companyData.map((row,index)=>({...row,__realIndex:index})).filter(row =>
            matchesColumnFilters(row) && COLUMNS.some(c =>
                String(row[c.key] || "")
                    .toLowerCase()
                    .includes(q)
            )
        );
        renderTable(f);

    }

    async function clearAll(){
      closeActionMenu();
      if (!canManageCompany()) return;
      if(!confirm("Hapus semua data?")) return;
      companyData=[];      
      await saveToGoogleSheet();
      
      filterTable();
    }

    function exportExcel(){
      closeActionMenu();
      if (companyData.length===0) 
      return alert("Tidak ada data untuk diekspor.");
      const rows = companyData.map(o=>{
        const r={};
        COLUMNS.forEach(c=>{
          r[c.label] = c.key === "companyphone"
            ? normalizePhoneText(o[c.key])
            : (o[c.key] ?? "");
        });
        return r;
      });
      const ws = XLSX.utils.json_to_sheet(rows);

      // Paksa Company Phone dan No Company sebagai Text di Excel hasil export.
      ["companyphone", "noCompany"].forEach(key => {
        const colIndex = COLUMNS.findIndex(c => c.key === key);
        if (colIndex < 0 || !ws["!ref"]) return;
        for (let rowNo = 2; rowNo <= rows.length + 1; rowNo++) {
          const address = XLSX.utils.encode_cell({ r: rowNo - 1, c: colIndex });
          if (!ws[address]) continue;
          ws[address].t = "s";
          ws[address].v = key === "companyphone"
            ? normalizePhoneText(ws[address].v)
            : String(ws[address].v ?? "");
          ws[address].z = "@";
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Company");
      XLSX.writeFile(wb, `Vendor Management-${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    function humanToKeyMap(h){
      const norm = s=>s.toLowerCase().replace(/[^a-z0-9]+/g,""); const asked = norm(h);
      let best=null,score=-1; COLUMNS.forEach(col=>{ const cand=norm(col.label); let s=0; const L=Math.min(cand.length,asked.length);
        for(let i=0;i<L;i++){ if(cand[i]===asked[i]) s++; else break; } if(s>score){ score=s; best=col.key; } }); return best;
    }

    function importExcel(e){
      closeActionMenu();
      if (!canManageCompany()) {
        if (e?.target) e.target.value = "";
        return;
      }
      const file = e.target.files?.[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = async vt => {
        const wb = XLSX.read(new Uint8Array(vt.target.result), { type:"array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // raw:false membaca nilai tampilan Excel sehingga custom format
        // dengan 0 di depan tetap dipertahankan sebagai teks.
        const raw = XLSX.utils.sheet_to_json(sheet, { defval:"", raw:false });
        companyData = mapExcelRows(raw); 
        saveCompanyCache();      
        await saveToGoogleSheet();
       
        renderTable();
        alert("✅ Data Excel berhasil diimpor dan disimpan ke Google Sheet.");
        e.target.value="";
      };
      reader.readAsArrayBuffer(file);
    }

    /* ========== Backend Auto Sync ========== */
    function isSearchActive() {
      const el = document.getElementById("searchInput");
      return Boolean((el && el.value.trim() !== "") || hasActiveColumnFilters());
    }
    
    function updateActionColumn() {
        rowActionVisible =
            isSearchActive() ||
            editingRows.size > 0 ||
            newRows.size > 0;
    }

    function mapExcelRows(raw) {
      const mapped = raw.reduce((acc, row) => {
        const obj = emptyRow();
        let filled = false;
        Object.keys(row).forEach(h => {
          const k = humanToKeyMap(h);
          if (!k || k === "no") return;
          let v = row[h];
          const hl = String(h).toLowerCase();
          const isEmptyish = val => String(val ?? "").trim() === "";
          if (isEmptyish(v)) return;
          if (k === "companyphone") v = normalizePhoneText(v);
          else if (k === "noCompany") v = String(v ?? "").trim();

          obj[k] = v;
          filled = true;
        });
        if (filled) {
          // Company Status dan deskripsi tidak mengikuti isi file import.
          // Keduanya selalu dihitung ulang dari Core Business yang valid.
          applyDerivedCoreBusinessFields(obj);
          acc.push(obj);
        }
        return acc;
      }, []);
      return mapped;
    }

    async function loadFromGoogleSheet(force = false) {
      try {
        if (editingRows.size > 0) return;
        const res = await fetch(
          `${GAS_URL}?sheet=${SHEET_NAME}`,
          {
            cache: "no-store"
          }
        );

        // Ambil sebagai teks dulu, baru di-parse. Kalau Apps Script
        // belum di-deploy ulang / URL salah / butuh login ulang,
        // server akan balas HTML (bukan JSON) dan res.json() akan
        // gagal tanpa pesan yang jelas.
        const raw = await res.text();
        let data;
        try {
          data = JSON.parse(raw);
        } catch (parseErr) {
          console.error(
            "❌ Response GET bukan JSON (kemungkinan Apps Script " +
            "belum di-deploy ulang / URL salah / butuh re-auth). Isi:",
            raw.slice(0, 300)
          );
          setSyncStatus(false, "Load gagal: respons server bukan JSON");
          return;
        }

        if (!Array.isArray(data.rows)) {
          console.error("Response tidak valid:", data);
          setSyncStatus(false, data.message || "Response tidak valid dari server");
          return;
        }
        if (data.success === false) {
          throw new Error(data.message);
        }
        if (!force && data.mtimeMs === lastGoogleSheetMtime) {
          return;
        }
        lastGoogleSheetMtime = data.mtimeMs;
        companyData = (data.rows || []).map(r => applyDerivedCoreBusinessFields({
          noCompany: r["No Company"] || "",
          companyName: r["Company Name"] || "",
          email: r["Email"] || "",
          customercontact: r["Customer Contact"] || "",
          companyphone: normalizePhoneText(r["Company Phone"]),
          address: r["Address Company"] || "",
          status: r["Status Register"] || "",
          companystatus: r["Company Status"] || "",
          corebusiness: r["Core Business"] || "",
          corebusinessdesc:
             r["Description Core Business"] || "",
          soleagent: r["Sole Agent"] || "",
          principalbrand: r["Principal Brand"] || "",
        }));
        saveCompanyCache();
        if (isSearchActive()) {
            filterTable();
        } else {
            renderTable();
        }
        setSyncStatus(true);
        console.log(
          "✅ Data berhasil dibaca dari Google Sheet"
        );
      } catch (err) {
        setSyncStatus(false, err.message);
        console.error(
          "❌ Gagal membaca Google Sheet",
          err
        );
      }
    }

    /* ==========================================================
       INDIKATOR STATUS SYNC (online/offline + waktu save terakhir)
       Membantu memastikan apakah data benar2 tersimpan ke Google
       Sheet atau cuma tersimpan di cache lokal saja.
    ========================================================== */
    function setSyncStatus(ok, message = "") {
        let el = document.getElementById("syncStatus");
        if (!el) {
            el = document.createElement("div");
            el.id = "syncStatus";
            el.style.cssText =
              "position:fixed;bottom:10px;right:10px;font-size:11px;" +
              "padding:4px 10px;border-radius:6px;z-index:9999;" +
              "font-family:sans-serif;transition:opacity .3s;";
            document.body.appendChild(el);
        }
        const now = new Date().toLocaleTimeString("id-ID");
        if (ok) {
            el.textContent = `✅ Tersambung Google Sheet — terakhir sync ${now}`;
            el.style.background = "#d1fae5";
            el.style.color = "#065f46";
        } else {
            el.textContent = `⚠️ Gagal sync ke Google Sheet (${now})` +
              (message ? `: ${message}` : "");
            el.style.background = "#fee2e2";
            el.style.color = "#991b1b";
        }
    }

    async function saveToGoogleSheet(row = null, action = null, originalNoCompany = "") {
      if (!canManageCompany()) return false;
      console.log("ROW DIKIRIM:", row, "ACTION:", action);
      try {
        console.log("POSTING TO:", GAS_URL);
        console.log("Jumlah data:", companyData.length);

        let payload;

        if (row && action) {

            // Pastikan Company Status dan deskripsi selalu konsisten dengan
            // Core Business sebelum dikirim ke Google Sheet.
            applyDerivedCoreBusinessFields(row);

            // Simpan 1 baris saja (tambah/edit), tanpa menimpa baris lain di sheet
            payload = {
                sheet: SHEET_NAME,
                action: action,
                originalNoCompany: originalNoCompany || "",
                row: {
                    "No Company": row.noCompany || "",
                    "Company Name": row.companyName || "",
                    "Email": row.email || "",
                    "Customer Contact": row.customercontact || "",
                    "Company Phone": normalizePhoneText(row.companyphone),
                    "Address Company": row.address || "",
                    "Status Register": row.status || "",
                    "Company Status": row.companystatus || "",
                    "Core Business": row.corebusiness || "",
                    "Description Core Business": row.corebusinessdesc || "",
                    "Sole Agent": row.soleagent || "",
                    "Principal Brand": row.principalbrand || ""
                }
            };

        } else {

            companyData.forEach(applyDerivedCoreBusinessFields);

            payload = {
                sheet: SHEET_NAME,
                rows: companyData.map(r => ({
                    "No Company": r.noCompany || "",
                    "Company Name": r.companyName || "",
                    "Email": r.email || "",
                    "Customer Contact": r.customercontact || "",
                    "Company Phone": normalizePhoneText(r.companyphone),
                    "Address Company": r.address || "",
                    "Status Register": r.status || "",
                    "Company Status": r.companystatus || "",
                    "Core Business": r.corebusiness || "",
                    "Description Core Business": r.corebusinessdesc || "",
                    "Sole Agent": r.soleagent || "",
                    "Principal Brand": r.principalbrand || ""
                }))
            };

        }

        saveCompanyCache();

        const res = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        // PENTING: baca sebagai teks dulu. Kalau deployment Apps Script
        // di GAS_URL belum di-update ke versi kode terbaru (lupa "New
        // deployment" / "Manage deployments" setelah edit code.gs),
        // atau URL exec salah, atau butuh re-authorize, server akan
        // membalas halaman HTML (login/error Google), BUKAN JSON.
        // res.json() akan gagal dengan pesan generik yang membingungkan
        // ("Unexpected token < in JSON") — itu justru sinyal kuat bahwa
        // masalahnya ada di sisi deployment Apps Script, bukan di kode ini.
        const rawText = await res.text();
        let result;
        try {
          result = JSON.parse(rawText);
        } catch (parseErr) {
          console.error(
            "❌ Respons POST bukan JSON. Kemungkinan besar:\n" +
            "1) Apps Script belum di-deploy ulang versi terbarunya, atau\n" +
            "2) GAS_URL tidak lagi valid / berbeda deployment, atau\n" +
            "3) Perlu otorisasi ulang script.\n" +
            "Isi respons mentah:",
            rawText.slice(0, 500)
          );
          setSyncStatus(false, "Save gagal: respons server bukan JSON (cek deployment Apps Script)");
          alert(
            "Gagal menyimpan ke Google Sheet.\n\n" +
            "Server tidak membalas JSON — kemungkinan besar deployment " +
            "Apps Script (code.gs) belum di-update ke versi terbaru, " +
            "atau GAS_URL sudah tidak sesuai.\n\n" +
            "Cek: Apps Script Editor > Deploy > Manage deployments > " +
            "pastikan versi aktif memuat handler ADD_COMPANY/EDIT_COMPANY."
          );
          return false;
        }

        console.log(result);

        if (!result.success) {
            setSyncStatus(false, result.message);
            throw new Error(result.message);
        }

        setSyncStatus(true);
        return true;
      } catch(err) {
        console.error(err);
        setSyncStatus(false, err.message);
        alert(
          "Gagal menyimpan ke Google Sheet\n\n" +
          err.message
        );
        return false;
      }
    }

    function renderHeader(){
      const tr = document.getElementById("theadRow");
      const displayColumns = COLUMNS.filter(col => col.key !== "principalbrand");
      const signature = displayColumns.map(col => col.key).join("|");
      const buttons = tr.querySelectorAll("[data-column-filter-button]");
      if (tr.dataset.filterSignature === signature && buttons.length === displayColumns.length) {
        updateColumnFilterHeaderState();
        return;
      }
      document.getElementById("columnFilterRow")?.remove();
      tr.innerHTML = "";
      displayColumns.forEach(col => {
        const th = document.createElement("th");
        th.className = "px-3 py-2 border header-filter-cell";
        if (col.width) { th.style.width = col.width; th.style.minWidth = col.width; th.style.maxWidth = col.width; }
        buildHeaderFilter(th, col);
        tr.appendChild(th);
      });
      tr.dataset.filterSignature = signature;
      updateColumnFilterHeaderState();
    }

    function renderTable(data = companyData){
      renderHeader();
      const tbody = document.getElementById("tableBody"); tbody.innerHTML="";
      data.forEach((displayRow, idx)=>{
        // Saat tabel berasal dari filterTable(), displayRow adalah hasil clone.
        // Karena itu jangan gunakan companyData.indexOf(displayRow), sebab hasilnya -1
        // dan seluruh baris akan dianggap mempunyai index edit yang sama.
        const mappedIndex = Number(displayRow?.__realIndex);
        const realIndex = Number.isInteger(mappedIndex)
          ? mappedIndex
          : companyData.indexOf(displayRow);

        // Abaikan data tampilan yang tidak lagi memiliki pasangan di companyData.
        if (realIndex < 0 || !companyData[realIndex]) return;

        // Selalu edit object asli, bukan clone hasil pencarian/filter.
        const row = companyData[realIndex];
        const tr = document.createElement("tr");
        tr.dataset.index = realIndex;
        tr.oncontextmenu = (e) => {
            e.preventDefault();
            if (!canManageCompany(false)) {
                e.stopImmediatePropagation();
                if (rowContextMenu) rowContextMenu.style.display = "none";
                return;
            }
            showRowContextMenu(e, realIndex);
        };
        tr.ondblclick = (e) => {

            if (!canManageCompany()) return;

            if (
                e.target.closest("button") ||
                e.target.closest("input") ||
                e.target.closest("select")
            ) return;

            if (editingRows.has(realIndex)) return;

            const field = e.target.dataset.key;

            toggleRowEdit(realIndex);

            setTimeout(() => {

                const currentRow = document.querySelector(
                    `#tableBody tr[data-index="${realIndex}"]`
                );

                if (!currentRow) return;

                const td = currentRow.querySelector(
                    `td[data-key="${field}"]`
                );

                if (!td) return;

                td.focus();

                if (td.isContentEditable) {

                    const range = document.createRange();

                    range.selectNodeContents(td);

                    range.collapse(false);

                    const sel = window.getSelection();

                    sel.removeAllRanges();

                    sel.addRange(range);

                }

            }, 0);

        };
        const rowEditing = editingRows.has(realIndex);
        COLUMNS.forEach(col=>{
          if (col.key === "principalbrand") return;
          const td = document.createElement("td");
          td.className = "px-3 py-2 border";
          td.dataset.key = col.key;
          if (col.width) {
              td.style.width = col.width;
              td.style.minWidth = col.width;
          }
          const isCoreBusiness = col.key === "corebusiness";
          const isCompanyStatus = col.key === "companystatus";

          // corebusiness & companystatus tidak pernah diketik manual:
          // corebusiness pakai <select multiple>, companystatus auto-generate.
          td.contentEditable = (rowEditing && !isCoreBusiness && !isCompanyStatus) ? "true" : "false";
          td.classList.toggle(
              "bg-yellow-50",
              rowEditing && !isCoreBusiness && !isCompanyStatus
          );
          if (isCompanyStatus)
            td.classList.toggle("bg-gray-100", rowEditing);
          
          if (rowEditing) {

              td.onkeydown = async (e) => {

                  if (e.key === "Enter") {

                      e.preventDefault();
                      e.stopPropagation();

                      await saveRow(realIndex);

                  }

                  else if (e.key === "Escape") {

                      e.preventDefault();
                      e.stopPropagation();

                      cancelRow(realIndex);

                  }

              };

          }

          if (isCoreBusiness && rowEditing) {
            const selected =
              (row.corebusiness || "")
                .split(";")
                .map(x => x.trim())
                .filter(x =>
                  x &&
                  x !== "" &&
                  CORE_BUSINESS_OPTIONS.includes(x)
                );
            // Bersihkan data lama yang sudah tidak valid
            row.corebusiness = selected.join(";");
            row.companystatus =
              getCompanyStatusFromCoreBusiness(
                row.corebusiness
              );
            row.corebusinessdesc =
              getCoreBusinessDescription(
                row.corebusiness
              );
            const wrapper = document.createElement("div");
            wrapper.className = "relative text-left";
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = "w-full border border-gray-300 rounded px-2 py-1 bg-white text-left text-xs truncate";
            toggleBtn.textContent =
              selected.length
                ? `${selected.length} item selected`
                : "Pilih Core Business";
            const panel = document.createElement("div");
            panel.className = "fixed w-64 max-h-64 overflow-y-auto bg-white border rounded-lg shadow-xl hidden text-left";
            panel.style.zIndex = "300";
            const searchBox = document.createElement("input");
            searchBox.type = "text";
            searchBox.placeholder = "Search...";
            searchBox.className =
              "w-full border-b p-2 text-xs sticky top-0 bg-white";
            panel.appendChild(searchBox);
           
            CORE_BUSINESS_OPTIONS.forEach(item => {
              const label = document.createElement("label");
              label.className = "flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-xs whitespace-nowrap";
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.value = item;
              checkbox.checked = selected.includes(item);
              checkbox.addEventListener("change", () => {
                const current = new Set(
                  (row.corebusiness || "")
                    .split(";")
                    .map(x => x.trim())
                    .filter(x =>
                      x &&
                      x !== "" &&
                      CORE_BUSINESS_OPTIONS.includes(x)
                    )
                );
                if (checkbox.checked) current.add(item);
                else current.delete(item);
                row.corebusiness =
                  [...current]
                    .map(x => x.trim())
                    .filter(x => x && x !== "")
                    .join(";");
                row.companystatus =
                  getCompanyStatusFromCoreBusiness(
                    row.corebusiness
                  );
                row.corebusinessdesc =
                  getCoreBusinessDescription(
                    row.corebusiness
                  );
                console.log("CORE:", row.corebusiness);
                console.log("STATUS:", row.companystatus);
                toggleBtn.textContent = current.size
                  ? `${current.size} item selected`
                  : "Pilih Core Business";

                // refresh sel Company Status di baris yang sama tanpa re-render seluruh tabel
                const statusTd = 
                  tr.querySelector(
                    'td[data-key="companystatus"]'
                  );
                const descTd =
                  tr.querySelector(
                    'td[data-key="corebusinessdesc"]'
                  );

                if (descTd) {

                  descTd.innerHTML =
                    String(row.corebusinessdesc || "")
                      .split(";")
                      .map(x => x.trim())
                      .filter(x => x && x !== "")
                      .join("<br>");

                }
                if (statusTd) {

                  statusTd.innerHTML =
                    String(row.companystatus || "")
                      .split(";")
                      .map(x => x.trim())
                      .filter(x => x && x !== "")
                      .join("<br>");

                }

              });
            
              const span = document.createElement("span");
              span.textContent = item;

              label.appendChild(checkbox);
              label.appendChild(span);
              panel.appendChild(label);

            });
            searchBox.addEventListener("input", () => {
                const q = searchBox.value.trim().toLowerCase();
                panel.querySelectorAll("label").forEach(lbl => {
                    const code =
                        lbl.querySelector("span").textContent;
                    const desc =
                        CORE_BUSINESS_DESC[code] || "";
                    const keyword =
                        `${code} ${desc}`.toLowerCase();
                    lbl.style.display =
                        keyword.includes(q)
                            ? "flex"
                            : "none";
                });

            });
            const okBtn = document.createElement("button");
            okBtn.type = "button";
            okBtn.className =
                "w-full bg-blue-600 text-white py-2 text-xs font-semibold hover:bg-blue-700 sticky bottom-0";
            okBtn.textContent = "OK";
            okBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                panel.classList.add("hidden");
                await saveRow(realIndex);
            });
            panel.appendChild(okBtn);

            toggleBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const isHidden = panel.classList.contains("hidden");
              // tutup semua panel core-business lain yang mungkin masih terbuka
              document.querySelectorAll(".core-business-panel").forEach(p => p.classList.add("hidden"));

              if (isHidden) {
                  const rect = toggleBtn.getBoundingClientRect();

                  const panelWidth = 256; // sesuai w-64
                  let left = rect.left;

                  if (left + panelWidth > window.innerWidth - 8) {
                      left = Math.max(8, window.innerWidth - panelWidth - 8);
                  }

                  panel.style.left = `${left}px`;

                  searchBox.value = "";

                  panel.querySelectorAll("label").forEach(lbl => {
                      lbl.style.display = "flex";
                  });

                  // tampilkan dulu agar tinggi panel bisa dihitung
                  panel.classList.remove("hidden");

                  requestAnimationFrame(() => {

                      const margin = 8;

                      // reset jika sebelumnya pernah berubah
                      panel.style.maxHeight = "";

                      // gunakan ukuran panel yang sebenarnya
                      const panelRect = panel.getBoundingClientRect();
                      const panelHeight = panelRect.height;
                      const panelWidth = panelRect.width;

                      let top;
                      let left = rect.left;

                      // ===== Posisi Horizontal =====
                      if (left + panelWidth > window.innerWidth - margin) {
                          left = window.innerWidth - panelWidth - margin;
                      }

                      if (left < margin) {
                          left = margin;
                      }

                      // ===== Posisi Vertikal =====
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const spaceAbove = rect.top;

                      if (spaceBelow >= panelHeight + margin) {

                          // buka ke bawah
                          top = rect.bottom + 4;

                      } else if (spaceAbove >= panelHeight + margin) {

                          // buka ke atas
                          top = rect.top - panelHeight - 4;

                      } else if (spaceBelow >= spaceAbove) {

                          // bawah lebih luas
                          top = rect.bottom + 4;
                          panel.style.maxHeight = `${spaceBelow - margin}px`;

                      } else {

                          // atas lebih luas
                          panel.style.maxHeight = `${spaceAbove - margin}px`;
                          top = margin;

                      }

                      panel.style.left = `${left}px`;
                      panel.style.top = `${top}px`;

                  });

              }
            });

            panel.classList.add("core-business-panel");

            wrapper.appendChild(toggleBtn);
            wrapper.appendChild(panel);

            td.innerHTML = "";
            td.ondblclick = async (e) => {
                e.stopPropagation();
                if (!canManageCompany()) return;
                if (
                    e.target.closest("button") ||
                    e.target.closest("input") ||
                    e.target.closest("select")
                ) return;
                if (editingRows.has(realIndex)) {
                    await saveRow(realIndex);
                } else {
                    toggleRowEdit(realIndex);
                }
            };
            td.appendChild(wrapper);
            
          }

          else if (col.key === "soleagent" && rowEditing) {

            td.innerHTML = `
              <div style="display:flex;flex-direction:column;width:100%;gap:4px;">
                <select 
                  class="soleagent-status"
                  style="width:50%;border:1px solid #ccc;"
                >
                  <option value=""
                    ${!row.soleagent ? "selected" : ""}>
                    -
                  </option>
                  <option value="Yes"
                    ${row.soleagent==="Yes"?"selected":""}>
                    Yes
                  </option>

                  <option value="No"
                    ${row.soleagent==="No"?"selected":""}>
                    No
                  </option>
                </select>

                <input
                  class="soleagent-brand"
                  type="text"
                  value="${row.principalbrand || ""}"
                  placeholder=""
                  style="width:100%;border:1px solid #ccc;"
                >
              </div>
            `;

          }

          else if (col.key === "no") {

            td.textContent = realIndex + 1;
            td.contentEditable = "false";
            td.style.backgroundColor = "#f9fafb";

          }
          
          else {

            const cellValue = row[col.key];

            if (
              cellValue === null ||
              cellValue === undefined ||
              String(cellValue).trim() === ""
            ) {

              td.textContent = "";

            } else {

              if (
                  col.key === "corebusiness" ||
                  col.key === "companystatus" ||
                  col.key === "corebusinessdesc"
              ) {

                td.innerHTML = String(cellValue)
                .split(";")
                .map(x => x.trim())
                .filter(x => x && x !== "")
                .join("<br>");

              } else {
                if (col.key === "soleagent") {

                  td.innerHTML = `
                    <div style="font-weight:bold">
                      ${row.soleagent || ""}
                    </div>

                    <div style="
                      font-size:11px;
                      color:#666;
                      margin-top:2px;
                    ">
                      ${row.principalbrand || ""}
                    </div>
                  `;

                }
                else {

                  td.textContent = cellValue;

                }


              }
            }
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      lucide.createIcons();
    }

    function applyBuyerViewOnlyUI() {
      if (!window.MSW?.auth?.isViewOnlyModule(MSW_ROLE_MODULE)) {
        // Pastikan class pengunci dari sesi lama tidak terbawa saat akun Admin aktif.
        document.body.classList.remove("msw-view-only");
        document.getElementById("mswRoleAccessBanner")?.remove();
        const actionDropdown = document.getElementById("actionDropdown");
        if (actionDropdown) actionDropdown.style.display = "";
        return;
      }

      document.body.classList.add("msw-view-only");
      const actionDropdown = document.getElementById("actionDropdown");
      if (actionDropdown) actionDropdown.style.display = "";
      MSW.auth.addRoleBanner(
        "Buyer — View Only. Search, filter, scroll, dan export tetap tersedia."
      );

      const hideMutationControls = () => {
        document.querySelectorAll("button, label, a").forEach(el => {
          const text = String(el.textContent || "").trim().toLowerCase();
          const action = String(el.getAttribute("onclick") || "").toLowerCase();
          const mutating = /\b(add|edit|delete|hapus|import|all clear|clear all|save|simpan)\b/.test(text)
            || /(handleadd|handledelete|clearall|importexcel|toggleedit|save)/.test(action)
            || Boolean(el.querySelector?.('input[type="file"]'));
          const safeExport = /export|download/.test(text);
          if (mutating && !safeExport) el.style.display = "none";
        });
        document.querySelectorAll('[contenteditable="true"]').forEach(el => {
          el.setAttribute("contenteditable", "false");
        });
        const contextMenu = document.getElementById("rowContextMenu");
        if (contextMenu) contextMenu.style.display = "none";
      };

      // Blokir sebelum handler baris/sel menerima double-click atau klik kanan.
      // Ini penting karena beberapa jenis sel mempunyai handler dblclick sendiri.
      if (!document.body.dataset.buyerRowActionsBlocked) {
        document.body.dataset.buyerRowActionsBlocked = "true";
        ["dblclick", "contextmenu"].forEach(eventName => {
          document.addEventListener(eventName, event => {
            if (!event.target.closest("#tableBody tr[data-index]")) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const contextMenu = document.getElementById("rowContextMenu");
            if (contextMenu) contextMenu.style.display = "none";
          }, true);
        });
      }

      hideMutationControls();
      new MutationObserver(hideMutationControls).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["contenteditable"]
      });
    }

    let vendorCompanyInitialized = false;

    function initializeVendorCompanyPage() {
        if (vendorCompanyInitialized) return;
        vendorCompanyInitialized = true;

        applyBuyerViewOnlyUI();

        const loaded = loadCompanyCache();
        if (!loaded) {
            // Tampilkan header/kerangka tabel lebih dahulu. Pengambilan Google
            // Sheet berjalan di belakang dan tidak menahan tampilan halaman.
            renderTable();
            void loadFromGoogleSheet(true);
            return;
        }

        // Cache langsung terlihat; data terbaru diperiksa setelah browser
        // memperoleh kesempatan pertama untuk melukis halaman.
        window.setTimeout(() => { void loadFromGoogleSheet(false); }, 0);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeVendorCompanyPage, { once: true });
    } else {
        initializeVendorCompanyPage();
    }

    /* ==========================================================
      FIX STICKY HEADER REPAINT (Chrome / Edge)
    ========================================================== */

    document.addEventListener("DOMContentLoaded", () => {

        const container = document.getElementById("tableContainer");

        if(!container) return;

        let ticking = false;

        container.addEventListener("scroll", () => {

            if(ticking) return;

            requestAnimationFrame(() => {

                const thead = container.querySelector("thead");

                if(thead){

                    // paksa browser repaint
                    thead.style.transform = `translateZ(0)`;
                    void thead.offsetHeight;
                    thead.style.transform = "";

                }

                ticking = false;

            });

            ticking = true;

        });

    });

    setInterval(() => loadFromGoogleSheet(false), 60000);
