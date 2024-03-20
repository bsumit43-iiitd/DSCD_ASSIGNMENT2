const path = require("path");
const grpc = require("@grpc/grpc-js");
const logToFile = require("./logging");
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
let heartbeatId;

let data = {};

let voted_for = {};
let current_leader = {};
let log = [];
let current_role;
let votes_received = {};
let req_msg_vote_received = {};
let current_term = 0;
let commit_index = -1;

const log_fix = (
  client,
  current_term,
  commit_index,
  prevLogIndex,
  prevLogTerm
) => {
  client.AppendEntry(
    {
      leaderTerm: current_term,
      leaderId: nodeId,
      prevLogIndex: prevLogIndex,
      prevLogTerm: prevLogTerm,
      entries: log.slice(prevLogIndex + 1, commit_index),
      leaderCommit: commit_index,
      type: "log_fix",
    },
    (err, response) => {
      if (err) {
        console.error("Error sending message:", err);
        log_fix(
          client,
          current_term,
          commit_index,
          prevLogIndex - 1,
          prevLogIndex >= 0 ? log[prevLogIndex - 1]?.term : -1
        );
      } else {
        console.log(
          "Successfully fixed logs for follower node " + response?.nodeId
        );
      }
    }
  );
};

const req_ack = (current_term, commit_index, prevLogIndex, prevLogTerm) => {
  resetHeartbeat(1000);

  Object.values(clusterConnectionStrings).forEach((client) => {
    client.AppendEntry(
      {
        leaderTerm: current_term,
        leaderId: nodeId,
        prevLogIndex: prevLogIndex,
        prevLogTerm: prevLogTerm,
        entries: [],
        leaderCommit: commit_index,
        type: "req_ack",
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          console.log("Sucess Ack" + response?.nodeId);
        }
      }
    );
  });
};
const request_message = async (type = "heartbeat", log = []) => {
  if (type != "heartbeat") resetHeartbeat(1000);
  let temp_commit_index = commit_index;
  let temp_current_term = current_term;
  let prevLogIndex = log.length - 2;
  let prevLogTerm = log[log.length - 2]?.term;
  Object.values(clusterConnectionStrings).forEach((client) => {
    client.AppendEntry(
      {
        leaderTerm: current_term,
        leaderId: nodeId,
        prevLogIndex: log.length - 2,
        prevLogTerm: log[log.length - 2]?.term || -1,
        entries: type == "heartbeat" ? [] : log.slice(-1),
        leaderCommit: temp_commit_index,
        type: type,
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          console.log(type, response);
          if (type == "heartbeat") {
            console.log("Success...");
          } else if (type == "request_msg") {
            if (response?.success) {
              if (req_msg_vote_received[prevLogIndex + 1]) {
                req_msg_vote_received[prevLogIndex + 1] = [
                  ...req_msg_vote_received[prevLogIndex + 1],
                  response?.nodeId,
                ];
              } else {
                req_msg_vote_received[prevLogIndex + 1] = [response?.nodeId];
              }

              if (
                req_msg_vote_received[prevLogIndex + 1]?.length + 1 >
                Math.ceil(
                  (Object.keys(clusterConnectionStrings)?.length + 1) / 2
                )
              ) {
                let req = log[prevLogIndex + 1].msg;

                if (
                  // temp_commit_index == commit_index &&
                  req?.split(" ")?.[0] == "SET"
                ) {
                  data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];
                  commit_index = commit_index + 1;
                  console.log("Leader", commit_index);
                  req_ack(
                    temp_current_term,
                    commit_index,
                    prevLogIndex,
                    prevLogTerm
                  );
                  return;
                }
              }
            } else {
              if (current_term < response?.term) {
                current_role = "follower";
                if (heartbeatId) {
                  clearInterval(heartbeatId);
                }
              } else {
                //log inconsistency case
                log_fix(
                  client,
                  current_term,
                  commit_index,
                  prevLogIndex - 1,
                  log[prevLogIndex - 1]?.term
                );
              }
            }
          }
        }
      }
    );
  });
};

const vote = () => {
  current_term = current_term + 1;
  //let count = 1;
  votes_received[current_term] = [nodeId];
  current_role = "candidate";
  voted_for = { ...voted_for, [current_term]: nodeId };
  Object.values(clusterConnectionStrings).forEach((client) => {
    client.RequestVote(
      {
        candidateTerm: current_term,
        candidateId: nodeId,
        last_log_index: log.length - 1,
        last_log_term: log[log.length - 1]?.current_term,
      },
      (err, response) => {
        if (err) {
          console.error("Error sending message:", err);
        } else {
          if (response?.voteGranted) {
            votes_received[current_term] = [
              ...votes_received[current_term],
              response?.nodeId,
            ];
          }
          if (
            current_role != "leader" &&
            votes_received[current_term]?.length + 1 >
              Math.ceil((Object.keys(clusterConnectionStrings)?.length + 1) / 2)
          ) {
            resetHeartbeat(1000);
            console.log("I am a leader");
            current_role = "leader";
            current_leader[current_term] = nodeId;
            request_message("leader_ack");
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
  // console.log(`Timeout reset for ${delay} milliseconds`);
};

const resetHeartbeat = (delay) => {
  // Clear previous interval if it exists
  if (heartbeatId) {
    clearInterval(heartbeatId);
  }
  // Set new interval
  heartbeatId = setInterval(request_message, delay);
  // console.log(`Interval reset for ${delay} milliseconds`);
};

const server = new grpc.Server();

server.addService(grpcObj.RaftService.service, {
  ServeClient: (call, callback) => {
    const { request } = call.request;
    const op = request?.split(" ")?.[0];
    const key = request?.split(" ")?.[1];
    const val = request?.split(" ")?.[2];
    console.log(request);
    if (current_role !== "leader") {
      callback(null, {
        data: `Node ${nodeId} is not a leader`,
        success: false,
        leaderId: current_leader?.[current_term] || null,
      });
    } else {
      if (op == "GET") {
        console.log(data);
        callback(null, {
          data: `Value retrieved for ${key}. Value : ${data?.[key]}`,
          success: true,
        });
      } else {
        log.push({ term: current_term, msg: request });
        request_message("request_msg", log).then((res) => {
          callback(null, {
            data: `Set Value successfully at key = ${key} and value = ${val}`,
            success: true,
          });
        });
      }
    }
  },
  AppendEntry: (call, callback) => {
    const {
      leaderTerm,
      leaderId,
      prevLogIndex,
      prevLogTerm,
      type,
      entries,
      leaderCommit,
    } = call.request;
    console.log(type);
    if (type == "heartbeat") {
      // console.log("ResetTimeout");
      resetTimeout(randsec * 1000);
    } else if (type == "leader_ack") {
      if (current_term < leaderTerm) {
        current_leader[current_term] = leaderId;
        callback(null, { term: current_term, success: true, nodeId: nodeId });
      } else {
        callback(null, { term: current_term, success: false, nodeId: nodeId });
      }
    } else if (type == "request_msg") {
      if (leaderTerm < current_term) {
        callback(null, { term: current_term, success: false, nodeId: nodeId });
      } else if (leaderTerm > current_term) {
        leaderTerm == current_term;
        if (prevLogTerm == -1 || log[log.length - 1]?.term == prevLogTerm) {
          if (prevLogIndex == -1 || log.length == prevLogIndex) {
            log.push({
              term: leaderTerm,
              msg: entries[entries.length - 1]?.msg,
            });
            callback(null, {
              term: current_term,
              success: true,
              nodeId: nodeId,
            });
          }
        }
      } else if (leaderTerm == current_term) {
        if (prevLogTerm == -1 || log[log.length - 1]?.term == prevLogTerm) {
          if (prevLogIndex == -1 || log.length - 1 == prevLogIndex) {
            log.push({
              term: leaderTerm,
              msg: entries[entries.length - 1]?.msg,
            });
            callback(null, {
              term: current_term,
              success: true,
              nodeId: nodeId,
            });
          }
        }
      }
    } else if (type == "req_ack") {
      let req = log[prevLogIndex + 1]?.msg;
      if (req?.split(" ")?.[0] == "SET") {
        data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];

        commit_index = Math.min(leaderCommit, log.length - 1);
        console.log("Follower", commit_index);
        callback(null, { term: current_term, success: true, nodeId: nodeId });
      }
    } else if (type == "log_fix") {
      if (prevLogIndex == -1 || log.length - 1 >= prevLogIndex) {
        if (prevLogTerm == -1 || log[prevLogIndex]?.term == prevLogTerm) {
          log = log.slice(prevLogIndex);
          log = [...log, ...entries];
          callback(null, { term: current_term, success: true, nodeId: nodeId });
        } else {
          callback(null, {
            term: current_term,
            success: false,
            nodeId: nodeId,
          });
        }
      }
    }
  },
  RequestVote: (call, callback) => {
    const { candidateTerm, candidateId, last_log_index, last_log_term } =
      call.request;
    console.log("Vote Requested By " + candidateId);
    resetTimeout(randsec * 1000);
    if (current_term < candidateTerm) {
      current_term = candidateTerm;
      current_role = "follower";
      voted_for = { ...voted_for, [candidateTerm]: candidateId };
      callback(null, { term: current_term, voteGranted: true, nodeId: nodeId });
    } else {
      callback(null, {
        term: current_term,
        voteGranted: false,
        nodeId: nodeId,
      });
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
