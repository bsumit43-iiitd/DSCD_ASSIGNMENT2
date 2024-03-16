const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const uuidv4 = require("uuid").v4;
const portIndex = process.argv.indexOf("--port");
const PORT = portIndex !== -1 ? parseInt(process.argv[portIndex + 1]) : 8082;
const PROTO_FILE = "./raft/raft.proto";
const packageDef = protoLoader.loadSync(path.resolve(__dirname, PROTO_FILE));
const grpcObj = grpc.loadPackageDefinition(packageDef);

const randsec = Math.floor(Math.random() * (10 - 5 + 1)) + 5;

const peerIndex = process.argv.indexOf("--peer");
const peers = peerIndex !== -1 ? process.argv.slice(peerIndex + 1) : [];

const clusterConnectionStrings = new Map();

const nodeIdIndex = process.argv.indexOf("--nodeId");
const nodeId = nodeIdIndex !== -1 ? parseInt(process.argv[nodeIdIndex + 1]) : 0;
console.log("NodeId " + nodeId);

let timeoutId;
let voted_for = {};
let current_leader = {};
let log = [];
let current_role;
let votes_received = {};
let term = 1;
let commit_length;

const request_message = () => {
  Object.values(clusterConnectionStrings).forEach((client) => {
    client.AppendEntry(
      {
        leaderTerm: term,
        leaderId: nodeId,
        prevLogIndex: log.length - 1,
        prevLogTerm: log[log.length - 1]?.term,
        entires: [],
        type: "leader_ack",
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          console.log("Success...");
        }
      }
    );
  });
};

const vote = () => {
  term = term + 1;
  //let count = 1;
  votes_received[term] = [nodeId];
  current_role = "candidate";
  voted_for = { ...voted_for, [term]: nodeId };
  Object.values(clusterConnectionStrings).forEach((client) => {
    client.RequestVote(
      {
        candidateTerm: term,
        candidateId: nodeId,
        last_log_index: log.length - 1,
        last_log_term: log[log.length - 1]?.term,
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          if (response?.voteGranted) {
            votes_received[term] = [...votes_received[term], response?.nodeId];
          }
          if (
            current_role != "leader" &&
            votes_received[term]?.length + 1 >
              Math.ceil((Object.keys(clusterConnectionStrings)?.length + 1) / 2)
          ) {
            console.log("I am a leader");
            current_role = "leader";
            current_leader = nodeId;
            request_message();
            // resetTimeout(randsec * 1000);
          }
          console.log(
            "vote_granted -> " +
              response?.voteGranted +
              " by " +
              response?.nodeId
          );
        }
      }
    );
  });
};

const resetTimeout = (delay) => {
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
  timeoutId = setTimeout(vote, delay);
  console.log(`Timeout reset for ${delay} milliseconds`);
};

const server = new grpc.Server();

server.addService(grpcObj.RaftService.service, {
  AppendEntry: (call, callback) => {
    const { leaderTerm, leaderId, prevLogIndex, prevLogTerm, type } =
      call.request;
    if (type == "leader_ack") {
      if (term < leaderTerm) {
        current_leader = leaderId;
        callback(null, { term: term, success: true, nodeId: nodeId });
      } else {
        callback(null, { term: term, success: false, nodeId: nodeId });
      }
    }
  },
  RequestVote: (call, callback) => {
    const { candidateTerm, candidateId, last_log_index, last_log_term } =
      call.request;
    console.log("Vote Requested By " + candidateId);
    resetTimeout(randsec * 1000);
    if (term < candidateTerm) {
      term = candidateTerm;
      current_role = "follower";
      voted_for = { ...voted_for, [candidateTerm]: candidateId };
      callback(null, { term: term, voteGranted: true, nodeId: nodeId });
    } else {
      callback(null, { term: term, voteGranted: false, nodeId: nodeId });
    }
  },
  Register: (call, callback) => {
    const { msg } = call.request;
    peers.push(msg);
    const client = new grpcObj.RaftService(
      `0.0.0.0:${msg}`,
      grpc.credentials.createInsecure()
    );
    clusterConnectionStrings[msg] = client;
    callback(null, { result: "SUCCESS", port: PORT });
  },
});

server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`Your server has started on port ${port}`);
  }
);

peers.forEach((peer) => {
  const client = new grpcObj.RaftService(
    `0.0.0.0:${peer}`,
    grpc.credentials.createInsecure()
  );
  clusterConnectionStrings[peer] = client;
});

Object.values(clusterConnectionStrings).forEach((client) => {
  client.Register(
    {
      msg: PORT,
    },
    (err, response) => {
      if (err) {
        console.error("Error sending message:", err);
      } else {
        console.log(response?.result);
      }
    }
  );
});

resetTimeout(randsec * 1000);
