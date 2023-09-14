require('dotenv').config();
const chalk = require('chalk');
const { BigNumber } = require('ethers');
const { KNOWN_TOKENS } = require('../constants/polygon/addresses');
const { dualTokensList } = require('../constants/polygon/tokens');
const { fetchQuote, flashPool, toBorrow, Swap, getUniV3Fees, getBPS, getRouter, getState, setState } = require('../utils/utilities');

const dualArb = async () => {
    const [owner] = await ethers.getSigners();
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const Contract = await ethers.getContractFactory("Arbitrage");
    const contract = await Contract.attach(contractAddress);

    for (let i = 0; i < dualTokensList.length; i++) {
        const token1 = dualTokensList[i][0];
        const token2 = dualTokensList[i][1];
        const token1Add = KNOWN_TOKENS[token1];
        const token2Add = KNOWN_TOKENS[token2];
        const borrowAmount = toBorrow(token1Add);
        const borrowAmountStr = borrowAmount.toString();
        const poolAdd = flashPool(token1Add);

        const swaps = [];

        const swap1 = await fetchQuote({
            sellToken: token1Add,
            buyToken: token2Add,
            sellAmount: borrowAmountStr
        });

        const swap2 = await fetchQuote({
            sellToken: token2Add,
            buyToken: token1Add,
            sellAmount: swap1.buyAmount.toString(),
        });

        const amtBack = BigNumber.from(swap2.buyAmount);

        if (!amtBack.gte(borrowAmount.mul(BigNumber.from(10000 + getBPS())).div(BigNumber.from(10000))) || getState()) {

            console.log(
                chalk.yellowBright(`x-------------------------------`),
                chalk.blueBright(`${i + 1}`),
                chalk.greenBright(`[${token1}, ${token2}]`),
                chalk.yellowBright(`-------------------------------x`)
            );
            console.log();

            console.log(`Initial : ${borrowAmountStr} ${token1}`);
            console.log(`Final : ${amtBack} ${token1}`);
            console.log(chalk.red("Loss :", amtBack.sub(borrowAmount)));
            console.log(chalk.redBright("Loss %age :", (Math.abs(amtBack - borrowAmount) / borrowAmount) * 100));
            console.log();
            continue;

        } else {

            setState();
            swap1.sources.sort((a, b) => a.proportion - b.proportion);

            const fees1 = [];
            const routers1 = [];
            const splitPercentage1 = [];
            for (let i = 0; i < swap1.sources.length; i++) {
                if (swap1.sources[i].proportion !== '0') {
                    if (swap1.sources[i].name !== 'Uniswap_V3') {
                        fees1.push(0);
                        routers1.push(getRouter(swap1.sources[i].name));
                        splitPercentage1.push(swap1.sources[i].proportion * 100000000);
                    }
                    else {
                        fees1.push(getUniV3Fees(token1, token2));
                        routers1.push(getRouter(swap1.sources[i].name));
                        splitPercentage1.push(swap1.sources[i].proportion * 100000000);
                    }
                }
            }

            swaps.push(new Swap(
                token1Add,
                token2Add,
                fees1,
                routers1,
                splitPercentage1,
                swap1.allowanceTarget,
                swap1.to,
                swap1.data
            ));

            swap2.sources.sort((a, b) => a.proportion - b.proportion);

            const fees2 = [];
            const routers2 = [];
            const splitPercentage2 = [];
            for (let i = 0; i < swap2.sources.length; i++) {
                if (swap2.sources[i].proportion !== '0') {
                    if (swap2.sources[i].name !== 'Uniswap_V3') {
                        fees2.push(0);
                        routers2.push(getRouter(swap2.sources[i].name));
                        splitPercentage2.push(swap2.sources[i].proportion * 100000000);
                    }
                    else {
                        fees2.push(getUniV3Fees(token2, token1));
                        routers2.push(getRouter(swap2.sources[i].name));
                        splitPercentage2.push(swap2.sources[i].proportion * 100000000);
                    }
                }
            }

            swaps.push(new Swap(
                token2Add,
                token1Add,
                fees2,
                routers2,
                splitPercentage2,
                swap2.allowanceTarget,
                swap2.to,
                swap2.data
            ));

            await contract.dodoFlashLoan(
                poolAdd,
                borrowAmount,
                swaps,
                {
                    gasLimit: 15000000,
                    gasPrice: ethers.utils.parseUnits("151", "gwei"),
                }
            );

            setState();

            console.log(
                chalk.yellowBright(`-------------------------------`),
                chalk.blueBright(`${i + 1}`),
                chalk.greenBright(`[${token1}, ${token2}]`),
                chalk.yellowBright(`-------------------------------`)
            );
            console.log();

            console.log(`Initial : ${borrowAmountStr} ${token1}`);
            console.log(`Final : ${amtBack} ${token1}`);
            console.log(chalk.green("Profit :", amtBack.sub(borrowAmount)));
            console.log(chalk.greenBright("Profit %age :", (Math.abs(amtBack - borrowAmount) / borrowAmount) * 100));
            console.log();
            // return true;
        }

    }
}

const startDualArb = async () => {
    let data;
    const [owner] = await ethers.getSigners();
    const contractAddress = process.env.CONTRACT_ADDRESS;
    const Contract = await ethers.getContractFactory("Arbitrage");
    const contract = await Contract.attach(contractAddress);

    while (data === undefined) {
        data = await dualArb(contract);
    }
}

startDualArb();
