// Thư viện cần thiết
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const AccountUser = require('./models/AccountUser');
// const modules = require('./modules');
const crypto = require('crypto');
const Bottleneck = require('bottleneck');

// Khởi tạo Bottleneck với các thông số giới hạn
const limiter = new Bottleneck({
    minTime: 40 // Giới hạn tối thiểu thời gian giữa các lần gọi hàm là 40ms (25 lần mỗi giây)
});

const monitoredTransactions = new Set();
let pendingTransactions;

process.env.NTBA_FIX_319 = 1;

// Tạo thư mục /data nếu chưa tồn tại
const dataDir = path.join(__dirname, 'data/users');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Hàm lưu thông tin user vào file JSON
const saveUserInfo = (chatId, user) => {
    const filePath = path.join(dataDir, `${chatId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(user, null, 2));
};

const getUserInfo = (chatId) => {
    try {
        const filePath = path.join(dataDir, `${chatId}.json`);
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    catch (error) {
        bot.sendMessage(chatId, '⛔ Không tìm thấy thông tin.\nVui lòng kết nối lại ví');
        return null;
    }
};

function generateTransactionHash(transaction) {
    const transactionString = JSON.stringify(transaction);
    return crypto.createHash('sha256').update(transactionString).digest('hex');
}

// Hàm lấy giờ Việt Nam
function getCurrentDateTimeInVietnam() {
    // Lấy thời gian hiện tại
    const now = new Date();

    // Định dạng ngày giờ theo múi giờ Việt Nam
    const options = {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false // Sử dụng định dạng 24 giờ
    };

    const vietnamDateTime = now.toLocaleString('vi-VN', options);
    return vietnamDateTime;
}

// ******************************** CODE VÍ *****************************************
// Thông tin provider của network BSC mainnet
const providerPath = "wss://bsc-mainnet.core.chainstack.com/ws/5cf621a34e450d8b7f93a3db5a64bd9b";
const provider = new ethers.WebSocketProvider(providerPath);

const addresses = {
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // factory contract address của pancakeswap
    SYMBOL: "BNB", // symbol, ví dụ "BNB"
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // router contract address của pancakeswap
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB address
    WBNB_USDT_PAIR: "0x16B2e982Ec09F43a53d2FBCdE4B4E4d818Bd88A0" // WBNB-USDT pair address on PancakeSwap
};

const pairAbi = [
    'function getReserves() public view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
];

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

let wallet, account;

async function getBalance(account, user) {
    const balance = await account.provider.getBalance(account.address);
    const ethBalance = ethers.formatUnits(balance, "ether");
    user.balance = ethBalance;
}

async function init(chatId, secretKey, data) {
    try {
        wallet = new ethers.Wallet(secretKey);
        account = wallet.connect(provider);
        console.log("🚀 ~ account:", account);

        data.secretKey = secretKey;
        data.address = account.address;
        data.chatId = chatId;

        await getBalance(account, data);

        if (wallet) {
            saveUserInfo(chatId, data);
            bot.sendMessage(chatId, `✅ Kết nối ví thành công!\nĐịa chỉ ví: ${data.address}\nSố dư: ${data.balance} ${addresses.SYMBOL}`);
        }

        factory = new ethers.Contract(
            addresses.factory,
            [
                'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
                'function getPair(address tokenA, address tokenB) external view returns (address pair)'
            ],
            account
        );

        router = new ethers.Contract(
            addresses.router,
            [
                'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
                'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)'
            ],
            account
        );
    } catch (error) {
        console.log("🚀 ~ error:", error)
        bot.sendMessage(chatId, `⛔ SecretKey không hợp lệ.`);
        return false;
    }
}

function isValidTokenAddress(address) {
    // Kiểm tra nếu địa chỉ không bắt đầu bằng '0x'
    if (!address.startsWith('0x')) {
        return false;
    }
    // Kiểm tra độ dài địa chỉ (42 ký tự bao gồm cả '0x')
    if (address.length !== 42) {
        return false;
    }
    // Kiểm tra nếu địa chỉ chứa ký tự không hợp lệ
    const hexRegex = /^(0x)?[0-9a-fA-F]{40}$/;
    return hexRegex.test(address);
}

async function getTokenBalance(walletAddress, tokenAddress) {
    // Tạo đối tượng contract ERC-20
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    try {
        // Lấy số dư token
        const balance = await tokenContract.balanceOf(walletAddress);

        // Lấy số chữ số thập phân của token
        const decimals = await tokenContract.decimals();

        // Chuyển đổi số dư sang định dạng dễ đọc
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log(`Số lượng token trong ví: ${formattedBalance}`);
        return formattedBalance;
    } catch (error) {
        console.error('Lỗi khi lấy số dư token:', error);
    }
}

async function transferToken(tokenIn, tokenOut, quantity) {
    try {
        const amountIn = ethers.parseUnits(quantity, 'ether');
        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        const tokenPriceInBNB = ethers.formatUnits(amounts[1], 'ether');
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
        return tokenPriceInBNB;
    } catch (error) {
        console.log('Error:', error);
    }
}

let count = 0;
// Sử dụng limiter.wrap để giới hạn số lần gọi hàm
const getTokenPriceInBNB = limiter.wrap(async (tokenAddress) => { // Thay đổi: Sử dụng limiter.wrap để bọc hàm
    try {
        const amountIn = ethers.parseUnits('1', 'ether'); // 1 Token
        const amounts = await router.getAmountsOut(amountIn, [tokenAddress, addresses.WBNB]); // WBNB address
        const tokenPriceInBNB = ethers.formatUnits(amounts[1], 'ether');
        count++;
        console.log("🚀 ~ _______________Lấy giá lần thứ ", count);
        return tokenPriceInBNB;
    } catch (error) {
        console.log("🚀 ~ Lỗi khi lấy giá:", error);
        return null;
    }
});

// async function getTokenPriceInBNB(tokenAddress) {
//     // console.log("🚀 ~ tokenAddress:", tokenAddress);
//     try {
//         const amountIn = ethers.parseUnits('1', 'ether'); // 1 Token
//         const amounts = await router.getAmountsOut(amountIn, [tokenAddress, addresses.WBNB]); // WBNB address
//         const tokenPriceInBNB = ethers.formatUnits(amounts[1], 'ether');
//         count++;
//         console.log("🚀 ~ _______________Lấy giá lần thứ ", count);

//         return tokenPriceInBNB;
//     } catch (error) {
//         console.log("🚀 ~ Lỗi khi lấy giá:", error);
//         return null;
//     }
// }

async function transferTokenWithPriceCheck(user, bot, chatId, index, tokenIn, tokenOut, quantity, targetPrice, checkInterval = 5000) {
    // console.log("🚀 ~ quantity:", quantity)
    // console.log("🚀 ~ targetPrice:", targetPrice);
    let quantityStr = quantity.toString();
    try {
        const amountIn = ethers.parseUnits(quantityStr, 'ether');

        const getGasPrice = await provider.getFeeData();

        async function checkPriceAndTransfer() {
            try {
                const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
                const currentPrice = ethers.formatUnits(amounts[1], 'ether');

                let tokenNeedGetPrice = tokenIn === addresses.WBNB ? tokenOut : tokenIn;
                let priceToken = await getTokenPriceInBNB(tokenNeedGetPrice);
                // console.log("🚀 ~ currentPrice:", currentPrice);
                console.log("🚀 ~ priceToken:", priceToken)

                if (priceToken !== null && parseFloat(priceToken) >= parseFloat(targetPrice)) {
                    const amountOutMin = 0; // You might want to adjust this based on slippage tolerance

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
                    bot.sendMessage(chatId, `✅ Đã khớp lệnh ở giá (${priceToken}). Số lượng: ${quantity}`);
                    
                    user.transactions[index].status = "success";
                    user.transactions[index].timeCompleted = getCurrentDateTimeInVietnam();

                    saveUserInfo(chatId, user);
                } else {
                    console.log(`Current price (${priceToken}) is below target price (${targetPrice}). Checking again in ${checkInterval / 1000} seconds...`);
                    setTimeout(checkPriceAndTransfer, checkInterval / 1000);
                }
            } catch (error) {
                console.log('Lỗi khi lấy giá hoặc thực hiện giao dịch:', error);
                bot.sendMessage(chatId, `⛔ Lỗi khi giao dịch số ${index + 1}`);
                bot.sendMessage(chatId, `⛔ Vui lòng kiểm tra lại số lượng hoặc địa chỉ token.`);
                user.transactions[index].status = "fail";
                saveUserInfo(chatId, user);
                
                // Lấy lại danh sách giao dịch cần xử lý
                pendingTransactions.filter(tx => tx.status === "pending");

                // Xóa giao dịch Fail khỏi hàng chờ:
                monitoredTransactions.delete(user.transactions[index].id);
                console.log("🚀 ~ monitoredTransactions:", monitoredTransactions)
            }
        }

        checkPriceAndTransfer();
    } catch (error) {
        console.log('Lỗi số dư không đủ:', error);
    }
}

// Function to monitor transactions for a user
async function monitorTransactions(user, bot, transactions, chatId, secretKey, data) {
    // Filter pending transactions
    pendingTransactions = transactions.filter(ts => ts.status === "pending");
    console.log("🚀 ~ pendingTransactions:", pendingTransactions);
    
    // Monitor each transaction asynchronously
    for (let i = 0; i < pendingTransactions.length; i++) {
        if (!monitoredTransactions.has(pendingTransactions[i]['id'])) {
            monitoredTransactions.add(pendingTransactions[i]['id']);
            await monitorTransaction(user, bot, i, pendingTransactions[i], chatId, secretKey, data);
        } else {
            console.log("🚀 ~ Transaction already being monitored:", monitoredTransactions);
        }
    }
}

// Function to monitor individual transaction
async function monitorTransaction(user, bot, index, transaction, chatId, secretKey, data) {
    if (!router) {
        await init(chatId, data.secretKey, data);
    }

    let tokenIn, tokenOut;

    if (transaction.type.toLowerCase === 'mua') {
        tokenIn = addresses.WBNB;
        tokenOut = transaction.tokenAddress;
    } else {
        tokenIn = transaction.tokenAddress;
        tokenOut = addresses.WBNB;
    }

    // Call the transfer function with price check
    if (transaction.type.toLowerCase == "bán" && transaction.condition == "rate") {
        try {
            let priceToken = await getTokenPriceInBNB(transaction.tokenAddress);
            await transferTokenWithPriceCheck(user, bot, chatId, index, tokenIn, tokenOut, transaction.quantity, transaction.targetPrice * priceToken);
        } catch (error) {
            console.log("🚀 ~ Lỗi lấy giá trong hàm monitorTransaction:", error)
        }
    } else {
        await transferTokenWithPriceCheck(user, bot, chatId, index, tokenIn, tokenOut, transaction.quantity, transaction.targetPrice);
    }
}

const getUserFiles = (fileName) => {
    try {
        const filePath = path.join(dataDir, fileName);
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log(`🚀 ~ Lỗi đọc file ${fileName}:`, error);
        return null;
    }
};

// Main bot loop to monitor transactions for all users
async function mainBotLoop(bot) {
    const checkInterval = 5000; // Interval to check for new transactions

    while (true) {
        try {
            // Read all JSON files in the directory
            const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
            
            // Iterate over each file to get user transactions
            for (const file of files) {
                const userData = getUserFiles(file);

                if (userData && userData.transactions) {
                    // Monitor the transactions for the current user
                    // await monitorTransactions(bot, userData.transactions);
                    await monitorTransactions(userData, bot, userData.transactions, userData.chatId, userData.secretKey, userData);
                }
            }

            // Wait for the defined interval before checking again
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        } catch (error) {
            console.error('🚀 ~ Lỗi trong main loop:', error);
            // Optionally wait a bit before retrying in case of an error
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
    }
}


// ******************************************************************************************


// *****************************************CODE BOT**********************************************
// Bot token
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// let users = {};
// let user = {};
let factory, router, secretKey;

// Trạng thái người dùng
const userStates = {};

const STATES = {
    NONE: 'none',
    WAITING_FOR_SECRET_KEY: 'WAITING_FOR_SECRET_KEY',
    WAITING_FOR_TOKEN_ADDRESS: 'WAITING_FOR_TOKEN_ADDRESS',
    WAITING_FOR_TOKEN_ADDRESS_FOR_CHECK: 'WAITING_FOR_TOKEN_ADDRESS_FOR_CHECK',

    WAITING_FOR_AMOUNT: 'waiting_for_amount',
    WAITING_FOR_MAX_PRICE: 'waiting_for_max_price',
    WAITING_FOR_SELL_AMOUNT: 'waiting_for_sell_amount',
    WAITING_FOR_SELL_CONDITION: 'waiting_for_sell_condition',
    WAITING_FOR_SELL_PRICE: 'waiting_for_sell_price',
    WAITING_FOR_SELL_RATIO: 'waiting_for_sell_ratio',

    WAITING_FOR_TRANSACTION_NUMBER: 'waiting_for_transaction_number',
    WAITING_FOR_EDIT_NUMBER: 'waiting_for_edit_number',
    WAITING_FOR_CONTENT_EDIT: 'waiting_for_content_edit'
};



// Hàm tạo nút bấm gợi ý trả lời
function getMainMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🚀 Kết nối ví', callback_data: 'connect_wallet' },
                    { text: '🚀 Xóa ví', callback_data: 'remove_wallet' }
                ],
                [
                    { text: '🚀 Mua token', callback_data: 'buy_token' },
                    { text: '🚀 Bán token', callback_data: 'sell_token' }
                ],
                [
                    { text: '🚀 Xem giá token', callback_data: 'token_price' },
                    { text: '🚀 Sửa lệnh', callback_data: 'edit_transaction' }
                ],
                [
                    { text: '🚀 Lịch sử', callback_data: 'history' },
                    { text: '🚀 Thông tin', callback_data: 'info' }
                ],
            ]
        }
    };
}

// Hàm phản hồi yêu cầu chỉnh sửa:
function responseContinueEdit(chatId) {
    bot.sendMessage(chatId, '❓Bạn muốn chỉnh sửa tiếp giao dịch này không ?');
    bot.sendMessage(chatId, '✅ Nếu CÓ\n Nhập 1 để sửa yêu cầu (mua hoặc bán)\nNhập 2 để sửa địa chỉ token\nNhập 3 để sửa số lượng\nNhập 4 để sửa giá khớp lệnh\n Nhập 0 để thoát chỉnh sửa ');
    bot.sendMessage(chatId, '⛔ Nếu KHÔNG\n Nhập 0 để thoát.');
}

// Hàm tạo bảng giao dịch
function getTransactionsTable(transactions) {
    let result = ''

    for (let i = 0; i < transactions.length; i++) {
        result += `_____________________________________________________\n
${i + 1}. ${transactions[i].type} ${transactions[i].tokenAddress}\n
Số lượng:  ${transactions[i].quantity}\n
Giá khớp lệnh: ${transactions[i].targetPrice}\n
Lúc: ${transactions[i].timeCreated}\n
Trạng thái: ${"✅ Thành công" ? transactions[i].status === "success" : "⛔ Thất bại" ? transactions[i].status === "fail" : "🚀 Đang chờ"}\n
Thời gian khớp lệnh: ${transactions[i].timeCompleted || 'Chưa khớp'}\n
_____________________________________________________\n`;

    }

    return result;
}

// Xử lý sự kiện khi người dùng bấm nút
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;
    let dataUserCallback = getUserInfo(chatId);
    const userState = userStates[chatId];

    switch (data) {
        case 'connect_wallet':
            userStates[chatId] = { state: STATES.WAITING_FOR_SECRET_KEY };
            bot.sendMessage(chatId, '👉 Vui lòng nhập Private Key của bạn:');
            break;
        case 'remove_wallet':
            if ( dataUserCallback.secretKey &&  dataUserCallback.address) {
                dataUserCallback.secretKey = "";
                dataUserCallback.address = "";
            }
            saveUserInfo(chatId, dataUserCallback);
            bot.sendMessage(chatId, '✅ Xóa ví thành công!');
            break;
        case 'buy_token':
            if (!dataUserCallback || !dataUserCallback.hasOwnProperty('secretKey') || dataUserCallback['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }
            userStates[chatId] = { state: STATES.WAITING_FOR_TOKEN_ADDRESS };
            bot.sendMessage(chatId, '💁 Vui lòng cung cấp địa chỉ token:');
            break;
        case 'sell_token':
            if (!dataUserCallback || !dataUserCallback.hasOwnProperty('secretKey') || dataUserCallback['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }
            userStates[chatId] = { state: STATES.WAITING_FOR_TOKEN_ADDRESS };
            bot.sendMessage(chatId, '💁 Vui lòng cung cấp địa chỉ token:');
            break;
        case 'history':
            let history = dataUserCallback.transactions.filter(ts => ts.status !== "pending")
            bot.sendMessage(chatId, `🚀 Đây là thông tin các giao dịch đã thực hiện (thành công hoặc thất bại): \n${getTransactionsTable(history)}`);
            break;
        case 'info':
            bot.sendMessage(chatId, `🚀 Đây là tất cả các lệnh đã đặt:\n${getTransactionsTable(dataUserCallback.transactions)}`);
            break;
        case 'token_price':

            if (!dataUserCallback || !dataUserCallback.hasOwnProperty('secretKey') || dataUserCallback['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }
            userStates[chatId] = { state: STATES.WAITING_FOR_TOKEN_ADDRESS_FOR_CHECK };
            bot.sendMessage(chatId, '💁 Vui lòng cung cấp địa chỉ token:');
            break;
        case 'edit_transaction':
            if (!dataUserCallback || !dataUserCallback.hasOwnProperty('secretKey') || dataUserCallback['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }

            let editTransactions = dataUserCallback.transactions.filter(ts => ts.status !== "success");
            userState.editTransactions = editTransactions;
            
            bot.sendMessage(chatId, `✅ Đây là thông tin các giao dịch của bạn: \n${getTransactionsTable(editTransactions)}`);
            
            userStates[chatId] = { state: STATES.WAITING_FOR_TRANSACTION_NUMBER };
            bot.sendMessage(chatId, '👉 Nhập số thứ tự của giao dịch cần chỉnh sửa:');
            break;
        default:
            bot.sendMessage(chatId, '⛔ Lựa chọn không hợp lệ. Vui lòng thử lại.');
            break;
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const [command, ...args] = messageText.split(' ');
    const userState = userStates[chatId];
    let data = getUserInfo(chatId);

    if (!data) {
        data = new AccountUser(secretKey);
    }

    console.log("🚀 ~ messageText:", messageText);

    if (userStates[chatId] && userStates[chatId].state !== STATES.NONE) {
        handleUserState(chatId, messageText);
        return;
    }

    if (!router) {
        let aaa = await init(chatId, data.secretKey, data);
    }

    switch (command) {
        case '/start':
        case '/menu':
        case '/help':
            bot.sendMessage(chatId, '👉 Vui lòng chọn một trong các tùy chọn bên dưới:', getMainMenu());
            break;
        case '/connect':
            userStates[chatId] = { state: STATES.WAITING_FOR_SECRET_KEY };
            bot.sendMessage(chatId, '👉 Vui lòng nhập Private Key của bạn:');
            break;
        case '/remove':
            data.secretKey = data.address = "";
            saveUserInfo(chatId, data);
            bot.sendMessage(chatId, '✅ Xóa ví thành công!');
            break;
        case '/swap':
            if (args.length < 3) {
                bot.sendMessage(chatId, '👉 Vui lòng cung cấp cú pháp: /swap [token address in] [token address out] [quantity]');
                break;
            }
            const [tokenIn, tokenOut, quantity] = args;

            if (!getUserInfo(chatId) || !getUserInfo(chatId).hasOwnProperty('secretKey') || getUserInfo(chatId)['secretKey'] === '0' || !router) {
                try {
                    let priceETH = await getTokenPriceInBNB('0x2170Ed0880ac9A755fd29B2688956BD959F933F8');
                    bot.sendMessage(chatId, '✅ Thành công!');
                    bot.sendMessage(chatId, `👉 Giá ETH/BNB: ${priceETH}`);
                } catch (error) {
                    bot.sendMessage(chatId, '⛔ Lỗi khi swap!');
                    console.log("🚀 ~ Lôi khi swap:", error)
                }

            } else {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
            }

            // Xử lý logic mua token tại đây
            bot.sendMessage(chatId, `🚀 token 1: ${tokenIn}\ntoken2: ${tokenOut}\nquantity: ${quantity}`);
            break;
        case '/edit':
            if (!data || !data.hasOwnProperty('secretKey') || data['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }

            let editTransactions = data.transactions.filter(ts => ts.status === "pending");
            userState.editTransactions = editTransactions;
            
            bot.sendMessage(chatId, `✅ Đây là thông tin các giao dịch của bạn: \n${getTransactionsTable(editTransactions)}`);
            
            userStates[chatId] = { state: STATES.WAITING_FOR_TRANSACTION_NUMBER };
            bot.sendMessage(chatId, '👉 Nhập số thứ tự của giao dịch cần chỉnh sửa:');
            break;
        case '/info':
            bot.sendMessage(chatId, `🚀 Đây là tất cả các lệnh đã đặt:\n${getTransactionsTable(data.transactions)}`);
            break;
        case '/sell':
            if (!data || !data.hasOwnProperty('secretKey') || data['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }
            userStates[chatId] = { state: STATES.WAITING_FOR_TOKEN_ADDRESS };
            bot.sendMessage(chatId, '💁 Vui lòng cung cấp địa chỉ token:');
            break;
        case '/buy':
            if (!data || !data.hasOwnProperty('secretKey') || data['secretKey'] === '0' || !router) {
                bot.sendMessage(chatId, '💁 Bạn phải kết nối ví trước.');
                break;
            }
            userStates[chatId] = { state: STATES.WAITING_FOR_TOKEN_ADDRESS };
            bot.sendMessage(chatId, '💁 Vui lòng cung cấp địa chỉ token:');
            break;
        case '/history':
            let history = data.transactions.filter(ts => ts.status !== "pending")
            bot.sendMessage(chatId, `🚀 Đây là thông tin các giao dịch đã thực hiện (thành công hoặc thất bại): \n${getTransactionsTable(history)}`);
            break;
        case '/home':
            userStates[chatId] = { state: STATES.NONE };
            bot.sendMessage(chatId, '🚀 Quay về màn hình chính. Hãy thực hiện lệnh mới.');
            break;
        default:
            bot.sendMessage(chatId, '⛔ Lệnh không hợp lệ. Vui lòng thử lại.');
    }
});

async function handleUserState(chatId, text) {
    
    const userState = userStates[chatId];
    let data = getUserInfo(chatId);

    switch (userState.state) {
        case STATES.WAITING_FOR_SECRET_KEY:
            try {
                userState.secretKey = text.trim();
                console.log("🚀 ~ userState.secretKey:", userState.secretKey)
                console.log("🚀 ~ data:", data)
                let aaa = await init(chatId, userState.secretKey, data);
    
                userState.state = STATES.NONE;
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_SECRET_KEY:", error)
                delete userStates[chatId];
            }
            break;
        case STATES.WAITING_FOR_TOKEN_ADDRESS_FOR_CHECK:
            try {
                if (!isValidTokenAddress(text)) {
                    bot.sendMessage(chatId, '⛔ Địa chỉ token không hợp lệ. Vui lòng nhập lại.');
                } else {
                    userState.tokenAddressForCheck = text;
                    console.log("🚀 ~ userState.tokenAddressForCheck:", userState.tokenAddressForCheck)
                    
                    let priceToken = await getTokenPriceInBNB(text);
                    bot.sendMessage(chatId, '✅ Thành công!');
                    bot.sendMessage(chatId, `💁 Giá Token trong cặp BNB: ${priceToken}`);
                    userState.state = STATES.NONE;
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_TOKEN_ADDRESS_FOR_CHECK:", error)
                delete userStates[chatId];
            }
            
            break;
        case STATES.WAITING_FOR_TOKEN_ADDRESS:
            try {
                if (!isValidTokenAddress(text)) {
                    bot.sendMessage(chatId, '⛔ Địa chỉ token không hợp lệ. Vui lòng nhập lại.');
                } else {
                    userState.tokenAddress = text;
                    console.log("🚀 ~ userState.tokenAddress:", userState.tokenAddress);
                    
                    userStates[chatId] = {
                        state: STATES.WAITING_FOR_AMOUNT,
                        tokenAddress: text
                    };
                    bot.sendMessage(chatId, '👉 Nhập số lượng:');
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_TOKEN_ADDRESS:", error)
                delete userStates[chatId];
            }
            
            break;
        case STATES.WAITING_FOR_AMOUNT:
            try {
                userState.amount = 0 ? text === '0' : parseFloat(text);
    
                if (!userState.amount) {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số.');
                } else {
                    userState.state = STATES.WAITING_FOR_MAX_PRICE;
                    bot.sendMessage(chatId, '👉 Nhập giá cao nhất bạn có thể mua (0 để auto mua):');
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_AMOUNT:", error)
                delete userStates[chatId];
            }
            break;
        case STATES.WAITING_FOR_MAX_PRICE:
            userState.maxPrice = 0 ? text === '0' : parseFloat(text);

            if (!userState.maxPrice) {
                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số.');
            } else {
                userState.state = STATES.NONE;

                try {
                    let transaction = {
                        type: 'mua',
                        tokenAddress: userState.tokenAddress,
                        quantity: userState.amount,
                        condition: 'price',
                        targetPrice: userState.maxPrice,
                        timeCreated: getCurrentDateTimeInVietnam(),
                        timeCompleted: '',
                        status: "pending"
                    };

                    transaction.id = generateTransactionHash(transaction);

                    data['transactions'].unshift(transaction);

                    saveUserInfo(chatId, data);

                    bot.sendMessage(chatId, `🚀 Tóm tắt đơn hàng mua:
Địa chỉ Token: ${userState.tokenAddress}
Số lượng: ${userState.amount}
Giá cao nhất: ${userState.maxPrice}`);
                } catch (error) {
                    console.log("🚀 ~ Lỗi state WAITING_FOR_MAX_PRICE:", error)
                    bot.sendMessage(chatId, '⛔ Không tìm thấy địa chỉ ví, vui lòng kết nối ví.');
                    delete userStates[chatId];
                }
            }
            break;
        case STATES.WAITING_FOR_SELL_AMOUNT:
            try {
                userState.amount = 0 ? text === '0' : parseFloat(text);
                if (!userState.amount) {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số.');
                } else {
                    userState.state = STATES.WAITING_FOR_SELL_CONDITION;
                    bot.sendMessage(chatId, '❓Bạn muốn bán dựa trên giá hay tỷ lệ? Nhập "giá" hoặc "tỷ lệ":');
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_SELL_AMOUNT:", error)
                delete userStates[chatId];
            }
            break;
        case STATES.WAITING_FOR_SELL_CONDITION:
            try {
                if (text.toLowerCase() === 'giá') {
                    userState.state = STATES.WAITING_FOR_SELL_PRICE;
                    bot.sendMessage(chatId, '👉 Nhập giá bạn muốn bán:');
                } else if (text.toLowerCase() === 'tỷ lệ') {
                    userState.state = STATES.WAITING_FOR_SELL_RATIO;
                    bot.sendMessage(chatId, '👉 Nhập tỷ lệ bạn muốn bán (ví dụ: 2 để bán khi gấp đôi):');
                } else {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập "giá" hoặc "tỷ lệ":');
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_SELL_CONDITION:", error)
                delete userStates[chatId];
            }
            break;
        case STATES.WAITING_FOR_SELL_PRICE:
            userState.sellPrice = 0 ? text === '0' : parseFloat(text);

            if (!userState.sellPrice) {
                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số.');
            } else {
                userState.state = STATES.NONE;
                try {
                    let transaction = {
                        type: 'Bán',
                        tokenAddress: userState.tokenAddress,
                        quantity: userState.amount,
                        condition: 'price',
                        targetPrice: userState.sellPrice,
                        timeCreated: getCurrentDateTimeInVietnam(),
                        timeCompleted: '',
                        status: "pending"
                    }

                    transaction.id = generateTransactionHash(transaction);

                    data['transactions'].unshift(transaction);

                    saveUserInfo(chatId, data);

                    bot.sendMessage(chatId, `🚀 Tóm tắt giao dịch bán:
Địa chỉ Token: ${userState.tokenAddress}
Số lượng: ${userState.amount}
Điều kiện bán: Giá
Giá bán: ${userState.sellPrice}`);
                    delete userStates[chatId];
                } catch (error) {
                    console.log("🚀 ~ Lỗi state WAITING_FOR_SELL_PRICE:", error)
                    bot.sendMessage(chatId, '⛔ Không tìm thấy địa chỉ ví, vui lòng kết nối ví.');
                }
            }

            break;
        case STATES.WAITING_FOR_SELL_RATIO:
            userState.sellRatio = 0 ? text === '0' : parseFloat(text);
            userState.state = STATES.NONE;

            if (!userState.sellRatio) {
                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số.');
            } else {
                try {
                    let transaction = {
                        type: 'Bán',
                        tokenAddress: userState.tokenAddress,
                        quantity: userState.amount,
                        condition: 'rate',
                        targetPrice: userState.sellRatio,
                        timeCreated: getCurrentDateTimeInVietnam(),
                        timeCompleted: '',
                        status: "pending"
                    };

                    transaction.id = generateTransactionHash(transaction);

                    data['transactions'].unshift(transaction);

                    saveUserInfo(chatId, data);
                    
                    bot.sendMessage(chatId, `🚀 Tóm tắt giao dịch bán:
Địa chỉ Token: ${userState.tokenAddress}
Số lượng: ${userState.amount}
Điều kiện bán: Tỷ lệ
Tỷ lệ bán: ${userState.sellRatio}`);
                } catch (error) {
                    console.log("🚀 ~ Lỗi state WAITING_FOR_SELL_RATIO:", error)
                    bot.sendMessage(chatId, '⛔ Không tìm thấy địa chỉ ví, vui lòng kết nối ví.');
                }
                delete userStates[chatId];
            }
            break;

        // Xử lí states của việc sửa giao dịch
        case STATES.WAITING_FOR_TRANSACTION_NUMBER:
            try {
                if (!userState.editTransactions || userState.editTransactions.length <= 0) {
                    bot.sendMessage(chatId, '⛔ Bạn chưa có giao dịch nào!');
                    break;
                }
                
                let indexTransaction = 0 ? text === '0' : parseInt(text);
    
                if (!indexTransaction) {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số nguyên.');
                } else if (indexTransaction <= userState.editTransactions.length) {
                    userState.indexTransaction = indexTransaction;
                    userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                    bot.sendMessage(chatId, '💁 Nhập 1 để sửa yêu cầu (mua hoặc bán)\nNhập 2 để sửa địa chỉ token\nNhập 3 để sửa số lượng\nNhập 4 để sửa giá khớp lệnh\n Nhập 0 để thoát chỉnh sửa');
                } else if (indexTransaction <= userState.editTransactions.length) {
                    bot.sendMessage(chatId, '⛔ Không tồn tại giao dịch có số thứ tự đã nhập.');
                } else {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số nguyên.');
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_TRANSACTION_NUMBER:", error)
                delete userStates[chatId];
            }

            break;
        case STATES.WAITING_FOR_EDIT_NUMBER:
            try {
                let editNumber = 0 ? text === '0' : parseInt(text);
    
                if (!editNumber) {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập một số nguyên.');
                } else {
                    userState.editNumber = editNumber;
    
                    switch (editNumber) {
                        case 0:
                            userState.state = STATES.NONE;
                            break;
                        case 1:
                            bot.sendMessage(chatId, '👉 Nhập "Mua" hoặc "Bán" để sửa yêu cầu:');
                            userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            break;
                        case 2:
                            bot.sendMessage(chatId, '👉 Nhập địa chỉ token mong muốn:');
                            userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            break;
                        case 3:
                            bot.sendMessage(chatId, '👉 Nhập số lượng mong muốn:');
                            userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            break;
                        case 4:
                            bot.sendMessage(chatId, '👉 Nhập giá khớp lệnh mong muốn:');
                            userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            break;
                        default:
                            bot.sendMessage(chatId, '💁 Nhập 1 để sửa yêu cầu (mua hoặc bán)\nNhập 2 để sửa địa chỉ token\nNhập 3 để sửa số lượng\nNhập 4 để sửa giá khớp lệnh\n Nhập 0 để thoát chỉnh sửa');
                            break;
                    }
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_EDIT_NUMBER:", error)
                delete userStates[chatId];
            }
            break;
        case STATES.WAITING_FOR_CONTENT_EDIT:
            try {
                userState.contentEdit = text;
    
                if (!userState.contentEdit) {
                    bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập lại.');
                } else {
                    console.log("🚀 ~ userState.editNumber:", userState.editNumber)
                    switch (userState.editNumber) {
                        case 1:
                            if (userState.contentEdit.toLowerCase() == "mua" || userState.contentEdit.toLowerCase() == "bán") {
                                data["transactions"][userState.indexTransaction - 1].type = userState.contentEdit;
                                saveUserInfo(chatId, data);
                                userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                                responseContinueEdit(chatId);
                            } else {
                                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ, hãy nhập "Mua" hoặc "Bán".');
                                userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            }
                            break;
                        case 2:
                            if (isValidTokenAddress(userState.contentEdit)) {
                                data["transactions"][userState.indexTransaction - 1].tokenAddress = userState.contentEdit;
                                saveUserInfo(chatId, data);
                                userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                                responseContinueEdit(chatId);
                            } else {
                                bot.sendMessage(chatId, '⛔ Địa chỉ token không hợp lệ. Vui lòng nhập lại.');
                                userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            }
                            break;
                        case 3:
                            if (parseFloat(userState.contentEdit)) {
                                data["transactions"][userState.indexTransaction - 1].quantity = userState.contentEdit;
                                saveUserInfo(chatId, data);
                                userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                                responseContinueEdit(chatId);
                            } else {
                                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập 1 số.');
                                userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            }
                            break;
                        case 4:
                            if (parseFloat(userState.contentEdit)) {
                                data["transactions"][userState.indexTransaction - 1].targetPrice = userState.contentEdit;
                                saveUserInfo(chatId, data);
                                userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                                responseContinueEdit(chatId);
                            } else {
                                bot.sendMessage(chatId, '⛔ Nhập không hợp lệ. Vui lòng nhập 1 số.');
                                userState.state = STATES.WAITING_FOR_CONTENT_EDIT;
                            }
                            break;
                        default:
                            userState.state = STATES.WAITING_FOR_EDIT_NUMBER;
                            bot.sendMessage(chatId, '💁 Nhập 1 để sửa yêu cầu (mua hoặc bán)\nNhập 2 để sửa địa chỉ token\nNhập 3 để sửa số lượng\nNhập 4 để sửa giá khớp lệnh\n Nhập 0 để thoát chỉnh sửa');
                            break;
                    }
                }
            } catch (error) {
                console.log("🚀 ~ Lỗi state WAITING_FOR_CONTENT_EDIT:", error)
                delete userStates[chatId];
            }
            break;
        
        default:
            break;
    }
}

mainBotLoop(bot);

bot.on("polling_error", (msg) => console.log(msg));