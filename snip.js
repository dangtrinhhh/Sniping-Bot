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
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB address
    WBNB_USDT_PAIR: "0x16B2e982Ec09F43a53d2FBCdE4B4E4d818Bd88A0" // WBNB-USDT pair address on PancakeSwap
};

const pairAbi = [
    'function getReserves() public view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() external view returns (address)',
    'function token1() external view returns (address)'
];

// ABI của token (ERC20)
const tokenAbi = [
    'function approve(address spender, uint amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)'
];

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

    // pairAbi = [
    //     'function getReserves() public view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
    // ];
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

async function getLiquidity(pairAddress) {
    const pairContract = new ethers.Contract(pairAddress, pairAbi, account);
    const reserves = await pairContract.getReserves();
    const reserve0 = parseFloat(ethers.formatUnits(reserves[0], 18));
    const reserve1 = parseFloat(ethers.formatUnits(reserves[1], 18));

    const bnbPrice = await getBNBPrice();
    const liquidity = reserve0 * bnbPrice;

    return liquidity;
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

        // Kiểm tra thanh khoản
        const liquidity = await getLiquidity(pairAddress);
        if (liquidity < 10000) {
            console.log('Thanh khoản thấp hơn 10000$: ', liquidity);
            return;
        }

        try {
            const amountIn = ethers.parseUnits('0.003', 'ether');
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
    });
}

// Lấy giá BNB
async function getBNBPrice() {
    const pairContract = new ethers.Contract(addresses.WBNB_USDT_PAIR, pairAbi, account);
    const [reserve0, reserve1] = await pairContract.getReserves();
    const token0 = await pairContract.token0();

    let reserveWBNB, reserveUSDT;
    if (token0 === addresses.WBNB) {
        reserveWBNB = reserve0;
        reserveUSDT = reserve1;
    } else {
        reserveWBNB = reserve1;
        reserveUSDT = reserve0;
    }

    const bnbPrice = parseFloat(ethers.formatUnits(reserveUSDT, 18)) / parseFloat(ethers.formatUnits(reserveWBNB, 18));
    console.log(`Current BNB Price: $${bnbPrice}`);
    return bnbPrice;
}

// Hàm swap token về BNB:
// Nhận địa chỉ ví và số phần trăm (%) của tổng số token có trong ví
async function getLiquidity(pairAddress) {
    const pairContract = new ethers.Contract(pairAddress, pairAbi, account);
    const reserves = await pairContract.getReserves();
    const reserve0 = parseFloat(ethers.formatUnits(reserves[0], 18));
    const reserve1 = parseFloat(ethers.formatUnits(reserves[1], 18));

    const bnbPrice = await getBNBPrice();
    const liquidity = reserve0 * bnbPrice; // Assuming reserve0 is WBNB

    return liquidity;
}

async function swapTokenForBNB(tokenAddress, percentage) {
    const tokenBalance = await getTokenBalance(tokenAddress);
    const amountToSwap = tokenBalance.mul(percentage).div(100);

    console.log(`Swapping ${ethers.formatUnits(amountToSwap, 18)} tokens (${percentage}%) for BNB`);

    try {
        const amounts = await router.getAmountsOut(amountToSwap, [tokenAddress, addresses.WBNB]);
        const amountOutMin = amounts[1].mul(95).div(100); // Considering 5% slippage

        const tx = await router.swapExactTokensForETH(
            amountToSwap,
            amountOutMin,
            [tokenAddress, addresses.WBNB],
            account.address,
            Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes from now
            {
                gasLimit: 310000
            }
        );

        console.log('Transaction sent, waiting for receipt...');
        const receipt = await tx.wait();
        console.log('Transaction receipt:', receipt);
    } catch (error) {
        console.log('Error:', error.reason || error.message);
    }
}

// Hàm lấy số dư token
async function getTokenBalance(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, account);
    const balance = await tokenContract.balanceOf(account.address);
    return balance;
}

// Hàm approve token cho router
async function approveToken(tokenAddress, amount) {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, account);
    const tx = await tokenContract.approve(router.address, amount);
    await tx.wait();
    console.log(`Approved ${ethers.formatUnits(amount, 18)} tokens for router`);
}

// Hàm chuyển đổi token
async function transferToken(token1, token2, quantity, desiredPrice) {
    try {
        const amountIn = ethers.parseUnits(quantity.toString(), 18); // Chuyển đổi số lượng sang đơn vị token
        const path = [token1, token2];

        // Lấy số lượng token đầu ra tối thiểu dựa trên desiredPrice
        const amounts = await router.getAmountsOut(amountIn, path);
        const actualPrice = parseFloat(ethers.formatUnits(amounts[1], 18)) / quantity;
        const amountOutMin = ethers.parseUnits((quantity * desiredPrice).toString(), 18);

        console.log(`Actual price: ${actualPrice}, Desired price: ${desiredPrice}`);
        console.log(`Amount out min: ${ethers.formatUnits(amountOutMin, 18)}`);

        // Approve token1 cho router
        await approveToken(token1, amountIn);

        // Thực hiện swap
        const tx = await router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            account.address,
            Math.floor(Date.now() / 1000) + 60 * 10 // 10 phút
        );

        console.log('Transaction sent, waiting for receipt...');
        const receipt = await tx.wait();
        console.log('Transaction receipt:', receipt);
    } catch (error) {
        console.log('Error:', error);
    }
}

async function main() {
    await init();
    await getBalance();
    await transferToken(addresses.WBNB, '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 1, 0.00186)
    // await listenNewPair();

    // await swapTokenForBNB('0xTokenAddress', 25);
}

main();



// nhập địa chỉ ví,
// nhập địa chỉ token
// nhập số lượng