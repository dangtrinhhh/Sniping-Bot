const ethers = require('ethers');
const Web3 = require('web3');
const fs = require('fs');

// Đây là thông tin provider của network bạn muốn kết nối. Trong ví dụ là của testnet BSC. Những thông tin này bạn có thể tìm đơn giản trên document của họ
const providerPath = "wss://bsc-mainnet.core.chainstack.com/ws/5cf621a34e450d8b7f93a3db5a64bd9b"; // chainstack
const provider = new ethers.WebSocketProvider(providerPath);

// mnemonic là từ khóa bí mật khi bạn tạo ví. Có thể là 12 từ hoặc 24 từ
const mnemonic = "design dust ahead ball leg hidden response wall speed fiscal slim warrior"; // metamask

let wallet, account;

// Define the addresses object
const addresses = {
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", // factory contract address lấy từ pancakeswap
    SYMBOL: "BNB" // desired symbol, ví dụ "BNB"
};

const eth_getBlockByNumber = async () => {
    const blockByNumber = await provider.send("eth_getBlockByNumber", ["pending", false]);
    const transactions = blockByNumber.transactions;
    const first20Transactions = transactions.slice(0, 20);
    
    //console.log("Transactions array:", transactions);
    console.log("First 20 transactions:", first20Transactions);
  };
  
eth_getBlockByNumber();

async function init() {
    // trong 1 cái ví bạn tưởng tượng thường có nhiều ngăn. Ở đây cũng vậy, wallet điện tử cũng sẽ có nhiều ngăn, một ngăn tương đương với một address khác nhau.
    // "m/44'/60'/0'/0/0" là chỉ ra mình muốn lấy address ở vị trí đầu tiên index = 0
    // nếu bạn muốn trỏ đến address vị trí thứ 2 thì sẽ là "m/44'/60'/0'/0/1"
    wallet = ethers.Wallet.fromPhrase(mnemonic, "m/44'/60'/0'/0/0");
    
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
        const BNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";

        let tokenIn, tokenOut;
        if(token0 === BNB) {
          tokenIn = token0; 
          tokenOut = token1;
        }
        
        if(token1 == BNB) {
          tokenIn = token1; 
          tokenOut = token0;
        }
        
        if(typeof tokenIn === 'undefined') {
              return;
        }
    });
}

async function main() {
    await init();
    await getBalance();
    await listenNewPair();
}

main();
