const db = require('../services/database');
const railway = require('../services/railway');
const { OS_CATALOG, getDistroByCode } = require('../config/osCatalog');
const { safeSendMessage, safeEditMessage, getUserState, resetCreateData } = require('../utils/telegram');
const { promptTokenInput } = require('./menuHandler');

const GITHUB_REPO = process.env.GITHUB_REPO || 'myramm/r-server';

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// Step 2: Categorized OS Menu (Debian, Arch, Ubuntu, Kali)
function showOsMenu(bot, chatId, messageId) {
  const text = `🐧 *Langkah 2/5: Pilih Kategori Sistem Operasi (OS)*\n\n` +
    `Pilih distribusi Linux yang ingin Anda gunakan untuk VPS Railway:\n\n` +
    `• 🍥 *Debian GNU/Linux* (5 Versi Rilis)\n` +
    `• 🏹 *Arch Linux* (Rolling Release)\n` +
    `• 🟠 *Ubuntu Linux* (6 Versi Rilis)\n` +
    `• 🐉 *Kali Linux* (All Versions / Ethical Hacking)\n\n` +
    `_Klik kategori distro di bawah untuk memilih versi rilis:_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🍥 Debian Family (5 Distros)', callback_data: 'cat_debian' },
        { text: '🏹 Arch Linux (Rolling)', callback_data: 'cat_arch' }
      ],
      [
        { text: '🟠 Ubuntu Linux (6 Distros)', callback_data: 'cat_ubuntu' },
        { text: '🐉 Kali Linux (All Versions)', callback_data: 'cat_kali' }
      ],
      [
        { text: '🏠 Menu Utama', callback_data: 'menu_main' }
      ]
    ]
  };

  if (messageId) {
    safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

// Show Distro Releases within a Category
function showOsCategory(bot, chatId, messageId, categoryKey) {
  const cat = OS_CATALOG[categoryKey];
  if (!cat) return showOsMenu(bot, chatId, messageId);

  const text = `${cat.icon} *PILIH VERSI DISTRO: ${cat.name.toUpperCase()}*\n\n` +
    `ℹ️ _${cat.description}_\n\n` +
    `Klik rilis yang ingin Anda jadikan sistem operasi VPS:`;

  const buttons = [];
  cat.distros.forEach((d) => {
    const star = d.recommended ? ' ⭐' : '';
    buttons.push([{ text: `${d.name}${star}`, callback_data: `pick_${d.code}` }]);
  });

  buttons.push([{ text: '🔙 Kembali ke Pilihan Kategori OS', callback_data: 'flow_start_create' }]);

  safeEditMessage(bot, chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons }
  });
}

// Step 3: Node.js Version Menu
function showNodeMenu(bot, chatId, messageId) {
  const state = getUserState(chatId);
  const text = `⚡ *Langkah 3/5: Pilih Versi Node.js*\n\n` +
    `OS Terpilih: *${state.data.osName}*\n\n` +
    `Pilih versi Node.js yang akan diinstal di VPS:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🟢 Node.js v22.x LTS (Terbaru & Cepat)', callback_data: 'set_node_22' }],
      [{ text: '🟢 Node.js v20.x LTS (Paling Stabil & Kompatibel)', callback_data: 'set_node_20' }],
      [{ text: '🟡 Node.js v18.x LTS (Legacy)', callback_data: 'set_node_18' }],
      [{ text: '⚪ Default Bawaan OS', callback_data: 'set_node_default' }],
      [{ text: '🔙 Kembali', callback_data: 'flow_start_create' }]
    ]
  };

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

// Step 4: AI Agents Selection Menu (Multi-Toggle)
function showAiAgentsMenu(bot, chatId, messageId) {
  const state = getUserState(chatId);
  const ai = state.data.aiAgents;

  const claudeIcon = ai.claude ? '✅' : '⬜';
  const agyIcon = ai.agy ? '✅' : '⬜';
  const aiderIcon = ai.aider ? '✅' : '⬜';

  const text = `🤖 *Langkah 4/5: Pilih AI Coding Agent*\n\n` +
    `Klik tombol di bawah untuk mengaktifkan/menonaktifkan AI agent yang ingin dipasang di terminal VPS:\n\n` +
    `• ${claudeIcon} *Claude Code CLI* (Official Anthropic AI Agent)\n` +
    `• ${agyIcon} *Google Antigravity CLI* (\`agy\` / \`ag\` AI Assistant)\n` +
    `• ${aiderIcon} *Aider AI Pair Programming* (\`aider\` terminal)`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `${claudeIcon} Anthropic Claude Code CLI`, callback_data: 'toggle_ai_claude' }],
      [{ text: `${agyIcon} Google Antigravity CLI (agy)`, callback_data: 'toggle_ai_agy' }],
      [{ text: `${aiderIcon} Aider AI Coding Pair`, callback_data: 'toggle_ai_aider' }],
      [{ text: '➡️ Lanjut ke Pilihan Tools 🛠️', callback_data: 'step_goto_tools' }],
      [{ text: '🔙 Kembali', callback_data: 'flow_start_create' }]
    ]
  };

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

// Step 5: Extra Tools Selection Menu (Multi-Toggle)
function showToolsMenu(bot, chatId, messageId) {
  const state = getUserState(chatId);
  const t = state.data.extraTools;

  const xrdpIcon = t.xrdp ? '✅' : '⬜';
  const chromeIcon = t.chrome ? '✅' : '⬜';
  const ffmpegIcon = t.ffmpeg ? '✅' : '⬜';
  const ytdlpIcon = t.ytdlp ? '✅' : '⬜';
  const fastfetchIcon = t.fastfetch ? '✅' : '⬜';
  const nginxIcon = t.nginx ? '✅' : '⬜';
  const redisIcon = t.redis ? '✅' : '⬜';
  const pyIcon = t.python_dev ? '✅' : '⬜';

  const text = `🛠️ *Langkah 5/5: Pilih Paket & Tools Tambahan*\n\n` +
    `Pilih tools yang ingin langsung terpasang di VPS:\n\n` +
    `• ${xrdpIcon} *XRDP Remote Desktop (XFCE GUI)* (Port 3389)\n` +
    `• ${chromeIcon} *Google Chrome / Chromium Browser* (Untuk Desktop XRDP)\n` +
    `• ${ffmpegIcon} *FFmpeg* (Audio, Video & Media Processing)\n` +
    `• ${ytdlpIcon} *YT-DLP* (High-speed Video/Audio Downloader)\n` +
    `• ${fastfetchIcon} *Fastfetch & Neofetch* (System Info Banner)\n` +
    `• ${pyIcon} *Python 3 PIP & Dev Tools* (\`pip3\`, \`venv\`, \`build-essential\`)\n` +
    `• ${nginxIcon} *Nginx Web Server*\n` +
    `• ${redisIcon} *Redis Server & Tools*\n\n` +
    `💡 _Catatan: Semua tools & browser juga dapat dipasang kapan saja via Web Dashboard 1-Klik!_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: `${xrdpIcon} 🖥️ XRDP Desktop`, callback_data: 'toggle_tool_xrdp' },
        { text: `${chromeIcon} 🌐 Chrome Browser`, callback_data: 'toggle_tool_chrome' }
      ],
      [
        { text: `${ffmpegIcon} 🎬 FFmpeg`, callback_data: 'toggle_tool_ffmpeg' },
        { text: `${ytdlpIcon} 📥 YT-DLP`, callback_data: 'toggle_tool_ytdlp' }
      ],
      [
        { text: `${fastfetchIcon} 📊 Fastfetch`, callback_data: 'toggle_tool_fastfetch' },
        { text: `${pyIcon} 🐍 Python PIP`, callback_data: 'toggle_tool_python_dev' }
      ],
      [
        { text: `${nginxIcon} 🌐 Nginx`, callback_data: 'toggle_tool_nginx' },
        { text: `${redisIcon} 🗄️ Redis Tools`, callback_data: 'toggle_tool_redis' }
      ],
      [{ text: '🚀 Pasang Semua (Developer Super Pack)', callback_data: 'select_all_tools' }],
      [{ text: '➡️ Lanjut ke Pengaturan Password 🔐', callback_data: 'step_goto_password' }],
      [{ text: '🔙 Kembali', callback_data: 'step_goto_ai' }]
    ]
  };

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

// Step 6: Password Menu
function showPasswordMenu(bot, chatId, messageId) {
  const text = `🔐 *Pengaturan Password Root VPS*\n\n` +
    `Pilih metode pembuatan password root untuk login SSH & Web Dashboard:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎲 Buat Password Acak Otomatis (Aman & Cepat)', callback_data: 'pass_auto_gen' }],
      [{ text: '✍️ Input Password Manual', callback_data: 'pass_manual_input' }],
      [{ text: '🔙 Kembali ke Pilihan Tools', callback_data: 'step_goto_tools' }]
    ]
  };

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

// Step 7: Summary Confirmation View
function showSummaryMenu(bot, chatId, messageId) {
  const state = getUserState(chatId);
  const data = state.data;

  const activeAi = [];
  if (data.aiAgents.claude) activeAi.push('Claude Code');
  if (data.aiAgents.agy) activeAi.push('Antigravity CLI (agy)');
  if (data.aiAgents.aider) activeAi.push('Aider');

  const activeTools = [];
  if (data.extraTools.xrdp) activeTools.push('XRDP Desktop (GUI)');
  if (data.extraTools.chrome) activeTools.push('Chrome/Browser');
  if (data.extraTools.ffmpeg) activeTools.push('FFmpeg');
  if (data.extraTools.ytdlp) activeTools.push('YT-DLP');
  if (data.extraTools.fastfetch) activeTools.push('Fastfetch');
  if (data.extraTools.python_dev) activeTools.push('Python PIP');
  if (data.extraTools.nginx) activeTools.push('Nginx');
  if (data.extraTools.redis) activeTools.push('Redis');

  const text = `📋 *RINGKASAN KONFIGURASI VPS ANDA:*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🐧 *Sistem Operasi:* \`${data.osName}\`\n` +
    `⚡ *Node.js:* \`v${data.nodeVersion}\`\n` +
    `🤖 *AI Agent:* \`${activeAi.length > 0 ? activeAi.join(', ') : 'None'}\`\n` +
    `🛠️ *Tools Terpilih:* \`${activeTools.length > 0 ? activeTools.join(', ') : 'Standar'}\`\n` +
    `🔐 *Password Root:* \`${data.password}\`\n` +
    `🌐 *Web Dashboard:* \`Aktif (Tool Installer + RAM/CPU Monitor)\`\n` +
    `🚪 *SSH Port:* \`22000 (TCP Proxy Root)\`\n` +
    `⏳ *Estimasi Pembuatan:* \`Paling cepat ~3 menit, paling lama ~10 menit\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `💡 _Semua tool tambahan juga bisa dipasang kapan saja via Web Dashboard 1-Klik._\n\n` +
    `Klik tombol **Mulai Deploy** untuk langsung membuat VPS di Railway:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Konfirmasi & Deploy VPS Sekarang!', callback_data: 'confirm_deploy_vps' }],
      [{ text: '🎲 Ganti Password Acak Lain', callback_data: 'pass_auto_gen' }],
      [{ text: '❌ Batalkan', callback_data: 'menu_main' }]
    ]
  };

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

// Step 8: Full Provisioning Execution
async function executeFullVpsDeployment(bot, chatId, messageId) {
  const state = getUserState(chatId);
  const data = state.data;
  let railwayToken = data.railwayToken;
  const sysToken = db.getSystemRailwayToken();
  const vpsName = data.vpsName || 'r-server';
  const nodeVersion = data.nodeVersion || '20';
  let password = data.password;
  const aiAgents = data.aiAgents || {};
  const extraTools = data.extraTools || {};

  let validUser = null;
  if (railwayToken) {
    try {
      validUser = await railway.validateToken(railwayToken);
    } catch (e) {}
  }

  if (!validUser && sysToken) {
    try {
      validUser = await railway.validateToken(sysToken);
      railwayToken = sysToken;
      db.saveUser(chatId, {
        railway_token: sysToken,
        railway_user_name: validUser.name,
        railway_email: validUser.email
      });
      state.data.railwayToken = sysToken;
      state.data.railwayUser = validUser;
      db.saveSession(chatId, state);
    } catch (e) {}
  }

  if (!validUser || !railwayToken) {
    return promptTokenInput(bot, chatId, messageId);
  }

  if (!password) {
    password = generatePassword(12);
    state.data.password = password;
    db.saveSession(chatId, state);
  }

  const aptPackages = [];
  if (extraTools.chrome) aptPackages.push('chromium');
  if (extraTools.ffmpeg) aptPackages.push('ffmpeg');
  if (extraTools.fastfetch) aptPackages.push('neofetch');
  if (extraTools.nginx) aptPackages.push('nginx');
  if (extraTools.redis) aptPackages.push('redis-tools');
  if (extraTools.python_dev) aptPackages.push('python3-pip', 'python3-dev');

  const extraPackagesStr = aptPackages.join(' ');
  const installAiStr = Object.keys(aiAgents).filter(k => aiAgents[k]).join(' ');

  await safeEditMessage(bot, chatId, messageId, `🚀 *Memulai Pembuatan VPS di Railway...*\n\n⏳ [1/5] Membuat project baru...`);

  try {
    const projectDesc = `${data.osName || 'Linux'} SSH Server & Web Dashboard deployed via Telegram Bot`;
    const project = await railway.createProject(railwayToken, vpsName, projectDesc);
    const { projectId, environmentId } = project;

    await safeEditMessage(bot, chatId, messageId, 
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Project ID: \`${projectId}\`\n` +
      `⏳ [2/5] Menghubungkan template OS (\`${GITHUB_REPO}\`)...`
    );

    const service = await railway.createServiceFromRepo(railwayToken, projectId, GITHUB_REPO, 'main');
    const serviceId = service.id;

    await safeEditMessage(bot, chatId, messageId,
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Project & Service Dibuat.\n` +
      `⏳ [3/5] Mengatur Environment Variables (${data.osName || 'Linux'}), Node v${nodeVersion}, AI & Tools...`
    );

    // Set variables
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'OS_NAME', data.osName || 'Linux', true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'BASE_IMAGE', data.os || 'debian:12', true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'ROOT_PASSWORD', password, true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'SSH_PASSWORD', password, true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'SSH_USERNAME', 'root', true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'PORT', '8080', true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'NODE_VERSION', nodeVersion, true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'EXTRA_PACKAGES', extraPackagesStr, true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'INSTALL_AI', installAiStr, true);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'ENABLE_XRDP', extraTools.xrdp ? 'true' : 'false', true);

    await safeEditMessage(bot, chatId, messageId,
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Environment Variables diset.\n` +
      `⏳ [4/5] Membuka TCP Proxy Port 22 (SSH) & Domain Web Dashboard...`
    );

    await railway.createTcpProxy(railwayToken, environmentId, serviceId, 22);
    if (extraTools.xrdp) {
      await railway.createTcpProxy(railwayToken, environmentId, serviceId, 3389);
    }
    await railway.createServiceDomain(railwayToken, environmentId, serviceId);
    await railway.triggerRedeploy(railwayToken, environmentId, serviceId);

    await safeEditMessage(bot, chatId, messageId,
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Jaringan & Domain Web siap.\n` +
      `⏳ [5/5] Membangun container ${data.osName || 'Linux'} & OpenSSH...\n\n` +
      `⏱️ _Estimasi waktu pembuatan: Paling cepat ~3 menit, paling lama ~10 menit. Mohon tunggu proses build selesai..._`
    );

    // Polling Deployment Status (Up to 15 mins)
    let attempts = 0;
    const maxAttempts = 180;
    let status = 'INITIALIZING';

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      try {
        const statusObj = await railway.getDeploymentStatus(railwayToken, environmentId, serviceId);
        status = statusObj?.status || 'BUILDING';

        const elapsedSec = attempts * 5;
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

        if (attempts % 2 === 0 && status !== 'SUCCESS') {
          await safeEditMessage(bot, chatId, messageId,
            `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
            `✅ Jaringan & Domain Web siap.\n` +
            `⏳ [5/5] Membangun container ${data.osName || 'Linux'} & OpenSSH... (${timeStr})\n` +
            `📊 Status Container: \`${status}\`\n\n` +
            `⏱️ _Estimasi waktu: ~3-10 menit. Mohon tunggu..._`
          );
        }

        if (status === 'SUCCESS') break;
        if (status === 'FAILED' || status === 'CRASHED') break;
      } catch (errPoll) {}
    }

    const netInfo = await railway.getServiceNetworking(railwayToken, projectId);
    const tcpHost = netInfo.sshHost || 'altaria.proxy.rlwy.net';
    const tcpIp = netInfo.sshIp || tcpHost;
    const tcpPort = netInfo.sshPort || '22000';
    const rdpHost = netInfo.rdpHost || tcpHost;
    const rdpIp = netInfo.rdpIp || tcpIp;
    const rdpPort = netInfo.rdpPort || '3389';
    const webUrl = netInfo.domain ? `https://${netInfo.domain}` : `https://${projectId}.up.railway.app`;

    try {
      db.recordDeployment(chatId, {
        projectId,
        projectName: vpsName,
        osName: data.osName,
        nodeVersion,
        aiAgents: installAiStr,
        extraTools: extraPackagesStr,
        sshHost: tcpIp || tcpHost,
        sshPort: tcpPort,
        password,
        webUrl
      });
    } catch (e) {}

    const rdpSection = extraTools.xrdp ?
      `🖥️ *REMOTE DESKTOP GUI (XRDP + XFCE4):*\n` +
      `• *IP / PC Name:* \`${rdpIp}:${rdpPort}\`\n` +
      `• *Port RDP:* \`${rdpPort}\`\n` +
      `• *User:* \`root\`\n` +
      `• *Password:* \`${password}\`\n` +
      `• *Client App:* Microsoft Remote Desktop / Remmina\n\n` : '';

    const successText = `🎉 *VPS BERHASIL DIBUAT & AKTIF ONLINE!* 🎉\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *Project Name:* \`${vpsName}\`\n` +
      `🐧 *OS:* ${data.osName}\n` +
      `⚡ *Node.js:* v${nodeVersion}\n` +
      `🟢 *Status:* Online & Ready\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔑 *KREDENSIAL AKSES SSH:*\n` +
      `• *IP Address:* \`${tcpIp}\`\n` +
      `• *Host Domain:* \`${tcpHost}\`\n` +
      `• *Port SSH:* \`${tcpPort}\`\n` +
      `• *User:* \`root\`\n` +
      `• *Password:* \`${password}\`\n\n` +
      rdpSection +
      `🌐 *WEB MONITORING & REBOOT DASHBOARD:*\n` +
      `🔗 ${webUrl}\n` +
      `_(Live RAM, CPU, Disk, Sisa Saldo Credit & Tombol Restart Server)_\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Perintah Koneksi SSH (Copy-Paste):*\n` +
      `\`\`\`bash\nssh -p ${tcpPort} root@${tcpIp}\n\`\`\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 *Perintah Cepat di Terminal:*\n` +
      `• Claude Code: \`claude\` (atau \`cl\`)\n` +
      `• Antigravity AI: \`agy\` (atau \`ag\`)\n` +
      `• Sisa Credit & Uptime: \`usage\`\n` +
      `• Info Hardware/OS: \`fastfetch\` atau \`neofetch\`\n` +
      `• Video Downloader: \`yt-dlp <link>\`\n` +
      `• Media Converter: \`ffmpeg\``;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌐 Buka Web Dashboard', url: webUrl }],
        [{ text: '📋 Kelola VPS Lainnya', callback_data: 'cmd_list' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
      ]
    };

    resetCreateData(chatId);
    safeEditMessage(bot, chatId, messageId, successText, {
      reply_markup: keyboard,
      disable_web_page_preview: true
    });

  } catch (err) {
    resetCreateData(chatId);
    safeEditMessage(bot, chatId, messageId,
      `❌ *Gagal Membuat VPS!*\n\n_Detail Error: ${err.message}_\n\nSilakan coba lagi dari menu utama.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]]
        }
      }
    );
  }
}

module.exports = {
  generatePassword,
  showOsMenu,
  showOsCategory,
  showNodeMenu,
  showAiAgentsMenu,
  showToolsMenu,
  showPasswordMenu,
  showSummaryMenu,
  executeFullVpsDeployment,
};
