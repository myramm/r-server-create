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
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Kelola runtime dan paket tools developer untuk VPS ini:\n\n` +
    `• ⚡ *Ganti Versi Node.js* — Switch runtime v22 / v20 / v18 / Default secara permanen di cloud\n` +
    `• 🎬 *Media & Downloader* — \`yt-dlp\`, \`ffmpeg\`, \`ffprobe\`, \`mediainfo\`\n` +
    `• 📦 *Katalog 40+ Apps* — Lihat daftar lengkap software desktop & dev tools\n` +
    `• 🌐 *Web Tool Installer* — Pasang software via Web Dashboard 1-Klik\n\n` +
    `_Silakan pilih menu aksi:_`;

  const inlineKeyboard = [
    [{ text: `⚡ Ganti Versi Node.js (${nodeDisplay})`, callback_data: `vps_node_${projectId}` }],
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

    // Trigger Redeploy / Restart
    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MENGUBAH VERSI NODE.JS [${details.name || vpsName}]...*\n\n` +
      `⚡ *Versi Baru:* \`Node.js ${nodeLabel}\`\n` +
      `⏳ [3/3] Merestart container untuk menerapkan versi Node.js baru...`
    );

    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);

    // Save to local database
    db.updateDeploymentNodeVersion(projectId, nodeVersion);

    const successText = `✅ *VERSI NODE.JS BERHASIL DIUBAH!* 🎉\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *VPS:* \`${details.name || vpsName}\`\n` +
      `🌐 *IP Address:* \`${targetDisplay}\`\n` +
      `🆔 *Project ID:* \`${projectId}\`\n` +
      `⚡ *Versi Node.js:* *Node.js ${nodeLabel}* (\`NODE_VERSION=${nodeVersion}\`)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `⏳ *MOHON TUNGGU SEKITAR 1 - 2 MENIT:*\n` +
      `• Server Railway sedang me-restart container dan menginstal **Node.js ${nodeLabel}**.\n` +
      `• Pengaturan ini **tersimpan permanen** di Cloud dan tidak akan hilang saat server di-reboot di kemudian hari.\n` +
      `• IP Address, Port SSH, Root Password, dan Web Dashboard *tetap sama & aman*.\n\n` +
      `💡 _Silakan tunggu sekitar 2 menit sebelum login kembali via SSH dan mengecek dengan \`node -v\`._`;

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

  const text = `🤖 *PUSAT KELOLA & RESET AI AGENTS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Kelola session, hapus token cloud, dan ganti akun AI tanpa khawatir akun lama tersangkut kembali saat restart:\n\n` +
    `• ⚡ *Google Antigravity CLI* (\`agy\` / \`ag\`)\n` +
    `• 🟣 *Claude Code CLI* (\`claude\` / \`cl\`)\n` +
    `• 🚀 *OpenCode AI* (\`opencode\` / \`oc\`)\n` +
    `• 🛡️ *Freebuff AI Assistant* (\`freebuff\` / \`fb\`)\n` +
    `• 🐍 *Aider AI Assistant* (\`aider\`)\n\n` +
    `_Pilih AI Agent di bawah ini untuk mereset session / menghapus token cloud:_`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '⚡ Reset Antigravity (AGY)', callback_data: `ai_clean_agy_${projectId}` },
        { text: '🟣 Reset Claude Code', callback_data: `ai_clean_claude_${projectId}` }
      ],
      [
        { text: '🚀 Reset OpenCode AI', callback_data: `ai_clean_opencode_${projectId}` },
        { text: '🛡️ Reset Freebuff & Aider', callback_data: `ai_clean_freebuff_${projectId}` }
      ],
      [
        { text: '🧹 Reset SEMUA Token & Session AI (Fresh Total)', callback_data: `ai_clean_all_${projectId}` }
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
  handleShowAiAgentsHub,
  executeResetAiAgent,
};
