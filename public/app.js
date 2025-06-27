// DOM elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const cardIdInput = document.getElementById('cardId');
const cardSecretInput = document.getElementById('cardSecret');
const recipientAddressInput = document.getElementById('recipientAddress');
const checkCardBtn = document.getElementById('checkCardBtn');
const redeemBtn = document.getElementById('redeemBtn');
const backBtn = document.getElementById('backBtn');
const newRedemptionBtn = document.getElementById('newRedemptionBtn');
const errorMessage = document.getElementById('errorMessage');
const cardInfo = document.getElementById('cardInfo');
const successMessage = document.getElementById('successMessage');

let currentCardData = null;

// Format card secret input - more user-friendly
cardSecretInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/[^A-Za-z-]/g, '').toUpperCase();
    
    // Remove existing hyphens for reformatting
    let cleanValue = value.replace(/-/g, '');
    
    // Limit to 20 characters (without hyphens)
    if (cleanValue.length > 20) {
        cleanValue = cleanValue.substring(0, 20);
    }
    
    // Add hyphens every 5 characters
    let formatted = '';
    for (let i = 0; i < cleanValue.length; i++) {
        if (i > 0 && i % 5 === 0) {
            formatted += '-';
        }
        formatted += cleanValue[i];
    }
    
    e.target.value = formatted;
    
});

// Step navigation
function showStep(stepNum) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.step-dot').forEach(d => d.classList.remove('active'));
    
    document.getElementById(`step${stepNum}`).classList.add('active');
    document.getElementById(`dot${stepNum}`).classList.add('active');
    
    // Mark previous steps as completed
    for (let i = 1; i < stepNum; i++) {
        document.getElementById(`dot${i}`).classList.add('completed');
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function showLoading(button) {
    button.disabled = true;
    button.querySelector('.loading').classList.remove('hidden');
}

function hideLoading(button) {
    button.disabled = false;
    button.querySelector('.loading').classList.add('hidden');
}

// Check card
checkCardBtn.addEventListener('click', async () => {
    const cardId = cardIdInput.value.trim();
    const cardSecret = cardSecretInput.value.trim();

    if (!cardId || !cardSecret) {
        showError('Please enter both card ID and secret');
        return;
    }

    showLoading(checkCardBtn);

    try {
        // Get card info
        const cardResponse = await fetch('/api/card-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId })
        });

        const cardData = await cardResponse.json();

        if (!cardResponse.ok) {
            throw new Error(cardData.error || 'Failed to get card info');
        }

        // Verify secret
        const secretResponse = await fetch('/api/verify-secret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardId, cardSecret })
        });

        const secretData = await secretResponse.json();

        if (!secretResponse.ok) {
            throw new Error(secretData.error || 'Invalid card secret');
        }

        // Store card data and show step 2
        currentCardData = cardData;
        displayCardInfo(cardData);
        showStep(2);

    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading(checkCardBtn);
    }
});

function displayCardInfo(card) {
    cardInfo.innerHTML = `
        <h3>Card Details</h3>
        <p><strong>Amount:</strong> ${card.formattedAmount}</p>
        <p><strong>Network:</strong> ${card.chainName}</p>
        <p><strong>Status:</strong> ${card.status}</p>
        ${card.message ? `<p><strong>Message:</strong> "${card.message}"</p>` : ''}
        <p><strong>Created:</strong> ${new Date(card.createdAt).toLocaleDateString()}</p>
    `;
}

// Redeem card
redeemBtn.addEventListener('click', async () => {
    const recipientAddress = recipientAddressInput.value.trim();

    if (!recipientAddress) {
        showError('Please enter recipient address');
        return;
    }

    // Confirmation popup
    const confirmMessage = `Are you sure you want to redeem this ${currentCardData.formattedAmount} gift card?\n\nRecipient: ${recipientAddress}\nPartner Fee: 1% (${(parseFloat(currentCardData.formattedAmount.split(' ')[0]) * 0.01).toFixed(6)} ${currentCardData.formattedAmount.split(' ')[1]})\n\nThis action cannot be undone.`;
    
    if (!confirm(confirmMessage)) {
        return;
    }

    showLoading(redeemBtn);

    try {
        const response = await fetch('/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cardId: cardIdInput.value.trim(),
                cardSecret: cardSecretInput.value.trim(),
                recipientAddress: recipientAddress
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to redeem card');
        }

        // Show success
        successMessage.innerHTML = `
            <strong>🎉 Card Redeemed Successfully!</strong><br>
            <p>Amount: ${data.amount}</p>
            <p>Recipient: ${data.recipientAddress}</p>
            ${currentCardData.message ? `<p>Message: "${currentCardData.message}"</p>` : ''}
            <p>Partner Fee: 1% earned by RedeemNow</p>
            <a href="${data.explorerUrl}" target="_blank" class="tx-link">View Transaction →</a>
        `;
        showStep(3);

    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading(redeemBtn);
    }
});

// Back button
backBtn.addEventListener('click', () => {
    showStep(1);
});

// New redemption button
newRedemptionBtn.addEventListener('click', () => {
    // Reset form
    cardIdInput.value = '';
    cardSecretInput.value = '';
    recipientAddressInput.value = '';
    currentCardData = null;
    showStep(1);
});

// Enter key support
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (step1.classList.contains('active')) {
            checkCardBtn.click();
        } else if (step2.classList.contains('active')) {
            redeemBtn.click();
        }
    }
}); 