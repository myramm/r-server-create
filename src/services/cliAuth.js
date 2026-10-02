const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Active login sessions keyed by chatId
const activeCliSessions = new Map();

/**
 * Start Railway CLI Browserless Device Code Authentication
 * Generates user_code formatted as XXXX-XXXX and awaits browser sign-in
 */
function startCliLogin(chatId, onCodeReady, onAuthenticated, onError) {
  // Cancel any existing session for this user
  cancelCliLogin(chatId);

  const sessionDir = path.join(os.tmpdir(), `railway-auth-${chatId}-${Date.now()}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const child = spawn('/usr/local/bin/railway', ['login', '--browserless'], {
    env: {
      ...process.env,
      HOME: sessionDir,
      RAILWAY_CONFIG_DIR: sessionDir,
      NO_COLOR: '1'
    }
  });

  let userCode = null;
  let activateUrl = null;
  let buffer = '';

  const session = {
    child,
    sessionDir,
    userCode: null,
    activateUrl: null,
    completed: false
  };
  activeCliSessions.set(chatId, session);

  child.stdout.on('data', (chunk) => {
    const str = chunk.toString();
    buffer += str;

    if (!userCode) {
      const match = buffer.match(/user_code=([A-Z0-9-]+)/i);
      if (match) {
        userCode = match[1].trim();
        activateUrl = `https://railway.com/activate?user_code=${userCode}`;
        session.userCode = userCode;
        session.activateUrl = activateUrl;
        if (typeof onCodeReady === 'function') {
          onCodeReady({ userCode, activateUrl });
        }
      }
    }
  });

  child.on('close', (code) => {
    if (session.completed) return;
    session.completed = true;
    activeCliSessions.delete(chatId);

    if (code === 0) {
      // Read token from config.json
      try {
        const cfgPaths = [
          path.join(sessionDir, '.railway', 'config.json'),
          path.join(sessionDir, 'config.json')
        ];
        let token = null;
        for (const p of cfgPaths) {
          if (fs.existsSync(p)) {
            const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
            token = parsed.user?.accessToken || parsed.user?.token || null;
            if (token) break;
          }
        }
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}

        if (token) {
          if (typeof onAuthenticated === 'function') {
            onAuthenticated(token);
          }
        } else {
          if (typeof onError === 'function') {
            onError(new Error('Token tidak ditemukan di file konfigurasi Railway.'));
          }
        }
      } catch (err) {
        if (typeof onError === 'function') onError(err);
      }
    } else {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
      if (code !== null && code !== 0 && !session.completed) {
        if (typeof onError === 'function') {
          onError(new Error(`Proses login selesai dengan kode: ${code}`));
        }
      }
    }
  });

  child.on('error', (err) => {
    activeCliSessions.delete(chatId);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    if (typeof onError === 'function') onError(err);
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    if (activeCliSessions.has(chatId)) {
      cancelCliLogin(chatId);
      if (typeof onError === 'function') {
        onError(new Error('Waktu sesi login telah berakhir (5 menit). Silakan coba lagi.'));
      }
    }
  }, 300000);

  return session;
}

/**
 * Cancel an active CLI login session
 */
function cancelCliLogin(chatId) {
  if (activeCliSessions.has(chatId)) {
    const s = activeCliSessions.get(chatId);
    s.completed = true;
    try { s.child.kill('SIGTERM'); } catch (e) {}
    try { fs.rmSync(s.sessionDir, { recursive: true, force: true }); } catch (e) {}
    activeCliSessions.delete(chatId);
  }
}

/**
 * Get active session for a chatId
 */
function getActiveSession(chatId) {
  return activeCliSessions.get(chatId) || null;
}

module.exports = {
  startCliLogin,
  cancelCliLogin,
  getActiveSession,
};
