const db = require('../services/database');
const railway = require('../services/railway');
const { safeSendMessage, safeEditMessage, getUserState } = require('../utils/telegram');

async function handleListProjects(bot, chatId, messageId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken;
  const sysToken = db.getSystemRailwayToken();

  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Mengambil daftar VPS & data login lengkap dari Railway...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Mengambil daftar VPS & data login lengkap dari Railway...*');
  }

  let projects = null;
  if (token) {
    try {
      projects = await railway.listProjectsWithDetails(token);
    } catch (err) {
      console.log('List projects with user token failed:', err.message);
    }
  }

  if (!projects && sysToken) {
    try {
      projects = await railway.listProjectsWithDetails(sysToken);
      token = sysToken;
      const user = await railway.validateToken(sysToken).catch(() => null);
      if (user) {
        db.saveUser(chatId, {
          railway_token: sysToken,
          railway_user_name: user.name,
          railway_email: user.email
        });
        state.data.railwayToken = sysToken;
        state.data.railwayUser = user;
        db.saveSession(chatId, state);
      }
    } catch (errSys) {
      console.log('List projects with sysToken failed:', errSys.message);
    }
  }

  if (!projects) {
    return safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⚠️ *Sesi Akun Railway Tidak Valid atau Kadaluwarsa*\n\n` +
      `Koneksi ke Railway mengembalikan \`Not Authorized\`.\n` +
      `Silakan klik tombol di bawah untuk login akun Railway Anda (1-Klik):`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔐 Login Akun Railway (1-Klik)', callback_data: 'cmd_set_token' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
          ]
        }
      }
    );
  }

  try {
    if (projects.length === 0) {
      return safeEditMessage(bot, chatId, loadMsg.message_id, '📋 *Tidak ada project/VPS aktif di akun Railway Anda.*', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Buat VPS Baru Sekarang', callback_data: 'flow_start_create' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
          ]
        }
      });
    }

    let text = `📋 *DAFTAR VPS & DATA LOGIN DI AKUN ANDA (${projects.length}):*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const buttons = [];

    projects.forEach((p, idx) => {
      const createdStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
      const sshHost = p.tcpHost || 'Belum dibuat / Off';
      const sshIp = p.tcpIp || p.tcpHost || 'Belum dibuat / Off';
      const sshPort = p.tcpPort || '22';
      const password = p.rootPassword || 'RamaGans76_';
      const isOnline = Boolean(p.tcpHost);

      const savedDep = db.getDeploymentByProjectId(p.id);
      const displayOs = p.osName || savedDep?.os_name || 'Debian 12 (Bookworm)';
      const nodeVer = p.nodeVersion || savedDep?.node_version || '20';
      const nodeDisplay = nodeVer === 'default' ? 'Default OS' : `v${nodeVer} LTS`;

      text += `${idx + 1}. 🖥️ *${p.name}*\n`;
      text += `   • ID: \`${p.id}\`\n`;
      text += `   • OS: *${displayOs}*\n`;
      text += `   • Node.js: \`${nodeDisplay}\`\n`;
      text += `   • Status: ${isOnline ? '🟢 *Online*' : '🟡 *Menunggu Proxy*'}\n`;
      text += `   • Dibuat: \`${createdStr}\`\n`;

      if (p.tcpHost) {
        text += `\n   🔑 *DATA LOGIN SSH (Root):*\n`;
        text += `   • IP Address: \`${sshIp}\`\n`;
        text += `   • Host Domain: \`${sshHost}\`\n`;
        text += `   • Port SSH: \`${sshPort}\`\n`;
        text += `   • User: \`root\`\n`;
        text += `   • Password: \`${password}\`\n`;
        text += `   • Quick Command:\n   \`ssh -p ${sshPort} root@${sshIp}\`\n`;
      }

      if (p.enableXrdp) {
        const rdpAddress = `${p.rdpIp || sshIp}:${p.rdpPort || 3389}`;
        text += `\n   🖥️ *DATA LOGIN XRDP (Remote Desktop):*\n`;
        text += `   • IP / PC Name: \`${rdpAddress}\`\n`;
        text += `   • Host Domain: \`${p.rdpHost || sshHost}:${p.rdpPort || 3389}\`\n`;
        text += `   • Port RDP: \`${p.rdpPort || 3389}\`\n`;
        text += `   • User: \`root\`\n`;
        text += `   • Password: \`${password}\`\n`;
        text += `   • Desktop GUI: *XFCE4 GUI (XRDP)*\n`;
        text += `   • Client App: Microsoft Remote Desktop / Remmina\n`;
      }

      if (p.domain) {
        text += `\n   🌐 *Web Monitor:* ${p.domain}\n`;
      }

      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      const row1 = [];
      if (p.domain) {
        row1.push({ text: `🌐 Dashboard`, url: p.domain });
      }
      row1.push({ text: `🔄 Restart`, callback_data: `reboot_${p.id}` });
      buttons.push(row1);

      const row2 = [
        { text: `🛠️ Tools`, callback_data: `vps_tools_${p.id}` },
        { text: `🤖 AI Agents`, callback_data: `vps_ai_${p.id}` },
        { text: `💿 Reinstall OS`, callback_data: `reinstall_${p.id}` }
      ];
      buttons.push(row2);

      const row3 = [
        { text: `🗑️ Hapus VPS`, callback_data: `del_${p.id}` }
      ];
      buttons.push(row3);
    });

    buttons.push([
      { text: '➕ Buat VPS Baru', callback_data: 'flow_start_create' },
      { text: '🔄 Refresh', callback_data: 'cmd_list' }
    ]);
    buttons.push([{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]);

    await safeEditMessage(bot, chatId, loadMsg.message_id, text, {
      reply_markup: { inline_keyboard: buttons },
      disable_web_page_preview: true
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal mengambil daftar VPS:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function handleRestartProject(bot, chatId, projectId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu untuk merestart VPS.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const savedDep = db.getDeploymentByProjectId(projectId);
  const vpsName = savedDep?.project_name || 'r-server';
  const sshHost = savedDep?.ssh_host || '-';
  const sshPort = savedDep?.ssh_port || '22';
  const ipDisplay = sshHost !== '-' ? `${sshHost}:${sshPort}` : '';

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `🔄 *MEMULAI RESTART VPS...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsName}\`${ipDisplay ? ` (\`${ipDisplay}\`)` : ''}\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⏳ Mengirim instruksi reboot / restart ke Railway Cloud...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    const fullIp = details.tcpIp || details.tcpHost || savedDep?.ssh_host || '-';
    const fullPort = details.tcpPort || savedDep?.ssh_port || '22';
    const targetDisplay = fullIp !== '-' ? `${fullIp}:${fullPort}` : (details.name || vpsName);

    const successText = `🔄 *PROSES RESTART VPS TELAH DIMULAI!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⏳ *MOHON TUNGGU SEKITAR 2 MENIT:*\n` +
      `• Server Railway sedang me-reboot & menginisialisasi ulang container Linux.\n` +
      `• Proses startup OpenSSH server, Network Proxy & Web Dashboard membutuhkan waktu **sekitar 1 - 2 menit**.\n` +
      `• IP Address, Port SSH, dan Password root *tetap sama & tidak berubah*.\n\n` +
      `💡 _Silakan tunggu sekitar 2 menit sebelum mencoba menghubungkan kembali SSH / Web Monitor._`;

    safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Cek Daftar & Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal restart VPS:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: `reboot_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function handleCheckBalance(bot, chatId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan klik **Set Token Railway** terlebih dahulu untuk memeriksa saldo.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Set Token Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  try {
    const user = await railway.validateToken(token);
    const credits = user.billingDetails?.availableCredits != null ? `$${parseFloat(user.billingDetails.availableCredits).toFixed(2)}` : '$5.00 (Trial)';
    const balance = user.billingDetails?.currentBalance != null ? `$${parseFloat(user.billingDetails.currentBalance).toFixed(2)}` : '$0.00';

    const text = `💰 *Informasi Saldo & Akun Railway:*\n\n` +
      `👤 *Nama:* ${user.name || 'User'}\n` +
      `📧 *Email:* \`${user.email}\`\n` +
      `💳 *Available Credits:* \`${credits}\`\n` +
      `💵 *Current Balance:* \`${balance}\`\n\n` +
      `💡 *Info Credit:* Akun Railway menyediakan kuota credit trial $5.00 yang akan me-refresh / reset secara berkala (setiap 24 jam) untuk menjalankan server VPS Anda secara hemat & gratis!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Buat VPS Baru', callback_data: 'flow_start_create' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
      ]
    };

    safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  } catch (err) {
    safeSendMessage(bot, chatId, `❌ *Gagal memeriksa saldo:* ${err.message}`);
  }
}

async function handleDeleteProject(bot, chatId, projectId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return;

  safeSendMessage(bot, chatId, `⏳ *Menghapus project \`${projectId}\`...*`);
  try {
    await railway.deleteProject(token, projectId);
    safeSendMessage(bot, chatId, `✅ *Project \`${projectId}\` berhasil dihapus secara permanen dari Railway.*`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Lihat Sisa VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeSendMessage(bot, chatId, `❌ *Gagal menghapus project:* ${err.message}`);
  }
}

async function handleShowToolsHub(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';
  const currentNode = details?.nodeVersion || savedDep?.node_version || '20';
  const nodeDisplay = currentNode === 'default' ? 'Default Distro' : `v${currentNode} LTS`;

  const text = `🛠️ *PUSAT TOOLS & RUNTIME WORKSTATION*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⚡ *Node.js Runtime:* \`${nodeDisplay}\`\n` +
    `🐍 *Python Environment:* \`Python 3 + Astral UV\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Kelola runtime dan paket tools developer untuk VPS ini:\n\n` +
    `• ⚡ *Ganti Versi Node.js* — Switch runtime v22 / v20 / v18 / Default secara permanen di cloud\n` +
    `• 🐍 *Python Dev & Astral UV* — Pasang / update pip, venv, Astral uv, build-tools & AI libs\n` +
    `• 🎬 *Media & Downloader* — \`yt-dlp\`, \`ffmpeg\`, \`ffprobe\`, \`mediainfo\`\n` +
    `• 📦 *Katalog 40+ Apps* — Lihat daftar lengkap software desktop & dev tools\n` +
    `• 🌐 *Web Tool Installer* — Pasang software via Web Dashboard 1-Klik\n\n` +
    `_Silakan pilih menu aksi:_`;

  const inlineKeyboard = [
    [
      { text: `⚡ Ganti Versi Node.js (${nodeDisplay})`, callback_data: `vps_node_${projectId}` },
      { text: `🐍 Python Dev & Astral UV`, callback_data: `vps_python_${projectId}` }
    ],
    [{ text: '📦 Lihat Katalog 40+ Apps & Software', callback_data: 'cmd_apps_catalog' }]
  ];

  if (details?.domain) {
    inlineKeyboard.push([{ text: '🌐 Buka 1-Klik Web Tool Installer', url: details.domain }]);
  }

  inlineKeyboard.push([{ text: '🔙 Kembali ke Daftar VPS', callback_data: 'cmd_list' }]);

  const keyboard = { inline_keyboard: inlineKeyboard };

  if (messageId) {
    return safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    return safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

async function handleShowChangeNodeMenu(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu untuk mengubah versi Node.js.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Memuat data konfigurasi Node.js VPS...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Memuat data konfigurasi Node.js VPS...*');
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';
  const currentNode = details?.nodeVersion || savedDep?.node_version || '20';

  const nodeNameMap = {
    '22': 'v22 LTS (Jod - Terbaru & Paling Cepat)',
    '20': 'v20 LTS (Iron - Stabil)',
    '18': 'v18 LTS (Hydrogen - Legacy)',
    'default': 'Default (Bawaan Paket OS Linux)'
  };
  const currentText = nodeNameMap[currentNode] || `v${currentNode}`;

  const text = `⚡ *GANTI / ATUR VERSI NODE.JS VPS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⚡ *Versi Saat Ini:* *${currentText}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih versi Node.js yang ingin Anda pasang secara permanen di VPS ini:\n\n` +
    `• 🟢 *Node.js v22 LTS (Jod)* — Direkomendasikan untuk performa AI, tool & V8 engine tercepat\n` +
    `• 🔵 *Node.js v20 LTS (Iron)* — Sangat stabil & kompatibilitas tinggi\n` +
    `• 🟠 *Node.js v18 LTS (Hydrogen)* — Versi legacy untuk script lama\n` +
    `• ⚪ *Node.js Default* — Menggunakan paket bawaan OS distro Linux\n\n` +
    `_Catatan: Pengaturan ini akan disimpan permanen di Railway Environment Variables dan tidak akan hilang saat server direstart._`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `🟢 Node.js v22 LTS (Terbaru & Cepat)${currentNode === '22' ? ' ✅' : ''}`, callback_data: `setnode_${projectId}_22` }],
      [{ text: `🔵 Node.js v20 LTS (Stabil & Aman)${currentNode === '20' ? ' ✅' : ''}`, callback_data: `setnode_${projectId}_20` }],
      [{ text: `🟠 Node.js v18 LTS (Legacy)${currentNode === '18' ? ' ✅' : ''}`, callback_data: `setnode_${projectId}_18` }],
      [{ text: `⚪ Node.js Default (Bawaan OS)${currentNode === 'default' ? ' ✅' : ''}`, callback_data: `setnode_${projectId}_default` }],
      [{ text: '🔙 Kembali ke Daftar VPS', callback_data: 'cmd_list' }]
    ]
  };

  return safeEditMessage(bot, chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

async function executeChangeNodeVersion(bot, chatId, messageId, projectId, nodeVersion) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const savedDep = db.getDeploymentByProjectId(projectId);
  const vpsName = savedDep?.project_name || 'r-server';
  const sshHost = savedDep?.ssh_host || '-';
  const sshPort = savedDep?.ssh_port || '22';
  const ipDisplay = sshHost !== '-' ? `${sshHost}:${sshPort}` : '';

  const nodeNameMap = {
    '22': 'v22 LTS (Jod)',
    '20': 'v20 LTS (Iron)',
    '18': 'v18 LTS (Hydrogen)',
    'default': 'Default OS'
  };
  const nodeLabel = nodeNameMap[nodeVersion] || `v${nodeVersion}`;

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `⏳ *MENGUBAH VERSI NODE.JS KE ${nodeLabel}...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsName}\`${ipDisplay ? ` (\`${ipDisplay}\`)` : ''}\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⏳ [1/3] Mengambil konfigurasi Railway...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    const fullIp = details.tcpIp || details.tcpHost || savedDep?.ssh_host || '-';
    const fullPort = details.tcpPort || savedDep?.ssh_port || '22';
    const targetDisplay = fullIp !== '-' ? `${fullIp}:${fullPort}` : (details.name || vpsName);

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MENGUBAH VERSI NODE.JS [${details.name || vpsName}]...*\n\n` +
      `⚡ *Versi Baru:* \`Node.js ${nodeLabel}\`\n` +
      `⏳ [2/3] Menyimpan environment variable \`NODE_VERSION=${nodeVersion}\` ke Railway...`
    );

    // Update Railway variable NODE_VERSION
    await railway.setVariable(token, projectId, details.environmentId, details.serviceId, 'NODE_VERSION', nodeVersion, false);

    // Trigger Redeploy / Restart with latest code
    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MENGUBAH VERSI NODE.JS [${details.name || vpsName}]...*\n\n` +
      `⚡ *Versi Baru:* \`Node.js ${nodeLabel}\`\n` +
      `⏳ [2/3] Memicu deploy container baru di Railway...`
    );

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    // Save to local database
    db.updateDeploymentNodeVersion(projectId, nodeVersion);

    // Poll deployment status for up to 20 seconds so user gets real-time feedback
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const depStatus = await railway.getDeploymentStatus(token, details.environmentId, details.serviceId);
      const statusText = depStatus.status === 'SUCCESS' ? '✅ Selesai Deploy' : (depStatus.status || 'BUILDING');
      await safeEditMessage(
        bot,
        chatId,
        loadMsg.message_id,
        `⏳ *MENGUBAH VERSI NODE.JS [${details.name || vpsName}]...*\n\n` +
        `⚡ *Versi Baru:* \`Node.js ${nodeLabel}\`\n` +
        `⏳ [3/3] Menunggu container Railway aktif (Status: \`${statusText}\`)...`
      );
      if (depStatus.status === 'SUCCESS') break;
    }

    const successText = `✅ *VERSI NODE.JS BERHASIL DITERAPKAN!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `⚡ *Versi Node.js:* *Node.js ${nodeLabel}* (\`NODE_VERSION=${nodeVersion}\`)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *Container Railway telah aktif dengan Node.js ${nodeLabel}!* ✨\n` +
      `• Pengaturan tersimpan permanen di Cloud (tidak akan hilang saat reboot).\n` +
      `• IP Address, Port SSH, Root Password, dan Web Dashboard *tetap sama & aman*.\n\n` +
      `💡 _Silakan login via SSH dan cek dengan command:_ \`node -v\``;

    safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Cek Status VPS', callback_data: 'cmd_list' }],
          [{ text: '⚡ Ubah Node.js Lagi', callback_data: `vps_node_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal mengubah versi Node.js:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: `vps_node_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function handleShowPythonMenu(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Memuat data konfigurasi Python VPS...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Memuat data konfigurasi Python VPS...*');
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `🐍 *KELOLA PYTHON & ASTRAL UV RUNTIME*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `🐍 *Python Version:* \`Python 3.x (Active)\`\n` +
    `⚡ *Package Manager:* \`Astral UV & PIP\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Ekosistem Python Dev siap pakai untuk VPS Anda:\n\n` +
    `• ⚡ *Astral UV* — Package manager tercepat (10-100x lebih cepat dari pip)\n` +
    `• 📦 *Python Virtualenv & Pip* (\`python3-pip\`, \`python3-venv\`, \`python3-dev\`)\n` +
    `• 🛠️ *C/C++ Build Essentials* (\`gcc\`, \`g++\`, \`make\`, \`cmake\`) untuk compile native wheel\n` +
    `• 🤖 *AI & Data Science Suite* (\`ipython\`, \`rich\`, \`typer\`, \`aider-chat\`, \`hermes-agent\`)\n\n` +
    `💡 *Perintah Populer di Terminal VPS:*\n` +
    `• \`uv pip install <paket>\` (Instalasi super cepat)\n` +
    `• \`uv venv\` (Buat virtualenv instan)\n` +
    `• \`python --version\` & \`pip --version\`\n\n` +
    `_Pilih opsi di bawah untuk memperbarui / memasang paket Python di Cloud Railway:_`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Pasang / Update Python Dev & Astral UV', callback_data: `py_pack_dev_${projectId}` }],
      [{ text: '🤖 Pasang AI & Data Science Suite', callback_data: `py_pack_ai_${projectId}` }],
      [{ text: '🔙 Kembali ke Menu Tools', callback_data: `vps_tools_${projectId}` }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  return safeEditMessage(bot, chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

async function executeInstallPythonPack(bot, chatId, messageId, projectId, packType) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const savedDep = db.getDeploymentByProjectId(projectId);
  const vpsName = savedDep?.project_name || 'r-server';
  const packLabel = packType === 'ai' ? 'Python AI & Data Suite' : 'Python Dev & Astral UV';

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `⏳ *MEMASANG PAKET [${packLabel}]...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsName}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⏳ [1/3] Mengonfigurasi Railway Cloud Variables...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    const { environmentId, serviceId } = details;
    const fullIp = details.tcpIp || details.tcpHost || savedDep?.ssh_host || '-';
    const fullPort = details.tcpPort || savedDep?.ssh_port || '22';
    const targetDisplay = fullIp !== '-' ? `${fullIp}:${fullPort}` : (details.name || vpsName);

    let extraPacks = 'python3-pip python3-dev python3-venv build-essential';
    if (packType === 'ai') {
      extraPacks += ' python3-numpy python3-scipy';
    }

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMASANG PAKET [${packLabel}]...*\n\n` +
      `⏳ [2/3] Menyimpan environment variable EXTRA_PACKAGES di Cloud...`
    );

    await railway.setVariable(token, projectId, environmentId, serviceId, 'EXTRA_PACKAGES', extraPacks, true);

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMASANG PAKET [${packLabel}]...*\n\n` +
      `⏳ [3/3] Me-restart container agar paket aktif sempurna...`
    );

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    const successText = `✅ *PAKET [${packLabel}] BERHASIL DIKONFIGURASI!* 🐍🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *PAKET YANG TERPASANG:*\n` +
      `• 🐍 \`python3\`, \`pip3\`, \`python3-dev\`, \`venv\`\n` +
      `• ⚡ Astral \`uv\` (Blazing-fast package installer)\n` +
      `• 🛠️ \`build-essential\`, \`gcc\`, \`make\`, \`cmake\`\n` +
      `${packType === 'ai' ? '• 🤖 AI & Data Tools: `ipython`, `rich`, `aider-chat`, `hermes-agent`\n' : ''}\n` +
      `⏳ *MOHON TUNGGU SEKITAR 1 - 2 MENIT:*\n` +
      `Server sedang me-reboot untuk memuat seluruh runtime. Setelah itu Anda dapat langsung menjalankan \`uv pip install\` atau \`python3\` di terminal SSH!`;

    safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Cek Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🛠️ Menu Tools Hub', callback_data: `vps_tools_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal memasang paket Python:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: `vps_python_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function handleShowAiAgentsHub(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `🤖 *PUSAT KELOLA & AKUN AI AGENTS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Kelola akun, hubungkan token cloud, atau hapus session AI agent di VPS Anda:\n\n` +
    `• ⚡ *Google Antigravity CLI* (\`agy\` / \`ag\`)\n` +
    `• 🟣 *Claude Code CLI* (\`claude\` / \`cl\`)\n` +
    `• 🚀 *OpenCode AI* (\`opencode\` / \`oc\`)\n` +
    `• 🛡️ *Freebuff AI Assistant* (\`freebuff\` / \`fb\`)\n` +
    `• 🐍 *Aider AI Assistant* (\`aider\`)\n` +
    `• 💎 *Gemini & DeepSeek APIs*\n\n` +
    `_Pilih aksi kelola AI di bawah ini:_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '➕ Tambah / Ganti Akun AI 🔑', callback_data: `ai_add_menu_${projectId}` }
      ],
      [
        { text: '⚡ Reset Antigravity (AGY)', callback_data: `ai_clean_agy_${projectId}` },
        { text: '🟣 Reset Claude Code', callback_data: `ai_clean_claude_${projectId}` }
      ],
      [
        { text: '🚀 Reset OpenCode AI', callback_data: `ai_clean_opencode_${projectId}` },
        { text: '🛡️ Reset Freebuff & Aider', callback_data: `ai_clean_freebuff_${projectId}` }
      ],
      [
        { text: '🧹 Reset SEMUA Token & Session (Fresh Total)', callback_data: `ai_clean_all_${projectId}` }
      ],
      [
        { text: '🔙 Kembali ke Daftar VPS', callback_data: 'cmd_list' }
      ]
    ]
  };

  if (messageId) {
    return safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    return safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

async function handleShowAddAiAccountMenu(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `➕ *TAMBAH / GANTI AKUN AI AGENT*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih AI Agent yang ingin Anda hubungkan atau ganti akunnya:\n\n` +
    `• ⚡ *Google Antigravity (AGY)* — OAuth Token / Gemini API Key\n` +
    `• 🟣 *Claude Code CLI* — Anthropic Auth Token / API Key (\`sk-ant-...\`)\n` +
    `• 🚀 *OpenCode AI* — OpenAI API Key (\`sk-...\`) / OpenCode Token\n` +
    `• 💎 *Google Gemini API Key* — (\`AIzaSy...\`)\n` +
    `• 🐋 *DeepSeek API Key* — (\`sk-...\`)\n` +
    `• 🛡️ *Aider AI Assistant* — OpenAI / Anthropic / DeepSeek Key\n` +
    `• ☁️ *GitHub Token (Auto-Backup & Sync)* — (\`ghp_...\` / \`github_pat_...\`)\n\n` +
    `_Klik tombol AI Agent di bawah untuk memasukkan token/key:_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '⚡ Antigravity (AGY)', callback_data: `ai_prompt_agy_${projectId}` },
        { text: '🟣 Claude Code', callback_data: `ai_prompt_claude_${projectId}` }
      ],
      [
        { text: '🚀 OpenCode AI', callback_data: `ai_prompt_opencode_${projectId}` },
        { text: '💎 Gemini API Key', callback_data: `ai_prompt_gemini_${projectId}` }
      ],
      [
        { text: '🐋 DeepSeek API Key', callback_data: `ai_prompt_deepseek_${projectId}` },
        { text: '🛡️ Aider AI Key', callback_data: `ai_prompt_aider_${projectId}` }
      ],
      [
        { text: '☁️ GitHub Token (Auto-Backup & Sync)', callback_data: `ai_prompt_github_${projectId}` }
      ],
      [
        { text: '🔙 Kembali ke Hub AI', callback_data: `vps_ai_${projectId}` },
        { text: '🏠 Menu Utama', callback_data: 'menu_main' }
      ]
    ]
  };

  if (messageId) {
    return safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    return safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

async function handlePromptAiToken(bot, chatId, messageId, projectId, agentType) {
  const state = getUserState(chatId);
  state.step = 'AWAIT_AI_TOKEN';
  state.data.targetProjectId = projectId;
  state.data.aiAgentType = agentType;
  db.saveSession(chatId, state);

  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = savedDep?.project_name || 'r-server';

  const agentLabelMap = {
    'agy': 'Google Antigravity (AGY)',
    'claude': 'Claude Code CLI',
    'opencode': 'OpenCode AI',
    'gemini': 'Google Gemini API',
    'deepseek': 'DeepSeek API',
    'aider': 'Aider AI Assistant',
    'github': 'GitHub Cloud Auto-Backup'
  };
  const label = agentLabelMap[agentType] || 'AI Agent';

  const hintMap = {
    'agy': 'OAuth Token dari antigravity-cli atau Gemini API Key (AIzaSy...)',
    'claude': 'Anthropic Token atau API Key (sk-ant-api03-...)',
    'opencode': 'OpenAI API Key (sk-proj-...) atau Token OpenCode',
    'gemini': 'Gemini API Key dari Google AI Studio (AIzaSy...)',
    'deepseek': 'DeepSeek API Key (sk-...)',
    'aider': 'OpenAI / Anthropic / DeepSeek API Key',
    'github': 'Personal Access Token GitHub (ghp_... atau github_pat_...) dengan izin repo'
  };
  const hint = hintMap[agentType] || 'Token / API Key';

  const text = `🔑 *MASUKKAN TOKEN / KEY: [${label.toUpperCase()}]*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `ℹ️ *Format yang Diterima:* _${hint}_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Silakan **ketik atau paste** string Token / API Key Anda di kolom chat Telegram ini:\n\n` +
    `💡 _Token akan disimpan aman & dienkripsi di Cloud Railway Environment Variables._`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '❌ Batalkan', callback_data: `ai_add_menu_${projectId}` }]
    ]
  };

  if (messageId) {
    return safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    return safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

async function executeSetAiToken(bot, chatId, projectId, agentType, tokenValue) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const savedDep = db.getDeploymentByProjectId(projectId);
  const vpsName = savedDep?.project_name || 'r-server';

  const agentLabelMap = {
    'agy': 'Google Antigravity (AGY)',
    'claude': 'Claude Code CLI',
    'opencode': 'OpenCode AI',
    'gemini': 'Google Gemini API',
    'deepseek': 'DeepSeek API',
    'aider': 'Aider AI Assistant',
    'github': 'GitHub Cloud Auto-Backup'
  };
  const label = agentLabelMap[agentType] || 'AI Agent';

  const cleanVal = tokenValue.trim();
  const maskedVal = cleanVal.length > 8 
    ? `${cleanVal.substring(0, 4)}...${cleanVal.substring(cleanVal.length - 4)}` 
    : '****';

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `⏳ *MEMASANG TOKEN [${label}]...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsName}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⏳ [1/3] Menghubungi Railway Cloud API...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    const { environmentId, serviceId } = details;
    const fullIp = details.tcpIp || details.tcpHost || savedDep?.ssh_host || '-';
    const fullPort = details.tcpPort || savedDep?.ssh_port || '22';
    const targetDisplay = fullIp !== '-' ? `${fullIp}:${fullPort}` : (details.name || vpsName);

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMASANG TOKEN [${label}]...*\n\n` +
      `⏳ [2/3] Menyimpan token ke Railway Cloud Environment Variables...`
    );

    if (agentType === 'agy') {
      if (cleanVal.startsWith('AIzaSy')) {
        await railway.setVariable(token, projectId, environmentId, serviceId, 'GEMINI_API_KEY', cleanVal, true);
      } else {
        await railway.setVariable(token, projectId, environmentId, serviceId, 'ANTIGRAVITY_AUTH_TOKEN', cleanVal, true);
        await railway.setVariable(token, projectId, environmentId, serviceId, 'ANTIGRAVITY_TOKEN', cleanVal, true);
      }
    } else if (agentType === 'claude') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'ANTHROPIC_AUTH_TOKEN', cleanVal, true);
      if (cleanVal.startsWith('sk-ant')) {
        await railway.setVariable(token, projectId, environmentId, serviceId, 'ANTHROPIC_API_KEY', cleanVal, true);
      }
    } else if (agentType === 'opencode') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'OPENCODE_TOKEN', cleanVal, true);
      if (cleanVal.startsWith('sk-')) {
        await railway.setVariable(token, projectId, environmentId, serviceId, 'OPENAI_API_KEY', cleanVal, true);
      }
    } else if (agentType === 'gemini') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'GEMINI_API_KEY', cleanVal, true);
    } else if (agentType === 'deepseek') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'DEEPSEEK_API_KEY', cleanVal, true);
    } else if (agentType === 'aider') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'AIDER_API_KEY', cleanVal, true);
      if (cleanVal.startsWith('sk-')) {
        await railway.setVariable(token, projectId, environmentId, serviceId, 'OPENAI_API_KEY', cleanVal, true);
      }
    } else if (agentType === 'github') {
      await railway.setVariable(token, projectId, environmentId, serviceId, 'GITHUB_TOKEN', cleanVal, true);
    }

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMASANG TOKEN [${label}]...*\n\n` +
      `⏳ [3/3] Me-restart container agar akun langsung aktif...`
    );

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    const cmdHintMap = {
      'agy': 'agy (atau ag)',
      'claude': 'claude (atau cl)',
      'opencode': 'opencode (atau oc)',
      'gemini': 'agy',
      'deepseek': 'aider --model deepseek/...',
      'aider': 'aider (atau ai)',
      'github': 'ai-backup (atau ai-sync status)'
    };
    const cmdHint = cmdHintMap[agentType] || 'ai';

    const successText = `✅ *AKUN [${label}] BERHASIL DIHUBUNGKAN!* 🔑🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🔑 *Token:* \`${maskedVal}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *STATUS AKUN AI:*\n` +
      `• Token telah disimpan secara **permanen** di Cloud Railway.\n` +
      `• Container sedang me-restart (1–2 menit) untuk menerapkan kredensial baru.\n` +
      `• Akun akan otomatis terhubung setiap kali server dinyalakan.\n\n` +
      `💡 *Cara Penggunaan di Terminal SSH:*\n` +
      `Jalankan \`${cmdHint}\` setelah server kembali online untuk langsung mulai coding!`;

    safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Cek Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🤖 Hub AI Agents', callback_data: `vps_ai_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal memasang token AI:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: `ai_add_menu_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function executeResetAiAgent(bot, chatId, messageId, projectId, agentType) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return safeSendMessage(bot, chatId, '⚠️ Silakan login Railway terlebih dahulu.', {
      reply_markup: { inline_keyboard: [[{ text: '🔑 Login Railway', callback_data: 'cmd_set_token' }]] }
    });
  }

  const savedDep = db.getDeploymentByProjectId(projectId);
  const vpsName = savedDep?.project_name || 'r-server';

  const agentLabelMap = {
    'agy': 'Google Antigravity CLI',
    'claude': 'Claude Code CLI',
    'opencode': 'OpenCode AI',
    'freebuff': 'Freebuff & Aider AI',
    'all': 'SEMUA AI AGENTS (Total Clean)'
  };
  const label = agentLabelMap[agentType] || 'AI Agent';

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `⏳ *MEMPROSES RESET SESSION [${label}]...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsName}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `⏳ [1/3] Menghubungi Railway Cloud API...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    const { environmentId, serviceId } = details;
    const fullIp = details.tcpIp || details.tcpHost || savedDep?.ssh_host || '-';
    const fullPort = details.tcpPort || savedDep?.ssh_port || '22';
    const targetDisplay = fullIp !== '-' ? `${fullIp}:${fullPort}` : (details.name || vpsName);

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES RESET SESSION [${label}]...*\n\n` +
      `⏳ [2/3] Menghapus token & variable terkait dari Railway Cloud...`
    );

    // Delete appropriate variables depending on agentType
    if (agentType === 'agy' || agentType === 'all') {
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'ANTIGRAVITY_AUTH_TOKEN');
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'ANTIGRAVITY_TOKEN');
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'GEMINI_API_KEY');
    }
    if (agentType === 'claude' || agentType === 'all') {
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'CLAUDE_CODE_TOKEN');
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'CLAUDE_API_KEY');
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'ANTHROPIC_API_KEY');
    }
    if (agentType === 'opencode' || agentType === 'all') {
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'OPENCODE_TOKEN');
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'OPENAI_API_KEY');
    }
    if (agentType === 'freebuff' || agentType === 'all') {
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'AIDER_API_KEY');
    }
    if (agentType === 'all') {
      await railway.deleteVariable(token, projectId, environmentId, serviceId, 'GITHUB_TOKEN');
    }

    // Trigger redeploy / restart
    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES RESET SESSION [${label}]...*\n\n` +
      `⏳ [3/3] Me-restart container agar memori & session bersih 100%...`
    );

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    const successText = `✅ *SESI & TOKEN [${label}] BERHASIL DIBERSIHKAN!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ *HASIL PEMBERSIHAN:*\n` +
      `• Token & session *${label}* di Cloud Railway telah **DIHAPUS BERSIH**.\n` +
      `• Container sedang me-restart ke kondisi *100% Fresh State*.\n` +
      `• Akun lama tidak akan pernah nyangkut atau auto-login lagi saat reboot.\n\n` +
      `⏳ *MOHON TUNGGU SEKITAR 1 - 2 MENIT:*\n` +
      `Setelah server kembali online, Anda bebas login atau setup akun baru dengan aman!`;

    safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Cek Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🤖 Kelola AI Agents Lain', callback_data: `vps_ai_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal reset session AI:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Coba Lagi', callback_data: `vps_ai_${projectId}` }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

module.exports = {
  handleListProjects,
  handleRestartProject,
  handleCheckBalance,
  handleDeleteProject,
  handleShowToolsHub,
  handleShowChangeNodeMenu,
  executeChangeNodeVersion,
  handleShowPythonMenu,
  executeInstallPythonPack,
  handleShowAiAgentsHub,
  handleShowAddAiAccountMenu,
  handlePromptAiToken,
  executeSetAiToken,
  executeResetAiAgent,
};
