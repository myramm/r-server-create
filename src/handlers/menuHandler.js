const db = require('../services/database');
const railway = require('../services/railway');
const cliAuth = require('../services/cliAuth');
const { OS_CATALOG } = require('../config/osCatalog');
const { safeSendMessage, safeEditMessage, getUserState } = require('../utils/telegram');

function sendMainMenu(bot, chatId, name = 'User') {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;
  const isTokenSaved = Boolean(token);
  const userName = state.data?.railwayUser?.name || 'R BOT';
  
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

  safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
}

async function handleShowProfile(bot, chatId, messageId) {
  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Memeriksa profil dan status akun Railway...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Memeriksa profil dan status akun Railway...*');
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
    return safeEditMessage(bot, chatId, loadMsg.message_id, notLoggedInText, { reply_markup: kb });
  }

  const credits = user.billingDetails?.availableCredits != null ? `$${parseFloat(user.billingDetails.availableCredits).toFixed(2)}` : '$5.00 (Trial)';
  const usage = user.billingDetails?.currentBalance != null ? `$${parseFloat(user.billingDetails.currentBalance).toFixed(2)}` : '$0.00';
  const projectsCount = user.projectsCount || 0;

  const text = `👤 *PROFIL & STATUS AKUN RAILWAY*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🟢 *Status Akun:* Terhubung & Aktif\n` +
    `👤 *Nama Pengguna:* *${user.name || 'User'}*\n` +
    `📧 *Email:* \`${user.email || '-'}\`\n` +
    `💰 *Available Credits:* \`${credits}\`\n` +
    `💵 *Current Usage:* \`${usage}\`\n` +
    `📁 *Jumlah Project:* \`${projectsCount}\`\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 *Tips:* Kuota credit trial $5.00 me-refresh setiap 24 jam untuk menjalankan server VPS Anda!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Buat VPS Baru', callback_data: 'flow_start_create' }],
      [{ text: '📋 Kelola VPS Aktif', callback_data: 'cmd_list' }],
      [{ text: '🔄 Ganti / Login Akun Lain', callback_data: 'cmd_set_token' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  safeEditMessage(bot, chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

function sendCatalogOverview(bot, chatId) {
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

  safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
}

function sendAppsCatalog(bot, chatId) {
  const text = `🖥️ *XRDP LINUX DESKTOP - KATALOG SOFTWARE & APPS (40 KATEGORI)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Daftar software & tools yang dapat dipasang di Linux Desktop (XRDP + XFCE4) & Web Dashboard:\n\n` +
    `1. 🌐 *Web Browsers:* Chrome, Chromium, Firefox ESR, Brave, Edge, Falkon, Midori, Tor Browser\n` +
    `2. 📁 *File Managers:* Thunar, Nautilus, Dolphin, PCManFM, Double Commander, mc, Ranger\n` +
    `3. 📝 *Code Editors:* VS Code, code-server, Geany, Mousepad, Gedit, Kate, Nano, Vim, Neovim, Micro, Helix\n` +
    `4. 🤖 *AI Coding Agents:* Claude Code (\`claude\`), Antigravity CLI (\`agy\`), Aider AI (\`aider\`), JupyterLab\n` +
    `5. 🐍 *Python Dev:* Python 3, PIP, venv, Poetry, UV, Pipx, FastAPI, Flask, Django, NumPy, Pandas, OpenCV\n` +
    `6. ⚡ *Node.js & JS:* Node.js LTS, npm, Bun, Deno, pnpm, Yarn, TypeScript, PM2, Vite, Nodemon\n` +
    `7. 💻 *Other Languages:* Rust & Cargo, Go, Java OpenJDK, Maven, Gradle, PHP & Composer, C/C++ GCC/CMake\n` +
    `8. 🎬 *Media Players:* VLC Media Player, MPV, Celluloid, Audacious, Rhythmbox\n` +
    `9. 🎞️ *Audio/Video Processing:* FFmpeg, ffprobe, YT-DLP, HandBrake, MediaInfo, Audacity, SoX\n` +
    `10. 🎨 *Graphics & 3D:* GIMP, Inkscape, ImageMagick, Blender 3D, cwebp, optipng, jpegoptim\n` +
    `11. 📄 *Office & Documents:* LibreOffice (Writer, Calc, Impress), Evince PDF, Pandoc, Poppler\n` +
    `12. 📦 *Compression:* 7-Zip, p7zip, zip, unzip, tar, gzip, bzip2, xz, zstd, unrar\n` +
    `13. 💻 *Terminal & Shell:* XFCE Terminal, Alacritty, Tmux, Zsh, Fish, Starship, FZF, Bat, Eza, Ripgrep\n` +
    `14. 🌐 *Network & Transfer:* curl, wget, aria2, rclone, rsync, OpenSSH, Nmap, Wireshark/tshark, iperf3\n` +
    `15. 🗄️ *Databases & Clients:* SQLite & SQLiteBrowser, Redis, PostgreSQL Client, MySQL/MariaDB Client\n` +
    `16. ☁️ *DevOps & Containers:* Railway CLI, Docker CLI, Docker Compose, Podman, GitHub CLI (\`gh\`)\n` +
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

  safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
}

async function promptTokenInput(bot, chatId, messageId) {
  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Menyiapkan sesi login 1-Klik Railway...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Menyiapkan sesi login 1-Klik Railway...*');
  }

  cliAuth.startCliLogin(
    chatId,
    async ({ userCode, activateUrl }) => {
      const text = `🔐 *LOGIN AKUN RAILWAY (1-CLICK ACTIVATE)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Aktivasi akun Railway Anda dengan sangat mudah & instan tanpa perlu cari token manual:\n\n` +
        `👉 *Cara 1 (Rekomendasi - Sekali Klik):*\n` +
        `Klik tombol **'🚀 Sign in with 1-Click'** di bawah untuk langsung menyetujui di browser.\n\n` +
        `👉 *Cara 2 (Input Kode Manual):*\n` +
        `1. Buka browser: railway.com/activate\n` +
        `2. Masukkan kode verifikasi:\n` +
        `🔑 https://railway.com/activate?user\\_code=${userCode}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏳ _Menunggu konfirmasi login dari browser Anda (otomatis terdeteksi)..._`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🚀 Sign in with 1-Click (Buka Browser)', url: activateUrl }],
          [{ text: '🔑 Input Token API Manual (Alternatif)', callback_data: 'prompt_token_manual' }],
          [{ text: '🔙 Batalkan & Kembali', callback_data: 'cancel_cli_auth' }]
        ]
      };

      await safeEditMessage(bot, chatId, loadMsg.message_id, text, {
        reply_markup: keyboard,
        disable_web_page_preview: true
      });
    },
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

        return safeEditMessage(bot, chatId, loadMsg.message_id, successText, { reply_markup: keyboard });
      } catch (e) {
        safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal memvalidasi akun setelah login:* ${e.message}`, {
          reply_markup: { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]] }
        });
      }
    },
    (err) => {
      safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Sesi login dihentikan:* ${err.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Login Lagi', callback_data: 'cmd_set_token' }],
            [{ text: '🔑 Input Token Manual', callback_data: 'prompt_token_manual' }],
            [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
          ]
        }
      });
    }
  );
}

function promptManualTokenInput(bot, chatId, messageId) {
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
    safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

function sendTutorialToken(bot, chatId) {
  const text = `📖 *Panduan Mendapatkan Railway API Token Manual:*\n\n` +
    `1. Buka browser dan login ke akun Railway Anda di [railway.com](https://railway.com)\n` +
    `2. Buka menu Pengaturan Akun: [railway.com/account/tokens](https://railway.com/account/tokens)\n` +
    `3. Klik tombol **Create Token** / **New Token**.\n` +
    `4. Beri nama token (misal: \`telegram-bot\`) dan klik **Create**.\n` +
    `5. Copy seluruh isi token yang muncul.\n` +
    `6. Masukkan token tersebut ke bot ini melalui menu **🔑 Set Token Railway**.\n\n` +
    `_Token Anda akan disimpan dengan aman untuk membuat & mengelola project VPS._`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔑 Set Token Sekarang', callback_data: 'cmd_set_token' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
    ]
  };

  safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
}

module.exports = {
  sendMainMenu,
  handleShowProfile,
  sendCatalogOverview,
  sendAppsCatalog,
  promptTokenInput,
  promptManualTokenInput,
  sendTutorialToken,
};
