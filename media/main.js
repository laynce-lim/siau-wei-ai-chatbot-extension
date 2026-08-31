const vscode = acquireVsCodeApi();

const messages = document.getElementById('messages');
const question = document.getElementById('question');
const send = document.getElementById('send');
const stop = document.getElementById('stop');
const statusEl = document.getElementById('status');
const dataStatusEl = document.getElementById('dataStatus');
const openDataFolder = document.getElementById('openDataFolder');
const refreshData = document.getElementById('refreshData');
const pickSource = document.getElementById('pickSource');
const newChat = document.getElementById('newChat');

let thinkingEl = null;
let streamEl = null;
let streamText = '';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Only http(s) links, so a crafted answer cannot inject javascript: URLs.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isDivider(line) {
  return line.includes('-') && /^\s*\|?[\s:|-]*\|?\s*$/.test(line);
}

// Escapes first, then builds markup, so model output can never inject HTML.
function formatText(text) {
  const lines = escapeHtml(text).split('\n');
  const html = [];
  let listBuffer = [];
  let inCodeBlock = false;
  let codeBuffer = [];

  const flushList = () => {
    if (listBuffer.length) {
      html.push('<ul>' + listBuffer.map((item) => '<li>' + inline(item) + '</li>').join('') + '</ul>');
      listBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      if (inCodeBlock) {
        html.push('<pre><code>' + codeBuffer.join('\n') + '</code></pre>');
        codeBuffer = [];
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flushList();
      const header = splitRow(line);
      const rows = [];
      i += 2;

      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;

      const head = header.map((cell) => '<th>' + inline(cell) + '</th>').join('');
      const body = rows
        .map((row) => '<tr>' + row.map((cell) => '<td>' + inline(cell) + '</td>').join('') + '</tr>')
        .join('');
      html.push('<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>');
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      listBuffer.push(bullet[1]);
      continue;
    }

    flushList();

    const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    html.push('<p>' + inline(line) + '</p>');
  }

  flushList();
  if (codeBuffer.length) {
    html.push('<pre><code>' + codeBuffer.join('\n') + '</code></pre>');
  }

  return html.join('');
}

function createBubble(role) {
  const wrapper = document.createElement('div');
  wrapper.className = 'message ' + role;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'You' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);
  return bubble;
}

function addChart(bubble, chart) {
  const image = document.createElement('img');
  image.className = 'chart';
  image.src = chart;
  image.alt = 'Generated chart';
  bubble.appendChild(image);
}

function appendMessage(role, text, chart) {
  const bubble = createBubble(role);
  bubble.innerHTML = formatText(text);

  if (chart) {
    addChart(bubble, chart);
  }

  messages.scrollTop = messages.scrollHeight;
}

function showStep(text) {
  if (streamEl) {
    return;
  }
  if (!thinkingEl) {
    thinkingEl = document.createElement('div');
    thinkingEl.className = 'message assistant thinking';
    thinkingEl.innerHTML = '<div class="avatar">AI</div><div class="bubble step"></div>';
    messages.appendChild(thinkingEl);
  }
  thinkingEl.querySelector('.bubble').textContent = text;
  messages.scrollTop = messages.scrollHeight;
}

function clearStep() {
  if (thinkingEl) {
    thinkingEl.remove();
    thinkingEl = null;
  }
}

function appendChunk(fragment) {
  if (!streamEl) {
    clearStep();
    streamEl = createBubble('assistant');
    streamText = '';
  }
  streamText += fragment;
  streamEl.innerHTML = formatText(streamText);
  messages.scrollTop = messages.scrollHeight;
}

function endStream() {
  streamEl = null;
  streamText = '';
}

function setBusy(busy) {
  send.disabled = busy;
  stop.disabled = !busy;
}

function ask() {
  const text = question.value.trim();
  if (!text) return;
  appendMessage('user', text);
  question.value = '';
  setBusy(true);
  vscode.postMessage({ command: 'ask', text });
}

send.addEventListener('click', ask);
stop.addEventListener('click', () => vscode.postMessage({ command: 'stop' }));
question.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    ask();
  }
});
openDataFolder.addEventListener('click', () => vscode.postMessage({ command: 'openDataFolder' }));
refreshData.addEventListener('click', () => vscode.postMessage({ command: 'refreshData' }));
pickSource.addEventListener('click', () => vscode.postMessage({ command: 'pickSource' }));
newChat.addEventListener('click', () => {
  clearStep();
  endStream();
  messages.innerHTML = '';
  vscode.postMessage({ command: 'newChat' });
});

window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.command) {
    case 'answer':
      clearStep();
      if (streamEl) {
        streamEl.innerHTML = formatText(message.text);
        if (message.chart) {
          addChart(streamEl, message.chart);
        }
        endStream();
      } else {
        appendMessage('assistant', message.text, message.chart);
      }
      setBusy(false);
      question.focus();
      break;
    case 'answerChunk':
      appendChunk(message.text);
      break;
    case 'step':
      showStep(message.text);
      break;
    case 'stopped':
      clearStep();
      endStream();
      setBusy(false);
      break;
    case 'status':
      statusEl.textContent = message.text;
      if (message.text === 'Ready') setBusy(false);
      break;
    case 'dataStatus':
      dataStatusEl.textContent = message.text;
      break;
  }
});

vscode.postMessage({ command: 'ready' });
