(function(){
  if (window.__MSW_DASHBOARD_PR_STATUS_V3518__) return;
  window.__MSW_DASHBOARD_PR_STATUS_V3518__ = true;

  function statusOf(row){
    return String((row && row.procurementtype) || '').trim().toUpperCase();
  }

  function canonicalRows(){
    return typeof uniqueBy === 'function' ? uniqueBy(dashboard.filteredRows || [], 'prno') : [];
  }

  function statusCounts(){
    const result = { BID:0, TDR:0, IOM:0, CTR:0, OTHER:0 };
    canonicalRows().forEach(function(row){
      const status = statusOf(row);
      if (status === 'BID' || status === 'TDR' || status === 'IOM' || status === 'CTR') result[status] += 1;
      else result.OTHER += 1;
    });
    return result;
  }

  calculateTotalPRByStatus = function(){
    return statusCounts();
  };

  calculateProcurementType = function(){
    const rows = canonicalRows();
    const counts = statusCounts();
    const totalPR = rows.length;
    const result = {};
    ['BID','TDR','IOM','CTR'].forEach(function(type){
      const statusRows = rows.filter(function(row){ return statusOf(row) === type; });
      const poRows = statusRows.filter(function(row){ return String(row.pono || '').trim() !== ''; });
      result[type.toLowerCase()] = {
        total: counts[type],
        poTotal: typeof uniqueBy === 'function' ? uniqueBy(poRows, 'pono').length : poRows.length,
        percent: totalPR ? (counts[type] / totalPR) * 100 : 0
      };
    });
    return result;
  };

  try { if (typeof filterDashboard === 'function') filterDashboard(); } catch (_) {}
})();
