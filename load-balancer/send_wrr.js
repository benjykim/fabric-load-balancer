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

function get_node_group() {
    let url = 'http://localhost:5002/get_node_group_info'
    
	return axios.post(url).then(function(response){
		return response.data;
	})
}

function get_func_cost() {
	const file = fs.readFileSync('./cc_func_cost.yaml', 'utf-8');
    const data = yaml.safeLoad(file);
    let cc_funcs = [];

	for (let i = 0; i < data['functions'].length; i++) {
		cc_funcs.push(data['functions'][i]);
    }
    return cc_funcs;
}	

function get_total_weight(node_groups) {
    let total_weight = 0;

    for (let i = 0; i < node_groups.length; i++) {
        total_weight += node_groups[i]['weight'];
    }
    return total_weight;
}

function get_num_of_group_funcs(node_groups, num_of_funcs, total_weight) {
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
    return [num_of_group1_funcs, num_of_group2_funcs, num_of_group3_funcs];
}

function select_target_group(num_of_group_funcs, cc_funcs) {
    let target_group = 0;
    let group1_funcs = cc_funcs.slice(0, num_of_group_funcs[0]);
    let group2_funcs = cc_funcs.slice(num_of_group_funcs[0], num_of_group_funcs[0] + num_of_group_funcs[1]);
    let group3_funcs = cc_funcs.slice(num_of_group_funcs[0] + num_of_group_funcs[1], num_of_group_funcs[0] + num_of_group_funcs[1] + num_of_group_funcs[2]);

    for (let i = 0; i < num_of_group_funcs.length; i++) {
        for (let k = 0; k < group1_funcs.length; k++) {
            if ('send_payment' == group1_funcs[k]['function']['functionName']) {
                target_group = 1;
                break;
            }
        }
        for (let k = 0; k < group2_funcs.length; k++) {
            if ('send_payment' == group2_funcs[k]['function']['functionName']) {
                target_group = 2;
                break;
            }
        }
        for (let k = 0; k < group3_funcs.length; k++) {
            if ('send_payment' == group3_funcs[k]['function']['functionName']) {
                target_group = 3;
                break;
            }
        }
    }
    return target_group;
}

function modify_target_group_with_load_factor(node_groups) {
    let target_group = 0;

    // if best performance node group's load factor is below 0.8, then use that node group
    // if load_factor < 0.8, query function should be sent to node group 1(not node group3)
    if (node_groups[0]['load_factor'] < 0.8) {
        target_group = 1;
    } else {
        if (node_groups[1]['load_factor'] < 0.8) {
            target_group = 2;
        } else {
            target_group = 3;
        }
    }
    return target_group;
}

function select_endorsing_peers(channel, node_groups, target_group) {
    let endorsing_peers = [];

    // "node_group.length" is used when 3 endorsing peers/"node_group.length-1" is used when 2 endorsing peers
    if (target_group == 1) {
        let node_group = node_groups[0]['node_group'];
        for (let i = 0; i < node_group.length; i++) {
            const endorsing_peer = channel.getChannelPeer(node_group[i])
            endorsing_peers.push(endorsing_peer);
        }
    } else if (target_group == 2) {
        let node_group = node_groups[1]['node_group'];
        for (let i = 0; i < node_group.length; i++) {
            const endorsing_peer = channel.getChannelPeer(node_group[i])
            endorsing_peers.push(endorsing_peer);
        }
    } else if (target_group == 3) {
        let node_group = node_groups[2]['node_group'];
        for (let i = 0; i < node_group.length - 1; i++) {
            const endorsing_peer = channel.getChannelPeer(node_group[i])
            endorsing_peers.push(endorsing_peer);
        }
    }
    return endorsing_peers;
}

const sleep = (ms) => {
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    });
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
        
        let node_groups = await get_node_group();
        let cc_funcs = get_func_cost();
        let num_of_funcs = cc_funcs.length;
        let total_weight = get_total_weight(node_groups)
        let num_of_group_funcs = get_num_of_group_funcs(node_groups, num_of_funcs, total_weight);
        let target_group = select_target_group(num_of_group_funcs, cc_funcs);
        target_group = modify_target_group_with_load_factor(node_groups)

        const txNum = 200
        for (let i = 0; i < txNum; i++) {
            let endorsing_peers = select_endorsing_peers(channel, node_groups, target_group)
            const contract = network.getContract('smallbank');
            await contract.createTransaction('query')
            .setEndorsingPeers(endorsing_peers)
            .submit('0')
            // await sleep(2);
        }
        gateway.disconnect()
    } catch (error) {
        console.error(`Failed to evaluate transaction: ${error}`);
        process.exit(1);
    }
}

main();