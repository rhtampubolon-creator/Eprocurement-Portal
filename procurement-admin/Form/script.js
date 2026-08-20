/* ==========================================
   PROCUREMENT FORM
========================================== */

const GAS_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();
const SHEET_NAME = "Admin";
const PROCUREMENT_CACHE_KEY = "MSW_PROCUREMENT_CACHE";
const COMPANY_CACHE_KEY = "MSW_COMPANY_CACHE";
const BIDDERLIST_CACHE_KEYS = ["MSW_BIDDERLIST_CACHE", "MSW_BIDDER_LIST_CACHE", "BIDDERLIST_CACHE"];
const BIDDERLIST_SHEET_NAMES = ["Bidderlist", "BidderList", "Bidder List"];
const IMPORT_PRESERVE_FLAG = "__preserveImportFormat";
const USD_IDR_FALLBACK_RATE = 17500;
const ROUND_OPTIONS = ["R0", "R1", "R2", "R3", "R4", "R5"];
const DOCUMENT_FOLDER_TYPES = [
    "01. PR Approval",
    "02. Bidderlist",
    "03. CQS",
    "04. PO",
    "05. Contract"
];
// Round dibedakan melalui nama file, bukan subfolder.
const ROUND_FOLDER_TYPES = new Set();

const params = new URLSearchParams(window.location.search);
const mode = String(params.get("mode") || "add").toLowerCase();
const prNumber = String(params.get("pr") || "").trim();

let procurementMode = mode === "edit" ? "EDIT" : "ADD";
let originalPR = "";
let originalData = null;
let loadedRow = {};
let currentRound = "R0";
let currentInvitationVendors = [];
let currentSubmittedVendors = [];
let roundStateInitialized = false;
let companyDirectory = null;
let formChanged = false;
let isSaving = false;
let progressTimer = null;
let folderStructure = null;
let folderManagerBusy = false;
let workflowReachedCQS = false;
let rfqResetApplied = false;
let extendedRebidRequest = null;
let usdRateSnapshot = {
    rate: 0,
    rateDate: "",
    source: "",
    locked: false
};

const byId = id => document.getElementById(id);
const form = byId("procurementForm");
const estPricePrInput = byId("estpricerp");
const estPriceUsInput = byId("estpriceus");
const usdRateDisplay = byId("usdRateDisplay");
const usdRateStatus = byId("usdRateStatus");
const syncUsdRateBtn = byId("syncUsdRateBtn");
const priceRpInput = byId("pricerp");
const rfqInput = byId("rfq");
const roundPOInput = byId("roundpo");
const winnerPOInput = byId("winnerpo");
const winnerEmailInput = byId("emailwinnerpo");

// Field bagian atas yang dikunci setelah proses mencapai Create CQS/CQS.
// Flow Process sengaja tidak dimasukkan supaya user tetap dapat memilih RFQ.
const TOP_WORKFLOW_FIELD_IDS = [
    "noPR", "Description", "previoussubmitpo", "pic", "assignprdate",
    "pengadaan", "departement", "statuspr", "rfq", "estpricerp", "roundpo"
];

const CQS_OR_LATER_FLOW_VALUES = new Set([
    "CREATE CQS", "CQS", "CREATE PO", "PO MAXIMO", "PO CONTRACT",
    "SIGN PO PROC", "DRAFTING CONTRACT", "ESIGN CONTRACT",
    "COMPLETED CONTRACT", "COMPLETED SIGN PO",
    "COMPLETE CONTRACT AND CANCEL PR", "COMPLETED SIGN PO CONTRACT",
    "LETTER OF APPOINTMENT", "PO SIGN VENDOR", "PROFORMA PO", "CANCEL"
]);

/* ==========================================
   GENERAL HELPERS
========================================== */

function asText(value) {
    return value == null ? "" : String(value).trim();
}

function shouldPreserveImportedFormat(row = loadedRow) {
    return Boolean(row && row[IMPORT_PRESERVE_FLAG] === true);
}

function uniqueValues(values) {
    const seen = new Set();
    return values.filter(value => {
        const key = asText(value).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function splitVendorList(value) {
    return uniqueValues(
        asText(value)
            .split(/\r?\n|;/)
            .map(item => item.trim())
            .filter(Boolean)
    );
}

function joinVendorList(values) {
    return uniqueValues(values.map(asText).filter(Boolean)).join("\n");
}

function normalizeRound(value) {
    const match = asText(value).toUpperCase().match(/R\s*([0-5])/);
    return match ? `R${match[1]}` : "";
}

function detectLatestRound(row) {
    let latestIndex = -1;

    [row?.roundpo, row?.roundpr, row?.["Round PR"], row?.["Round PO"]]
        .map(normalizeRound)
        .filter(Boolean)
        .forEach(round => {
            latestIndex = Math.max(latestIndex, Number(round.slice(1)));
        });

    ROUND_OPTIONS.forEach((round, index) => {
        const key = round.toLowerCase();
        const hasRoundData = [
            row?.[`${key}company`],
            row?.[`${key}submitcompany`],
            row?.[`${key}startdate`],
            row?.[`${key}finishdate`],
            row?.[`${round} Company`],
            row?.[`${round} Submit Company`],
            row?.[`${round} Start Date`],
            row?.[`${round} Finish Date`]
        ].some(value => asText(value) !== "");

        if (hasRoundData) latestIndex = Math.max(latestIndex, index);
    });

    return latestIndex >= 0 ? `R${latestIndex}` : "R0";
}

function getRoundField(row, round, suffix) {
    const internalKey = `${round.toLowerCase()}${suffix}`;
    const aliasesBySuffix = {
        company: [
            internalKey,
            `${round} Company`,
            `${round} Company Name`,
            `${round} Invited Company`,
            `${round} Invitation Vendor`,
            `${round} Name of Invited Supplier`
        ],
        submitcompany: [
            internalKey,
            `${round} Submit Company`,
            `${round} Submit Quote Vendor`,
            `${round} Submitted Vendor`
        ],
        startdate: [
            internalKey,
            `${round} Start Date`,
            `${round} Open Date`,
            `${round} RFQ Open Date`,
            `${round} Bidderlist Start Date`
        ],
        finishdate: [
            internalKey,
            `${round} Finish Date`,
            `${round} Close Date`,
            `${round} End Date`,
            `${round} RFQ Close Date`,
            `${round} Bidderlist Finish Date`
        ]
    };

    // getFirstValue mengabaikan key yang ada tetapi nilainya kosong. Ini penting
    // saat cache memiliki r0company="" sedangkan Google Sheet sudah memiliki
    // nilai pada header "R0 Company".
    return getFirstValue(row, aliasesBySuffix[suffix] || [internalKey]);
}

function normalizeObjectKey(value) {
    return asText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getFirstValue(row, aliases) {
    if (!row || typeof row !== "object") return "";

    // Coba nama key persis terlebih dahulu.
    for (const alias of aliases) {
        if (row[alias] !== undefined && row[alias] !== null && asText(row[alias]) !== "") {
            return row[alias];
        }
    }

    // Fallback untuk header dari cache/Google Sheet yang berbeda kapitalisasi,
    // spasi, titik, atau memiliki spasi tambahan.
    const normalizedEntries = new Map(
        Object.entries(row).map(([key, value]) => [normalizeObjectKey(key), value])
    );

    for (const alias of aliases) {
        const value = normalizedEntries.get(normalizeObjectKey(alias));
        if (value !== undefined && value !== null && asText(value) !== "") return value;
    }

    return "";
}

function normalizeCompanyName(value, removeLegalEntity = false) {
    let normalized = asText(value)
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

    const baseLeft = normalizeCompanyName(left, true);
    const baseRight = normalizeCompanyName(right, true);
    return Boolean(baseLeft && baseRight && baseLeft === baseRight);
}

function getCompanyName(company) {
    return getFirstValue(company, [
        "companyName", "Company Name", "Vendor Company", "Vendor Name", "Company"
    ]);
}

function getCompanyEmail(company) {
    return getFirstValue(company, [
        "email", "Email", "Email Address", "Company Email", "Vendor Email"
    ]);
}

function normalizeCompanyDirectory(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map(row => ({
            ...row,
            companyName: getCompanyName(row),
            email: getCompanyEmail(row)
        }))
        .filter(row => asText(row.companyName));
}

function findCompanyByName(rows, companyName) {
    return (Array.isArray(rows) ? rows : []).find(company =>
        companyNamesEqual(getCompanyName(company), companyName)
    );
}

function parseCurrency(value) {
    const digits = asText(value).replace(/\D/g, "");
    return digits ? Number(digits) : "";
}

function formatCurrencyInput(value) {
    const digits = asText(value).replace(/\D/g, "");
    return digits ? Number(digits).toLocaleString("id-ID") : "";
}

function parseUsdAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    let text = asText(value).replace(/[^0-9,.-]/g, "");
    if (!text) return "";

    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
        text = comma > dot
            ? text.replace(/\./g, "").replace(",", ".")
            : text.replace(/,/g, "");
    } else if (comma >= 0) {
        text = text.replace(/\./g, "").replace(",", ".");
    }

    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : "";
}

function formatUsdAmount(value) {
    const numeric = parseUsdAmount(value);
    return numeric === "" ? "" : Number(numeric).toLocaleString("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function parseBooleanValue(value) {
    if (typeof value === "boolean") return value;
    const normalized = asText(value).toLowerCase();
    return ["true", "1", "yes", "y", "locked"].includes(normalized);
}

function formatUsdRateDisplay(rate) {
    const numericRate = Math.round(Number(rate || 0));
    return numericRate > 0 ? `1$ - ${numericRate.toLocaleString("id-ID")}` : "";
}

function formatUsdRateMetaDate(value) {
    const text = asText(value);
    if (!text) return "";
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).replace(/,/g, "");
    }
    return text;
}

function updateUsdRateUI(options = {}) {
    const rate = Number(usdRateSnapshot.rate || 0);
    if (usdRateDisplay) {
        usdRateDisplay.value = formatUsdRateDisplay(rate);
        usdRateDisplay.placeholder = rate > 0 ? "" : "Belum sync";
    }

    if (usdRateStatus) {
        if (options.message) {
            usdRateStatus.textContent = options.message;
            usdRateStatus.className = `mt-1 min-h-[1.25rem] text-xs text-center ${options.error ? "text-red-600" : "text-gray-500"}`;
        } else if (rate > 0) {
            const dateLabel = formatUsdRateMetaDate(usdRateSnapshot.rateDate);
            const sourceLabel = asText(usdRateSnapshot.source);
            const meta = [dateLabel, sourceLabel].filter(Boolean).join(" • ");
            usdRateStatus.textContent = procurementMode === "ADD"
                ? `Snapshot Add PR${meta ? ` • ${meta}` : ""}`
                : `Locked dari Add PR${meta ? ` • ${meta}` : ""}`;
            usdRateStatus.className = "mt-1 min-h-[1.25rem] text-xs text-center text-emerald-700";
        } else {
            usdRateStatus.textContent = procurementMode === "ADD"
                ? "Klik Sync Kurs sebelum menyimpan PR."
                : "Snapshot kurs PR belum tersedia.";
            usdRateStatus.className = "mt-1 min-h-[1.25rem] text-xs text-center text-amber-700";
        }
    }

    if (syncUsdRateBtn) {
        syncUsdRateBtn.classList.toggle("hidden", procurementMode !== "ADD");
    }
}

function initializeUsdRateSnapshot(row = {}) {
    const rate = Number(parseCurrency(getFirstValue(row, [
        "usdidrrate", "USD/IDR Rate", "USD IDR Rate"
    ])) || 0);

    usdRateSnapshot = {
        rate,
        rateDate: asText(getFirstValue(row, [
            "usdidrratedate", "USD/IDR Rate Date", "USD IDR Rate Date"
        ])),
        source: asText(getFirstValue(row, [
            "usdidrsource", "USD/IDR Source", "USD IDR Source"
        ])),
        locked: rate > 0 && parseBooleanValue(getFirstValue(row, [
            "usdidrlocked", "USD/IDR Locked", "USD IDR Locked"
        ]))
    };

    // Data lama mungkin sudah memiliki kurs tetapi belum memiliki flag Locked.
    if (rate > 0 && !usdRateSnapshot.locked) usdRateSnapshot.locked = true;
    updateUsdRateUI();
    return usdRateSnapshot;
}

async function fetchUsdIdrRateDirect() {
    const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`open.er-api.com HTTP ${response.status}`);
    }

    const json = await response.json();
    const rate = Number(json?.rates?.IDR || 0);

    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("Rate IDR tidak tersedia dari open.er-api.com.");
    }

    return {
        rate: Math.round(rate),
        rateDate: asText(
            json?.time_last_update_utc ||
            (json?.time_last_update_unix
                ? new Date(Number(json.time_last_update_unix) * 1000).toISOString()
                : new Date().toISOString())
        ),
        source: "open.er-api.com (direct)"
    };
}

async function fetchUsdIdrRateFromBackend() {
    const response = await fetch(`${GAS_URL}?action=getUsdIdrRate&_=${Date.now()}`, {
        cache: "no-store"
    });

    if (!response.ok) throw new Error(`Google Apps Script HTTP ${response.status}`);

    const result = await response.json();
    const rate = Number(result?.rate || 0);

    if (result?.success === false) {
        throw new Error(result.message || "Kurs USD/IDR tidak tersedia dari backend.");
    }

    if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("Rate IDR tidak tersedia dari backend.");
    }

    return {
        rate: Math.round(rate),
        rateDate: asText(result.rateDate || result.checkedAt || new Date().toISOString()),
        source: asText(result.source || "Google Apps Script")
    };
}

async function getWorkingUsdIdrRate() {
    const errors = [];

    // Gunakan cara yang sudah terbukti berjalan pada script referensi user:
    // browser mengambil kurs langsung dari open.er-api.com.
    try {
        return await fetchUsdIdrRateDirect();
    } catch (error) {
        errors.push(`Direct: ${error.message || error}`);
    }

    // Backend tetap dipertahankan sebagai cadangan apabila akses langsung
    // dibatasi oleh jaringan/browser perusahaan.
    try {
        return await fetchUsdIdrRateFromBackend();
    } catch (error) {
        errors.push(`Backend: ${error.message || error}`);
    }

    throw new Error(errors.join(" | ") || "Kurs USD/IDR tidak tersedia.");
}

async function ensureUsdRateSnapshot(options = {}) {
    const force = Boolean(options.force);
    const allowFallback = options.allowFallback !== false;

    if (!force && usdRateSnapshot.locked && Number(usdRateSnapshot.rate) > 0) {
        updateUsdRateUI();
        return usdRateSnapshot;
    }

    const previousSnapshot = { ...usdRateSnapshot };

    try {
        const result = await getWorkingUsdIdrRate();
        usdRateSnapshot = {
            rate: Math.round(Number(result.rate)),
            rateDate: asText(result.rateDate || new Date().toISOString()),
            source: asText(result.source || "open.er-api.com (direct)"),
            locked: true
        };
    } catch (error) {
        if (!allowFallback) {
            usdRateSnapshot = previousSnapshot;
            updateUsdRateUI({ message: `Sync gagal: ${error.message || error}`, error: true });
            throw error;
        }

        console.warn("Kurs USD/IDR gagal diambil; fallback digunakan:", error);
        usdRateSnapshot = {
            rate: USD_IDR_FALLBACK_RATE,
            rateDate: new Date().toISOString(),
            source: "Fallback E-Procurement",
            locked: true
        };
    }

    loadedRow.usdidrrate = usdRateSnapshot.rate;
    loadedRow.usdidrratedate = usdRateSnapshot.rateDate;
    loadedRow.usdidrsource = usdRateSnapshot.source;
    loadedRow.usdidrlocked = true;
    updateUsdRateUI();
    return usdRateSnapshot;
}

async function syncUsdRateForAdd() {
    if (procurementMode !== "ADD" || !syncUsdRateBtn) return;

    syncUsdRateBtn.disabled = true;
    updateUsdRateUI({ message: "Menyinkronkan kurs USD/IDR..." });

    try {
        await ensureUsdRateSnapshot({ force: true, allowFallback: false });
        recalculateEstimatedPriceIdr();
        formChanged = true;
        updateUsdRateUI({
            message: `${formatUsdRateDisplay(usdRateSnapshot.rate)} berhasil disinkronkan • ${formatUsdRateMetaDate(usdRateSnapshot.rateDate)} • ${usdRateSnapshot.source}`
        });
    } catch (error) {
        showPopup("Sync Kurs Gagal", error.message || "Kurs USD/IDR belum dapat diambil. Silakan coba kembali.");
    } finally {
        syncUsdRateBtn.disabled = false;
    }
}

function recalculateEstimatedPriceIdr() {
    const numeric = parseUsdAmount(estPricePrInput?.value);
    const rate = Number(usdRateSnapshot.rate || USD_IDR_FALLBACK_RATE);
    if (estPriceUsInput) {
        estPriceUsInput.value = numeric === ""
            ? ""
            : (Number(numeric) * rate).toLocaleString("id-ID");
    }
}

function getRFQPrefix(statusPR) {
    const status = asText(statusPR).toUpperCase();
    if (status === "BID") return "S";
    if (status === "TDR") return "T";
    if (status === "IOM" || status === "CTR") return "D";
    return "";
}

function formatRFQ(value, statusPR = byId("statuspr")?.value) {
    const raw = asText(value);
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const number = digits.slice(-4).padStart(4, "0");
    const prefix = getRFQPrefix(statusPR) || (raw.match(/^([A-Za-z])\s*-/)?.[1] || "").toUpperCase();
    return prefix ? `${prefix}-${number}` : number;
}

/* ==========================================
   DATE DISPLAY
   - Semua tanggal: dd MMM yyyy
========================================== */

const MONTH_NUMBER = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6,
    jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10,
    nov: 11, dec: 12, des: 12
};
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function validISODate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateToISO(value) {
    if (value == null || value === "" || value === "-") return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return validISODate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }

    if (!Number.isNaN(Number(value)) && Number(value) > 20000 && Number(value) < 80000) {
        const excelDate = new Date((Number(value) - 25569) * 86400 * 1000);
        return validISODate(excelDate.getUTCFullYear(), excelDate.getUTCMonth() + 1, excelDate.getUTCDate());
    }

    const text = asText(value);

    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    if (match) return validISODate(match[1], match[2], match[3]);

    match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (match) {
        let year = Number(match[3]);
        if (year < 100) year += 2000;
        return validISODate(year, match[2], match[1]);
    }

    match = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})$/);
    if (match) {
        let year = Number(match[3]);
        if (year < 100) year += 2000;
        const month = MONTH_NUMBER[match[2].slice(0, 3).toLowerCase()];
        return month ? validISODate(year, month, match[1]) : "";
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return "";
    return validISODate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function formatISODate(isoValue, shortYear = false) {
    const match = asText(isoValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const year = shortYear ? match[1].slice(-2) : match[1];
    return `${match[3]} ${MONTH_LABELS[Number(match[2]) - 1]} ${year}`;
}

function formatDateDisplayFromISO(isoValue, shortYear = false) {
    return isoValue ? formatISODate(isoValue, shortYear) : "";
}

function initFormattedDateInputs() {
    document.querySelectorAll("input[data-formatted-date]").forEach(input => {
        if (input.dataset.dateReady === "true") return;
        input.dataset.dateReady = "true";
        input.classList.add("native-date-visible", "formatted-native-date");

        const wrapper = document.createElement("div");
        wrapper.className = "formatted-date-wrapper mt-1";
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        input.classList.remove("mt-1");

        const display = document.createElement("span");
        display.className = "formatted-date-text";
        display.setAttribute("aria-hidden", "true");
        wrapper.appendChild(display);

        input._syncDisplay = () => {
            display.textContent = formatDateDisplayFromISO(input.value, false);
            wrapper.classList.toggle("has-date", Boolean(input.value));
            wrapper.classList.toggle("is-disabled", Boolean(input.disabled || input.readOnly));
        };

        input.addEventListener("input", input._syncDisplay);
        input.addEventListener("change", input._syncDisplay);
        input._syncDisplay();
    });
}

function setDateFieldValue(id, value) {
    const input = byId(id);
    if (!input) return;
    input.value = parseDateToISO(value);
    if (typeof input._syncDisplay === "function") input._syncDisplay();
}

function getDateFieldValue(id) {
    const input = byId(id);
    return input?.value
        ? formatISODate(input.value, false)
        : "";
}

/* ==========================================
   SEARCHABLE DATALISTS
========================================== */

function initSearchableDatalists() {
    document.querySelectorAll("input[list]").forEach(input => {
        if (input.dataset.searchableReady === "true") return;

        const datalist = byId(input.getAttribute("list"));
        if (!datalist) return;

        const options = uniqueValues(Array.from(datalist.options).map(option => asText(option.value || option.textContent)));
        input.dataset.searchableReady = "true";
        input.removeAttribute("list");
        input.autocomplete = "off";
        input.setAttribute("role", "combobox");
        input.setAttribute("aria-expanded", "false");

        const wrapper = document.createElement("div");
        wrapper.className = "searchable-select";
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const dropdown = document.createElement("div");
        dropdown.className = "searchable-options hidden";
        wrapper.appendChild(dropdown);

        let visibleOptions = [];
        let activeIndex = -1;
        const normalize = value => asText(value).toLowerCase();

        const closeDropdown = () => {
            dropdown.classList.add("hidden");
            input.setAttribute("aria-expanded", "false");
            activeIndex = -1;
        };

        const choose = value => {
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
            closeDropdown();
            input.focus();
        };

        const setActive = index => {
            const items = Array.from(dropdown.querySelectorAll(".searchable-option"));
            if (!items.length) return;
            activeIndex = Math.max(0, Math.min(index, items.length - 1));
            items.forEach((item, itemIndex) => item.classList.toggle("is-active", itemIndex === activeIndex));
            items[activeIndex]?.scrollIntoView({ block: "nearest" });
        };

        const renderOptions = (query = "") => {
            const needle = normalize(query);
            visibleOptions = needle ? options.filter(value => normalize(value).includes(needle)) : [...options];
            dropdown.innerHTML = "";
            activeIndex = -1;

            if (!visibleOptions.length) {
                const empty = document.createElement("div");
                empty.className = "searchable-empty";
                empty.textContent = "Tidak ada pilihan yang cocok";
                dropdown.appendChild(empty);
                return;
            }

            visibleOptions.forEach((value, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "searchable-option";
                button.textContent = value;
                button.addEventListener("mousedown", event => {
                    event.preventDefault();
                    choose(value);
                });
                button.addEventListener("mouseenter", () => setActive(index));
                dropdown.appendChild(button);
            });
        };

        const openDropdown = showAll => {
            renderOptions(showAll ? "" : input.value);
            dropdown.classList.remove("hidden");
            input.setAttribute("aria-expanded", "true");
        };

        input.addEventListener("focus", () => openDropdown(true));
        input.addEventListener("click", () => openDropdown(true));
        input.addEventListener("input", () => openDropdown(false));
        input.addEventListener("blur", () => window.setTimeout(closeDropdown, 100));
        input.addEventListener("keydown", event => {
            const isOpen = !dropdown.classList.contains("hidden");
            if (event.key === "ArrowDown") {
                if (!isOpen) openDropdown(true);
                setActive(activeIndex + 1);
                event.preventDefault();
            } else if (event.key === "ArrowUp") {
                if (!isOpen) openDropdown(true);
                setActive(activeIndex <= 0 ? visibleOptions.length - 1 : activeIndex - 1);
                event.preventDefault();
            } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
                choose(visibleOptions[activeIndex]);
                event.preventDefault();
            } else if (event.key === "Escape") {
                closeDropdown();
            }
        });
    });
}

/* ==========================================
   DATA SOURCE: CACHE FIRST, SHEET FALLBACK
========================================== */

function extractArrayFromCache(value, depth = 0) {
    if (depth > 5 || value == null) return null;
    if (Array.isArray(value)) return value;

    if (typeof value === "string") {
        try {
            return extractArrayFromCache(JSON.parse(value), depth + 1);
        } catch (error) {
            return null;
        }
    }

    if (typeof value === "object") {
        for (const key of ["data", "value", "payload", "items", "rows", "cache"]) {
            const result = extractArrayFromCache(value[key], depth + 1);
            if (result) return result;
        }
    }

    return null;
}

function getRowFromParent() {
    try {
        if (window.parent && window.parent !== window && typeof window.parent.getProcurementByPR === "function") {
            const row = window.parent.getProcurementByPR(prNumber);
            return row ? structuredCloneSafe(row) : null;
        }
    } catch (error) {
        console.warn("Parent cache tidak dapat diakses:", error);
    }
    return null;
}

function getRowFromLocalCache() {
    try {
        const raw = localStorage.getItem(PROCUREMENT_CACHE_KEY);
        if (!raw) return null;
        const rows = extractArrayFromCache(raw);
        return rows?.find(row => asText(row.noPR || row["No PR"]) === prNumber) || null;
    } catch (error) {
        console.warn("Local cache tidak dapat dibaca:", error);
        return null;
    }
}

function structuredCloneSafe(value) {
    try {
        return typeof structuredClone === "function"
            ? structuredClone(value)
            : JSON.parse(JSON.stringify(value));
    } catch (error) {
        return { ...value };
    }
}

async function getRowFromGoogleSheet() {
    const response = await fetch(`${GAS_URL}?sheet=${encodeURIComponent(SHEET_NAME)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Sheet HTTP ${response.status}`);
    const result = await response.json();
    return (result.rows || []).find(row => asText(row["No PR"] || row.noPR) === prNumber) || null;
}

function normalizePRKey(value) {
    return asText(value).toUpperCase().replace(/\s+/g, "");
}

function getRowPR(row) {
    return getFirstValue(row, ["noPR", "No PR", "No. PR", "PR No", "PR Number"]);
}

function isSamePR(row, targetPR = prNumber) {
    const left = normalizePRKey(getRowPR(row));
    const right = normalizePRKey(targetPR);
    return Boolean(left && right && left === right);
}

function rowsFromUnknownPayload(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value;

    if (typeof value === "string") {
        try {
            return rowsFromUnknownPayload(JSON.parse(value));
        } catch (_) {
            return [];
        }
    }

    if (typeof value === "object") {
        if (getRowPR(value)) return [value];
        const extracted = extractArrayFromCache(value);
        return Array.isArray(extracted) ? extracted : [];
    }

    return [];
}

function splitPossibleVendorValue(value) {
    if (Array.isArray(value)) {
        return uniqueValues(value.flatMap(item => splitPossibleVendorValue(item)));
    }
    return splitVendorList(value);
}

function getBidderlistCompanies(row) {
    const directValue = getFirstValue(row, [
        "roundcompany", "Round Company",
        "company", "Company", "Company Name",
        "Name of Invited Supplier", "Invited Supplier",
        "Invitation Vendor", "List Invitation Vendor",
        "Vendor Company", "Vendor Name", "Final Vendor List"
    ]);

    const companies = splitPossibleVendorValue(directValue);
    if (companies.length) return companies;

    // Fallback untuk template yang menyimpan vendor pada kolom bernomor,
    // misalnya Company 1, Vendor 2, atau Name of Invited Supplier 3.
    const collected = [];
    Object.entries(row || {}).forEach(([key, value]) => {
        const normalizedKey = normalizeObjectKey(key);
        const isCompanyField = /(company|vendor|supplier)/.test(normalizedKey);
        const isExcluded = /(submit|winner|email|contact|phone|status|number|nocompany|companyno|companyid)/.test(normalizedKey);
        if (isCompanyField && !isExcluded) collected.push(...splitPossibleVendorValue(value));
    });
    return uniqueValues(collected);
}

function getBidderlistRound(row, fallbackRound = "R0") {
    const explicitRound = getFirstValue(row, [
        "roundpo", "roundpr", "Round PR", "Round PO", "round", "Round", "Revision", "Rebid Round", "RFQ Round"
    ]);
    if (normalizeRound(explicitRound)) return normalizeRound(explicitRound);

    const roundFromReference = getFirstValue(row, [
        "rfq", "RFQ", "No RFQ", "File Name", "Filename", "Bidderlist File"
    ]);
    return normalizeRound(roundFromReference) || normalizeRound(fallbackRound) || "R0";
}

function getBidderlistStartDate(row) {
    return getFirstValue(row, [
        "startdate", "Start Date", "Open Date", "Opening Date",
        "RFQ Open Date", "Bidderlist Start Date", "Quotation Open Date"
    ]);
}

function getBidderlistFinishDate(row) {
    return getFirstValue(row, [
        "finishdate", "Finish Date", "Close Date", "Closing Date", "End Date",
        "RFQ Close Date", "Bidderlist Finish Date", "Quotation Close Date"
    ]);
}

function buildBidderlistSnapshots(rows, fallbackRound) {
    const snapshots = {};

    (Array.isArray(rows) ? rows : [])
        .filter(row => isSamePR(row))
        .forEach(row => {
            const resolvedRound = getBidderlistRound(row, fallbackRound);
            const roundSpecific = ROUND_OPTIONS.filter(round => [
                getRoundField(row, round, "company"),
                getRoundField(row, round, "startdate"),
                getRoundField(row, round, "finishdate")
            ].some(value => asText(value)));

            // Jika satu record menyimpan R0, R1, dan seterusnya sekaligus,
            // semua round dibaca. Jika tidak, gunakan round aktif record.
            const roundsToRead = roundSpecific.length ? roundSpecific : [resolvedRound];

            roundsToRead.forEach(round => {
                const key = round.toLowerCase();
                const current = snapshots[key] || {
                    round,
                    companies: [],
                    startdate: "",
                    finishdate: ""
                };

                const roundCompanies = splitPossibleVendorValue(getRoundField(row, round, "company"));
                const companies = roundCompanies.length
                    ? roundCompanies
                    : (round === resolvedRound ? getBidderlistCompanies(row) : []);
                const startdate = getRoundField(row, round, "startdate") ||
                    (round === resolvedRound ? getBidderlistStartDate(row) : "");
                const finishdate = getRoundField(row, round, "finishdate") ||
                    (round === resolvedRound ? getBidderlistFinishDate(row) : "");

                current.companies = uniqueValues([...current.companies, ...companies]);
                current.startdate = startdate || current.startdate;
                current.finishdate = finishdate || current.finishdate;
                snapshots[key] = current;
            });
        });

    return snapshots;
}

function hasBidderlistSnapshotData(snapshots) {
    return Object.values(snapshots || {}).some(snapshot =>
        snapshot.companies.length || asText(snapshot.startdate) || asText(snapshot.finishdate)
    );
}

async function getBidderlistRowsFromParent() {
    try {
        if (!window.parent || window.parent === window) return [];

        const methodNames = [
            "getBidderlistByPR", "getBidderListByPR",
            "getBidderlistDataByPR", "getBidderListDataByPR",
            "getBidderlistData", "getBidderListData"
        ];

        for (const methodName of methodNames) {
            const method = window.parent[methodName];
            if (typeof method !== "function") continue;
            const payload = await Promise.resolve(method.call(window.parent, prNumber));
            const rows = rowsFromUnknownPayload(payload);
            if (rows.some(row => isSamePR(row))) return rows;
        }
    } catch (error) {
        console.warn("Bidderlist parent tidak dapat dibaca:", error);
    }
    return [];
}

function getBidderlistRowsFromLocalCache() {
    for (const cacheKey of BIDDERLIST_CACHE_KEYS) {
        try {
            const rows = rowsFromUnknownPayload(localStorage.getItem(cacheKey));
            if (rows.some(row => isSamePR(row))) return rows;
        } catch (error) {
            console.warn(`Cache ${cacheKey} tidak dapat dibaca:`, error);
        }
    }
    return [];
}

async function getBidderlistRowsFromGoogleSheet() {
    for (const sheetName of BIDDERLIST_SHEET_NAMES) {
        try {
            const response = await fetch(`${GAS_URL}?sheet=${encodeURIComponent(sheetName)}`, { cache: "no-store" });
            if (!response.ok) continue;
            const result = await response.json();
            const rows = rowsFromUnknownPayload(result?.rows || result);
            if (rows.some(row => isSamePR(row))) return rows;
        } catch (error) {
            console.warn(`Sheet ${sheetName} tidak dapat dibaca:`, error);
        }
    }
    return [];
}

function mergeBidderlistSnapshots(row, snapshots) {
    const merged = { ...row };

    Object.values(snapshots || {}).forEach(snapshot => {
        const key = snapshot.round.toLowerCase();
        if (snapshot.companies.length) {
            merged[`${key}company`] = joinVendorList(snapshot.companies);
        }
        if (asText(snapshot.startdate)) merged[`${key}startdate`] = snapshot.startdate;
        if (asText(snapshot.finishdate)) merged[`${key}finishdate`] = snapshot.finishdate;
    });

    const activeRound = normalizeRound(getFirstValue(merged, ["roundpo", "roundpr", "Round PR", "Round PO"])) || detectLatestRound(merged);
    const activeKey = activeRound.toLowerCase();
    if (asText(merged[`${activeKey}company`])) {
        merged.roundcompany = merged[`${activeKey}company`];
    }

    const activeSubmitted =
        merged[`${activeKey}submitcompany`] ||
        merged.roundsubmitcompany ||
        merged.finalsubmitvendor ||
        "";
    merged.roundsubmitcompany = activeSubmitted;
    if (!shouldPreserveImportedFormat(merged)) {
        merged.finalvendorlist = activeSubmitted;
        merged.finalsubmitvendor = activeSubmitted;
    }

    if (asText(merged[`${activeKey}startdate`])) merged.roundstartdate = merged[`${activeKey}startdate`];
    if (asText(merged[`${activeKey}finishdate`])) merged.roundfinishdate = merged[`${activeKey}finishdate`];

    return merged;
}

async function syncBidderlistIntoProcurement(row) {
    const fallbackRound = normalizeRound(getFirstValue(row, ["roundpo", "roundpr", "Round PR", "Round PO"])) || detectLatestRound(row);

    // Google Sheet diprioritaskan agar Form Edit tidak memakai cache Bidderlist
    // yang sudah lama. Parent dan localStorage hanya menjadi fallback.
    const sources = [
        ["Bidderlist Google Sheet", getBidderlistRowsFromGoogleSheet],
        ["Bidderlist parent", getBidderlistRowsFromParent],
        ["Bidderlist local cache", async () => getBidderlistRowsFromLocalCache()]
    ];

    for (const [sourceName, loadRows] of sources) {
        const rows = await loadRows();
        const snapshots = buildBidderlistSnapshots(rows, fallbackRound);
        if (hasBidderlistSnapshotData(snapshots)) {
            return {
                row: mergeBidderlistSnapshots(row, snapshots),
                sourceName
            };
        }
    }

    return { row, sourceName: "" };
}

function normalizeProcurementRow(source) {
    const row = { ...source };
    const normalized = {
        ...row,
        noPR: getFirstValue(row, ["noPR", "No PR"]),
        Description: getFirstValue(row, ["Description", "description"]),
        previoussubmitpo: getFirstValue(row, ["previoussubmitpo", "Previous Submit PO"]),
        finalvendorlist: getFirstValue(row, ["finalvendorlist", "Final Vendor List"]),
        finalsubmitvendor: getFirstValue(row, ["finalsubmitvendor", "Final Submit Vendor"]),
        statusrebid: getFirstValue(row, ["statusrebid", "Status Rebid"]),
        pic: getFirstValue(row, ["pic", "PIC"]),
        assignprdate: getFirstValue(row, ["assignprdate", "Assign Date", "Assign PR", "Assign PR Date"]),
        departement: getFirstValue(row, ["departement", "Departement", "Department"]),
        pengadaan: getFirstValue(row, ["pengadaan", "Pengadaan"]),
        statuspr: getFirstValue(row, ["statuspr", "Status PR"]),
        rfq: getFirstValue(row, ["rfq", "RFQ"]),
        estpricerp: getFirstValue(row, ["estpricerp", "Est. Price PR", "Est. Price PR (USD)"]),
        estpriceus: getFirstValue(row, ["estpriceus", "Est. Price US - Rp"]),
        usdidrrate: getFirstValue(row, ["usdidrrate", "USD/IDR Rate", "USD IDR Rate"]),
        usdidrratedate: getFirstValue(row, ["usdidrratedate", "USD/IDR Rate Date", "USD IDR Rate Date"]),
        usdidrsource: getFirstValue(row, ["usdidrsource", "USD/IDR Source", "USD IDR Source"]),
        usdidrlocked: getFirstValue(row, ["usdidrlocked", "USD/IDR Locked", "USD IDR Locked"]),
        flowprocess: getFirstValue(row, ["flowprocess", "Flow Process"]),
        winnerpo: getFirstValue(row, [
            "winnerpo", "Winner PO", "WinnerPO", "PO Winner", "Selected Winner"
        ]),
        emailwinnerpo: getFirstValue(row, [
            "emailwinnerpo", "Email Winner PO", "Winner PO Email", "Winner Email"
        ]),
        nopo: getFirstValue(row, ["nopo", "No PO"]),
        pricerp: getFirstValue(row, ["pricerp", "Price (Rp) Excl. PPn"]),
        cqscreatedate: getFirstValue(row, ["cqscreatedate", "CQS Create Date", "CQS Created Date"]),
        cqsapprovaldate: getFirstValue(row, ["cqsapprovaldate", "CQS Approval Date", "CQS Approved Date"]),
        pocreatedate: getFirstValue(row, ["pocreatedate", "PO Create Date"]),
        podeldate: getFirstValue(row, ["podeldate", "PO Del. Date", "PO Delivery Date"]),
        actualporeleasedate: getFirstValue(row, ["actualporeldate", "Actual PO Rel. Date", "actualporeleasedate", "Actual PO Release Date"]),
        actualpodeldate: getFirstValue(row, ["actualpodeldate", "Actual PO Del. Date", "Actual PO Delivery Date"]),
        actualreceivedpo: getFirstValue(row, ["actualreceivedpo", "Actual Received PO (GRN Date)", "GRN Date"]),
        note: getFirstValue(row, ["note", "Note"]),
        folderid: getFirstValue(row, ["folderid", "Folder ID", "FolderID"]),
        folderlink: getFirstValue(row, ["folderlink", "Folder LINK", "Folder Link", "Folder URL"]),
        folderstructure: row.folderstructure || row.folderStructure || null,
        roundstartdate: getFirstValue(row, ["roundstartdate", "Round Start Date", "Start Date", "Open Date"]),
        roundfinishdate: getFirstValue(row, ["roundfinishdate", "Round Finish Date", "Finish Date", "Close Date"])
    };

    ROUND_OPTIONS.forEach(round => {
        const key = round.toLowerCase();
        normalized[`${key}company`] = getRoundField(row, round, "company");
        normalized[`${key}submitcompany`] = getRoundField(row, round, "submitcompany");
        normalized[`${key}startdate`] = getRoundField(row, round, "startdate");
        normalized[`${key}finishdate`] = getRoundField(row, round, "finishdate");
    });

    const preserveImported = shouldPreserveImportedFormat(row);
    const declaredRound = normalizeRound(getFirstValue(row, ["roundpo", "roundpr", "Round PR", "Round PO"]));

    normalized.roundpo = declaredRound || detectLatestRound(normalized);
    const activeKey = normalized.roundpo.toLowerCase();

    const genericCompany = getFirstValue(row, [
        "Company Name", "Invited Company", "Name of Invited Supplier",
        "Invitation Vendor", "List Invitation Vendor"
    ]);
    const genericStartDate = getFirstValue(row, ["Start Date", "Open Date", "RFQ Open Date"]);
    const genericFinishDate = getFirstValue(row, ["Finish Date", "Close Date", "RFQ Close Date"]);

    if (!normalized[`${activeKey}company`] && genericCompany) normalized[`${activeKey}company`] = genericCompany;
    if (!normalized[`${activeKey}startdate`] && genericStartDate) normalized[`${activeKey}startdate`] = genericStartDate;
    if (!normalized[`${activeKey}finishdate`] && genericFinishDate) normalized[`${activeKey}finishdate`] = genericFinishDate;

    normalized.roundcompany =
        normalized[`${activeKey}company`] ||
        getFirstValue(row, ["roundcompany", "Round Company"]) ||
        normalized.finalvendorlist ||
        "";

    normalized.roundsubmitcompany =
        normalized[`${activeKey}submitcompany`] ||
        getFirstValue(row, ["roundsubmitcompany", "Round Submit Company", "Submit Company"]) ||
        normalized.finalsubmitvendor ||
        "";

    if (!normalized.roundcompany && normalized.roundsubmitcompany) {
        normalized.roundcompany = normalized.roundsubmitcompany;
        normalized[`${activeKey}company`] = normalized[`${activeKey}company`] || normalized.roundsubmitcompany;
    }

    if (!preserveImported) {
        if (!normalized[`${activeKey}company`] && normalized.roundcompany) {
            normalized[`${activeKey}company`] = normalized.roundcompany;
        }
        if (!normalized[`${activeKey}submitcompany`] && normalized.roundsubmitcompany) {
            normalized[`${activeKey}submitcompany`] = normalized.roundsubmitcompany;
        }

        // Final Vendor List adalah daftar vendor yang submit pada round aktif.
        normalized.finalvendorlist = normalized.roundsubmitcompany || "";
        normalized.finalsubmitvendor = normalized.roundsubmitcompany || "";
    }

    return normalized;
}

async function loadEditData() {
    let sourceName = "parent cache";
    let sourceRow = getRowFromParent();

    if (!sourceRow) {
        sourceName = "local cache";
        sourceRow = getRowFromLocalCache();
    }

    // Form Edit selalu memeriksa Sheet Admin terbaru. Sebelumnya Sheet hanya
    // dibaca ketika snapshot kurs kosong, sehingga Company/Start/Finish Date
    // dari Bidderlist sering tertahan pada cache lama.
    try {
        const freshRow = await getRowFromGoogleSheet();
        if (freshRow) {
            sourceRow = freshRow;
            sourceName = "Google Sheet terbaru";
        }
    } catch (error) {
        console.warn("Google Sheet terbaru tidak dapat dibaca:", error);
        if (!sourceRow) throw error;
    }

    if (!sourceRow) {
        showPopup("Tidak Ditemukan", "Data untuk No PR ini tidak ditemukan di cache maupun Google Sheet.");
        return;
    }

    loadedRow = normalizeProcurementRow(sourceRow);

    // Sinkronkan vendor undangan, Start Date/Open Date, dan Finish Date/Close
    // Date langsung dari Bidderlist. Fungsi ini aman: bila sumber Bidderlist
    // tidak tersedia, data Procurement yang sudah ada tetap dipakai.
    try {
        const bidderlistSync = await syncBidderlistIntoProcurement(loadedRow);
        if (bidderlistSync.sourceName) {
            loadedRow = normalizeProcurementRow(bidderlistSync.row);
            sourceName += ` + ${bidderlistSync.sourceName}`;
        }
    } catch (error) {
        console.warn("Sinkronisasi Bidderlist dilewati:", error);
    }

    originalPR = loadedRow.noPR;
    initializeUsdRateSnapshot(loadedRow);
    originalData = structuredCloneSafe(loadedRow);

    // Record lama yang benar-benar belum memiliki snapshot kurs disinkronkan
    // satu kali, lalu digunakan tetap pada semua proses turunannya.
    if (!usdRateSnapshot.locked || !Number(usdRateSnapshot.rate)) {
        await ensureUsdRateSnapshot();
    }

    fillForm(loadedRow);
    formChanged = false;
    console.log(`Form dimuat dari ${sourceName}:`, loadedRow);
}

function resizeAutoHeightTextarea(textarea, options = {}) {
    if (!textarea) return;
    const lineHeight = Number(options.lineHeight || 24);
    const minLines = Number(options.minLines || 1);
    const maxLines = Number(options.maxLines || 8);
    const padding = Number(options.padding || 18);
    textarea.style.height = "auto";
    const minHeight = minLines * lineHeight + padding;
    const maxHeight = maxLines * lineHeight + padding;
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function resizePreviousSubmitPO() {
    const textarea = byId("previoussubmitpo");
    if (!textarea) return;
    textarea.rows = 2;
    textarea.wrap = "soft";
    textarea.classList.remove("text-center");
    textarea.classList.add("text-left");
    textarea.style.whiteSpace = "pre-wrap";
    textarea.style.overflowWrap = "anywhere";
    textarea.style.wordBreak = "break-word";
    resizeAutoHeightTextarea(textarea, { minLines: 2, maxLines: 14, lineHeight: 24, padding: 18 });
}

function resizeDescription() {
    resizeAutoHeightTextarea(byId("Description"), { minLines: 1, maxLines: 10, lineHeight: 24, padding: 18 });
}

function initDraggableForm() {
    const panel = byId("formWindow");
    const handle = byId("formTitle");
    if (!panel || !handle || panel.dataset.dragReady === "true") return;
    panel.dataset.dragReady = "true";

    let dragging = false;
    let startX = 0, startY = 0, originX = 0, originY = 0;

    const readOffset = () => ({
        x: Number(panel.dataset.dragX || 0),
        y: Number(panel.dataset.dragY || 0)
    });

    handle.addEventListener("pointerdown", event => {
        if (event.button !== 0 || event.target.closest("button,input,select,textarea,a")) return;
        const current = readOffset();
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        originX = current.x;
        originY = current.y;
        handle.setPointerCapture?.(event.pointerId);
        panel.classList.add("is-dragging");
        event.preventDefault();
    });

    handle.addEventListener("pointermove", event => {
        if (!dragging) return;
        const rect = panel.getBoundingClientRect();
        const nextX = originX + event.clientX - startX;
        const nextY = originY + event.clientY - startY;
        const minX = -rect.left + Number(panel.dataset.dragX || 0);
        const maxX = window.innerWidth - rect.right + Number(panel.dataset.dragX || 0);
        const minY = -rect.top + Number(panel.dataset.dragY || 0);
        const maxY = window.innerHeight - Math.min(70, rect.height) - rect.top + Number(panel.dataset.dragY || 0);
        const x = Math.min(Math.max(nextX, minX), maxX);
        const y = Math.min(Math.max(nextY, minY), maxY);
        panel.dataset.dragX = String(x);
        panel.dataset.dragY = String(y);
        panel.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });

    const stop = event => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove("is-dragging");
        try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
}

function resizeVendorBox(container, count) {
    if (!container) return;
    const visibleRows = Math.min(Math.max(Number(count) || 1, 1), 8);
    container.style.height = `${Math.max(58, visibleRows * 42 + 18)}px`;
    container.style.minHeight = "58px";
    container.style.overflowY = (Number(count) || 0) > 8 ? "auto" : "hidden";
}

function buildStatusRebidDisplay(round = currentRound) {
    const activeRound = normalizeRound(round) || "R0";
    const originalStatus = asText(loadedRow?.statusrebid);

    // Nilai Status Rebid dari file import tetap dipertahankan bila memang ada.
    // Untuk data aplikasi (atau data lama yang kolomnya masih kosong), status
    // dibentuk ulang dari round aktif, jumlah vendor submit, dan finish date.
    if (shouldPreserveImportedFormat() && originalStatus) {
        return originalStatus.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    const key = activeRound.toLowerCase();
    const useCurrentState = roundStateInitialized && activeRound === currentRound;
    const invited = useCurrentState
        ? currentInvitationVendors
        : splitVendorList(loadedRow?.[`${key}company`] || loadedRow?.roundcompany || "");
    const submitted = useCurrentState
        ? currentSubmittedVendors
        : splitVendorList(loadedRow?.[`${key}submitcompany`] || loadedRow?.roundsubmitcompany || "");
    const finish = loadedRow?.[`${key}finishdate`] || loadedRow?.roundfinishdate || "";
    const finishISO = parseDateToISO(finish);
    const finishText = finishISO ? formatISODate(finishISO) : asText(finish);

    return [activeRound, `${submitted.length} of ${invited.length}`, finishText]
        .filter(Boolean)
        .join("\n");
}

function updateStatusRebidDisplay() {
    const field = byId("statusrebidDisplay");
    if (!field) return;
    field.value = buildStatusRebidDisplay(roundPOInput?.value || currentRound);
}

/* ==========================================
   ACTIVE ROUND / VENDOR UI
========================================== */

function renderInvitationVendors(vendors) {
    const container = byId("invitationVendorList");
    container.innerHTML = "";

    if (!vendors.length) {
        const empty = document.createElement("div");
        empty.className = "vendor-empty";
        empty.textContent = "Belum ada vendor pada Bidderlist untuk round ini.";
        container.appendChild(empty);
        resizeVendorBox(container, 0);
        return;
    }

    vendors.forEach(vendor => {
        const item = document.createElement("div");
        item.className = "vendor-list-item";
        item.textContent = vendor;
        container.appendChild(item);
    });
    resizeVendorBox(container, vendors.length);
}

function renderSubmitQuoteVendors(invitedVendors, submittedVendors) {
    const container = byId("submitQuoteVendorList");
    container.innerHTML = "";

    const allVendors = uniqueValues([...invitedVendors, ...submittedVendors]);
    const submittedSet = new Set(submittedVendors.map(vendor => vendor.toLowerCase()));

    if (!allVendors.length) {
        const empty = document.createElement("div");
        empty.className = "vendor-empty";
        empty.textContent = "Belum ada vendor yang dapat dipilih.";
        container.appendChild(empty);
        resizeVendorBox(container, 0);
        return;
    }

    allVendors.forEach(vendor => {
        const label = document.createElement("label");
        label.className = "vendor-choice";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = vendor;
        checkbox.checked = submittedSet.has(vendor.toLowerCase());
        checkbox.addEventListener("change", handleSubmitVendorChange);

        const text = document.createElement("span");
        text.textContent = vendor;

        label.appendChild(checkbox);
        label.appendChild(text);
        container.appendChild(label);
    });
    resizeVendorBox(container, allVendors.length);
}

function persistCurrentRoundState() {
    if (!roundStateInitialized || !loadedRow || !currentRound) return;

    // Baca ulang checkbox yang sedang terlihat tepat sebelum data round aktif
    // dikumpulkan. Dengan begitu pilihan Submit Company tetap ikut tersimpan
    // ketika pengguna memilih Flow Process Create CQS lalu menekan Update.
    const submitCompanyInputs = Array.from(
        byId("submitQuoteVendorList")?.querySelectorAll('input[type="checkbox"]') || []
    );
    if (submitCompanyInputs.length) {
        currentSubmittedVendors = submitCompanyInputs
            .filter(input => input.checked)
            .map(input => input.value);
    }

    const key = currentRound.toLowerCase();
    loadedRow[`${key}company`] = joinVendorList(currentInvitationVendors);
    loadedRow[`${key}submitcompany`] = joinVendorList(currentSubmittedVendors);
    loadedRow.roundcompany = loadedRow[`${key}company`];
    loadedRow.roundsubmitcompany = loadedRow[`${key}submitcompany`];

    // Sinkronkan langsung agar perubahan checkbox Submit Company tidak hilang
    // ketika form berpindah round atau sebelum data dikirim ke parent.
    if (!shouldPreserveImportedFormat()) {
        loadedRow.finalvendorlist = loadedRow[`${key}submitcompany`];
        loadedRow.finalsubmitvendor = loadedRow[`${key}submitcompany`];
    }
}

function handleSubmitVendorChange() {
    currentSubmittedVendors = Array.from(byId("submitQuoteVendorList").querySelectorAll('input[type="checkbox"]:checked'))
        .map(input => input.value);
    persistCurrentRoundState();
    updateStatusRebidDisplay();
    updateWinnerOptions();
    formChanged = true;
}

function applyRound(round, preferredWinner = "") {
    persistCurrentRoundState();

    currentRound = normalizeRound(round) || "R0";
    roundPOInput.value = currentRound;
    const key = currentRound.toLowerCase();

    const isLatestRound = currentRound === detectLatestRound(loadedRow);
    const invitationFallback = isLatestRound
        ? loadedRow.roundcompany || loadedRow.finalvendorlist || loadedRow.roundsubmitcompany || loadedRow.finalsubmitvendor
        : "";
    const submittedFallback = isLatestRound ? loadedRow.roundsubmitcompany || loadedRow.finalsubmitvendor : "";

    currentInvitationVendors = splitVendorList(loadedRow[`${key}company`] || invitationFallback);
    currentSubmittedVendors = splitVendorList(loadedRow[`${key}submitcompany`] || submittedFallback);

    renderInvitationVendors(currentInvitationVendors);
    renderSubmitQuoteVendors(currentInvitationVendors, currentSubmittedVendors);
    updateStatusRebidDisplay();
    roundStateInitialized = true;
    updateWinnerOptions(preferredWinner || loadedRow.winnerpo || "");
}

function updateWinnerOptions(preferredWinner = winnerPOInput.value) {
    // Prioritaskan Winner PO yang sudah tersimpan pada cache/Google Sheet.
    const savedWinner = asText(preferredWinner || loadedRow.winnerpo);
    winnerPOInput.innerHTML = '<option value="">-- Select submitted vendor --</option>';

    currentSubmittedVendors.forEach(vendor => {
        const option = document.createElement("option");
        option.value = vendor;
        option.textContent = vendor;
        winnerPOInput.appendChild(option);
    });

    const matched = currentSubmittedVendors.find(vendor => companyNamesEqual(vendor, savedWinner));

    if (matched) {
        winnerPOInput.value = matched;
        loadedRow.winnerpo = matched;
    } else if (savedWinner) {
        // Data lama tetap ditampilkan walaupun daftar submit pada round aktif belum sinkron.
        // Saat pengguna mengganti pilihan, opsi yang tersedia tetap hanya vendor submit.
        const existingOption = document.createElement("option");
        existingOption.value = savedWinner;
        existingOption.textContent = savedWinner;
        existingOption.dataset.existingWinner = "true";
        winnerPOInput.insertBefore(existingOption, winnerPOInput.options[1] || null);
        winnerPOInput.value = savedWinner;
        loadedRow.winnerpo = savedWinner;
    } else {
        winnerPOInput.value = "";
    }

    updateWinnerEmail();
}

async function fetchCompanyDirectoryFromSheet() {
    try {
        const response = await fetch(`${GAS_URL}?sheet=Company`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Company sheet HTTP ${response.status}`);
        const result = await response.json();
        return normalizeCompanyDirectory(result.rows || []);
    } catch (error) {
        console.warn("Company sheet tidak dapat dibaca:", error);
        return [];
    }
}

async function loadCompanyDirectory(forceRefresh = false) {
    if (companyDirectory && !forceRefresh) return companyDirectory;

    if (!forceRefresh) {
        try {
            if (window.parent && window.parent !== window && typeof window.parent.getCompanyDirectory === "function") {
                const parentData = normalizeCompanyDirectory(window.parent.getCompanyDirectory());
                if (parentData.length) {
                    companyDirectory = parentData;
                    return companyDirectory;
                }
            }
        } catch (error) {
            console.warn("Company directory parent tidak dapat diakses:", error);
        }

        try {
            const rows = normalizeCompanyDirectory(
                extractArrayFromCache(localStorage.getItem(COMPANY_CACHE_KEY))
            );
            if (rows.length) {
                companyDirectory = rows;
                return companyDirectory;
            }
        } catch (error) {
            console.warn("Company cache tidak dapat dibaca:", error);
        }
    }

    companyDirectory = await fetchCompanyDirectoryFromSheet();
    return companyDirectory;
}

async function updateWinnerEmail() {
    const winner = asText(winnerPOInput.value);
    const savedEmail = asText(loadedRow.emailwinnerpo || winnerEmailInput.value);
    const originalWinner = asText(loadedRow.winnerpo);

    if (!winner) {
        winnerEmailInput.value = "";
        return;
    }

    // Kosongkan email lama saat Winner PO berubah agar email vendor sebelumnya
    // tidak ikut tersimpan untuk vendor yang berbeda.
    if (loadedRow.winnerpo && !companyNamesEqual(loadedRow.winnerpo, winner)) {
        winnerEmailInput.value = "";
    }
    loadedRow.winnerpo = winner;

    if (shouldPreserveImportedFormat() && savedEmail && companyNamesEqual(winner, originalWinner)) {
        winnerEmailInput.value = savedEmail;
        return;
    }

    try {
        if (window.parent && window.parent !== window && typeof window.parent.getVendorEmail === "function") {
            const email = asText(window.parent.getVendorEmail(winner));
            if (email) {
                winnerEmailInput.value = email;
                loadedRow.emailwinnerpo = email;
                return;
            }
        }
    } catch (error) {
        console.warn("Email vendor parent tidak dapat diakses:", error);
    }

    let companies = await loadCompanyDirectory();
    let match = findCompanyByName(companies, winner);
    let email = asText(getCompanyEmail(match));

    // Cache Company mungkin belum terbaru. Jika belum ditemukan, baca ulang
    // master Company/Vendor Company langsung dari Google Sheet.
    if (!email) {
        companies = await loadCompanyDirectory(true);
        match = findCompanyByName(companies, winner);
        email = asText(getCompanyEmail(match));
    }

    winnerEmailInput.value = email || savedEmail;
    loadedRow.emailwinnerpo = winnerEmailInput.value;
}

/* ==========================================
   FORM FILL / COLLECT
========================================== */

function normalizePreviousSubmitPODisplay(value) {
    return asText(value)
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/\s*[;|•]+\s*/g, "\n")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n");
}

function fillForm(row) {
    initializeUsdRateSnapshot(row);
    byId("noPR").value = row.noPR || "";
    byId("Description").value = row.Description || "";
    byId("previoussubmitpo").value = normalizePreviousSubmitPODisplay(row.previoussubmitpo || "");
    resizePreviousSubmitPO();
    resizeDescription();
    byId("pic").value = row.pic || "";
    byId("departement").value = row.departement || "";
    byId("pengadaan").value = row.pengadaan || "";
    byId("statuspr").value = row.statuspr || "";
    rfqInput.value = formatRFQ(row.rfq, row.statuspr);
    estPricePrInput.value = formatUsdAmount(row.estpricerp);
    // Nilai IDR selalu dihitung ulang dari Est. Price PR dan snapshot kurs PR.
    // Jangan memakai nilai lama/fallback yang tersimpan pada record Edit.
    recalculateEstimatedPriceIdr();
    byId("flowprocess").value = row.flowprocess || "";
    byId("nopo").value = row.nopo || "";
    priceRpInput.value = formatCurrencyInput(row.pricerp);
    winnerEmailInput.value = row.emailwinnerpo || "";
    byId("note").value = row.note || "";

    setDateFieldValue("assignprdate", row.assignprdate);
    setDateFieldValue("cqscreatedate", row.cqscreatedate);
    setDateFieldValue("cqsapprovaldate", row.cqsapprovaldate);
    setDateFieldValue("pocreatedate", row.pocreatedate);
    setDateFieldValue("podeldate", row.podeldate);
    setDateFieldValue("actualporeleasedate", row.actualporeleasedate);
    setDateFieldValue("actualpodeldate", row.actualpodeldate);
    setDateFieldValue("actualreceivedpo", row.actualreceivedpo);

    applyRound(row.roundpo || detectLatestRound(row), row.winnerpo || "");
    applyPOCreateDateVisibility();
    initializeWorkflowState(row);
    applyWorkflowRules({ initial: true });
}

function collectTextField(id, originalKey = id) {
    const input = byId(id);
    const currentValue = input?.value ?? "";
    const originalValue = loadedRow?.[originalKey] ?? "";
    if (shouldPreserveImportedFormat() && currentValue === String(originalValue)) return originalValue;
    return asText(currentValue);
}

function collectDateField(id, originalKey = id) {
    const input = byId(id);
    const originalValue = loadedRow?.[originalKey] ?? "";
    if (shouldPreserveImportedFormat() && input?.value === parseDateToISO(originalValue)) return originalValue;
    return getDateFieldValue(id);
}

function collectCurrencyField(input, originalKey) {
    const originalValue = loadedRow?.[originalKey] ?? "";
    if (shouldPreserveImportedFormat() && input.value === formatCurrencyInput(originalValue)) return originalValue;
    return parseCurrency(input.value);
}

function collectUsdField(input, originalKey) {
    const originalValue = loadedRow?.[originalKey] ?? "";
    if (shouldPreserveImportedFormat() && input.value === formatUsdAmount(originalValue)) return originalValue;
    return parseUsdAmount(input.value);
}

function collectRFQField() {
    const originalValue = loadedRow?.rfq ?? "";
    if (shouldPreserveImportedFormat() && rfqInput.value === formatRFQ(originalValue, loadedRow?.statuspr)) return originalValue;
    return formatRFQ(rfqInput.value, byId("statuspr")?.value);
}

function collectFormData() {
    persistCurrentRoundState();

    const activeRound = normalizeRound(roundPOInput.value) || detectLatestRound(loadedRow);
    const activeKey = activeRound.toLowerCase();
    const activeCompany = loadedRow[`${activeKey}company`] || "";
    const activeSubmitCompany = loadedRow[`${activeKey}submitcompany`] || "";

    const data = {
        procurementId: loadedRow.procurementId || "",
        prYear: loadedRow.prYear || "",
        ownerName: loadedRow.ownerName || "",
        ownerNIP: loadedRow.ownerNIP || "",
        ownerEmail: loadedRow.ownerEmail || "",
        __version: loadedRow.__version || 0,
        createdAt: loadedRow.createdAt || "",
        createdBy: loadedRow.createdBy || "",
        updatedAt: loadedRow.updatedAt || "",
        updatedBy: loadedRow.updatedBy || "",
        noPR: collectTextField("noPR"),
        Description: collectTextField("Description", "Description"),
        previoussubmitpo: collectTextField("previoussubmitpo"),
        // Final Vendor List adalah hasil BidderList. Form Admin tidak boleh
        // menggantinya dengan Submit Company saat workspace disimpan belakangan.
        finalvendorlist: loadedRow.finalvendorlist || "",
        finalsubmitvendor: shouldPreserveImportedFormat() ? loadedRow.finalsubmitvendor : activeSubmitCompany,
        roundpo: activeRound,
        extendedrebidreason: byId("extendedRebidReason")?.value || extendedRebidRequest?.reason || "",
        extendedrebidbackupurl: extendedRebidRequest?.fileUrl || "",
        extendedrebidrequestedround: extendedRebidRequest?.requestedRound || "",
        // Status Rebid dihitung dari round aktif, jumlah vendor submit, dan
        // finish date. Nilai import non-kosong tetap dipertahankan oleh helper.
        statusrebid: buildStatusRebidDisplay(activeRound),
        roundcompany: activeCompany,
        roundsubmitcompany: activeSubmitCompany,
        roundstartdate: loadedRow[`${activeKey}startdate`] || loadedRow.roundstartdate || "",
        roundfinishdate: loadedRow[`${activeKey}finishdate`] || loadedRow.roundfinishdate || "",
        pic: collectTextField("pic"),
        assignprdate: collectDateField("assignprdate"),
        departement: collectTextField("departement"),
        pengadaan: collectTextField("pengadaan"),
        statuspr: collectTextField("statuspr"),
        rfq: collectRFQField(),
        estpricerp: collectUsdField(estPricePrInput, "estpricerp"),
        estpriceus: collectCurrencyField(estPriceUsInput, "estpriceus"),
        usdidrrate: Number(usdRateSnapshot.rate || 0),
        usdidrratedate: usdRateSnapshot.rateDate || "",
        usdidrsource: usdRateSnapshot.source || "",
        usdidrlocked: Boolean(usdRateSnapshot.locked && Number(usdRateSnapshot.rate) > 0),
        flowprocess: collectTextField("flowprocess"),
        winnerpo: collectTextField("winnerpo"),
        emailwinnerpo: collectTextField("emailwinnerpo"),
        nopo: collectTextField("nopo"),
        pricerp: collectCurrencyField(priceRpInput, "pricerp"),
        cqscreatedate: collectDateField("cqscreatedate"),
        cqsapprovaldate: collectDateField("cqsapprovaldate"),
        pocreatedate: collectDateField("pocreatedate"),
        podeldate: collectDateField("podeldate"),
        actualporeleasedate: collectDateField("actualporeleasedate"),
        actualpodeldate: collectDateField("actualpodeldate"),
        actualreceivedpo: collectDateField("actualreceivedpo"),
        note: collectTextField("note"),
        folderid: loadedRow.folderid || "",
        folderlink: loadedRow.folderlink || "",
        folderstructure: loadedRow.folderstructure || folderStructure || null,
        [IMPORT_PRESERVE_FLAG]: shouldPreserveImportedFormat(),
        __recordOrigin: loadedRow.__recordOrigin || (procurementMode === "ADD" ? "ADD" : "EDIT")
    };

    ROUND_OPTIONS.forEach(round => {
        const key = round.toLowerCase();
        data[`${key}company`] = loadedRow[`${key}company`] || "";
        data[`${key}submitcompany`] = loadedRow[`${key}submitcompany`] || "";
        data[`${key}startdate`] = loadedRow[`${key}startdate`] || "";
        data[`${key}finishdate`] = loadedRow[`${key}finishdate`] || "";
    });

    return data;
}

/* ==========================================
   WORKFLOW FIELD LOCKING
========================================== */

function normalizeFlowProcess(value) {
    return asText(value).replace(/\s+/g, " ").toUpperCase();
}

function isCQSOrLaterFlow(value) {
    return CQS_OR_LATER_FLOW_VALUES.has(normalizeFlowProcess(value));
}

function rowShowsCQSProgress(row = loadedRow) {
    if (!row || typeof row !== "object") return false;

    const currentFlow = normalizeFlowProcess(row.flowprocess || row["Flow Process"]);

    // Current Flow Process menjadi acuan utama. Saat proses masih sebelum
    // Create CQS, bagian atas tetap aktif meskipun data import lama memiliki
    // isi pada kolom tahap berikutnya.
    if (isCQSOrLaterFlow(currentFlow)) return true;

    // Data historis hanya dipakai untuk mengenali RFQ yang merupakan proses
    // ulang setelah CQS. RFQ awal tetap diperlakukan sebagai tahap sebelum CQS.
    if (currentFlow !== "RFQ") return false;

    return [
        row.cqscreatedate, row.cqsapprovaldate,
        row.pocreatedate, row.podeldate, row.actualporeleasedate,
        row.actualpodeldate, row.actualreceivedpo,
        row.winnerpo, row.nopo, row.pricerp
    ].some(value => asText(value) !== "");
}

function initializeWorkflowState(row = loadedRow) {
    workflowReachedCQS = rowShowsCQSProgress(row);
    rfqResetApplied = false;
}

function setWorkflowFieldLocked(id, locked) {
    const control = byId(id);
    if (!control) return;

    const permanentlyReadonly = control.readOnly || control.dataset.dateReadonly === "true";
    const shouldLock = Boolean(locked || permanentlyReadonly);

    control.disabled = shouldLock;
    control.dataset.workflowLocked = locked ? "true" : "false";
    control.classList.toggle("workflow-locked-control", Boolean(locked));
    control.setAttribute("aria-disabled", shouldLock ? "true" : "false");

    if (control.matches('input[type="date"]')) {
        control.style.pointerEvents = shouldLock ? "none" : "auto";
    }

    const searchableWrapper = control.closest(".searchable-select");
    if (locked && searchableWrapper) {
        searchableWrapper.querySelector(".searchable-options")?.classList.add("hidden");
        control.setAttribute("aria-expanded", "false");
    }

    const dateWrapper = control.closest(".formatted-date-field");
    if (dateWrapper) {
        const display = dateWrapper.querySelector(".date-display-input");
        const calendar = dateWrapper.querySelector(".date-calendar-button");
        const clear = dateWrapper.querySelector(".date-clear-button");

        if (display) {
            display.disabled = shouldLock;
            display.classList.toggle("workflow-locked-control", Boolean(locked));
        }
        if (calendar) calendar.disabled = shouldLock;
        if (clear) {
            clear.disabled = shouldLock;
            if (shouldLock) clear.classList.add("hidden");
            else if (typeof control._syncDisplay === "function") control._syncDisplay();
        }
    }
}

function ensureEditableDateControls() {
    // Date tahap CQS dan PO tidak termasuk bagian atas yang dikunci. Pastikan
    // date picker tetap aktif setiap kali aturan workflow dihitung ulang.
    [
        "cqscreatedate", "cqsapprovaldate", "pocreatedate", "podeldate",
        "actualporeleasedate", "actualreceivedpo"
    ].forEach(id => setWorkflowFieldLocked(id, false));
}

function clearSubmitQuoteForRFQ() {
    currentSubmittedVendors = [];

    const activeRound = normalizeRound(roundPOInput?.value) || currentRound || "R0";
    const key = activeRound.toLowerCase();
    loadedRow[`${key}submitcompany`] = "";
    loadedRow.roundsubmitcompany = "";
    loadedRow.finalsubmitvendor = "";
    loadedRow.winnerpo = "";
    loadedRow.emailwinnerpo = "";

    if (winnerPOInput) {
        winnerPOInput.innerHTML = '<option value="">-- Select submitted vendor --</option>';
        winnerPOInput.value = "";
    }
    if (winnerEmailInput) winnerEmailInput.value = "";

    renderSubmitQuoteVendors(currentInvitationVendors, []);
}

function setVendorColumnsVisibility(showSubmitQuote) {
    const submitWrapper = byId("submitQuoteVendorWrapper");
    const invitationWrapper = byId("invitationVendorWrapper");
    const createDateWrapper = byId("cqsCreateDateWrapper");
    const approvalDateWrapper = byId("cqsApprovalDateWrapper");

    // List Invitation Vendor selalu ditampilkan pada mode Edit sebagai
    // referensi vendor dari Bidderlist untuk round aktif. Hanya Submit Quote
    // Vendor yang mengikuti tahapan Flow Process Create CQS/CQS.
    invitationWrapper?.classList.remove("hidden");
    submitWrapper?.classList.toggle("hidden", !showSubmitQuote);

    renderInvitationVendors(currentInvitationVendors);

    if (showSubmitQuote) {
        renderSubmitQuoteVendors(currentInvitationVendors, currentSubmittedVendors);
        if (invitationWrapper) invitationWrapper.style.gridColumn = "span 4 / span 4";
        if (submitWrapper) submitWrapper.style.gridColumn = "span 4 / span 4";
        if (createDateWrapper) createDateWrapper.style.gridColumn = "span 2 / span 2";
        if (approvalDateWrapper) approvalDateWrapper.style.gridColumn = "span 2 / span 2";
    } else {
        const submitList = byId("submitQuoteVendorList");
        if (submitList) submitList.innerHTML = "";

        // Ketika Submit Quote dan tanggal CQS tidak ditampilkan, List
        // Invitation Vendor menggunakan lebar baris yang tersedia. Data vendor
        // tetap disimpan dan tidak dikosongkan.
        if (invitationWrapper) invitationWrapper.style.gridColumn = "span 12 / span 12";
        if (createDateWrapper) createDateWrapper.style.gridColumn = "span 6 / span 6";
        if (approvalDateWrapper) approvalDateWrapper.style.gridColumn = "span 6 / span 6";
    }

    byId("submitQuoteVendorList")?.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.disabled = !showSubmitQuote;
    });
}

function setCQSDateColumnsVisibility(visible) {
    const createDateWrapper = byId("cqsCreateDateWrapper");
    const approvalDateWrapper = byId("cqsApprovalDateWrapper");

    createDateWrapper?.classList.toggle("hidden", !visible);
    approvalDateWrapper?.classList.toggle("hidden", !visible);
}

function setWorkflowNotice(message = "", state = "") {
    const notice = byId("workflowEditNotice");
    if (!notice) return;

    notice.textContent = message;
    notice.classList.toggle("hidden", !message);
    notice.dataset.state = state;
}

function applyWorkflowRules(options = {}) {
    const flowValue = byId("flowprocess")?.value || loadedRow.flowprocess || "";
    const normalizedFlow = normalizeFlowProcess(flowValue);
    const isRFQ = normalizedFlow === "RFQ";
    const isNowCQSOrLater = isCQSOrLaterFlow(normalizedFlow);
    const hasApprovalDate = Boolean(byId("cqsapprovaldate")?.value);

    if (isNowCQSOrLater) workflowReachedCQS = true;

    ensureEditableDateControls();

    // Setelah pernah mencapai CQS, bagian atas tetap terkunci. Saat kembali ke
    // RFQ hanya Assign Date yang dibuka untuk koreksi/re-assignment.
    const lockTopSection = procurementMode === "EDIT" && workflowReachedCQS;
    TOP_WORKFLOW_FIELD_IDS.forEach(id => setWorkflowFieldLocked(id, lockTopSection));

    if (lockTopSection && isRFQ) {
        setWorkflowFieldLocked("assignprdate", false);
        setWorkflowNotice(
            hasApprovalDate
                ? "Mode RFQ ulang: hanya Assign Date dan Flow Process yang dapat diubah. Submit Quote Vendor sudah aktif karena CQS Approval Date telah dipilih."
                : "Mode RFQ ulang: hanya Assign Date dan Flow Process yang dapat diubah. Submit Quote Vendor dikosongkan dan akan aktif kembali setelah CQS Approval Date dipilih.",
            "rfq"
        );
    } else if (lockTopSection) {
        setWorkflowNotice(
            "Proses sudah mencapai CQS. Data bagian atas dikunci; ubah Flow Process ke RFQ jika Assign Date perlu diperbarui.",
            "locked"
        );
    } else {
        setWorkflowNotice("", "");
    }

    // List Invitation selalu tampil pada mode Edit. Submit Quote mulai tampil
    // sejak Create CQS/CQS dan tetap tampil pada seluruh proses setelah CQS.
    const showVendorColumns = procurementMode === "EDIT" && isNowCQSOrLater;

    // Tanggal CQS mulai tampil sejak Create CQS/CQS dan tetap tersedia pada
    // tahap setelahnya. Bagian PO tetap baru dibuka setelah CQS Approval Date
    // sudah memiliki tanggal melalui applyPOCreateDateVisibility().
    const showCQSDateColumns = procurementMode === "EDIT" && isNowCQSOrLater;
    setCQSDateColumnsVisibility(showCQSDateColumns);

    // List Invitation Vendor selalu terlihat pada mode Edit. Submit Quote Vendor
    // tampil sejak Create CQS/CQS dan tetap terlihat pada proses setelahnya.
    if (!showVendorColumns && isRFQ && !hasApprovalDate && workflowReachedCQS && !rfqResetApplied) {
        clearSubmitQuoteForRFQ();
        rfqResetApplied = true;
        if (!options.initial) formChanged = true;
    }
    if (showVendorColumns) rfqResetApplied = false;
    setVendorColumnsVisibility(showVendorColumns);
}

/* ==========================================
   MODE / VISIBILITY
========================================== */

function applyFormMode() {
    const isEdit = procurementMode === "EDIT";
    byId("formTitle").textContent = isEdit ? "Edit Procurement Tracking" : "Add Procurement Tracking";
    byId("submitBtn").textContent = isEdit ? "Update" : "Submit";
    byId("editOnlySection").classList.toggle("hidden", !isEdit);
    byId("roundPOWrapper").classList.toggle("hidden", !isEdit);
    byId("statusRebidWrapper")?.classList.toggle("hidden", !isEdit);
    byId("folderManagerSection")?.classList.toggle("hidden", !isEdit);
    byId("saveCreateFolderBtn")?.classList.toggle("hidden", isEdit);
    syncUsdRateBtn?.classList.toggle("hidden", isEdit);
    updateUsdRateUI();
}

function applyPOCreateDateVisibility() {
    const hasApproval = Boolean(byId("cqsapprovaldate")?.value);
    const hasPOData = ["pocreatedate", "podeldate", "actualporeleasedate", "actualpodeldate", "actualreceivedpo"]
        .some(id => Boolean(byId(id)?.value));
    byId("poCreateDateWrapper")?.classList.toggle("hidden", !(hasApproval || hasPOData));
}

async function initForm() {
    applyFormMode();

    if (procurementMode === "EDIT") {
        await loadEditData();
        initFolderManager();
        await loadExtendedRebidRequest(roundPOInput.value);
    } else {
        loadedRow = normalizeProcurementRow({});
        originalPR = "";
        originalData = null;
        await ensureUsdRateSnapshot();
        initializeWorkflowState(loadedRow);
        applyWorkflowRules({ initial: true });
        updateExtendedRebidUI();
        formChanged = false;
    }
}

/* ==========================================
   PRICE / RFQ EVENTS
========================================== */

function bindFormattingEvents() {
    const previousSubmitPOInput = byId("previoussubmitpo");
    previousSubmitPOInput?.addEventListener("input", resizePreviousSubmitPO);
    previousSubmitPOInput?.addEventListener("change", resizePreviousSubmitPO);

    estPricePrInput.addEventListener("input", function () {
        recalculateEstimatedPriceIdr();
    });
    estPricePrInput.addEventListener("blur", function () {
        this.value = formatUsdAmount(this.value);
        recalculateEstimatedPriceIdr();
    });

    priceRpInput.addEventListener("input", function () {
        const numeric = parseCurrency(this.value);
        this.value = numeric === "" ? "" : Number(numeric).toLocaleString("id-ID");
    });

    rfqInput.addEventListener("blur", function () {
        this.value = formatRFQ(this.value, byId("statuspr")?.value);
    });

    byId("statuspr")?.addEventListener("change", function () {
        if (rfqInput.value) rfqInput.value = formatRFQ(rfqInput.value, this.value);
    });
}

/* ==========================================
   PROCUREMENT DRIVE FOLDER MANAGER
========================================== */

function setFolderManagerStatus(message, state = "") {
    const status = byId("folderManagerStatus");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
}

function getExistingRounds(row = loadedRow) {
    const latest = normalizeRound(row?.roundpo) || detectLatestRound(row || {});
    const latestIndex = Math.max(0, ROUND_OPTIONS.indexOf(latest));
    const rounds = ROUND_OPTIONS.slice(0, latestIndex + 1);

    ROUND_OPTIONS.forEach(round => {
        const key = round.toLowerCase();
        const hasData = [
            row?.[`${key}company`], row?.[`${key}submitcompany`],
            row?.[`${key}startdate`], row?.[`${key}finishdate`]
        ].some(value => asText(value) !== "");
        if (hasData && !rounds.includes(round)) rounds.push(round);
    });

    return rounds.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function selectedFolderTarget() {
    const type = byId("documentFolderType")?.value || DOCUMENT_FOLDER_TYPES[0];
    return { type, round: "" };
}

function updateFolderTargetUI() {
    const { type, round } = selectedFolderTarget();
    byId("documentRoundWrapper")?.classList.add("hidden");
    const path = type;
    if (byId("folderTargetPath")) byId("folderTargetPath").textContent = path;
}

async function postFolderAction(payload) {
    const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    } catch (_) {
        throw new Error(text || `Google Apps Script HTTP ${response.status}`);
    }
    if (!response.ok || result.success === false) {
        throw new Error(result.message || `Google Apps Script HTTP ${response.status}`);
    }
    return result;
}

function applyFolderResult(result) {
    if (!result || typeof result !== "object") return;
    const previousFolderId = loadedRow.folderid || "";
    const previousFolderLink = loadedRow.folderlink || "";
    loadedRow.folderid = result.folderId || result.rootFolderId || loadedRow.folderid || "";
    loadedRow.folderlink = result.folderUrl || result.rootFolderUrl || loadedRow.folderlink || "";
    folderStructure = result.folderMap || result.structure || folderStructure || null;
    loadedRow.folderstructure = folderStructure;

    // Sebelumnya Folder ID/Link hasil createFolder atau lookup by name hanya
    // tersimpan di memori Form (loadedRow) dan baru ikut ke Sheet kalau
    // pengguna klik Update. Kalau pengguna langsung pindah tab/menutup
    // Workspace, ID ini hilang sehingga status folder "belum dibuat" muncul
    // lagi walau foldernya sudah benar-benar ada di Drive. Sekarang begitu
    // ID/Link berubah, langsung diberitahukan ke parent (Workspace -> App)
    // supaya Sheet ikut ter-update seketika.
    const changed = loadedRow.folderid !== previousFolderId || loadedRow.folderlink !== previousFolderLink;
    if (changed && loadedRow.folderid) {
        notifyFolderUpdated();
    }
}

function notifyFolderUpdated() {
    try {
        window.parent?.postMessage({
            action: "FOLDER_UPDATED",
            noPR: loadedRow.noPR || byId("noPR")?.value || "",
            folderId: loadedRow.folderid || "",
            folderUrl: loadedRow.folderlink || "",
            folderStructure: loadedRow.folderstructure || folderStructure || null
        }, "*");
    } catch (_) {}
}

async function ensureFolderStructure({ quiet = false } = {}) {
    if (folderManagerBusy) return folderStructure;
    if (!asText(loadedRow.noPR || byId("noPR")?.value)) {
        throw new Error("No PR kosong. Simpan data terlebih dahulu.");
    }

    folderManagerBusy = true;
    setFolderManagerStatus("Menyiapkan susunan folder...", "working");
    try {
        const result = await postFolderAction({
            action: "createFolder",
            createStructure: true,
            noPR: loadedRow.noPR || byId("noPR")?.value,
            description: loadedRow.Description || byId("Description")?.value,
            folderId: loadedRow.folderid || "",
            folderUrl: loadedRow.folderlink || "",
            rounds: getExistingRounds(),
            folderTypes: DOCUMENT_FOLDER_TYPES
        });
        applyFolderResult(result);
        setFolderManagerStatus("Folder siap. Pilih lokasi untuk membuka atau mengunggah dokumen.", "ready");
        if (!quiet) showPopup("Folder Siap", result.message || "Susunan folder berhasil dibuat atau diperbarui.");
        return folderStructure;
    } catch (error) {
        setFolderManagerStatus("Folder belum siap: " + (error.message || error), "error");
        if (!quiet) showPopup("Folder Gagal", error.message || "Gagal menyiapkan folder.");
        throw error;
    } finally {
        folderManagerBusy = false;
    }
}

function lookupTargetFolder(structure, type, round) {
    if (!structure) return null;
    const direct = structure[type];
    if (!direct) return null;
    if (!round) return direct;
    return direct.rounds?.[round] || direct[round] || null;
}

async function resolveTargetFolder() {
    const target = selectedFolderTarget();
    let info = lookupTargetFolder(folderStructure || loadedRow.folderstructure, target.type, target.round);
    if (info?.url || info?.folderUrl || info?.id || info?.folderId) return { ...target, info };

    try {
        const result = await postFolderAction({
            action: "getFolderStructure",
            noPR: loadedRow.noPR,
            description: loadedRow.Description,
            folderId: loadedRow.folderid || "",
            rounds: getExistingRounds(),
            folderTypes: DOCUMENT_FOLDER_TYPES
        });
        applyFolderResult(result);
        info = lookupTargetFolder(folderStructure, target.type, target.round);
        if (!info) {
            await ensureFolderStructure({ quiet: true });
            info = lookupTargetFolder(folderStructure, target.type, target.round);
        }
    } catch (_) {
        await ensureFolderStructure({ quiet: true });
        info = lookupTargetFolder(folderStructure, target.type, target.round);
    }

    return { ...target, info };
}

function escapeFolderHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function formatFolderFileSize(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isOfficeDesktopCompatibleUrl(value) {
    const sourceUrl = String(value || '').trim();
    if (!sourceUrl) return false;
    try {
        const host = new URL(sourceUrl, window.location.href).hostname.toLowerCase();
        return host === '1drv.ms' ||
            host === 'onedrive.live.com' || host.endsWith('.onedrive.live.com') ||
            host === 'sharepoint.com' || host.endsWith('.sharepoint.com');
    } catch (_) {
        return false;
    }
}

function openUrlInBrowser(value) {
    const targetUrl = String(value || '').trim();
    if (!targetUrl) return false;
    const opened = window.open(targetUrl, '_blank', 'noopener');
    if (!opened) window.location.href = targetUrl;
    return true;
}

function openProcurementFileOriginal(file) {
    const extension = String(file?.extension || file?.fileName?.split('.').pop() || '').toLowerCase();
    const isExcelFile = ['xlsx', 'xls', 'xlsm', 'csv'].includes(extension);

    if (isExcelFile) {
        const downloadUrl = String(file?.downloadUrl || '').trim();
        const fileUrl = String(file?.fileUrl || '').trim();
        const sourceUrl = downloadUrl || fileUrl;
        if (!sourceUrl) return showPopup('File Tidak Dapat Dibuka', 'URL file Excel tidak tersedia.');

        // Office URI (ms-excel:ofe) hanya dipakai untuk URL yang memang
        // kompatibel dengan aplikasi Office desktop, seperti OneDrive/SharePoint.
        // File proyek ini disimpan di Google Drive. URL Drive biasanya melewati
        // halaman login/redirect sehingga Excel menolak perintah dengan pesan
        // "Office doesn't recognize the command". Untuk Drive, gunakan link
        // download browser agar file dapat dibuka secara lokal tanpa error.
        if (isOfficeDesktopCompatibleUrl(fileUrl || sourceUrl)) {
            window.location.href = `ms-excel:ofe|u|${fileUrl || sourceUrl}`;
            return;
        }

        openUrlInBrowser(sourceUrl);
        return;
    }

    const originalUrl = file?.fileUrl || file?.previewUrl || file?.downloadUrl;
    if (!openUrlInBrowser(originalUrl)) {
        showPopup('File Tidak Dapat Dibuka', 'URL file tidak tersedia.');
    }
}

function renderFolderFileBrowser(result) {
    const browser = byId('folderFileBrowser');
    const list = byId('folderFileBrowserList');
    const title = byId('folderFileBrowserTitle');
    if (!browser || !list) return;
    browser.classList.remove('hidden');
    if (title) title.textContent = `${result.folderType || 'Folder'} — ${(result.files || []).length} file`;
    const files = Array.isArray(result.files) ? result.files : [];
    if (!files.length) {
        list.innerHTML = '<p class="text-sm text-slate-500 py-3">Folder masih kosong.</p>';
        return;
    }
    window.__PROCUREMENT_FOLDER_FILES__ = files;
    list.innerHTML = files.map((file, index) => {
        const extension = String(file.extension || '').toLowerCase();
        const isExcelFile = ['xlsx', 'xls', 'xlsm', 'csv'].includes(extension);
        const excelSourceUrl = String(file.fileUrl || file.downloadUrl || '').trim();
        const actionLabel = isExcelFile
            ? (isOfficeDesktopCompatibleUrl(excelSourceUrl) ? 'Open in Excel' : 'Download Excel')
            : 'Open Original';
        return `<div class="folder-file-row">
          <div class="folder-file-info"><strong>${escapeFolderHtml(file.fileName)}</strong><small>${escapeFolderHtml(formatFolderFileSize(file.size))} • ${escapeFolderHtml(file.updatedAt || '')}</small></div>
          <button type="button" class="folder-action-button bg-emerald-600 hover:bg-emerald-700 text-white" onclick="openProcurementFileOriginal(window.__PROCUREMENT_FOLDER_FILES__[${index}])">${actionLabel}</button>
        </div>`;
    }).join('');
}

async function loadSelectedFolderFiles() {
    const { type } = selectedFolderTarget();
    const result = await postFolderAction({
        action: 'LIST_PROCUREMENT_FILES',
        noPR: loadedRow.noPR || byId('noPR')?.value,
        description: loadedRow.Description || byId('Description')?.value,
        folderId: loadedRow.folderid || '',
        folderType: type,
        rounds: getExistingRounds()
    });
    renderFolderFileBrowser(result);
    return result;
}

async function openSelectedFolder() {
    try {
        setFolderManagerStatus('Memuat file original dari folder...', 'working');
        const result = await loadSelectedFolderFiles();
        setFolderManagerStatus(result.message || 'Daftar file berhasil dimuat.', 'ready');
    } catch (error) {
        setFolderManagerStatus('Daftar file gagal dimuat: ' + (error.message || error), 'error');
        showPopup('Tidak Dapat Membuka Folder', error.message || String(error));
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            resolve(result.includes(",") ? result.split(",").pop() : result);
        };
        reader.onerror = () => reject(reader.error || new Error("File tidak dapat dibaca."));
        reader.readAsDataURL(file);
    });
}

function setUploadProgress(done, total, label = "Uploading...") {
    const percent = total ? Math.round((done / total) * 100) : 0;
    byId("folderUploadProgress")?.classList.remove("hidden");
    if (byId("folderUploadBar")) byId("folderUploadBar").style.width = `${percent}%`;
    if (byId("folderUploadPercent")) byId("folderUploadPercent").textContent = `${percent}%`;
    if (byId("folderUploadLabel")) byId("folderUploadLabel").textContent = label;
}

async function uploadFilesToSelectedFolder(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const uploadButtons = [byId("uploadFilesBtn"), byId("uploadDirectoryBtn"), byId("openTargetFolderBtn")].filter(Boolean);
    uploadButtons.forEach(button => button.disabled = true);
    setUploadProgress(0, files.length, `Menyiapkan ${files.length} file...`);

    try {
        const { type, round } = await resolveTargetFolder();
        let uploaded = 0;
        for (const file of files) {
            setUploadProgress(uploaded, files.length, `Uploading ${file.name}...`);
            const base64 = await fileToBase64(file);
            await postFolderAction({
                action: "uploadFile",
                noPR: loadedRow.noPR,
                description: loadedRow.Description,
                folderId: loadedRow.folderid || "",
                folderType: type,
                round,
                rounds: getExistingRounds(),
                fileName: file.name,
                mimeType: file.type || "application/octet-stream",
                fileData: base64,
                relativePath: file.webkitRelativePath || ""
            });
            uploaded += 1;
            setUploadProgress(uploaded, files.length, `${uploaded} dari ${files.length} file berhasil.`);
        }
        setFolderManagerStatus(`${files.length} file berhasil diunggah ke ${round ? `${type}/${round}` : type}.`, "ready");
        showPopup("Upload Berhasil", `${files.length} file berhasil diunggah ke ${round ? `${type} / ${round}` : type}.`);
    } catch (error) {
        setFolderManagerStatus("Upload gagal: " + (error.message || error), "error");
        showPopup("Upload Gagal", error.message || String(error));
    } finally {
        uploadButtons.forEach(button => button.disabled = false);
        byId("folderFileInput").value = "";
        byId("folderDirectoryInput").value = "";
    }
}

async function checkExistingFolderStatus() {
    // Read-only: hanya bertanya ke server apakah folder untuk No PR ini sudah
    // ada (dicari berdasarkan ID kalau ada, atau berdasarkan nama "No PR -
    // Description" kalau belum). TIDAK membuat folder baru bila belum ada,
    // supaya sekadar membuka halaman Edit/Workspace tidak diam-diam membuat
    // folder di Drive.
    try {
        const result = await postFolderAction({
            action: "getFolderStructure",
            noPR: loadedRow.noPR,
            description: loadedRow.Description,
            folderId: loadedRow.folderid || "",
            rounds: getExistingRounds(),
            folderTypes: DOCUMENT_FOLDER_TYPES
        });
        applyFolderResult(result);
        return true;
    } catch (_) {
        return false;
    }
}

function initFolderManager() {
    updateFolderTargetUI();

    // Selalu coba temukan folder di Drive lewat getFolderStructure, meskipun
    // loadedRow.folderid/folderlink kosong. codegs.js (resolveProcurementRootFolder_)
    // sudah bisa mencari folder yang sudah ada berdasarkan nama "No PR - Description",
    // jadi kita tidak boleh langsung menyimpulkan folder belum dibuat hanya karena
    // ID-nya belum sempat tersimpan di Sheet (misalnya dibuat lewat Workspace lalu
    // ditutup tanpa klik Update).
    setFolderManagerStatus("Memeriksa folder di Drive...", "working");
    checkExistingFolderStatus().then(found => {
        setFolderManagerStatus(
            found ? "Folder ditemukan. Pilih lokasi dokumen." : "Folder belum dibuat. Klik Create / Refresh Folder.",
            found ? "ready" : ""
        );
    });
}


function notifyWorkspaceContext() {
    if (!loadedRow) return;
    let data;
    try { data = collectFormData(); } catch (_) { data = { ...loadedRow, roundpo: normalizeRound(roundPOInput?.value) || currentRound || 'R0' }; }
    window.parent.postMessage({
        action: 'PROCUREMENT_CONTEXT_UPDATED',
        noPR: data.noPR || loadedRow.noPR || '',
        round: data.roundpo || currentRound || 'R0',
        data
    }, '*');
}

window.addEventListener('message', event => {
    if (event.data?.action === 'REQUEST_PROCUREMENT_CONTEXT') {
        notifyWorkspaceContext();
        return;
    }

    if (event.data?.action === 'MERGE_PROCUREMENT_WORKSPACE_DATA') {
        const incoming = event.data.data;
        if (!incoming || typeof incoming !== 'object') return;

        // Pertahankan input Admin yang sedang dikerjakan, lalu ambil hanya field
        // hasil workspace BidderList/RFQ/CQS. Dengan demikian urutan pengisian
        // workspace bebas dan Update Admin tidak mengembalikan snapshot lama.
        persistCurrentRoundState();
        const workspaceKeys = [
            'finalvendorlist', 'finalsubmitvendor',
            'roundcompany', 'roundsubmitcompany',
            'roundstartdate', 'roundfinishdate'
        ];
        ROUND_OPTIONS.forEach(round => {
            const key = round.toLowerCase();
            workspaceKeys.push(
                `${key}company`,
                `${key}submitcompany`,
                `${key}startdate`,
                `${key}finishdate`
            );
        });
        workspaceKeys.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(incoming, key)) {
                loadedRow[key] = incoming[key];
            }
        });
        notifyWorkspaceContext();
    }
});

/* ==========================================
   SAVE / CANCEL / POPUP
========================================== */

function notifyParentAndClose(data, options = {}) {
    window.parent.postMessage({
        action: "PROCUREMENT_SAVED",
        mode: procurementMode,
        originalPR,
        data,
        createFolderAfterSave: Boolean(options.createFolderAfterSave)
    }, "*");
}

function showPopup(title, message) {
    byId("popupTitle").textContent = title;
    byId("popupMessage").textContent = message;
    byId("popup").classList.remove("hidden");
    byId("popup").classList.add("flex");
}

function hidePopup() {
    byId("popup").classList.add("hidden");
    byId("popup").classList.remove("flex");
}


function roundNumber(value) {
    const round = normalizeRound(value) || "R0";
    return Number(round.substring(1)) || 0;
}

function updateExtendedRebidUI() {
    const requestedRound = normalizeRound(roundPOInput?.value) || "R0";
    const isExtended = roundNumber(requestedRound) >= 3;
    byId("extendedRebidSection")?.classList.toggle("hidden", !isExtended);
    if (!isExtended) return;

    const requestMatches = extendedRebidRequest?.requestedRound === requestedRound;
    const reasonInput = byId("extendedRebidReason");
    if (reasonInput && requestMatches && !reasonInput.value) reasonInput.value = extendedRebidRequest.reason || "";

    const status = byId("extendedRebidStatus");
    const link = byId("extendedRebidLink");
    if (requestMatches && (extendedRebidRequest?.fileUrl || extendedRebidRequest?.fileId || extendedRebidRequest?.fileName)) {
        if (status) status.textContent = `Backup ${requestedRound} tersedia: ${extendedRebidRequest.fileName || "dokumen"}`;
        if (link) {
            link.href = extendedRebidRequest.fileUrl || "#";
            link.classList.remove("hidden");
        }
    } else {
        if (status) status.textContent = `Backup permintaan untuk ${requestedRound} belum diunggah.`;
        if (link) {
            link.removeAttribute("href");
            link.classList.add("hidden");
        }
    }
}

async function loadExtendedRebidRequest(requestedRound = roundPOInput?.value) {
    const round = normalizeRound(requestedRound) || "R0";
    const noPR = asText(loadedRow.noPR || byId("noPR")?.value);
    if (!noPR || roundNumber(round) < 3) {
        extendedRebidRequest = null;
        updateExtendedRebidUI();
        return null;
    }

    try {
        const response = await fetch(`${GAS_URL}?action=loadRebidRequest&noPR=${encodeURIComponent(noPR)}&requestedRound=${encodeURIComponent(round)}`, { cache: "no-store" });
        const result = await response.json();
        extendedRebidRequest = result.success && result.found ? result : null;
    } catch (error) {
        console.warn("Gagal membaca backup extended rebid:", error);
        extendedRebidRequest = null;
    }
    updateExtendedRebidUI();
    return extendedRebidRequest;
}

function cleanBackupFilePart(value) {
    return asText(value).replace(/[\\/:*?"<>|#%{}]/g, " ").replace(/\s+/g, " ").trim();
}

async function getExtendedRebidLocalTarget(sourceRound, create = true) {
    let storage = window.MSW_EXISTING_PR_FOLDER;
    for (let attempt = 0; !storage?.resolvePrFolder && attempt < 20; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
        storage = window.MSW_EXISTING_PR_FOLDER;
    }
    if (!storage?.resolvePrFolder) {
        throw new Error("Storage Location lokal belum siap. Hubungkan folder PR terlebih dahulu.");
    }

    const pr = await storage.resolvePrFolder();
    let directory = await pr.handle.getDirectoryHandle("03. CQS", { create });
    directory = await directory.getDirectoryHandle(sourceRound, { create });
    return {
        directory,
        pr,
        path: `PR/${pr.name}/03. CQS/${sourceRound}`
    };
}

async function saveExtendedRebidBackupToLocal(file, fileName, sourceRound) {
    const target = await getExtendedRebidLocalTarget(sourceRound, true);
    const handle = await target.directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
    return {
        fileId: `local-rebid|${encodeURIComponent(sourceRound)}|${encodeURIComponent(fileName)}`,
        fileUrl: "",
        fileName,
        folderPath: `${target.path}/${fileName}`
    };
}

async function openExtendedRebidLocalBackup(event) {
    const request = extendedRebidRequest;
    if (!String(request?.fileId || "").startsWith("local-rebid|")) return;
    event?.preventDefault();

    try {
        const requestedNumber = roundNumber(request.requestedRound || roundPOInput?.value);
        const sourceRound = request.sourceRound || `R${Math.max(0, requestedNumber - 1)}`;
        const target = await getExtendedRebidLocalTarget(sourceRound, false);
        const handle = await target.directory.getFileHandle(request.fileName, { create: false });
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        const opened = window.open(url, "_blank", "noopener");
        if (!opened) {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file.name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
        showPopup("Backup Tidak Ditemukan", error.message || String(error));
    }
}

async function uploadExtendedRebidBackup() {
    const requestedRound = normalizeRound(roundPOInput?.value) || "R0";
    const requestedNumber = roundNumber(requestedRound);
    const noPR = asText(loadedRow.noPR || byId("noPR")?.value);
    const description = asText(loadedRow.Description || byId("Description")?.value);
    const reason = asText(byId("extendedRebidReason")?.value);
    const file = byId("extendedRebidFile")?.files?.[0];

    if (requestedNumber < 3) return showPopup("Round Belum Extended", "Backup khusus diperlukan mulai R3.");
    if (!noPR) return showPopup("No PR Kosong", "Isi dan simpan No PR terlebih dahulu.");
    if (!reason) return showPopup("Alasan Wajib", "Isi alasan atau permintaan user untuk extended rebid.");
    if (!file) return showPopup("File Wajib", "Pilih file backup permintaan user.");

    const button = byId("uploadExtendedRebidBtn");
    if (button) button.disabled = true;
    startProgress("Menyimpan Backup Rebid");
    try {
        const sourceRound = `R${requestedNumber - 1}`;
        const extension = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
        const fileName = cleanBackupFilePart(`Backup Permintaan Rebid ${requestedRound} - ${noPR} ${sourceRound} - ${description}`) + extension;
        const uploadResult = await saveExtendedRebidBackupToLocal(file, fileName, sourceRound);

        const requestResult = await postFolderAction({
            action: "SAVE_REBID_REQUEST",
            noPR,
            requestedRound,
            reason,
            fileId: uploadResult.fileId,
            fileUrl: uploadResult.fileUrl,
            fileName: uploadResult.fileName || fileName
        });

        extendedRebidRequest = {
            ...requestResult,
            found: true,
            noPR,
            requestedRound,
            sourceRound,
            reason,
            fileId: uploadResult.fileId,
            fileUrl: uploadResult.fileUrl,
            fileName: uploadResult.fileName || fileName
        };
        formChanged = true;
        updateExtendedRebidUI();
        finishProgress(
            `Permintaan ${requestedRound} disimpan lokal di ${uploadResult.folderPath}. Proses dapat dilanjutkan.`,
            "Backup Tersimpan"
        );
    } catch (error) {
        window.clearInterval(progressTimer);
        updateProgress(0);
        showPopup("Upload Gagal", error.message || String(error));
    } finally {
        if (button) button.disabled = false;
        if (byId("extendedRebidFile")) byId("extendedRebidFile").value = "";
    }
}

function startProgress(title) {
    showPopup(title || (procurementMode === "ADD" ? "Creating Procurement" : "Updating Procurement"), "");
    let progress = 0;
    updateProgress(progress);
    progressTimer = window.setInterval(() => {
        if (progress < 90) {
            progress = Math.min(90, progress + Math.floor(Math.random() * 8) + 3);
            updateProgress(progress);
        }
    }, 180);
}

function updateProgress(percent) {
    byId("progressBar").style.width = `${percent}%`;
    byId("progressPercent").textContent = `${percent}%`;
}

function finishProgress(message, title = "Success") {
    window.clearInterval(progressTimer);
    updateProgress(100);
    byId("popupTitle").textContent = title;
    byId("popupMessage").textContent = message;
}

async function saveProcurement(options = {}) {
    if (isSaving) return;
    isSaving = true;

    const submitButton = byId("submitBtn");
    const cancelButton = byId("cancelBtn");
    const saveFolderButton = byId("saveCreateFolderBtn");

    if (procurementMode === "ADD" && (!usdRateSnapshot.locked || !Number(usdRateSnapshot.rate))) {
        await ensureUsdRateSnapshot();
        recalculateEstimatedPriceIdr();
    }

    const data = collectFormData();

    if (!asText(data.noPR)) {
        isSaving = false;
        showPopup("No PR Wajib Diisi", "Isi No PR sebelum menyimpan data atau membuat folder.");
        return;
    }

    if (roundNumber(data.roundpo) >= 3) {
        const validBackup = extendedRebidRequest?.requestedRound === data.roundpo &&
            (extendedRebidRequest?.fileId || extendedRebidRequest?.fileName);
        if (!validBackup) {
            isSaving = false;
            updateExtendedRebidUI();
            showPopup("Backup Rebid Wajib", `Upload bukti permintaan user sebelum menyimpan ${data.roundpo}.`);
            return;
        }
    }

    startProgress();
    submitButton.disabled = true;
    cancelButton.disabled = true;
    if (saveFolderButton) saveFolderButton.disabled = true;

    try {
        formChanged = false;
        const createFolderAfterSave = Boolean(options.createFolderAfterSave);
        finishProgress(createFolderAfterSave
            ? "Data disimpan. Susunan folder sedang dibuat."
            : (procurementMode === "ADD" ? "Data berhasil ditambahkan." : "Data berhasil diperbarui."));
        window.setTimeout(() => notifyParentAndClose(data, { createFolderAfterSave }), 450);
    } catch (error) {
        console.error(error);
        window.clearInterval(progressTimer);
        hidePopup();
        showPopup("Gagal", error.message || "Gagal menyimpan data.");
        submitButton.disabled = false;
        cancelButton.disabled = false;
        if (saveFolderButton) saveFolderButton.disabled = false;
    } finally {
        isSaving = false;
        submitButton.disabled = false;
        cancelButton.disabled = false;
        if (saveFolderButton) saveFolderButton.disabled = false;
    }
}

function cancelForm() {
    if (formChanged && !window.confirm("Ada perubahan yang belum disimpan. Yakin ingin membatalkan?")) return;

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ action: "PROCUREMENT_CANCELLED", mode: procurementMode, originalPR }, "*");
    }

    try {
        if (window.parent && window.parent !== window && typeof window.parent.closeModal === "function") {
            window.parent.closeModal();
        }
    } catch (error) {
        console.warn("Modal tidak dapat ditutup langsung:", error);
    }
}

/* ==========================================
   INITIALIZATION
========================================== */

document.addEventListener("DOMContentLoaded", async () => {
    initFormattedDateInputs();
    initSearchableDatalists();
    bindFormattingEvents();
    initDraggableForm();
    resizeDescription();
    byId("Description")?.addEventListener("input", resizeDescription);

    roundPOInput.addEventListener("change", async () => {
        applyRound(roundPOInput.value);
        await loadExtendedRebidRequest(roundPOInput.value);
        formChanged = true;
        notifyWorkspaceContext();
    });

    winnerPOInput.addEventListener("change", () => {
        loadedRow.winnerpo = asText(winnerPOInput.value);
        loadedRow.emailwinnerpo = "";
        winnerEmailInput.value = "";
        updateWinnerEmail();
        formChanged = true;
    });

    const flowProcessInput = byId("flowprocess");
    const handleFlowProcessChange = () => {
        loadedRow.flowprocess = flowProcessInput?.value || "";
        applyWorkflowRules();
    };
    flowProcessInput?.addEventListener("input", handleFlowProcessChange);
    flowProcessInput?.addEventListener("change", handleFlowProcessChange);

    byId("cqsapprovaldate")?.addEventListener("change", () => {
        applyPOCreateDateVisibility();
        applyWorkflowRules();
    });
    byId("documentFolderType")?.addEventListener("change", updateFolderTargetUI);
    byId("documentRound")?.addEventListener("change", updateFolderTargetUI);
    byId("ensureFolderBtn")?.addEventListener("click", () => ensureFolderStructure());
    byId("openTargetFolderBtn")?.addEventListener("click", openSelectedFolder);
    byId("refreshFolderFilesBtn")?.addEventListener("click", loadSelectedFolderFiles);
    byId("uploadFilesBtn")?.addEventListener("click", () => byId("folderFileInput")?.click());
    byId("uploadDirectoryBtn")?.addEventListener("click", () => byId("folderDirectoryInput")?.click());
    byId("folderFileInput")?.addEventListener("change", event => uploadFilesToSelectedFolder(event.target.files));
    byId("folderDirectoryInput")?.addEventListener("change", event => uploadFilesToSelectedFolder(event.target.files));
    byId("saveCreateFolderBtn")?.addEventListener("click", () => saveProcurement({ createFolderAfterSave: true }));
    byId("uploadExtendedRebidBtn")?.addEventListener("click", uploadExtendedRebidBackup);
    byId("extendedRebidLink")?.addEventListener("click", openExtendedRebidLocalBackup);
    syncUsdRateBtn?.addEventListener("click", syncUsdRateForAdd);
    byId("cancelBtn")?.addEventListener("click", cancelForm);
    byId("popupOk")?.addEventListener("click", hidePopup);

    form.addEventListener("input", () => { formChanged = true; });
    form.addEventListener("change", () => { formChanged = true; });
    form.addEventListener("submit", event => {
        event.preventDefault();
        saveProcurement();
    });

    await initForm();
    notifyWorkspaceContext();
});
