// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('grpc');
var raft_raft_pb = require('../raft/raft_pb.js');

function serialize_AppendEntryReply(arg) {
  if (!(arg instanceof raft_raft_pb.AppendEntryReply)) {
    throw new Error('Expected argument of type AppendEntryReply');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_AppendEntryReply(buffer_arg) {
  return raft_raft_pb.AppendEntryReply.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_AppendEntryRequest(arg) {
  if (!(arg instanceof raft_raft_pb.AppendEntryRequest)) {
    throw new Error('Expected argument of type AppendEntryRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_AppendEntryRequest(buffer_arg) {
  return raft_raft_pb.AppendEntryRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_GetNodeAddressRequest(arg) {
  if (!(arg instanceof raft_raft_pb.GetNodeAddressRequest)) {
    throw new Error('Expected argument of type GetNodeAddressRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_GetNodeAddressRequest(buffer_arg) {
  return raft_raft_pb.GetNodeAddressRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_NodeAddress(arg) {
  if (!(arg instanceof raft_raft_pb.NodeAddress)) {
    throw new Error('Expected argument of type NodeAddress');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_NodeAddress(buffer_arg) {
  return raft_raft_pb.NodeAddress.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_RegisterRequest(arg) {
  if (!(arg instanceof raft_raft_pb.RegisterRequest)) {
    throw new Error('Expected argument of type RegisterRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RegisterRequest(buffer_arg) {
  return raft_raft_pb.RegisterRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_RegisterResponse(arg) {
  if (!(arg instanceof raft_raft_pb.RegisterResponse)) {
    throw new Error('Expected argument of type RegisterResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RegisterResponse(buffer_arg) {
  return raft_raft_pb.RegisterResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_RequestVoteReply(arg) {
  if (!(arg instanceof raft_raft_pb.RequestVoteReply)) {
    throw new Error('Expected argument of type RequestVoteReply');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RequestVoteReply(buffer_arg) {
  return raft_raft_pb.RequestVoteReply.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_RequestVoteRequest(arg) {
  if (!(arg instanceof raft_raft_pb.RequestVoteRequest)) {
    throw new Error('Expected argument of type RequestVoteRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_RequestVoteRequest(buffer_arg) {
  return raft_raft_pb.RequestVoteRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_ServeClientArgs(arg) {
  if (!(arg instanceof raft_raft_pb.ServeClientArgs)) {
    throw new Error('Expected argument of type ServeClientArgs');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_ServeClientArgs(buffer_arg) {
  return raft_raft_pb.ServeClientArgs.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_ServeClientReply(arg) {
  if (!(arg instanceof raft_raft_pb.ServeClientReply)) {
    throw new Error('Expected argument of type ServeClientReply');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_ServeClientReply(buffer_arg) {
  return raft_raft_pb.ServeClientReply.deserializeBinary(new Uint8Array(buffer_arg));
}


// Define Raft service
var RaftServiceService = exports.RaftServiceService = {
  register: {
    path: '/RaftService/Register',
    requestStream: false,
    responseStream: false,
    requestType: raft_raft_pb.RegisterRequest,
    responseType: raft_raft_pb.RegisterResponse,
    requestSerialize: serialize_RegisterRequest,
    requestDeserialize: deserialize_RegisterRequest,
    responseSerialize: serialize_RegisterResponse,
    responseDeserialize: deserialize_RegisterResponse,
  },
  requestVote: {
    path: '/RaftService/RequestVote',
    requestStream: false,
    responseStream: false,
    requestType: raft_raft_pb.RequestVoteRequest,
    responseType: raft_raft_pb.RequestVoteReply,
    requestSerialize: serialize_RequestVoteRequest,
    requestDeserialize: deserialize_RequestVoteRequest,
    responseSerialize: serialize_RequestVoteReply,
    responseDeserialize: deserialize_RequestVoteReply,
  },
  appendEntry: {
    path: '/RaftService/AppendEntry',
    requestStream: false,
    responseStream: false,
    requestType: raft_raft_pb.AppendEntryRequest,
    responseType: raft_raft_pb.AppendEntryReply,
    requestSerialize: serialize_AppendEntryRequest,
    requestDeserialize: deserialize_AppendEntryRequest,
    responseSerialize: serialize_AppendEntryReply,
    responseDeserialize: deserialize_AppendEntryReply,
  },
  serveClient: {
    path: '/RaftService/ServeClient',
    requestStream: true,
    responseStream: true,
    requestType: raft_raft_pb.ServeClientArgs,
    responseType: raft_raft_pb.ServeClientReply,
    requestSerialize: serialize_ServeClientArgs,
    requestDeserialize: deserialize_ServeClientArgs,
    responseSerialize: serialize_ServeClientReply,
    responseDeserialize: deserialize_ServeClientReply,
  },
  getNodeAddress: {
    path: '/RaftService/GetNodeAddress',
    requestStream: false,
    responseStream: true,
    requestType: raft_raft_pb.GetNodeAddressRequest,
    responseType: raft_raft_pb.NodeAddress,
    requestSerialize: serialize_GetNodeAddressRequest,
    requestDeserialize: deserialize_GetNodeAddressRequest,
    responseSerialize: serialize_NodeAddress,
    responseDeserialize: deserialize_NodeAddress,
  },
};

exports.RaftServiceClient = grpc.makeGenericClientConstructor(RaftServiceService);
