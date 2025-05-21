require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.json());

// Load environment variables
const HELIUS_MAINNET_RPC = process.env.HELIUS_MAINNET_RPC;
const HELIUS_MAINNET_WS = process.env.HELIUS_MAINNET_WS;
const HELIUS_DEVNET_RPC = process.env.HELIUS_DEVNET_RPC;
const HELIUS_DEVNET_WS = process.env.HELIUS_DEVNET_WS;

// HTTP RPC Proxy
app.post('/rpc/:cluster', async (req, res) => {
  const { cluster } = req.params;
  const rpcUrl = cluster === 'mainnet-beta' ? HELIUS_MAINNET_RPC : HELIUS_DEVNET_RPC;
  if (!rpcUrl) {
    return res.status(400).json({ error: `No RPC endpoint for cluster: ${cluster}` });
  }

  const maxRetries = 5;
  const baseDelay = 1000; // ms

  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    try {
      const response = await axios.post(rpcUrl, req.body, {
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json(response.data);
    } catch (error) {
      lastError = error;
      if (error.response && error.response.status === 429 && attempt < maxRetries - 1) {
        console.log(`Rate limit hit, retrying... Attempt ${attempt + 1}`);
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      } else {
        break;
      }
    }
  }

  console.error('RPC proxy error:', lastError.message);
  res.status(lastError.response?.status || 500).json({ error: 'Failed to proxy RPC request: ' + lastError.message });
});

// WebSocket Proxy
const wss = new WebSocket.Server({ server }); // Remove path option

wss.on('connection', (clientWs, req) => {
  // Extract cluster from URL (e.g., /ws/devnet -> devnet)
  const urlParts = req.url.split('/');
  const cluster = urlParts[urlParts.length - 1];
  const wsUrl = cluster === 'mainnet-beta' ? HELIUS_MAINNET_WS : HELIUS_DEVNET_WS;

  if (!wsUrl) {
    console.error(`No WebSocket endpoint for cluster: ${cluster}`);
    clientWs.close(1008, `No WebSocket endpoint for cluster: ${cluster}`);
    return;
  }

  console.log(`WebSocket connection established for cluster: ${cluster}, upstream: ${wsUrl}`);

  // Create a WebSocket connection to the upstream server
  const upstreamWs = new WebSocket(wsUrl);

  // Handle upstream connection errors
  upstreamWs.on('error', (error) => {
    console.error(`Upstream WebSocket error for ${cluster}:`, error.message);
    clientWs.close(1011, `Upstream connection error: ${error.message}`);
  });

  upstreamWs.on('open', () => {
    console.log(`Upstream WebSocket connected for ${cluster}`);
  });

  clientWs.on('error', (error) => {
    console.error(`Client WebSocket error for ${cluster}:`, error.message);
  });

  // Forward messages from client to upstream
  clientWs.on('message', (message) => {
    if (upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(message);
    } else {
      console.warn(`Upstream WebSocket not open for ${cluster}`);
    }
  });

  // Forward messages from upstream to client
  upstreamWs.on('message', (message) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(message);
    }
  });

  // Handle client connection close
  clientWs.on('close', () => {
    console.log(`Client WebSocket closed for ${cluster}`);
    upstreamWs.close();
  });

  // Handle upstream connection close
  upstreamWs.on('close', (code, reason) => {
    console.log(`Upstream WebSocket closed for ${cluster}: ${code} - ${reason}`);
    clientWs.close(code, reason);
  });
});

// Handle WebSocket server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error.message);
});

// Start the server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));