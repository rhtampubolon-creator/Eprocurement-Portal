(function(){
  if (window.__MSW_DASHBOARD_PR_STATUS_V3520__) return;
  window.__MSW_DASHBOARD_PR_STATUS_V3520__ = true;

  const baseCalculateSummary = typeof calculateSummary === 'function' ? calculateSummary : null;

  function text(value){
    return String(value == null ? '' : value).trim();
  }

  function statusOf(row){
    return text(row && row.procurementtype).toUpperCase();
  }

  function normalizePrNo(value){
    return text(value).replace(/\s*\(.*?\)\s*$/, '').trim();
  }

  function unitStatus(row){
    return statusOf(row) || '__UNCLASSIFIED__';
  }

  function procurementUnits(){
    const units = new Map();
    const rows = Array.isArray(dashboard.filteredRows) ? dashboard.filteredRows : [];

    rows.forEach(function(row){
      const basePr = normalizePrNo(row && row.prno);
      if (!basePr) return;

      const status = unitStatus(row);
      const key = basePr + '||' + status;

      if (!units.has(key)) {
        units.set(key, {
          key: key,
          basePr: basePr,
          status: status,
          rows: []
        });
      }

      units.get(key).rows.push(row);
    });

    return Array.from(units.values());
  }

  function statusCounts(units){
    const result = { BID:0, TDR:0, IOM:0, CTR:0, OTHER:0 };
    (units || procurementUnits()).forEach(function(unit){
      if (unit.status === 'BID' || unit.status === 'TDR' || unit.status === 'IOM' || unit.status === 'CTR') {
        result[unit.status] += 1;
      } else {
        result.OTHER += 1;
      }
    });
    return result;
  }

  if (baseCalculateSummary) {
    calculateSummary = function(){
      const summary = baseCalculateSummary();
      summary.totalPR = procurementUnits().length;
      return summary;
    };
  }

  calculateTotalPRByStatus = function(){
    return statusCounts();
  };

  calculateProcurementType = function(){
    const units = procurementUnits();
    const counts = statusCounts(units);
    const totalPR = units.length;
    const result = {};

    ['BID','TDR','IOM','CTR'].forEach(function(type){
      const statusUnits = units.filter(function(unit){ return unit.status === type; });
      const poRows = [];

      statusUnits.forEach(function(unit){
        unit.rows.forEach(function(row){
          const po = text(row && row.pono);
          if (po && po !== '-') poRows.push(row);
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
    procurementUnits: procurementUnits,
    statusCounts: statusCounts
  });

  try { if (typeof filterDashboard === 'function') filterDashboard(); } catch (_) {}
})();
