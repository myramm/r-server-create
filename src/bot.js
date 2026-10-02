require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./services/database');
const railway = require('./services/railway');
const cliAuth = require('./services/cliAuth');
const { getDistroByCode } = require('./config/osCatalog');
const {
  safeSendMessage,
  safeEditMessage,
  getUserState,
  resetCreateData
} = require('./utils/telegram');

const {
  sendMainMenu,
  handleShowProfile,
  sendCatalogOverview,
  sendAppsCatalog,
  promptTokenInput,
  promptManualTokenInput,
  sendTutorialToken,
} = require('./handlers/menuHandler');

const {
  generatePassword,
  showOsMenu,
  showOsCategory,
  showNodeMenu,
  showAiAgentsMenu,
  showToolsMenu,
  showPasswordMenu,
  showSummaryMenu,
  executeFullVpsDeployment,
} = require('./handlers/createHandler');

const {
  handleReinstallOsMenu,
  handleReinstallOsCategory,
  handleReinstallConfirm,
  executeReinstallOs,
} = require('./handlers/reinstallHandler');

const {
  handleListProjects,
  handleRestartProject,
  handleCheckBalance,
  handleDeleteProject,
  handleShowChangeNodeMenu,
  executeChangeNodeVersion,
  handleShowAiAgentsHub,
  executeResetAiAgent,
} = require('./handlers/vpsHandler');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required in .env file!');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// -------------------------------------------------------------
// Command Handlers
// -------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'User';
  sendMainMenu(bot, chatId, name);
});

bot.onText(/\/login/, (msg) => promptTokenInput(bot, msg.chat.id));
bot.onText(/\/create/, (msg) => {
  resetCreateData(msg.chat.id);
  const state = getUserState(msg.chat.id);
  if (!state.data?.railwayToken) {
    return promptTokenInput(bot, msg.chat.id);
  }
  return showOsMenu(bot, msg.chat.id);
});

bot.onText(/\/list/, (msg) => handleListProjects(bot, msg.chat.id));
bot.onText(/\/balance/, (msg) => handleCheckBalance(bot, msg.chat.id));
bot.onText(/\/reinstall/, (msg) => handleListProjects(bot, msg.chat.id));
bot.onText(/\/help|\/tutorial/, (msg) => sendTutorialToken(bot, msg.chat.id));

bot.onText(/\/delete(?:\s+(.+))?/, (msg, match) => {
  const projectId = match[1]?.trim();
  if (projectId) {
    handleDeleteProject(bot, msg.chat.id, projectId);
  } else {
    handleListProjects(bot, msg.chat.id);
  }
});

// -------------------------------------------------------------
// Callback Query Router
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // Main Menus
  if (data === 'menu_main') {
    return sendMainMenu(bot, chatId, query.from?.first_name);
  }
  if (data === 'cmd_list') {
    return handleListProjects(bot, chatId, messageId);
  }
  if (data === 'cmd_profile') {
    return handleShowProfile(bot, chatId, messageId);
  }
  if (data === 'cmd_balance') {
    return handleCheckBalance(bot, chatId);
  }
  if (data === 'cmd_set_token') {
    return promptTokenInput(bot, chatId, messageId);
  }
  if (data === 'cmd_catalog') {
    return sendCatalogOverview(bot, chatId);
  }
  if (data === 'cmd_apps_catalog') {
    return sendAppsCatalog(bot, chatId);
  }
  if (data === 'cmd_tutorial') {
    return sendTutorialToken(bot, chatId);
  }

  // Auth Callbacks
  if (data === 'cancel_cli_auth') {
    cliAuth.cancelCliLogin(chatId);
    return sendMainMenu(bot, chatId, query.from?.first_name);
  }
  if (data === 'prompt_token_manual') {
    return promptManualTokenInput(bot, chatId, messageId);
  }

  // VPS Creation Wizard
  if (data === 'flow_start_create') {
    const state = getUserState(chatId);
    if (!state.data?.railwayToken) {
      return promptTokenInput(bot, chatId, messageId);
    }
    return showOsMenu(bot, chatId, messageId);
  }
  if (data.startsWith('cat_')) {
    const catKey = data.replace('cat_', '');
    return showOsCategory(bot, chatId, messageId, catKey);
  }
  if (data.startsWith('pick_')) {
    const code = data.replace('pick_', '');
    const distro = getDistroByCode(code);
    if (distro) {
      const state = getUserState(chatId);
      state.data.os = distro.id;
      state.data.osName = distro.name;
      db.saveSession(chatId, state);
      return showNodeMenu(bot, chatId, messageId);
    }
  }

  // Node.js Version
  if (data.startsWith('set_node_')) {
    const nodeChoice = data.replace('set_node_', '');
    const state = getUserState(chatId);
    state.data.nodeVersion = nodeChoice;
    db.saveSession(chatId, state);
    return showAiAgentsMenu(bot, chatId, messageId);
  }

  // AI Agents Toggles
  if (data.startsWith('toggle_ai_')) {
    const agent = data.replace('toggle_ai_', '');
    const state = getUserState(chatId);
    if (state.data.aiAgents[agent] !== undefined) {
      state.data.aiAgents[agent] = !state.data.aiAgents[agent];
    }
    db.saveSession(chatId, state);
    return showAiAgentsMenu(bot, chatId, messageId);
  }
  if (data === 'step_goto_ai') {
    return showAiAgentsMenu(bot, chatId, messageId);
  }
  if (data === 'step_goto_tools') {
    return showToolsMenu(bot, chatId, messageId);
  }

  // Extra Tools Toggles
  if (data.startsWith('toggle_tool_')) {
    const tool = data.replace('toggle_tool_', '');
    const state = getUserState(chatId);
    if (state.data.extraTools[tool] !== undefined) {
      state.data.extraTools[tool] = !state.data.extraTools[tool];
    }
    db.saveSession(chatId, state);
    return showToolsMenu(bot, chatId, messageId);
  }
  if (data === 'select_all_tools') {
    const state = getUserState(chatId);
    Object.keys(state.data.extraTools).forEach(k => {
      state.data.extraTools[k] = true;
    });
    db.saveSession(chatId, state);
    return showToolsMenu(bot, chatId, messageId);
  }

  // Password Options
  if (data === 'step_goto_password') {
    return showPasswordMenu(bot, chatId, messageId);
  }
  if (data === 'pass_auto_gen') {
    const state = getUserState(chatId);
    state.data.password = generatePassword(12);
    db.saveSession(chatId, state);
    return showSummaryMenu(bot, chatId, messageId);
  }
  if (data === 'pass_manual_input') {
    const state = getUserState(chatId);
    state.step = 'AWAIT_PASSWORD';
    db.saveSession(chatId, state);
    return safeSendMessage(bot, chatId, '🔐 *Silakan ketik password root kustom yang Anda inginkan (minimal 6 karakter):*');
  }

  // Deploy Confirmation
  if (data === 'confirm_deploy_vps') {
    return executeFullVpsDeployment(bot, chatId, messageId);
  }

  // Reinstall OS Callbacks
  if (data.startsWith('reinstall_') || data.startsWith('rmenu_')) {
    const projectId = data.replace(/^(reinstall_|rmenu_)/, '');
    return handleReinstallOsMenu(bot, chatId, messageId, projectId);
  }
  if (data.startsWith('rcat_')) {
    const rest = data.replace('rcat_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const catKey = rest.substring(idx + 1);
    return handleReinstallOsCategory(bot, chatId, messageId, projectId, catKey);
  }
  if (data.startsWith('rpick_')) {
    const rest = data.replace('rpick_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const distroCode = rest.substring(idx + 1);
    return handleReinstallConfirm(bot, chatId, messageId, projectId, distroCode);
  }
  if (data.startsWith('rdo_')) {
    const rest = data.replace('rdo_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const distroCodeOrId = rest.substring(idx + 1);
    return executeReinstallOs(bot, chatId, messageId, projectId, distroCodeOrId);
  }

  // VPS Action Callbacks
  if (data.startsWith('vps_node_')) {
    const projectId = data.replace('vps_node_', '');
    return handleShowChangeNodeMenu(bot, chatId, messageId, projectId);
  }
  if (data.startsWith('setnode_')) {
    const rest = data.replace('setnode_', '');
    const idx = rest.indexOf('_');
    const projectId = rest.substring(0, idx);
    const nodeVersion = rest.substring(idx + 1);
    return executeChangeNodeVersion(bot, chatId, messageId, projectId, nodeVersion);
  }
  if (data.startsWith('vps_ai_')) {
    const projectId = data.replace('vps_ai_', '');
    return handleShowAiAgentsHub(bot, chatId, messageId, projectId);
  }
  if (data.startsWith('ai_clean_')) {
    const rest = data.replace('ai_clean_', '');
    const idx = rest.indexOf('_');
    const agentType = rest.substring(0, idx);
    const projectId = rest.substring(idx + 1);
    return executeResetAiAgent(bot, chatId, messageId, projectId, agentType);
  }
  if (data.startsWith('reboot_')) {
    const projectId = data.replace('reboot_', '');
    return handleRestartProject(bot, chatId, projectId);
  }
  if (data.startsWith('del_')) {
    const projectId = data.replace('del_', '');
    return handleDeleteProject(bot, chatId, projectId);
  }

  bot.answerCallbackQuery(query.id).catch(() => {});
});

// -------------------------------------------------------------
// Text Input Listener (Token, Custom OS, Password)
// -------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.trim() : '';
  if (text.startsWith('/')) return;

  const state = getUserState(chatId);

  // Manual Token Input
  if (state.step === 'AWAIT_TOKEN') {
    const loadingMsg = await safeSendMessage(bot, chatId, '⏳ *Memverifikasi token ke Railway API...*');
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

      if (loadingMsg?.message_id) {
        bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
      }

      const successMsg = await safeSendMessage(
        bot,
        chatId,
        `✅ *Railway Token Berhasil Disimpan Permanen!*\n\n` +
        `👤 *Nama Akun:* ${user.name || 'User'}\n` +
        `📧 *Status:* \`${user.email}\`\n` +
        `💰 *Credit Tersedia:* \`${credits}\`\n\n` +
        `_Token Anda tersimpan di Database._\n\n` +
        `Sekarang mari pilih konfigurasi VPS Anda:`
      );
      return showOsMenu(bot, chatId, successMsg?.message_id);
    } catch (err) {
      return safeEditMessage(bot, chatId, loadingMsg?.message_id, `❌ *Token Railway tidak valid!*\n\n_Detail: ${err.message}_\n\nSilakan periksa kembali dan kirim ulang:`);
    }
  }

  // Manual Password input
  if (state.step === 'AWAIT_PASSWORD') {
    if (text.length < 6) {
      return safeSendMessage(bot, chatId, '⚠️ *Password terlalu pendek!* Minimal 6 karakter. Silakan coba lagi:');
    }
    state.data.password = text;
    state.step = 'IDLE';
    db.saveSession(chatId, state);

    const sentMsg = await safeSendMessage(bot, chatId, '✅ *Password root berhasil disetel!*');
    return showSummaryMenu(bot, chatId, sentMsg?.message_id);
  }
});

// Error handling
bot.on('polling_error', (error) => {
  if (error.code !== 'ETELEGRAM') {
    console.error('Polling Error:', error.message);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

console.log('🤖 [R-SERVER VPS Bot] Started and listening for Telegram events...');

module.exports = bot;
