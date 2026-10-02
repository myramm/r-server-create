const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bot.sqlite');
const db = new Database(DB_PATH);

// Enable WAL mode for high performance & reliability
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    railway_token TEXT,
    railway_user_name TEXT,
    railway_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    project_id TEXT NOT NULL,
    project_name TEXT,
    os_name TEXT,
    node_version TEXT,
    ai_agents TEXT,
    extra_tools TEXT,
    ssh_host TEXT,
    ssh_port TEXT,
    root_password TEXT,
    web_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    chat_id INTEGER PRIMARY KEY,
    step TEXT DEFAULT 'IDLE',
    os TEXT DEFAULT 'debian:12',
    os_name TEXT DEFAULT 'Debian 12 (Bookworm)',
    node_version TEXT DEFAULT '20',
    ai_agents TEXT,
    extra_tools TEXT,
    password TEXT,
    vps_name TEXT DEFAULT 'r-server',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * Get User from DB
 */
function getUser(chatId) {
  const stmt = db.prepare('SELECT * FROM users WHERE chat_id = ?');
  return stmt.get(Number(chatId));
}

/**
 * Save / Update User & Token permanently
 */
function saveUser(chatId, data = {}) {
  const existing = getUser(chatId);
  if (existing) {
    const stmt = db.prepare(`
      UPDATE users SET
        username = COALESCE(?, username),
        first_name = COALESCE(?, first_name),
        railway_token = COALESCE(?, railway_token),
        railway_user_name = COALESCE(?, railway_user_name),
        railway_email = COALESCE(?, railway_email),
        updated_at = CURRENT_TIMESTAMP
      WHERE chat_id = ?
    `);
    stmt.run(
      data.username || null,
      data.first_name || null,
      data.railway_token || null,
      data.railway_user_name || null,
      data.railway_email || null,
      Number(chatId)
    );
  } else {
    const stmt = db.prepare(`
      INSERT INTO users (chat_id, username, first_name, railway_token, railway_user_name, railway_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      Number(chatId),
      data.username || null,
      data.first_name || null,
      data.railway_token || null,
      data.railway_user_name || null,
      data.railway_email || null
    );
  }
  return getUser(chatId);
}

/**
 * Read active token from ~/.railway/config.json if available on server
 */
const fs = require('fs');
const os = require('os');

function getSystemRailwayToken() {
  try {
    const configPath = path.join(os.homedir(), '.railway', 'config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return parsed.user?.accessToken || parsed.user?.token || null;
    }
  } catch (e) {}
  return null;
}

/**
 * Get Saved Railway Token for a User
 */
function getRailwayToken(chatId) {
  const user = getUser(chatId);
  return user?.railway_token || getSystemRailwayToken() || null;
}

/**
 * Save Deployment Record
 */
function recordDeployment(chatId, depData) {
  const stmt = db.prepare(`
    INSERT INTO deployments (
      chat_id, project_id, project_name, os_name, node_version,
      ai_agents, extra_tools, ssh_host, ssh_port, root_password, web_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    Number(chatId),
    depData.projectId,
    depData.projectName || 'r-server',
    depData.osName || 'Debian 12',
    depData.nodeVersion || '20',
    typeof depData.aiAgents === 'object' ? JSON.stringify(depData.aiAgents) : (depData.aiAgents || ''),
    typeof depData.extraTools === 'object' ? JSON.stringify(depData.extraTools) : (depData.extraTools || ''),
    depData.sshHost || '',
    String(depData.sshPort || ''),
    depData.password || '',
    depData.webUrl || ''
  );
}

/**
 * Get All Deployments for a User
 */
function getUserDeployments(chatId) {
  const stmt = db.prepare('SELECT * FROM deployments WHERE chat_id = ? ORDER BY created_at DESC');
  return stmt.all(Number(chatId));
}

/**
 * Get Current Wizard State from DB
 */
function getSession(chatId) {
  const user = getUser(chatId);
  const stmt = db.prepare('SELECT * FROM sessions WHERE chat_id = ?');
  let sess = stmt.get(Number(chatId));

  if (!sess) {
    const defaultAi = { claude: true, agy: true, aider: false };
    const defaultTools = { xrdp: true, chrome: true, ffmpeg: true, ytdlp: true, fastfetch: true, nginx: false, redis: false, python_dev: true };
    const ins = db.prepare(`
      INSERT INTO sessions (chat_id, step, os, os_name, node_version, ai_agents, extra_tools, vps_name)
      VALUES (?, 'IDLE', 'debian:12', 'Debian 12 (Bookworm)', '20', ?, ?, 'r-server')
    `);
    ins.run(Number(chatId), JSON.stringify(defaultAi), JSON.stringify(defaultTools));
    sess = stmt.get(Number(chatId));
  }

  let aiAgents = { claude: true, agy: true, aider: false };
  let extraTools = { xrdp: true, chrome: true, ffmpeg: true, ytdlp: true, fastfetch: true, nginx: false, redis: false, python_dev: true };
  try { if (sess.ai_agents) aiAgents = JSON.parse(sess.ai_agents); } catch (e) {}
  try { if (sess.extra_tools) extraTools = JSON.parse(sess.extra_tools); } catch (e) {}

  const sysToken = getSystemRailwayToken();
  const effectiveToken = user?.railway_token || sysToken || process.env.DEFAULT_RAILWAY_TOKEN || null;

  return {
    step: sess.step || 'IDLE',
    data: {
      railwayToken: effectiveToken,
      railwayUser: user ? { name: user.railway_user_name, email: user.railway_email } : { name: 'Railway Account (Saved)', email: 'API Token Active' },
      os: sess.os || 'debian:12',
      osName: sess.os_name || 'Debian 12 (Bookworm)',
      nodeVersion: sess.node_version || '20',
      aiAgents,
      extraTools,
      password: sess.password || null,
      vpsName: sess.vps_name || 'r-server',
    }
  };
}

/**
 * Update Current Wizard State in DB
 */
function saveSession(chatId, session) {
  const data = session.data || {};
  const stmt = db.prepare(`
    INSERT INTO sessions (chat_id, step, os, os_name, node_version, ai_agents, extra_tools, password, vps_name, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      step = excluded.step,
      os = excluded.os,
      os_name = excluded.os_name,
      node_version = excluded.node_version,
      ai_agents = excluded.ai_agents,
      extra_tools = excluded.extra_tools,
      password = excluded.password,
      vps_name = excluded.vps_name,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    Number(chatId),
    session.step || 'IDLE',
    data.os || 'debian:12',
    data.osName || 'Debian 12 (Bookworm)',
    data.nodeVersion || '20',
    JSON.stringify(data.aiAgents || {}),
    JSON.stringify(data.extraTools || {}),
    data.password || null,
    data.vpsName || 'r-server'
  );
}

/**
 * Reset Wizard creation data while preserving saved Railway Token
 */
function resetSession(chatId) {
  const user = getUser(chatId);
  const defaultAi = { claude: true, agy: true, aider: false };
  const defaultTools = { xrdp: true, ffmpeg: true, ytdlp: true, fastfetch: true, nginx: false, redis: false, python_dev: true };
  
  const stmt = db.prepare(`
    INSERT INTO sessions (chat_id, step, os, os_name, node_version, ai_agents, extra_tools, password, vps_name, updated_at)
    VALUES (?, 'IDLE', 'debian:12', 'Debian 12 (Bookworm)', '20', ?, ?, NULL, 'r-server', CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      step = 'IDLE',
      os = 'debian:12',
      os_name = 'Debian 12 (Bookworm)',
      node_version = '20',
      ai_agents = excluded.ai_agents,
      extra_tools = excluded.extra_tools,
      password = NULL,
      vps_name = 'r-server',
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(Number(chatId), JSON.stringify(defaultAi), JSON.stringify(defaultTools));
}

function getDeploymentByProjectId(projectId) {
  try {
    const stmt = db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY id DESC LIMIT 1');
    return stmt.get(projectId) || null;
  } catch (e) {
    return null;
  }
}

function updateDeploymentOs(projectId, osName) {
  try {
    const stmt = db.prepare('UPDATE deployments SET os_name = ? WHERE project_id = ?');
    return stmt.run(osName, projectId);
  } catch (e) {
    return null;
  }
}

module.exports = {
  db,
  getUser,
  saveUser,
  getRailwayToken,
  getSystemRailwayToken,
  recordDeployment,
  getUserDeployments,
  getDeploymentByProjectId,
  updateDeploymentOs,
  getSession,
  saveSession,
  resetSession,
};
