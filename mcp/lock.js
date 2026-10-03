'use strict';
// Cross-process mutex for a .todo directory. The lock is a directory that always carries an owner
// record {pid, token}: it is built as a private temp directory and moved into place with one atomic
// rename, so there is never a lock without an owner. A lock is reclaimed only when its owner process is
// gone, and reclaiming is itself an atomic rename of the stale directory to a private name, so of two
// waiters that both see the same dead owner exactly one wins and the other simply retries. The lock is
// released only by the process whose token is in the owner record.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCK = '.lock';

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function readOwner(lock) { try { return JSON.parse(fs.readFileSync(path.join(lock, 'owner'), 'utf8')); } catch (_) { return null; } }

function reclaim(lock) {
  const grave = `${lock}.stale.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try { fs.renameSync(lock, grave); } catch (_) { return; } // someone else reclaimed it first
  try { fs.rmSync(grave, { recursive: true, force: true }); } catch (_) {}
}

/** Run fn while holding the directory lock; waits up to timeoutMs for a live owner. */
function withLock(dir, fn, timeoutMs = 3000) {
  const lock = path.join(dir, LOCK);
  const me = { pid: process.pid, token: crypto.randomBytes(8).toString('hex') };
  const staging = `${lock}.new.${me.pid}.${me.token}`;
  fs.mkdirSync(staging); fs.writeFileSync(path.join(staging, 'owner'), JSON.stringify(me));
  const start = Date.now();
  try {
    for (;;) {
      try { fs.renameSync(staging, lock); break; } // atomic: fails with ENOTEMPTY/EEXIST while another lock stands
      catch (e) {
        if (!['ENOTEMPTY', 'EEXIST', 'EPERM'].includes(e.code)) throw e;
        const owner = readOwner(lock);
        if (!owner || !alive(owner.pid)) { reclaim(lock); continue; } // no valid owner record or owner gone
        if (Date.now() - start > timeoutMs) throw new Error('.todo is locked by another writer');
        sleepSync(10);
      }
    }
  } catch (e) { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {} throw e; }
  try { return fn(); }
  finally { const owner = readOwner(lock); if (owner && owner.token === me.token) { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (_) {} } }
}

module.exports = { withLock, LOCK, alive };
