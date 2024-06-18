// Thư viện cần thiết
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

async function getBalance(account, user) {
    const balance = await account.provider.getBalance(account.address);
    const ethBalance = ethers.formatUnits(balance, "ether");
    user.balance = ethBalance;
}

async function getAccountInfo(bot, chatId, secretKey, user) {
    try {
        const wallet = new ethers.Wallet(secretKey);
        console.log("🚀 ~ wallet:", wallet)
        const providerPath = "wss://bsc-mainnet.core.chainstack.com/ws/5cf621a34e450d8b7f93a3db5a64bd9b";
        const provider = new ethers.WebSocketProvider(providerPath);
        const account = wallet.connect(provider);
        console.log("🚀 ~ account:", account);
        user.address = account.address;
    
        await getBalance(account, user);

        return {'wallet': wallet, 'provider': provider, 'account': account};
    } catch (error) {
        console.log("🚀 ~ error:", error)
        bot.sendMessage(chatId, `SecretKey không hợp lệ.`);
        return false;
    }
}

module.exports = getAccountInfo;