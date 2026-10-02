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

      text += `${idx + 1}. 🖥️ *${p.name}*\n`;
      text += `   • ID: \`${p.id}\`\n`;
      text += `   • OS: *${displayOs}*\n`;
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
        { text: `💿 Reinstall OS`, callback_data: `reinstall_${p.id}` },
        { text: `🗑️ Hapus`, callback_data: `del_${p.id}` }
      ];
      buttons.push(row2);
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
  if (!token) return;

  const loadMsg = await safeSendMessage(bot, chatId, `🔄 *Merestart / Redeploy VPS \`${projectId}\`...*`);
  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment tidak ditemukan.');
    }
    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);
    safeEditMessage(bot, chatId, loadMsg.message_id, `✅ *VPS [${details.name || projectId}] sedang direstart!* \n\nContainer akan kembali online dalam 10-20 detik.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Lihat Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal restart VPS:* ${err.message}`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]] }
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

module.exports = {
  handleListProjects,
  handleRestartProject,
  handleCheckBalance,
  handleDeleteProject,
};
