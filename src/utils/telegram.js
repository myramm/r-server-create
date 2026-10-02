const db = require('../services/database');

function safeSendMessage(bot, chatId, text, options = {}) {
  const defaultOpts = { parse_mode: 'Markdown', disable_web_page_preview: true };
  return bot.sendMessage(chatId, text, { ...defaultOpts, ...options }).catch((err) => {
    console.error(`safeSendMessage failed [${chatId}]:`, err.message);
    return null;
  });
}

function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  const defaultOpts = {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  };
  return bot.editMessageText(text, { ...defaultOpts, ...options }).catch((err) => {
    // If edit fails (e.g. message expired), fallback to sendMessage
    if (!err.message.includes('message is not modified')) {
      return safeSendMessage(bot, chatId, text, options);
    }
    return null;
  });
}

function getUserState(chatId) {
  return db.getSession(chatId);
}

function saveUserState(chatId, session) {
  return db.saveSession(chatId, session);
}

function resetCreateData(chatId) {
  return db.resetSession(chatId);
}

module.exports = {
  safeSendMessage,
  safeEditMessage,
  getUserState,
  saveUserState,
  resetCreateData,
};
