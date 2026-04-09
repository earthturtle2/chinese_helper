/** Whether parent accounts can log in (settings.parent_feature_enabled). */
function isParentFeatureEnabled(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'parent_feature_enabled'").get();
  if (row?.value == null || row.value === '') return false;
  const v = String(row.value).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

module.exports = { isParentFeatureEnabled };
