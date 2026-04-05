// ============================================================
// CineVerse — Streaming Front-end
// API: The Movie Database (TMDB)
// ============================================================

// ============================================================
// COLOQUE SUA API KEY AQUI (obtenha em https://www.themoviedb.org/settings/api)
// ============================================================
const TMDB_API_KEY = "cf178e12707b905f5f910db749d154ea";
// ============================================================

const IMG_BASE = "https://image.tmdb.org/t/p/";
const API = "https://api.themoviedb.org/3";

const GENRES = {
  28: "Ação",
  12: "Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  18: "Drama",
  14: "Fantasia",
  27: "Terror",
  9648: "Mistério",
  10749: "Romance",
  878: "Ficção Científica",
  53: "Suspense",
  10752: "Guerra",
  37: "Faroeste",
};

// Categorias que exibimos na home (genre_id → nome)
const CATEGORIES = [
  { name: "Em Alta", fetch: async () => { const d = await tmdb.fetch("/trending/movie/week"); return d.results || []; } },
  { name: "Ação", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 28, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Comédia", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 35, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Drama", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 18, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Terror", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 27, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Romance", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 10749, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Ficção Científica", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 878, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Animação", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 16, sort_by: "popularity.desc" }); return d.results || []; } },
  { name: "Suspense", fetch: async () => { const d = await tmdb.fetch("/discover/movie", { with_genres: 53, sort_by: "popularity.desc" }); return d.results || []; } },
];

let heroMovie = null;
let searchTimeout = null;

// ============================================================
// TMDB API
// ============================================================
const tmdb = {
  async fetch(path, params = {}) {
    const qs = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: "pt-BR",
      ...params,
    }).toString();
    const url = `${API}${path}?${qs}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("TMDB ERRO:", res.status, url, errBody);
        throw new Error(`TMDB ${res.status}: ${errBody}`);
      }
      return res.json();
    } catch (err) {
      if (err.message.startsWith("TMDB")) throw err;
      console.error("Fetch falhou:", url, err);
      throw err;
    }
  },

  async trending() {
    const data = await this.fetch("/trending/movie/week");
    return data.results || [];
  },

  async byGenre(genreId, page = 1) {
    const data = await this.fetch("/discover/movie", {
      with_genres: genreId,
      page,
      sort_by: "popularity.desc",
    });
    return data.results || [];
  },

  async search(query) {
    if (!query || query.length < 2) return [];
    const data = await this.fetch("/search/movie", { query });
    return data.results || [];
  },

  async details(movieId) {
    return this.fetch(`/movie/${movieId}`, {
      append_to_response: "credits,videos",
    });
  },

  async videos(movieId) {
    const data = await this.fetch(`/movie/${movieId}/videos`);
    return data.results || [];
  },

  // Pega trailer YouTube (prioridade) ou qualquer vídeo disponível
  getTrailerUrl(movieVids) {
    const yt = movieVids.find(
      (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
    ) || movieVids.find((v) => v.site === "YouTube");
    return yt ? `https://www.youtube.com/embed/${yt.key}?autoplay=1&rel=0` : null;
  },

  img(path, size = "w500") {
    return path ? `${IMG_BASE}${size}${path}` : "";
  },
};

// ============================================================
// Auth (localStorage)
// ============================================================
const auth = {
  _users() {
    try {
      return JSON.parse(localStorage.getItem("cineverse_users") || "[]");
    } catch {
      return [];
    }
  },

  _saveUsers(users) {
    localStorage.setItem("cineverse_users", JSON.stringify(users));
  },

  _session() {
    try {
      return JSON.parse(localStorage.getItem("cineverse_session") || "null");
    } catch {
      return null;
    }
  },

  register(name, email, password) {
    const users = this._users();
    if (users.find((u) => u.email === email)) return { ok: false, msg: "E-mail já cadastrado" };
    users.push({ name, email, password: btoa(password), myList: [] });
    this._saveUsers(users);
    return this.login(email, password);
  },

  login(email, password) {
    const users = this._users();
    const user = users.find((u) => u.email === email && atob(u.password) === password);
    if (!user) return { ok: false, msg: "E-mail ou senha incorretos" };
    localStorage.setItem("cineverse_session", JSON.stringify({ email: user.email }));
    return { ok: true };
  },

  logout() {
    localStorage.removeItem("cineverse_session");
    App.renderUserArea();
  },

  isLoggedIn() {
    return this._session() !== null;
  },

  getUser() {
    const sess = this._session();
    if (!sess) return null;
    return this._users().find((u) => u.email === sess.email) || null;
  },

  myList() {
    const user = this.getUser();
    return user ? user.myList || [] : [];
  },

  addToList(movieId) {
    const users = this._users();
    const sess = this._session();
    const idx = users.findIndex((u) => u.email === sess?.email);
    if (idx < 0) return;
    if (!users[idx].myList) users[idx].myList = [];
    if (!users[idx].myList.includes(movieId)) {
      users[idx].myList.push(movieId);
      this._saveUsers(users);
    }
  },

  removeFromList(movieId) {
    const users = this._users();
    const sess = this._session();
    const idx = users.findIndex((u) => u.email === sess?.email);
    if (idx < 0) return;
    if (!users[idx].myList) users[idx].myList = [];
    users[idx].myList = users[idx].myList.filter((id) => id !== movieId);
    this._saveUsers(users);
  },

  isInList(movieId) {
    return this.myList().includes(movieId);
  },
};

// ============================================================
// App
// ============================================================
const App = {
  init() {
    this.renderUserArea();
    this.loadHome();
    window.addEventListener("scroll", () => {
      document.getElementById("navbar").classList.toggle("scrolled", window.scrollY > 50);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closePlayer();
        this.closeModal();
      }
    });
  },

  async loadHome() {
    const main = document.getElementById("main-content");
    main.innerHTML = '<div class="loading" id="initial-loading"><div class="spinner"></div><p>Carregando catálogo...</p></div>';

    try {
      // Hero — trending
      console.log("Buscando trending...");
      const trending = await tmdb.trending();
      if (trending.length > 0) {
        heroMovie = trending[0];
        const hero = document.getElementById("hero");
        hero.style.backgroundImage = `url(${tmdb.img(heroMovie.backdrop_path, "original")})`;
        document.getElementById("hero-title").textContent = heroMovie.title;
        document.getElementById("hero-desc").textContent = heroMovie.overview || "";
        console.log("Hero definido:", heroMovie.title);
      }

      main.innerHTML = "";

      // Fetch all categories in parallel
      console.log("Buscando categorias...");
      await Promise.all(CATEGORIES.map(async (cat) => {
        const section = document.createElement("section");
        section.className = "category";
        section.innerHTML = `<h2 class="category-title">${cat.name}</h2>`;
        const row = document.createElement("div");
        row.className = "row";

        try {
          console.log(`Buscando: ${cat.name}`);
          const movies = await cat.fetch();
          console.log(`  -> ${cat.name}: ${movies.length} filmes`);
          row.innerHTML = movies.map((m) => this.cardHTML(m)).join("");
        } catch (err) {
          console.error(`Erro em ${cat.name}:`, err.message);
          row.innerHTML = `<p class="error-msg">Erro ao carregar ${cat.name}: ${err.message}</p>`;
        }

        section.appendChild(row);
        main.appendChild(section);
      }));

      console.log("Carregamento concluído!");
    } catch (err) {
      console.error("Erro principal:", err);
      main.innerHTML = `<div class="error-container"><p>Não foi possível carregar o catálogo.</p><p class="error-detail">${err.message}</p><p class="error-detail">Abra o console do navegador (F12) para ver detalhes.</p></div>`;
    }
  },

  cardHTML(m) {
    if (!m.poster_path) return "";
    return `
      <div class="card" onclick="App.showDetails(${m.id})">
        <div class="card-img">
          <img src="${tmdb.img(m.poster_path)}" alt="${m.title}" loading="lazy" />
          <div class="card-overlay">
            <span class="play-icon">▶</span>
          </div>
        </div>
        <div class="card-info">
          <h3>${m.title}</h3>
          <div class="card-meta">
            <span class="card-rating">★ ${(m.vote_average || 0).toFixed(1)}</span>
            <span class="card-year">${(m.release_date || "").slice(0, 4)}</span>
          </div>
        </div>
      </div>`;
  },

  // ---- Hero ----
  async playHeroMovie() {
    if (!heroMovie) return;
    this.playMovie(heroMovie.id, heroMovie.title);
  },

  showHeroInfo() {
    if (heroMovie) this.showDetails(heroMovie.id);
  },

  // ---- Details Modal ----
  async showDetails(movieId) {
    const body = document.getElementById("modal-body");
    body.innerHTML = '<div class="loading"><div class="spinner"></div><p>Carregando...</p></div>';
    document.getElementById("modal-overlay").style.display = "block";
    document.getElementById("modal").style.display = "block";

    try {
      const d = await tmdb.details(movieId);
      const genres = (d.genres || []).map((g) => `<span class="tag">${g.name}</span>`).join("");
      const runtime = d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}min` : "";
      const director = (d.credits?.crew || []).find((c) => c.job === "Director");
      const cast = (d.credits?.cast || []).slice(0, 5).map((c) => c.name).join(", ");
      const inList = auth.isInList(movieId);
      const listBtn = auth.isLoggedIn()
        ? `<button class="btn-list" onclick="App.toggleList(${movieId})">${inList ? "✓ Na Minha Lista" : "+ Minha Lista"}</button>`
        : "";

      body.innerHTML = `
        <img src="${tmdb.img(d.backdrop_path || d.poster_path, "original")}" alt="${d.title}" class="modal-img" />
        <div class="modal-details">
          <h2>${d.title}</h2>
          <div class="modal-meta">
            <span class="modal-rating">★ ${d.vote_average?.toFixed(1)}</span>
            <span>${(d.release_date || "").slice(0, 4)}</span>
            ${runtime ? `<span>${runtime}</span>` : ""}
          </div>
          <div class="modal-tags">${genres}</div>
          ${director ? `<p class="modal-cred"><strong>Direção:</strong> ${director.name}</p>` : ""}
          ${cast ? `<p class="modal-cred"><strong>Elenco:</strong> ${cast}</p>` : ""}
          <p class="modal-desc">${d.overview || "Sem descrição disponível."}</p>
          <div class="modal-actions">
            <button class="btn-play" onclick="App.closeModal();App.playMovie(${movieId},'${d.title.replace(/'/g, "\\'")}')">▶ Assistir Trailer</button>
            ${listBtn}
          </div>
        </div>`;

      document.body.style.overflow = "hidden";
    } catch (err) {
      body.innerHTML = `<div class="modal-details"><h2>Erro ao carregar</h2><p>${err.message}</p></div>`;
    }
  },

  // ---- Player ----
  async playMovie(movieId, title) {
    const overlay = document.getElementById("player-overlay");
    document.getElementById("player-title").textContent = title;
    document.getElementById("player-screen").innerHTML = '<div class="loading"><div class="spinner"></div><p>Buscando trailer...</p></div>';
    overlay.style.display = "flex";

    try {
      const vids = await tmdb.videos(movieId);
      const url = tmdb.getTrailerUrl(vids);

      if (url) {
        document.getElementById("player-screen").innerHTML = `<iframe src="${url}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        document.getElementById("player-screen").innerHTML = `
          <div class="no-trailer">
            <p style="font-size:2.5rem">🎬</p>
            <p><strong>${title}</strong></p>
            <p>Trailer não disponível no YouTube.</p>
            <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(title + " trailer")}" target="_blank" class="btn-yt-search">Buscar no YouTube</a>
          </div>`;
      }
    } catch {
      document.getElementById("player-screen").innerHTML = `<div class="no-trailer"><p>Erro ao carregar trailer.</p></div>`;
    }
  },

  closePlayer() {
    const overlay = document.getElementById("player-overlay");
    overlay.style.display = "none";
    // Para o iframe (remove src)
    document.getElementById("player-screen").innerHTML = "";
  },

  closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("modal").style.display = "none";
    if (!document.getElementById("player-overlay").style.display || document.getElementById("player-overlay").style.display === "none") {
      document.body.style.overflow = "";
    }
  },

  // ---- My List ----
  showMyList() {
    if (!auth.isLoggedIn()) {
      this.openLogin();
      return;
    }
    const ids = auth.myList();
    if (ids.length === 0) {
      document.getElementById("main-content").innerHTML = '<div class="empty-list"><h2>Minha Lista</h2><p>Sua lista está vazia. Adicione filmes pelos detalhes.</p></div>';
      return;
    }
    this.renderMyListPage(ids);
  },

  async renderMyListPage(ids) {
    const main = document.getElementById("main-content");
    main.innerHTML = "<h2 class=\"category-title\" style=\"padding:0 2rem\">Minha Lista</h2><div class=\"row\" style=\"flex-wrap:wrap;padding:0.5rem 2rem\"></div>";
    const row = main.querySelector(".row");
    row.style.flexWrap = "wrap";
    for (const id of ids) {
      try {
        const m = await tmdb.fetch(`/movie/${id}`);
        row.innerHTML += this.cardHTML(m);
      } catch { /* skip */ }
    }
  },

  toggleList(movieId) {
    if (!auth.isLoggedIn()) return;
    if (auth.isInList(movieId)) auth.removeFromList(movieId);
    else auth.addToList(movieId);
    this.showDetails(movieId); // refresh modal
  },

  // ---- Search ----
  toggleSearch() {
    const box = document.getElementById("search-box");
    box.classList.toggle("active");
    if (box.classList.contains("active")) {
      document.getElementById("search-input").focus();
    } else {
      document.getElementById("search-input").value = "";
      document.getElementById("search-results").style.display = "none";
    }
  },

  search(query) {
    const results = document.getElementById("search-results");
    if (query.length < 2) {
      results.style.display = "none";
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      results.innerHTML = '<div class="loading"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>';
      results.style.display = "block";
      try {
        const movies = await tmdb.search(query);
        if (movies.length === 0) {
          results.innerHTML = "<p class=\"no-results\">Nenhum filme encontrado</p>";
          return;
        }
        results.innerHTML = movies.slice(0, 8).map((m) => `
          <div class="search-item" onclick="App.showDetails(${m.id});document.getElementById('search-box').classList.remove('active');document.getElementById('search-results').style.display='none';document.getElementById('search-input').value='';">
            <img src="${tmdb.img(m.poster_path, 'w92')}" alt="${m.title}" />
            <div class="search-info">
              <strong>${m.title}</strong>
              <span>${(m.release_date || "").slice(0, 4)} · ★ ${(m.vote_average || 0).toFixed(1)}</span>
            </div>
          </div>`).join("");
      } catch {
        results.innerHTML = "<p class=\"no-results\">Erro na busca</p>";
      }
    }, 400);
  },

  goHome() {
    document.getElementById("search-results").style.display = "none";
    document.getElementById("search-input").value = "";
    this.loadHome();
    return false;
  },

  // ---- Auth Modal ----
  openLogin() {
    const body = document.getElementById("modal-body");
    body.innerHTML = `
      <div class="login-container">
        <div class="login-tabs">
          <button class="tab active" onclick="App.loginTab('login')">Entrar</button>
          <button class="tab" onclick="App.loginTab('register')">Cadastrar</button>
        </div>
        <div id="login-forms"></div>
      </div>`;
    this.loginTab("login");
    document.getElementById("modal-overlay").style.display = "block";
    document.getElementById("modal").style.display = "block";
  },

  loginTab(tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    event?.target?.classList?.add("active");
    const forms = document.getElementById("login-forms");
    if (tab === "login") {
      forms.innerHTML = `
        <form class="auth-form" onsubmit="App.doLogin(event)">
          <input type="email" id="login-email" placeholder="E-mail" required />
          <input type="password" id="login-pass" placeholder="Senha" required />
          <div id="login-msg" class="auth-msg"></div>
          <button type="submit" class="btn-play">Entrar</button>
        </form>`;
    } else {
      forms.innerHTML = `
        <form class="auth-form" onsubmit="App.doRegister(event)">
          <input type="text" id="reg-name" placeholder="Nome" required minlength="2" />
          <input type="email" id="reg-email" placeholder="E-mail" required />
          <input type="password" id="reg-pass" placeholder="Senha" required minlength="4" />
          <div id="login-msg" class="auth-msg"></div>
          <button type="submit" class="btn-play">Cadastrar</button>
        </form>`;
    }
  },

  doLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const pass = document.getElementById("login-pass").value;
    const res = auth.login(email, pass);
    const msg = document.getElementById("login-msg");
    if (res.ok) {
      this.closeModal();
      this.renderUserArea();
    } else {
      msg.textContent = res.msg;
      msg.className = "auth-msg error";
    }
  },

  doRegister(e) {
    e.preventDefault();
    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const pass = document.getElementById("reg-pass").value;
    const res = auth.register(name, email, pass);
    const msg = document.getElementById("login-msg");
    if (res.ok) {
      this.closeModal();
      this.renderUserArea();
    } else {
      msg.textContent = res.msg;
      msg.className = "auth-msg error";
    }
  },

  renderUserArea() {
    const area = document.getElementById("user-area");
    if (auth.isLoggedIn()) {
      const user = auth.getUser();
      const initial = (user?.name || "U").charAt(0).toUpperCase();
      area.innerHTML = `
        <div class="user-avatar" title="${user?.name || ''}">${initial}</div>
        <button class="btn-logout" onclick="auth.logout()">Sair</button>`;
    } else {
      area.innerHTML = `<button class="btn-login" onclick="App.openLogin()">Entrar</button>`;
    }
  },
};

// Boot
App.init();
