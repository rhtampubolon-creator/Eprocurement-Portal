lucide.createIcons();

    /* ========== Kolom (atur urutan & width) ========== */
    const COLUMNS = [
      { key: "no",               label: "No",                               width: "100px" },
      { key: "contractName",     label: "Contract Name",                    width: "400px" },
      { key: "companyName",      label: "Company Name",                     width: "300px" },
      { key: "signDate",         label: "Date Sign/Efektif Date",           width: "150px" },
      { key: "dueDate",          label: "Due Date",                         width: "150px" },
      { key: "latestUpdate",     label: "Latest Update (Status dari Due Date)", width: "200px" },
      { key: "contractCost",     label: "Cost Contract/Est.Cost Contract",  width: "200px" },
      { key: "vendorContact",    label: "Contact Person Vendor",            width: "200px" },
      { key: "vendorPhone",      label: "Phone",                            width: "200px" },
      { key: "addressSent",      label: "Address Sent Contract",            width: "400px" },
      { key: "prNo",             label: "PR No",                            width: "200px" },
      { key: "estCost",          label: "Est Cost",                         width: "200px" },
      { key: "picUser",          label: "PIC User",                         width: "200px" },
      { key: "picEmail",         label: "Email PIC User",                   width: "200px" },
      { key: "letterNo",         label: "Letter No",                        width: "200px" },
      { key: "coContract",       label: "No Contract",                      width: "200px" },
      { key: "courierDeliveryDate", label: "Date Del via Kurir",           width: "150px" },
    ];
    
    const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
    const SHEET_NAME = "Contract";
    const CONTRACT_CACHE_KEY = "MSW_CONTRACT_CACHE";
    const CONTRACT_SEARCH_STATE_KEY = "detailContractSearchText";
    const VENDOR_SHEET_NAME = "Company";
    
    let lastSheetMtime = 0;
    let lastSheetRevision = null;
    let lastVendorMtime = 0;
    
    /* ========== State ========== */
    let contractData = [];
    let vendorData = [];   // daftar Company dari Vendor Company (untuk dropdown & auto-fill)

    const editingRows = new Set();
    const originalRows = {};
    const newRows = new Set();

    function isBuyerContractViewOnly() {
      return document.body?.classList.contains("msw-view-only")
        || Boolean(window.MSW?.auth?.isViewOnlyModule("detailContract"));
    }

    function canManageContract(showMessage = true) {
      const allowed = !isBuyerContractViewOnly()
        && (!window.MSW?.auth || MSW.auth.canManageModule("detailContract"));
      if (!allowed && showMessage) MSW.auth.showViewOnlyMessage();
      return allowed;
    }

    function showLoading(message = "Please wait...") {

        let overlay = document.getElementById("loadingOverlay");

        if (!overlay) {

            overlay = document.createElement("div");

            overlay.id = "loadingOverlay";

            overlay.innerHTML = `
                <div class="loading-box">
                    <div class="spinner"></div>
                    <div id="loadingText">${message}</div>
                </div>
            `;

            document.body.appendChild(overlay);
        }

        document.getElementById("loadingText").textContent = message;

        overlay.style.display = "flex";
    }

    function hideLoading() {

        const overlay = document.getElementById("loadingOverlay");

        if (overlay)
            overlay.style.display = "none";

    }

    function showToast(message, type = "success") {

        let container = document.getElementById("toastContainer");

        if (!container) {

            container = document.createElement("div");

            container.id = "toastContainer";

            document.body.appendChild(container);

        }

        const toast = document.createElement("div");

        toast.className = `toast toast-${type}`;

        toast.textContent = message;

        container.appendChild(toast);

        requestAnimationFrame(() => {

            toast.classList.add("show");

        });

        setTimeout(() => {

            toast.classList.remove("show");

            setTimeout(() => {

                toast.remove();

            }, 300);

        }, 3000);

    }

    function setBusy(state){
        document.querySelectorAll("button").forEach(btn=>{
            btn.disabled = state;
        });
        const search = document.getElementById("searchInput");
        if(search)
            search.disabled = state;
    }
        
    function formatTanggalIndonesia(value) {
      if (value == null || value === "") return "";
      if (!isNaN(value) && Number(value) > 20000 && Number(value) < 80000) {
        const jsDate = new Date((Number(value) - 25569) * 86400 * 1000);
        return jsDate.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"2-digit" });
      }
      const d = new Date(value);
      if (!isNaN(d)) return d.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"2-digit" });
      return value;
    }
    
    function parseFlexibleDate(value) {
      if (!value && value !== 0) return null;
      if (!isNaN(value) && Number(value) > 20000 && Number(value) < 80000) {
        const d = new Date((Number(value) - 25569) * 86400 * 1000);
        if (!isNaN(d)) return d;
      }
      const d1 = new Date(value);
      if (!isNaN(d1)) return d1;

      if (typeof value === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value.trim())) {
        const [dd, mm, yy] = value.replaceAll("", "/").split("/");
        const y = Number(yy.length === 2 ? (Number(yy) >= 70 ? "19"+yy : "20"+yy) : yy);
        const d = new Date(y, Number(mm) - 1, Number(dd));
        if (!isNaN(d)) return d;
      }

      if (typeof value === "string") {
        const m = value.trim().replace(/\s+/g, " ").match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ\.]+)\s+(\d{2,4})$/);
        if (m) {
          const dd = Number(m[1]);
          const monStr = m[2].toLowerCase().replace(/\./g, "");
          const yyStr = m[3];
          const monMap = {
            "jan":"0","januari":"0","feb":"1","februari":"1","mar":"2","maret":"2","apr":"3","april":"3",
            "mei":"4","jun":"5","juni":"5","jul":"6","juli":"6","agu":"7","agt":"7","agust":"7","agustus":"7",
            "sep":"8","september":"8","okt":"9","oktober":"9","nov":"10","november":"10","des":"11","desember":"11"
          };
          const mm = monMap[monStr];
          if (mm !== undefined) {
            const y = Number(yyStr.length === 2 ? (Number(yyStr) >= 70 ? "19"+yyStr : "20"+yyStr) : yyStr);
            const d = new Date(y, Number(mm), dd);
            if (!isNaN(d)) return d;
          }
        }
      }
      return null;
    }
    
    function getStatusFromDueDate(due) {
      const d = parseFlexibleDate(due);
      if (!d) return "";
      const today = new Date();
      today.setHours(0,0,0,0);
      d.setHours(0,0,0,0);
      return (d < today) ? "Expired" : "Active";
    }
    
    function contractUuid() {
      try { return `CONTRACT-${crypto.randomUUID()}`; }
      catch (_) { return `CONTRACT-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
    }

    function contractActorEmail() {
      return String(window.MSW?.auth?.getProfile?.()?.email || "").trim().toLowerCase();
    }

    function recordContractActivity(status, row = {}, detail = "") {
      const item = {
        type: "CONTRACT",
        noPR: String(row?.prNo || "").trim(),
        documentNo: String(row?.coContract || row?.contractName || "").trim(),
        status: String(status || "Updated"),
        detail: String(detail || row?.contractName || row?.companyName || "").trim(),
        timestamp: new Date().toISOString()
      };
      const localItem = window.MSW?.activity?.add ? MSW.activity.add(item) : item;
      // Recent Activity bersifat pendukung. Gagal log tidak boleh membuat transaksi
      // Contract menjadi Pending Sync atau mengganggu penyimpanan utama.
      fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "LOG_ACTIVITY", activity: localItem })
      }).catch(() => {});
      return localItem;
    }

    function emptyRow() {
      const r = {};
      COLUMNS.forEach(c => { if(c.key!=="no") r[c.key] = ""; });
      const now = new Date().toISOString();
      const actor = contractActorEmail();
      r.contractId = contractUuid();
      r.version = 1;
      r.createdAt = now;
      r.createdBy = actor;
      r.updatedAt = now;
      r.updatedBy = actor;
      return r;
    }
    
    function cleanEmptyRows() {
      contractData = contractData.filter(row => {
        const filled = Object.values(row)
          .filter(v => String(v || "").trim() !== "")
          .length;
        return filled > 0; // hanya simpan baris yang punya isi
      });
      
    }

    /* Nomor telepon harus selalu diperlakukan sebagai teks.
       Selain menjaga angka 0 di depan, helper ini juga memperbaiki nomor
       seluler Indonesia yang telanjur dibaca Excel sebagai angka (mis. 811... -> 0811...). */
    function normalizePhoneText(value) {
      if (value === null || value === undefined) return "";

      let text = String(value).trim();
      if (!text) return "";

      // Hilangkan akhiran .0 yang kadang muncul dari hasil baca angka Excel/Sheet.
      text = text.replace(/^(\d+)\.0$/, "$1");

      // Perbaiki setiap nomor seluler Indonesia yang kehilangan 0 awal,
      // termasuk bila dalam satu sel terdapat beberapa nomor dipisahkan ; , atau /.
      text = text.replace(/(^|[^\d+])(8\d{8,12})(?=$|[^\d])/g, (match, prefix, digits) => {
        return `${prefix}0${digits}`;
      });

      return text;
    }

    function normalizeCompanyName(value) {
      return String(value ?? "")
        .replace(/ /g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*/g, ",")
        .trim()
        .toLowerCase();
    }

    function syncVendorPhonesToContracts() {
      if (!Array.isArray(contractData)) return false;

      const phoneByCompany = new Map();
      if (Array.isArray(vendorData)) {
        vendorData.forEach(vendor => {
          const key = normalizeCompanyName(vendor.companyName);
          if (!key) return;
          phoneByCompany.set(key, normalizePhoneText(vendor.companyphone));
        });
      }

      let changed = false;
      contractData.forEach(contract => {
        const key = normalizeCompanyName(contract.companyName);
        const nextPhone = key && phoneByCompany.has(key)
          ? phoneByCompany.get(key)
          : normalizePhoneText(contract.vendorPhone);

        if (contract.vendorPhone !== nextPhone) {
          contract.vendorPhone = nextPhone;
          changed = true;
        }
      });

      if (changed) saveContractCache();
      return changed;
    }
    
    /* ========== Import / Export Excel ========== */
    function humanToKeyMap(h){
      const norm = s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
      const asked = norm(h);
      let best=null,score=-1;
      COLUMNS.forEach(col=>{
        const cand = norm(col.label);
        let s=0; const L=Math.min(cand.length, asked.length);
        for(let i=0;i<L;i++){ if(cand[i]===asked[i]) s++; else break; }
        if(s>score){ score=s; best=col.key; }
      });
      return best;
    }
    
    async function exportExcel(){
      
      showLoading("Generating Excel...");
      setBusy(true);

      await new Promise(resolve =>
          requestAnimationFrame(resolve)
      );

      try {

        if (!Array.isArray(contractData) || contractData.length===0){
          showToast("Tidak ada data untuk diekspor.", "warning");
          return;
        }
        const rows = contractData.map((o, i) => {
          const r = {};
          COLUMNS.forEach(c=>{
            if (c.key === "no") {
              r[c.label] = i + 1;                    // No otomatis
            } else if (c.key === "vendorPhone") {
              r[c.label] = normalizePhoneText(o[c.key]);
            } else {
              r[c.label] = o[c.key] ?? "";
            }
          });
          return r;
        });
      
        const ws = XLSX.utils.json_to_sheet(rows);

        // Paksa seluruh kolom Phone menjadi Text pada file hasil export.
        const phoneColumnIndex = COLUMNS.findIndex(c => c.key === "vendorPhone");
        if (phoneColumnIndex >= 0 && ws["!ref"]) {
          for (let rowNo = 2; rowNo <= rows.length + 1; rowNo++) {
            const address = XLSX.utils.encode_cell({ r: rowNo - 1, c: phoneColumnIndex });
            if (!ws[address]) continue;
            ws[address].t = "s";
            ws[address].v = normalizePhoneText(ws[address].v);
            ws[address].z = "@";
          }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contract");
        const today =
          new Date()
            .toLocaleDateString("id-ID")
            .replace(/\//g,"");

        XLSX.writeFile(
            wb,
            `Contract-${today}.xlsx`
        );

        }

        finally{

            hideLoading();

            setBusy(false);

        }
          
    }
    
    async function importExcel(e){
      if (!canManageContract()) return;
      
      const file = e.target.files?.[0];
      if(!file) return;

      showLoading("Reading Excel...");
      setBusy(true);

      await new Promise(resolve =>
          requestAnimationFrame(resolve)
      );

      const reader = new FileReader();

      reader.onload = async (evt) => {

        try {
        
          const wb = XLSX.read(new Uint8Array(evt.target.result), { type:"array" });

          const sheet = wb.Sheets[wb.SheetNames[0]];

          // raw:false memakai nilai tampilan Excel (cell.w), sehingga format
          // seperti 08115001141 tidak kehilangan angka 0 di depan.
          const raw = XLSX.utils.sheet_to_json(sheet, { defval:"", raw:false });

          document.getElementById("loadingText").textContent =
          "Formatting Data...";

          // IMPORT EXCEL AKAN MENGGANTI SELURUH DATA CONTRACT
          contractData = mapExcelRows(raw);
          // Phone di Detail Contract selalu mengikuti Company Phone master Vendor Company.
          syncVendorPhonesToContracts();

          saveContractCache()

          document.getElementById("loadingText").textContent =
          "Saving to Google Sheet...";
          
          const ok = await saveToGoogleSheet(false);

            if (ok) {
              renderTable();
              recordContractActivity("Import Excel", {}, `${contractData.length} data Contract diimport dari ${file.name}`);
              showToast("✅ Data Excel berhasil diimpor, diformat, dan disimpan ke Google Sheet.", "success");
            
            }
        } 
        finally {

            hideLoading();

            setBusy(false);

            e.target.value = "";

        }
      };

      reader.onerror = () => {

          hideLoading();

          setBusy(false);

          showToast("Gagal membaca file Excel.", "error");

          e.target.value = "";

      };
      
      reader.readAsArrayBuffer(file);
    }


    /* ========== Backend Auto Sync ========== */


    /* ========== FILTER DROPDOWN SEPERTI EXCEL ========== */
    const COLUMN_FILTER_STORAGE_KEY = "detailContractExcelColumnFilters";
    let columnFilters = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(COLUMN_FILTER_STORAGE_KEY) || "{}");
        return Object.fromEntries(Object.entries(saved || {}).filter(([, v]) => Array.isArray(v)));
      } catch (_) { return {}; }
    })();
    let activeColumnFilterMenu = null;

    function getColumnFilterSourceRows() {
      return (contractData || []).map((row, index) => ({ ...row, __realIndex: row?.__realIndex ?? index }));
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

    function isSearchActive() {
      const el = document.getElementById("searchInput");
      return Boolean((el && el.value.trim() !== "") || hasActiveColumnFilters());
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

          const isActualDateKey = k === "signDate" || k === "dueDate" || k === "courierDeliveryDate";

          if (isActualDateKey) {
            v = formatTanggalIndonesia(v);
          } else if (k === "vendorPhone") {
            v = normalizePhoneText(v);
          } else if (hl.includes("cost") || hl.includes("price") || hl.includes("idr") || hl.includes("rp")) {
            const n = Number(String(v).replace(/[^\d.-]/g, ""));
            v = isNaN(n) ? v : n.toLocaleString("id-ID");
          }

          if (isEmptyish(v)) return;
          obj[k] = v;
          filled = true;
        });

        if (filled) acc.push(obj);
        return acc;
      }, []);

      return mapped;
    }

    async function loadFromGoogleSheet(force = false) {
      try {
        
        if (editingRows.size > 0) return;
        
        const res = await fetch(`${GAS_URL}?sheet=${SHEET_NAME}`, { cache: "no-store" });
        
        const data = await res.json();

        if (data?.success === false) {
          const message = data.message || "Gagal memuat Contract Management.";
          console.warn(message);
          showToast(message, "error");
          return;
        }

        if (!data || !Array.isArray(data.rows)) {
          console.warn("Response Contract Management tidak valid");
          showToast("Response Contract Management tidak valid.", "error");
          return;
        }

        if (!force && data.mtimeMs === lastSheetMtime) return;

        lastSheetMtime = data.mtimeMs;
        lastSheetRevision = data.revision == null ? lastSheetRevision : Number(data.revision);
        
        contractData = (data.rows || []).map(r => ({
          contractName: r["Contract Name"] || "",
          companyName: r["Company Name"] || "",

          signDate: formatTanggalIndonesia(
            r["Date Sign/Efektif Date"]
          ),

          dueDate: formatTanggalIndonesia(
            r["Due Date"]
          ),
          
          contractCost: r["Cost Contract/Est.Cost Contract"] || "",
          vendorContact: r["Contact Person Vendor"] || "",
          vendorPhone: normalizePhoneText(r["Phone"]),
          addressSent: r["Address Sent Contract"] || "",
          prNo: r["PR No"] || "",
          estCost: r["Est Cost"] || "",
          picUser: r["PIC User"] || "",
          picEmail: r["Email PIC User"] || "",
          letterNo: r["Letter No"] || "",
          coContract: r["No Contract"] || "",

          courierDeliveryDate: formatTanggalIndonesia(
            r["Date Del via Kurir"]
          ),
          contractId: r["Contract ID"] || contractUuid(),
          version: Number(r["Version"] || 1),
          createdAt: r["Created At"] || "",
          createdBy: r["Created By"] || "",
          updatedAt: r["Updated At"] || "",
          updatedBy: r["Updated By"] || ""
        }));

        // Timpa Phone dari Contract dengan Company Phone master Vendor Company.
        // Ini sekaligus memperbaiki data lama yang sudah kehilangan 0 awal.
        syncVendorPhonesToContracts();
        
        // Simpan data terbaru ke LocalStorage
        saveContractCache()

        if (isSearchActive()) {

            filterTable();

        } else {

            renderTable();

        }

      } catch (err) {
        
        console.warn("Gagal membaca Google Sheet:", err);
        
      }
    }

    /* ========== Load data Vendor (Company) untuk dropdown & auto-fill ========== */
    async function loadVendorData(force = false) {
      try {
        const res = await fetch(`${GAS_URL}?sheet=${VENDOR_SHEET_NAME}`, { cache: "no-store" });
        const data = await res.json();

        if (!data || !data.rows) {
          console.warn("Data Vendor (Company) kosong dari Google Sheet");
          return;
        }

        if (!force && data.mtimeMs === lastVendorMtime) return;

        lastVendorMtime = data.mtimeMs;

        vendorData = (data.rows || []).map(r => ({
          companyName: r["Company Name"] || "",
          customercontact: r["Customer Contact"] || "",
          companyphone: normalizePhoneText(r["Company Phone"]),
          address: r["Address Company"] || "",
        })).filter(v => v.companyName.trim() !== "");

        // Jika master vendor berubah, perbarui tampilan Phone di Contract juga.
        if (syncVendorPhonesToContracts()) {
          if (isSearchActive()) filterTable();
          else renderTable();
        }

      } catch (err) {

        console.warn("Gagal membaca data Vendor (Company):", err);

      }
    }

    function getVendorByName(name) {
      if (!name) return null;
      const target = normalizeCompanyName(name);
      return vendorData.find(v => normalizeCompanyName(v.companyName) === target) || null;
    }

    // Saat Company Name dipilih dari dropdown: isi otomatis Contact Person Vendor, Phone, Address Sent Contract
    function applyCompanySelection(rowIndex, companyName, tr) {

      contractData[rowIndex].companyName = companyName;

      const vendor = getVendorByName(companyName);

      const contactTd = tr.querySelector('td[data-key="vendorContact"]');

      const phoneTd   = tr.querySelector('td[data-key="vendorPhone"]');

      const addressTd = tr.querySelector('td[data-key="addressSent"]');

      const contactVal = vendor ? vendor.customercontact : "";

      const phoneVal   = vendor ? normalizePhoneText(vendor.companyphone) : "";

      const addressVal = vendor ? vendor.address        : "";


      contractData[rowIndex].vendorContact = contactVal;
      contractData[rowIndex].vendorPhone   = phoneVal;
      contractData[rowIndex].addressSent   = addressVal;

      if (contactTd) contactTd.textContent = contactVal === "" ? "" : contactVal;
      if (phoneTd)   phoneTd.textContent   = phoneVal   === "" ? "" : phoneVal;
      if (addressTd) addressTd.textContent = addressVal === "" ? "" : addressVal;
    }

    // Tutup semua panel dropdown Company Name yang masih terbuka, kecuali yang dikecualikan
    function closeAllCompanyPanels(exceptPanel = null) {
      document.querySelectorAll(".company-name-panel").forEach(p => {
        if (p !== exceptPanel) { p.classList.add("hidden"); p.remove(); }
      });
    }
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".company-name-wrapper") && !e.target.closest(".company-name-panel")) {
        closeAllCompanyPanels();
      }
    });

    // Tutup dropdown Company Name saat tabel di-scroll
    document.addEventListener("DOMContentLoaded", () => {
        const container = document.querySelector(".scroll-container");

        if (container) {
            container.addEventListener("scroll", () => {
                closeAllCompanyPanels();
            });
        }
    });

    // Membangun dropdown custom (dengan search box) untuk Company Name di dalam sel td
    function buildCompanyNameDropdown(td, row, rowIndex) {
      const currentVal = row.companyName || "";

      const namesSorted = [...vendorData]
        .map(v => v.companyName)
        .sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));

      const namesInList = new Set(namesSorted);
      const allOptions = ["- Pilih Company -", ...namesSorted];

      // Jika nilai tersimpan tidak ada di daftar vendor (data lama/custom), tetap tampilkan supaya tidak hilang
      if (currentVal && !namesInList.has(currentVal)) {
        allOptions.push(`${currentVal} (tidak ada di Vendor Company)`);
      }

      const wrapper = document.createElement("div");
      wrapper.className = "relative text-left company-name-wrapper";

      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "w-full border border-gray-300 rounded px-2 py-1 bg-white text-left text-xs truncate";
      toggleBtn.textContent = currentVal ? currentVal : "- Pilih Company -";

      let panel = null; // dibuat dinamis saat tombol diklik, di-append ke document.body

      function positionPanel() {
          if (!panel) return;

          const rect = toggleBtn.getBoundingClientRect();

          // tinggi header
          const headerBottom =
              document.querySelector("thead").getBoundingClientRect().bottom;

          // jika tombol sudah masuk area header, tutup panel
          if (rect.top < headerBottom) {
              destroyPanel();
              return;
          }

          const panelWidth = 256;

          let left = rect.left;

          if (left + panelWidth > window.innerWidth - 8) {
              left = Math.max(8, window.innerWidth - panelWidth - 8);
          }

          let top = rect.bottom + 4;

          const estimatedPanelHeight = 260;

          if (top + estimatedPanelHeight > window.innerHeight - 8) {
              top = Math.max(8, rect.top - estimatedPanelHeight - 4);
          }

          panel.style.left = left + "px";
          panel.style.top = top + "px";
      }

      function destroyPanel() {
        if (panel) { panel.remove(); panel = null; }
        document.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
      }

      function onScrollOrResize() { positionPanel(); }

      function openPanel() {
        closeAllCompanyPanels();

        panel = document.createElement("div");
        panel.className = "fixed w-64 max-h-64 overflow-y-auto bg-white border rounded-lg shadow-2xl text-left company-name-panel";
        panel.style.zIndex = "9999";

        const searchBox = document.createElement("input");
        searchBox.type = "text";
        searchBox.placeholder = "Cari company...";
        searchBox.className = "w-full border-b p-2 text-xs sticky top-0 bg-white";
        panel.appendChild(searchBox);

        const listWrap = document.createElement("div");
        panel.appendChild(listWrap);

        allOptions.forEach(optName => {
          const item = document.createElement("div");
          item.className = "px-3 py-1.5 hover:bg-gray-100 cursor-pointer text-xs whitespace-nowrap";
          item.textContent = optName;

          item.addEventListener("click", () => {
            const isPlaceholder = optName === "- Pilih Company -";
            const isMissingTag = optName.endsWith("(tidak ada di Vendor Company)");
            const realValue = isPlaceholder
              ? ""
              : (isMissingTag ? currentVal : optName);

            toggleBtn.textContent = realValue ? realValue : "- Pilih Company -";

            const tr = td.closest("tr");
            applyCompanySelection(rowIndex, realValue, tr);

            destroyPanel();
          });

          listWrap.appendChild(item);
        });

        searchBox.addEventListener("click", (e) => e.stopPropagation());
        searchBox.addEventListener("input", () => {
          const q = searchBox.value.toLowerCase();
          listWrap.querySelectorAll("div").forEach(div => {
            div.style.display = div.textContent.toLowerCase().includes(q) ? "block" : "none";
          });
        });

        document.body.appendChild(panel);
        positionPanel();
        searchBox.focus();

        // Reposisi saat scroll (termasuk scroll di dalam .scroll-container) atau resize window
        document.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
      }

      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (panel) {
          destroyPanel();
        } else {
          openPanel();
        }
      });

      wrapper.appendChild(toggleBtn);

      td.innerHTML = "";
      td.appendChild(wrapper);
    }

    async function saveToGoogleSheet(showOverlay = true) {
      if (!canManageContract()) return false;

      if(showOverlay){

          showLoading("Saving Contract...");

          setBusy(true);

          await new Promise(resolve =>
              requestAnimationFrame(resolve)
          );

      }
      
      try {

        if (!Array.isArray(contractData)) {
          showToast("Data tidak ditemukan.", "error");
          return false;
        }

        cleanEmptyRows();

        const actor = contractActorEmail();
        const now = new Date().toISOString();
        const rowsForSheet = contractData.map(r => {
          r.contractId = r.contractId || contractUuid();
          r.version = Math.max(1, Number(r.version || 0) + 1);
          r.createdAt = r.createdAt || now;
          r.createdBy = r.createdBy || actor;
          r.updatedAt = now;
          r.updatedBy = actor;
          return {
            "Contract ID": r.contractId,
            "Contract Name": r.contractName || "",
            "Company Name": r.companyName || "",
            "Date Sign/Efektif Date": r.signDate || "",
            "Due Date": r.dueDate || "",
            "Cost Contract/Est.Cost Contract": r.contractCost || "",
            "Contact Person Vendor": r.vendorContact || "",
            "Phone": normalizePhoneText(r.vendorPhone),
            "Address Sent Contract": r.addressSent || "",
            "PR No": r.prNo || "",
            "Est Cost": r.estCost || "",
            "PIC User": r.picUser || "",
            "Email PIC User": r.picEmail || "",
            "Letter No": r.letterNo || "",
            "No Contract": r.coContract || "",
            "Date Del via Kurir": r.courierDeliveryDate || "",
            "Version": r.version,
            "Created At": r.createdAt,
            "Created By": r.createdBy,
            "Updated At": r.updatedAt,
            "Updated By": r.updatedBy
          };
        });

        const res = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "REPLACE_CONTRACTS",
            sheet: SHEET_NAME,
            rows: rowsForSheet,
            expectedRevision: lastSheetRevision
          })
        });

        const txt = await res.text();
        let result;
        try { result = JSON.parse(txt); }
        catch (_) { throw new Error("Google Apps Script mengembalikan respons yang tidak valid."); }

        if (!result?.success) {
          if (result?.conflict) {
            throw new Error(result.message || "Data Contract berubah di perangkat lain. Muat ulang sebelum menyimpan.");
          }
          throw new Error(result?.message || "Contract gagal disimpan.");
        }
        if (!result.queued && result.revision != null) lastSheetRevision = Number(result.revision);
        saveContractCache();
        if (result.queued || result.pendingSync) {
          showToast("Perubahan Contract disimpan di cache dan menunggu sinkronisasi.", "warning");
        }
        return true;

      } catch(err) {

        console.error(err);

        if(confirm(
        "Save gagal.\n\nRetry?"
        )){

            return await saveToGoogleSheet();

        }

        return false;

      }

      finally{

          if(showOverlay){

              hideLoading();

              setBusy(false);

          }

      }
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

    /* ========== Actions ========== */

    function saveContractCache() {

        MSW.cache.save(
            CONTRACT_CACHE_KEY,
            contractData
        );

    }

    function buildContractQueue(index) {

        const oldRow = originalRows[index];

        const newRow = contractData[index];

        if (!oldRow || !newRow) return [];

        const changes = [];

        COLUMNS.forEach(col => {

            const key = col.key;

            if (
                key === "no" ||
                key === "latestUpdate"
            ) return;

            const oldValue = String(oldRow[key] ?? "").trim();

            const newValue = String(newRow[key] ?? "").trim();

            if (oldValue !== newValue) {

                changes.push({

                    module: "CONTRACT",

                    type: "UPDATE_CELL",

                    rowIndex: index,

                    field: key,

                    oldValue,

                    newValue

                });

            }

        });

        return changes;

    }

    function handleAdd(){
      if (!canManageContract()) return;

        const row = emptyRow();

        contractData.push(row);

        saveContractCache()

        const newIndex = contractData.length - 1;

        if (isSearchActive()) {
            document.getElementById("searchInput").value = "";
        }

        editingRows.add(newIndex);

        newRows.add(newIndex);

        renderTable();

        MSW.table.afterAdd();

        const tr = document.querySelectorAll("#tableBody tr")[newIndex];

        if(tr){

            const first = tr.querySelector(
                "td[data-key]:not([data-key='latestUpdate']):not([data-key='no'])"
            );

            if(first) first.focus();

        }

    }
    
    function toggleRowEdit(index, focusKey = null){
      if (!canManageContract()) return;

        if(!editingRows.has(index)){

            originalRows[index] = JSON.parse(
                JSON.stringify(contractData[index])
            );

            editingRows.add(index);

        }

        if (isSearchActive()) {

            filterTable();

        } else {

            renderTable();

        }

        requestAnimationFrame(() => {

            const tr = document.querySelector(
                `#tableBody tr[data-index="${index}"]`
            );

            if (!tr) return;

            let target = null;

            if (focusKey) {

                const td = tr.querySelector(
                    `td[data-key="${focusKey}"]`
                );

                if (td) {

                    target =
                        td.querySelector("input,button,select") ||
                        td;

                }

            }

            if (!target) {

                target = tr.querySelector(
                    "button,input,select,[contenteditable='true']"
                );

            }

            if (target) {

                target.focus();

            }

        });

    }
    
    const savingRows = new Set();

    async function saveRow(index) {
      if (!canManageContract()) return;
      if (savingRows.has(index)) return;
      const wasNew = newRows.has(index);
      savingRows.add(index);
      try {
        const tr = document.querySelector(
            `#tableBody tr[data-index="${index}"]`
        );
        if (!tr) return;

        tr.querySelectorAll("td[data-key]").forEach(td => {
            const k = td.dataset.key;
            if (
                k === "latestUpdate" ||
                k === "no"
            ) return;
            if (
                k === "signDate" ||
                k === "dueDate" ||
                k === "courierDeliveryDate"
            ) {
                const input =
                    td.querySelector("input[type='date']");
                contractData[index][k] =
                    input && input.value
                        ? formatTanggalIndonesia(input.value)
                        : "";
            }

            else if (
                k === "companyName"
            ) {

                // sudah di-update oleh applyCompanySelection()

            }

            else if (
                k === "vendorContact" ||
                k === "vendorPhone" ||
                k === "addressSent"
            ) {

                // sudah di-update otomatis

            }

            else {

                contractData[index][k] =
                    td.textContent.trim() === ""
                        ? ""
                        : td.textContent.trim();

            }

        });

        // Pastikan Phone tetap mengikuti Company Phone master Vendor Company.
        syncVendorPhonesToContracts();

        // Simpan perubahan ke cache
        saveContractCache();

        // Bangun daftar perubahan
        const changes = buildContractQueue(index);

        console.log("CHANGES");
        console.table(changes);

        // Masukkan ke Queue
        changes.forEach(change => {

            console.log("QUEUE ADD");
            console.log(change);

            MSW.queue.add(change);

        });

        console.log("QUEUE");
        console.table(MSW.queue.get());

        // Tetap pakai cara lama dulu
        const ok = await saveToGoogleSheet();

        if (ok) {

            recordContractActivity(wasNew ? "Added" : "Updated", contractData[index]);

            delete originalRows[index];

            newRows.delete(index);

            editingRows.delete(index);

            if (isSearchActive()) {

                filterTable();

            } else {

                renderTable();

            }
          
        }

    } finally {

       savingRows.delete(index);

    }
    }
    
    function cancelRow(index){

        // Jika row baru hasil Add
        if(newRows.has(index)){

            contractData.splice(index,1);

            newRows.delete(index);

        }

        // Jika row lama sedang diedit
        else if(originalRows[index]){

          contractData[index] = JSON.parse(
          JSON.stringify(originalRows[index])
          
        );

          delete originalRows[index];

        }

        editingRows.delete(index);

        saveContractCache()

        if (isSearchActive()) {

          filterTable();

        } else {

          renderTable();

        }

    }

    async function handleDelete(i){
      if (isBuyerContractViewOnly()) return;
      if (!canManageContract()) return;


      if (!confirm("Hapus baris ini?")) return;

      const deletedRow = contractData[i] ? JSON.parse(JSON.stringify(contractData[i])) : {};
      contractData.splice(i,1);

      saveContractCache()

      const ok = await saveToGoogleSheet();

      if (ok) {

        recordContractActivity("Deleted", deletedRow);

        if (isSearchActive()) {
            filterTable();
        } else {
            renderTable();
        }
      }

    }
    
    let contextMenuRowIndex = -1;
    function hideRowContextMenu(){
      const menu = document.getElementById("rowContextMenu");
      if (!menu) return;
      menu.classList.add("hidden"); menu.setAttribute("aria-hidden","true");
      document.querySelectorAll("#tableBody tr.context-row-active").forEach(r=>r.classList.remove("context-row-active"));
      contextMenuRowIndex = -1;
    }
    function showRowContextMenu(event, rowIndex, tr){
      if (isBuyerContractViewOnly() || !canManageContract()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        hideRowContextMenu();
        return;
      }
      const menu=document.getElementById("rowContextMenu"); if(!menu||!contractData[rowIndex]) return;
      event.preventDefault(); hideRowContextMenu(); contextMenuRowIndex=rowIndex; tr.classList.add("context-row-active");
      menu.classList.remove("hidden"); menu.setAttribute("aria-hidden","false");
      const left=Math.min(event.clientX,innerWidth-200), top=Math.min(event.clientY,innerHeight-55);
      menu.style.left=Math.max(8,left)+"px"; menu.style.top=Math.max(8,top)+"px";
    }
    function initRowContextMenu(){
      document.getElementById("contextDeleteBtn")?.addEventListener("click",async()=>{const i=contextMenuRowIndex;hideRowContextMenu();await handleDelete(i)});
      document.addEventListener("click",e=>{if(!e.target.closest("#rowContextMenu"))hideRowContextMenu()});
      document.addEventListener("scroll",hideRowContextMenu,true); addEventListener("resize",hideRowContextMenu);
      document.addEventListener("keydown",e=>{if(e.key==="Escape")hideRowContextMenu()});
    }

    function filterTable(){
        
        const q =
            document
            .getElementById("searchInput")
            .value
            .toLowerCase();

        const f =
            contractData
            .map((row,index)=>({

                ...row,

                __realIndex:index

            }))
            .filter(row=>{

                if (!matchesColumnFilters(row)) return false;

                const status =
                    getStatusFromDueDate(row.dueDate)
                    .toLowerCase();

                const otherMatch =
                    COLUMNS.some(c=>

                        c.key!=="latestUpdate" &&
                        c.key!=="no" &&

                        String(row[c.key]||"")
                        .toLowerCase()
                        .includes(q)

                    );

                return otherMatch || status.includes(q);

            });

        renderTable(f);

    }
    
    async function clearAll(){
      if (!canManageContract()) return;

      if (!confirm("Hapus semua data?")) return;

      const clearedCount = contractData.length;
      contractData = [];

      saveContractCache()

      editingRows.clear();

      newRows.clear();
      
      Object.keys(originalRows).forEach(k => delete originalRows[k]);

      const ok = await saveToGoogleSheet();

      if (ok) {

        recordContractActivity("All Clear", {}, `${clearedCount} data Contract dihapus`);

        if (isSearchActive()) {

            filterTable();

        } else {

            renderTable();

        }
        
        showToast("Semua data berhasil dihapus.", "success");
      
      }

    }
    
    /* ========== Render ========== */
    function renderHeader(){
      const tr = document.getElementById("theadRow");
      const displayColumns = COLUMNS;
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

    function renderTable(data = contractData){
      closeAllCompanyPanels();
      renderHeader();
      const tbody = document.getElementById("tableBody");
      tbody.innerHTML="";
      data.forEach((row,idx)=>{
        const realIndex =
            row.__realIndex ?? idx;            
        const tr = document.createElement("tr");
        tr.dataset.index = realIndex;
        tr.addEventListener("contextmenu", event => {
          if (isBuyerContractViewOnly()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            hideRowContextMenu();
            return;
          }
          showRowContextMenu(event, realIndex, tr);
        });
        tr.ondblclick = async (e) => {
            if (!canManageContract()) return;
            if (
                e.target.closest("button") ||
                e.target.closest("input") ||
                e.target.closest("select")
            ) return;
            // Ambil cell yang diklik
            const td = e.target.closest("td");

            const columnKey = td ? td.dataset.key : null;

            if (editingRows.has(realIndex)) {
                await saveRow(realIndex);
            } else {
                toggleRowEdit(realIndex, columnKey);
            }
        };    
        COLUMNS.forEach((col, i)=>{
          const td = document.createElement("td");
          td.className = "px-3 py-2 border";
          td.dataset.key = col.key;
          let cellValue = row[col.key]    
          if (col.key === "no") {
            td.textContent = idx + 1; // Nomor otomatis
            td.contentEditable = "false";
            td.style.backgroundColor = "#f9fafb";
          }
          else if (col.key === "latestUpdate") {
            const status = getStatusFromDueDate(row.dueDate);
            td.innerHTML =
              status === "Expired" ? `<span class="status-expired">${status}</span>` :
              status === "Active"  ? `<span class="status-active">${status}</span>`  :
              "";              
          } else if (
              col.key === "companyName" &&
              editingRows.has(realIndex)
          ) {
              buildCompanyNameDropdown(
                  td,
                  row,
                  realIndex
              );
          } else if (
            (col.key === "vendorContact" || col.key === "vendorPhone" || col.key === "addressSent")
          ) {
            // Kolom ini diambil otomatis dari Vendor Company (mengikuti Company Name), tidak diedit manual
            td.contentEditable = "false";
            if (editingRows.has(realIndex))
              td.style.backgroundColor="#f3f4f6";
            td.textContent =
              cellValue === null ||
              cellValue === undefined ||
              String(cellValue).trim() === ""
                ? ""
                : cellValue;
          } else {                        
            const isDateField =
              col.key === "signDate" ||
              col.key === "dueDate" ||
	            col.key === "courierDeliveryDate";            
            td.contentEditable =
            (
                editingRows.has(realIndex) &&
                col.key !== "latestUpdate" &&
                col.key !== "no"
            )
            ? "true"
            : "false";            
            if (
                isDateField &&
                editingRows.has(realIndex)
            ) {
              let dateValue = "";
              if (cellValue) {
                const d = parseFlexibleDate(cellValue);
                if (d && !isNaN(d)) {
                  // Hindari masalah timezone: bangun string YYYY-MM-DD manual
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  dateValue = `${yyyy}-${mm}-${dd}`;
                }
              }
              td.innerHTML = `
                <input
                  type="date"
                  value="${dateValue}"
                  class="w-full border rounded px-1 py-1 text-center"
                >
              `;
            }
            else {
              td.textContent =
                cellValue === null ||
                cellValue === undefined ||
                String(cellValue).trim() === "" ||
                cellValue === 0 ||
                String(cellValue).trim() === "0"
                  ? ""
                  : cellValue;
            }
        }
        tr.appendChild(td);          
      });
       
        tbody.appendChild(tr);
        if (editingRows.has(realIndex)) {
            tr.querySelectorAll(
                "[contenteditable='true'], input, button, select"
            ).forEach(el => {
                el.addEventListener("keydown", async (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        await saveRow(realIndex);
                    }
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRow(realIndex);
                    }
                });
            });

            // Khusus input tanggal: saat memakai kalender popup bawaan
            // browser, tombol Enter untuk menutup kalender ditangani
            // oleh UI popup itu sendiri dan TIDAK sampai ke keydown
            // listener di atas — sehingga saveRow() tidak pernah
            // terpanggil. Event 'change' di sini menangkap perubahan
            // nilai tanggal apa pun caranya (klik kalender, ketik
            // manual, dsb.) dan tetap memicu simpan.
            tr.querySelectorAll("input[type='date']").forEach(dateInput => {
                dateInput.addEventListener("change", async () => {
                    await saveRow(realIndex);
                });
            });
        }
      });
    
    }
      
    window.addEventListener("load", async () => {

        initRowContextMenu();
        // Buyer adalah View Only, tetapi tetap WAJIB memuat data Contract.
        // Permission manage hanya digunakan untuk memblokir mutasi, bukan read/load.
        applyBuyerViewOnlyUI();

        try {
            const savedSearch = localStorage.getItem(CONTRACT_SEARCH_STATE_KEY) || "";
            const searchInput = document.getElementById("searchInput");
            if (searchInput && savedSearch) searchInput.value = savedSearch;
        } catch (_) {}

        showLoading("Loading Contract Management...");

        setBusy(true);

        // =============================
        // Load dari Cache dahulu
        // =============================

        const cache = MSW.cache.load(CONTRACT_CACHE_KEY);

        if (cache && Array.isArray(cache)) {

            contractData = cache.map(row => ({
              ...row,
              vendorPhone: normalizePhoneText(row?.vendorPhone)
            }));

            renderTable();

        }
        
        // =============================
        // Baru ambil Vendor
        // =============================
        await loadVendorData(true);
        
        // =============================
        // Baru sinkron Google Sheet
        // =============================
        await loadFromGoogleSheet(true);

        hideLoading();

        setBusy(false);

    });

    setInterval(() => loadFromGoogleSheet(false), 60000);
    setInterval(() => loadVendorData(false), 60000);
const MSW_ROLE_MODULE = "detailContract";


/* ========== ROLE ACCESS: BUYER VIEW ONLY ========== */
function applyBuyerViewOnlyUI() {
  const isViewOnly = window.MSW?.auth?.isViewOnlyModule(MSW_ROLE_MODULE);
  if (!isViewOnly) return;
  document.body.classList.add("msw-view-only");
  const actionDropdown = document.getElementById("actionDropdown");
  if (actionDropdown) actionDropdown.style.display = "";
  MSW.auth.addRoleBanner("Buyer — View Only. Search, filter, freeze, scroll, dan export tetap tersedia.");

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
    document.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute("contenteditable", "false"));
    const menu = document.getElementById("rowContextMenu");
    if (menu) menu.style.display = "none";
  };

  // Cegah event mencapai handler edit/delete pada baris Contract.
  if (!document.body.dataset.buyerRowActionsBlocked) {
    document.body.dataset.buyerRowActionsBlocked = "true";
    ["dblclick", "contextmenu"].forEach(eventName => {
      document.addEventListener(eventName, event => {
        if (!event.target.closest("#tableBody tr[data-index]")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        hideRowContextMenu();
      }, true);
    });
  }

  hideMutationControls();
  new MutationObserver(hideMutationControls).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["contenteditable"]});
}
window.addEventListener("load", applyBuyerViewOnlyUI);
