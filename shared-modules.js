/* ======================================================
   SHARED MODULE REGISTRY
   Satu sumber menu untuk Super Admin, Procurement Admin, dan Buyer.
   Modul Admin otomatis diwariskan kepada Super Admin.
====================================================== */
"use strict";

(function(){
  const registry = [
    {
      id: "procurementAdmin",
      navId: "workspaceProcurement",
      label: "Procurement",
      icon: "clipboard-list",
      url: "procurement-admin/index.html?v=20260818-allclear-cache-h1",
      roles: ["SUPER_ADMIN", "BUYER"]
    },
    {
      id: "vendorCompany",
      navId: "workspaceVendor",
      label: "Vendor Management",
      icon: "building-2",
      url: "vendor-company/index.html",
      roles: ["PROCUREMENT_ADMIN"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "vendorRequests",
      navId: "workspaceVendorRequests",
      label: "Vendor Requests",
      icon: "inbox",
      url: "vendor-requests/index.html",
      roles: ["PROCUREMENT_ADMIN"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "agreementDashboard",
      navId: "workspaceDashboard",
      label: "Agreement Dashboard",
      icon: "layout-dashboard",
      url: "agreement-dashboard/index.html",
      roles: ["CONTRACT"]
    },
    {
      id: "detailContract",
      navId: "workspaceContract",
      label: "Contract Management",
      icon: "file-text",
      url: "detail-contract/index.html",
      roles: ["SUPER_ADMIN", "CONTRACT"],
      viewOnlyRoles: ["BUYER"]
    },
    {
      id: "agreementTracker",
      navId: "workspaceAgreementTracker",
      label: "Agreement Tracker",
      icon: "clipboard-check",
      url: "agreement-tracker/index.html?v=20260813-page20-v131",
      roles: ["SUPER_ADMIN", "CONTRACT"]
    }
  ];

  registry.forEach(module => {
    if (module.roles.includes("PROCUREMENT_ADMIN") && !module.roles.includes("SUPER_ADMIN")) {
      module.roles.push("SUPER_ADMIN");
    }
  });

  window.MSW_SHARED = window.MSW_SHARED || {};
  window.MSW_SHARED.modules = registry;
  window.MSW_SHARED.procurement = Object.freeze({
    roundLabel: "Round PR",
    roundAliases: ["Round PR", "Round PO", "roundpr", "roundpo"],
    overdueDateLabel: "Actual PO Del. Date",
    overdueDateAliases: ["Actual PO Del. Date", "actualpodeldate", "Actual PO Delivery Date"],
    yearDateAliases: ["Assign Date", "Assign PR", "Assign PR Date", "assignprdate"]
  });
  window.MSW_SHARED.allowedModuleIds = function(role){
    const raw = String(role || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const normalized = raw === "ADMIN"
      ? "PROCUREMENT_ADMIN"
      : (raw === "SUPERADMIN"
        ? "SUPER_ADMIN"
        : (["CONTRACTADMIN", "CONTRACT_ADMIN", "CONTRACTMANAGEMENT", "CONTRACT_MANAGEMENT"].includes(raw) ? "CONTRACT" : raw));
    if (normalized === "SUPER_ADMIN") return registry.map(item => item.id);
    // Modul view-only tetap harus terlihat di Workspace. Permission mutasi
    // tetap ditolak oleh UI modul dan backend.
    return registry
      .filter(item => item.roles.includes(normalized) || (item.viewOnlyRoles || []).includes(normalized))
      .map(item => item.id);
  };
})();