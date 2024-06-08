const ethers = require('ethers');
const fs = require('fs');

// Thông tin provider của network BSC mainnet
const providerPath = "wss://bsc-mainnet.core.chainstack.com/ws/5cf621a34e450d8b7f93a3db5a64bd9b";
const provider = new ethers.WebSocketProvider(providerPath);

// mnemonic là từ khóa bí mật khi bạn tạo ví
const mnemonic = "notable butter random idea pet iron bullet book brown mixed melody clutch";

let wallet, account;

// Define the addresses object
const addresses = {
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // factory contract address của pancakeswap
    SYMBOL: "BNB", // symbol, ví dụ "BNB"
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // router contract address của pancakeswap
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" // WBNB address
};

async function init() {
    wallet = ethers.Wallet.fromPhrase(mnemonic, "m/44'/60'/0'/0/1");
    account = wallet.connect(provider);
    console.log("🚀 ~ account:", account);

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
}

async function getBalance() {
    const balance = await account.provider.getBalance(account.address);
    const ethBalance = ethers.formatUnits(balance, "ether");
    console.log(`
    ACCOUNT INFO
    =================
    Address: ${account.address}
    Balance: ${ethBalance} ${addresses.SYMBOL}
    `);
}

async function checkPairExists(tokenA, tokenB) {
    const pairAddress = await factory.getPair(tokenA, tokenB);
    if (pairAddress !== ethers.AddressZero) {
        console.log(`Pair exists at address: ${pairAddress}`);
        return true;
    } else {
        console.log('Pair does not exist.');
        return false;
    }
}

async function listenNewPair() {
    factory.on('PairCreated', async (token0, token1, pairAddress) => {
        console.log(`
        =================
        token0: ${token0}
        token1: ${token1}
        pairAddress: ${pairAddress}
        =================
        `);

        let tokenIn, tokenOut;
        if (token0 === addresses.WBNB) {
            tokenIn = token0;
            tokenOut = token1;
        } else if (token1 === addresses.WBNB) {
            tokenIn = token1;
            tokenOut = token0;
        } else {
            console.log('Pair does not involve WBNB, skipping...');
            return;
        }

        // Kiểm tra cặp thanh khoản có tồn tại chưa
        const pairExists = await checkPairExists(tokenIn, tokenOut);
        if (!pairExists) {
            console.log('Cặp thanh khoản chưa tồn tại, bỏ qua.');
            return;
        }

        try {
            const amountIn = ethers.parseUnits('0.003', 'ether');
            const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
            console.log("🚀 ~ amounts:", amounts);

            const amountOutMin = 0;
            console.log("🚀 ~ amountOutMin:", amountOutMin.toString());

            const tx = await router.swapExactETHForTokens(
                amountOutMin,
                [tokenIn, tokenOut],
                account.address,
                Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes from now
                {
                    gasPrice: await provider.getGasPrice(),
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
    });
}

async function main() {
    await init();
    await getBalance();
    await listenNewPair();
}

main();
