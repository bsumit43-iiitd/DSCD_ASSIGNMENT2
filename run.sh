#!/bin/bash

# Start the first server in a new terminal window
gnome-terminal --tab -- bash -c "node server.js --nodeId 1 --port 2000; exec bash"

# Start the second server in a new terminal window
gnome-terminal --tab -- bash -c "node server.js --nodeId 2 --port 2001 --peer 0.0.0.0:2000; exec bash"

# Start the third server in a new terminal window
gnome-terminal --tab -- bash -c "node server.js --nodeId 3 --port 2002 --peer 0.0.0.0:2000 0.0.0.0:2001; exec bash"


gnome-terminal --tab -- bash -c "node client.js --leader 0.0.0.0:2000; exec bash"