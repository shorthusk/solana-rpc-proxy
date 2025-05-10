// server/server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const ALCHEMY_MAINNET_RPC = process.env.ALCHEMY_MAINNET_RPC;
const ALCHEMY_DEVNET_RPC = process.env.ALCHEMY_DEVNET_RPC;

app.post('/rpc/:cluster', async (req, res) => {
  try {
    const { cluster } = req.params;
    const rpcUrl = cluster === 'mainnet-beta' ? ALCHEMY_MAINNET_RPC : ALCHEMY_DEVNET_RPC;
    if (!rpcUrl) {
      return res.status(400).json({ error: `No RPC endpoint for cluster: ${cluster}` });
    }
    const response = await axios.post(rpcUrl, req.body, {
      headers: { 'Content-Type': 'application/json' },
    });
    res.json(response.data);
  } catch (error) {
    console.error('RPC proxy error:', error.message);
    res.status(500).json({ error: 'Failed to proxy RPC request: ' + error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));