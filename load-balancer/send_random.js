/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { FileSystemWallet, Gateway } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const axios = require('axios')
const yaml = require('js-yaml')

const ccpPath = path.resolve(__dirname, '..', 'environment-settings', 'connection.json');
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);

const org1_endorsingPeers = ['peer0.org1.example.com','peer1.org1.example.com','peer2.org1.example.com']
const org2_endorsingPeers = ['peer0.org2.example.com','peer1.org2.example.com','peer2.org2.example.com']
const org3_endorsingPeers = ['peer0.org3.example.com','peer1.org3.example.com','peer2.org3.example.com']

function get_node_group() {
	let url = 'http://localhost:5002/get_node_group_info'
	return axios.post(url).then(function(response){
		return response.data;
	})
}

function rand(start, end) {
    return Math.floor(Math.random() * (end-start+1) + start);
}

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

        for (let i = 0; i < 200; i++) {
            const endorsingPeers = []
            const org1_endorsingPeer = channel.getChannelPeer(org1_endorsingPeers[rand(0,3)])
            const org2_endorsingPeer = channel.getChannelPeer(org2_endorsingPeers[rand(0,3)])
            const org3_endorsingPeer = channel.getChannelPeer(org3_endorsingPeers[rand(0,3)])

            endorsingPeers.push(org1_endorsingPeer, org2_endorsingPeer, org3_endorsingPeer)

            const contract = network.getContract('smallbank');
            await contract.createTransaction('create_account')
            .setEndorsingPeers(endorsingPeers)
            .submit('2','cindy','1000000','1000000')
            // await sleep(2);
        }
        gateway.disconnect()
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        process.exit(1);
    }
}

main();