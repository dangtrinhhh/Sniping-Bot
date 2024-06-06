// Import BigNumber from bignumber.js
const BigNumber = require('bignumber.js');
const ethers = require('ethers');
const Web3 = require('web3');
const fs = require('fs');

// Đây là thông tin provider của network bạn muốn kết nối. Trong ví dụ là của testnet BSC. Những thông tin này bạn có thể tìm đơn giản trên document của họ
const providerPath = "wss://bsc-mainnet.core.chainstack.com/ws/5cf621a34e450d8b7f93a3db5a64bd9b"; // chainstack
const provider = new ethers.WebSocketProvider(providerPath);

// mnemonic là từ khóa bí mật khi bạn tạo ví. Có thể là 12 từ hoặc 24 từ
// const mnemonic = "design dust ahead ball leg hidden response wall speed fiscal slim warrior"; // metamask
const mnemonic = "notable butter random idea pet iron bullet book brown mixed melody clutch"; // metamask

let wallet, account;

// Define the addresses object
const addresses = {
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // factory contract address lấy từ pancakeswap
    // factory: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // factory contract address lấy từ pancakeswap
    SYMBOL: "BNB", // desired symbol, ví dụ "BNB"
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E"
};

// const eth_getBlockByNumber = async () => {
//     const blockByNumber = await provider.send("eth_getBlockByNumber", ["pending", false]);
//     const transactions = blockByNumber.transactions;
//     const first20Transactions = transactions.slice(0, 20);
    
//     //console.log("Transactions array:", transactions);
//     console.log("First 20 transactions:", first20Transactions);
//   };
  
// eth_getBlockByNumber();

async function init() {
    // trong 1 cái ví bạn tưởng tượng thường có nhiều ngăn. Ở đây cũng vậy, wallet điện tử cũng sẽ có nhiều ngăn, một ngăn tương đương với một address khác nhau.
    // "m/44'/60'/0'/0/0" là chỉ ra mình muốn lấy address ở vị trí đầu tiên index = 0
    // nếu bạn muốn trỏ đến address vị trí thứ 2 thì sẽ là "m/44'/60'/0'/0/1"
    wallet = ethers.Wallet.fromPhrase(mnemonic, "m/44'/60'/0'/0/1");
    
    // bắt đầu connect với ví trên blockchain
    account = wallet.connect(provider);
    console.log("🚀 ~ account:", account);
    
    factory = new ethers.Contract(
        addresses.factory,
        [
            'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
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

// in thông tin ví
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

async function listenNewPair() {
    factory.on('PairCreated', async (token0, token1, pairAddress) => {
        // khi có cặp list sàn, thì hàm này sẽ được chạy và print cho chúng ta thông tin của cặp đó.
        // token0: là địa chỉ của token mới được tạo hoặc cũng có thế là BNB
        // token1: là địa chỉ của token mới được tạo hoặc cũng có thể là BNB
        // nghĩa là nếu token0 là địa chỉ của BNB thì token1 là địa chỉ của token mới được tạo và ngược lại
        // pairAddress: là địa chỉ của cặp thanh khoản
        console.log(`
        =================
        token0: ${token0}
        token1: ${token1}
        pairAddress: ${pairAddress}
        =================
        `);
        
        // Kiểm tra nếu cặp có BNB thì mới nhận
        // const BNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
        const BNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

        let tokenIn, tokenOut;
        if(token0 === BNB) {
        //     console.log(`
        // =================
        // token: ${token1}
        // pairAddress: ${pairAddress}
        // =================
        // `);
            tokenIn = token0; 
            tokenOut = token1;
        }
        
        if(token1 == BNB) {
        //     console.log(`
        // =================
        // token: ${token0}
        // pairAddress: ${pairAddress}
        // =================
        // `);
            tokenIn = token1; 
            tokenOut = token0;
        }
        
        if(typeof tokenIn === 'undefined') {
            console.log('return');
            return;
        }

        // Mình muốn mua token mới với 0.1BNB
        // const amountIn = ethers.utils.parseUnits('0.003', 'ether');
        try {
            const amountIn = ethers.parseUnits('0.003', 'ether');
            const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
            console.log("🚀 ~ amounts:", amounts)
            // const amountOutMin = amounts[1].sub(amounts[1].div(10));

            const amountOutMin = new BigNumber(amounts[1]).minus(new BigNumber(amounts[1]).dividedBy(10)).toString();
            console.log("🚀 ~ amountOutMin:", amountOutMin)
            const tx = await router.swapExactETHForTokens(
                amountOutMin,
                [tokenIn, tokenOut],
                addresses.recipient,
                Date.now() + 1000 * 60 * 10, //10 minutes
                {
                    gasPrice: provider.getGasPrice(),
                    gasLimit: 2100000
                }
            );
            console.log("🚀 ~ tx:", tx)
            
            const receipt = await tx.wait(); 
            console.log("🚀 ~ receipt:", receipt)
        } catch(error) {
            console.log(error.reason);
        }

    });
}

async function main() {
    await init();
    await getBalance();
    await listenNewPair();
}

main();
