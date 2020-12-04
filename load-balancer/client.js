const grpc = require('grpc')
const protoLoader = require('@grpc/proto-loader')
const packageDefinition = protoLoader.loadSync('./protos/grpclb.proto')
const grpclbProto = grpc.loadPackageDefinition(packageDefinition)
const GrpcLoadBalancerService = grpclbProto.GrpcLoadBalancerService

const client = new GrpcLoadBalancerService('localhost:50051',
    grpc.credentials.createInsecure())

module.exports = client
