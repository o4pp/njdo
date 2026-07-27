const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${window.location.host}/api/chat/room/general`;
const ws = new WebSocket(wsUrl);

const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const user = JSON.parse(localStorage.getItem("najd_user") || '{"display_name": "مستخدم"}');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const div = document.createElement("div");
  div.style.background = "var(--najd-card)";
  div.style.padding = "10px 14px";
  div.style.borderRadius = "12px";
  div.style.maxWidth = "80%";
  div.innerHTML = `<strong style="color: var(--najd-yellow); font-size: 12px; display: block; margin-bottom: 2px;">${data.sender}</strong><span>${data.text}</span>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
};

sendBtn.addEventListener("click", () => {
  const text = msgInput.value.trim();
  if (!text) return;
  ws.send(JSON.stringify({ sender: user.display_name, text }));
  msgInput.value = "";
});

msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});
