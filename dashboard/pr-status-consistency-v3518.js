(function(){
  if (window.__MSW_DASHBOARD_PR_STATUS_V3519__) return;
  window.__MSW_DASHBOARD_PR_STATUS_V3519__ = true;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function statusOf(row){
    return text(row && row.procurementtype).toUpperCase();
  }

  function normalizePrNo(value){
    return text(value).replace(/\s*\(.*?\)\s*$/, '').trim();
  }

  function isBasePrRow(row){
    const raw = text(row && row.prno);
    return Boolean(raw) && raw === normalizePrNo(raw);
  }

  function canonicalGroups(){
    const groups = new Map();
    const rows = Array.isArray(dashboard.filteredRows) ? dashboard.filteredRows : [];

    rows.forEach(function(row){
      const key = normalizePrNo(row && row.prno);
      if (!key) return;

      if (!groups.has(key)) {
        groups.set(key, {
          key: key,
          statusRow: row,
          hasBaseRow: isBasePrRow(row),
          rows: [row]
        });
        return;
      }

      const group = groups.get(key);
      group.rows.push(row);

      // Baris PR utama tanpa suffix "(Line x)" adalah sumber Status PR.
      // Baris Line tidak boleh mengambil alih kategori PR utama.
      if (!group.hasBaseRow && isBasePrRow(row)) {
        group.statusRow = row;
        group.hasBaseRow = true;
      }
    });

    return Array.from(groups.values());
  }

  function canonicalRows(){
    return canonicalGroups().map(function(group){ return group.statusRow; });
  }

  function statusCounts(groups){
    const result = { BID:0, TDR:0, IOM:0, CTR:0, OTHER:0 };
    (groups || canonicalGroups()).forEach(function(group){
      const status = statusOf(group.statusRow);
      if (status === 'BID' || status === 'TDR' || status === 'IOM' || status === 'CTR') result[status] += 1;
      else result.OTHER += 1;
    });
    return result;
  }

  calculateTotalPRByStatus = function(){
    return statusCounts();
  };

  calculateProcurementType = function(){
    const groups = canonicalGroups();
    const counts = statusCounts(groups);
    const totalPR = groups.length;
    const result = {};

    ['BID','TDR','IOM','CTR'].forEach(function(type){
      const statusGroups = groups.filter(function(group){
        return statusOf(group.statusRow) === type;
      });

      // Status berasal dari PR utama, tetapi PO tetap boleh ditemukan pada
      // baris Line dalam grup PR yang sama agar PO aktual tidak hilang.
      const poRows = [];
      statusGroups.forEach(function(group){
        group.rows.forEach(function(row){
          if (text(row && row.pono)) poRows.push(row);
        });
      });

      result[type.toLowerCase()] = {
        total: counts[type],
        poTotal: typeof uniqueBy === 'function' ? uniqueBy(poRows, 'pono').length : poRows.length,
        percent: totalPR ? (counts[type] / totalPR) * 100 : 0
      };
    });

    return result;
  };

  window.MSW_DASHBOARD_PR_STATUS = Object.freeze({
    normalizePrNo: normalizePrNo,
    canonicalRows: canonicalRows,
    canonicalGroups: canonicalGroups
  });

  try { if (typeof filterDashboard === 'function') filterDashboard(); } catch (_) {}
})();
