const NajdAPI = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("najd_token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...options.headers
    };
    const res = await fetch(`${endpoint}`, { ...options, headers });
    return res.json();
  },

  login(username, password) {
    return this.request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  },

  register(username, password, display_name) {
    return this.request("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, display_name }) });
  },

  getStories() {
    return this.request("/api/stories");
  },

  postStory(media_url, media_type, caption) {
    return this.request("/api/stories", { method: "POST", body: JSON.stringify({ media_url, media_type, caption }) });
  }
};
