const vscode = acquireVsCodeApi();

const messages = document.getElementById('messages');
const question = document.getElementById('question');
const send = document.getElementById('send');
const statusEl = document.getElementById('status');
const openDataFolder = document.getElementById('openDataFolder');

function appendMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = formatText(text);

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function formatText(text) {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function ask() {
  const text = question.value.trim();
  if (!text) return;
  appendMessage('user', text);
  question.value = '';
  send.disabled = true;
  vscode.postMessage({ command: 'ask', text });
}

send.addEventListener('click', ask);
question.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    ask();
  }
});
openDataFolder.addEventListener('click', () => vscode.postMessage({ command: 'openDataFolder' }));

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.command) {
    case 'answer':
      appendMessage('assistant', message.text);
      send.disabled = false;
      question.focus();
      break;
    case 'status':
      statusEl.textContent = message.text;
      if (message.text === 'Ready') send.disabled = false;
      break;
  }
});
