const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Active login sessions keyed by chatId
const activeCliSessions = new Map();

/**
 * Locate the Railway CLI binary across multiple possible locations
 */
function findRailwayBin() {
  if (process.env.RAILWAY_CLI_PATH && fs.existsSync(process.env.RAILWAY_CLI_PATH)) {
    return process.env.RAILWAY_CLI_PATH;
  }
  const isWindows = process.platform === 'win32';
  const binName = isWindows ? 'railway.cmd' : 'railway';

  const candidatePaths = [
    path.resolve(__dirname, '../../node_modules/.bin', binName),
    path.resolve(process.cwd(), 'node_modules/.bin', binName),
    '/usr/local/bin/railway',
    '/usr/bin/railway',
    '/bin/railway',
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return binName;
}

/**
 * Start Railway CLI Browserless Device Code Authentication
 * Generates user_code formatted as XXXX-XXXX and awaits browser sign-in
 */
function startCliLogin(chatId, onCodeReady, onAuthenticated, onError) {
  // Cancel any existing session for this user
  cancelCliLogin(chatId);

  const sessionDir = path.join(os.tmpdir(), `railway-auth-${chatId}-${Date.now()}`);
  try {
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return null;
  }

  const railwayBin = findRailwayBin();

  let child;
  try {
    child = spawn(railwayBin, ['login', '--browserless'], {
      env: {
        ...process.env,
        HOME: sessionDir,
        USERPROFILE: sessionDir,
        RAILWAY_CONFIG_DIR: sessionDir,
        NO_COLOR: '1'
      }
    });
  } catch (err) {
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    if (typeof onError === 'function') {
      onError(new Error(`Gagal menjalankan Railway CLI (${railwayBin}): ${err.message}`));
    }
    return null;
  }

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
      // Support various output patterns from different Railway CLI versions
      const match =
        buffer.match(/user_code=([A-Z0-9-]+)/i) ||
        buffer.match(/https:\/\/(?:railway\.com|railway\.app)\/activate\?user_code=([A-Z0-9-]+)/i) ||
        buffer.match(/enter this code:\s*([A-Z0-9-]+)/i) ||
        buffer.match(/code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i);

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

  child.stderr.on('data', (chunk) => {
    buffer += chunk.toString();
  });

  child.on('close', (code) => {
    if (session.completed) return;
    session.completed = true;
    activeCliSessions.delete(chatId);

    if (code === 0) {
      // Read token from config.json in temporary HOME directory
      try {
        const cfgPaths = [
          path.join(sessionDir, '.railway', 'config.json'),
          path.join(sessionDir, 'config.json'),
          path.join(sessionDir, '.config', 'railway', 'config.json'),
          path.join(sessionDir, 'AppData', 'Roaming', 'railway', 'config.json'),
          path.join(os.homedir(), '.railway', 'config.json')
        ];
        let token = null;
        for (const p of cfgPaths) {
          if (fs.existsSync(p)) {
            const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
            token = parsed.user?.accessToken || parsed.user?.token || parsed.accessToken || parsed.token || null;
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
            onError(new Error('Token otentikasi tidak ditemukan di konfigurasi Railway.'));
          }
        }
      } catch (err) {
        if (typeof onError === 'function') onError(err);
      }
    } else {
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
      if (code !== null && code !== 0 && !session.completed) {
        if (typeof onError === 'function') {
          onError(new Error(`Proses login CLI selesai dengan kode: ${code}`));
        }
      }
    }
  });

  child.on('error', (err) => {
    activeCliSessions.delete(chatId);
    try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
    if (typeof onError === 'function') {
      if (err.code === 'ENOENT') {
        onError(new Error(`Railway CLI tidak ditemukan (${railwayBin}). Pastikan '@railway/cli' terinstal via 'npm install' atau gunakan opsi 'Input Token Manual'.`));
      } else {
        onError(err);
      }
    }
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
  findRailwayBin,
  startCliLogin,
  cancelCliLogin,
  getActiveSession,
};
