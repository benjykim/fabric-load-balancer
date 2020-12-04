from flask import Flask
from flask_restful import Api, Resource
from apscheduler.schedulers.background import BackgroundScheduler
from pythonping import ping

import docker
import socket, requests as req, json
import ast
import yaml
import copy
import math

# docker
client = docker.from_env()
# Flask
app = Flask(__name__)
api = Api(app)

NUM_OF_ORGS = 3
NUM_OF_PEERS = 3
NODE_IP_ADDRESSES = ['10.21.4.7', '10.21.4.11', '10.21.4.19']
NODE_INFO_MAP = {
    "10.21.4.7": ['peer0.org1.example.com', 'peer1.org1.example.com', 'peer2.org1.example.com'],
    "10.21.4.11": ['peer0.org2.example.com', 'peer1.org2.example.com', 'peer2.org2.example.com'],
    "10.21.4.19": ['peer0.org3.example.com', 'peer1.org3.example.com', 'peer2.org3.example.com']
}

global cpu_info
global mem_info
global net_info
global weight_info
global node_group_info
global latency_info

def initialize_node_weight():
    global weight_info
    cpu_standard = 1
    mem_standard = 1
    net_standard = 1000
    cpu_weight = 0.3
    mem_weight = 0.2
    net_weight = 0.5
    temp_weight_info = []
    yml = yaml.load(open("spec.yaml", 'r'))
    nodeNum = yml['nodeInfoNum']
    nodeInfos = yml['nodeInfos']

    for nodeInfo in nodeInfos:
        cpuInfo = nodeInfo['nodeInfo']['cpuset']
        memInfo = nodeInfo['nodeInfo']['memory']
        netInfo = nodeInfo['nodeInfo']['bandwidth']
        cpu = int(cpuInfo.count(",")) + 1
        mem = int(memInfo[:-1])
        net = int(netInfo[:-2])
        # print(type(nodeInfo['nodeInfo']['nodeName']))
        temp_weight_info.append(ast.literal_eval(
            '{"node"' + ":" + '"' + nodeInfo['nodeInfo']['nodeName'] + '"' + ',' +
            '"weight"' + ":" + str( round((cpu_weight*(cpu/cpu_standard)) + (mem_weight*(mem/mem_standard)) + (net_weight*(net/net_standard))) ) + '}'
        ))
    weight_info = copy.deepcopy(temp_weight_info)

def get_node_group_info():
    global node_group_info
    org_node_list = []
    org_node_list_for_load_factor = []
    temp_node_group_info = []
    
    # Example : load_factor_info = [{'node': 'peer0.org1.example.com', 'load_factor': 0.07645653814428577}, {'node': 'peer1.org1.example.com', 'load_factor': 0.04797094617405684}]
    load_factor_info = get_load_factor_info()
    # Example : node_weight_info = [{'node': 'peer0.org1.example.com', 'weight': 17, 'load_factor': 0.07645653814428577}, {'node': 'peer1.org1.example.com', 'weight': 16, 'load_factor': 0.04797094617405684}]
    node_weight_info = get_node_weight_info(load_factor_info)

    # org_node_list's value is equal to org_node_list_for_load_factor  
    org_node_list = get_org_node_list(node_weight_info)
    org_node_list_for_load_factor = get_org_node_list_for_load_factor(node_weight_info)

    for i in range(0, len(org_node_list)):
        # get node with high weight in each organization (selected node is erased in org_node_list[idx])
        org1_node = find_max_weight_node(org_node_list[0])
        org2_node = find_max_weight_node(org_node_list[1])
        org3_node = find_max_weight_node(org_node_list[2])

        # get node's load factor 
        org1_node_load_factor = get_load_factor(org_node_list_for_load_factor[0], org1_node)
        org2_node_load_factor = get_load_factor(org_node_list_for_load_factor[1], org2_node)
        org3_node_load_factor = get_load_factor(org_node_list_for_load_factor[2], org3_node)
        
        node_group = [org1_node['node'], org2_node['node'], org3_node['node']]
        # set node group's weight to the lowest weight among the nodes in the node group
        node_group_weight = min([org1_node['weight'], org2_node['weight'], org3_node['weight']])
        # set node group's load factor to the highest load factor among the nodes in the node group
        node_group_load_factor = max([org1_node_load_factor, org2_node_load_factor, org3_node_load_factor])
        temp_node_group_info.append(ast.literal_eval(
            '{"node_group"' + ":" + str(node_group) + ',' + 
            '"weight"' + ":" + str(node_group_weight) + ',' +
            '"load_factor"' + ":" + str(node_group_load_factor) + '}'
        ))
    node_group_info = copy.deepcopy(temp_node_group_info)
    print(node_group_info)
    return sorted(node_group_info, key=lambda node: (node['node_group'], node['weight']))

def get_load_factor_info():
    global cpu_info
    global mem_info
    global net_info
    load_factor_info = []
    count = 0
    
    # peer0.org1 ~ peer2.org3 --> total count : 9
    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            load_factor = 1 - (1-1*cpu_info[count]['cpu_usage']) * (1-1*mem_info[count]['mem_usage']) * (1-1*net_info[count]['net_usage'])
            load_factor_info.append(ast.literal_eval(
                '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                '"load_factor"' + ":" + str(load_factor) + '}'
            ))
            count += 1
    return load_factor_info

def get_node_weight_info(load_factor_info):
    global weight_info
    node_weight_info = []
    count = 0

    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            peer_latency = latency_info[count]['latency']
            if peer_latency == 0.0:
                peer_latency = 0.1
            weight = math.ceil( (1-load_factor_info[count]['load_factor']) * weight_info[count]['weight'] + (1/peer_latency))
            if weight <= 0: 
                weight = 1
            node_weight_info.append(ast.literal_eval(
                '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                '"weight"' + ":" + str(weight) + ',' +
                '"load_factor"' + ":" + str(load_factor_info[count]['load_factor']) + '}'
            ))
            count += 1
    return node_weight_info

def get_org_node_list(node_weight_info):
    org_node_list = []
    org_node_list.append(node_weight_info[0:3])
    org_node_list.append(node_weight_info[3:6])
    org_node_list.append(node_weight_info[6:9])
    return org_node_list

def get_org_node_list_for_load_factor(node_weight_info):
    org_node_list_for_load_factor = []
    org_node_list_for_load_factor.append(node_weight_info[0:3])
    org_node_list_for_load_factor.append(node_weight_info[3:6])
    org_node_list_for_load_factor.append(node_weight_info[6:9])
    return org_node_list_for_load_factor

def get_latency(ip_addr):
    response = ping(ip_addr, size=2000, count=50)
    return response.rtt_avg_ms

def set_latency_info():
    global latency_info
    temp_latency_info = []

    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            peer = 'peer' + str(k) + '.org' + str(i) + '.example.com'

            for m in range(0, len(NODE_IP_ADDRESSES)):
                if peer in NODE_INFO_MAP[NODE_IP_ADDRESSES[m]]:
                    peer_latency = get_latency(NODE_IP_ADDRESSES[m])
                    temp_latency_info.append(ast.literal_eval(
                        '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                        '\"latency"' + ":" + str(peer_latency) + '}'
                    ))
    latency_info = copy.deepcopy(temp_latency_info)

def find_max_weight_node(node_list):
    max_weight = max([node['weight'] for node in node_list])
    max_weight_node = [node for node in node_list if node['weight'] == max_weight][0]

    # delete max_weight_node in node_list
    for i in range(0, len(node_list)):
        if node_list[i]['node'] == max_weight_node['node']:
            node_list.pop(i)
            break
    return max_weight_node

def get_load_factor(node_list, node):
    # delete max_weight_load_factor in node_list
    for i in range(0, len(node_list)):
        if node_list[i]['node'] == node['node']:
            node_list.pop(i)
            load_factor = node['load_factor']
            break
    return load_factor
 
def set_cpu_info():
    global cpu_info
    temp_cpu_info = []
    prometheus_ip_address = get_prometheus_ip_address()

    # order: peer0.org1 -> peer1.org1 -> peer0.org2 -> peer1.org2 -> peer0.org3 -> peer1.org3
    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            url = 'http://%s:9090/api/v1/query' % prometheus_ip_address
            param = 'query= sum(rate(container_cpu_usage_seconds_total{name="peer%s.org%s.example.com"}[30s]))' % (k, i)
            res = req.post(url, params=param)
            data = res.content.decode('utf-8')
            json_data = json.loads(data)
            # Example : {"node":"peer0.org1.example.com", "cpu_usage": 3.9}
            temp_cpu_info.append(ast.literal_eval(
                '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                '\"cpu_usage"' + ":" + json_data['data']['result'][0]['value'][1] + '}'
            ))
    cpu_info = copy.deepcopy(temp_cpu_info)

def set_memory_info():
    global mem_info
    temp_mem_info = []
    prometheus_ip_address = get_prometheus_ip_address()

    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            url = 'http://%s:9090/api/v1/query' % prometheus_ip_address
            param = 'query= container_memory_usage_bytes{name="peer%s.org%s.example.com"} / container_spec_memory_limit_bytes{name="peer%s.org%s.example.com"}' % (k, i, k, i)
            res = req.post(url, params=param)
            data = res.content.decode('utf-8')
            json_data = json.loads(data)
            # Example : {"node":"peer0.org1.example.com", "mem_usage": 4.412}
            temp_mem_info.append(ast.literal_eval(
                '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                '\"mem_usage"' + ":" + json_data['data']['result'][0]['value'][1] + '}'
            ))
    mem_info = copy.deepcopy(temp_mem_info)

def set_network_info():
    global net_info
    temp_net_info = []
    net_spec = [
        {'node': 'peer0.org1.example.com', 'bandwidth': 10000}, {'node': 'peer1.org1.example.com', 'bandwidth': 6000}, {'node': 'peer2.org1.example.com', 'bandwidth': 3000},
        {'node': 'peer0.org2.example.com', 'bandwidth': 10000}, {'node': 'peer1.org2.example.com', 'bandwidth': 5000}, {'node': 'peer2.org2.example.com', 'bandwidth': 2000},
        {'node': 'peer0.org3.example.com', 'bandwidth': 9000}, {'node': 'peer1.org3.example.com', 'bandwidth': 4000}, {'node': 'peer2.org3.example.com', 'bandwidth': 1000} 
    ]
    count = 0
    prometheus_ip_address = get_prometheus_ip_address()

    for i in range(1, NUM_OF_ORGS+1):
        for k in range(0, NUM_OF_PEERS):
            url = 'http://%s:9090/api/v1/query' % prometheus_ip_address
            tx_param = 'query= rate(container_network_transmit_bytes_total{name="peer%s.org%s.example.com"}[30s])' % (k, i)
            tx_res = req.post(url, params=tx_param)
            tx_data = tx_res.content.decode('utf-8') 
            tx_json_data = json.loads(tx_data)
            temp_net_info.append(ast.literal_eval(
                '{"node"' + ":" + '"peer' + str(k) + '.org' + str(i) + '.example.com",' + 
                '\"net_usage"' + ":" + str(float(tx_json_data['data']['result'][0]['value'][1]) / float(net_spec[count]['bandwidth']*128)) +'}'
            ))
            count += 1
    net_info = copy.deepcopy(temp_net_info)

def get_prometheus_ip_address():
    containers = client.containers.list()

    for container in containers:
        if str(container.name).startswith('prometheus'):
            return container.attrs["NetworkSettings"]["Networks"]["net_fabric"]["IPAddress"]

# APScheduler
scheduler = BackgroundScheduler()
scheduler.add_job(set_latency_info, 'interval', seconds=15)
scheduler.add_job(set_cpu_info, 'interval', seconds=15)
scheduler.add_job(set_memory_info, 'interval', seconds=15)
scheduler.add_job(set_network_info, 'interval', seconds=15)
scheduler.add_job(get_node_group_info, 'interval', seconds=20)
scheduler.start()

class get_node_group_info(Resource):
    def post(self):
        return node_group_info

api.add_resource(get_node_group_info, '/get_node_group_info')

if __name__ == '__main__':
    initialize_node_weight()
    app.run(host='0.0.0.0', debug=False, port=5002)
