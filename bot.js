require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const railway = require('./railway');
const db = require('./database');
const cliAuth = require('./cliAuth');
const { OS_CATALOG, getDistroByCode, findDistro } = require('./osCatalog');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required in .env file!');
  process.exit(1);
}

const GITHUB_REPO = process.env.GITHUB_REPO || 'myramm/r-server';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Active OAuth Device Code Polling Sessions per chatId
const activeAuthPolls = new Map();

function getUserState(chatId) {
  return db.getSession(chatId);
}

function saveUserState(chatId, session) {
  return db.saveSession(chatId, session);
}

function resetCreateData(chatId) {
  return db.resetSession(chatId);
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_';
  let pass = '';
  for (let i = 0; i < length; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

// Safe Telegram message sending / editing helpers to avoid Markdown parse errors
async function safeSendMessage(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    return await bot.sendMessage(chatId, text.replace(/[*_`\[\]()]/g, ''), { ...options });
  }
}

async function safeEditMessage(chatId, messageId, text, options = {}) {
  try {
    return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...options });
  } catch (err) {
    try {
      return await bot.editMessageText(text.replace(/[*_`\[\]()]/g, ''), { chat_id: chatId, message_id: messageId, ...options });
    } catch (err2) {
      return await bot.sendMessage(chatId, text.replace(/[*_`\[\]()]/g, ''), options);
    }
  }
}

// -------------------------------------------------------------
// /start Command & Main Menu
// -------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'User';
  sendMainMenu(chatId, name);
});

function sendMainMenu(chatId, name = 'User') {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;
  const isTokenSaved = Boolean(token);
  const userName = state.data.railwayUser?.name || 'R BOT';
  const userEmail = state.data.railwayUser?.email || 'rbotwhatsapp@gmail.com';
  
  const tokenStatus = isTokenSaved ? `🟢 *Terhubung* (${userName})` : `🔴 *Belum Login*`;

  const text = `👋 *Halo ${name}!*\n\n` +
    `🤖 *R-SERVER Cloud VPS Generator Bot*\n` +
    `Bot untuk membuat & mengelola server Cloud VPS (*Debian, Arch, Ubuntu, Kali Linux*) di Railway secara otomatis dengan konfigurasi custom:\n\n` +
    `• 🐧 *Sistem Operasi:* Debian, Arch Linux, Ubuntu & Kali Linux\n` +
    `• ⚡ *Node.js Version:* v22 LTS / v20 LTS / v18 LTS / Default\n` +
    `• 🤖 *AI Coding Agent:* Claude Code & Google Antigravity CLI\n` +
    `• 🖥️ *Remote Desktop:* XRDP + XFCE4 GUI (Port 3389)\n` +
    `• 🎬 *Tools Ekstra:* FFmpeg, YT-DLP, Fastfetch, Neofetch, Nginx, Redis\n` +
    `• 🌐 *Web Dashboard:* RAM/CPU/Disk/Sisa Saldo & Reboot\n` +
    `• 👤 *Akun Railway:* ${tokenStatus}\n\n` +
    `Pilih menu di bawah ini:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Buat VPS Baru (Custom Config)', callback_data: 'flow_start_create' }],
      [
        { text: '📋 VPS Aktif Saya', callback_data: 'cmd_list' },
        { text: '👤 Profil & Status Akun', callback_data: 'cmd_profile' }
      ],
      [
        { text: '💰 Cek Saldo / Credit', callback_data: 'cmd_balance' },
        { text: '🔑 Login Railway (1-Klik)', callback_data: 'cmd_set_token' }
      ],
      [
        { text: '📚 Katalog OS (4 Distro Family)', callback_data: 'cmd_catalog' },
        { text: '📦 Katalog 40+ Apps XRDP', callback_data: 'cmd_apps_catalog' }
      ]
    ]
  };

  safeSendMessage(chatId, text, { reply_markup: keyboard });
}

// Show Railway Profile & Status
async function handleShowProfile(chatId, messageId) {
  let loadMsg;
  if (messageId) {
    await safeEditMessage(chatId, messageId, '⏳ *Memeriksa profil dan status akun Railway...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(chatId, '⏳ *Memeriksa profil dan status akun Railway...*');
  }

  const state = getUserState(chatId);
  let token = state.data?.railwayToken;
  const sysToken = db.getSystemRailwayToken();

  let user = null;
  if (token) {
    try {
      user = await railway.validateToken(token);
    } catch (e) {}
  }

  if (!user && sysToken) {
    try {
      user = await railway.validateToken(sysToken);
      token = sysToken;
      db.saveUser(chatId, {
        railway_token: sysToken,
        railway_user_name: user.name,
        railway_email: user.email
      });
      state.data.railwayToken = sysToken;
      state.data.railwayUser = user;
      db.saveSession(chatId, state);
    } catch (e) {}
  }

  if (!user) {
    const notLoggedInText = `👤 *PROFIL & STATUS AKUN RAILWAY*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔴 *Status Login:* Belum Terhubung / Expired\n` +
      `ℹ️ _Anda belum login atau sesi token Railway Anda telah kadaluwarsa._\n\n` +
      `Silakan klik tombol di bawah untuk login akun Railway Anda (1-Klik sangat mudah):`;

    const kb = {
      inline_keyboard: [
        [{ text: '🔐 Login Railway (1-Klik / Code)', callback_data: 'cmd_set_token' }],
        [{ text: '📖 Tutorial Token Manual', callback_data: 'cmd_tutorial' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
      ]
    };

    return safeEditMessage(chatId, loadMsg.message_id, notLoggedInText, { reply_markup: kb });
  }

  const credits = user.billingDetails?.availableCredits != null ? `$${parseFloat(user.billingDetails.availableCredits).toFixed(2)}` : '$5.00 (Trial)';
  const balance = user.billingDetails?.currentBalance != null ? `$${parseFloat(user.billingDetails.currentBalance).toFixed(2)}` : '$0.00';
  const workspaceName = user.workspaces?.[0]?.name || "Personal Workspace";

  const text = `👤 *PROFIL & STATUS AKUN RAILWAY*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🟢 *Status Akun:* ✅ *Terhubung (Online & Aktif)*\n` +
    `👤 *Nama User:* \`${user.name || 'Railway User'}\`\n` +
    `📧 *Email Terdaftar:* \`${user.email || '-'}\`\n` +
    `🏢 *Workspace:* \`${workspaceName}\`\n` +
    `💳 *Available Credits:* \`${credits}\`\n` +
    `💵 *Current Usage/Balance:* \`${balance}\`\n` +
    `🔑 *Token Sync:* \`Aktif & Terverifikasi\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 _Akun Anda siap digunakan untuk membuat & mengelola server VPS secara instan._`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📋 Lihat VPS Aktif', callback_data: 'cmd_list' },
        { text: '🚀 Buat VPS Baru', callback_data: 'flow_start_create' }
      ],
      [
        { text: '🔄 Refresh Profil', callback_data: 'cmd_profile' },
        { text: '🔐 Ganti / Login Akun Lain', callback_data: 'cmd_set_token' }
      ],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  safeEditMessage(chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

// -------------------------------------------------------------
// /help & /cancel & /catalog & /apps & /profile
// -------------------------------------------------------------
bot.onText(/\/help/, (msg) => {
  const text = `📖 *Daftar Perintah:* \n\n` +
    `• \`/create\` - Mulai wizard pembuatan VPS baru (Full Buttons)\n` +
    `• \`/profile\` - Lihat status login & profil akun Railway Anda\n` +
    `• \`/list\` - Lihat semua VPS aktif & data login SSH di akun Anda\n` +
    `• \`/reinstall\` - Ganti / Reinstall OS Linux pada VPS aktif\n` +
    `• \`/balance\` - Periksa sisa credit trial Railway ($5.00)\n` +
    `• \`/catalog\` - Lihat katalog lengkap 60+ Distro Linux\n` +
    `• \`/apps\` - Lihat katalog lengkap 40+ Software & Aplikasi XRDP\n` +
    `• \`/login\` - Login ulang akun Railway 1-Klik\n` +
    `• \`/cancel\` - Batalkan konfigurasi saat ini`;
  safeSendMessage(msg.chat.id, text);
});

bot.onText(/\/(profile|profil|akun|me|status)/, (msg) => {
  handleShowProfile(msg.chat.id);
});

bot.onText(/\/(reinstall|gantios|reos)/, (msg) => {
  handleListProjects(msg.chat.id);
});

bot.onText(/\/catalog/, (msg) => {
  sendCatalogOverview(msg.chat.id);
});

bot.onText(/\/(apps|software)/, (msg) => {
  sendAppsCatalog(msg.chat.id);
});

bot.onText(/\/cancel/, (msg) => {
  resetCreateData(msg.chat.id);
  bot.sendMessage(msg.chat.id, '❌ *Proses telah dibatalkan.*', { parse_mode: 'Markdown' });
});

// -------------------------------------------------------------
// Callback Query Router (Full Buttons Handler)
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Main menu triggers
  if (data === 'menu_main') {
    resetCreateData(chatId);
    return sendMainMenu(chatId, query.from.first_name);
  }
  if (data === 'cmd_catalog') {
    return sendCatalogOverview(chatId);
  }
  if (data === 'cmd_apps_catalog') {
    return sendAppsCatalog(chatId);
  }
  if (data === 'cmd_set_token') {
    return promptTokenInput(chatId, messageId);
  }
  if (data === 'cmd_tutorial') {
    return sendTokenTutorial(chatId);
  }
  if (data === 'cmd_list') {
    return handleListProjects(chatId, messageId);
  }
  if (data === 'cmd_profile') {
    return handleShowProfile(chatId, messageId);
  }
  if (data === 'cmd_balance') {
    return handleCheckBalance(chatId);
  }
  if (data.startsWith('del_')) {
    const projectId = data.replace('del_', '');
    return handleDeleteProject(chatId, projectId);
  }
  if (data.startsWith('reboot_')) {
    const projectId = data.replace('reboot_', '');
    return handleRestartProject(chatId, projectId);
  }

  // --- Reinstall / Ganti OS Callbacks ---
  if (data.startsWith('reinstall_')) {
    const projectId = data.replace('reinstall_', '');
    return handleReinstallOsMenu(chatId, messageId, projectId, 1);
  }
  if (data.startsWith('rmenu_')) {
    const projectId = data.replace('rmenu_', '');
    return handleReinstallOsMenu(chatId, messageId, projectId, 1);
  }
  if (data.startsWith('rpage_')) {
    const rest = data.replace('rpage_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const page = parseInt(rest.substring(idx + 1) || '1', 10);
    return handleReinstallOsMenu(chatId, messageId, projectId, page);
  }
  if (data.startsWith('rcat_')) {
    const rest = data.replace('rcat_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const catKey = rest.substring(idx + 1);
    return handleReinstallOsCategory(chatId, messageId, projectId, catKey);
  }
  if (data.startsWith('rpick_')) {
    const rest = data.replace('rpick_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const distroCode = rest.substring(idx + 1);
    return handleReinstallConfirm(chatId, messageId, projectId, distroCode);
  }
  if (data.startsWith('rcust_')) {
    const projectId = data.replace('rcust_', '');
    return promptReinstallCustomOsInput(chatId, messageId, projectId);
  }
  if (data.startsWith('rdo_')) {
    const rest = data.replace('rdo_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const distroCodeOrId = rest.substring(idx + 1);
    return executeReinstallOs(chatId, messageId, projectId, distroCodeOrId);
  }

  // --- Railway OAuth Device Code Login Callbacks ---
  if (data === 'cancel_cli_auth') {
    cliAuth.cancelCliLogin(chatId);
    return sendMainMenu(chatId, query.from?.first_name);
  }

  if (data === 'prompt_token_manual') {
    return promptManualTokenInput(chatId, messageId);
  }

  // --- VPS Creation Wizard Steps ---
  if (data === 'flow_start_create') {
    const state = getUserState(chatId);
    if (!state.data?.railwayToken) {
      return promptTokenInput(chatId, messageId);
    }
    return showOsMenu(chatId, messageId);
  }

  // Step 2: OS Category & Distro Selection
  if (data === 'os_page_1') {
    return showOsMenu(chatId, messageId, 1);
  }
  if (data === 'os_page_2' || data === 'next_os') {
    return showOsMenu(chatId, messageId, 2);
  }
  if (data === 'os_custom_input') {
    return promptCustomOsInput(chatId, messageId);
  }

  if (data.startsWith('cat_')) {
    const catKey = data.replace('cat_', '');
    return showOsCategory(chatId, messageId, catKey);
  }

  if (data.startsWith('pick_os_')) {
    const code = data.replace('pick_', '');
    const distro = getDistroByCode(code);
    if (distro) {
      const state = getUserState(chatId);
      state.data.os = distro.id;
      state.data.osName = distro.name;
      db.saveSession(chatId, state);
      return showNodeMenu(chatId, messageId);
    }
  }

  // Legacy fallback for set_os_
  if (data.startsWith('set_os_')) {
    const osChoice = data.replace('set_os_', '');
    const state = getUserState(chatId);
    if (osChoice === 'debian12') {
      state.data.os = 'debian:12';
      state.data.osName = 'Debian 12 (Bookworm)';
    } else if (osChoice === 'ubuntu24') {
      state.data.os = 'ubuntu:24.04';
      state.data.osName = 'Ubuntu 24.04 LTS (Noble)';
    } else if (osChoice === 'ubuntu22') {
      state.data.os = 'ubuntu:22.04';
      state.data.osName = 'Ubuntu 22.04 LTS (Jammy)';
    }
    db.saveSession(chatId, state);
    return showNodeMenu(chatId, messageId);
  }

  // Step 3: Node.js Version Selection
  if (data.startsWith('set_node_')) {
    const nodeChoice = data.replace('set_node_', '');
    const state = getUserState(chatId);
    state.data.nodeVersion = nodeChoice;
    db.saveSession(chatId, state);
    return showAiAgentsMenu(chatId, messageId);
  }

  // Step 4: AI Agents Selection (Toggles)
  if (data.startsWith('toggle_ai_')) {
    const agent = data.replace('toggle_ai_', '');
    const state = getUserState(chatId);
    if (state.data.aiAgents[agent] !== undefined) {
      state.data.aiAgents[agent] = !state.data.aiAgents[agent];
    }
    db.saveSession(chatId, state);
    return showAiAgentsMenu(chatId, messageId);
  }
  if (data === 'step_goto_tools') {
    return showToolsMenu(chatId, messageId);
  }

  // Step 5: Extra Tools Selection (Toggles)
  if (data.startsWith('toggle_tool_')) {
    const tool = data.replace('toggle_tool_', '');
    const state = getUserState(chatId);
    if (state.data.extraTools[tool] !== undefined) {
      state.data.extraTools[tool] = !state.data.extraTools[tool];
    }
    db.saveSession(chatId, state);
    return showToolsMenu(chatId, messageId);
  }
  if (data === 'select_all_tools') {
    const state = getUserState(chatId);
    Object.keys(state.data.extraTools).forEach(k => state.data.extraTools[k] = true);
    db.saveSession(chatId, state);
    return showToolsMenu(chatId, messageId);
  }
  if (data === 'step_goto_password') {
    return showPasswordMenu(chatId, messageId);
  }

  // Step 6: Password Options
  if (data === 'pass_auto_gen') {
    const state = getUserState(chatId);
    const autoPass = generatePassword(12);
    state.data.password = autoPass;
    db.saveSession(chatId, state);
    return showSummaryMenu(chatId, messageId);
  }
  if (data === 'pass_manual_input') {
    const state = getUserState(chatId);
    state.step = 'AWAIT_PASSWORD_MANUAL';
    db.saveSession(chatId, state);
    return bot.editMessageText(`🔐 *Input Password Manual:*\n\nSilakan ketikkan password root yang Anda inginkan (minimal 6 karakter) lalu kirim ke chat ini:`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });
  }

  // Step 7: Confirmation & Deploy Trigger
  if (data === 'confirm_deploy_vps') {
    return executeFullVpsDeployment(chatId, messageId);
  }

  bot.answerCallbackQuery(query.id).catch(() => {});
});

// -------------------------------------------------------------
// Wizard UI Views
// -------------------------------------------------------------

// Step 1: Railway 1-Click Device Code Login Prompt (Official Railway Device Code XXXX-XXXX)
async function promptTokenInput(chatId, messageId) {
  let loadMsg;
  if (messageId) {
    await bot.editMessageText('⏳ *Menyiapkan sesi login 1-Klik Railway...*', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await bot.sendMessage(chatId, '⏳ *Menyiapkan sesi login 1-Klik Railway...*', { parse_mode: 'Markdown' });
  }

  cliAuth.startCliLogin(
    chatId,
    // onCodeReady (Extracted XXXX-XXXX)
    async ({ userCode, activateUrl }) => {
      const text = `🔐 *LOGIN AKUN RAILWAY (1-CLICK ACTIVATE)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Aktivasi akun Railway Anda dengan sangat mudah & instan tanpa perlu cari token manual:\n\n` +
        `👉 *Cara 1 (Rekomendasi - Sekali Klik):*\n` +
        `Klik tombol **'🚀 Sign in with 1-Click'** di bawah untuk langsung menyetujui di browser.\n\n` +
        `👉 *Cara 2 (Input Kode Manual):*\n` +
        `1. Buka browser: [railway.com/activate](https://railway.com/activate)\n` +
        `2. Masukkan kode verifikasi:\n` +
        `🔑 \`${userCode}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ _Menunggu konfirmasi login dari browser Anda (otomatis terdeteksi)..._`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🚀 Sign in with 1-Click (Buka Browser)', url: activateUrl }],
          [{ text: '🔑 Input Token API Manual (Alternatif)', callback_data: 'prompt_token_manual' }],
          [{ text: '🔙 Batalkan & Kembali', callback_data: 'cancel_cli_auth' }]
        ]
      };

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: loadMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      }).catch(() => {});
    },
    // onAuthenticated (User Approved in Browser!)
    async (token) => {
      try {
        const user = await railway.validateToken(token);
        db.saveUser(chatId, {
          username: null,
          first_name: null,
          railway_token: token,
          railway_user_name: user.name || 'Railway User',
          railway_email: user.email || 'Active Session',
        });

        const state = getUserState(chatId);
        state.step = 'IDLE';
        state.data.railwayToken = token;
        state.data.railwayUser = user;
        db.saveSession(chatId, state);

        const credits = user.billingDetails?.availableCredits != null ? `$${parseFloat(user.billingDetails.availableCredits).toFixed(2)}` : '$5.00 (Trial)';

        const successText = `🎉 *LOGIN RAILWAY BERHASIL!* 🎉\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Nama Akun:* ${user.name || 'Railway User'}\n` +
          `📧 *Email:* \`${user.email}\`\n` +
          `💰 *Credit Tersedia:* \`${credits}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `💾 _Akun Anda telah tersimpan permanen di Database!_\n\n` +
          `Sekarang mari pilih konfigurasi VPS Anda:`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '🚀 Lanjut Buat VPS Baru', callback_data: 'flow_start_create' }],
            [{ text: '📋 Kelola VPS Aktif', callback_data: 'cmd_list' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
          ]
        };

        return bot.editMessageText(successText, {
          chat_id: chatId,
          message_id: loadMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (e) {
        bot.editMessageText(`❌ *Gagal memvalidasi akun setelah login:* ${e.message}`, {
          chat_id: chatId,
          message_id: loadMsg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]] }
        }).catch(() => {});
      }
    },
    // onError
    (err) => {
      bot.editMessageText(`❌ *Sesi login dihentikan:* ${err.message}`, {
        chat_id: chatId,
        message_id: loadMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Login Lagi', callback_data: 'cmd_set_token' }],
            [{ text: '🔑 Input Token Manual', callback_data: 'prompt_token_manual' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
          ]
        }
      }).catch(() => {});
    }
  );
}

function promptManualTokenInput(chatId, messageId) {
  cliAuth.cancelCliLogin(chatId);

  const state = getUserState(chatId);
  state.step = 'AWAIT_TOKEN';
  db.saveSession(chatId, state);

  const text = `📥 *Input Token API Railway Manual:*\n\n` +
    `Silakan copy token API Railway Anda dari [railway.com/account/tokens](https://railway.com/account/tokens) lalu paste dan kirimkan ke chat ini:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔐 Kembali ke Login 1-Click', callback_data: 'cmd_set_token' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  if (messageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
  } else {
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard, disable_web_page_preview: true });
  }
}

// Step 2: Categorized OS Menu (Debian, Arch, Ubuntu, Kali)
function showOsMenu(chatId, messageId) {
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
        { text: '🐳 Custom Docker Image OS', callback_data: 'os_custom_input' }
      ],
      [
        { text: '🏠 Menu Utama', callback_data: 'menu_main' }
      ]
    ]
  };

  if (messageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
  } else {
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// Prompt Custom Docker Base Image
function promptCustomOsInput(chatId, messageId) {
  const state = getUserState(chatId);
  state.step = 'AWAIT_CUSTOM_OS';
  db.saveSession(chatId, state);

  const text = `🐳 *Input Custom Docker Base Image OS*\n\n` +
    `Ketik nama Docker base image yang ingin Anda gunakan untuk VPS container Railway:\n\n` +
    `*Contoh:* \n` +
    `• \`debian:12\` atau \`debian:11\`\n` +
    `• \`ubuntu:24.04\` atau \`ubuntu:22.04\`\n` +
    `• \`archlinux:latest\`\n` +
    `• \`kalilinux/kali-rolling\`\n\n` +
    `_Silakan balas pesan ini dengan nama image Docker:_`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Kembali ke Kategori OS', callback_data: 'flow_start_create' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  if (messageId) {
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
  } else {
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

// Show Distro Releases within a Category
function showOsCategory(chatId, messageId, categoryKey) {
  const cat = OS_CATALOG[categoryKey];
  if (!cat) return showOsMenu(chatId, messageId);

  const text = `${cat.icon} *PILIH VERSI DISTRO: ${cat.name.toUpperCase()}*\n\n` +
    `ℹ️ _${cat.description}_\n\n` +
    `Klik rilis yang ingin Anda jadikan sistem operasi VPS:`;

  const buttons = [];
  cat.distros.forEach((d) => {
    const star = d.recommended ? ' ⭐' : '';
    buttons.push([{ text: `${d.name}${star}`, callback_data: `pick_${d.code}` }]);
  });

  buttons.push([{ text: '🔙 Kembali ke Pilihan Kategori OS', callback_data: 'flow_start_create' }]);

  bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

// Send Full Catalog Overview
function sendCatalogOverview(chatId) {
  let text = `📚 *RAILWAY LINUX / CONTAINER OS CATALOG*\n\n` +
    `Daftar distribusi Linux yang didukung untuk Cloud VPS Railway:\n\n`;

  for (const [key, cat] of Object.entries(OS_CATALOG)) {
    text += `${cat.icon} *${cat.name}* (Pkg Manager: \`${cat.distros[0]?.pkg || 'apt'}\`)\n`;
    text += `  _${cat.description}_\n`;
    cat.distros.forEach(d => {
      const star = d.recommended ? ' ⭐' : '';
      text += `  • \`${d.id}\` — ${d.name}${star}\n`;
    });
    text += `\n`;
  }

  text += `💡 *Tips:* Semua distro sudah terpasang OpenSSH Server, Fastfetch, Neofetch, Python, Node.js, dan AI CLI.`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Buat VPS Sekarang', callback_data: 'flow_start_create' }],
      [{ text: '📦 Lihat Katalog Apps XRDP', callback_data: 'cmd_apps_catalog' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

// Send XRDP Software Catalog (40 Categories)
function sendAppsCatalog(chatId) {
  const text = `🖥️ *XRDP LINUX DESKTOP - KATALOG SOFTWARE & APPS (40 KATEGORI)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Daftar software & tools yang dapat dipasang di Linux Desktop (XRDP + XFCE4) & Web Dashboard:\n\n` +
    `1. 🌐 *Web Browsers:* Chrome, Chromium, Firefox ESR, Brave, Edge, Falkon, Midori, Tor Browser\n` +
    `2. 📁 *File Managers:* Thunar, Nautilus, Dolphin, PCManFM, Double Commander, Midnight Commander (mc), Ranger\n` +
    `3. 📝 *Code & Text Editors:* VS Code, code-server, Geany, Mousepad, Gedit, Kate, Nano, Vim, Neovim, Micro, Helix\n` +
    `4. 🤖 *AI Coding Agents:* Claude Code CLI (\`claude\`), Antigravity CLI (\`agy\`), Aider AI (\`aider\`), JupyterLab, PyTorch\n` +
    `5. 🐍 *Python Dev:* Python 3, PIP, venv, Poetry, UV, Pipx, FastAPI, Flask, Django, NumPy, Pandas, OpenCV\n` +
    `6. ⚡ *Node.js & JS:* Node.js LTS, npm, Bun, Deno, pnpm, Yarn, TypeScript, PM2, Vite, Nodemon\n` +
    `7. 💻 *Other Languages:* Rust & Cargo, Go, Java OpenJDK (8/11/17/21), Maven, Gradle, PHP & Composer, C/C++ GCC/Clang/CMake\n` +
    `8. 🎬 *Media Players:* VLC Media Player, MPV, Celluloid, Audacious, Rhythmbox\n` +
    `9. 🎞️ *Audio/Video Processing:* FFmpeg, ffprobe, YT-DLP, HandBrake, MediaInfo, Audacity, SoX\n` +
    `10. 🎨 *Graphics & 3D:* GIMP, Inkscape, ImageMagick, Blender 3D, cwebp, optipng, jpegoptim\n` +
    `11. 📄 *Office & Documents:* LibreOffice (Writer, Calc, Impress), Evince PDF, Pandoc, Poppler\n` +
    `12. 📦 *Compression:* 7-Zip, p7zip, zip, unzip, tar, gzip, bzip2, xz, zstd, unrar\n` +
    `13. 💻 *Terminal & Shell:* XFCE Terminal, Alacritty, Kitty, Tmux, Zsh, Fish, Starship, FZF, Bat, Eza, Ripgrep\n` +
    `14. 🌐 *Network & Transfer:* curl, wget, aria2, rclone, rsync, OpenSSH, Nmap, Wireshark/tshark, iperf3\n` +
    `15. 🗄️ *Databases & Clients:* SQLite & SQLiteBrowser, Redis, PostgreSQL Client, MySQL/MariaDB Client, DuckDB\n` +
    `16. ☁️ *DevOps & Containers:* Railway CLI, Docker CLI, Docker Compose, Podman, GitHub CLI (\`gh\`), Terraform, Ansible\n` +
    `17. 📊 *Monitoring:* Fastfetch, Neofetch, Htop, Btop, Glances, Ncdu, Iftop, Nethogs\n` +
    `18. 🍷 *Windows Compatibility:* Wine64 & Winetricks (.exe support)\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Cara Pasang:* Buka Web Dashboard VPS Anda di menu **🛠️ Tool & Browser Installer** untuk 1-Klik Install kapan saja!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Buat VPS Baru', callback_data: 'flow_start_create' }],
      [{ text: '📋 Kelola VPS Aktif', callback_data: 'cmd_list' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
}

// Step 3: Node.js Version Menu
function showNodeMenu(chatId, messageId) {
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

  bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// Step 4: AI Agents Selection Menu (Multi-Toggle)
function showAiAgentsMenu(chatId, messageId) {
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
      [{ text: '🔙 Kembali', callback_data: 'set_os_debian12' }]
    ]
  };

  bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// Step 5: Extra Tools Selection Menu (Multi-Toggle)
function showToolsMenu(chatId, messageId) {
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
    `💡 _Catatan: Semua tools & browser (Chrome, Chromium, Firefox, Brave, VS Code, AI) juga dapat dipasang kapan saja secara instan via Web Dashboard 1-Klik!_`;

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
      [{ text: '🔙 Kembali', callback_data: 'step_goto_tools' }]
    ]
  };

  bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// Step 6: Password Menu
function showPasswordMenu(chatId, messageId) {
  const text = `🔐 *Pengaturan Password Root VPS*\n\n` +
    `Pilih metode pembuatan password root untuk login SSH & Web Dashboard:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🎲 Buat Password Acak Otomatis (Aman & Cepat)', callback_data: 'pass_auto_gen' }],
      [{ text: '✍️ Input Password Manual', callback_data: 'pass_manual_input' }],
      [{ text: '🔙 Kembali ke Pilihan Tools', callback_data: 'step_goto_tools' }]
    ]
  };

  bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: keyboard });
}

// Step 7: Summary Confirmation View
function showSummaryMenu(chatId, messageId) {
  const state = getUserState(chatId);
  const data = state.data;

  // Compile active AI list
  const activeAi = [];
  if (data.aiAgents.claude) activeAi.push('Claude Code');
  if (data.aiAgents.agy) activeAi.push('Antigravity CLI (agy)');
  if (data.aiAgents.aider) activeAi.push('Aider');

  // Compile active Tools list
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
    `⏳ *Estimasi Pembuatan:* \`Paling cepat ~5 menit, paling lama ~15 menit\`\n` +
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

  safeEditMessage(chatId, messageId, text, { reply_markup: keyboard });
}

// -------------------------------------------------------------
// Message Listener (Handles Manual Inputs)
// -------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  if (text.startsWith('/')) return;

  const state = getUserState(chatId);

  // Step 1 input: Railway Token
  if (state.step === 'AWAIT_TOKEN') {
    const loadingMsg = await bot.sendMessage(chatId, '⏳ *Memverifikasi token ke Railway API...*', { parse_mode: 'Markdown' });
    try {
      const user = await railway.validateToken(text);
      db.saveUser(chatId, {
        username: msg.from.username || null,
        first_name: msg.from.first_name || null,
        railway_token: text,
        railway_user_name: user.name || 'Railway User',
        railway_email: user.email || 'Active API Token',
      });
      state.step = 'IDLE';
      state.data.railwayToken = text;
      state.data.railwayUser = user;
      db.saveSession(chatId, state);

      const credits = user.billingDetails?.availableCredits != null ? `$${parseFloat(user.billingDetails.availableCredits).toFixed(2)}` : '$5.00 (Trial)';

      await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      const successMsg = await bot.sendMessage(
        chatId,
        `✅ *Railway Token Berhasil Disimpan Permanen!*\n\n` +
        `👤 *Nama Akun:* ${user.name || 'User'}\n` +
        `📧 *Status:* \`${user.email}\`\n` +
        `💰 *Credit Tersedia:* \`${credits}\`\n\n` +
        `_Token Anda tersimpan di Database, tidak perlu input token lagi untuk deploy berikutnya._\n\n` +
        `Sekarang mari pilih konfigurasi VPS Anda:`,
        { parse_mode: 'Markdown' }
      );
      return showOsMenu(chatId, successMsg.message_id);
    } catch (err) {
      return bot.editMessageText(`❌ *Token Railway tidak valid!*\n\n_Detail: ${err.message}_\n\nSilakan periksa kembali token di [railway.com/account/tokens](https://railway.com/account/tokens) dan kirim ulang:`, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      });
    }
  }

  // Custom Docker Base OS Input
  if (state.step === 'AWAIT_CUSTOM_OS') {
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ *Nama Docker image tidak valid.* Contoh: `ubuntu:24.04` atau `debian:12`');
    }
    state.data.os = text;
    state.data.osName = `Custom Container (${text})`;
    state.step = 'IDLE';
    db.saveSession(chatId, state);

    const sentMsg = await bot.sendMessage(chatId, `✅ *Base OS berhasil dipilih:* \`${text}\``, { parse_mode: 'Markdown' });
    return showNodeMenu(chatId, sentMsg.message_id);
  }

  // Custom Docker Base OS Input for Reinstall OS
  if (state.step === 'AWAIT_REINSTALL_CUSTOM_OS') {
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ *Nama Docker image tidak valid.* Contoh: `ubuntu:24.04` atau `debian:12`');
    }
    const projectId = state.data.reinstallProjectId;
    state.data.reinstallCustomImage = text;
    state.step = 'IDLE';
    db.saveSession(chatId, state);

    const sentMsg = await bot.sendMessage(chatId, `✅ *Base OS Reinstall dipilih:* \`${text}\``, { parse_mode: 'Markdown' });
    return handleReinstallConfirm(chatId, sentMsg.message_id, projectId, 'custom', `Custom (${text})`);
  }

  // Manual Password input
  if (state.step === 'AWAIT_PASSWORD_MANUAL') {
    if (text.length < 6) {
      return bot.sendMessage(chatId, '⚠️ *Password terlalu pendek.* Masukkan minimal 6 karakter:');
    }
    state.data.password = text;
    state.step = 'IDLE';
    db.saveSession(chatId, state);
    const sentMsg = await bot.sendMessage(chatId, '✅ *Password disimpan.*', { parse_mode: 'Markdown' });
    return showSummaryMenu(chatId, sentMsg.message_id);
  }

  // Handle Natural Language & Text Inquiries
  const lower = text.toLowerCase();
  if (lower.includes('profil') || lower.includes('profile') || lower.includes('akun') || lower.includes('status') || lower.includes('login')) {
    return handleShowProfile(chatId);
  }
  if (lower === 'list' || lower.includes('list vps') || lower.includes('vps saya') || lower.includes('vps aktif')) {
    return handleListProjects(chatId);
  }
  if (lower.includes('reinstall') || lower.includes('ganti os') || lower.includes('reos') || lower.includes('instal ulang')) {
    return handleListProjects(chatId);
  }
  if (lower.includes('katalog') || lower.includes('catalog')) {
    return sendCatalogOverview(chatId);
  }
  if (lower.includes('next os') || lower === 'os') {
    return showOsMenu(chatId, null, 2);
  }
  if (lower.includes('apps') || lower.includes('aplikasi')) {
    return sendAppsCatalog(chatId);
  }
  if (lower === 'menu' || lower === 'start' || lower === 'bantuan' || lower === 'help') {
    return sendMainMenu(chatId, msg.from?.first_name || 'User');
  }
});

// -------------------------------------------------------------
// Deployment Execution Handler
// -------------------------------------------------------------
async function executeFullVpsDeployment(chatId, messageId) {
  const state = getUserState(chatId);
  const data = state.data;
  let { railwayToken, password, os, nodeVersion, aiAgents, extraTools } = data;
  const vpsName = 'r-server';

  // 1. Robust Token Validation & Auto-Recovery
  const sysToken = db.getSystemRailwayToken();
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

  // Guard: If token is still missing/invalid, redirect to login prompt
  if (!validUser || !railwayToken) {
    return promptTokenInput(chatId, messageId);
  }

  // Auto-generate password if none set
  if (!password) {
    password = generatePassword(12);
    state.data.password = password;
    db.saveSession(chatId, state);
  }

  // Build list of extra apt packages to install
  const aptPackages = [];
  if (extraTools.chrome) aptPackages.push('chromium');
  if (extraTools.ffmpeg) aptPackages.push('ffmpeg');
  if (extraTools.fastfetch) aptPackages.push('neofetch');
  if (extraTools.nginx) aptPackages.push('nginx');
  if (extraTools.redis) aptPackages.push('redis-tools');
  if (extraTools.python_dev) aptPackages.push('python3-pip', 'python3-dev');

  const extraPackagesStr = aptPackages.join(' ');
  const installAiStr = Object.keys(aiAgents).filter(k => aiAgents[k]).join(' ');

  await bot.editMessageText(`🚀 *Memulai Pembuatan VPS di Railway...*\n\n⏳ [1/5] Membuat project baru...`, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown'
  }).catch(() => {});

  try {
    // 1. Create Railway Project with Dynamic OS Description
    const projectDesc = `${data.osName || 'Linux'} SSH Server & Web Dashboard deployed via Telegram Bot`;
    const project = await railway.createProject(railwayToken, vpsName, projectDesc);
    const { projectId, environmentId } = project;

    await bot.editMessageText(
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Project ID: \`${projectId}\`\n` +
      `⏳ [2/5] Menghubungkan template OS (\`${GITHUB_REPO}\`)...`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    ).catch(() => {});

    // 2. Create Service from GitHub Repo
    const service = await railway.createServiceFromRepo(railwayToken, projectId, GITHUB_REPO, 'main');
    const serviceId = service.id;

    await bot.editMessageText(
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Project & Service Dibuat.\n` +
      `⏳ [3/5] Mengatur Environment Variables (${data.osName || 'Linux'}), Node v${nodeVersion}, AI & Tools...`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    ).catch(() => {});

    // 3. Set Variables
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'OS_NAME', data.osName || 'Linux');
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'BASE_IMAGE', data.os || 'debian:12');
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'ROOT_PASSWORD', password);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'SSH_PASSWORD', password);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'SSH_USERNAME', 'root');
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'PORT', '8080');
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'NODE_VERSION', nodeVersion);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'EXTRA_PACKAGES', extraPackagesStr);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'INSTALL_AI', installAiStr);
    await railway.setVariable(railwayToken, projectId, environmentId, serviceId, 'ENABLE_XRDP', extraTools.xrdp ? 'true' : 'false');

    await bot.editMessageText(
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Environment Variables diset.\n` +
      `⏳ [4/5] Membuka TCP Proxy Port 22 (SSH) & Domain Web Dashboard...`,
      { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
    ).catch(() => {});

    // 4. Create TCP Proxy & Domain
    await railway.createTcpProxy(railwayToken, environmentId, serviceId, 22);
    if (extraTools.xrdp) {
      await railway.createTcpProxy(railwayToken, environmentId, serviceId, 3389);
    }
    await railway.createServiceDomain(railwayToken, environmentId, serviceId);
    await railway.triggerRedeploy(railwayToken, environmentId, serviceId);

    await safeEditMessage(
      chatId,
      messageId,
      `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
      `✅ Jaringan & Domain Web siap.\n` +
      `⏳ [5/5] Membangun container ${data.osName || 'Linux'} & OpenSSH...\n\n` +
      `⏱️ _Estimasi waktu pembuatan: Paling cepat ~5 menit, paling lama ~15 menit. Mohon tunggu proses build selesai..._`
    );

    // 5. Poll Deployment Status with Live Dynamic Progress (Up to 15 mins)
    let attempts = 0;
    const maxAttempts = 180; // 180 * 5s = 900s (15 menit)
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
          await safeEditMessage(
            chatId,
            messageId,
            `🚀 *Memproses VPS [${vpsName}]...*\n\n` +
            `✅ Jaringan & Domain Web siap.\n` +
            `⏳ [5/5] Membangun container ${data.osName || 'Linux'} & OpenSSH... (${timeStr})\n` +
            `📊 Status Container: \`${status}\`\n\n` +
            `⏱️ _Estimasi waktu pembuatan: Paling cepat ~5 menit, paling lama ~15 menit. Mohon tunggu..._`
          ).catch(() => {});
        }

        if (status === 'SUCCESS') break;
        if (status === 'FAILED' || status === 'CRASHED') {
          break;
        }
      } catch (errPoll) {
        console.error('Polling error:', errPoll.message);
      }
    }

    // 6. Fetch final Networking details
    const netInfo = await railway.getServiceNetworking(railwayToken, projectId);
    const tcpHost = netInfo.sshHost || 'altaria.proxy.rlwy.net';
    const tcpIp = netInfo.sshIp || tcpHost;
    const tcpPort = netInfo.sshPort || '22000';
    const rdpHost = netInfo.rdpHost || tcpHost;
    const rdpIp = netInfo.rdpIp || tcpIp;
    const rdpPort = netInfo.rdpPort || '3389';
    const webUrl = netInfo.domain ? `https://${netInfo.domain}` : 'https://r-server-production-3b83.up.railway.app';

    // 7. Record Deployment in Database
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

    // 8. Send Final Card
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
    try {
      await bot.editMessageText(successText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    } catch (editErr) {
      await bot.sendMessage(chatId, successText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
        disable_web_page_preview: true
      }).catch(() => {});
    }

  } catch (err) {
    resetCreateData(chatId);
    bot.editMessageText(
      `❌ *Gagal Membuat VPS!*\n\n_Detail Error: ${err.message}_\n\nSilakan coba lagi dari menu utama.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]]
        }
      }
    ).catch(() => {});
  }
}

// -------------------------------------------------------------
// /list & /balance Handlers
// -------------------------------------------------------------
async function handleListProjects(chatId, messageId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken;
  const sysToken = db.getSystemRailwayToken();

  let loadMsg;
  if (messageId) {
    await bot.editMessageText('⏳ *Mengambil daftar VPS & data login lengkap dari Railway...*', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    }).catch(() => {});
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await bot.sendMessage(chatId, '⏳ *Mengambil daftar VPS & data login lengkap dari Railway...*', { parse_mode: 'Markdown' });
  }

  // Auto token recovery if expired
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
    return bot.editMessageText(
      `⚠️ *Sesi Akun Railway Tidak Valid atau Kadaluwarsa*\n\n` +
      `Koneksi ke Railway mengembalikan \`Not Authorized\`.\n` +
      `Silakan klik tombol di bawah untuk login akun Railway Anda (1-Klik):`,
      {
        chat_id: chatId,
        message_id: loadMsg.message_id,
        parse_mode: 'Markdown',
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
      return bot.editMessageText('📋 *Tidak ada project/VPS aktif di akun Railway Anda.*', {
        chat_id: chatId,
        message_id: loadMsg.message_id,
        parse_mode: 'Markdown',
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

    await safeEditMessage(chatId, loadMsg.message_id, text, {
      reply_markup: { inline_keyboard: buttons },
      disable_web_page_preview: true,
    });
  } catch (err) {
    safeEditMessage(chatId, loadMsg.message_id, `❌ *Gagal mengambil data project:*\n_${err.message}_`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]] }
    });
  }
}

// -------------------------------------------------------------
// Reinstall / Ganti OS Feature Handlers
// -------------------------------------------------------------

async function handleReinstallOsMenu(chatId, messageId, projectId, page = 1) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return promptTokenInput(chatId, messageId);
  }

  let loadMsg;
  if (messageId) {
    await bot.editMessageText('⏳ *Memuat data VPS untuk Reinstall OS...*', {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    }).catch(() => {});
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await bot.sendMessage(chatId, '⏳ *Memuat data VPS untuk Reinstall OS...*', { parse_mode: 'Markdown' });
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const currentOs = details?.osName || savedDep?.os_name || 'Debian 12 (Bookworm)';

  const text = `💿 *REINSTALL / GANTI SISTEM OPERASI (OS)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `🐧 *OS Saat Ini:* *${currentOs}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *PERINGATAN PENTING (DATA AKAN HILANG):*\n` +
    `• *Reinstall OS akan MENGHAPUS SEMUA DATA & FILE di dalam VPS ini!* (Data lama hilang bersih / fresh install).\n` +
    `• Pastikan Anda sudah mem-backup file atau script penting.\n` +
    `• IP Address, Port SSH, Root Password & Web Dashboard *tetap sama & aman*.\n\n` +
    `Pilih kategori distribusi Linux baru untuk VPS ini:`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🍥 Debian Family (5 Distros)', callback_data: `rcat_${projectId}_debian` },
        { text: '🏹 Arch Linux (Rolling)', callback_data: `rcat_${projectId}_arch` }
      ],
      [
        { text: '🟠 Ubuntu Linux (6 Distros)', callback_data: `rcat_${projectId}_ubuntu` },
        { text: '🐉 Kali Linux (All Versions)', callback_data: `rcat_${projectId}_kali` }
      ],
      [
        { text: '🐳 Custom Docker Image OS', callback_data: `rcust_${projectId}` }
      ],
      [
        { text: '🔙 Batal', callback_data: 'cmd_list' }
      ]
    ]
  };

  return safeEditMessage(chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

async function handleReinstallOsCategory(chatId, messageId, projectId, categoryKey) {
  const cat = OS_CATALOG[categoryKey];
  if (!cat) return handleReinstallOsMenu(chatId, messageId, projectId);

  const state = getUserState(chatId);
  const token = state.data?.railwayToken || db.getSystemRailwayToken();
  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const projectName = details?.name || 'r-server';

  const text = `${cat.icon} *REINSTALL OS: PILIH RILIS ${cat.name.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `⚠️ *PERINGATAN: Reinstall = SEMUA DATA LAMA AKAN HILANG / TERHAPUS!* \n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih versi distro yang ingin diinstal ulang ke VPS ini:`;

  const buttons = [];
  cat.distros.forEach((d) => {
    const star = d.recommended ? ' ⭐' : '';
    buttons.push([{ text: `${d.name}${star}`, callback_data: `rpick_${projectId}_${d.code}` }]);
  });

  buttons.push([{ text: '🔙 Kembali ke Kategori OS', callback_data: `rmenu_${projectId}` }]);

  safeEditMessage(chatId, messageId, text, { reply_markup: { inline_keyboard: buttons } });
}

function promptReinstallCustomOsInput(chatId, messageId, projectId) {
  const state = getUserState(chatId);
  state.step = 'AWAIT_REINSTALL_CUSTOM_OS';
  state.data.reinstallProjectId = projectId;
  db.saveSession(chatId, state);

  const text = `🐳 *REINSTALL OS: INPUT CUSTOM DOCKER IMAGE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 *Target VPS:* \`${projectId}\`\n` +
    `⚠️ *PERINGATAN: Reinstall = SEMUA DATA VPS AKAN TERHAPUS BERSIH (HILANG)!*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Ketik nama Docker base image baru yang ingin Anda pasang di container VPS ini:\n\n` +
    `*Contoh:* \n` +
    `• \`debian:12\` atau \`debian:11\`\n` +
    `• \`ubuntu:24.04\` atau \`ubuntu:22.04\`\n` +
    `• \`archlinux:latest\`\n` +
    `• \`kalilinux/kali-rolling\`\n\n` +
    `_Silakan balas pesan ini dengan nama image Docker:_`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Batal & Kembali', callback_data: `rmenu_${projectId}` }]
    ]
  };

  if (messageId) {
    safeEditMessage(chatId, messageId, text, { reply_markup: keyboard });
  } else {
    safeSendMessage(chatId, text, { reply_markup: keyboard });
  }
}

async function handleReinstallConfirm(chatId, messageId, projectId, distroCodeOrId, customName = null) {
  const state = getUserState(chatId);
  const token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return promptTokenInput(chatId, messageId);

  let distro = getDistroByCode(distroCodeOrId);
  if (!distro) {
    if (distroCodeOrId === 'custom' && state.data.reinstallCustomImage) {
      distro = { id: state.data.reinstallCustomImage, name: customName || `Custom (${state.data.reinstallCustomImage})` };
    } else {
      distro = findDistro(distroCodeOrId);
      if (customName) distro.name = customName;
    }
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const currentOs = details?.osName || savedDep?.os_name || 'Debian 12 (Bookworm)';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || 'altaria.proxy.rlwy.net';
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';

  const text = `🚨 *KONFIRMASI REINSTALL SISTEM OPERASI (OS)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\` (\`${projectId}\`)\n` +
    `🐧 *OS Saat Ini:* \`${currentOs}\`\n` +
    `🚀 *OS Baru:* *${distro.name}* (\`${distro.id}\`)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *PERHATIAN: REINSTALL = SEMUA DATA LAMA AKAN HILANG!*\n` +
    `• Semua file, script, tools & database di VPS ini akan **TERHAPUS BERSIH (HILANG TOTAL)**.\n` +
    `• Container VPS akan dibangun ulang dari awal (*fresh state*) dengan OS baru.\n` +
    `• Host Domain (\`${sshHost}\`), Port SSH (\`${sshPort}\`), dan Web Monitor **TETAP SAMA**.\n` +
    `• Password root tetap aman.\n\n` +
    `❓ *Apakah Anda yakin ingin menghapus data & melakukan reinstall sekarang?*`;

  const doCallback = distroCodeOrId === 'custom' ? `rdo_${projectId}_custom` : `rdo_${projectId}_${distro.code || distro.id}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `🚀 Ya, Hapus Data & Reinstall Sekarang!`, callback_data: doCallback }],
      [{ text: '⬅️ Pilih OS Lain', callback_data: `rmenu_${projectId}` }],
      [{ text: '❌ Batalkan', callback_data: 'cmd_list' }]
    ]
  };

  safeEditMessage(chatId, messageId, text, { reply_markup: keyboard });
}

async function executeReinstallOs(chatId, messageId, projectId, distroCodeOrId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return promptTokenInput(chatId, messageId);

  let distro = getDistroByCode(distroCodeOrId);
  if (!distro) {
    if (distroCodeOrId === 'custom' && state.data.reinstallCustomImage) {
      distro = { id: state.data.reinstallCustomImage, name: `Custom Container (${state.data.reinstallCustomImage})` };
    } else {
      distro = findDistro(distroCodeOrId);
    }
  }

  const loadMsg = await safeSendMessage(
    chatId,
    `⏳ *MEMULAI PROSES REINSTALL OS...*\n\n` +
    `🖥️ *Target VPS:* \`${projectId}\`\n` +
    `🐧 *OS Baru:* *${distro.name}* (\`${distro.id}\`)\n` +
    `⏳ [1/4] Mengambil konfigurasi project Railway...`
  );

  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment Railway tidak ditemukan.');
    }

    const { environmentId, serviceId } = details;
    const vpsName = details.name || 'r-server';

    await safeEditMessage(
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES REINSTALL OS [${vpsName}]...*\n\n` +
      `🐧 *OS Baru:* *${distro.name}*\n` +
      `⏳ [2/4] Mengatur environment variables OS (\`BASE_IMAGE=${distro.id}\`)...`
    );

    // 1. Update Variables BASE_IMAGE & OS_NAME
    await railway.setVariable(token, projectId, environmentId, serviceId, 'BASE_IMAGE', distro.id);
    await railway.setVariable(token, projectId, environmentId, serviceId, 'OS_NAME', distro.name);

    // 2. Update Project Description
    const newDesc = `${distro.name} SSH Server & Web Dashboard deployed via Telegram Bot`;
    await railway.updateProjectDescription(token, projectId, newDesc).catch(() => {});

    // 3. Update Local DB
    db.updateDeploymentOs(projectId, distro.name);

    await safeEditMessage(
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES REINSTALL OS [${vpsName}]...*\n\n` +
      `🐧 *OS Baru:* *${distro.name}*\n` +
      `⏳ [3/4] Memicu Redeploy container baru di Railway Cloud...`
    );

    // 4. Trigger Redeploy
    await railway.triggerRedeploy(token, environmentId, serviceId);

    // 5. Polling until Redeploy is Ready / Running
    let attempts = 0;
    const maxAttempts = 24; // ~2 minutes
    let status = 'BUILDING';

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      try {
        const statusObj = await railway.getDeploymentStatus(token, environmentId, serviceId);
        status = statusObj?.status || 'BUILDING';

        const elapsedSec = attempts * 5;
        const timeStr = `${elapsedSec}s`;

        if (attempts % 2 === 0 && status !== 'SUCCESS') {
          await safeEditMessage(
            chatId,
            loadMsg.message_id,
            `⏳ *MEMBANGUN ULANG CONTAINER (${distro.name})...*\n\n` +
            `🖥️ *VPS:* \`${vpsName}\`\n` +
            `📊 *Status Build:* \`${status}\` (${timeStr})\n\n` +
            `🔄 _Sedang mendownload base image & mengaktifkan kembali OpenSSH..._`
          ).catch(() => {});
        }

        if (status === 'SUCCESS') break;
        if (status === 'FAILED' || status === 'CRASHED') break;
      } catch (e) {}
    }

    // 6. Fetch refreshed details
    const updatedDetails = await railway.getProjectDetails(token, projectId).catch(() => details);
    const sshHost = updatedDetails?.tcpHost || details.tcpHost || 'altaria.proxy.rlwy.net';
    const sshIp = updatedDetails?.tcpIp || sshHost;
    const sshPort = updatedDetails?.tcpPort || details.tcpPort || '22';
    const password = updatedDetails?.rootPassword || details.rootPassword || 'RamaGans76_';
    const webUrl = updatedDetails?.domain || details.domain || null;

    const successText = `🎉 *REINSTALL OS VPS SELESAI & SUKSES!* 🎉\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🖥️ *Nama VPS:* \`${vpsName}\`\n` +
      `🐧 *OS Baru:* *${distro.name}*\n` +
      `🟢 *Status:* ✅ *Online & Siap Digunakan*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🔑 *DATA LOGIN SSH (Root):*\n` +
      `• *IP Address:* \`${sshIp}\`\n` +
      `• *Host Domain:* \`${sshHost}\`\n` +
      `• *Port SSH:* \`${sshPort}\`\n` +
      `• *User:* \`root\`\n` +
      `• *Password:* \`${password}\`\n\n` +
      (webUrl ? `🌐 *Web Monitor:* ${webUrl}\n\n` : '') +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Quick Connect SSH:*\n` +
      `\`ssh -p ${sshPort} root@${sshIp}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const successButtons = [];
    if (webUrl) {
      successButtons.push([{ text: '🌐 Buka Dashboard VPS', url: webUrl }]);
    }
    successButtons.push([
      { text: '📋 Lihat Semua VPS', callback_data: 'cmd_list' },
      { text: '🏠 Menu Utama', callback_data: 'menu_main' }
    ]);

    await safeEditMessage(chatId, loadMsg.message_id, successText, {
      reply_markup: { inline_keyboard: successButtons },
      disable_web_page_preview: true
    });
  } catch (err) {
    safeEditMessage(chatId, loadMsg.message_id, `❌ *Gagal Reinstall OS VPS:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Kembali ke Daftar VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

async function handleRestartProject(chatId, projectId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return;

  const loadMsg = await safeSendMessage(chatId, `🔄 *Merestart / Redeploy VPS \`${projectId}\`...*`);
  try {
    const details = await railway.getProjectDetails(token, projectId);
    if (!details || !details.environmentId || !details.serviceId) {
      throw new Error('Service atau Environment tidak ditemukan.');
    }
    await railway.triggerRedeploy(token, details.environmentId, details.serviceId);
    safeEditMessage(chatId, loadMsg.message_id, `✅ *VPS [${details.name || projectId}] sedang direstart!* \n\nContainer akan kembali online dalam 10-20 detik.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Lihat Status VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    safeEditMessage(chatId, loadMsg.message_id, `❌ *Gagal restart VPS:* ${err.message}`, {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]] }
    });
  }
}

async function handleCheckBalance(chatId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();

  if (!token) {
    return safeSendMessage(chatId, '⚠️ Silakan klik **Set Token Railway** terlebih dahulu untuk memeriksa saldo.', {
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
      `💵 *Current Balance:* \`${balance}\``;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🚀 Buat VPS Baru', callback_data: 'flow_start_create' }],
        [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
      ]
    };

    safeSendMessage(chatId, text, { reply_markup: keyboard });
  } catch (err) {
    safeSendMessage(chatId, `❌ *Gagal memeriksa saldo:* ${err.message}`);
  }
}

async function handleDeleteProject(chatId, projectId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return;

  bot.sendMessage(chatId, `⏳ *Menghapus project \`${projectId}\`...*`, { parse_mode: 'Markdown' });
  try {
    await railway.deleteProject(token, projectId);
    bot.sendMessage(chatId, `✅ *Project \`${projectId}\` berhasil dihapus secara permanen dari Railway.*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Lihat Sisa VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  } catch (err) {
    bot.sendMessage(chatId, `❌ *Gagal menghapus project:* ${err.message}`, { parse_mode: 'Markdown' });
  }
}

// Commands
bot.onText(/\/login/, (msg) => promptTokenInput(msg.chat.id));
bot.onText(/\/create/, (msg) => {
  resetCreateData(msg.chat.id);
  const state = getUserState(msg.chat.id);
  if (!state.data?.railwayToken) {
    return promptTokenInput(msg.chat.id);
  }
  return showOsMenu(msg.chat.id);
});
bot.onText(/\/list/, (msg) => handleListProjects(msg.chat.id));
bot.onText(/\/balance/, (msg) => handleCheckBalance(msg.chat.id));

function sendTokenTutorial(chatId) {
  const text = `🔑 *Cara Mendapatkan Railway API Token:*\n\n` +
    `1. Buka browser dan login ke akun Railway Anda: [railway.com](https://railway.com)\n` +
    `2. Klik profil akun di pojok kanan atas ➔ pilih *Account Settings*.\n` +
    `3. Pilih menu **Tokens** (atau buka [railway.com/account/tokens](https://railway.com/account/tokens)).\n` +
    `4. Beri nama token (misal: \`telegram-bot\`) ➔ klik **Create**.\n` +
    `5. Copy token yang muncul lalu kirimkan ke bot ini.`;

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌐 Buka railway.com/account/tokens', url: 'https://railway.com/account/tokens' }],
        [{ text: '📥 Input Token Sekarang', callback_data: 'cmd_set_token' }]
      ]
    }
  });
}

bot.on('polling_error', (error) => {
  if (error.code !== 'ETELEGRAM') {
    console.error('Polling Error:', error.message);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('🤖 [R-SERVER VPS Bot] Started and listening for Telegram events...');
