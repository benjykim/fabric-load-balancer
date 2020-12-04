#!/bin/bash
docker rm -f $(docker ps -a -q)

docker volume rm net_orderer.example.com
docker volume rm net_peer0.org1.example.com
docker volume rm net_peer1.org1.example.com
docker volume rm net_peer2.org1.example.com

docker network rm net_fabric

# sudo rm -rf crypto-config channel-artifacts

# mkdir channel-artifacts

