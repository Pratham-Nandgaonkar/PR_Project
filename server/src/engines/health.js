function classifyHealth(pr, actionItems, cyclesCount, businessHoursConfig) {
  if (pr.is_draft) {
    return 'on_track'; // Drafts are ignored for health scoring
  }

  const maxBizWait = actionItems.length > 0 
    ? Math.max(...actionItems.map(a => a.waiting_biz_hours || 0)) 
    : 0;

  const totalAgeBizHours = pr.business_hours_age || 0;

  // CRITICAL thresholds
  if (maxBizWait > 48 || cyclesCount > 5 || totalAgeBizHours > 160) {
    return 'critical';
  }

  // AT RISK thresholds
  if (maxBizWait > 24 || cyclesCount >= 4 || pr.unresolved_comments_count > 5) {
    return 'at_risk';
  }

  // NEEDS ATTENTION thresholds
  if (maxBizWait > 8 || cyclesCount >= 3) {
    return 'needs_attention';
  }

  // DEFAULT
  return 'on_track';
}

module.exports = { classifyHealth };
