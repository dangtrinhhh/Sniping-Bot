// Thư viện cần thiết
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

async function transferToken(provider, router, tokenIn, tokenOut, quantity) {
    try {
        const amountIn = ethers.parseUnits(quantity, 'ether');
        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        console.log("🚀 ~ amounts:", amounts);

        const amountOutMin = 0;
        console.log("🚀 ~ amountOutMin:", amountOutMin.toString());

        const getGasPrice = await provider.getFeeData()

        const tx = await router.swapExactETHForTokens(
            amountOutMin,
            [tokenIn, tokenOut],
            account.address,
            Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes from now
            {
                gasPrice: getGasPrice.gasPrice,
                gasLimit: 310000,
                value: amountIn
            }
        );

        console.log('Transaction sent, waiting for receipt...');
        const receipt = await tx.wait();
        console.log('Transaction receipt:', receipt);
    } catch (error) {
        console.log('Error:', error.reason || error.message);
    }
}


module.exports = transferToken;