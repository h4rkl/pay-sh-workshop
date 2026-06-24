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
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function signedClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
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

    if (isProfiledToken && profile.logo) {
      const image = document.createElement("img");
      image.src = profile.logo;
      image.alt = `${row.token_symbol} logo`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.remove();
        mark.textContent = row.token_symbol.slice(0, 2);
      });
      mark.append(image);
    } else {
      mark.textContent = row.token_symbol.slice(0, 2);
    }

    node.querySelector("h3").textContent = row.token_symbol;

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
  if (!profile) {
    container.innerHTML = '<p class="empty-state">No drill-down profile loaded.</p>';
    return;
  }

  const details = profile.token_details || {};
  const metrics = profile.spot_metrics || {};
  const website = details.website
    ? `<a href="${details.website}" target="_blank" rel="noreferrer">Website</a>`
    : "";
  const xLink = details.x
    ? `<a href="https://x.com/${details.x}" target="_blank" rel="noreferrer">X</a>`
    : "";

  container.innerHTML = `
    <div class="profile-head">
      <img class="profile-logo" src="${profile.logo || ""}" alt="${profile.symbol || "Token"} logo">
      <div>
        <h3>${profile.symbol || "-"}</h3>
        <p>${profile.name || "-"}</p>
        <div class="profile-links">${website}${xLink}</div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="profile-stat">
        <span>Holders</span>
        <strong>${formatNumber(metrics.total_holders)}</strong>
      </div>
      <div class="profile-stat">
        <span>Liquidity</span>
        <strong>${formatCurrency(metrics.liquidity_usd)}</strong>
      </div>
      <div class="profile-stat">
        <span>Buy Volume</span>
        <strong>${formatCurrency(metrics.buy_volume_usd)}</strong>
      </div>
      <div class="profile-stat">
        <span>Sell Volume</span>
        <strong>${formatCurrency(metrics.sell_volume_usd)}</strong>
      </div>
      <div class="profile-stat">
        <span>Market Cap</span>
        <strong>${formatCurrency(details.market_cap_usd)}</strong>
      </div>
      <div class="profile-stat">
        <span>FDV</span>
        <strong>${formatCurrency(details.fdv_usd)}</strong>
      </div>
    </div>
  `;
}

function renderTable() {
  const body = document.querySelector("#token-table");
  body.replaceChildren();

  visibleRows().forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="symbol-cell">${row.token_symbol}</td>
      <td>${formatCurrency(row.price_usd, false)}</td>
      <td class="${signedClass(row.price_change)}">${formatPercent(row.price_change)}</td>
      <td>${formatCurrency(row.buy_volume)}</td>
      <td>${formatCurrency(row.sell_volume)}</td>
      <td class="${signedClass(row.netflow)}">${formatCurrency(row.netflow)}</td>
      <td>${formatCurrency(row.liquidity)}</td>
      <td>${row.nof_traders ?? "-"}</td>
    `;
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
    document.querySelector("main").innerHTML = `
      <section class="empty-state">
        <h2>Data files unavailable</h2>
        <p>${error.message}</p>
      </section>
    `;
  }
}

init();
