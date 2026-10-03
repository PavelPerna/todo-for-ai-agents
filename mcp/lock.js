'use strict';
// Cross-process mutex for a .todo directory: an atomically created lock directory holding an owner
// record {pid, token}. A lock is reclaimed only when its owner process is gone, and released only by
// its owner, so a paused writer can neither lose its lock nor remove someone else's.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCK = '.lock';

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

function readOwner(lock) { try { return JSON.parse(fs.readFileSync(path.join(lock, 'owner'), 'utf8')); } catch (_) { return null; } }

/** Run fn while holding the directory lock; waits up to timeoutMs for another live owner. */
function withLock(dir, fn, timeoutMs = 3000) {
  const lock = path.join(dir, LOCK);
  const me = { pid: process.pid, token: crypto.randomBytes(8).toString('hex') };
  const start = Date.now();
  for (;;) {
    try { fs.mkdirSync(lock); fs.writeFileSync(path.join(lock, 'owner'), JSON.stringify(me)); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = readOwner(lock);
      if (owner && !alive(owner.pid)) { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (_) {} continue; } // dead owner: reclaim
      if (!owner && Date.now() - start > 500) { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (_) {} continue; } // mkdir succeeded but owner never written (crash in between)
      if (Date.now() - start > timeoutMs) throw new Error('.todo is locked by another writer');
      sleepSync(10);
    }
  }
  try { return fn(); }
  finally { const owner = readOwner(lock); if (owner && owner.token === me.token) { try { fs.rmSync(lock, { recursive: true, force: true }); } catch (_) {} } }
}

module.exports = { withLock, LOCK, alive };
