const API_BASE =
  "https://njdo.ig999x.workers.dev";

const NajdAPI = {

  async request(endpoint, options = {}) {

    const token =
      localStorage.getItem(
        "najd_token"
      );

    const headers = {
      "Content-Type":
        "application/json",

      ...(token
        ? {
            Authorization:
              `Bearer ${token}`,
          }
        : {}),

      ...(options.headers || {}),
    };

    try {

      const response =
        await fetch(
          `${API_BASE}${endpoint}`,
          {
            ...options,
            headers,
          }
        );

      const data =
        await response.json();

      return data;

    } catch (error) {

      console.error(
        "Najd API Error:",
        error
      );

      return {
        success: false,
        message:
          "تعذر الاتصال بالخادم",
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
      "/api/auth/register",
      {
        method: "POST",

        body: JSON.stringify({
          username,
          password,
          display_name,
          email,
        }),
      }
    );
  },

  login(
    username,
    password
  ) {

    return this.request(
      "/api/auth/login",
      {
        method: "POST",

        body: JSON.stringify({
          username,
          password,
        }),
      }
    );
  },

  me() {

    return this.request(
      "/api/auth/me"
    );
  },

  logout() {

    return this.request(
      "/api/auth/logout",
      {
        method: "DELETE",
      }
    );
  },

  getStories() {

    return this.request(
      "/api/stories"
    );
  },

  postStory(
    media_url,
    media_type,
    caption
  ) {

    return this.request(
      "/api/stories",
      {
        method: "POST",

        body: JSON.stringify({
          media_url,
          media_type,
          caption,
        }),
      }
    );
  },

  deleteStory(id) {

    return this.request(
      `/api/stories/${id}`,
      {
        method: "DELETE",
      }
    );
  },
};
