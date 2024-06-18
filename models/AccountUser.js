class AccountUser {
    constructor(secretKey, balance = 0) {
        this.secretKey = secretKey;
        this.address = null;
        this.balance = balance;
        this.transactions = [];
    }

    addTransaction(type, tokenAddress, quantity, condition, sellPrice) {
        let transaction = {
            type: type,
            tokenAddress: tokenAddress,
            quantity: quantity,
            condition: condition,
            sellPrice: sellPrice,
            timeCreated: new Date(),
            timeCompleted: '',
            status: 'pending'
        }
        this.transactions.push(transaction);
    }

    toJSON() {
        return {
            secretKey: this.secretKey,
            address: this.address,
            balance: this.balance,
            transactions: this.transactions
        };
    }
}

module.exports = AccountUser;
