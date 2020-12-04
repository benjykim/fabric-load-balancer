/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { FileSystemWallet, Gateway, DefaultQueryHandlerStrategies, QueryHandlerFactory } = require('fabric-network');
const fs = require('fs');
const path = require('path');

const axios = require('axios')
const yaml = require('js-yaml')

const ccpPath = path.resolve(__dirname, '..', '..', 'ben-multi-host', 'connection.json');
const ccpJSON = fs.readFileSync(ccpPath, 'utf8');
const ccp = JSON.parse(ccpJSON);


function get_node_group() {
	let url = 'http://localhost:5002/get_node_group_info'
	return axios.post(url).then(function(response){
		return response.data;
	})
}

function set_func_cost() {
	const file = fs.readFileSync('./cc_func_cost.yaml', 'utf-8');
	const data = yaml.safeLoad(file);
	for (let i = 0; i < data['functions'].length; i++) {
		cc_functions.push(data['functions'][i]);
	}
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

        const org1_peers = ['peer0.org1.example.com', 'peer1.org1.example.com', 'peer2.org1.example.com'];
        const org2_peers = ['peer0.org2.example.com', 'peer1.org2.example.com', 'peer2.org2.example.com'];
        const org3_peers = ['peer0.org3.example.com', 'peer1.org3.example.com', 'peer2.org3.example.com'];

        const cc_functions = [];

        let node_groups = await get_node_group();
        let num_of_funcs = cc_functions.length;
        let total_weight = 0;
        for (let i = 0; i < node_groups.length; i++) {
            total_weight += node_groups[i]['weight'];
        }

        let group1_funcs = []
        let group2_funcs = []
        let group3_funcs = []

        let num_of_group1_funcs = Math.round(num_of_funcs * (node_groups[0]['weight'] / total_weight));
        let num_of_group2_funcs = Math.round(num_of_funcs * (node_groups[1]['weight'] / total_weight));
        let num_of_group3_funcs = Math.round(num_of_funcs * (node_groups[2]['weight'] / total_weight));
         
        while (num_of_group1_funcs + num_of_group2_funcs + num_of_group3_funcs != num_of_funcs) {
            if (num_of_group1_funcs + num_of_group2_funcs + num_of_group3_funcs < num_of_funcs) {
                num_of_group1_funcs++;
            } else if (num_of_group1_funcs + num_of_group2_funcs + num_of_group3_funcs > num_of_funcs) {
                if (0 < num_of_group3_funcs) {
                    num_of_group3_funcs--;
                } else if (0 < num_of_group2_funcs) {
                    num_of_group2_funcs--;
                } else {
                    num_of_group1_funcs--;
                }
            }
        }

        group1_funcs = cc_functions.slice(0, num_of_group1_funcs);
        group2_funcs = cc_functions.slice(num_of_group1_funcs, num_of_group1_funcs + num_of_group2_funcs);
        group3_funcs = cc_functions.slice(num_of_group1_funcs + num_of_group2_funcs, num_of_group1_funcs + num_of_group2_funcs + num_of_group3_funcs);

        let target_group = 0;

        for (let i = 0; i < 200; i++) {
            // const endorsingPeer = channel.getChannelPeer(peers[Math.floor(Math.random()*3)])
            const endorsingPeers = []
            const org1_endorsingPeers = ['peer0.org1.example.com','peer1.org1.example.com','peer2.org1.example.com']
            const org2_endorsingPeers = ['peer0.org2.example.com','peer1.org2.example.com','peer2.org2.example.com']
            // const org3_endorsingPeers = ['peer0.org3.example.com','peer1.org3.example.com','peer2.org3.example.com']

            const org1_endorsingPeer = channel.getChannelPeer(org1_endorsingPeers[rand(0,2)])
            const org2_endorsingPeer = channel.getChannelPeer(org2_endorsingPeers[rand(0,2)])
            // const org3_endorsingPeer = channel.getChannelPeer(org3_endorsingPeers[rand(0,2)])

            endorsingPeers.push(org1_endorsingPeer, org2_endorsingPeer)
            // endorsingPeers.push(endorsingPeers[i%2])

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

function rand(start, end) {
    return Math.floor(Math.random() * (end-start+1) + start);
}

const sleep = (ms) => {
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

main();
