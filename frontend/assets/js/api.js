const API_BASE =
  "https://njdo.ig999x.workers.dev";

const NajdAPI = {

  async request(endpoint, options = {}) {

    const token =
      localStorage.getItem("najd_token");

    const headers = {
      "Content-Type": "application/json",

      ...(token
        ? {
            "Authorization":
              `Bearer ${token}`
          }
        : {}),

      ...(options.headers || {})
    };

    const response = await fetch(
      `${API_BASE}/api${endpoint}`,
      {
        ...options,
        headers
      }
    );

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: "استجابة غير صالحة من الخادم",
        raw: text
      };
    }
  },

  register(
    username,
    password,
    display_name,
    email = null
  ) {
    return this.request(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          display_name,
          email
        })
      }
    );
  },

  login(username, password) {
    return this.request(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      }
    );
  },

  logout() {
    return this.request(
      "/auth/logout",
      {
        method: "POST"
      }
    );
  },

  me() {
    return this.request(
      "/auth/me"
    );
  },

  getStories() {
    return this.request(
      "/stories"
    );
  },

  postStory(
    media_url,
    media_type,
    caption
  ) {
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

  deleteStory(id) {
    return this.request(
      `/stories/${id}`,
      {
        method: "DELETE"
      }
    );
  }

};
