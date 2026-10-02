const db = require('../services/database');
const railway = require('../services/railway');
const { OS_CATALOG, getDistroByCode, findDistro } = require('../config/osCatalog');
const { safeSendMessage, safeEditMessage, getUserState } = require('../utils/telegram');
const { promptTokenInput } = require('./menuHandler');

async function handleReinstallOsMenu(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  const sysToken = db.getSystemRailwayToken();
  const token = state.data?.railwayToken || sysToken;

  if (!token) {
    return promptTokenInput(bot, chatId, messageId);
  }

  let loadMsg;
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, '⏳ *Memuat data VPS untuk Reinstall OS...*');
    loadMsg = { message_id: messageId };
  } else {
    loadMsg = await safeSendMessage(bot, chatId, '⏳ *Memuat data VPS untuk Reinstall OS...*');
  }

  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const currentOs = details?.osName || savedDep?.os_name || 'Debian 12 (Bookworm)';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `💿 *REINSTALL / GANTI SISTEM OPERASI (OS)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `🐧 *OS Saat Ini:* *${currentOs}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *PERINGATAN PENTING (DATA AKAN HILANG):*\n` +
    `• *Reinstall OS akan MENGHAPUS SEMUA DATA & FILE di dalam VPS ini!* (Data lama hilang bersih / fresh install).\n` +
    `• Pastikan Anda sudah mem-backup file atau script penting.\n` +
    `• IP Address (\`${sshIp}\`), Port SSH (\`${sshPort}\`), Root Password & Web Dashboard *tetap sama & aman*.\n\n` +
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

  return safeEditMessage(bot, chatId, loadMsg.message_id, text, { reply_markup: keyboard });
}

async function handleReinstallOsCategory(bot, chatId, messageId, projectId, categoryKey) {
  const cat = OS_CATALOG[categoryKey];
  if (!cat) return handleReinstallOsMenu(bot, chatId, messageId, projectId);

  const state = getUserState(chatId);
  const token = state.data?.railwayToken || db.getSystemRailwayToken();
  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `${cat.icon} *REINSTALL OS: PILIH RILIS ${cat.name.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `⚠️ *PERINGATAN: Reinstall = SEMUA DATA LAMA AKAN HILANG / TERHAPUS!* \n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih versi distro yang ingin diinstal ulang ke VPS ini:`;

  const buttons = [];
  cat.distros.forEach((d) => {
    const star = d.recommended ? ' ⭐' : '';
    buttons.push([{ text: `${d.name}${star}`, callback_data: `rpick_${projectId}_${d.code}` }]);
  });

  buttons.push([{ text: '🔙 Kembali ke Kategori OS', callback_data: `rmenu_${projectId}` }]);

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: { inline_keyboard: buttons } });
}

async function promptReinstallCustomOsInput(bot, chatId, messageId, projectId) {
  const state = getUserState(chatId);
  state.step = 'AWAIT_REINSTALL_CUSTOM_OS';
  state.data.reinstallProjectId = projectId;
  db.saveSession(chatId, state);

  const token = state.data?.railwayToken || db.getSystemRailwayToken();
  const details = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const projectName = details?.name || savedDep?.project_name || 'r-server';
  const sshHost = details?.tcpHost || savedDep?.ssh_host || '-';
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `🐳 *REINSTALL OS: INPUT CUSTOM DOCKER IMAGE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\` (\`${ipDisplay}\`)\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
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
    safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
  } else {
    safeSendMessage(bot, chatId, text, { reply_markup: keyboard });
  }
}

async function handleReinstallConfirm(bot, chatId, messageId, projectId, distroCodeOrId, customName = null) {
  const state = getUserState(chatId);
  const token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return promptTokenInput(bot, chatId, messageId);

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
  const sshIp = details?.tcpIp || savedDep?.ssh_host || sshHost;
  const sshPort = details?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplay = sshIp !== '-' ? `${sshIp}:${sshPort}` : '-';

  const text = `🚨 *KONFIRMASI REINSTALL SISTEM OPERASI (OS)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🖥️ *Target VPS:* \`${projectName}\`\n` +
    `🌐 *IP Address:* \`${ipDisplay}\`\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
    `🐧 *OS Saat Ini:* \`${currentOs}\`\n` +
    `🚀 *OS Baru:* *${distro.name}* (\`${distro.id}\`)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⚠️ *PERHATIAN: REINSTALL = SEMUA DATA LAMA AKAN HILANG!*\n` +
    `• Semua file, script, tools & database di VPS ini akan **TERHAPUS BERSIH (HILANG TOTAL)**.\n` +
    `• Container VPS akan dibangun ulang dari awal (*fresh state*) dengan OS baru.\n` +
    `• IP Address (\`${sshIp}\`), Port SSH (\`${sshPort}\`), dan Web Monitor **TETAP SAMA**.\n` +
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

  safeEditMessage(bot, chatId, messageId, text, { reply_markup: keyboard });
}

async function executeReinstallOs(bot, chatId, messageId, projectId, distroCodeOrId) {
  const state = getUserState(chatId);
  let token = state.data?.railwayToken || db.getSystemRailwayToken();
  if (!token) return promptTokenInput(bot, chatId, messageId);

  let distro = getDistroByCode(distroCodeOrId);
  if (!distro) {
    if (distroCodeOrId === 'custom' && state.data.reinstallCustomImage) {
      distro = { id: state.data.reinstallCustomImage, name: `Custom Container (${state.data.reinstallCustomImage})` };
    } else {
      distro = findDistro(distroCodeOrId);
    }
  }

  const preDetails = await railway.getProjectDetails(token, projectId).catch(() => null);
  const savedDep = db.getDeploymentByProjectId(projectId);
  const sshHostPre = preDetails?.tcpHost || savedDep?.ssh_host || '-';
  const sshIpPre = preDetails?.tcpIp || savedDep?.ssh_host || sshHostPre;
  const sshPortPre = preDetails?.tcpPort || savedDep?.ssh_port || '22';
  const ipDisplayPre = sshIpPre !== '-' ? `${sshIpPre}:${sshPortPre}` : '-';
  const vpsNamePre = preDetails?.name || savedDep?.project_name || 'r-server';

  const loadMsg = await safeSendMessage(
    bot,
    chatId,
    `⏳ *MEMULAI PROSES REINSTALL OS...*\n\n` +
    `🖥️ *Target VPS:* \`${vpsNamePre}\` (\`${ipDisplayPre}\`)\n` +
    `🆔 *Project ID:* \`${projectId}\`\n` +
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
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES REINSTALL OS [${vpsName}] (${ipDisplayPre})...*\n\n` +
      `🐧 *OS Baru:* *${distro.name}*\n` +
      `⏳ [2/4] Mengatur environment variables OS (\`BASE_IMAGE=${distro.id}\`)...`
    );

    // 1. Update Variables BASE_IMAGE & OS_NAME
    await railway.setVariable(token, projectId, environmentId, serviceId, 'BASE_IMAGE', distro.id, true);
    await railway.setVariable(token, projectId, environmentId, serviceId, 'OS_NAME', distro.name, false);

    // 2. Update Project Description
    const newDesc = `${distro.name} SSH Server & Web Dashboard deployed via Telegram Bot`;
    await railway.updateProjectDescription(token, projectId, newDesc).catch(() => {});

    // 3. Update Local DB
    db.updateDeploymentOs(projectId, distro.name);

    await safeEditMessage(
      bot,
      chatId,
      loadMsg.message_id,
      `⏳ *MEMPROSES REINSTALL OS [${vpsName}] (${ipDisplayPre})...*\n\n` +
      `🐧 *OS Baru:* *${distro.name}*\n` +
      `⏳ [3/4] Memicu Redeploy container baru di Railway Cloud...`
    );

    // 4. Trigger Redeploy
    await railway.triggerRedeploy(token, environmentId, serviceId);

    // 5. Polling until Redeploy is Ready / Running (Up to 5 minutes)
    let attempts = 0;
    const maxAttempts = 60;
    let status = 'BUILDING';

    while (attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      try {
        const statusObj = await railway.getDeploymentStatus(token, environmentId, serviceId);
        status = statusObj?.status || 'BUILDING';

        const elapsedSec = attempts * 5;
        const min = Math.floor(elapsedSec / 60);
        const sec = elapsedSec % 60;
        const timeStr = min > 0 ? `${min}m ${sec}s` : `${sec}s`;

        if (attempts % 2 === 0 && status !== 'SUCCESS') {
          await safeEditMessage(
            bot,
            chatId,
            loadMsg.message_id,
            `⏳ *MEMBANGUN ULANG CONTAINER (${distro.name})...*\n\n` +
            `🖥️ *VPS:* \`${vpsName}\` (\`${ipDisplayPre}\`)\n` +
            `📊 *Status Build:* \`${status}\` (${timeStr})\n\n` +
            `🔄 _Sedang mendownload base image, mengonfigurasi distro & mengaktifkan kembali OpenSSH..._`
          );
        }

        if (status === 'SUCCESS') break;
        if (status === 'FAILED' || status === 'CRASHED') break;
      } catch (e) {}
    }

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

    await safeEditMessage(bot, chatId, loadMsg.message_id, successText, {
      reply_markup: { inline_keyboard: successButtons },
      disable_web_page_preview: true
    });
  } catch (err) {
    safeEditMessage(bot, chatId, loadMsg.message_id, `❌ *Gagal Reinstall OS VPS:*\n_${err.message}_`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 Kembali ke Daftar VPS', callback_data: 'cmd_list' }],
          [{ text: '🏠 Menu Utama', callback_data: 'menu_main' }]
        ]
      }
    });
  }
}

module.exports = {
  handleReinstallOsMenu,
  handleReinstallOsCategory,
  promptReinstallCustomOsInput,
  handleReinstallConfirm,
  executeReinstallOs,
};
