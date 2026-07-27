// ============================================================
// NAJD PLATFORM - API CLIENT
// ============================================================

const API_BASE = "https://njdo.ig999x.workers.dev";

const NajdAPI = {

  // ==========================================================
  // REQUEST
  // ==========================================================

  async request(endpoint, options = {}) {

    const token = localStorage.getItem("najd_token");

    const headers = {
      "Content-Type": "application/json",
      ...(token
        ? {
            "Authorization": `Bearer ${token}`
          }
        : {}),
      ...(options.headers || {})
    };

    try {

      const response = await fetch(
        `${API_BASE}${endpoint}`,
        {
          ...options,
          headers
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          message: "استجابة غير صالحة من الخادم",
          status: response.status,
          raw: text
        };
      }

      return {
        ...data,
        status: response.status
      };

    } catch (error) {

      console.error("NAJD API ERROR:", error);

      return {
        success: false,
        message: "تعذر الاتصال بالخادم",
        error: error.message
      };
    }
  },

  // ==========================================================
  // REGISTER
  // POST /auth/register
  // ==========================================================

  register(username, password, display_name) {

    return this.request(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username: String(username).trim(),
          password: String(password),
          display_name: String(display_name).trim()
        })
      }
    );
  },

  // ==========================================================
  // LOGIN
  // POST /auth/login
  // ==========================================================

  login(username, password) {

    return this.request(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: String(username).trim(),
          password: String(password)
        })
      }
    );
  },

  // ==========================================================
  // CURRENT USER
  // GET /auth/me
  // ==========================================================

  me() {

    return this.request(
      "/auth/me",
      {
        method: "GET"
      }
    );
  },

  // ==========================================================
  // STORIES
  // ==========================================================

  getStories() {

    return this.request(
      "/stories",
      {
        method: "GET"
      }
    );
  },

  // ==========================================================
  // POST STORY
  // ==========================================================

  postStory(media_url, media_type, caption = "") {

    return this.request(
      "/stories",
      {
        method: "POST",
        body: JSON.stringify({
          media_url,
          media_type,
          caption
        })
      }
    );
  },

  // ==========================================================
  // LOGOUT
  // ==========================================================

  logout() {

    localStorage.removeItem("najd_token");
    localStorage.removeItem("najd_user");

    window.location.href = "login.html";
  },

  // ==========================================================
  // GET SAVED USER
  // ==========================================================

  getCurrentUser() {

    const user = localStorage.getItem("najd_user");

    try {
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  // ==========================================================
  // IS LOGGED IN
  // ==========================================================

  isLoggedIn() {

    return !!localStorage.getItem("najd_token");
  }
};
