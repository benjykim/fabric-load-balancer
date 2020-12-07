/*
 * SPDX-License-Identifier: Apache-2.0
 */

'us strict';

const { FileSystemWallet, Gateway } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const ccpPath = path.resolve(__dirname, '..', 'environment-settings', 'connection.json');
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);

const org1_endorsingPeers = ['peer0.org1.example.com','peer1.org1.example.com','peer2.org1.example.com']
const org2_endorsingPeers = ['peer0.org2.example.com','peer1.org2.example.com','peer2.org2.example.com']
const org3_endorsingPeers = ['peer0.org3.example.com','peer1.org3.example.com','peer2.org3.example.com']

const sleep = (ms) => {
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function main() {
    try {

        // Create a new file system based wallet for managing identities.
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = new FileSystemWallet(walletPath);
        console.log(`Wallet path: ${walletPath}`);

        // Check to see if we've already enrolled the user.
        const userExists = await wallet.exists('admin');
        if (!userExists) {
            console.log('An identity for the user "user1" does not exist in the wallet');
            console.log('Run the registerUser.js application before retrying');
            return;
        }

        // Create a new gateway for connecting to our peer node.
        const gateway = new Gateway();
        await gateway.connect(ccp, { wallet, identity: 'admin', discovery: { enabled: false } });
        // Get the network (channel) our contract is deployed to.
        const network = await gateway.getNetwork('mychannel');
        const channel = network.getChannel();       

        let target_group = 0;
        for (let i = 0; i < 200; i++) {
            const endorsingPeers = []
            target_group += 1
            if (target_group % 3 == 0) {
                for (let i = 0; i < org1_endorsingPeers.length; i++) {
                    const endorsingPeer = channel.getChannelPeer(org1_endorsingPeers[i])
                    endorsingPeers.push(endorsingPeer);
                }
            } else if (target_group % 3 == 1) {
                for (let i = 0; i < org2_endorsingPeers.length; i++) {
                    const endorsingPeer = channel.getChannelPeer(org2_endorsingPeers[i])
                    endorsingPeers.push(endorsingPeer);
                }
            } else if (target_group % 3 == 2) {
                for (let i = 0; i < org3_endorsingPeers.length; i++) {
                    const endorsingPeer = channel.getChannelPeer(org3_endorsingPeers[i])
                    endorsingPeers.push(endorsingPeer);
                }
            }

            const contract = network.getContract('smallbank');
            await contract.createTransaction('send_payment')
            .setEndorsingPeers(endorsingPeers)
            .submit('100','1','0')
            // await sleep(2);
        }
        gateway.disconnect()
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        process.exit(1);
    }
}

main();