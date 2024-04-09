const path = require("path");
const grpc = require("@grpc/grpc-js");
const { logToFile, removeFileContent } = require("./logging");
const protoLoader = require("@grpc/proto-loader");
const retrieveNodeId = require("./clusterInfo");
const { readmetadataFile, readlogFile } = require("./readLogs");
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

// leader lease
let leaseTimeoutId;

let leaseAcquired = false;
let maxLeaseTimeout = 0;
let leaseExpiration = Date.now();

let data = {};

let heartBeatVote = [];

let voted_for = {};
let current_leader = {};
let log = [];
let current_role;
let votes_received = {};
let req_msg_vote_received = {};
let current_term = 0;
let commit_index = -1;

readmetadataFile().then((res) => {
  commit_index = res?.Commit_length || -1;
  current_term = res?.Term || 0;
});

readlogFile().then((res) => {
  log = res;
  log.forEach((l) => {
    let ins = l?.msg?.split(" ");
    if (ins[0] == "SET") {
      data[ins[1]] == ins[2];
    }
    console.log("Data loaded ", data);
  });
});

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
      entries: log.slice(prevLogIndex + 1, log.length),
      leaderCommit: commit_index,
      type: "log_fix"
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

  Object.entries(clusterConnectionStrings).forEach(([pot, client]) => {
    client.AppendEntry(
      {
        leaderTerm: current_term,
        leaderId: nodeId,
        prevLogIndex: prevLogIndex,
        prevLogTerm: prevLogTerm,
        entries: [],
        leaderCommit: commit_index,
        type: "req_ack"
      },
      (err, response) => {
        if (err) {
          let followerNodeId = retrieveNodeId(pot);
          logToFile(
            "error",
            `Error occurred while sending RPC to Node ${
              followerNodeId || pot
            }.`,
            "dump.txt"
          );
          console.error("Error sending message:");
        } else {
          console.log("Sucess Ack" + response?.nodeId);
        }
      }
    );
  });
};
const request_message = async (type = "heartbeat", log = []) => {
  if (type != "heartbeat") resetHeartbeat(1000);
  if (type == "heartbeat") {
    heartBeatVote = [nodeId];
    logToFile(
      "info",
      `Leader ${current_term} sending heartbeat & Renewing Lease`,
      "dump.txt"
    );
  }
  let temp_commit_index = commit_index;
  let temp_current_term = current_term;
  let prevLogIndex = log.length - 2;
  let prevLogTerm = log[log.length - 2]?.term;
  Object.entries(clusterConnectionStrings).forEach(([pot, client]) => {
    client.AppendEntry(
      {
        leaderTerm: current_term,
        leaderId: nodeId,
        prevLogIndex: log.length - 2,
        prevLogTerm: log[log.length - 2]?.term || -1,
        entries:
          type == "heartbeat"
            ? []
            : type == "no_op"
            ? log.slice(-1)
            : log.slice(commit_index + 1, prevLogIndex + 2), // This will get changed
        leaderCommit: temp_commit_index,
        type: type
      },
      (err, response) => {
        if (err) {
          let followerNodeId = retrieveNodeId(pot);
          logToFile(
            "error",
            `Error occurred while sending RPC to Node ${
              followerNodeId || pot
            }.`,
            "dump.txt"
          );

          console.error("Error sending message:");
        } else {
          if (type == "heartbeat") {
            if (response?.success) {
              heartBeatVote.push(response?.nodeId);
            }
            if (
              heartBeatVote?.length + 1 >=
              Math.ceil((Object.keys(clusterConnectionStrings)?.length + 1) / 2)
            ) {
              leaseExpiration = Date.now() + 10000;
              resetLeaseTimeout(10000, releaseLease);
            }
            console.log("Success...");
          } else if (type == "request_msg" || type == "no_op") {
            if (response?.success) {
              if (req_msg_vote_received[prevLogIndex + 1]) {
                req_msg_vote_received[prevLogIndex + 1] = [
                  ...req_msg_vote_received[prevLogIndex + 1],
                  response?.nodeId
                ];
              } else {
                req_msg_vote_received[prevLogIndex + 1] = [response?.nodeId];
              }

              if (
                req_msg_vote_received[prevLogIndex + 1]?.length + 1 >=
                Math.ceil(
                  (Object.keys(clusterConnectionStrings)?.length + 1) / 2
                )
              ) {
                console.log("Majority Received");
                let req;
                for (let i = commit_index + 1; i < log.length - 1; i++) {
                  console.log("Majority  For Received");
                  req = log[i].msg;
                  if (
                    temp_commit_index == commit_index &&
                    req?.split(" ")?.[0] == "SET"
                  ) {
                    data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];

                    commit_index = Math.max(commit_index, i);
                    temp_commit_index = commit_index;
                    logToFile(
                      "info",
                      `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
                      "metadata.txt"
                    );
                    logToFile(
                      "info",
                      `Node ${nodeId} (leader) committed the entry ${req} to the state machine.`,
                      "dump.txt"
                    );
                  }
                }
                req = log[log.length - 1]?.msg;
                data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];

                commit_index = Math.max(commit_index, log.length - 1);

                temp_commit_index = commit_index;
                logToFile(
                  "info",
                  `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
                  "metadata.txt"
                );
                logToFile(
                  "info",
                  `Node ${nodeId} (leader) committed the entry ${req} to the state machine.`,
                  "dump.txt"
                );
                req_ack(
                  temp_current_term,
                  commit_index,
                  prevLogIndex,
                  prevLogTerm
                );
                // return;

                if (req?.split(" ")?.[0] == "NO-OP") {
                } else if (req?.split(" ")?.[0] == "NO_OP") {
                  commit_index = parseInt(commit_index) + 1;
                  logToFile(
                    "info",
                    `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
                    "metadata.txt"
                  );
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
                logToFile("info", `${nodeId} Stepping down.`, "dump.txt");
                if (heartbeatId) {
                  clearInterval(heartbeatId);
                }
              } else {
                // log inconsistency case
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
  current_term = parseInt(current_term) + 1;
  //let count = 1;
  votes_received[current_term] = [nodeId];
  current_role = "candidate";
  logToFile(
    "info",
    `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
    "metadata.txt"
  );
  // Election timeout log to dump.txt
  logToFile(
    "info",
    `Node ${nodeId} election timer timed out, Starting election.`,
    "dump.txt"
  );

  voted_for = { ...voted_for, [current_term]: nodeId };
  Object.entries(clusterConnectionStrings).forEach(([pot, client]) => {
    client.RequestVote(
      {
        candidateTerm: current_term,
        candidateId: nodeId,
        lastLogIndex: log.length - 1,
        lastLogTerm: log[log.length - 1]?.term || 0
      },
      (err, response) => {
        if (err) {
          let followerNodeId = retrieveNodeId(pot);
          logToFile(
            "error",
            `Error occurred while sending RPC to Node ${
              followerNodeId || pot
            }.`,
            "dump.txt"
          );
          console.error("Error sending message vote:");
        } else {
          if (response?.voteGranted) {
            maxLeaseTimeout = Math.max(
              maxLeaseTimeout,
              response?.oldLeaderLeaseDuration || 0
            );
            votes_received[current_term] = [
              ...votes_received[current_term],
              response?.nodeId
            ];
          }
          if (
            current_role != "leader" &&
            votes_received[current_term]?.length + 1 >=
              Math.ceil((Object.keys(clusterConnectionStrings)?.length + 1) / 2)
          ) {
            logToFile(
              "info",
              "New Leader waiting for Old Leader Lease to timeout.",
              "dump.txt"
            );
            resetLeaseTimeout(maxLeaseTimeout, acquireLease);
            // resetHeartbeat(1000); //will not do in case of leaderlease
            console.log("I am a leader");
            current_role = "leader";
            current_leader[current_term] = nodeId;
            logToFile(
              "info",
              `Node ${nodeId} became the leader for term ${current_term}.`,
              "dump.txt"
            );
            request_message("leader_ack");

            // resetTimeout(randsec * 1000);
          } else if (
            current_role == "leader" &&
            votes_received[current_term]?.length + 1 >=
              Math.ceil((Object.keys(clusterConnectionStrings)?.length + 1) / 2)
          ) {
            if (
              leaseExpiration - Date.now() <
              response?.oldLeaderLeaseDuration
            ) {
              maxLeaseTimeout = response?.oldLeaderLeaseDuration;
              leaseExpiration = Date.now() + response?.oldLeaderLeaseDuration;
              resetLeaseTimeout(maxLeaseTimeout, acquireLease);
            }
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
};

const followerLease = () => {};
const releaseLease = () => {
  logToFile(
    "info",
    `Leader ${nodeId} lease renewal failed. Stepping Down.`,
    "dump.txt"
  );
  leaseAcquired = false;
  current_role = "follower";
};

const acquireLease = () => {
  resetHeartbeat(1000);
  maxLeaseTimeout = 0;
  leaseAcquired = true;
  resetLeaseTimeout(10000, releaseLease);
  // Add NO_OP here
  log.push({ term: current_term, msg: "NO_OP" });
  logToFile("info", `NO_OP ${current_term}`, "logs.txt");
  request_message("no_op", log);
};

const resetLeaseTimeout = (delay, leaseTimeoutFunc) => {
  if (leaseTimeoutId) {
    clearTimeout(leaseTimeoutId);
  }
  leaseExpiration = Date.now() + delay;
  leaseTimeoutId = setTimeout(leaseTimeoutFunc, delay);
};

const resetHeartbeat = (delay) => {
  // Clear previous interval if it exists
  if (heartbeatId) {
    clearInterval(heartbeatId);
  }
  // Set new interval
  heartbeatId = setInterval(request_message, delay);
};

const server = new grpc.Server();

server.addService(grpcObj.RaftService.service, {
  ServeClient: (call, callback) => {
    const { request } = call.request;
    let tmp = request;
    const op = request?.split(" ")?.[0];
    const key = request?.split(" ")?.[1];
    const val = request?.split(" ")?.[2];
    if (!leaseAcquired) {
      callback(null, {
        data: `Node ${nodeId} is not a leader`,
        success: false,
        leaderId: current_leader?.[current_term] || null
      });
    } else {
      logToFile(
        "info",
        `Node ${nodeId} (leader) received an ${tmp} request.`,
        "dump.txt"
      );
      if (op == "GET") {
        callback(null, {
          data: `Value retrieved for ${key}. Value : ${data?.[key]}`,
          success: true
        });
      } else {
        log.push({ term: current_term, msg: request });
        // logging to logs.txt
        logToFile("info", `${tmp} ${current_term}`, "logs.txt");
        const timeoutDuration = 5000;
        let timeoutReached = false;
        const timeoutId = setTimeout(() => {
          timeoutReached = true;
          callback(null, {
            data: `Set Value is unsuccessfull at key = ${key} and value = ${val}`,
            success: false
          });
        }, timeoutDuration);
        request_message("request_msg", log).then((res) => {
          if (!timeoutReached) {
            clearTimeout(timeoutId); // Clear the timeout
            callback(null, {
              data: `Set Value successfully at key = ${key} and value = ${val}`,
              success: true
            });
          }
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
      leaderCommit
    } = call.request;
    if (type == "heartbeat") {
      console.log("Recieved Heartbeat");
      leaseExpiration = Date.now() + 10000;
      current_leader[leaderTerm] = leaderId;
      // current_term = leaderTerm;

      resetLeaseTimeout(10000, followerLease);
      callback(null, { term: current_term, success: true, nodeId: nodeId });
      resetTimeout(randsec * 1000);
    } else if (type == "leader_ack") {
      if (current_term <= leaderTerm) {
        current_leader[current_term] = leaderId;
        callback(null, { term: current_term, success: true, nodeId: nodeId });
      } else {
        callback(null, { term: current_term, success: false, nodeId: nodeId });
      }
    } else if (type == "request_msg" || type == "no_op") {
      if (leaderTerm < current_term) {
        logToFile(
          "info",
          `Node ${nodeId} rejected AppendEntries RPC from ${leaderId}.`,
          "dump.txt"
        );
        callback(null, { term: current_term, success: false, nodeId: nodeId });
      } else if (leaderTerm > current_term) {
        leaderTerm == current_term;
        if (prevLogTerm == -1 || log[log.length - 1]?.term == prevLogTerm) {
          if (prevLogIndex == -1 || log.length - 1 == prevLogIndex) {
            let len = entries.length;
            let count = 0;
            for (let temp = leaderCommit + 1; temp <= prevLogIndex; temp++) {
              if (count < len) {
                if (log?.[temp]?.msg != entries[count]?.msg) {
                  log[temp] = {
                    term: entries[count].term,
                    msg: entries[count].msg
                  };
                  logToFile(
                    "info",
                    `${entries[count]?.msg} ${entries[count].term}`,
                    "logs.txt"
                  );
                } else {
                  //continue;
                }
              }
              count++;
            }

            log.push({
              term: leaderTerm,
              msg: entries[entries.length - 1]?.msg
            });
            logToFile(
              "info",
              `${entries[entries.length - 1]?.msg} ${leaderTerm}`,
              "logs.txt"
            );
            logToFile(
              "info",
              `Node ${nodeId} accepted AppendEntries RPC from ${leaderId}.`,
              "dump.txt"
            );
            callback(null, {
              term: current_term,
              success: true,
              nodeId: nodeId
            });
          } else {
            logToFile(
              "info",
              `Node ${nodeId} rejected AppendEntries RPC from ${leaderId}.`,
              "dump.txt"
            );
            callback(null, {
              term: current_term,
              success: false,
              nodeId: nodeId
            });
          }
        } else {
          logToFile(
            "info",
            `Node ${nodeId} rejected AppendEntries RPC from ${leaderId}.`,
            "dump.txt"
          );
          callback(null, {
            term: current_term,
            success: false,
            nodeId: nodeId
          });
        }
      } else if (leaderTerm == current_term) {
        if (prevLogTerm == -1 || log[log.length - 1]?.term == prevLogTerm) {
          if (prevLogIndex == -1 || log.length - 1 == prevLogIndex) {
            let len = entries.length;
            let count = 0;
            for (let temp = leaderCommit + 1; temp <= prevLogIndex; temp++) {
              if (count < len) {
                if (log?.[temp]?.msg != entries[count].msg) {
                  log[temp] = {
                    term: entries[count].term,
                    msg: entries[count].msg
                  };
                  logToFile(
                    "info",
                    `${entries[count]?.msg} ${entries[count].term}`,
                    "logs.txt"
                  );
                } else {
                }
                count++;
              }
            }
            log.push({
              term: leaderTerm,
              msg: entries[entries.length - 1]?.msg
            });
            logToFile(
              "info",
              `${entries[entries.length - 1]?.msg} ${leaderTerm}`,
              "logs.txt"
            );
            logToFile(
              "info",
              `Node ${nodeId} accepted AppendEntries RPC from ${leaderId}.`,
              "dump.txt"
            );
            callback(null, {
              term: current_term,
              success: true,
              nodeId: nodeId
            });
          } else {
            logToFile(
              "info",
              `Node ${nodeId} rejected AppendEntries RPC from ${leaderId}.`,
              "dump.txt"
            );
            callback(null, {
              term: current_term,
              success: false,
              nodeId: nodeId
            });
          }
        } else {
          logToFile(
            "info",
            `Node ${nodeId} rejected AppendEntries RPC from ${leaderId}.`,
            "dump.txt"
          );
          callback(null, {
            term: current_term,
            success: false,
            nodeId: nodeId
          });
        }
      }
    } else if (type == "req_ack") {
      let req = log[prevLogIndex + 1]?.msg;
      if (req?.split(" ")?.[0] == "SET") {
        data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];

        commit_index = Math.min(leaderCommit, log.length - 1);
        logToFile(
          "info",
          `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
          "metadata.txt"
        );
        logToFile(
          "info",
          `Node ${nodeId} (follower) committed the entry ${req} to the state machine.`,
          "dump.txt"
        );
        callback(null, { term: current_term, success: true, nodeId: nodeId });
      } else if (req?.split(" ")?.[0] == "SET") {
        commit_index = Math.min(leaderCommit, log.length - 1);

        logToFile(
          "info",
          `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
          "metadata.txt"
        );
      }
    } else if (type == "log_fix") {
      if (prevLogIndex == -1 || log.length - 1 >= prevLogIndex) {
        if (prevLogTerm == -1 || log[prevLogIndex]?.term == prevLogTerm) {
          //log = log.slice(prevLogIndex);
          log = [...log, ...entries];

          for (let i = 0; i < log.length - 1; i++) {
            let req = log[i].msg;
            if (req?.split(" ")?.[0] == "SET") {
              data[req?.split(" ")?.[1]] = req?.split(" ")?.[2];
              commit_index = Math.max(commit_index, i);
            }
          }
          //commit_index = prevLogIndex;
          logToFile(
            "info",
            `Commit_length: ${commit_index}, Term: ${current_term}, NodeId: ${nodeId} `,
            "metadata.txt"
          );

          removeFileContent("logs.txt")
            .then((message) => {
              log.forEach((l) => {
                logToFile("info", `${l.msg} ${l.term}`, "logs.txt");
              });
            })
            .catch((error) => {
              console.error("Error occurred on logfix clear:", error);
            });
          callback(null, { term: current_term, success: true, nodeId: nodeId });
        } else {
          callback(null, {
            term: current_term,
            success: false,
            nodeId: nodeId
          });
        }
      }
    }
  },
  RequestVote: (call, callback) => {
    const { candidateTerm, candidateId, lastLogIndex, lastLogTerm } =
      call.request;
    console.log("Vote Requested By " + candidateId);
    resetTimeout(randsec * 1000);
    if (current_term < candidateTerm) {
      current_term = candidateTerm;
      voted_for = { ...voted_for, [candidateTerm]: "" };

      logToFile(
        "info",
        `Commit_length: ${commit_index}, Term: ${candidateTerm}, NodeId: ${nodeId} `,
        "metadata.txt"
      );
      if (current_role == "leader") {
        logToFile("info", `${nodeId} Stepping down.`, "dump.txt");
      }
      let last_term = 0;
      if (log.length > 0) {
        last_term = log[log.length - 1].term;
      }
      let log_ok =
        lastLogTerm > last_term ||
        (lastLogTerm == last_term && lastLogIndex + 1 >= log.length);

      if (
        candidateTerm == current_term &&
        log_ok &&
        (!voted_for[candidateTerm] || voted_for[candidateTerm] == candidateId)
      ) {
        current_role = "follower";
        voted_for = { ...voted_for, [candidateTerm]: candidateId };
        logToFile(
          "info",
          `Vote granted for Node ${candidateId} in term ${current_term}.`,
          "dump.txt"
        );
        let dur = leaseExpiration - Date.now();
        callback(null, {
          term: current_term,
          voteGranted: true,
          nodeId: nodeId,
          oldLeaderLeaseDuration: dur > 0 ? dur : 0
        });
      } else {
        logToFile(
          "error",
          `Vote denied for Node ${candidateId} in term ${current_term}.`,
          "dump.txt"
        );
        callback(null, {
          term: current_term,
          voteGranted: false,
          nodeId: nodeId
        });
      }
    } else {
      logToFile(
        "error",
        `Vote denied for Node ${candidateId} in term ${current_term}.`,
        "dump.txt"
      );
      callback(null, {
        term: current_term,
        voteGranted: false,
        nodeId: nodeId
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
  }
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
    `${peer}`,
    grpc.credentials.createInsecure()
  );
  clusterConnectionStrings[peer] = client;
});

Object.values(clusterConnectionStrings).forEach((client) => {
  client.Register(
    {
      msg: PORT
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

resetTimeout(randsec * 10000);
