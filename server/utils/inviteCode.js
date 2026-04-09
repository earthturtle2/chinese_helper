const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSegment(len) {
  let s = '';
  for (let i = 0; i < len; i += 1) {
    s += CHARS[crypto.randomInt(0, CHARS.length)];
  }
  return s;
}

/** Human-readable code like XXXX-XXXX-XXXX (no ambiguous 0/O). */
function generatePlainInviteCode() {
  return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

function normalizeInviteCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function inviteLookupKey(normalizedCode) {
  return crypto.createHash('sha256').update(normalizedCode, 'utf8').digest('hex');
}

function hashInviteCodeForStorage(normalizedCode) {
  return bcrypt.hashSync(normalizedCode, 10);
}

function verifyInviteCode(normalizedCode, codeHash) {
  return bcrypt.compareSync(normalizedCode, codeHash);
}

module.exports = {
  generatePlainInviteCode,
  normalizeInviteCode,
  inviteLookupKey,
  hashInviteCodeForStorage,
  verifyInviteCode,
};
