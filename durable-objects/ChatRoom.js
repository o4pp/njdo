export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(websocket) {
    websocket.accept();
    this.sessions.add(websocket);

    websocket.addEventListener("message", async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        for (let session of this.sessions) {
          if (session.readyState === WebSocket.OPEN) {
            session.send(JSON.stringify(data));
          }
        }
      } catch (err) {
        console.error("WebSocket message error:", err);
      }
    });

    websocket.addEventListener("close", () => {
      this.sessions.delete(websocket);
    });
  }
}
