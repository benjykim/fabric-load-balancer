#!/bin/bash
# Orderer
printf "Orderer\n"
ls crypto-config/ordererOrganizations/example.com/users/Admin@example.com/msp/keystore/

printf "\nOrg1\n"
# Org1
ls crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore
ls crypto-config/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore

printf "\nOrg2\n"
# Org2
ls crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/keystore
ls crypto-config/peerOrganizations/org2.example.com/users/User1@org2.example.com/msp/keystore

printf "\nOrg3\n"
# Org3
ls crypto-config/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp/keystore
ls crypto-config/peerOrganizations/org3.example.com/users/User1@org3.example.com/msp/keystore
