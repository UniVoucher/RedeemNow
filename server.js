const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const ALCHEMY_KEY = process.env.ALCHEMY_KEY;
const PARTNER_ADDRESS = process.env.PARTNER_ADDRESS;
const SERVICE_PRIVATE_KEY = process.env.SERVICE_PRIVATE_KEY;

// Validate required environment variables
if (!ALCHEMY_KEY) {
  console.error('❌ ALCHEMY_KEY environment variable is required');
  process.exit(1);
}

if (!PARTNER_ADDRESS) {
  console.error('❌ PARTNER_ADDRESS environment variable is required');
  process.exit(1);
}

if (!SERVICE_PRIVATE_KEY) {
  console.error('❌ SERVICE_PRIVATE_KEY environment variable is required');
  process.exit(1);
}

// UniVoucher contract configuration
const UNIVOUCHER_ADDRESS = '0x51553818203e38ce0E78e4dA05C07ac779ec5b58';
const UNIVOUCHER_ABI = [
  "function getCardData(string memory cardId) external view returns (bool active, address tokenAddress, uint256 tokenAmount, uint256 feePaid, address creator, string memory message, string memory encryptedPrivateKey, address slotId, uint256 timestamp, address redeemedBy, address cancelledBy, address partnerAddress, uint256 finalizedTimestamp)",
  "function redeemCard(string memory cardId, address payable to, bytes memory signature, address payable partner) external",
  "function isCardActive(string memory cardId) external view returns (bool)"
];

// Chain configurations
const CHAINS = {
  1: { name: 'Ethereum', rpc: 'eth-mainnet', symbol: 'ETH', decimals: 18 },
  56: { name: 'BNB Chain', rpc: 'bnb-mainnet', symbol: 'BNB', decimals: 18 },
  137: { name: 'Polygon', rpc: 'polygon-mainnet', symbol: 'POL', decimals: 18 },
  10: { name: 'Optimism', rpc: 'opt-mainnet', symbol: 'ETH', decimals: 18 },
  42161: { name: 'Arbitrum', rpc: 'arb-mainnet', symbol: 'ETH', decimals: 18 },
  8453: { name: 'Base', rpc: 'base-mainnet', symbol: 'ETH', decimals: 18 },
  43114: { name: 'Avalanche', rpc: 'avax-mainnet', symbol: 'AVAX', decimals: 18 }
};

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Decrypt private key using card secret (Node.js implementation)
async function decryptPrivateKey(encryptedData, cardSecret) {
  try {
    const data = JSON.parse(encryptedData);
    const normalizedSecret = cardSecret.replace(/-/g, '');
    
    const salt = Buffer.from(data.salt, 'hex');
    const iv = Buffer.from(data.iv, 'hex');
    const ciphertext = Buffer.from(data.ciphertext, 'base64');
    
    const key = crypto.pbkdf2Sync(normalizedSecret, salt, 310000, 32, 'sha256');
    
    const authTagLength = 16;
    if (ciphertext.length < authTagLength) {
      throw new Error('Invalid ciphertext length');
    }
    
    const authTag = ciphertext.slice(-authTagLength);
    const encryptedContent = ciphertext.slice(0, -authTagLength);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedContent);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error("Invalid card secret");
  }
}

// Get provider for chain
function getProvider(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error('Unsupported chain');
  
  const rpcUrl = `https://${chain.rpc}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

// Get token info
async function getTokenInfo(tokenAddress, chainId, provider) {
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    const chain = CHAINS[chainId];
    return { symbol: chain.symbol, decimals: chain.decimals };
  }
  
  try {
    const erc20Abi = [
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ];
    const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
    return { symbol, decimals };
  } catch (error) {
    return { symbol: 'TOKEN', decimals: 18 };
  }
}

// Format token amount
function formatTokenAmount(amount, decimals) {
  const formatted = parseFloat(ethers.utils.formatUnits(amount, decimals));
  return formatted % 1 === 0 ? formatted.toString() : formatted.toFixed(6).replace(/\.?0+$/, '');
}

// API Routes

// Get card info
app.post('/api/card-info', async (req, res) => {
  try {
    const { cardId } = req.body;
    if (!cardId) return res.status(400).json({ error: 'Card ID required' });

    // Get card from UniVoucher API
    const response = await fetch(`https://api.univoucher.com/v1/cards/single?id=${cardId}`);
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Card not found' });
      }
      throw new Error(`API error: ${response.status}`);
    }

    const card = await response.json();
    
    // Get token info
    const provider = getProvider(card.chainId);
    const tokenInfo = await getTokenInfo(card.tokenAddress, card.chainId, provider);
    
    res.json({
      cardId: card.cardId,
      slotId: card.slotId,
      chainId: card.chainId,
      chainName: CHAINS[card.chainId]?.name || 'Unknown',
      active: card.active,
      status: card.status,
      tokenAddress: card.tokenAddress,
      tokenAmount: card.tokenAmount,
      formattedAmount: `${formatTokenAmount(card.tokenAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`,
      creator: card.creator,
      message: card.message || '',
      encryptedPrivateKey: card.encryptedPrivateKey,
      createdAt: card.createdAt
    });
  } catch (error) {
    console.error('Error getting card info:', error);
    res.status(500).json({ error: 'Failed to get card information' });
  }
});

// Verify card secret
app.post('/api/verify-secret', async (req, res) => {
  try {
    const { cardId, cardSecret } = req.body;
    if (!cardId || !cardSecret) {
      return res.status(400).json({ error: 'Card ID and secret required' });
    }

    // Get card info first
    const response = await fetch(`https://api.univoucher.com/v1/cards/single?id=${cardId}`);
    if (!response.ok) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = await response.json();
    
    if (!card.active) {
      return res.status(400).json({ error: 'This card has already been redeemed or cancelled' });
    }

    // Try to decrypt the private key to verify the secret
    try {
      await decryptPrivateKey(card.encryptedPrivateKey, cardSecret);
      res.json({ valid: true });
    } catch (error) {
      res.status(400).json({ error: 'Invalid card secret' });
    }
  } catch (error) {
    console.error('Error verifying secret:', error);
    res.status(500).json({ error: 'Failed to verify card secret' });
  }
});

// Redeem card (gasless)
app.post('/api/redeem', async (req, res) => {
  try {
    const { cardId, cardSecret, recipientAddress } = req.body;
    
    if (!cardId || !cardSecret || !recipientAddress) {
      return res.status(400).json({ error: 'Card ID, secret, and recipient address required' });
    }

    // Validate recipient address
    if (!ethers.utils.isAddress(recipientAddress)) {
      return res.status(400).json({ error: 'Invalid recipient address' });
    }

    // Get card info
    const response = await fetch(`https://api.univoucher.com/v1/cards/single?id=${cardId}`);
    if (!response.ok) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const card = await response.json();
    
    if (!card.active) {
      return res.status(400).json({ error: 'This card has already been redeemed or cancelled' });
    }

    // Decrypt private key
    const privateKey = await decryptPrivateKey(card.encryptedPrivateKey, cardSecret);
    
    // Create wallet from private key to sign redemption message
    const cardWallet = new ethers.Wallet(privateKey);
    
    // Create message hash for signing
    const messageHash = ethers.utils.solidityKeccak256(
      ["string", "string", "string", "address"],
      ["Redeem card:", cardId, "to:", recipientAddress]
    );
    
    // Sign the message
    const arrayifiedHash = ethers.utils.arrayify(messageHash);
    const signature = await cardWallet.signMessage(arrayifiedHash);
    
    // Execute redemption using service wallet (gasless for user)
    const provider = getProvider(card.chainId);
    const serviceWallet = new ethers.Wallet(SERVICE_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(UNIVOUCHER_ADDRESS, UNIVOUCHER_ABI, serviceWallet);
    
    // Get gas estimate for gasless service (as per UniVoucher docs)
    const gasEstimate = await contract.estimateGas.redeemCard(cardId, recipientAddress, signature, PARTNER_ADDRESS);
    const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
    const gasPrice = await provider.getGasPrice();
    
    // Execute redemption with manual gas settings
    const tx = await contract.redeemCard(cardId, recipientAddress, signature, PARTNER_ADDRESS, {
      gasLimit,
      gasPrice
    });
    const receipt = await tx.wait();
    
    // Get token info for response
    const tokenInfo = await getTokenInfo(card.tokenAddress, card.chainId, provider);
    
    res.json({
      success: true,
      txHash: receipt.transactionHash,
      recipientAddress,
      partnerAddress: PARTNER_ADDRESS,
      amount: `${formatTokenAmount(card.tokenAmount, tokenInfo.decimals)} ${tokenInfo.symbol}`,
      explorerUrl: `${getExplorerUrl(card.chainId)}/tx/${receipt.transactionHash}`
    });
    
  } catch (error) {
    console.error('Error redeeming card:', error);
    
    if (error.message.includes('This card has already been redeemed or cancelled')) {
      return res.status(400).json({ error: 'Card has already been redeemed or cancelled' });
    }
    
    if (error.message.includes('Invalid card secret')) {
      return res.status(400).json({ error: 'Invalid card secret' });
    }
    
    res.status(500).json({ error: 'Failed to redeem card' });
  }
});

// Get explorer URL
function getExplorerUrl(chainId) {
  const explorers = {
    1: 'https://etherscan.io',
    56: 'https://bscscan.com',
    137: 'https://polygonscan.com',
    10: 'https://optimistic.etherscan.io',
    42161: 'https://arbiscan.io',
    8453: 'https://basescan.org',
    43114: 'https://snowtrace.io'
  };
  return explorers[chainId] || 'https://etherscan.io';
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'RedeemNow API' });
});

// API Documentation endpoints
app.get('/api', (req, res) => {
  res.send(`
    <html>
      <head><title>RedeemNow API</title><link rel="stylesheet" href="/style.css"></head>
      <body>
        <div class="api-doc">
          <h1>RedeemNow API Documentation</h1>
          <div class="description">Gasless UniVoucher gift card redemption API</div>
          
          <h2>Available Endpoints:</h2>
          
          <div class="endpoint">
            <span class="method">GET</span> <a href="/api/health" class="url">/api/health</a>
            <div class="description">Health check endpoint</div>
          </div>
          
          <div class="endpoint">
            <span class="method">POST</span> <a href="/api/card-info" class="url">/api/card-info</a>
            <div class="description">Get card information by ID</div>
          </div>
          
          <div class="endpoint">
            <span class="method">POST</span> <a href="/api/verify-secret" class="url">/api/verify-secret</a>
            <div class="description">Verify card secret without revealing it</div>
          </div>
          
          <div class="endpoint">
            <span class="method">POST</span> <a href="/api/redeem" class="url">/api/redeem</a>
            <div class="description">Redeem a card (gasless for user)</div>
          </div>
          
          <p><a href="/" style="color: #50fa7b;">← Back to App</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/redeem', (req, res) => {
  res.send(`
    <html>
      <head><title>Redeem API</title><link rel="stylesheet" href="/style.css"></head>
      <body>
        <div class="api-doc">
          <h1>POST /api/redeem</h1>
          <div class="description">Redeem a UniVoucher gift card (gasless for user)</div>
          
          <h3>Request Body:</h3>
          <pre><code>{
  "cardId": "1234567",
  "cardSecret": "ABCDE-FGHIJ-KLMNO-PQRST",
  "recipientAddress": "0x..."
}</code></pre>

          <h3>Response (Success):</h3>
          <pre><code>{
  "success": true,
  "txHash": "0x...",
  "recipientAddress": "0x...",
  "partnerAddress": "${PARTNER_ADDRESS}",
  "amount": "1.0 ETH",
  "explorerUrl": "https://etherscan.io/tx/0x..."
}</code></pre>

          <h3>Response (Error):</h3>
          <pre><code>{
  "error": "Card not found"
}</code></pre>
          
          <p><a href="/api" style="color: #50fa7b;">← Back to API Docs</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/card-info', (req, res) => {
  res.send(`
    <html>
      <head><title>Card Info API</title><link rel="stylesheet" href="/style.css"></head>
      <body>
        <div class="api-doc">
          <h1>POST /api/card-info</h1>
          <div class="description">Get card information by ID</div>
          
          <h3>Request Body:</h3>
          <pre><code>{
  "cardId": "1234567"
}</code></pre>

          <h3>Response:</h3>
          <pre><code>{
  "cardId": "1234567",
  "chainId": 1,
  "chainName": "Ethereum",
  "active": true,
  "status": "active",
  "formattedAmount": "1.0 ETH",
  "creator": "0x...",
  "message": "Happy Birthday!",
  "createdAt": "2025-01-01T00:00:00.000Z"
}</code></pre>
          
          <p><a href="/api" style="color: #50fa7b;">← Back to API Docs</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/verify-secret', (req, res) => {
  res.send(`
    <html>
      <head><title>Verify Secret API</title><link rel="stylesheet" href="/style.css"></head>
      <body>
        <div class="api-doc">
          <h1>POST /api/verify-secret</h1>
          <div class="description">Verify card secret without revealing it</div>
          
          <h3>Request Body:</h3>
          <pre><code>{
  "cardId": "1234567",
  "cardSecret": "ABCDE-FGHIJ-KLMNO-PQRST"
}</code></pre>

          <h3>Response (Valid):</h3>
          <pre><code>{
  "valid": true
}</code></pre>

          <h3>Response (Invalid):</h3>
          <pre><code>{
  "error": "Invalid card secret"
}</code></pre>
          
          <p><a href="/api" style="color: #50fa7b;">← Back to API Docs</a></p>
        </div>
      </body>
    </html>
  `);
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RedeemNow server running on port ${PORT}`);
  console.log(`Partner Address: ${PARTNER_ADDRESS}`);
}); 