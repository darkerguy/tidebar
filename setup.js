window.themes = {
  "coastline": {"mode":"light", "primary":"#08a", "wallpaper":"bg-coastline.jpg"},
  "bura": {"mode":"dark", "primary":"#bce", "wallpaper":"bg-bura.jpg"},
  "twilight": {"mode":"dark", "primary":"#f82", "wallpaper":"bg-twilight.jpg"},
  "jungle": {"mode":"light", "primary":"#082", "wallpaper":"bg-jungle.jpg"},
  "night": {"mode":"dark", "primary":"#5ab", "wallpaper":"bg-night.jpg"},
  "rocks": {"mode":"light", "primary":"#850", "wallpaper":"bg-rocks.jpg"},
}

window.themer = () => {
  const mode = localStorage.getItem("tb:themec_mode") || "light";
  const primary = localStorage.getItem("tb:themec_primary") || "#08a";
  const wallpaper = localStorage.getItem("tb:themec_wallpaper") || "bg-coastline.jpg";

  if (mode === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  document.documentElement.style.setProperty("--primary", primary);
  document.documentElement.style.setProperty("--wallpaper", `url(${wallpaper})`);

  const animPref = localStorage.getItem("tb:anim") || "system";

  if (animPref === "on" || (animPref === "system" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches)) {
    document.documentElement.classList.add("animated");
  }
}

window.updateSettings = () => {
  window.settings = {
    "theme": localStorage.getItem("tb:theme") || "coastline",
    "themec_primary": localStorage.getItem("tb:themec_primary") || "#08a",
    "themec_mode": localStorage.getItem("tb:themec_mode") || "light",
    "themec_wallpaper": localStorage.getItem("tb:themec_wallpaper") || "bg-coastline.jpg",
    "anim": localStorage.getItem("tb:anim") || "system",
    "dateFormat": localStorage.getItem("tb:dateFormat") || "D MMM YYYY",
    "timeFormat": localStorage.getItem("tb:timeFormat") || "H:mm",
    "username": localStorage.getItem("tb:username") || "",
    "nativeSelect": localStorage.getItem("tb:nativeSelect") || "false",
    "tempPref": localStorage.getItem("tb:tempPref") || "29",
    "seaTemp": localStorage.getItem("tb:seaTemp") || "27",
    "wavePrefs": localStorage.getItem("tb:wavePrefs") || "['0.4', '0.7', '1.0', '1.2']",
    "beachType": localStorage.getItem("tb:beachType") || "nopref",
    "beachTimezone": localStorage.getItem("tb:beachTimezone") || "auto",
    "okayClouds": localStorage.getItem("tb:okayClouds") || "true",
    "okayFog": localStorage.getItem("tb:okayFog") || "false",
    "okayRain": localStorage.getItem("tb:okayRain") || "false",
    "tempTolerance": localStorage.getItem("tb:tempTolerance") || "3",
    "seaTempTolerance": localStorage.getItem("tb:seaTempTolerance") || "2",
    "windPref": localStorage.getItem("tb:windPref") || "anyWind",
    "skinSens": localStorage.getItem("tb:skinSens") || "normal",
    "familyMode": localStorage.getItem("tb:familyMode") || "false",
  }
}

window.isThemeEdited = () => {
  window.updateSettings(); // ensure I have the latest settings before comparing
  const theme = window.settings.theme;
  console.log("Comparing current theme settings to defaults for theme:", theme);
  console.log(window.themes[theme]);
  for (const [key,value] of Object.entries(window.themes[theme])) {
    if (value !== window.settings["themec_" + key]) {
      return true;
    }
  }
  return false;
}

window.applyTheme = (name) => {
  localStorage.setItem("tb:theme", name);
  for (const [key,value] of Object.entries(window.themes[name])) {
    localStorage.setItem("tb:themec_" + key, value);
  }
  window.themer();
  window.updateSettings();
}

window.elementSetup = () => {
  if (window.settings.nativeSelect === "true") {
    document.querySelectorAll("select").forEach(s => s.classList.add("force-default"));
  } else {
    document.querySelectorAll("select").forEach(s => s.classList.remove("force-default"));
  }

  document.querySelectorAll("a").forEach(a => {
    a.tabIndex = 0;
  });
}

document.radioGroup = function (name) { // helper
  const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);

  return {
    get value() {
      const checked = [...radios].find(r => r.checked);
      return checked ? checked.value : null;
    },
    set value(v) {
      [...radios].forEach(r => r.checked = (r.value === v));
    },

    radios: radios,
  };
};

window.$ = function(selector) { // helper
  return document.querySelector(selector);
}

window.betterFetch = function(url, options = {}) { // a nice sync wrapper around fetch because async stinks
  const xhr = new XMLHttpRequest();
  xhr.open(options.method || "GET", url, false); // sync - standards enjoyers, you can file complaints in /dev/null

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      xhr.setRequestHeader(k, v);
    }
  }

  xhr.send(options.body || null);

  const text = xhr.response;

  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    status: xhr.status,
    statusText: xhr.statusText,
    url,

    text: () => text,
    json: () => {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON response:", e);
        return null;
      }
    },
    blob: () => new Blob([text]),

    headers: {
      get: (h) => xhr.getResponseHeader(h)
    }
  };
};

window.sbsetup = () => {
  if (localStorage.getItem("shorebase")) {
    Shorebase.loadFromObj(JSON.parse(localStorage.getItem("shorebase")));
    console.log("Loading local copy of Shorebase...")
  } else {
    Shorebase.db = window.betterFetch("https://darkerguy.github.io/shorebase/beaches.json").json();
  }
}

window.enableLocation = () => {
  if (confirm("ENABLE LOCATION?\nDo you want to enable location access for Tidebar? This will allow the app to give you nearby beaches and other cool stuff. Your location isn't sent to any server.\n\nClick OK to continue. The website will reload after permission is granted.")) {
    navigator.permissions.query({ name: "geolocation" }).then(result => {
      if (result.state === "granted") {
        alert("Location is already enabled. You can change this anytime by removing the permission from the browser.");
      } else if (result.state === "denied") {
        alert("The permission was forbidden by you, which means the popup wouldn't show up and the browser will just deny the request. If you did not mean to do this, manually enable it from your browser.");
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => {
            alert("Thanks for enabling location. The website will now reload.");
            location.reload(true);
          },
          err => {
            alert("The permission was denied. You can still enable it manually.")
          }
        )
      }
    });
  }
}

window.sentenceCase = (str) => { // yet another helper
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

window.beachInfoList = (beach) => {
  let has = [];
  if (beach.familyFriendly) {
    has.push("✓ Family friendly");
  } else {
    has.push("✕ Not family friendly")
  }
  if (window.settings.familyMode === "true") {
    if (beach.lifeguards) {
      has.push("✓ Lifeguards");
    } else {
      has.push("✕ No lifeguards")
    }
  }
  if (beach.access === "easy" && window.settings.familyMode === "true") {
    has.push("✓ Easy to get there");
  }
  if (beach.dogFriendly) {
    has.push("✓ Dogs allowed");
  }
  if (beach.surfRecommend !== "none") {
    has.push("✓ Good for " + beach.surfRecommend + " surfers");
  }
  if (beach.nudistFriendly) {
    has.push("✓ Nudist friendly");
  }
  if (beach.parking === "at-spot") {
    has.push("✓ Parking at the beach");
  }
  if (beach.parking === "nearby") {
    has.push("✓ Parking nearby");
  }
  if (beach.windExpose === "shelter") {
    has.push("✓ Sheltered from wind");
  }
  if (beach.lifeguards && window.settings.familyMode !== "true") {
    has.push("✓ Lifeguards");
  }
  if (beach.access === "hard") {
    has.push("!! This beach is hard to access");
  }
  if (beach.riptides === "occasional" || beach.riptides === "often") {
    has.push("!! Riptides possible");
  }
  if (beach.jellyfish === "occasional" || beach.jellyfish === "often") {
    has.push("!! Jellyfish stings possible");
  }
  if (beach.seaweed === "often") {
    has.push("!! Seaweed might get annoying, but not dangerous");
  }
  if (beach.waterClarity === "murky") {
    has.push("!! Water is murky");
  }
  if (beach.waterCleanliness === "bad") {
    has.push("!! Water isn't very clean");
  }
  if (beach.waterCleanliness === "dirty") {
    has.push("!! Water is very dirty");
  }
  if (beach.parking === "boat-only") {
    has.push("!! You must go there by boat");
  }

  return has;
}

function naturalJoin(arr, conjunction = "and") { // this is a helper too
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} ${conjunction} ${arr[1]}`;

  return `${arr.slice(0, -1).join(", ")} ${conjunction} ${arr[arr.length - 1]}`;
}

function normStr(str) { // yet another helper
  if (typeof str !== "string") {
    console.error("normStr() - The given text isn't a string, it's a " + typeof str)
  }
  let s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  s = s.replace(/ß/g, "ss");
  s = s.replace(/ø/g, "o");
  s = s.replace(/đ/g, "d");

  s = s.replace(/'/g, "");

  return s;
}

const rawFavs = localStorage.getItem("tb:favs") || "[]";
let parsedFavs = [];
try {
  parsedFavs = JSON.parse(rawFavs);
} catch (error) {
  parsedFavs = [];
}

parsedFavs.addFav = function (item) {
  if (!this.includes(item)) this.push(item);
};

parsedFavs.removeFav = function (item) {
  const index = this.indexOf(item);
  if (index !== -1) this.splice(index, 1);
};

parsedFavs.toggleFav = function (item) {
  if (this.includes(item)) {
    this.removeFav(item);
  } else {
    this.addFav(item);
  }
};

window.favs = new Proxy(parsedFavs, {
  set(target, property, value) {
    console.log("SET", property, value);
    target[property] = value;
    localStorage.setItem("tb:favs", JSON.stringify(window.favs));
    return true;
  }
});

window.recentBeaches = {};
window.recentBeaches.get = () => {
  const rawRecents = localStorage.getItem("tb:recents") || "[]";
  let parsedRecents = [];
  try {
    parsedRecents = JSON.parse(rawRecents);
  } catch (error) {
    parsedRecents = [];
  }
  return parsedRecents;
}
window.recentBeaches.remove = (beachName) => {
  const recents = window.recentBeaches.get();
  const index = recents.indexOf(beachName);
  if (index !== -1) {
    recents.splice(index, 1);
    localStorage.setItem("tb:recents", JSON.stringify(recents));
    console.log("Removed");
  }
}
window.recentBeaches.add = (beachName) => {
  let recents = window.recentBeaches.get();
  if (recents.includes(beachName)) {
    console.log("Removing...");
    window.recentBeaches.remove(beachName);

    recents = recentBeaches.get();
  }
  recents.unshift(beachName);
  if (recents.length > 5) {
    recents.pop();
  }
  localStorage.setItem("tb:recents", JSON.stringify(recents));
};

window.updateSettings();
window.themer();

document.addEventListener("DOMContentLoaded", window.elementSetup);

const filename = window.location.pathname.split("/").pop();

if (!(filename.startsWith("setup") || filename === "document.html") && localStorage.getItem("tb:setupDone") !== "true") {
  location.href = "setup.html";
}