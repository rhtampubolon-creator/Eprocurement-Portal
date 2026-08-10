/* ======================================================
   JS Dashboard
====================================================== */

let buyerTargetChart = null;
let assignChart = null;

/* ======================================================
   CONFIG
====================================================== */

const dashboard = {
    rows: [],
    filteredRows: [],
    currentYear: "ALL",
    currentBuyer: "ALL"
};

/* ======================================================
   API
====================================================== */

const API_URL = String(window.APP_CONFIG?.GAS_URL || "").trim();


/* ======================================================
   INITIALIZE
====================================================== */

document.addEventListener("DOMContentLoaded", () => {

    initializeDashboard();

});

window.addEventListener("message", event => {
    if (event?.data?.action === "MSW_REFRESH_DASHBOARD") {
        loadDashboardData();
    }
});
window.addEventListener("online", () => loadDashboardData());
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadDashboardData();
});
setInterval(() => {
    if (document.visibilityState === "visible") loadDashboardData();
}, 2 * 60 * 1000);

/* ======================================================
   INITIALIZE DASHBOARD
====================================================== */

async function initializeDashboard(){

    updateLastSync();

    const btnDetail =
        document.getElementById("btnDetail");

    if(btnDetail){

        btnDetail.addEventListener("click", () => {

            window.location.href =
                "../procurement-admin/index.html";

        });

    }

    await loadDashboardData();

}

/* ======================================================
   LOAD DASHBOARD DATA
====================================================== */

async function readJsonResponse(response){

    const raw = await response.text();
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const looksLikeHtml = /^\s*<!doctype html|^\s*<html/i.test(raw);

    if (!response.ok) {
        throw new Error(`Google Apps Script HTTP ${response.status}. Periksa URL deployment /exec.`);
    }

    if (looksLikeHtml || (!contentType.includes("json") && raw.trim().startsWith("<"))) {
        throw new Error("Google Apps Script mengembalikan halaman HTML, bukan JSON. Deployment /exec tidak aktif atau URL-nya sudah tidak berlaku.");
    }

    try {
        return JSON.parse(raw);
    } catch (_) {
        throw new Error("Respons Google Apps Script bukan JSON yang valid.");
    }

}

function renderDashboardRows(rows, sourceLabel = "Google Sheet"){

    dashboard.rows = mapDashboardRows(Array.isArray(rows) ? rows : []);

    generateYearButtons();
    generateBuyerFilter();
    filterDashboard();

}

function loadDashboardCache(){

    const cachedRows = window.MSW?.cache?.load("MSW_PROCUREMENT_CACHE");

    if (!Array.isArray(cachedRows) || cachedRows.length === 0) return false;

    renderDashboardRows(cachedRows, "Cache");

    const sync = document.getElementById("lastSync");
    if (sync) sync.textContent = "Mode cache — Google Sheet tidak terhubung";

    return true;

}

async function loadDashboardData(){

    try{

        if (!API_URL) {
            throw new Error("GAS_URL belum diisi pada config.js.");
        }

        const response = await fetch(
            API_URL + "?sheet=Admin&_=" + Date.now(),
            { cache: "no-store" }
        );

        const json = await readJsonResponse(response);

        if (!Array.isArray(json.rows)) {
            throw new Error(json?.message || "Data Admin dari Google Sheet tidak valid.");
        }

        renderDashboardRows(json.rows, "Google Sheet");

    }

    catch(error){

        const cacheLoaded = loadDashboardCache();

        console.warn(
            cacheLoaded
                ? "Dashboard memakai cache karena Google Sheet tidak dapat diakses:"
                : "Dashboard Load Error:",
            error
        );

        if (!cacheLoaded) {
            const sync = document.getElementById("lastSync");
            if (sync) sync.textContent = "Google Sheet tidak terhubung";
        }

    }

}

/* ======================================================
   MAP DASHBOARD ROW
====================================================== */

function mapDashboardRows(rows){

    return rows.map(r => ({

        prno :
            r["No PR"] || r.noPR || "",

        description :
            r["Description"] || r.Description || "",

        procurementtype :
            r["Status PR"] || r.statuspr || "",

        assigndate :
            r["Assign Date"] ||
            r["Assign PR"] ||
            r["Assign PR Date"] ||
            r.assignprdate || "",

        cqsapproval :
            r["CQS Approval Date"] || r.cqsapprovaldate || "",

        pocreatedate :
            r["PO Create Date"] || r.pocreatedate || "",

        pono :
            r["No PO"] || r.nopo || "",

        estimateprice :
            r["Est. Price US - Rp"] || r.estpriceus || 0,

        poactualprice :
            r["Price (Rp) Excl. PPn"] || r.pricerp || 0,

        winner :
            r["Winner PO"] || r.winnerpo || "",

        flowprocess :
            r["Flow Process"] || r.flowprocess || "",

        buyer :
            r["Buyer"] || r.buyer || r["Owner Name"] || r.ownerName ||
            r["Owner Email"] || r.ownerEmail || "",

        buyeremail :
            r["Owner Email"] || r.ownerEmail || r["Created By"] || r.createdBy || "",

        department :
            r["Departement"] || r.departement || "",

        pic :
            r["PIC"] || r.pic || "",

        r0 :
            r["R0 Submit Company"] ||
            r["R0 Company"] ||
            r.r0submitcompany ||
            r.r0company ||
            "",

        r1 :
            r["R1 Submit Company"] ||
            r["R1 Company"] ||
            r.r1submitcompany ||
            r.r1company ||
            "",

        r2 :
            r["R2 Submit Company"] ||
            r["R2 Company"] ||
            r.r2submitcompany ||
            r.r2company ||
            "",

        r3 :
            r["R3 Submit Company"] ||
            r["R3 Company"] ||
            r.r3submitcompany ||
            r.r3company ||
            "",

        r4 :
            r["R4 Submit Company"] ||
            r["R4 Company"] ||
            r.r4submitcompany ||
            r.r4company ||
            "",

        r5 :
            r["R5 Submit Company"] ||
            r["R5 Company"] ||
            r.r5submitcompany ||
            r.r5company ||
            "",

        r0start :
            r["R0 Start Date"] || r.r0startdate || "",

        r1start :
            r["R1 Start Date"] || r.r1startdate || "",

        r2start :
            r["R2 Start Date"] || r.r2startdate || "",

        r3start :
            r["R3 Start Date"] || r.r3startdate || "",

        r4start :
            r["R4 Start Date"] || r.r4startdate || "",

        r5start :
            r["R5 Start Date"] || r.r5startdate || "",

    }));

}

/* ======================================================
   LAST SYNC
====================================================== */

function updateLastSync(){

    const el = document.getElementById("lastSync");

    if(!el) return;

    const now = new Date();

    el.textContent =
        now.toLocaleDateString("id-ID") +
        " " +
        now.toLocaleTimeString("id-ID");

}

/* ======================================================
   YEAR BUTTON
====================================================== */

function generateYearButtons(){

    const container =
        document.getElementById("yearButtons");

    if(!container) return;

    container.innerHTML = "";

    const assignYears = [
        ...new Set(
            dashboard.rows
                .map(row => getAssignYear(row.assigndate))
                .filter(Boolean)
        )
    ].sort((a, b) => Number(b) - Number(a));

    const years = [
        "ALL",
        ...assignYears
    ];

    if(
        dashboard.currentYear !== "ALL" &&
        !assignYears.includes(dashboard.currentYear)
    ){
        dashboard.currentYear = "ALL";
    }

    years.forEach(year=>{

        const btn = document.createElement("button");

        btn.className =
        "year-btn" +
        (dashboard.currentYear === year ? " active" : "");

        btn.textContent =
            year === "ALL"
            ? "All"
            : year;

        btn.onclick = ()=>{

            dashboard.currentYear = year;

            generateYearButtons();

            filterDashboard();

        };

        container.appendChild(btn);

    });

}

function normalizeBuyerFilterValue(value){
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function generateBuyerFilter(){
    const panel = document.getElementById("buyerFilterPanel");
    const select = document.getElementById("buyerFilter");
    if (!select) return;

    const role = window.MSW?.auth?.getRole?.() || "";
    if (panel) panel.hidden = role === "BUYER";

    const labels = new Map();
    dashboard.rows.forEach(row => {
        const label = String(row.buyer || row.buyeremail || "Unassigned").trim() || "Unassigned";
        const key = normalizeBuyerFilterValue(label);
        if (key && !labels.has(key)) labels.set(key, label);
    });

    if (dashboard.currentBuyer !== "ALL" && !labels.has(dashboard.currentBuyer)) {
        dashboard.currentBuyer = "ALL";
    }

    select.innerHTML = [
        '<option value="ALL">All Buyers</option>',
        ...[...labels.entries()]
            .sort((a,b) => a[1].localeCompare(b[1], "id"))
            .map(([key,label]) => `<option value="${String(key).replace(/"/g, "&quot;")}">${String(label).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</option>`)
    ].join("");
    select.value = dashboard.currentBuyer;
    select.onchange = () => {
        dashboard.currentBuyer = select.value || "ALL";
        filterDashboard();
    };
}

/* ======================================================
   FILTER DASHBOARD
====================================================== */

function filterDashboard(){

    getFilteredRows();

    const summary = calculateSummary();

    const procurement = calculateProcurementType();

    const estimateStatus =
    calculateEstimateByStatus();

    renderSummary(summary);


    renderProcurementType(procurement);

    renderPORelease(

        calculatePORelease()

    );

    renderRoundDistribution(

        calculateRoundDistribution()

    );

    renderBuyerTarget(
        calculateBuyerTarget()
    );

    renderMonthlyAssign(
        calculateMonthlyAssign()
    );

    renderTopVendor(
        "topBidVendor",
        "BID",
        calculateTopVendor("BID")
    );

    renderTopVendor(
        "topCtrVendor",
        "CTR",
        calculateTopVendor("CTR")
    );

    renderTopVendor(
        "topIomVendor",
        "IOM",
        calculateTopVendor("IOM")
    );

    renderTopVendor(
        "topTdrVendor",
        "TDR",
        calculateTopVendor("TDR")
    );

}

/* ======================================================
   HAS ROUND
====================================================== */

function hasRound(value){

    value = String(value || "")
        .trim()
        .toLowerCase();

    return ![
        "",
        "-",
        "null",
        "undefined",
        "n/a"
    ].includes(value);

}

/* ======================================================
   ROUND DISTRIBUTION
====================================================== */

function calculateRoundDistribution(){

    const rows = uniqueBy(

        dashboard.filteredRows,

        "prno"

    );

    const result = {

        R0:0,

        R1:0,

        R2:0,

        R3:0,

        R4:0,

        R5:0

    };

    rows.forEach(r=>{

        let lastRound = "R0";

        if(hasRound(r.r5start)){

            lastRound = "R5";

        }
        else if(hasRound(r.r4start)){

            lastRound = "R4";

        }
        else if(hasRound(r.r3start)){

            lastRound = "R3";

        }
        else if(hasRound(r.r2start)){

            lastRound = "R2";

        }
        else if(hasRound(r.r1start)){

            lastRound = "R1";

        }
        else{

            lastRound = "R0";

        }

        result[lastRound]++;

    });

    return{

        total : rows.length,

        rounds : result

    };

}

/* ======================================================
   TOP PROCUREMENT VALUE
====================================================== */

function calculateTopVendor(type){

    const rows = uniqueBy(

        dashboard.filteredRows.filter(r =>

            String(r.procurementtype || "")
                .trim()
                .toUpperCase() === type

        ),

        "prno"

    );

    const vendorMap = {};

    rows.forEach(r=>{

        const vendor = String(r.winner || "").trim();

        if(!vendor) return;

        if(!vendorMap[vendor]){

            vendorMap[vendor] = {

                vendor,

                total : 0,

                count : 0

            };

        }

        vendorMap[vendor].total +=
            parseNumberID(r.poactualprice) || 0;

        vendorMap[vendor].count++;

    });

    return Object.values(vendorMap)

        .sort((a,b)=>

            b.total - a.total

        )

        .slice(0,5);

}

/* ======================================================
   RENDER TOP VENDOR
====================================================== */

function renderTopVendor(id,title,data){

    const el = document.getElementById(id);

    if(!el) return;

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">

                ${title}

            </div>

            <div class="mt-3 space-y-2">

                ${data.map((v,i)=>`

                    <div class="flex justify-between">

                        <div>

                            ${i+1}. ${v.vendor}

                        </div>

                        <div class="font-semibold">

                            ${formatBio(v.total)}

                        </div>

                    </div>

                `).join("")}

            </div>

        </div>

    `;

}

/* ======================================================
   RENDER ROUND DISTRIBUTION
====================================================== */

function renderRoundDistribution(data){

    const el =

        document.getElementById(

            "roundDistribution"

        );

    if(!el) return;

    let html =

        '<div class="release-grid">';

    Object.entries(data.rounds)
    .filter(([round,total]) => total > 0)
    .forEach(([round,total])=>{

        const percent =
            data.total === 0
            ? 0
            : (total / data.total) * 100;

        html += `

            <div class="release-item">

                <div>

                    ${round}

                </div>

                <div class="release-number">

                    ${total}

                </div>

                <div class="release-percent">

                    ${percent.toFixed(2)}%

                </div>

            </div>

        `;

    });

    html += "</div>";

    el.innerHTML = html;

}

/* ======================================================
   FILTER DATA
====================================================== */

function getFilteredRows(){

    let rows = [...dashboard.rows];

    /* ---------------------------------------------
       Remove Cancel
    --------------------------------------------- */

    rows = rows.filter(r =>
        !isCancelledFlow(r.flowprocess)
    );

    /* ---------------------------------------------
       Filter Buyer (Super Admin / Admin)
    --------------------------------------------- */

    if(dashboard.currentBuyer !== "ALL"){
        rows = rows.filter(r =>
            normalizeBuyerFilterValue(r.buyer || r.buyeremail || "Unassigned") === dashboard.currentBuyer
        );
    }

    /* ---------------------------------------------
       Filter Assign Year
    --------------------------------------------- */

    if(dashboard.currentYear !== "ALL"){

        rows = rows.filter(r=>{

            const year =
                getAssignYear(r.assigndate);

            return year === dashboard.currentYear;

        });

    }

    dashboard.filteredRows = rows;

}

/* ======================================================
   ASSIGN YEAR
====================================================== */

function getDateYear(value){

    if(!value) return "";

    if(value instanceof Date && !isNaN(value)){
        return String(value.getFullYear());
    }

    const text = String(value).trim();

    // Format yang sudah memuat tahun 4 digit, mis. 03 Oct 2026 atau 03/10/2026.
    const fourDigit = text.match(/\b(20\d{2})\b/);
    if(fourDigit) return fourDigit[1];

    // Format dd mmm yy / dd-mmm-yy, mis. 03 Oct 26.
    const shortYear = text.match(/(?:^|[\s\-/])(\d{2})$/);
    if(shortYear) return "20" + shortYear[1];

    const parsed = new Date(text);
    return isNaN(parsed) ? "" : String(parsed.getFullYear());

}

function getAssignYear(assignDate){
    return getDateYear(assignDate);
}

function getPORecordYear(row){
    // Tahun PO diprioritaskan dari PO Create Date. Jika kosong, baca dari No PO.
    return getDateYear(row?.pocreatedate) || getPOYear(row?.pono);
}

function isCancelledFlow(value){
    return String(value || "")
        .trim()
        .toUpperCase() === "CANCEL";
}

function getFilteredPORows(){

    let rows = dashboard.rows.filter(r => {

        const poNumber = String(r.pono || "").trim();

        return (
            !isCancelledFlow(r.flowprocess) &&
            poNumber !== "" &&
            poNumber !== "-"
        );

    });

    if(dashboard.currentBuyer !== "ALL"){
        rows = rows.filter(r =>
            normalizeBuyerFilterValue(r.buyer || r.buyeremail || "Unassigned") === dashboard.currentBuyer
        );
    }

    if(dashboard.currentYear !== "ALL"){

        rows = rows.filter(r =>
            getPORecordYear(r) === dashboard.currentYear
        );

    }

    return rows;

}

/* ======================================================
   PO YEAR
====================================================== */

function getPOYear(pono){

    pono = String(pono || "")
        .trim()
        .toUpperCase();

    /* -----------------------------
       Format :
       PO24xxxxx
    ----------------------------- */

    let match = pono.match(/^PO(\d{2})/);

    if(match){

        return "20" + match[1];

    }

    /* -----------------------------
       Format :
       6100-PC0626xxxxx
    ----------------------------- */

    match = pono.match(/PC\d{2}(\d{2})/);

    if(match){

        return "20" + match[1];

    }

    return "";

}

/* ======================================================
   SUMMARY
====================================================== */

function calculateSummary(){

    const rows = dashboard.filteredRows;

    const uniquePR = uniqueBy(rows,"prno");

    // Total PO mengikuti tahun PO, bukan tahun Assign PR.
    // Ini juga menghitung carry-over: PR tahun sebelumnya yang PO-nya terbit
    // pada tahun yang sedang dipilih.
    const uniquePO = uniqueBy(
        getFilteredPORows(),
        "pono"
    );

    let estimatePrice = 0;

    let poActualPrice = 0;

    rows.forEach(r=>{

        estimatePrice +=
          parseNumberID(r.estimateprice) || 0;

        poActualPrice +=
            parseNumberID(r.poactualprice) || 0;

    });

    let comparison = 0;
    let comparisonLabel = "Saving";

    // Jika belum ada PO Actual Price, tampilkan Saving = 0%
    if (estimatePrice > 0 && poActualPrice > 0) {

        comparison =
            ((poActualPrice - estimatePrice) / estimatePrice) * 100;

        comparisonLabel =
            comparison <= 0
                ? "Saving"
                : "Over Budget";
    }

    return{

        totalPR: uniquePR.length,

        totalPO: uniquePO.length,

        estimatePrice,

        poActualPrice,

        comparison,

        comparisonLabel

    };

}

/* ======================================================
   RENDER SUMMARY
====================================================== */

function renderSummary(summary){

    renderStatusCountCard(
        "cardTotalPR",
        "Total PR",
        summary.totalPR,
        "Total PR by Status PR",
        calculateTotalPRByStatus()
    );

    renderStatusCountCard(
        "cardTotalPO",
        "Total PO",
        summary.totalPO,
        "Total PO by Status PR",
        calculateTotalPOByStatus()
    );

    renderEstimateCard(

        summary,

        calculateEstimateByStatus()

    );

    renderPOActualCard(

        summary,

        calculatePOActualByStatus()

    );

    setCardValue(
        "cardComparison",
        summary.comparisonLabel,
        (
            summary.comparison > 0
                ? "+"
                : ""
        ) +
        summary.comparison.toFixed(2) + "%"
    );

    if(
        window.lucide &&
        typeof window.lucide.createIcons === "function"
    ){
        window.lucide.createIcons();
    }

}

/* ======================================================
   PROCUREMENT TYPE
====================================================== */

function calculateProcurementType(){

    const rows = dashboard.filteredRows;

    const totalPR = uniqueBy(rows, "prno").length;

    const types = ["BID","TDR","IOM","CTR"];

    const result = {};

    types.forEach(type=>{

        const prList = uniqueBy(

            rows.filter(r=>

                String(r.procurementtype || "")
                    .trim()
                    .toUpperCase() === type

            ),

            "prno"

        );

        const poList = uniqueBy(

            rows.filter(r=>

                String(r.procurementtype || "")
                    .trim()
                    .toUpperCase() === type &&

                String(r.pono || "").trim() !== ""

            ),

            "pono"

        );

        result[type.toLowerCase()] = {

            total : prList.length,

            poTotal : poList.length,

            percent :

                totalPR === 0

                ? 0

                : (prList.length / totalPR) * 100

        };

    });

    return result;

}

function calculateTotalPRByStatus(){

    const result = {
        BID : 0,
        TDR : 0,
        IOM : 0,
        CTR : 0
    };

    Object.keys(result).forEach(status => {

        result[status] = uniqueBy(

            dashboard.filteredRows.filter(r =>

                String(r.procurementtype || "")
                    .trim()
                    .toUpperCase() === status

            ),

            "prno"

        ).length;

    });

    return result;

}

function calculateTotalPOByStatus(){

    const result = {
        BID : 0,
        TDR : 0,
        IOM : 0,
        CTR : 0
    };

    const rows = getFilteredPORows();

    Object.keys(result).forEach(status => {

        result[status] = uniqueBy(

            rows.filter(r =>

                String(r.procurementtype || "")
                    .trim()
                    .toUpperCase() === status

            ),

            "pono"

        ).length;

    });

    return result;

}

function calculateEstimateByStatus(){

    const result = {
        BID : 0,
        TDR : 0,
        CTR : 0,
        IOM : 0
    };

    dashboard.filteredRows.forEach(r=>{

        const status = String(r.procurementtype || "")
            .trim()
            .toUpperCase();

        if(result.hasOwnProperty(status)){

            result[status] +=
                parseNumberID(r.estimateprice) || 0;

        }

    });

    return result;

}

function calculatePOActualByStatus(){

    const result = {

        BID:0,

        TDR:0,

        CTR:0,

        IOM:0

    };

    dashboard.filteredRows.forEach(r=>{

        const status = String(r.procurementtype || "")
            .trim()
            .toUpperCase();

        if(result.hasOwnProperty(status)){

            result[status]+=

                parseNumberID(r.poactualprice) || 0;

        }

    });

    return result;

}

/* ======================================================
   RENDER PROCUREMENT TYPE
====================================================== */

function renderProcurementType(data){

    renderProcurementCard(
        "cardBid",
        "BID",
        data.bid
    );

    renderProcurementCard(
        "cardTdr",
        "TDR",
        data.tdr
    );

    renderProcurementCard(
        "cardIom",
        "IOM",
        data.iom
    );

    renderProcurementCard(
        "cardCtr",
        "CTR",
        data.ctr
    );

}

function renderEstimateDetail(data){

    const el =
        document.getElementById("estimateDetail");

    if(!el) return;

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">
                Estimate by Procurement
            </div>

            <div class="mt-3 space-y-2">

                <div class="flex justify-between">
                    <span>BID</span>
                    <b>${formatBio(data.BID)}</b>
                </div>

                <div class="flex justify-between">
                    <span>TDR</span>
                    <b>${formatBio(data.TDR)}</b>
                </div>

                <div class="flex justify-between">
                    <span>CTR</span>
                    <b>${formatBio(data.CTR)}</b>
                </div>

                <div class="flex justify-between">
                    <span>IOM</span>
                    <b>${formatBio(data.IOM)}</b>
                </div>

            </div>

        </div>

    `;

}

/* ======================================================
   PO RELEASE
====================================================== */

function calculatePORelease(){

    const rows = dashboard.filteredRows;

    const uniquePR = uniqueBy(

        rows,

        "prno"

    );

    let released = 0;

    let outstanding = 0;

    const carry = {};

    uniquePR.forEach(pr=>{

        const assignYear =
            getAssignYear(pr.assigndate);

        const po =
            String(pr.pono || "").trim();

        if(!po || po === "-"){

            outstanding++;

            return;

        }

        released++;

        const poYear = getPOYear(po);

        if(poYear && poYear !== assignYear){

            const key =
                assignYear +
                " ➜ " +
                poYear;

            carry[key] =
                (carry[key] || 0) + 1;

        }

    });

    return{

        total :
            uniquePR.length,

        released,

        outstanding,

        carry

    };

}

/* ======================================================
   RENDER PO RELEASE
====================================================== */

function renderPORelease(data){

    const el=document.getElementById("poRelease");

    if(!el) return;

    let carry="";

    Object.entries(data.carry).forEach(([year,total])=>{

        carry += `

            <div>

                <strong>${year}</strong>

                : ${total} PR

            </div>

        `;

    });

    el.innerHTML=`

        <div class="release-grid">

            <div class="release-item">

                <div>Released PO</div>

                <div class="release-number">

                    ${data.released}

                </div>

                <div class="release-percent">

                    ${((data.released/data.total)*100).toFixed(2)}%

                </div>

            </div>

            <div class="release-item">

                <div>Outstanding</div>

                <div class="release-number">

                    ${data.outstanding}

                </div>

                <div class="release-percent">

                    ${((data.outstanding/data.total)*100).toFixed(2)}%

                </div>

            </div>

        </div>

        <div class="release-carry">

            <h4>Carry Over PO</h4>

            ${carry || "Tidak ada"}

        </div>

    `;

}

/* ======================================================
   PROCUREMENT CARD
====================================================== */

function renderProcurementCard(id,title,data){

    const el = document.getElementById(id);

    if(!el) return;

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">

                ${title}

            </div>

            <div style="
                display:grid;
                grid-template-columns:1fr 1fr;
                align-items:center;
                margin-top:8px;
            ">

                <div style="text-align:center;">

                    <div class="summary-value">
                        ${data.total}
                    </div>

                    <div class="summary-sub">
                        Total PR
                    </div>

                </div>

                <div style="
                    text-align:center;
                    border-left:1px solid rgba(148,163,184,.45);
                ">

                    <div class="summary-value">
                        ${data.poTotal}
                    </div>

                    <div class="summary-sub">
                        PO Aktual
                    </div>

                </div>

            </div>

            <div class="summary-sub">

                ${data.percent.toFixed(2)}%

            </div>

        </div>

    `;

}

/* ======================================================
   CARD
====================================================== */

function setCardValue(id,title,value){

    const el = document.getElementById(id);

    if(!el) return;

    const isCompare =
        id === "cardComparison";

    let valueClass = "summary-value";

    if(isCompare){

        valueClass +=

            title === "Saving"

            ? " text-green-600"

            : " text-red-600";

    }

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">

                ${title}

            </div>

            <div class="${valueClass}">

                ${value}

            </div>

        </div>

    `;

}

function renderStatusCountCard(
    id,
    title,
    total,
    tooltipTitle,
    data
){

    const el = document.getElementById(id);

    if(!el) return;

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">
                ${title}
            </div>

            <div class="summary-value">
                ${total}
            </div>

            <div class="info-tooltip">
                <i data-lucide="circle-help"></i>
            </div>

            <div class="tooltip-box">

                <div class="tooltip-title">
                    ${tooltipTitle}
                </div>

                <div class="tooltip-row">
                    <span>BID</span>
                    <span>${data.BID}</span>
                </div>

                <div class="tooltip-row">
                    <span>TDR</span>
                    <span>${data.TDR}</span>
                </div>

                <div class="tooltip-row">
                    <span>IOM</span>
                    <span>${data.IOM}</span>
                </div>

                <div class="tooltip-row">
                    <span>CTR</span>
                    <span>${data.CTR}</span>
                </div>

            </div>

        </div>

    `;

}

/* ======================================================
   ESTIMATE CARD
====================================================== */

function renderEstimateCard(summary,data){

    const el = document.getElementById("cardEstimate");

    if(!el) return;

    el.innerHTML = `

        <div class="summary-card">

            <div class="summary-title">
                Estimate Price
            </div>

            <div class="summary-value">
                ${formatBio(summary.estimatePrice)}
            </div>

            <div class="info-tooltip">
                <i data-lucide="circle-help"></i>
            </div>

            <div class="tooltip-box">

                <div class="tooltip-title">
                    Estimate by Procurement
                </div>

                <div class="tooltip-row">
                    <span>BID</span>
                    <span>${formatBio(data.BID)}</span>
                </div>

                <div class="tooltip-row">
                    <span>TDR</span>
                    <span>${formatBio(data.TDR)}</span>
                </div>

                <div class="tooltip-row">
                    <span>IOM</span>
                    <span>${formatBio(data.IOM)}</span>
                </div>

                <div class="tooltip-row">
                    <span>CTR</span>
                    <span>${formatBio(data.CTR)}</span>
                </div>

            </div>

        </div>

    `;

}

/* ======================================================
   TO NUMBER
====================================================== */

function renderPOActualCard(summary,data){

    const el=document.getElementById("cardPOPrice");

    if(!el) return;

    el.innerHTML=`

        <div class="summary-card">

            <div class="summary-title">
                PO Actual Price
            </div>

            <div class="summary-value">
                ${formatBio(summary.poActualPrice)}
            </div>

            <div class="info-tooltip">
                <i data-lucide="circle-help"></i>
            </div>

            <div class="tooltip-box">

                <div class="tooltip-title">

                    PO Actual by Procurement

                </div>

                <div class="tooltip-row">

                    <span>BID</span>

                    <span>${formatBio(data.BID)}</span>

                </div>

                <div class="tooltip-row">

                    <span>TDR</span>

                    <span>${formatBio(data.TDR)}</span>

                </div>

                <div class="tooltip-row">

                    <span>CTR</span>

                    <span>${formatBio(data.CTR)}</span>

                </div>

                <div class="tooltip-row">

                    <span>IOM</span>

                    <span>${formatBio(data.IOM)}</span>

                </div>

            </div>

        </div>

    `;

}

function parseNumberID(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return value;

  let s = String(value).trim();
  if (s === "" || s === "-") return NaN;

  s = s.replace(/\s/g, "").replace(/[^\d.,-]/g, "");

  if (s === "" || s === "-") return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {

    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {

      s = s.replace(/\./g, "").replace(",", ".");

    } else {

      s = s.replace(/,/g, "");

    }

  } else if (hasComma) {

    const parts = s.split(",");

    if (parts.length > 2) {

      s = parts.join("");

    } else {

      s = parts[0] + "." + parts[1];

    }

  } else if (hasDot) {

    const parts = s.split(".");

    if (parts.length > 2) {

      const last = parts[parts.length - 1];

      s =
        last.length === 3
          ? parts.join("")
          : parts.slice(0,-1).join("") + "." + last;

    } else {

      s =
        (parts[1].length === 3 &&
        parts[0].length <=3)

        ? parts.join("")

        : s;

    }

  }

  const n = Number(s);

  return Number.isFinite(n) ? n : NaN;

}


/* ======================================================
   FORMAT BIO
====================================================== */

function formatBio(value){

    value = parseNumberID(value) || 0;

    return "Rp " +

        (value / 1000000)

        .toLocaleString("id-ID",{

            minimumFractionDigits:0,

            maximumFractionDigits:0

        })

        + " Mio";

}

/* ======================================================
   UNIQUE
====================================================== */

function uniqueBy(rows,key){

    return [

        ...new Map(

            rows
                .filter(r => r[key])
                .map(r => {

                    let value = String(r[key]).trim();

                    // khusus PR No, buang "(...)"
                    if(key === "prno"){

                        value = value.replace(/\s*\(.*?\)\s*$/, "");

                    }

                    return [value, r];

                })

        ).values()

    ];

}

/* ======================================================
   DATE HELPER
====================================================== */

function diffDays(start,end){

    if(!start || !end) return null;

    const s = new Date(start);

    const e = new Date(end);

    if(isNaN(s) || isNaN(e)) return null;

    return Math.round(

        (e-s)/(1000*60*60*24)

    );

}

/* ======================================================
   UNIQUE PR
====================================================== */

function getUniquePRRows(){

    return uniqueBy(

        dashboard.filteredRows,

        "prno"

    );

}

/* ======================================================
   LAST CQS
====================================================== */

function getLastCQSApproval(row){

    return (

        row.r5approval ||

        row.r4approval ||

        row.r3approval ||

        row.r2approval ||

        row.r1approval ||

        row.r0approval ||

        null

    );

}

/* ======================================================
   Buyer Target
====================================================== */

function calculateBuyerTarget(){

    const rows = getUniquePRRows();

    const result = {};

    rows.forEach(row=>{

        // wajib ada semua tanggal
        if(
            !row.assigndate ||
            !row.r0start ||
            !row.cqsapproval ||
            !row.pocreatedate
        ){
            return;
        }

        const assignDate = new Date(row.assigndate);
        const r0Start = new Date(row.r0start);
        const cqsApproval = new Date(row.cqsapproval);
        const poCreate = new Date(row.pocreatedate);

        if(
            isNaN(assignDate) ||
            isNaN(r0Start) ||
            isNaN(cqsApproval) ||
            isNaN(poCreate)
        ){
            return;
        }
        
        // Total Procurement Time
        const procurementDays =
            Math.round(
                (poCreate - assignDate) /
                (1000 * 60 * 60 * 24)
            );

        // CQS Processing Time
        const cqsDays =
            Math.round(
                (cqsApproval - r0Start) /
                (1000 * 60 * 60 * 24)
            );

        // Buyer Lead Time
        const buyerDays =
            procurementDays - cqsDays;

        const month =
            assignDate.toLocaleString("en",{
                month:"short"
            });

        if(!result[month]){

            result[month]={

                total:0,

                count:0

            };

        }

        result[month].total += buyerDays;

        result[month].count++;

    });

    return Object.entries(result).map(([month,v])=>({

        month,

        actual:
            Number(
                (v.total / v.count).toFixed(1)
            ),

        target:30

    }));

}

function renderBuyerTarget(data){

    const canvas =
        document.getElementById("buyerTargetChart");

    if(!canvas) return;

    if(buyerTargetChart){

        buyerTargetChart.destroy();

    }

    const monthOrder = [
        "Jan","Feb","Mar","Apr","May","Jun",
        "Jul","Aug","Sep","Oct","Nov","Dec"
    ];

    data.sort(
        (a,b)=>
        monthOrder.indexOf(a.month)-
        monthOrder.indexOf(b.month)
    );

    buyerTargetChart =
        new Chart(canvas,{

        type:"line",

        data:{

            labels:
                data.map(x=>x.month),

            datasets:[

                {
                    label:"Actual",

                    data:
                        data.map(x=>x.actual),

                    borderWidth:3,

                    tension:0.3

                },

                {
                    label:"Target",

                    data:
                        data.map(x=>x.target),

                    borderWidth:2,

                    borderDash:[6,4]

                }

            ]

        },

        options:{

            responsive:true,

            plugins:{

                legend:{
                    position:"top"
                }

            },

            scales:{

                y:{
                    beginAtZero:true,
                    title:{
                        display:true,
                        text:"Days"
                    }
                }

            }

        }

    });

}

/* ======================================================
   Assign PR
====================================================== */

function calculateMonthlyAssign(){

    const result = {};

    dashboard.filteredRows.forEach(r=>{

        if(!r.assigndate) return;

        const d = new Date(r.assigndate);

        if(isNaN(d)) return;

        const key = d.toLocaleString("en",{

            month:"short"

        });

        if(!result[key]){

            result[key]=0;

        }

        result[key]++;

    });

    return result;

}

function renderMonthlyAssign(data){

    const canvas =
        document.getElementById("assignChart");

    if(!canvas) return;

    if(assignChart){

        assignChart.destroy();

    }

    const monthOrder = [
        "Jan","Feb","Mar","Apr","May","Jun",
        "Jul","Aug","Sep","Oct","Nov","Dec"
    ];

    const labels =
        Object.keys(data)
        .sort(
            (a,b)=>
            monthOrder.indexOf(a)-
            monthOrder.indexOf(b)
        );

    assignChart =
        new Chart(canvas,{

            type:"bar",

            data:{

                labels,

                datasets:[{

                    label:"Assign PR",

                    data:
                        labels.map(
                            m=>data[m]
                        )

                }]

            },

            options:{

                responsive:true,

                plugins:{

                    legend:{
                        display:false
                    }

                },

                scales:{

                    y:{
                        beginAtZero:true
                    }

                }

            }

        });

}
