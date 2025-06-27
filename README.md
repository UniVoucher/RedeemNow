# RedeemNow

A minimal, secure, open-source web app for gasless UniVoucher gift card redemption, integrated with the UniVoucher Partner Program.

## Features

- **Gasless Redemption**: Users redeem UniVoucher gift cards without connecting a wallet or paying gas fees
- **Partner Integration**: Integrated with UniVoucher Partner Program to earn 1% fees from redemptions
- **Multi-Chain Support**: Supports all UniVoucher-supported networks (Ethereum, Polygon, Arbitrum, Optimism, Base, BNB Chain, Avalanche)
- **Secure**: Uses proper cryptographic verification without storing sensitive data
- **Real-time Data**: Fetches live card information from UniVoucher API
- **Modern UI**: Clean, responsive interface with step-by-step redemption flow

## How It Works

1. **Card Verification**: Users enter card ID and secret
2. **Secret Validation**: Server decrypts private key to verify secret ownership
3. **Gasless Redemption**: Service wallet pays gas fees and executes redemption
4. **Partner Fee**: Earns 1% partner fee from each redemption
5. **Fund Transfer**: Remaining 99% goes to recipient address

## Environment Variables

Create a `.env` file with your actual values:

```env
# Alchemy API Key for blockchain RPC connections
ALCHEMY_KEY=your_alchemy_api_key_here

# Your UniVoucher Partner Program wallet address (receives 1% fees)
PARTNER_ADDRESS=0x_your_partner_wallet_address_here

# Private key for the service wallet (pays gas fees for gasless redemptions)
# WARNING: Keep this secure and never share it publicly
SERVICE_PRIVATE_KEY=your_service_wallet_private_key_here

# Optional: Server port (default: 3000)
PORT=3000
```

**⚠️ Security Note:** Never commit your `.env` file to version control. The `.gitignore` file already excludes it.

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd redeemnow
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Create .env file with your actual values
# See "Environment Variables" section above for required values
touch .env
# Edit .env with your actual keys and addresses
```

4. Start the server:
```bash
npm start
```

5. Open your browser to `http://localhost:3000`

## Development

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### POST /api/card-info
Get card information by ID.

**Request:**
```json
{
  "cardId": "1234567"
}
```

**Response:**
```json
{
  "cardId": "1234567",
  "chainId": 1,
  "chainName": "Ethereum",
  "active": true,
  "status": "active",
  "formattedAmount": "1.0 ETH",
  "creator": "0x...",
  "message": "Happy Birthday!",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

### POST /api/verify-secret
Verify card secret without revealing it.

**Request:**
```json
{
  "cardId": "1234567",
  "cardSecret": "ABCDE-FGHIJ-KLMNO-PQRST"
}
```

**Response:**
```json
{
  "valid": true
}
```

### POST /api/redeem
Redeem a card (gasless for user).

**Request:**
```json
{
  "cardId": "1234567",
  "cardSecret": "ABCDE-FGHIJ-KLMNO-PQRST",
  "recipientAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "recipientAddress": "0x...",
  "partnerAddress": "0x...",
  "amount": "1.0 ETH",
  "explorerUrl": "https://etherscan.io/tx/0x..."
}
```

## Supported Networks

- Ethereum (ETH)
- Polygon (POL)
- Arbitrum (ETH)
- Optimism (ETH)
- Base (ETH)
- BNB Chain (BNB)
- Avalanche (AVAX)

## Security

- Private keys are never exposed or stored
- Card secrets are validated through cryptographic decryption
- Service wallet is isolated and only used for redemption transactions
- All blockchain interactions use established RPC providers (Alchemy)

## Partner Program

This app is integrated with the UniVoucher Partner Program:
- Earns 1% fee from each redemption
- Partner fees are deducted from card amount (not added cost)
- Helps cover operational costs for gasless service

## License

MIT License - Free to clone, modify, and use.

## Built With

- **Backend**: Node.js, Express
- **Blockchain**: Ethers.js v5
- **Frontend**: Vanilla HTML/CSS/JS
- **APIs**: UniVoucher API
- **RPC**: Alchemy
- **Documentation**: UniVoucher MCP

## Contributing

This is an open-source project. Feel free to:
- Fork and improve
- Submit issues
- Create pull requests
- Use as template for your own UniVoucher integrations

## Disclaimer

This app is for educational and demonstration purposes. While functional, please review and audit the code before using in production with significant funds.

## Support

For UniVoucher-related questions: [UniVoucher Documentation](https://docs.univoucher.com)
For app-specific issues: Create an issue in this repository 