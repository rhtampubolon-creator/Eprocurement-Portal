/* ======================================================
   MODULE ACCESS GUARD
   Procurement hanya untuk Buyer dan Super Admin.
====================================================== */
const MSW_PROCUREMENT_MODULE_ALLOWED = Boolean(
  window.MSW?.auth?.canAccessModule?.("procurementAdmin")
);

if (!MSW_PROCUREMENT_MODULE_ALLOWED) {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a">
      <section style="max-width:560px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px;box-shadow:0 12px 30px rgba(15,23,42,.08)">
        <h1 style="margin:0 0 10px;font-size:24px">Access Denied</h1>
        <p style="margin:0;color:#475569;line-height:1.6">Procurement tidak tersedia untuk akun Procurement Admin.</p>
      </section>
    </main>`;
} else {
    /* ========== ADMIN PROCUREMENT JS ========== */
    
    /* ========== Kolom (atur width di sini) ========== */
    const COLUMNS = [
      { key: "no",                label: "No",                      	width: "100px" },
      { key: "noPR",              label: "No PR",                   	width: "200px" },
      { key: "Description",       label: "Description",             	width: "250px" },
      { key: "previoussubmitpo",  label: "Previous Submit PO",      	width: "300px" },
      { key: "finalvendorlist",   label: "Final Vendor List",       	width: "300px" },
      { key: "finalsubmitvendor", label: "Final Submit Vendor",     	width: "300px" },
      { key: "statusrebid",       label: "Status Rebid",            	width: "100px" },
      { key: "pic",               label: "PIC",                     	width: "200px" },
      { key: "assignprdate",      label: "Assign Date",                	width: "120px" },
      { key: "departement",       label: "Departement",             	width: "100px" },
      { key: "pengadaan",         label: "Pengadaan",               	width: "100px" },
      { key: "statuspr",          label: "Status PR",               	width: "100px" },
      { key: "rfq",               label: "RFQ",                     	width: "100px" },

      { key: "estpricerp",        label: "Est. Price PR",           	width: "100px" },
      { key: "estpriceus",        label: "Est. Price US - Rp",      	width: "150px" },
      { key: "flowprocess",       label: "Flow Process",            	width: "150px" },
      { key: "roundpo",           label: "Round PR",                  width: "100px" },  
      { key: "roundcompany",      label: "Company Name",              width: "300px" },
      { key: "roundsubmitcompany",  label: "Submit Company",          width: "300px" },
      { key: "roundstartdate",    label: "Start Date",                width: "120px" },
      { key: "roundfinishdate",   label: "Finish Date",               width: "120px" },
      { key: "winnerpo",          label: "Winner PO",               	width: "300px" },
      { key: "emailwinnerpo",     label: "Email Winner PO",         	width: "300px" },
      { key: "nopo",              label: "No PO",                   	width: "150px" },
      { key: "pricerp",           label: "Price (Rp) Excl. PPn",    	width: "150px" },
      { key: "cqscreatedate",     label: "CQS Create Date",           width: "120px" },
      { key: "cqsapprovaldate",   label: "CQS Approval Date",         width: "120px" },
      { key: "pocreatedate",      label: "PO Create Date",            width: "120px" },
      { key: "podeldate",         label: "PO Del. Date",            	width: "120px" },
      { key: "actualporeleasedate",   label: "Actual PO Rel. Date",  width: "120px" },
      { key: "actualpodeldate",   label: "Actual PO Del. Date",     	width: "120px" },
      { key: "days",              label: "Days Calendar (Days)",    	width: "120px" },
      { key: "actualreceivedpo",  label: "Actual Received PO (GRN Date)",      	width: "120px" },

      { key: "folderid",   label: "Folder ID",   width: "180px" },
      { key: "folderlink", label: "Folder LINK", width: "250px" },
    ];
    
    // ✅ Tambahkan kode ini persis DI BAWAH daftar COLUMNS
    const DATE_KEYS = [
      "assignprdate",
      "roundstartdate", 
      "roundfinishdate",
      "cqscreatedate", 
      "cqsapprovaldate",
      "pocreatedate", 
      "podeldate",
      "actualporeleasedate",
      "actualpodeldate",
      "actualreceivedpo", 
    ];

    // ✅ Kolom harga yang perlu diformat ribuan Indonesia (mis. 6.500) saat ditampilkan di tabel.
    // Nilai ASLI yang tersimpan di procurementAdmin/Sheet tetap angka murni, ini cuma untuk tampilan.
    const CURRENCY_KEYS = [
      "estpricerp",
      "estpriceus",
      "pricerp",
    ];

    const MULTILINE_KEYS = [
      "previoussubmitpo",
      "finalvendorlist",
      "finalsubmitvendor",
      
      "roundcompany",
      "roundsubmitcompany",
      "statusrebid",

      "r0company",
      "r0submitcompany",

      "r1company",
      "r1submitcompany",

      "r2company",
      "r2submitcompany",

      "r3company",
      "r3submitcompany",

      "r4company",
      "r4submitcompany",

      "r5company",
      "r5submitcompany",

      "winnerpo"
    ];

    /* ========== State ========== */
    let procurementAdmin = [];
    let companyData = [];
    let isEditing = false;
    let originalRow = null;
    let lastExcelMtime = null;
    let ADMIN_SHEET_REVISION = null;
    let isImporting = false;
    const PROCUREMENT_ADMIN_VIEW_ONLY = MSW.auth.isViewOnlyModule("procurementAdmin");
    // Pertahankan perilaku tabel asli: perubahan data dilakukan melalui form/action,
    // bukan edit langsung pada sel tabel.
    const VIEW_ONLY = true;

    function blockProcurementAdminMutation() {
      if (!PROCUREMENT_ADMIN_VIEW_ONLY) return false;
      MSW.auth.showViewOnlyMessage();
      return true;
    }
    const IMPORT_PRESERVE_FLAG = "__preserveImportFormat";

    function shouldPreserveImportedFormat(row) {
      return Boolean(row && row[IMPORT_PRESERVE_FLAG] === true);
    }

    function valueForSheet(value) {
      return value === undefined || value === null ? "" : value;
    }

    const ROUND_OPTIONS = ["R0", "R1", "R2", "R3", "R4", "R5"];
    const ROUND_LIST = ["R0","R1","R2","R3","R4","R5"];

    const PROCUREMENT_FOLDER_TYPES = [
      "01. PR Approval",
      "02. Bidderlist",
      "03. CQS",
      "04. PO",
      "05. Contract"
    ];

    function getRoundsForFolderStructure(row) {
      const latest = normalizeRoundValue(row?.roundpo) || detectLatestRound(row || {});
      const latestIndex = Math.max(0, ROUND_LIST.indexOf(latest));
      const rounds = ROUND_LIST.slice(0, latestIndex + 1);

      ROUND_LIST.forEach(round => {
        const key = round.toLowerCase();
        const hasData = [
          row?.[`${key}company`], row?.[`${key}submitcompany`],
          row?.[`${key}startdate`], row?.[`${key}finishdate`]
        ].some(value => String(value ?? "").trim() !== "");
        if (hasData && !rounds.includes(round)) rounds.push(round);
      });

      return rounds.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    }

    function normalizeRoundValue(value) {
      const match = String(value || "").trim().toUpperCase().match(/R\s*([0-5])/);
      return match ? `R${match[1]}` : "";
    }

    function detectLatestRound(row) {
      let latestIndex = -1;

      // Status Rebid adalah data sumber tersendiri dan tidak boleh dipakai
      // untuk menentukan Round PR. Round aktif hanya dibaca dari Round PR
      // atau data R0-R5 yang benar-benar terisi.
      const declaredRound = normalizeRoundValue(row?.roundpo);
      if (declaredRound) latestIndex = Number(declaredRound.slice(1));

      ROUND_LIST.forEach((round, index) => {
        const key = round.toLowerCase();
        const hasData = [
          row?.[`${key}company`],
          row?.[`${key}submitcompany`],
          row?.[`${key}startdate`],
          row?.[`${key}finishdate`]
        ].some(value => String(value ?? "").trim() !== "");

        if (hasData) latestIndex = Math.max(latestIndex, index);
      });

      return latestIndex >= 0 ? `R${latestIndex}` : "R0";
    }

    function splitRoundVendorList(value) {
      const seen = new Set();
      return String(value ?? "")
        .split(/\r?\n|;/)
        .map(item => item.trim())
        .filter(item => {
          const key = item.toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function buildStatusRebidValue(row, round) {
      const activeRound = normalizeRoundValue(round) || detectLatestRound(row || {});
      const key = activeRound.toLowerCase();
      const invited = splitRoundVendorList(row?.[`${key}company`] || row?.roundcompany || "");
      const submitted = splitRoundVendorList(row?.[`${key}submitcompany`] || row?.roundsubmitcompany || "");
      const finish = row?.[`${key}finishdate`] || row?.roundfinishdate || "";
      const finishText = finish ? formatTanggalIndonesia(finish) : "";

      return [activeRound, `${submitted.length} of ${invited.length}`, finishText]
        .filter(Boolean)
        .join("\n");
    }

    function syncActiveRoundFields(row) {
      if (!row || typeof row !== "object") return row;

      const preserveImported = shouldPreserveImportedFormat(row);
      const declaredRound = normalizeRoundValue(row.roundpo);
      const activeRound = declaredRound || detectLatestRound(row);
      const key = activeRound.toLowerCase();

      // Field generik hanya dipakai untuk tampilan/form. Nilai asli hasil
      // import (Final Vendor List, Final Submit Vendor, R0-R5, tanggal, dll.)
      // tidak boleh ditimpa oleh logika aplikasi.
      const invitation =
        row[`${key}company`] ||
        row.roundcompany ||
        row.finalvendorlist ||
        "";

      const submitted =
        row[`${key}submitcompany`] ||
        row.roundsubmitcompany ||
        row.finalsubmitvendor ||
        "";

      row.roundpo = activeRound;
      row.roundcompany = invitation;
      row.roundsubmitcompany = submitted;
      row.roundstartdate = row[`${key}startdate`] || row.roundstartdate || "";
      row.roundfinishdate = row[`${key}finishdate`] || row.roundfinishdate || "";

      const originalStatusRebid = String(row.statusrebid ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      row.statusrebid = preserveImported && originalStatusRebid.trim()
        ? originalStatusRebid
        : buildStatusRebidValue(row, activeRound);

      if (!preserveImported) {
        row[`${key}company`] = invitation;
        row[`${key}submitcompany`] = submitted;

        // Final Vendor List mengikuti Company Name pada round aktif, dan
        // baru terisi kalau Workspace sudah "submit" (Start Date & Finish
        // Date round ini juga sudah terisi).
        row.finalvendorlist = (invitation && row.roundstartdate && row.roundfinishdate)
          ? invitation
          : "";

        // Final Submit Vendor otomatis mengikuti Submit Company -- begitu
        // Submit Company terisi, Final Submit Vendor ikut terisi sama.
        row.finalsubmitvendor = submitted;
      }

      return row;
    }

    const PENGADAAN_OPTIONS = [
      "B",
      "J",
      "B & J"
    ];
    const STATUS_PR_OPTIONS = [
      "BID",
      "TDR",
      "IOM",
      "CTR",
      "PRB"
    ];

    function normalizeCompanyName(value, removeLegalEntity = false) {
      let normalized = String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

      if (removeLegalEntity) {
        const legalTokens = new Set([
          "pt", "cv", "tbk", "ltd", "limited", "inc", "incorporated",
          "corp", "corporation", "llc", "pte", "plc", "co", "company"
        ]);
        normalized = normalized
          .split(" ")
          .filter(token => token && !legalTokens.has(token))
          .join(" ");
      }

      return normalized;
    }

    function companyNamesEqual(left, right) {
      const exactLeft = normalizeCompanyName(left);
      const exactRight = normalizeCompanyName(right);
      if (!exactLeft || !exactRight) return false;
      if (exactLeft === exactRight) return true;
      return normalizeCompanyName(left, true) === normalizeCompanyName(right, true);
    }

    function getVendorEmail(companyName) {
      const vendor = companyData.find(v =>
        companyNamesEqual(
          v.companyName || v["Company Name"] || v["Vendor Company"] || v.company || "",
          companyName
        )
      );
      return vendor?.email || vendor?.Email || vendor?.["Email Address"] || vendor?.["Company Email"] || "";
    }

    // Pilihan Round PR pada tabel adalah kontrol tampilan saja. Nilai ini
    // tidak boleh mengubah record, cache, revision, atau Google Sheet.
    const ROUND_VIEW_SELECTIONS = new Map();

    function roundViewKey(row, index) {
      const procurementId = String(row?.procurementId || "").trim();
      if (procurementId) return `ID:${procurementId}`;

      const noPR = String(row?.noPR || "").trim();
      const assignDate = String(row?.assignprdate || "").trim();
      if (noPR || assignDate) return `PR:${noPR}|${assignDate}`;

      return `INDEX:${Number(index) || 0}`;
    }

    function getRoundViewValues(row, index) {
      const storedRound = normalizeRoundValue(row?.roundpo) || detectLatestRound(row || {});
      const selectedRound = normalizeRoundValue(
        ROUND_VIEW_SELECTIONS.get(roundViewKey(row, index)) || storedRound
      ) || "R0";
      const key = selectedRound.toLowerCase();
      const isStoredRound = selectedRound === storedRound;

      // Fallback ke field generik hanya untuk round aktif yang memang tersimpan
      // di sheet. Saat user memilih round lain, tampilkan hanya field R0-R5.
      const company = row?.[`${key}company`] || (isStoredRound ? row?.roundcompany : "") || "";
      const submitCompany = row?.[`${key}submitcompany`] || (isStoredRound ? row?.roundsubmitcompany : "") || "";
      const startDate = row?.[`${key}startdate`] || (isStoredRound ? row?.roundstartdate : "") || "";
      const finishDate = row?.[`${key}finishdate`] || (isStoredRound ? row?.roundfinishdate : "") || "";

      return {
        roundpo: selectedRound,
        roundcompany: company,
        roundsubmitcompany: submitCompany,
        roundstartdate: startDate,
        roundfinishdate: finishDate,
        finalvendorlist: company && startDate && finishDate ? company : "",
        finalsubmitvendor: submitCompany
      };
    }

    function updateRoundPR(index, value) {
      const row = procurementAdmin[index];
      if (!row) return;

      const selectedRound = normalizeRoundValue(value) || "R0";
      ROUND_VIEW_SELECTIONS.set(roundViewKey(row, index), selectedRound);

      // Hanya render ulang kolom yang mengikuti round. Tidak ada POST ke GAS.
      refreshTableView();
    }

    // Alias kompatibilitas untuk HTML/cache versi lama.
    function updateRoundPO(index, value) {
      return updateRoundPR(index, value);
    }

    function updateRoundDate(index, key, value) {
      if (blockProcurementAdminMutation()) return;
      const row = procurementAdmin[index];
      if (!value) {
        row[key] = "";
      } else {
        const d = new Date(value);
        row[key] = d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
      }
      refreshTableView();
    }

    function dateValueForInput(value) {
      const d = parseFlexibleDate(value);
      if (!d) return "";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0")
      return `${yyyy}-${mm}-${dd}`;
    }

    function formatDisplayDate(value, shortYear = false){

        const d = parseFlexibleDate(value);

        if(!d){
            return value || "";
        }

        return d.toLocaleDateString("en-GB",{
            day:"2-digit",
            month:"short",
            year: shortYear ? "2-digit" : "numeric"
        });

    }

    function formatDateForColumn(value, key) {
      return formatDisplayDate(value, false);
    }

    function updateDateField(index, key, value) {
      if (blockProcurementAdminMutation()) return;
      const row = procurementAdmin[index];
      if (!row) return;

      if (!value) {
        row[key] = "";
      } else {
        const d = new Date(`${value}T00:00:00`);
        row[key] = Number.isNaN(d.getTime())
          ? ""
          : d.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            });
      }

      saveProcurementCache();
      refreshTableView();
    }

    /* ======================================================
     Utilities 
    ====================================================== */

    function updateLastSync() {
      const now = new Date();
      const text = now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const el = document.getElementById("syncInfo");
      if (el) {
        el.textContent = `Last Sync: ${text}`;
      }
    }

    function saveProcurementCache() {

        procurementAdmin = procurementAdmin.map(row =>
            syncActiveRoundFields(row)
        );

        MSW.cache.save(
            PROCUREMENT_CACHE_KEY,
            procurementAdmin
        );

    }

    function clearProcurementReloadCaches() {
      try { MSW.cache.remove(PROCUREMENT_CACHE_KEY); } catch (_) {}
      try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index++) {
          const key = String(localStorage.key(index) || "");
          if (key.startsWith("MSW_NET_CACHE_V1_")) keys.push(key);
        }
        keys.forEach(key => localStorage.removeItem(key));
      } catch (_) {}
    }

    function loadProcurementCache() {

        const cache =
        MSW.cache.load(
            PROCUREMENT_CACHE_KEY
        );

        if (!cache) return false;

        procurementAdmin = Array.isArray(cache)
            ? cache.map(row => syncActiveRoundFields({ ...row }))
            : [];

        saveProcurementCache();
        refreshTableView();

        console.log(
            "✅ Procurement dimuat dari Cache"
        );

        return true;

    }

    // =====================================================
    // PR SUMMARY
    // =====================================================

    function formatTanggalIndonesia(value){
      if (value == null || value === "") return "";
      const d = parseFlexibleDate(value);
      if (d) {
        return d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
      }
      return value;
    }
    
    /* =====================================================
      ✅ Parser angka aman untuk format Excel dan Indonesia:
      1055228.6288, 1055228,6288, 1.055.228,6288, 1.055.229
    ===================================================== */
    function parseNumberID(value) {
      if (value == null || value === "") return NaN;
      if (typeof value === "number") return value;

      let s = String(value).trim();
      if (s === "" || s === "") return NaN;

      // ambil hanya angka, minus, titik, dan koma
      s = s.replace(/\s/g, "").replace(/[^\d.,-]/g, "");
      if (s === "" || s === "") return NaN;

      const hasComma = s.includes(",");
      const hasDot = s.includes(".");

      if (hasComma && hasDot) {
        // Separator terakhir dianggap desimal
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
          // Indonesia: 1.055.228,6288
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          // English/Excel: 1,055,228.6288
          s = s.replace(/,/g, "");
        }
      } else if (hasComma) {
        const parts = s.split(",");
        if (parts.length > 2) {
          // 1,055,228 → anggap koma ribuan
          s = parts.join("");
        } else {
          // 1055228,6288 → koma desimal
          s = parts[0] + "." + parts[1];
        }
      } else if (hasDot) {
        const parts = s.split(".");
        if (parts.length > 2) {
          // 1.055.228 → titik ribuan, kecuali bagian terakhir bukan 3 digit
          const last = parts[parts.length - 1];
          s = last.length === 3 ? parts.join("") : parts.slice(0, -1).join("") + "." + last;
        } else {
          // 1055228.6288 → titik desimal, 1.055 → titik ribuan
          s = (parts[1].length === 3 && parts[0].length <= 3) ? parts.join("") : s;
        }
      }

      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    }

    // Format angka jadi ribuan Indonesia untuk TAMPILAN saja (tidak mengubah data asli di procurementAdmin).
    // Aman dipakai untuk value yang sudah berformat (ada titik/koma) maupun angka murni.
    function formatRibuanID(value) {
      if (value == null || value === "" || value === "") return value;

      const num = parseNumberID(value);
      if (isNaN(num)) return value;

      return num.toLocaleString("id-ID");
    }

    function hitungEstPriceUS(row){

        const est = parseNumberID(row.estpricerp);

        if (isNaN(est)) {
            return "";
        }

        return (est * 16000).toLocaleString("id-ID");
    }

    function parseFlexibleDate(value) {

        if (value == null || value === "" || value === "") {
            return null;
        }

        if (value instanceof Date) {
            return isNaN(value) ? null : value;
        }

        // Excel serial number
        if (!isNaN(value) && Number(value) > 20000 && Number(value) < 80000) {
            const d = new Date((Number(value) - 25569) * 86400 * 1000);
            return isNaN(d) ? null : d;
        }

        const str = String(value).trim();

        // format dd-MMM-yy / dd MMM yyyy. Data lama dengan singkatan
        // Indonesia tetap dibaca, tetapi selalu ditampilkan kembali dalam English.
        const months = {
            jan:0, feb:1, mar:2, apr:3, may:4, mei:4, jun:5,
            jul:6, aug:7, agu:7, agt:7, sep:8, oct:9, okt:9,
            nov:10, dec:11, des:11
        };

        const m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);

        if (m) {

            let year = Number(m[3]);

            if (year < 100) year += 2000;
            const monthIndex = months[m[2].toLowerCase()];
            if (monthIndex === undefined) return null;

            return new Date(
                year,
                monthIndex,
                Number(m[1])
            );
        }

        const spaced = str.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
        if (spaced) {
          let year = Number(spaced[3]);
          if (year < 100) year += 2000;
          const monthIndex = months[spaced[2].slice(0, 3).toLowerCase()];
          if (monthIndex !== undefined) {
            const parsed = new Date(year, monthIndex, Number(spaced[1]));
            return isNaN(parsed) ? null : parsed;
          }
        }

        const numeric = str.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
        if (numeric) {
          let year = Number(numeric[3]);
          if (year < 100) year += 2000;
          const parsed = new Date(year, Number(numeric[2]) - 1, Number(numeric[1]));
          return isNaN(parsed) ? null : parsed;
        }

        const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
        if (iso) {
          const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
          return isNaN(parsed) ? null : parsed;
        }

        const d = new Date(str);

        return isNaN(d) ? null : d;
    }

    function emptyRow(){

        const row = {};

        COLUMNS.forEach(c=>{
            row[c.key] = "";
        });

        ROUND_LIST.forEach(round=>{

            const k = round.toLowerCase();

            row[`${k}company`] = "";
            row[`${k}submitcompany`] = "";
            row[`${k}startdate`] = "";
            row[`${k}finishdate`] = "";

        });

        return row;

    }

    /* =====================================================
      TOAST NOTIFICATION
    ===================================================== */

    function showToast(message, type = "success") {

        const container =
            document.getElementById("toastContainer");

        if (!container) return;

        const toast =
            document.createElement("div");

        toast.className =
            `toast toast-${type}`;

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

    /*=====================================================
      ACTION
    ===================================================== */

    function handleAdd(){
        if (blockProcurementAdminMutation()) return;

        openForm(
            "Form/index.html?mode=add"
        );

    }

    function openForm(url){
        if (blockProcurementAdminMutation()) return;

        const frame = document.getElementById("formFrame");
        const modal = document.getElementById("formModal");
        const formWindow = document.getElementById("formWindow");

        frame.src = url;
        const dragTitle = document.querySelector("#formDragHandle span");
        if (dragTitle) dragTitle.textContent = String(url).includes("workspace/")
            ? "Procurement Workspace"
            : "Procurement Form";

        // Setiap dibuka, kembalikan window ke tengah layar procurement-admin.
        formWindow.style.left = "50%";
        formWindow.style.top = "50%";
        formWindow.style.transform = "translate(-50%, -50%)";
        formWindow.classList.remove("is-dragging");

        modal.classList.remove("hidden");

    }


    window.addEventListener('message', function(event){
        if (event.data?.action !== 'PROCUREMENT_WORKSPACE_RESIZE') return;
        const formWindow = document.getElementById('formWindow');
        if (!formWindow) return;
        const large = event.data.mode === 'large';
        formWindow.classList.toggle('workspace-large', large);
        formWindow.classList.toggle('workspace-normal', !large);
        formWindow.style.left = '50%';
        formWindow.style.top = '50%';
        formWindow.style.transform = 'translate(-50%, -50%)';
    });

    function closeModal(){

        document
            .getElementById("formModal")
            .classList.add("hidden");

        document
            .getElementById("formFrame")
            .src = "";

    }

    document
    .getElementById("closeModal")
    .addEventListener("click", closeModal);

    /*=====================================================
      DRAG MODAL CONTAINER (BUKAN FORM DI DALAM IFRAME)
    ===================================================== */
    (function initDraggableProcurementModal(){
        const modal = document.getElementById("formModal");
        const formWindow = document.getElementById("formWindow");
        const handle = document.getElementById("formDragHandle");

        if (!modal || !formWindow || !handle) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener("pointerdown", function(event){
            if (event.target.closest("button")) return;

            const rect = formWindow.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            // Setelah drag dimulai, posisi dikontrol dengan pixel.
            formWindow.style.transform = "none";
            formWindow.style.left = rect.left + "px";
            formWindow.style.top = rect.top + "px";
            formWindow.classList.add("is-dragging");

            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener("pointermove", function(event){
            if (!dragging) return;

            const rect = formWindow.getBoundingClientRect();
            const visibleEdge = 70;

            let left = event.clientX - offsetX;
            let top = event.clientY - offsetY;

            // Sisakan minimal 70 px agar header tetap dapat diraih.
            const minLeft = -(rect.width - visibleEdge);
            const maxLeft = window.innerWidth - visibleEdge;
            const minTop = 0;
            const maxTop = Math.max(0, window.innerHeight - visibleEdge);

            left = Math.max(minLeft, Math.min(left, maxLeft));
            top = Math.max(minTop, Math.min(top, maxTop));

            formWindow.style.left = left + "px";
            formWindow.style.top = top + "px";
        });

        function stopDragging(event){
            if (!dragging) return;
            dragging = false;
            formWindow.classList.remove("is-dragging");
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        }

        handle.addEventListener("pointerup", stopDragging);
        handle.addEventListener("pointercancel", stopDragging);
    })();
    
    window.addEventListener("message", async function (event) {

        if (!event.data) return;

        if (event.data.action === "BIDDERLIST_PROCUREMENT_UPDATED") {
            const updatedNoPR = String(event.data.noPR || "").trim();
            const rawRow = event.data.data || {};
            const normalizedRow = mapExcelRows([rawRow], {
                preserveImportedFormat: false,
                origin: "BIDDERLIST_SYNC"
            })[0] || {};

            const index = procurementAdmin.findIndex(row =>
                String(row.noPR || "").trim() === updatedNoPR
            );

            if (index >= 0) {
                const round = normalizeRoundValue(
                    event.data.round ||
                    normalizedRow.roundpo ||
                    normalizedRow["Round PR"] || normalizedRow["Round PO"] ||
                    procurementAdmin[index].roundpo ||
                    "R0"
                ) || "R0";
                const key = round.toLowerCase();
                const companyName =
                    normalizedRow[`${key}company`] ||
                    normalizedRow.roundcompany ||
                    normalizedRow[`${round} Company`] ||
                    normalizedRow["Company Name"] ||
                    "";
                const startDate =
                    normalizedRow[`${key}startdate`] ||
                    normalizedRow.roundstartdate ||
                    normalizedRow[`${round} Start Date`] ||
                    normalizedRow["Start Date"] ||
                    "";
                const finishDate =
                    normalizedRow[`${key}finishdate`] ||
                    normalizedRow.roundfinishdate ||
                    normalizedRow[`${round} Finish Date`] ||
                    normalizedRow["Finish Date"] ||
                    "";

                procurementAdmin[index] = syncActiveRoundFields({
                    ...procurementAdmin[index],
                    ...normalizedRow,
                    noPR: updatedNoPR || procurementAdmin[index].noPR,
                    roundpo: round,
                    roundcompany: companyName,
                    roundstartdate: startDate,
                    roundfinishdate: finishDate,
                    [`${key}company`]: companyName,
                    [`${key}startdate`]: startDate,
                    [`${key}finishdate`]: finishDate
                });
                saveProcurementCache();
                refreshTableView();
                showToast("Company Name, Start Date, dan Finish Date round aktif telah diperbarui dari BidderList.", "success");
            }
            return;
        }

        // ✅ Tangani Cancel terlebih dahulu: cukup tutup modal, tidak ada data yang diproses/disimpan.
        if (event.data.action === "PROCUREMENT_CANCELLED") {
            closeModal();
            return;
        }

        if (event.data.action !== "PROCUREMENT_SAVED") return;

        const {

            mode,

            originalPR,

            data,

            createFolderAfterSave = false,
            keepWorkspaceOpen = false

        } = event.data;

        let savedRowIndex = -1;
        let previousNote = "";

        if (mode === "ADD") {

            procurementAdmin.push(syncActiveRoundFields({
                ...data,
                [IMPORT_PRESERVE_FLAG]: false,
                __recordOrigin: "ADD"
            }));
            savedRowIndex = procurementAdmin.length - 1;

        } else {

            const incomingId = String(data?.procurementId || "").trim();
            const index = procurementAdmin.findIndex(r => {
                if (incomingId) return String(r.procurementId || "").trim() === incomingId;
                return String(r.noPR).trim() === String(originalPR).trim();
            });

            if (index >= 0) {

                previousNote = String(procurementAdmin[index]?.note || "");

                procurementAdmin[index] = syncActiveRoundFields({

                    ...procurementAdmin[index],

                    ...data

                });
                savedRowIndex = index;

            }

        }

        saveProcurementCache();

        refreshTableView();

        // 🔧 fix: jangan biarkan error di sini menghentikan proses save ke Google Sheet
        try {
            if (typeof updatePRSummary === "function") {
                updatePRSummary(procurementAdmin);
            }
        } catch (err) {
            console.error("updatePRSummary error (diabaikan):", err);
        }

        if (!keepWorkspaceOpen) closeModal();
        else showToast("Data Procurement tersimpan. Anda dapat melanjutkan BidderList, RFQ, atau CQS.", "success");

        // Multi-user: simpan hanya record yang sedang diedit, bukan menulis ulang seluruh sheet.
        try {
            const savedRow = savedRowIndex >= 0 ? procurementAdmin[savedRowIndex] : data;
            const saveResult = await saveSingleProcurementToGoogleSheet(mode, savedRow, originalPR);
            if (savedRowIndex >= 0 && saveResult) {
                procurementAdmin[savedRowIndex].procurementId =
                    saveResult.procurementId || procurementAdmin[savedRowIndex].procurementId || "";
                procurementAdmin[savedRowIndex].__version =
                    saveResult.version || procurementAdmin[savedRowIndex].__version || 1;
                saveProcurementCache();
            }

            const nextNote = String(savedRow?.note || "").trim();
            const noteChanged = nextNote !== String(previousNote || "").trim();
            if (noteChanged && nextNote) {
                recordProcurementAdminActivity({
                    type: /^(CQS|RFQ|BIDDERLIST)\b/i.test(nextNote)
                        ? nextNote.match(/^(CQS|RFQ|BIDDERLIST)\b/i)[1].toUpperCase()
                        : "PROCUREMENT",
                    noPR: savedRow?.noPR || originalPR || "",
                    documentNo: "",
                    status: mode === "ADD" ? "Note Added" : "Note Updated",
                    detail: nextNote,
                    round: savedRow?.roundpo || "",
                    user: savedRow?.pic || ""
                });
            }
        } catch (err) {
            console.error("Gagal menyimpan record Procurement:", err);
            showToast("Data lokal tersimpan, tetapi Google Sheet gagal diperbarui: " + (err?.message || err), "error");
        }

        if (createFolderAfterSave && savedRowIndex >= 0) {
            try {
                await createFolder(savedRowIndex, {
                    ensureStructure: true,
                    successMessage: "Data dan susunan folder berhasil dibuat."
                });
            } catch (err) {
                console.error("Data tersimpan, tetapi folder gagal dibuat:", err);
                showToast("Data tersimpan, tetapi folder gagal dibuat: " + (err?.message || err), "error");
            }
        }

    });

    function getProcurementByPR(noPR){

    return procurementAdmin.find(r=>

        String(r.noPR).trim()===

        String(noPR).trim()

    );

}

    // Dipakai iframe Form agar membaca data yang sama persis dengan tabel/cache.
    window.getProcurementByPR = getProcurementByPR;
    window.getVendorEmail = getVendorEmail;
    window.getCompanyDirectory = function () {
      return companyData.map(item => ({ ...item }));
    };

    async function toggleEditMode(){

        return;

    }
    
    function formatRFQ(value){

      const v = String(value || "").trim();

      if(/^\d+$/.test(v)){
        return v.padStart(4,"0");
      }

      return v;
    }

    async function handleDelete(i){
      if (blockProcurementAdminMutation()) return;
      const row = procurementAdmin[i];
      if (!row) return;

      const label = row.noPR ? ` ${row.noPR}` : " ini";
      if (!confirm(`Hapus row${label}? Data akan dihapus dari cache dan Google Sheet.`)) return;

      try {
        const result = await deleteSingleProcurementFromGoogleSheet(row);
        if (!result?.success) throw new Error(result?.message || "Data Procurement gagal dihapus.");

        // Server/ownership harus menyetujui lebih dahulu. Cache tidak boleh
        // menyembunyikan row ketika delete sebenarnya ditolak.
        clearProcurementReloadCaches();
        await loadFromGoogleSheet(true);
        showToast(`Row${label} berhasil dihapus.`, "success");
      } catch (error) {
        console.error("Delete row gagal disinkronkan:", error);
        showToast(error?.message || "Row gagal dihapus dari Google Sheet.", "error");
        await loadFromGoogleSheet(true);
      }
    }

    let contextMenuRowIndex = -1;

    function hideRowContextMenu() {
      const menu = document.getElementById("rowContextMenu");
      if (!menu) return;
      menu.classList.add("hidden");
      menu.setAttribute("aria-hidden", "true");
      document.querySelectorAll("#tableBody tr.context-row-active")
        .forEach(row => row.classList.remove("context-row-active"));
      contextMenuRowIndex = -1;
    }

    function showRowContextMenu(event, rowIndex, tr) {
      if (PROCUREMENT_ADMIN_VIEW_ONLY) {
        event.preventDefault();
        hideRowContextMenu();
        return;
      }
      const menu = document.getElementById("rowContextMenu");
      if (!menu || !procurementAdmin[rowIndex]) return;

      event.preventDefault();
      hideRowContextMenu();
      contextMenuRowIndex = rowIndex;
      tr?.classList.add("context-row-active");
      menu.classList.remove("hidden");
      menu.setAttribute("aria-hidden", "false");

      const menuWidth = 220;
      const menuHeight = 145;
      const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
      const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
      menu.style.left = `${Math.max(8, left)}px`;
      menu.style.top = `${Math.max(8, top)}px`;

      if (window.lucide) lucide.createIcons();
    }

    function initRowContextMenu() {
      const editBtn = document.getElementById("contextEditBtn");
      const folderBtn = document.getElementById("contextFolderBtn");
      const deleteBtn = document.getElementById("contextDeleteBtn");

      editBtn?.addEventListener("click", () => {
        const row = procurementAdmin[contextMenuRowIndex];
        hideRowContextMenu();
        if (!row?.noPR) return showToast("No PR kosong, form tidak dapat dibuka.", "error");
        openForm(`workspace/index.html?pr=${encodeURIComponent(row.noPR)}`);
      });

      folderBtn?.addEventListener("click", async () => {
        const index = contextMenuRowIndex;
        const row = procurementAdmin[index];
        hideRowContextMenu();
        if (!row) return;
        if (row.folderlink) openFolder(index);
        else await createFolder(index, { ensureStructure: true });
      });

      deleteBtn?.addEventListener("click", async () => {
        const index = contextMenuRowIndex;
        hideRowContextMenu();
        await handleDelete(index);
      });

      document.addEventListener("click", event => {
        if (!event.target.closest("#rowContextMenu")) hideRowContextMenu();
      });
      document.addEventListener("scroll", hideRowContextMenu, true);
      window.addEventListener("resize", hideRowContextMenu);
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") hideRowContextMenu();
      });
    }

    function normalizeRoundSearch(keyword){

        const text = String(keyword)
            .trim()
            .toUpperCase();

        const match = text.match(/^R\s*0*(\d+)$/);

        if(!match){
            return null;
        }

        return `R${Number(match[1])}`;

    }

    const SEARCH_STATE_KEY = "procurementAdminSearchText";

    /* ========== FILTER DROPDOWN SEPERTI EXCEL ========== */
    const COLUMN_FILTER_STORAGE_KEY = "procurementAdminExcelColumnFilters";
    let columnFilters = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(COLUMN_FILTER_STORAGE_KEY) || "{}");
        return Object.fromEntries(Object.entries(saved || {}).filter(([, v]) => Array.isArray(v)));
      } catch (_) { return {}; }
    })();
    let activeColumnFilterMenu = null;

    function getColumnFilterSourceRows() {
      return (procurementAdmin || []).map((row, index) => ({ ...row, __realIndex: row?.__realIndex ?? index }));
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
      const raw = row?.[key] ?? "";
      if (key === "rfq") return formatRFQ(raw);
      if (key === "roundstartdate" || key === "roundfinishdate" || (typeof DATE_KEYS !== "undefined" && DATE_KEYS.includes(key))) {
        return formatDateForColumn(raw, key);
      }
      return String(raw);
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

    function loadPersistedSearchText() {
        try {
            return localStorage.getItem(SEARCH_STATE_KEY) || "";
        } catch (_) {
            return "";
        }
    }

    function persistSearchText(value) {
        try {
            const text = String(value ?? "");
            if (text.length > 0) {
                localStorage.setItem(SEARCH_STATE_KEY, text);
            } else {
                localStorage.removeItem(SEARCH_STATE_KEY);
            }
        } catch (_) {
            // LocalStorage dapat tidak tersedia pada mode/private browser tertentu.
        }
    }

    /**
     * Render ulang data tanpa melepaskan filter aktif.
     * Selama wording search belum dihapus oleh pengguna, setiap refresh dari
     * cache, Google Sheet, import, edit, delete, atau pembuatan folder akan
     * tetap menampilkan hasil dari wording yang sama.
     */
    function refreshTableView(options = {}) {
        const searchInput = document.getElementById("searchInput");
        const keyword = String(searchInput?.value || "").trim();

        if (keyword || hasActiveColumnFilters()) {
            filterTable({
                preserveSearchFocus: Boolean(options.preserveSearchFocus)
            });
            return;
        }

        const clearSearchBtn = document.getElementById("clearSearchBtn");
        if (clearSearchBtn) {
            clearSearchBtn.classList.add("hidden");
        }

        renderTable(procurementAdmin);
        renderSearchPreview(procurementAdmin);
    }

    let searchRenderTimer = null;
    let searchRenderFrame = null;
    const SEARCH_DEBOUNCE_MS = 260;
    const SEARCH_TEXT_CACHE = new WeakMap();

    function scheduleFilterTable() {
        // Jangan render puluhan kolom pada setiap keydown. Penundaan singkat ini
        // membuat pengguna bisa terus mengetik tanpa input terasa putus-putus.
        if (searchRenderTimer) {
            clearTimeout(searchRenderTimer);
        }

        searchRenderTimer = setTimeout(() => {
            searchRenderTimer = null;
            if (searchRenderFrame) cancelAnimationFrame(searchRenderFrame);
            searchRenderFrame = requestAnimationFrame(() => {
                searchRenderFrame = null;
                filterTable({ preserveSearchFocus: true });
            });
        }, SEARCH_DEBOUNCE_MS);
    }

    function filterTable(options = {}) {

        if (searchRenderTimer) {
            clearTimeout(searchRenderTimer);
            searchRenderTimer = null;
        }

        const searchInput = document.getElementById("searchInput");
        const clearSearchBtn = document.getElementById("clearSearchBtn");
        const restoreSearchFocus = Boolean(
            searchInput &&
            (options.preserveSearchFocus || document.activeElement === searchInput)
        );
        const selectionStart = restoreSearchFocus ? searchInput.selectionStart : null;
        const selectionEnd = restoreSearchFocus ? searchInput.selectionEnd : null;
        const keyword = String(searchInput?.value || "").trim();

        if (clearSearchBtn) {
            clearSearchBtn.classList.toggle("hidden", keyword.length === 0);
        }

        const roundSearch = normalizeRoundSearch(keyword);
        const searchTerms = keyword
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

        const filtered = procurementAdmin
            .map((sourceRow,index)=>{
                let cachedSearchText = SEARCH_TEXT_CACHE.get(sourceRow);
                if (!cachedSearchText) {
                    cachedSearchText = COLUMNS
                        .map(c => String(sourceRow[c.key] || ""))
                        .join(" ")
                        .toLocaleLowerCase("id");
                    SEARCH_TEXT_CACHE.set(sourceRow, cachedSearchText);
                }
                return {
                    ...sourceRow,
                    __realIndex:index,
                    __searchTextCache:cachedSearchText
                };
            })
            .filter(row=>{

                if (!matchesColumnFilters(row)) return false;

                // ==========================
                // SEARCH KHUSUS ROUND
                // ==========================
                if (roundSearch) {

                    // Abaikan PR yang sudah Cancel
                    if (
                        String(row.flowprocess || "")
                            .trim()
                            .toUpperCase() === "CANCEL"
                    ) {
                        return false;
                    }

                    // Hanya Procurement BID
                    if (
                        String(row.statuspr || "")
                            .trim()
                            .toUpperCase() !== "BID"
                    ) {
                        return false;
                    }

                    // Round yang sedang aktif
                    return (
                        String(row.roundpo || "")
                            .trim()
                            .toUpperCase() === roundSearch
                    );

                }

                // ==========================
                // SEARCH NORMAL
                // ==========================
                if (searchTerms.length === 0) {
                    return true;
                }

                const searchableText = row.__searchTextCache || "";

                // Semua kata yang diketik harus ditemukan, tetapi boleh berada
                // di kolom yang berbeda (mis. "BID vendor-a").
                return searchTerms.every(term => searchableText.includes(term));

            });

        const tableContainer = document.getElementById("tableContainer");
        const previousScrollTop = tableContainer?.scrollTop || 0;
        const previousScrollLeft = tableContainer?.scrollLeft || 0;
        renderTable(filtered);
        if (tableContainer) {
            tableContainer.scrollTop = previousScrollTop;
            tableContainer.scrollLeft = previousScrollLeft;
        }

        renderSearchPreview(filtered);

        if (typeof updatePRSummary === "function") {
            try {
                updatePRSummary(filtered);
            } catch (err) {
                console.error("updatePRSummary error (diabaikan):", err);
            }
        }

        // Beberapa proses render (termasuk penggantian ikon) dapat membuat fokus
        // browser berpindah. Kembalikan fokus dan posisi caret ke search.
        if (restoreSearchFocus && searchInput) {
            requestAnimationFrame(() => {
                searchInput.focus({ preventScroll: true });
                if (selectionStart !== null && selectionEnd !== null) {
                    try {
                        searchInput.setSelectionRange(selectionStart, selectionEnd);
                    } catch (_) {
                        // Browser lama dapat menolak setSelectionRange pada type=search.
                    }
                }
            });
        }

    }

    function renderSearchPreview(rows){

        const panel = document.getElementById("searchPreview");

        if(!panel) return;

        const keyword = document
            .getElementById("searchInput")
            .value
            .trim();

        const roundSearch = normalizeRoundSearch(keyword);

        // Preview hanya untuk Search Round
        if(!roundSearch){

            panel.classList.add("hidden");
            panel.innerHTML = "";
            return;

        }

        if(rows.length === 0){

            panel.classList.remove("hidden");

            panel.innerHTML = `
                <div class="bg-white border rounded-lg p-4 shadow-sm text-gray-500 italic">
                    Tidak ditemukan.
                </div>
            `;

            return;

        }

        panel.classList.remove("hidden");

        panel.innerHTML = rows.map(row=>{

            const vendors = String(row.finalsubmitvendor || "")
                .split(/\r?\n|;/)
                .map(v=>v.trim())
                .filter(v=>v);

            const winner = String(row.winnerpo || "").trim();

            const winnerKey = winner.toLowerCase();

            const desc = String(row.Description || "")
              .replace(/\s+/g, " ")
              .trim();

            return `

            <div class="bg-white border rounded-lg shadow-sm">

                <div class="bg-slate-700 text-white px-4 py-2 rounded-t-lg font-semibold">

                    ${row.noPR || ""} - ${desc || ""}

                </div>

                <div class="p-4">

                    <div class="mb-3">

                        <span class="font-semibold">
                            Winner :
                        </span>

                        ${winner || ""}

                    </div>

                    <div class="font-semibold mb-2">
                        Vendor List
                    </div>

                    <div class="vendor-list">

                        ${vendors.map(v=>`

                            <div>

                                ${v.toLowerCase() === winnerKey ? "✓" : "•"}

                                ${v}

                            </div>

                        `).join("")}

                    </div>

                </div>

            </div>

            `;

        }).join("");

    }

    async function clearAll(){
      if (blockProcurementAdminMutation()) return;
      const activeRole = String(MSW.auth.getRole?.() || "").trim().toUpperCase();
      const activeProfile = MSW.auth.getProfile?.() || {};
      const buyerEmail = String(activeProfile.email || "").trim().toLowerCase();
      const isBuyer = activeRole === "BUYER";

      const message = isBuyer
        ? `Hapus semua data Procurement yang dibuat/dimiliki akun ${buyerEmail || "Buyer ini"}?\n\nData Buyer lain tidak akan dihapus.`
        : "Hapus semua data Procurement? Tindakan ini tidak dapat dibatalkan.";
      if (!confirm(message)) return;

      try {
        const result = isBuyer
          ? await postProcurementAction({
              action: "CLEAR_OWN_PROCUREMENT",
              sheet: SHEET_NAME,
              expectedRevision: ADMIN_SHEET_REVISION
            })
          : await postProcurementAction({
              action: "BATCH_REPLACE_PROCUREMENT",
              sheet: SHEET_NAME,
              rows: [],
              expectedRevision: ADMIN_SHEET_REVISION
            });

        if (!result?.success) throw new Error(result?.message || "All Clear gagal.");
        clearProcurementReloadCaches();
        await loadFromGoogleSheet(true);
        showToast(
          isBuyer
            ? `${Number(result.deletedCount || 0)} data Procurement milik Buyer berhasil dihapus.`
            : "Semua data Procurement berhasil dihapus.",
          "success"
        );
      } catch (error) {
        console.error("All Clear gagal:", error);
        showToast(error?.message || "All Clear gagal.", "error");
        await loadFromGoogleSheet(true);
      }
    }

    /* ========== Export / Import ========== */
    function exportExcel(){
      if (procurementAdmin.length === 0) {
        return showToast("Tidak ada data untuk diekspor.");
      }
      const rows = procurementAdmin.map(r => {
        const exportRow = {
          "No PR": r.noPR || "",
          "Description": r.Description || "",
          "Previous Submit PO": r.previoussubmitpo || "",
          "Final Vendor List": r.finalvendorlist || "",
          "Final Submit Vendor": r.finalsubmitvendor || "",
          "Status Rebid": r.statusrebid || "",
          "PIC": r.pic || "",
          "Assign PR": r.assignprdate || "",
          "Departement": r.departement || "",
          "Pengadaan": r.pengadaan || "",
          "Status PR": r.statuspr || "",
          "RFQ": r.rfq || "",

          "Est. Price PR": r.estpricerp || "",
          "Est. Price US - Rp": r.estpriceus || "",
          "USD/IDR Rate": r.usdidrrate || "",
          "USD/IDR Rate Date": r.usdidrratedate || "",
          "USD/IDR Source": r.usdidrsource || "",
          "USD/IDR Locked": r.usdidrlocked === true || String(r.usdidrlocked || "").toLowerCase() === "true",
          "Flow Process": r.flowprocess || "",
          "Round PR": r.roundpo || "",
        };

        ROUND_LIST.forEach(round => {

            const key = round.toLowerCase();

            exportRow[`${round} Company`] =
                r[`${key}company`] || "";

            exportRow[`${round} Submit Company`] =
                r[`${key}submitcompany`] || "";

            exportRow[`${round} Start Date`] =
                r[`${key}startdate`] || "";

            exportRow[`${round} Finish Date`] =
                r[`${key}finishdate`] || "";

        });

        exportRow["Winner PO"] = r.winnerpo || "";
        exportRow["Email Winner PO"] = r.emailwinnerpo || "";
        exportRow["No PO"] = r.nopo || "";
        exportRow["Price (Rp) Excl. PPn"] = r.pricerp || "";
        exportRow["CQS Create Date"] = r.cqscreatedate || "";
        exportRow["CQS Approval Date"] = r.cqsapprovaldate || "";
        exportRow["PO Create Date"] = r.pocreatedate || "";
        exportRow["PO Del. Date"] = r.podeldate || "";
        exportRow["Actual PO Rel. Date"] = r.actualporeleasedate || "";
        exportRow["Actual PO Del. Date"] = r.actualpodeldate || "";
        exportRow["Days Calender (Days)"] = r.days || "";
        exportRow["Actual Received PO (GRN Date)"] = r.actualreceivedpo || "";
        exportRow["Note"] = r.note || "";

        exportRow["Folder ID"] = r.folderid || "";
        exportRow["Folder LINK"] = r.folderlink || "";

        return exportRow;

      });

      const ws = XLSX.utils.json_to_sheet(rows);

      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        "Procurement"
      );

      XLSX.writeFile(
        wb,
        `Procurement Admin-${new Date().toISOString().slice(0,10)}.xlsx`
      );
    } 
   
    // Exact map dari nama kolom Google Sheet → key internal
    // Lebih aman daripada fuzzy matching yang bisa salah petakan kolom
    const GAS_HEADER_MAP = {
      "Procurement ID":          "procurementId",
      "Owner Name":              "ownerName",
      "Owner NIP":               "ownerNIP",
      "Owner Email":             "ownerEmail",
      "Version":                 "__version",
      "Created At":              "createdAt",
      "Created By":              "createdBy",
      "Updated At":              "updatedAt",
      "Updated By":              "updatedBy",
      "No PR":                    "noPR",
      "Description":              "Description",
      "Previous Submit PO":       "previoussubmitpo",
      "Final Vendor List":        "finalvendorlist",
      "Final Submit Vendor":      "finalsubmitvendor",
      "Status Rebid":             "statusrebid",
      "PIC":                      "pic",
      "Assign PR":                "assignprdate",
      "Assign Date":              "assignprdate",
      "Assign PR Date":           "assignprdate",
      "Departement":              "departement",
      "Pengadaan":                "pengadaan",
      "Status PR":                "statuspr",
      "RFQ":                      "rfq",

      "Est. Price PR":            "estpricerp",
      "Est. Price US - Rp":       "estpriceus",
      "USD/IDR Rate":             "usdidrrate",
      "USD IDR Rate":             "usdidrrate",
      "USD/IDR Rate Date":        "usdidrratedate",
      "USD IDR Rate Date":        "usdidrratedate",
      "USD/IDR Source":           "usdidrsource",
      "USD IDR Source":           "usdidrsource",
      "USD/IDR Locked":           "usdidrlocked",
      "USD IDR Locked":           "usdidrlocked",
      "Flow Process":             "flowprocess",
      "Round PR":                 "roundpo",
      "Round PO":                 "roundpo",
      "Winner PO":                "winnerpo",
      "Email Winner PO":          "emailwinnerpo",
      "No PO":                    "nopo",
      "Price (Rp) Excl. PPn":     "pricerp",
      "CQS Create Date":          "cqscreatedate",
      "CQS Created Date":         "cqscreatedate",
      "CQS Approval Date":        "cqsapprovaldate",
      "CQS Approved Date":        "cqsapprovaldate",
      "PO Create Date":           "pocreatedate",
      "PO Del. Date":             "podeldate",
      "Actual PO Rel. Date":       "actualporeleasedate",
      "Actual PO Release Date":   "actualporeleasedate",
      "Actual PO Del. Date":      "actualpodeldate",
      "Days Calender (Days)":     "days",
      "Actual Received PO (GRN Date)":       "actualreceivedpo",
    
      "Folder ID":                "folderid",
      "Folder LINK":              "folderlink",
      "Note":                     "note",
    
      "R0 Company":"r0company",
      "R0 Submit Company":"r0submitcompany",
      "R0 Start Date":"r0startdate",
      "R0 Finish Date":"r0finishdate",

      "R1 Company":"r1company",
      "R1 Submit Company":"r1submitcompany",
      "R1 Start Date":"r1startdate",
      "R1 Finish Date":"r1finishdate",

      "R2 Company":"r2company",
      "R2 Submit Company":"r2submitcompany",
      "R2 Start Date":"r2startdate",
      "R2 Finish Date":"r2finishdate",

      "R3 Company":"r3company",
      "R3 Submit Company":"r3submitcompany",
      "R3 Start Date":"r3startdate",
      "R3 Finish Date":"r3finishdate",

      "R4 Company":"r4company",
      "R4 Submit Company":"r4submitcompany",
      "R4 Start Date":"r4startdate",
      "R4 Finish Date":"r4finishdate",

      "R5 Company":"r5company",
      "R5 Submit Company":"r5submitcompany",
      "R5 Start Date":"r5startdate",
      "R5 Finish Date":"r5finishdate",

    };

    const NORMALIZED_GAS_HEADER_MAP = Object.entries(GAS_HEADER_MAP).reduce((acc, [header, key]) => {
      acc[normalizeImportHeader(header)] = key;
      return acc;
    }, {});

    Object.assign(NORMALIZED_GAS_HEADER_MAP, {
      "round pr": "roundpo",
      "round po": "roundpo",
      "company name": "roundcompany",
      "round company": "roundcompany",
      "list invitation vendor": "roundcompany",
      "submit company": "roundsubmitcompany",
      "round submit company": "roundsubmitcompany",
      "submit quote vendor": "roundsubmitcompany",
      "start date": "roundstartdate",
      "finish date": "roundfinishdate",
      "email": "emailwinnerpo",
      "days calendar days": "days",
      "days calender days": "days"
    });

    function normalizeImportHeader(value) {
      return String(value || "")
        .replace(/[\r\n]+/g, " ")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    }

    function humanToKeyMap(h){
      return NORMALIZED_GAS_HEADER_MAP[normalizeImportHeader(h)] || null;
    }

    function mapExcelRows(raw, options = {}) {
      const preserveImportedFormat = options.preserveImportedFormat !== false;
      const recordOrigin = options.origin || "EXTERNAL";

      const mapped = raw.map(row => {
        const obj = emptyRow();
        const importedKeys = [];
        obj[IMPORT_PRESERVE_FLAG] = preserveImportedFormat;
        obj.__recordOrigin = recordOrigin;

        Object.keys(row).forEach(h => {
          const k = humanToKeyMap(h);
          let v = row[h];
          const hl = String(h).toLowerCase();

          // Normalisasi hanya untuk data yang dibuat oleh aplikasi. Data dari
          // import/Google Sheet dipertahankan sesuai nilai dan format sumber.
          if (!preserveImportedFormat) {
            if (DATE_KEYS.includes(k) || hl.includes("date")) {
              v = formatTanggalIndonesia(v);
            }

            if (
              hl.includes("cost") ||
              hl.includes("price") ||
              hl.includes("idr") ||
              hl.includes("rp")
            ) {
              let num = parseNumberID(v);
              if (k === "estpricerp" && !isNaN(num)) num = Math.ceil(num);
              v = isNaN(num) ? v : num;
            }
          }

          if (k) {
            if (!importedKeys.includes(k)) importedKeys.push(k);
            obj[k] = (v === "" || v == null) ? "" : v;

            if (!preserveImportedFormat && k === "rfq" && obj[k] !== "") {
              obj[k] = formatRFQ(obj[k]);
            }

            if (k === "estpriceus") obj.estpriceus_original = obj[k];
          }
        });

        ROUND_LIST.forEach(round => {
          const key = round.toLowerCase();
          obj[`${key}company`] = row[`${round} Company`] ?? obj[`${key}company`] ?? "";
          obj[`${key}submitcompany`] = row[`${round} Submit Company`] ?? obj[`${key}submitcompany`] ?? "";

          const startValue = row[`${round} Start Date`] ?? obj[`${key}startdate`] ?? "";
          const finishValue = row[`${round} Finish Date`] ?? obj[`${key}finishdate`] ?? "";
          obj[`${key}startdate`] = preserveImportedFormat
            ? startValue
            : formatTanggalIndonesia(startValue);
          obj[`${key}finishdate`] = preserveImportedFormat
            ? finishValue
            : formatTanggalIndonesia(finishValue);
        });

        obj.__importedKeys = importedKeys;
        // Mengisi field tampilan aktif tanpa mengubah nilai sumber import.
        syncActiveRoundFields(obj);
        return obj;
      });

      return mapped;
    }

    const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();

    function recordProcurementAdminActivity(activity) {
      const enriched = {
        ...activity,
        timestamp: String(activity?.timestamp || new Date().toISOString())
      };
      const localItem = window.MSW?.activity?.add
        ? MSW.activity.add(enriched)
        : enriched;

      fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "LOG_ACTIVITY", activity: localItem })
      }).catch(error => console.warn("Recent Activity belum dapat disinkronkan:", error));

      return localItem;
    }
    
    const SHEET_NAME = "Admin";

    const PROCUREMENT_CACHE_KEY =
    "MSW_PROCUREMENT_CACHE";

    async function loadCompanyData() {

      const cache = MSW.cache.load("MSW_COMPANY_CACHE");

      if (cache) {
        companyData = cache;

        console.log(
          "Company loaded from cache:",
          companyData.length
        );

        return;
      }

      try {

        const res = await fetch(
          `${GAS_URL}?sheet=Company`,
          { cache: "no-store" }
        );

        const data = await res.json();

        companyData = (data.rows || []).map(r => ({
          ...r,
          companyName:
            r.companyName || r["Company Name"] || r["Vendor Company"] || r["Vendor Name"] || r.Company || "",
          email:
            r.email || r["Email"] || r["Email Address"] || r["Company Email"] || r["Vendor Email"] || ""
        }));

        MSW.cache.save(
            "MSW_COMPANY_CACHE",
            companyData
        );

        console.log(
          "Company loaded from sheet:",
          companyData.length
        );

      } catch(err) {

        console.error(
          "Load Company Error",
          err
        );

      }

    }

    async function loadFromGoogleSheet(force = false) {

        if (!force) {
            // Cache ditampilkan segera agar UI cepat, tetapi data terbaru tetap
            // diambil dari Google Sheet untuk menjaga sinkronisasi multi-user.
            loadProcurementCache();
        }

        try {

            const res = await fetch(
                `${GAS_URL}?sheet=${SHEET_NAME}`,
                {
                    cache: "no-store"
                }
            );

            const raw = await res.text();
            const looksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(raw);

            if (!res.ok) {
                throw new Error(`Google Apps Script HTTP ${res.status}. Periksa URL deployment /exec.`);
            }

            if (looksLikeHtml || raw.trim().startsWith("<")) {
                throw new Error("Google Apps Script mengembalikan HTML, bukan JSON. Deployment /exec tidak aktif atau URL sudah tidak berlaku.");
            }

            let data;
            try {
                data = JSON.parse(raw);
            } catch (_) {
                throw new Error("Respons Google Apps Script bukan JSON yang valid.");
            }

            ADMIN_SHEET_REVISION = Number(data.revision || 0);

            if (!Array.isArray(data.rows)) {

                console.error("❌ Response tidak valid:", data);

                const el = document.getElementById("syncInfo");

                if (el) {
                    el.textContent = "❌ Data Google Sheet tidak valid";
                }

                return;

            }

            // Sheet kosong adalah kondisi valid (misalnya setelah All Clear).
            // Cache lama tidak boleh tetap tampil.
            if (data.rows.length === 0) {
                procurementAdmin = [];
                saveProcurementCache();
                updateLastSync();
                refreshTableView();
                return;
            }

            console.log(
                "✅ DATA FROM GOOGLE =",
                data.rows.length,
                "rows, sample:",
                data.rows[0]
            );

            if (!force && data.mtimeMs === lastExcelMtime) {

                return;

            }

            lastExcelMtime = data.mtimeMs;

            procurementAdmin = mapExcelRows(data.rows, { preserveImportedFormat: true, origin: "GOOGLE_SHEET" });

            saveProcurementCache();
	    
	    updateLastSync();
            
	    refreshTableView();

            console.log(
                "✅ Data berhasil dibaca dari Google Sheet:",
                procurementAdmin.length,
                "baris"
            );

        } catch (err) {

            console.error("❌ Gagal membaca Google Sheet:", err);

            const el = document.getElementById("syncInfo");

            if (el) {
                el.textContent = procurementAdmin.length
                    ? "⚠ Mode cache — Google Sheet tidak terhubung"
                    : "❌ Gagal konek ke Google Sheet: " + err.message;
            }

            // Cache yang sudah dimuat tetap dipertahankan dan dirender. Kegagalan
            // backend tidak boleh mengosongkan tabel Buyer/Admin.
            if (procurementAdmin.length) {
                refreshTableView();
            }

        }

    }

    async function postProcurementAction(payload) {
      if (blockProcurementAdminMutation()) {
        throw new Error("Procurement Management hanya dapat dilihat oleh Admin.");
      }
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); }
      catch (_) { throw new Error(text || `HTTP ${response.status}`); }
      if (!response.ok || result.success === false) {
        const error = new Error(result.message || "Google Sheet gagal diperbarui.");
        error.details = result;
        throw error;
      }
      if (result.revision != null) ADMIN_SHEET_REVISION = Number(result.revision);
      return result;
    }

    async function saveSingleProcurementToGoogleSheet(mode, row, originalPR) {
      if (blockProcurementAdminMutation()) return null;
      const action = String(mode || "EDIT").toUpperCase() === "ADD" ? "ADD" : "EDIT";
      return postProcurementAction({
        action,
        sheet: SHEET_NAME,
        originalPR: originalPR || row?.noPR || "",
        data: row || {}
      });
    }

    async function deleteSingleProcurementFromGoogleSheet(row) {
      if (blockProcurementAdminMutation()) return null;
      const noPR = String(row?.noPR || "").trim();
      if (!noPR) throw new Error("No PR kosong.");
      return postProcurementAction({
        action: "DELETE",
        sheet: SHEET_NAME,
        originalPR: noPR,
        procurementId: row?.procurementId || "",
        assignPRDate: row?.assignprdate || ""
      });
    }

    function serializeProcurementRowsForSheet(sourceRows) {
      return (Array.isArray(sourceRows) ? sourceRows : []).map(r => ({
          "Procurement ID": valueForSheet(r.procurementId),
          "PR Year": valueForSheet(r.prYear),
          "Owner Name": valueForSheet(r.ownerName),
          "Owner NIP": valueForSheet(r.ownerNIP),
          "Owner Email": valueForSheet(r.ownerEmail),
          "Version": valueForSheet(r.__version),
          "Created At": valueForSheet(r.createdAt),
          "Created By": valueForSheet(r.createdBy),
          "Updated At": valueForSheet(r.updatedAt),
          "Updated By": valueForSheet(r.updatedBy),
          "No PR": valueForSheet(r.noPR),
          "Description": valueForSheet(r.Description),
          "Previous Submit PO": valueForSheet(r.previoussubmitpo),
          "Final Vendor List": valueForSheet(r.finalvendorlist),
          "Final Submit Vendor": valueForSheet(r.finalsubmitvendor),
          "Status Rebid": valueForSheet(r.statusrebid),
          "PIC": valueForSheet(r.pic),
          "Assign PR": valueForSheet(r.assignprdate),
          "Departement": valueForSheet(r.departement),
          "Pengadaan": valueForSheet(r.pengadaan),
          "Status PR": valueForSheet(r.statuspr),
          "RFQ": valueForSheet(r.rfq),
          "Est. Price PR": valueForSheet(r.estpricerp),
          "Est. Price US - Rp": valueForSheet(r.estpriceus),
          "USD/IDR Rate": valueForSheet(r.usdidrrate),
          "USD/IDR Rate Date": valueForSheet(r.usdidrratedate),
          "USD/IDR Source": valueForSheet(r.usdidrsource),
          "USD/IDR Locked": valueForSheet(r.usdidrlocked),
          "Flow Process": valueForSheet(r.flowprocess),
          "Round PR": valueForSheet(r.roundpo),

          "R0 Company": valueForSheet(r.r0company),
          "R0 Submit Company": valueForSheet(r.r0submitcompany),
          "R0 Start Date": valueForSheet(r.r0startdate),
          "R0 Finish Date": valueForSheet(r.r0finishdate),

          "R1 Company": valueForSheet(r.r1company),
          "R1 Submit Company": valueForSheet(r.r1submitcompany),
          "R1 Start Date": valueForSheet(r.r1startdate),
          "R1 Finish Date": valueForSheet(r.r1finishdate),

          "R2 Company": valueForSheet(r.r2company),
          "R2 Submit Company": valueForSheet(r.r2submitcompany),
          "R2 Start Date": valueForSheet(r.r2startdate),
          "R2 Finish Date": valueForSheet(r.r2finishdate),

          "R3 Company": valueForSheet(r.r3company),
          "R3 Submit Company": valueForSheet(r.r3submitcompany),
          "R3 Start Date": valueForSheet(r.r3startdate),
          "R3 Finish Date": valueForSheet(r.r3finishdate),

          "R4 Company": valueForSheet(r.r4company),
          "R4 Submit Company": valueForSheet(r.r4submitcompany),
          "R4 Start Date": valueForSheet(r.r4startdate),
          "R4 Finish Date": valueForSheet(r.r4finishdate),

          "R5 Company": valueForSheet(r.r5company),
          "R5 Submit Company": valueForSheet(r.r5submitcompany),
          "R5 Start Date": valueForSheet(r.r5startdate),
          "R5 Finish Date": valueForSheet(r.r5finishdate),

          "Winner PO": valueForSheet(r.winnerpo),
          "Email Winner PO": valueForSheet(r.emailwinnerpo),
          "No PO": valueForSheet(r.nopo),
          "Price (Rp) Excl. PPn": valueForSheet(r.pricerp),
          "CQS Create Date": valueForSheet(r.cqscreatedate),
          "CQS Approval Date": valueForSheet(r.cqsapprovaldate),
          "PO Create Date": valueForSheet(r.pocreatedate),
          "PO Del. Date": valueForSheet(r.podeldate),
          "Actual PO Rel. Date": valueForSheet(r.actualporeleasedate),
          "Actual PO Del. Date": valueForSheet(r.actualpodeldate),
          "Days Calender (Days)": valueForSheet(r.days),
          "Actual Received PO (GRN Date)": valueForSheet(r.actualreceivedpo),
          "Note": valueForSheet(r.note),

          "Folder ID": valueForSheet(r.folderid),
          "Folder LINK": valueForSheet(r.folderlink),
        }));
    }

    async function saveToGoogleSheet() {
      if (blockProcurementAdminMutation()) return;
      
      saveProcurementCache();

      try {
        
        procurementAdmin = procurementAdmin.map(row => syncActiveRoundFields(row));

        const rowsForSheet = serializeProcurementRowsForSheet(procurementAdmin);

        console.log("SAVE START");

        console.log("URL:", GAS_URL);
        
        console.log("ROWS:", rowsForSheet.length)

        console.table(
            rowsForSheet.map(r => ({
                PR: r["No PR"],
                FolderID: r["Folder ID"],
                FolderLINK: r["Folder LINK"]
            }))
        );

        const res = await fetch(GAS_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "BATCH_REPLACE_PROCUREMENT",
            sheet: SHEET_NAME,
            rows: rowsForSheet,
            expectedRevision: ADMIN_SHEET_REVISION
          })
        });
        
        console.log("STATUS:", res.status);
        
        console.log("OK:", res.ok);
        
        const txt = await res.text();

        console.log("SAVE RESPONSE:", txt);

        let result = {};

        try {
          result = JSON.parse(txt);
        } catch(err) {
          console.warn("Response bukan JSON:", txt);
        }

        if(result.success === false){
          throw new Error(result.message || "Gagal menyimpan");
        }
        if (result.revision != null) ADMIN_SHEET_REVISION = Number(result.revision);

        console.log("✅ Data tersimpan ke Google Sheet");
        
        updateLastSync();

      } catch(err) {

        showToast(
            "Gagal menyimpan ke Google Sheet\n\n" +
            err.message,
            "error"
        );

      }
    }

    function decodeXmlText(value) {
      return String(value || "").replace(
        /&#x([0-9a-fA-F]+);|&#(\d+);|&quot;|&apos;|&lt;|&gt;|&amp;/g,
        (match, hex, dec) => {
          if (hex) return String.fromCodePoint(parseInt(hex, 16));
          if (dec) return String.fromCodePoint(parseInt(dec, 10));
          return {
            "&quot;": '"', "&apos;": "'", "&lt;": "<",
            "&gt;": ">", "&amp;": "&"
          }[match] || match;
        }
      );
    }

    function getXmlAttribute(attributes, name) {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = String(attributes || "").match(
        new RegExp(`(?:^|\\s)${escaped}=(["'])([\\s\\S]*?)\\1`)
      );
      return match ? decodeXmlText(match[2]) : "";
    }

    function resolveZipPath(basePath, targetPath) {
      const target = String(targetPath || "").replace(/^\//, "");
      if (target.startsWith("xl/")) return target;

      const parts = String(basePath || "").split("/");
      parts.pop();

      target.split("/").forEach(part => {
        if (!part || part === ".") return;
        if (part === "..") parts.pop();
        else parts.push(part);
      });

      return parts.join("/");
    }

    async function readZipDirectory(file) {
      const tailSize = Math.min(file.size, 65557);
      const tailOffset = file.size - tailSize;
      const tail = new DataView(await file.slice(tailOffset).arrayBuffer());
      let eocd = -1;

      for (let i = tail.byteLength - 22; i >= 0; i--) {
        if (tail.getUint32(i, true) === 0x06054b50) {
          eocd = i;
          break;
        }
      }

      if (eocd < 0) throw new Error("Struktur ZIP/XLSX tidak valid.");

      const directorySize = tail.getUint32(eocd + 12, true);
      const directoryOffset = tail.getUint32(eocd + 16, true);
      if (directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
        throw new Error("File ZIP64 belum didukung oleh import browser.");
      }

      const bytes = new Uint8Array(
        await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer()
      );
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const decoder = new TextDecoder("utf-8");
      const entries = new Map();
      let offset = 0;

      while (offset + 46 <= bytes.byteLength) {
        if (view.getUint32(offset, true) !== 0x02014b50) break;

        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

        entries.set(name, {
          name, method, compressedSize, uncompressedSize, localOffset
        });

        offset += 46 + nameLength + extraLength + commentLength;
      }

      return entries;
    }

    async function openZipEntryStream(file, entry) {
      if (!entry) throw new Error("Bagian file XLSX tidak ditemukan.");

      const local = new DataView(
        await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer()
      );
      if (local.getUint32(0, true) !== 0x04034b50) {
        throw new Error(`Local ZIP header tidak valid: ${entry.name}`);
      }

      const nameLength = local.getUint16(26, true);
      const extraLength = local.getUint16(28, true);
      const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
      const compressed = file
        .slice(dataOffset, dataOffset + entry.compressedSize)
        .stream();

      if (entry.method === 0) return compressed;
      if (entry.method === 8) {
        if (typeof DecompressionStream !== "function") {
          throw new Error("Browser belum mendukung pembacaan Excel besar. Gunakan Edge/Chrome terbaru.");
        }
        return compressed.pipeThrough(new DecompressionStream("deflate-raw"));
      }

      throw new Error(`Metode kompresi XLSX tidak didukung (${entry.method}).`);
    }

    async function readZipEntryText(file, entry) {
      const reader = (await openZipEntryStream(file, entry)).getReader();
      const decoder = new TextDecoder("utf-8");
      let text = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }

      return text + decoder.decode();
    }

    function parseStylesXml(xml) {
      const customFormats = {};
      const numFmtRegex = /<numFmt\b([^>]*)\/?\s*>/g;
      let numFmt;

      while ((numFmt = numFmtRegex.exec(xml))) {
        const id = Number(getXmlAttribute(numFmt[1], "numFmtId"));
        const code = getXmlAttribute(numFmt[1], "formatCode");
        if (Number.isFinite(id) && code) customFormats[id] = code;
      }

      const builtInFormats = window.XLSX?.SSF?._table || {};
      const cellXfsMatch = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
      if (!cellXfsMatch) return [];

      const formats = [];
      const xfRegex = /<xf\b([^>]*)\/?\s*>/g;
      let xf;
      while ((xf = xfRegex.exec(cellXfsMatch[1]))) {
        const numFmtId = Number(getXmlAttribute(xf[1], "numFmtId") || 0);
        formats.push(customFormats[numFmtId] || builtInFormats[numFmtId] || "General");
      }
      return formats;
    }

    function formatImportedExcelNumber(value, formatCode) {
      if (!formatCode || formatCode === "General" || !window.XLSX?.SSF?.format) {
        return value;
      }

      try {
        return XLSX.SSF.format(formatCode, value);
      } catch (error) {
        console.warn("Format Excel tidak dapat diterapkan:", formatCode, error);
        return value;
      }
    }

    function parseSharedStringsXml(xml) {
      const values = [];
      const itemRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
      let item;

      while ((item = itemRegex.exec(xml))) {
        let value = "";
        const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let text;
        while ((text = textRegex.exec(item[1]))) {
          value += decodeXmlText(text[1]);
        }
        values.push(value);
      }

      return values;
    }

    function columnIndexFromReference(reference) {
      const match = String(reference || "").match(/^([A-Z]+)/i);
      if (!match) return -1;

      return match[1].toUpperCase().split("").reduce(
        (result, char) => result * 26 + char.charCodeAt(0) - 64,
        0
      ) - 1;
    }

    function parseWorksheetRowXml(rowXml, sharedStrings, styleFormats = []) {
      const row = [];
      const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cell;

      while ((cell = cellRegex.exec(rowXml))) {
        const attributes = cell[1] || "";
        const body = cell[2] || "";
        const index = columnIndexFromReference(getXmlAttribute(attributes, "r"));
        if (index < 0) continue;

        const type = getXmlAttribute(attributes, "t");
        const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const rawValue = valueMatch ? decodeXmlText(valueMatch[1]) : "";
        let value = "";

        if (type === "s") {
          value = sharedStrings[Number(rawValue)] ?? "";
        } else if (type === "inlineStr") {
          const pieces = [];
          const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
          let text;
          while ((text = textRegex.exec(body))) pieces.push(decodeXmlText(text[1]));
          value = pieces.join("");
        } else if (type === "b") {
          value = rawValue === "1";
        } else if (type === "str" || type === "e") {
          value = rawValue;
        } else if (rawValue !== "" && Number.isFinite(Number(rawValue))) {
          const numericValue = Number(rawValue);
          const styleIndex = Number(getXmlAttribute(attributes, "s") || 0);
          value = formatImportedExcelNumber(numericValue, styleFormats[styleIndex]);
        } else {
          value = rawValue;
        }

        row[index] = value;
      }

      return row;
    }

    async function resolveWorksheetEntry(file, entries) {
      const workbookEntry = entries.get("xl/workbook.xml");
      const relsEntry = entries.get("xl/_rels/workbook.xml.rels");
      if (!workbookEntry || !relsEntry) {
        return entries.get("xl/worksheets/sheet1.xml");
      }

      const workbookXml = await readZipEntryText(file, workbookEntry);
      const relsXml = await readZipEntryText(file, relsEntry);
      const sheets = [];
      const sheetRegex = /<sheet\b([^>]*)\/?\s*>/g;
      let sheet;

      while ((sheet = sheetRegex.exec(workbookXml))) {
        sheets.push({
          name: getXmlAttribute(sheet[1], "name"),
          relationshipId: getXmlAttribute(sheet[1], "r:id")
        });
      }

      const selected = sheets.find(item => item.name === "Procurement") || sheets[0];
      if (!selected) return entries.get("xl/worksheets/sheet1.xml");

      const relationshipRegex = /<Relationship\b([^>]*)\/?\s*>/g;
      let relationship;
      while ((relationship = relationshipRegex.exec(relsXml))) {
        if (getXmlAttribute(relationship[1], "Id") !== selected.relationshipId) continue;
        const target = getXmlAttribute(relationship[1], "Target");
        return entries.get(resolveZipPath("xl/workbook.xml", target));
      }

      return entries.get("xl/worksheets/sheet1.xml");
    }

    async function readLargeProcurementXlsx(file) {
      const entries = await readZipDirectory(file);
      const worksheetEntry = await resolveWorksheetEntry(file, entries);
      if (!worksheetEntry) throw new Error("Worksheet Procurement tidak ditemukan.");

      const sharedEntry = entries.get("xl/sharedStrings.xml");
      const sharedStrings = sharedEntry
        ? parseSharedStringsXml(await readZipEntryText(file, sharedEntry))
        : [];
      const stylesEntry = entries.get("xl/styles.xml");
      const styleFormats = stylesEntry
        ? parseStylesXml(await readZipEntryText(file, stylesEntry))
        : [];

      const stream = await openZipEntryStream(file, worksheetEntry);
      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8");
      const matrix = [];
      let buffer = "";
      let headerFound = false;
      let dataStarted = false;
      let blankStreak = 0;
      let parsedRows = 0;
      let stopped = false;

      const processBufferedRows = () => {
        while (true) {
          const start = buffer.indexOf("<row");
          if (start < 0) {
            buffer = buffer.slice(-16);
            return false;
          }

          const end = buffer.indexOf("</row>", start);
          if (end < 0) {
            buffer = buffer.slice(start);
            return false;
          }

          const rowXml = buffer.slice(start, end + 6);
          buffer = buffer.slice(end + 6);
          parsedRows += 1;

          const row = parseWorksheetRowXml(rowXml, sharedStrings, styleFormats);
          const hasAnyValue = row.some(value => String(value ?? "").trim() !== "");

          if (!headerFound) {
            const mappedHeaders = row.map(humanToKeyMap);
            const mappedCount = mappedHeaders.filter(Boolean).length;
            if (mappedCount >= 2) {
              headerFound = true;
              matrix.push(row);
            }
            continue;
          }

          if (hasAnyValue) {
            dataStarted = true;
            blankStreak = 0;
            matrix.push(row);
          } else if (dataStarted) {
            blankStreak += 1;
          }

          // File sumber dapat memiliki formula sampai baris 1.048.576.
          // Setelah data berakhir, hentikan pembacaan agar browser tidak membeku.
          if (dataStarted && blankStreak >= 50) return true;
          if (parsedRows >= 100000) {
            throw new Error("Data aktual melebihi batas aman 100.000 baris.");
          }
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          if (processBufferedRows()) {
            stopped = true;
            await reader.cancel("Data procurement sudah selesai dibaca.");
            break;
          }
        }

        if (!stopped) {
          buffer += decoder.decode();
          processBufferedRows();
        }
      } finally {
        try { reader.releaseLock(); } catch (_) {}
      }

      if (!headerFound) throw new Error("Header Procurement tidak ditemukan pada worksheet.");
      return matrix;
    }

    function matrixToExcelObjects(matrix, headerRow) {
      const headers = (matrix[headerRow] || []).map(value => String(value ?? "").trim());
      return matrix.slice(headerRow + 1).map(row => {
        const item = {};
        headers.forEach((header, index) => {
          if (header) item[header] = row[index] ?? "";
        });
        return item;
      });
    }

    function isPRWithoutAssignAllowed(statusPR) {
      const status = String(statusPR || "")
        .trim()
        .toUpperCase()
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ");

      return ["CANCEL", "CANCELLED", "CANCELED", "PRB"].includes(status);
    }

    function importBusinessKey(row) {
      const noPR = String(row?.noPR || "").trim().toUpperCase().replace(/\s+/g, "");
      const assignDate = parseFlexibleDate(row?.assignprdate);

      // No PR dan Assign Date tidak wajib untuk import. Keduanya hanya
      // dipakai sebagai kunci pencocokan bila sama-sama tersedia dan valid.
      if (!noPR || !assignDate || Number.isNaN(assignDate.getTime())) return "";

      return `${assignDate.getFullYear()}|${noPR}`;
    }

    function comparableImportValue(key, value) {
      if (value == null) return "";
      if (DATE_KEYS.includes(key) || String(key).toLowerCase().includes("date")) {
        const parsed = parseFlexibleDate(value);
        if (parsed && !Number.isNaN(parsed.getTime())) {
          return [
            parsed.getFullYear(),
            String(parsed.getMonth() + 1).padStart(2, "0"),
            String(parsed.getDate()).padStart(2, "0")
          ].join("-");
        }
      }
      return String(value)
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    }

    function importRowHasChanges(existing, incoming) {
      const importedKeys = Array.isArray(incoming?.__importedKeys)
        ? incoming.__importedKeys
        : Object.keys(incoming || {});

      return importedKeys.some(key => {
        if (!key || key.startsWith("__") || [
          "procurementId", "ownerName", "ownerNIP", "ownerEmail",
          "createdAt", "createdBy", "updatedAt", "updatedBy", "prYear"
        ].includes(key)) return false;

        const incomingValue = incoming[key];
        // Sel kosong tidak dianggap sebagai instruksi untuk menghapus data lama.
        if (String(incomingValue ?? "").trim() === "") return false;
        return comparableImportValue(key, existing?.[key]) !==
          comparableImportValue(key, incomingValue);
      });
    }

    function buildSmartImportPreview(mappedRows) {
      const existingMap = new Map();
      (procurementAdmin || []).forEach(row => {
        const key = importBusinessKey(row);
        if (key) existingMap.set(key, row);
      });

      const seen = new Set();
      const preview = {
        NEW: [],
        UPDATE: [],
        UNCHANGED: [],
        INVALID: [],
        DUPLICATE_FILE: []
      };

      mappedRows.forEach((row, index) => {
        const sourceRow = index + 2;
        const key = importBusinessKey(row);

        // Kunci wajib supaya import dapat dibedakan secara deterministik antara
        // NEW dan UPDATE. Baris tanpa kunci tidak boleh menjadi duplikat baru.
        if (!key) {
          row.prYear = "";
          row.__importAction = "SKIP";
          preview.INVALID.push({ row, sourceRow, key: "" });
          return;
        }

        const [year] = key.split("|");
        row.prYear = Number(year);

        if (seen.has(key)) {
          row.__importAction = "SKIP";
          preview.DUPLICATE_FILE.push({ row, sourceRow, key });
          return;
        }
        seen.add(key);

        const existing = existingMap.get(key);
        if (!existing) {
          row.__importAction = "NEW";
          preview.NEW.push({ row, sourceRow, key });
        } else if (importRowHasChanges(existing, row)) {
          row.__importAction = "UPDATE";
          preview.UPDATE.push({ row, sourceRow, key, existing });
        } else {
          row.__importAction = "SKIP";
          preview.UNCHANGED.push({ row, sourceRow, key, existing });
        }
      });

      preview.rowsToImport = preview.NEW.map(item => item.row);
      return preview;
    }

    function confirmSmartImport(preview, fileName, selectedCount) {
      const lines = [
        `SMART IMPORT — ${fileName || "File Excel"}`,
        "",
        `Data baru                 : ${preview.NEW.length}`,
        `Kecocokan data lama       : ${preview.UPDATE.length}`,
        `Tidak berubah (dilewati)  : ${preview.UNCHANGED.length}`,
        `Duplikat di dalam file    : ${preview.DUPLICATE_FILE.length}`,
        `Kunci tidak valid         : ${preview.INVALID.length}`,
        `Akan diproses             : ${selectedCount}`,
        "",
        "Kunci data menggunakan No PR + tahun Assign Date.",
        "Data sama, duplikat file, atau kunci tidak valid otomatis dilewati.",
        "Lanjutkan Smart Import?"
      ];
      return window.confirm(lines.join("\n"));
    }

    function escapeSmartImportHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[character]);
    }

    function resolveSmartImportConflicts(preview, fileName) {
      const conflicts = [
        ...preview.UPDATE.map(item => ({ ...item, conflictType: "MATCH_EXISTING", defaultAction: "UPDATE" })),
        ...preview.DUPLICATE_FILE.map(item => ({ ...item, conflictType: "DUPLICATE_FILE", defaultAction: "SKIP" }))
      ];
      if (!conflicts.length) return Promise.resolve(true);

      return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "smart-import-conflict-overlay";
        overlay.style.cssText = [
          "position:fixed","inset:0","z-index:100000","background:rgba(15,23,42,.62)",
          "display:flex","align-items:center","justify-content:center","padding:18px"
        ].join(";");
        overlay.innerHTML = `
          <section role="dialog" aria-modal="true" aria-labelledby="smartImportConflictTitle"
            style="width:min(980px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.32)">
            <header style="position:sticky;top:0;background:#fff;padding:18px 20px;border-bottom:1px solid #e2e8f0;z-index:2">
              <h2 id="smartImportConflictTitle" style="font-size:20px;font-weight:800;margin:0">Pilih tindakan Smart Import</h2>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px">
                ${escapeSmartImportHtml(fileName || "File Excel")}
                — No PR dan Assign Date yang sama memerlukan keputusan pengguna.
              </p>
            </header>
            <div style="padding:16px 20px">
              <div style="overflow:auto;border:1px solid #e2e8f0;border-radius:12px">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <thead style="background:#f8fafc"><tr>
                    <th style="padding:10px;text-align:left">Baris</th>
                    <th style="padding:10px;text-align:left">No PR</th>
                    <th style="padding:10px;text-align:left">Assign Date</th>
                    <th style="padding:10px;text-align:left">Kondisi</th>
                    <th style="padding:10px;text-align:left">Tindakan</th>
                  </tr></thead>
                  <tbody>
                    ${conflicts.map((item, index) => `
                      <tr style="border-top:1px solid #e2e8f0">
                        <td style="padding:10px">${item.sourceRow}</td>
                        <td style="padding:10px">${escapeSmartImportHtml(item.row?.noPR || "")}</td>
                        <td style="padding:10px">${escapeSmartImportHtml(item.row?.assignprdate || "")}</td>
                        <td style="padding:10px">${item.conflictType === "MATCH_EXISTING" ? "Sudah ada di Google Sheet/cache" : "Duplikat di file yang sama"}</td>
                        <td style="padding:10px">
                          <select data-smart-import-action="${index}" style="min-width:155px;padding:7px;border:1px solid #cbd5e1;border-radius:8px">
                            <option value="UPDATE" ${item.defaultAction === "UPDATE" ? "selected" : ""}>Update/Gabungkan</option>
                            <option value="SKIP" ${item.defaultAction === "SKIP" ? "selected" : ""}>Abaikan</option>
                          </select>
                        </td>
                      </tr>`).join("")}
                  </tbody>
                </table>
              </div>
            </div>
            <footer style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e2e8f0">
              <button type="button" data-smart-import-cancel style="padding:9px 14px;border:1px solid #cbd5e1;border-radius:9px;background:#fff">Batal</button>
              <button type="button" data-smart-import-confirm style="padding:9px 14px;border:0;border-radius:9px;background:#0369a1;color:#fff;font-weight:700">Gunakan pilihan</button>
            </footer>
          </section>`;
        document.body.appendChild(overlay);

        const finish = value => {
          overlay.remove();
          resolve(value);
        };
        overlay.querySelector("[data-smart-import-cancel]")?.addEventListener("click", () => finish(false));
        overlay.querySelector("[data-smart-import-confirm]")?.addEventListener("click", () => {
          conflicts.forEach((item, index) => {
            const action = overlay.querySelector(`[data-smart-import-action="${index}"]`)?.value || item.defaultAction;
            item.row.__importAction = action;
          });
          finish(true);
        });
      });
    }

    async function importExcel(e){
      if (blockProcurementAdminMutation()) {
        if (e?.target) e.target.value = "";
        return;
      }
      const input = e?.target || document.getElementById("excelFile");
      const file = input?.files?.[0];
      if (!file) return;
      if (isImporting) {
        showToast("Import lain masih diproses. Tunggu sampai selesai.", "info");
        if (input) input.value = "";
        return;
      }
      isImporting = true;

      try {
        if (!window.XLSX) {
          throw new Error("Library Excel belum termuat. Periksa koneksi internet lalu muat ulang halaman.");
        }

        showToast("Sedang membaca file Excel...", "info");
        const isXlsx = /\.xlsx$/i.test(file.name || "");
        let matrix;
        let raw;

        // File procurement lama dapat memiliki used-range sampai 1.048.576 baris.
        // Pembaca streaming dipakai untuk file besar agar memori browser tetap aman.
        if (isXlsx && file.size >= 8 * 1024 * 1024) {
          showToast("File besar terdeteksi. Membaca hanya baris data aktual...", "info");
          matrix = await readLargeProcurementXlsx(file);
        } else {
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, {
            type: "array",
            cellDates: true,
            dense: true,
            sheetRows: 100000
          });
          if (!wb.SheetNames?.length) throw new Error("Workbook tidak memiliki sheet.");

          const sheet = wb.Sheets[
            wb.SheetNames.includes("Procurement") ? "Procurement" : wb.SheetNames[0]
          ];
          matrix = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false
          });
        }

        const headerRow = matrix.findIndex(row => {
          const mappedHeaders = row.map(humanToKeyMap).filter(Boolean);
          return mappedHeaders.length >= 2;
        });
        if (headerRow < 0) {
          throw new Error("Header Excel tidak dikenali. Pastikan file memiliki minimal dua kolom procurement yang dikenal.");
        }

        raw = matrixToExcelObjects(matrix, headerRow);
        const mapped = mapExcelRows(raw, { preserveImportedFormat: true, origin: "IMPORT" }).filter(row =>
          Object.entries(row).some(
            ([key, value]) => !key.startsWith("__") && key !== "no" && String(value ?? "").trim() !== ""
          )
        );
        if (!mapped.length) throw new Error("Tidak ada baris data yang dapat diimpor.");

        const preview = buildSmartImportPreview(mapped);

        const selectedRows = [
          ...preview.NEW.map(item => item.row),
          ...preview.UPDATE.map(item => item.row)
        ];

        if (!confirmSmartImport(preview, file.name, selectedRows.length)) {
          showToast("Smart Import dibatalkan sebelum penyimpanan.", "info");
          return;
        }

        if (!selectedRows.length) {
          showToast("Tidak ada baris yang dipilih untuk diimpor.", "info");
          return;
        }

        const rowsForImport = serializeProcurementRowsForSheet(
          selectedRows.map(row => syncActiveRoundFields(row))
        ).map((serialized, index) => ({
          ...serialized,
          "Import Action": String(selectedRows[index].__importAction || "NEW").toUpperCase()
        }));

        showToast("Menyimpan Smart Import untuk akun aktif...", "info");
        const result = await postProcurementAction({
          action: "BATCH_IMPORT_PROCUREMENT_BY_BUYER",
          sheet: SHEET_NAME,
          rows: rowsForImport,
          expectedRevision: ADMIN_SHEET_REVISION,
          clientMutationId: `IMPORT-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`
        });

        if (result.queued || result.pendingSync) {
          selectedRows.forEach(row => {
            if (!row.procurementId) row.procurementId = `LOCAL-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          });
          selectedRows.forEach(row => {
            const action = String(row.__importAction || "NEW").toUpperCase();
            if (action === "UPDATE") {
              const key = importBusinessKey(row);
              const index = key ? procurementAdmin.findIndex(existing => importBusinessKey(existing) === key) : -1;
              if (index >= 0) {
                const merged = { ...procurementAdmin[index] };
                Object.entries(row).forEach(([field, value]) => {
                  if (!field.startsWith("__") && String(value ?? "").trim() !== "") merged[field] = value;
                });
                procurementAdmin[index] = merged;
                return;
              }
            }
            procurementAdmin.push(row);
          });
          saveProcurementCache();
          refreshTableView();
          showToast("Import disimpan di cache sebagai Pending Sync. Google Sheet akan diperbarui saat koneksi tersedia.", "info");
          return;
        }

        await loadFromGoogleSheet(true);
        const buyerLabel = result.ownerName || result.ownerEmail || "akun aktif";
        showToast(
          `${result.importedCount ?? rowsForImport.length} baris diproses untuk ${buyerLabel}. ` +
          `${result.addedCount || 0} data baru, ${result.updatedCount || 0} diperbarui, ` +
          `${result.unchangedCount || 0} tidak berubah, dan ${result.duplicateFileCount || 0} duplikat dilewati.`,
          "success"
        );
      } catch (err) {
        console.error("Import Excel gagal:", err);
        showToast("Import gagal: " + (err?.message || err), "error");
        alert("Import Excel gagal:\n\n" + (err?.message || err));
      } finally {
        isImporting = false;
        if (input) input.value = "";
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

    function buildSubmitCompanyChecklist(row){

        const company =
            String(row.roundcompany || "")
            .split(/\r?\n|;/)
            .map(v=>v.trim())
            .filter(v=>v);

        const submit =
            new Set(
                String(row.roundsubmitcompany || "")
                .split(/\r?\n|;/)
                .map(v=>v.trim())
                .filter(v=>v)
            );

        return company.map(v=>`

      <label class="flex items-center gap-2">

      <input
      type="checkbox"
      value="${v}"
      ${submit.has(v) ? "checked" : ""}>

      <span>${v}</span>

      </label>

      `).join("");

    }

    function getSubmitCompanyValue(td){

        return Array
            .from(
                td.querySelectorAll(
                    "input[type=checkbox]:checked"
                )
            )
            .map(v=>v.value)
            .join("\n");

    }

    function renderTable(data = procurementAdmin){
      renderHeader();
      const tbody = document.getElementById("tableBody");

      tbody.ondblclick = function(e){

          const tr = e.target.closest("tr");

          if(!tr) return;

          const index = Number(tr.dataset.index);

          const row = procurementAdmin[index];

          if(!row){
              console.error("Data row tidak ditemukan:", index);
              return;
          }

          console.log("INDEX :", index);
          console.log("DATA :", row);
          console.log("NO PR :", row.noPR);

          if(!row.noPR){
              alert("No PR kosong, tidak bisa buka Form");
              return;
          }

          openForm(
              `workspace/index.html?pr=${encodeURIComponent(row.noPR)}`
          );

      };

      tbody.innerHTML="";
      data.forEach((row, idx)=>{
        const tr = document.createElement("tr");
        const realIdx = row.__realIndex ?? idx;
        const roundView = getRoundViewValues(row, realIdx);
        tr.dataset.index = realIdx;
        tr.addEventListener("contextmenu", event => showRowContextMenu(event, realIdx, tr));

        // ✅ Auto nomor urut (1., 2., 3., ...)
        row.no = (idx + 1) ;

        // Perhitungan otomatis hanya untuk data Add New. Nilai hasil import
        // harus tetap sama dengan sumber Excel/Google Sheet.
        if (!shouldPreserveImportedFormat(row) && row.pocreatedate && row.podeldate) {
          const d1 = parseFlexibleDate(row.podeldate);
          const d2 = parseFlexibleDate(row.pocreatedate);

          if (d1 && d2) {
            const diff = Math.round(
              (d1 - d2) / (1000 * 60 * 60 * 24)
            );

            row.days = diff.toString();
          } else {
            row.days = "";
          }
        } else if (!shouldPreserveImportedFormat(row)) {
          row.days = "";
        }
        
        // Hitung Actual PO Del. Date hanya untuk data Add New.
        const rel = parseFlexibleDate(row.actualporeleasedate);
        if (!shouldPreserveImportedFormat(row) && !rel) {
          row.actualpodeldate = "";
        } else if (!shouldPreserveImportedFormat(row)) {
          const n = parseInt(String(row.days).replace(/[^\d-]/g,""),10);
          if (isNaN(n)) {
            row.actualpodeldate = "";
          } else {
            const out = new Date(rel);
            out.setDate(out.getDate() + n);
            row.actualpodeldate = out.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
          }
        }
       
        // Simpan nilai asli Est. Price US - RP sebelum ditimpa
        if (!row.estpriceus_original && row.estpriceus && row.estpriceus !== "") {
          row.estpriceus_original = row.estpriceus;
        }
        
        COLUMNS.forEach(col=>{
          const td = document.createElement("td");
          td.className = "px-3 py-2 border";
          if (DATE_KEYS.includes(col.key)) td.classList.add("text-center");
          td.dataset.key = col.key;

          td.contentEditable = "false";
          if(col.width){

              td.style.width = col.width;
              td.style.minWidth = col.width;
              td.style.maxWidth = col.width;

          }   // << patuh width

          if (col.key === "roundpo") {
            td.contentEditable = "false";
            td.classList.remove("bg-yellow-50");

            const currentRoundRaw = String(roundView.roundpo || "").trim().toUpperCase();
            const currentRound = ROUND_OPTIONS.includes(currentRoundRaw) ? currentRoundRaw : "";

            td.innerHTML = `
              <select class="border border-gray-300 rounded px-2 py-1 w-full bg-white"
                      onchange="updateRoundPR(${realIdx}, this.value)">
                ${ROUND_OPTIONS.map(opt => `
                  <option value="${opt}" ${opt === currentRound ? "selected" : ""}>${opt}</option>
                `).join("")}
              </select>
            `;
          }
          
          else if (col.key === "roundsubmitcompany") {

              td.contentEditable = "false";

              td.style.whiteSpace = "pre-wrap";
              td.style.wordBreak = "break-word";

              const submitText = String(roundView.roundsubmitcompany ?? "")
                  .replace(/\r\n/g, "\n")
                  .replace(/\r/g, "\n");
              td.innerText = shouldPreserveImportedFormat(row)
                ? submitText
                : submitText.replace(/;/g, "\n");

          }

          else if (
            col.key === "roundstartdate" ||
            col.key === "roundfinishdate"
          ) {

            if (VIEW_ONLY) {

              td.textContent = formatDisplayDate(roundView[col.key]);
              td.classList.add("text-center");

            } else {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");

              const selectedRound =
                String(row.roundpo || "")
                .trim()
                .toUpperCase();

              if (
                selectedRound === "" ||
                selectedRound === ""
              ) {

                td.textContent = "";

              } else {

                td.innerHTML = `
                  <input type="date"
                    value="${dateValueForInput(row[col.key])}"
                    class="border border-gray-300 rounded px-2 py-1 w-full bg-white"
                    onchange="
                      updateRoundDate(
                        ${realIdx},
                        '${col.key}',
                        this.value
                      )
                    ">
                `;
              }
            }
          }

          else if (DATE_KEYS.includes(col.key)) {

            if (VIEW_ONLY) {

              td.textContent = formatDateForColumn(row[col.key], col.key);
              td.classList.add("text-center");

            } else {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");

              td.innerHTML = `
                <input
                  type="date"
                  value="${dateValueForInput(row[col.key])}"
                  class="border border-gray-300 rounded px-2 py-1 w-full bg-white"
                  onchange="updateDateField(${realIdx}, '${col.key}', this.value)"
                >
              `;
            }
          }
  
          else if (col.key === "actualpodeldate" ||
              col.key === "days" ||
              col.key === "folderid" ||
              col.key === "folderlink"
          ) {

            td.contentEditable = "false";
            td.classList.remove("bg-yellow-50");

            let value = String(row[col.key] ?? "");

            td.textContent = value;
          }
  
          else if (col.key === "pengadaan") {

            if (VIEW_ONLY) {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");
              td.textContent = row.pengadaan || "";

            } else {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");

              const current = row.pengadaan || "";

              td.innerHTML = `
                <select
                  class="border border-gray-300 rounded px-2 py-1 w-full bg-white"
                  onchange="
                    procurementAdmin[${realIdx}].pengadaan=this.value;
                  ">
                  <option value=""></option>
                  ${PENGADAAN_OPTIONS.map(opt=>`
                    <option value="${opt}"
                      ${opt===current?"selected":""}>
                      ${opt}
                    </option>
                  `).join("")}
                </select>
              `;
            }
          }
          else if (col.key === "statuspr") {

            if (VIEW_ONLY) {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");
              td.textContent = row.statuspr || "";

            } else {

              td.contentEditable = "false";
              td.classList.remove("bg-yellow-50");

              const current = row.statuspr || "";

              td.innerHTML = `
                <select
                  class="border border-gray-300 rounded px-2 py-1 w-full bg-white"
                  onchange="
                    procurementAdmin[${realIdx}].statuspr=this.value;
                  ">
                  <option value=""></option>
                  ${STATUS_PR_OPTIONS.map(opt=>`
                    <option value="${opt}"
                      ${opt===current?"selected":""}>
                      ${opt}
                    </option>
                  `).join("")}
                </select>
              `;
            }
          }

          else if (col.key === "winnerpo") {

              td.contentEditable = false;
              td.classList.remove("bg-yellow-50");

              td.textContent = row.winnerpo || "";

          }

          else if (col.key === "emailwinnerpo") {

            td.contentEditable = "false";
            td.classList.remove("bg-yellow-50");

            td.textContent = row.emailwinnerpo || "";
          }

          else {
            const roundDisplayKeys = new Set([
              "finalvendorlist", "finalsubmitvendor", "roundcompany"
            ]);
            let val = roundDisplayKeys.has(col.key)
              ? (roundView[col.key] ?? "")
              : (row[col.key] ?? "");
          
            // Format tanggal jika kolomnya termasuk tipe tanggal
            if (
              typeof DATE_KEYS !== "undefined" && 
              Array.isArray(DATE_KEYS) && 
              DATE_KEYS.includes(col.key)
            ) {
              const d = parseFlexibleDate(val);
              val = d 
                ? d.toLocaleDateString("en-GB", {
                    day: "2-digit", 
                    month: "short",
                    year: "numeric" 
                  }) 
                : val;
            }
            
            // ✅ Format ribuan Indonesia jika kolomnya termasuk kolom harga (tampilan saja)
            if (
              typeof CURRENCY_KEYS !== "undefined" &&
              Array.isArray(CURRENCY_KEYS) &&
              CURRENCY_KEYS.includes(col.key) &&
              !shouldPreserveImportedFormat(row)
            ) {
              val = formatRibuanID(val);
            }

            // ✅ Aman: coercion ke string sebelum trim (tidak bikin error saat val = number/null)
            if (val == null)
                val = "";

            if (MULTILINE_KEYS.includes(col.key)) {

                td.style.whiteSpace = "pre-wrap";
                td.style.wordBreak = "break-word";

                const multilineText = String(val)
                    .replace(/\r\n/g,"\n")
                    .replace(/\r/g,"\n");
                td.innerText = shouldPreserveImportedFormat(row)
                    ? multilineText
                    : multilineText.replace(/;/g,"\n");

            } else {

                td.textContent = val;

            }
          }

          tr.appendChild(td)
          
          });


        tbody.appendChild(tr);

      });
      if (window.lucide) {
          lucide.createIcons();
      }
      // Fokus tabel tidak lagi dipindahkan otomatis setelah render.
      // Tabel hanya menerima fokus ketika pengguna memang mengklik tabel.
    }
    
    async function createFolder(index, options = {}){
      if (blockProcurementAdminMutation()) return null;

      const row = procurementAdmin[index];
      if (!row) throw new Error("Data row tidak ditemukan.");

      const cache = MSW.cache.load(PROCUREMENT_CACHE_KEY);

      if(!row.noPR){
        showToast("No PR kosong", "error");
        throw new Error("No PR kosong.");
      }

      const payload = {
        action: "createFolder",
        createStructure: options.ensureStructure !== false,
        noPR: row.noPR,
        description: row.Description,
        folderId: row.folderid || "",
        folderUrl: row.folderlink || "",
        rounds: getRoundsForFolderStructure(row),
        folderTypes: PROCUREMENT_FOLDER_TYPES
      };

      try{
        showToast("Menyiapkan susunan folder...", "info");

        const res = await fetch(GAS_URL,{
            method:"POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });

        const text = await res.text();
        let result = {};
        try { result = JSON.parse(text); }
        catch (_) { throw new Error(text || `HTTP ${res.status}`); }

        if(!res.ok || result.success === false){
          throw new Error(result.message || "Gagal membuat folder.");
        }

        row.folderid = result.folderId || result.rootFolderId || row.folderid || "";
        row.folderlink = result.folderUrl || result.rootFolderUrl || row.folderlink || "";
        if (result.folderMap) row.folderstructure = result.folderMap;

        saveProcurementCache();
        refreshTableView();
        await saveSingleProcurementToGoogleSheet("EDIT", row, row.noPR);

        showToast(
          options.successMessage || result.message ||
          (result.alreadyExists ? "Folder sudah ada dan susunannya diperbarui." : "Folder dan susunannya berhasil dibuat."),
          "success"
        );

        return result;

      }catch(err){

        console.error("❌ Gagal membuat/menyiapkan folder:", err);

        if(cache && !procurementAdmin.length){
          procurementAdmin = cache;
          refreshTableView();
        }

        const el=document.getElementById("syncInfo");
        if(el && !navigator.onLine) el.textContent="Mode Offline (LocalStorage)";

        showToast(err.message || "Gagal membuat folder.", "error");
        throw err;
      }

    }

    function openFolder(index){

      const row = procurementAdmin[index];

      if(!row.folderlink){

        showToast("Folder belum dibuat.");

        return;
      }

      window.open(
        row.folderlink,
        "_blank"
      );

    }

    function applyBuyerProcurementHeader() {
      // Header Procurement Buyer hanya menampilkan Search dan Action.
      // Navigasi kembali ke Dashboard sudah tersedia di sidebar Workspace,
      // sehingga tombol Dashboard duplikat tidak dirender di halaman ini.
    }
    
    window.onload = async function () {

        applyBuyerProcurementHeader();

        initRowContextMenu();

        await loadCompanyData();

        // Cache dirender lebih dulu agar halaman cepat, lalu Google Sheet
        // tetap direfresh untuk menangkap perubahan dari user/perangkat lain.
        loadProcurementCache();
        await loadFromGoogleSheet(true);
    };
    
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");

    if (searchInput) {
        // Pulihkan wording terakhir. Nilai hanya dihapus ketika pengguna
        // mengosongkan input, menekan Escape, atau menekan tombol X/clear.
        searchInput.value = loadPersistedSearchText();

        const handleSearchInput = () => {
            persistSearchText(searchInput.value);
            scheduleFilterTable();
        };

        // Event "input" menangani ketik, paste, autofill, dan tombol clear bawaan.
        searchInput.addEventListener("input", handleSearchInput);
        searchInput.addEventListener("search", handleSearchInput);

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && searchInput.value) {
                searchInput.value = "";
                persistSearchText("");
                filterTable({ preserveSearchFocus: true });
                e.preventDefault();
            }
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            if (!searchInput) return;
            searchInput.value = "";
            persistSearchText("");
            filterTable({ preserveSearchFocus: true });
        });
    }

    const tableContainer = document.getElementById("tableContainer");

    if (tableContainer) {

        // Klik tabel = langsung fokus
        tableContainer.addEventListener("mousedown", () => {
            tableContainer.focus();
        });

        tableContainer.addEventListener("keydown", (e) => {

            const step = 60;

            switch (e.key) {

                case "ArrowRight":
                    tableContainer.scrollLeft += step;
                    e.preventDefault();
                    break;

                case "ArrowLeft":
                    tableContainer.scrollLeft -= step;
                    e.preventDefault();
                    break;

                case "ArrowDown":
                    tableContainer.scrollTop += step;
                    e.preventDefault();
                    break;

                case "ArrowUp":
                    tableContainer.scrollTop -= step;
                    e.preventDefault();
                    break;

                case "PageDown":
                    tableContainer.scrollTop += tableContainer.clientHeight;
                    e.preventDefault();
                    break;

                case "PageUp":
                    tableContainer.scrollTop -= tableContainer.clientHeight;
                    e.preventDefault();
                    break;

                case "Home":
                    tableContainer.scrollLeft = 0;
                    break;

                case "End":
                    tableContainer.scrollLeft = tableContainer.scrollWidth;
                    break;
            }

        });

    }

    if (window.MSW && MSW.table) {

        MSW.table.getContainer = function () {

            return document.getElementById("tableContainer");

        };

    }

    // Auto-refresh setiap 60 detik
    setInterval(() => loadFromGoogleSheet(false), 120000);
const excelFileInput = document.getElementById("excelFile");
if (excelFileInput) {
  excelFileInput.removeAttribute("onchange");
  excelFileInput.addEventListener("change", importExcel);
  excelFileInput.addEventListener("click", () => { excelFileInput.value = ""; });
}

}
