const API_BASE = "https://njdo.ig999x.workers.dev";

const NajdAPI = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("najd_token");

    const headers = {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await res.json();

      return data;

    } catch (error) {
      console.error("Najd API Error:", error);

      return {
        success: false,
        message: "تعذر الاتصال بالخادم",
        error: error.message
      };
    }
  },

  // =========================
  // AUTH
  // =========================

  register(username, password, display_name) {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        display_name
      })
    });
  },

  login(username, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });
  },

  // =========================
  // STORIES
  // =========================

  getStories() {
    return this.request("/api/stories");
  },

  postStory(media_url, media_type, caption) {
    return this.request("/api/stories", {
      method: "POST",
      body: JSON.stringify({
        media_url,
        media_type,
        caption
      })
    });
  },

  // =========================
  // LOGOUT
  // =========================

  logout() {
    localStorage.removeItem("najd_token");
    localStorage.removeItem("najd_user");
    window.location.href = "login.html";
  }
};
