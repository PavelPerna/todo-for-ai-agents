'use strict';
// Cross-process mutex for a .todo directory. The lock is a directory that always carries an owner
// record {pid, token}: it is built as a private staging directory and moved into place with one atomic
// rename, so there is never a lock without an owner. A lock is reclaimed only when its owner process is
// gone. Reclaiming renames the stale directory to a grave named after the dead owner's token; renaming
// onto an existing non-empty directory fails, so of two waiters that saw the same dead owner exactly one
// moves it and the other's rename fails harmlessly — it can never move a replacement lock, whose owner
// has a different token and therefore a different grave. Graves are swept once they are old enough
// that no waiter can still hold a stale read of them. The lock is released only by its owner (token).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCK = '.lock';
const GRAVE_TTL_MS = 60_000;

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function readOwner(lock) { try { return JSON.parse(fs.readFileSync(path.join(lock, 'owner'), 'utf8')); } catch (_) { return null; } }

function sweepGraves(dir) {
  let names = []; try { names = fs.readdirSync(dir); } catch (_) { return; }
  for (const n of names) {
    if (!n.startsWith(`${LOCK}.stale.`)) continue;
    const p = path.join(dir, n);
    try { if (Date.now() - fs.statSync(p).mtimeMs > GRAVE_TTL_MS) fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
  }
}

/** Move the stale lock of `owner` out of the way; a failure means another waiter already did. */
function reclaim(dir, lock, owner) {
  const grave = `${lock}.stale.${owner && owner.token ? owner.token : 'noowner'}`;
  try { fs.renameSync(lock, grave); } catch (_) { /* already reclaimed, or a live replacement stands there (different token → different grave, and rename onto our existing grave fails) */ }
  sweepGraves(dir);
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
      try { fs.renameSync(staging, lock); break; } // atomic: fails while another lock directory stands
      catch (e) {
        if (!['ENOTEMPTY', 'EEXIST', 'EPERM'].includes(e.code)) throw e;
        const owner = readOwner(lock);
        if (owner && !alive(owner.pid)) reclaim(dir, lock, owner);
        if (Date.now() - start > timeoutMs) throw new Error('.todo is locked by another writer');
        sleepSync(10);
      }
    }
  } catch (e) { try { fs.rmSync(staging, { recursive: true, force: true }); } catch (_) {} throw e; }
  try { return fn(); }
  finally { const owner = readOwner(lock); if (owner && owner.token === me.token) { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (_) {} } }
}

module.exports = { withLock, LOCK, alive };
