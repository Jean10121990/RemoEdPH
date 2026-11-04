// Remo AI Chatbot - Reusable Component for All Teacher Pages

// Inject chatbot styles
const chatbotStyles = `
<style id="remo-ai-chatbot-styles">
    #remo-ai-chatbot {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        height: 600px;
        background: white;
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        z-index: 10000;
        display: none;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s ease;
    }
    
    #remo-ai-chatbot.open {
        display: flex;
    }
    
    .chatbot-header {
        background: linear-gradient(135deg, #00A82D 0%, #00AEEF 100%);
        color: white;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-radius: 20px 20px 0 0;
    }
    
    .chatbot-header h3 {
        margin: 0;
        font-size: 1.1rem;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .chatbot-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 1.2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    }
    
    .chatbot-close:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    .chatbot-messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .chatbot-message {
        display: flex;
        gap: 10px;
        animation: fadeIn 0.3s ease;
    }
    
    .chatbot-message.user {
        flex-direction: row-reverse;
    }
    
    .message-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        flex-shrink: 0;
    }
    
    .chatbot-message.bot .message-avatar {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    
    .chatbot-message.user .message-avatar {
        background: #e2e8f0;
        color: #667eea;
    }
    
    .message-content {
        max-width: 75%;
        padding: 12px 16px;
        border-radius: 18px;
        font-size: 0.9rem;
        line-height: 1.5;
    }
    
    .chatbot-message.bot .message-content {
        background: white;
        color: #1a202c;
        border: 1px solid #e2e8f0;
    }
    
    .chatbot-message.user .message-content {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
    }
    
    .message-buttons {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .message-button {
        padding: 10px 14px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        color: #667eea;
        font-weight: 500;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .message-button:hover {
        background: #e2e8f0;
        border-color: #667eea;
        transform: translateX(4px);
    }
    
    .message-button-icon {
        font-size: 1rem;
    }
    
    .quick-actions {
        padding: 15px 20px;
        background: white;
        border-top: 1px solid #e2e8f0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .quick-action-btn {
        padding: 8px 12px;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        color: #667eea;
        font-weight: 500;
    }
    
    .quick-action-btn:hover {
        background: #e2e8f0;
        transform: translateY(-1px);
    }
    
    .chatbot-input-area {
        padding: 15px 20px;
        background: white;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 10px;
    }
    
    .chatbot-input {
        flex: 1;
        padding: 10px 15px;
        border: 1px solid #e2e8f0;
        border-radius: 25px;
        font-size: 0.9rem;
        outline: none;
    }
    
    .chatbot-input:focus {
        border-color: #667eea;
    }
    
    .chatbot-send {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
    }
    
    .chatbot-send:hover {
        transform: scale(1.1);
    }
    
    .chatbot-toggle {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;
        font-size: 1.5rem;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s;
    }
    
    .chatbot-toggle:hover {
        transform: scale(1.1);
    }
    
    .chatbot-toggle.hidden {
        display: none;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .typing-indicator {
        display: flex;
        gap: 4px;
        padding: 12px 16px;
    }
    
    .typing-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #00AEEF;
        animation: typing 1.4s infinite;
    }
    
    .typing-dot:nth-child(2) {
        animation-delay: 0.2s;
    }
    
    .typing-dot:nth-child(3) {
        animation-delay: 0.4s;
    }
    
    @keyframes typing {
        0%, 60%, 100% {
            transform: translateY(0);
        }
        30% {
            transform: translateY(-10px);
        }
    }
    
    #remo-ai-chatbot.open ~ #tour-button {
        bottom: 680px !important;
    }
</style>
`;

// Inject chatbot HTML
const chatbotHTML = `
<div id="remo-ai-chatbot">
    <div class="chatbot-header">
        <h3>
            <span>🤖</span>
            <span>Remo AI Assistant</span>
        </h3>
        <button class="chatbot-close" onclick="toggleChatbot()">×</button>
    </div>
    <div class="chatbot-messages" id="chatbot-messages">
        <div class="chatbot-message bot">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <strong>Hello! I'm Remo AI Assistant 👋</strong><br>
                I'm here to help you with troubleshooting, lesson support, and any questions about the platform. How can I assist you today?
            </div>
        </div>
    </div>
    <div class="quick-actions">
        <button class="quick-action-btn" onclick="handleQuickAction('tour')">🎯 Start Tour</button>
        <button class="quick-action-btn" onclick="handleQuickAction('troubleshooting')">🔧 Troubleshooting</button>
        <button class="quick-action-btn" onclick="handleQuickAction('lessons')">📚 Lesson Support</button>
        <button class="quick-action-btn" onclick="handleQuickAction('schedule')">📅 Schedule Help</button>
    </div>
    <div class="chatbot-input-area">
        <input type="text" class="chatbot-input" id="chatbot-input" placeholder="Type your question..." onkeypress="handleChatbotKeyPress(event)">
        <button class="chatbot-send" onclick="sendChatbotMessage()">➤</button>
    </div>
</div>

<button class="chatbot-toggle" id="chatbot-toggle" onclick="toggleChatbot()" title="Open Remo AI Assistant">🤖</button>
`;

function ruleFallback(text) {
  var q = String(text || '').toLowerCase();
  if (q.indexOf('refund') >= 0 || q.indexOf('human') >= 0) return 'A person from RemoEd will follow up. Please email support@remoedph.com.';
  if (q.indexOf('plan') >= 0 || q.indexOf('price') >= 0) return 'Plans start with RemoSpark. Take the free assessment: https://remoedph.com/#assessment';
  return 'Live one-on-one English for ages 3–6. Start here: https://remoedph.com/#assessment';
}

async function sendChatbotMessage() {
  var input = document.getElementById('chatbot-input');
  var box = document.getElementById('chatbot-messages');
  if (!input || !box) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  var mine = document.createElement('div');
  mine.className = 'chatbot-message';
  mine.textContent = text;
  box.appendChild(mine);
  var reply = ruleFallback(text);
  try {
    var res = await fetch('/api/public/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, channel: 'webchat' })
    });
    var data = await res.json();
    if (data && data.reply) reply = data.reply;
  } catch (e) {}
  var bot = document.createElement('div');
  bot.className = 'chatbot-message bot';
  bot.textContent = reply;
  box.appendChild(bot);
}

function handleChatbotKeyPress(ev) {
  if (ev.key === 'Enter') sendChatbotMessage();
}
