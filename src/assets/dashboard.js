const DATA_PATHS = {
  screener: "data/token-screener-solana.json",
  radar: "data/radar-cards.json",
  profile: "data/token-information-cards.json"
};

const state = {
  filter: "all",
  sort: "buy_volume",
  rows: [],
  cards: [],
  profile: null
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1
});

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1
});

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function formatCurrency(value, compact = true) {
  if (!Number.isFinite(value)) return "-";
  return compact ? compactCurrencyFormatter.format(value) : currencyFormatter.format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  return percentFormatter.format(value);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return compactNumberFormatter.format(value);
}

function truncateAddress(address) {
  if (!address) return "-";
  const value = String(address);
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function signedClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

function initials(value) {
  return String(value || "-").slice(0, 2).toUpperCase();
}

function safeHttpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value), window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function safeXUrl(handle) {
  const value = String(handle || "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(value) ? `https://x.com/${value}` : "";
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeProfileStat(label, value) {
  const stat = makeElement("div", "profile-stat");
  stat.append(makeElement("span", "", label), makeElement("strong", "", value));
  return stat;
}

function makeTableCell(text, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  return cell;
}

function mergeRowsAndCards() {
  return state.rows.map((row) => ({
    ...row,
    radar: state.cards.find((card) => card.token_address === row.token_address) || null
  }));
}

function visibleRows() {
  const rows = mergeRowsAndCards().filter((row) => {
    if (state.filter === "positive") return row.netflow > 0;
    if (state.filter === "negative") return row.netflow < 0;
    return true;
  });

  return rows.sort((a, b) => (b[state.sort] || 0) - (a[state.sort] || 0));
}

function renderSummary() {
  const totals = state.rows.reduce(
    (acc, row) => {
      acc.buy += row.buy_volume || 0;
      acc.netflow += row.netflow || 0;
      acc.positive += row.netflow > 0 ? 1 : 0;
      return acc;
    },
    { buy: 0, netflow: 0, positive: 0 }
  );

  document.querySelector("#token-count").textContent = state.rows.length;
  document.querySelector("#buy-volume").textContent = formatCurrency(totals.buy);
  document.querySelector("#netflow").textContent = formatCurrency(totals.netflow);
  document.querySelector("#netflow").className = signedClass(totals.netflow);
  document.querySelector("#positive-count").textContent = `${totals.positive}/${state.rows.length}`;
}

function renderCards() {
  const container = document.querySelector("#cards");
  const template = document.querySelector("#card-template");
  const rows = visibleRows();
  container.replaceChildren();
  document.querySelector("#result-count").textContent = `${rows.length} shown`;

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No rows match the selected filter.";
    container.append(empty);
    return;
  }

  rows.forEach((row) => {
    const node = template.content.cloneNode(true);
    const card = row.radar || {};
    const profile = state.profile;
    const mark = node.querySelector(".token-mark");
    const isProfiledToken = profile?.contract_address === row.token_address;
    const logoUrl = safeHttpUrl(profile?.logo);

    if (isProfiledToken && logoUrl) {
      const image = document.createElement("img");
      image.src = logoUrl;
      image.alt = `${row.token_symbol || "Token"} logo`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.remove();
        mark.textContent = initials(row.token_symbol);
      });
      mark.append(image);
    } else {
      mark.textContent = initials(row.token_symbol);
    }

    node.querySelector("h3").textContent = row.token_symbol || "-";

    const addressButton = node.querySelector(".address");
    addressButton.textContent = truncateAddress(row.token_address);
    addressButton.title = row.token_address;
    addressButton.addEventListener("click", () => navigator.clipboard?.writeText(row.token_address));

    node.querySelector('[data-field="buy"]').textContent = formatCurrency(row.buy_volume);

    const netflow = node.querySelector('[data-field="netflow"]');
    netflow.textContent = formatCurrency(row.netflow);
    netflow.className = signedClass(row.netflow);

    const priceChange = node.querySelector('[data-field="price_change"]');
    priceChange.textContent = formatPercent(row.price_change);
    priceChange.className = signedClass(row.price_change);

    node.querySelector('[data-field="why"]').textContent =
      card.why_it_surfaced || "No radar-card explanation found for this token.";
    node.querySelector('[data-field="caution"]').textContent =
      card.do_not_infer || "Do not treat this row as a trading signal.";
    node.querySelector('[data-field="next"]').textContent =
      card.next_check || "Choose one follow-up API question before making another paid call.";

    container.append(node);
  });
}

function renderProfile() {
  const container = document.querySelector("#profile");
  const profile = state.profile;
  container.replaceChildren();

  if (!profile) {
    container.append(makeElement("p", "empty-state", "No drill-down profile loaded."));
    return;
  }

  const details = profile.token_details || {};
  const metrics = profile.spot_metrics || {};
  const profileHead = makeElement("div", "profile-head");
  const logoUrl = safeHttpUrl(profile.logo);
  const logo = logoUrl ? makeElement("img", "profile-logo") : makeElement("div", "profile-logo");
  if (logoUrl) {
    logo.src = logoUrl;
    logo.alt = `${profile.symbol || "Token"} logo`;
    logo.loading = "lazy";
  } else {
    logo.textContent = initials(profile.symbol);
  }
  profileHead.append(logo);

  const identity = document.createElement("div");
  identity.append(makeElement("h3", "", profile.symbol || "-"));
  identity.append(makeElement("p", "", profile.name || "-"));

  const links = makeElement("div", "profile-links");
  const websiteUrl = safeHttpUrl(details.website);
  const xUrl = safeXUrl(details.x);

  if (websiteUrl) {
    const website = makeElement("a", "", "Website");
    website.href = websiteUrl;
    website.target = "_blank";
    website.rel = "noreferrer";
    links.append(website);
  }

  if (xUrl) {
    const xLink = makeElement("a", "", "X");
    xLink.href = xUrl;
    xLink.target = "_blank";
    xLink.rel = "noreferrer";
    links.append(xLink);
  }

  identity.append(links);
  profileHead.append(identity);

  const stats = makeElement("div", "profile-stats");
  stats.append(
    makeProfileStat("Holders", formatNumber(metrics.total_holders)),
    makeProfileStat("Liquidity", formatCurrency(metrics.liquidity_usd)),
    makeProfileStat("Buy Volume", formatCurrency(metrics.buy_volume_usd)),
    makeProfileStat("Sell Volume", formatCurrency(metrics.sell_volume_usd)),
    makeProfileStat("Market Cap", formatCurrency(details.market_cap_usd)),
    makeProfileStat("FDV", formatCurrency(details.fdv_usd))
  );

  container.append(profileHead, stats);
}

function renderTable() {
  const body = document.querySelector("#token-table");
  body.replaceChildren();

  visibleRows().forEach((row) => {
    const tr = document.createElement("tr");
    tr.append(
      makeTableCell(row.token_symbol || "-", "symbol-cell"),
      makeTableCell(formatCurrency(row.price_usd, false)),
      makeTableCell(formatPercent(row.price_change), signedClass(row.price_change)),
      makeTableCell(formatCurrency(row.buy_volume)),
      makeTableCell(formatCurrency(row.sell_volume)),
      makeTableCell(formatCurrency(row.netflow), signedClass(row.netflow)),
      makeTableCell(formatCurrency(row.liquidity)),
      makeTableCell(row.nof_traders ?? "-")
    );
    body.append(tr);
  });
}

function render() {
  renderSummary();
  renderCards();
  renderProfile();
  renderTable();
}

function bindControls() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((candidate) => {
        candidate.classList.toggle("is-active", candidate === button);
      });
      renderCards();
      renderTable();
    });
  });

  document.querySelector("#sort-select").addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderCards();
    renderTable();
  });
}

async function init() {
  bindControls();

  try {
    const [screener, radar, profile] = await Promise.all([
      fetchJson(DATA_PATHS.screener),
      fetchJson(DATA_PATHS.radar),
      fetchJson(DATA_PATHS.profile)
    ]);

    state.rows = screener.data || [];
    state.cards = Array.isArray(radar) ? radar : [];
    state.profile = profile.data || null;
    render();
  } catch (error) {
    const main = document.querySelector("main");
    const section = makeElement("section", "empty-state");
    section.append(makeElement("h2", "", "Data files unavailable"));
    section.append(makeElement("p", "", error.message));
    main.replaceChildren(section);
  }
}

init();
