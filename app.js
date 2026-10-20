/* global supabase */
(function () {
  "use strict";
  const config = window.SUPABASE_CONFIG;
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");
  const categories = {
    sale: ["Product sale", "Service", "Other income"],
    expense: ["Stock / inventory", "Rent", "Utilities", "Salary", "Transport", "Marketing", "Other"]
  };
  let client;
  let user;
  let settings = { shop_name: "My shop", currency: "USD", phone: "", address: "" };
  let transactions = [];
  let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let transactionFilter = "all";
  let deferredInstall;

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const money = value => new Intl.NumberFormat(undefined, { style: "currency", currency: settings.currency || "USD", maximumFractionDigits: 2 }).format(Number(value || 0));
  const dateText = value => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
  const monthText = value => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(value);
  const monthKey = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  const showToast = (message, error) => {
    const toast = document.createElement("div");
    toast.className = `toast${error ? " error" : ""}`;
    toast.textContent = message;
    document.getElementById("toast-region").appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  };
  const showApp = visible => { authView.classList.toggle("hidden", visible); appView.classList.toggle("hidden", !visible); };
  const reportError = (message, error) => { console.error(message, error); showToast(message, true); };

  function ensureConfig() {
    if (!config || !config.url || !config.anonKey || config.url.includes("YOUR_PROJECT")) {
      authView.innerHTML = `<div class="auth-card"><div class="auth-heading"><p class="eyebrow">Setup required</p><h1>Connect Supabase</h1><p>Copy <strong>supabase-config.js.example</strong> to <strong>supabase-config.js</strong> and add your Supabase URL and public anon key.</p></div><p class="auth-note">The app will be ready after the configuration file is added.</p></div>`;
      return false;
    }
    client = supabase.createClient(config.url, config.anonKey);
    return true;
  }

  async function loadSettings() {
    const { data, error } = await client.from("shop_settings").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (data) settings = data;
    else {
      const { data: created, error: createError } = await client.from("shop_settings").insert({ user_id: user.id }).select().single();
      if (createError) throw createError;
      settings = created;
    }
    $("brand-name").textContent = settings.shop_name;
    $("mobile-brand-name").textContent = settings.shop_name;
    $("shop-name").value = settings.shop_name;
    $("shop-currency").value = settings.currency;
    $("shop-phone").value = settings.phone || "";
    $("shop-address").value = settings.address || "";
    $("account-email").textContent = user.email;
  }

  async function loadTransactions() {
    const [salesResult, expensesResult] = await Promise.all([
      client.from("sales").select("*").eq("user_id", user.id).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }),
      client.from("expenses").select("*").eq("user_id", user.id).order("transaction_date", { ascending: false }).order("created_at", { ascending: false })
    ]);
    if (salesResult.error) throw salesResult.error;
    if (expensesResult.error) throw expensesResult.error;
    transactions = [
      ...(salesResult.data || []).map(item => ({ ...item, type: "sale" })),
      ...(expensesResult.data || []).map(item => ({ ...item, type: "expense" }))
    ].sort((a, b) => `${b.transaction_date}${b.created_at}`.localeCompare(`${a.transaction_date}${a.created_at}`));
    renderDashboard();
    renderTransactions();
  }

  function renderDashboard() {
    $("month-label").textContent = monthText(selectedMonth);
    const current = transactions.filter(item => item.transaction_date.startsWith(monthKey(selectedMonth)));
    const sales = current.filter(item => item.type === "sale").reduce((sum, item) => sum + Number(item.amount), 0);
    const expenses = current.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    $("metric-sales").textContent = money(sales);
    $("metric-expenses").textContent = money(expenses);
    $("metric-profit").textContent = money(sales - expenses);
    $("metric-count").textContent = current.length;
    $("sales-change").textContent = `${current.filter(item => item.type === "sale").length} sale${current.filter(item => item.type === "sale").length === 1 ? "" : "s"} this month`;
    const recent = transactions.slice(0, 5);
    $("recent-list").innerHTML = recent.length ? recent.map(item => `<div class="activity-item"><div class="activity-icon ${item.type}">${item.type === "sale" ? "↗" : "↘"}</div><div class="activity-main"><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml(item.category)} · ${dateText(item.transaction_date)}</small></div><span class="activity-amount">${item.type === "sale" ? "+" : "-"}${money(item.amount)}</span></div>`).join("") : '<div class="empty-state">No entries yet. Add your first sale or expense.</div>';
    drawChart();
  }

  function drawChart() {
    const canvas = $("performance-chart");
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 500;
    const height = 240;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    const months = Array.from({ length: 6 }, (_, index) => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 5 + index, 1));
    const values = months.map(month => {
      const items = transactions.filter(item => item.transaction_date.startsWith(monthKey(month)));
      return { sales: items.filter(i => i.type === "sale").reduce((s, i) => s + Number(i.amount), 0), expenses: items.filter(i => i.type === "expense").reduce((s, i) => s + Number(i.amount), 0) };
    });
    const max = Math.max(...values.flatMap(value => [value.sales, value.expenses]), 1);
    const left = 12, right = width - 12, top = 15, bottom = height - 35;
    ctx.font = "10px DM Sans"; ctx.fillStyle = "#9aa6ad"; ctx.strokeStyle = "#eef1f2"; ctx.lineWidth = 1;
    for (let line = 0; line < 4; line++) { const y = top + ((bottom - top) / 3) * line; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); ctx.fillText(money(max - (max / 3) * line).replace(/\.00$/, ""), left, y - 5); }
    const drawLine = (key, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
      values.forEach((value, index) => { const x = left + ((right - left) / 5) * index; const y = bottom - (value[key] / max) * (bottom - top); index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      values.forEach((value, index) => { const x = left + ((right - left) / 5) * index; const y = bottom - (value[key] / max) * (bottom - top); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); });
    };
    drawLine("sales", "#0d9488"); drawLine("expenses", "#e98c42");
    ctx.fillStyle = "#87939b"; ctx.textAlign = "center";
    months.forEach((month, index) => ctx.fillText(new Intl.DateTimeFormat(undefined, { month: "short" }).format(month), left + ((right - left) / 5) * index, height - 12));
    ctx.textAlign = "start";
  }

  function renderTransactions() {
    const query = $("transaction-search").value.toLowerCase();
    const rows = transactions.filter(item => (transactionFilter === "all" || item.type === transactionFilter) && `${item.description} ${item.category}`.toLowerCase().includes(query));
    $("transaction-rows").innerHTML = rows.length ? rows.map(item => `<tr><td><strong>${escapeHtml(item.description)}</strong>${item.notes ? `<br><small class="muted">${escapeHtml(item.notes)}</small>` : ""}</td><td><span class="type-badge ${item.type}">${item.type === "sale" ? "Sale" : "Expense"}</span></td><td>${escapeHtml(item.category)}</td><td>${dateText(item.transaction_date)}</td><td class="align-right"><strong>${item.type === "sale" ? "+" : "-"}${money(item.amount)}</strong></td><td><div class="row-actions"><button class="row-action" data-edit-id="${item.id}" data-edit-type="${item.type}" type="button">Edit</button><button class="row-action delete" data-delete-id="${item.id}" data-delete-type="${item.type}" type="button">Delete</button></div></td></tr>`).join("") : '<tr><td colspan="6" class="empty-state">No matching transactions.</td></tr>';
  }

  function renderReport() {
    const from = $("report-from").value;
    const to = $("report-to").value;
    const filtered = transactions.filter(item => (!from || item.transaction_date >= from) && (!to || item.transaction_date <= to));
    const sales = filtered.filter(item => item.type === "sale");
    const expenses = filtered.filter(item => item.type === "expense");
    const total = items => items.reduce((sum, item) => sum + Number(item.amount), 0);
    $("report-sales").textContent = money(total(sales));
    $("report-expenses").textContent = money(total(expenses));
    $("report-profit").textContent = money(total(sales) - total(expenses));
    $("report-count").textContent = filtered.length;
    $("report-period").textContent = `${from ? dateText(from) : "All dates"} – ${to ? dateText(to) : "Present"}`;
    $("report-shop-name").textContent = settings.shop_name;
    $("report-footer-shop").textContent = settings.shop_name;
    $("report-shop-contact").textContent = [settings.phone, settings.address].filter(Boolean).join(" · ");
    $("report-generated").textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date());
    const rows = (items, empty) => items.length ? items.map(item => `<tr><td>${dateText(item.transaction_date)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.category)}</td><td class="align-right"><strong>${money(item.amount)}</strong></td></tr>`).join("") : `<tr><td colspan="4" class="empty-state">${empty}</td></tr>`;
    $("report-sales-rows").innerHTML = rows(sales, "No sales in this period.");
    $("report-expense-rows").innerHTML = rows(expenses, "No expenses in this period.");
  }

  function openTransaction(type) {
    $("transaction-id").value = "";
    $("transaction-submit").textContent = "Save entry";
    $("transaction-type").value = type;
    $("transaction-title").textContent = type === "sale" ? "Add sale" : "Add expense";
    $("transaction-eyebrow").textContent = type === "sale" ? "Record income" : "Record spending";
    $("transaction-category").innerHTML = categories[type].map(category => `<option>${category}</option>`).join("");
    $("transaction-date").value = new Date().toISOString().slice(0, 10);
    $("transaction-form").reset();
    $("transaction-type").value = type;
    $("transaction-date").value = new Date().toISOString().slice(0, 10);
    $("transaction-category").innerHTML = categories[type].map(category => `<option>${category}</option>`).join("");
    document.getElementById("transaction-dialog").showModal();
  }

  function editTransaction(id, type) {
    const item = transactions.find(transaction => transaction.id === id && transaction.type === type);
    if (!item) return;
    $("transaction-id").value = item.id;
    $("transaction-type").value = type;
    $("transaction-title").textContent = type === "sale" ? "Edit sale" : "Edit expense";
    $("transaction-eyebrow").textContent = "Update entry";
    $("transaction-description").value = item.description;
    $("transaction-amount").value = item.amount;
    $("transaction-date").value = item.transaction_date;
    $("transaction-notes").value = item.notes || "";
    $("transaction-category").innerHTML = categories[type].map(category => `<option${category === item.category ? " selected" : ""}>${category}</option>`).join("");
    $("transaction-submit").textContent = "Update entry";
    document.getElementById("transaction-dialog").showModal();
  }

  async function saveTransaction(event) {
    event.preventDefault();
    const type = $("transaction-type").value;
    const table = type === "sale" ? "sales" : "expenses";
    const payload = { description: $("transaction-description").value.trim(), amount: Number($("transaction-amount").value), transaction_date: $("transaction-date").value, category: $("transaction-category").value, notes: $("transaction-notes").value.trim() || null };
    const id = $("transaction-id").value;
    const result = id ? await client.from(table).update(payload).eq("id", id).eq("user_id", user.id) : await client.from(table).insert({ ...payload, user_id: user.id });
    const { error } = result;
    if (error) { reportError("Could not save this entry.", error); return; }
    document.getElementById("transaction-dialog").close();
    $("transaction-form").reset();
    await loadTransactions();
    $("transaction-submit").textContent = "Save entry";
    showToast(id ? "Entry updated" : "Entry saved");
  }

  async function deleteTransaction(id, type) {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    const table = type === "sale" ? "sales" : "expenses";
    const { error } = await client.from(table).delete().eq("id", id).eq("user_id", user.id);
    if (error) { reportError("Could not delete this entry.", error); return; }
    await loadTransactions();
    showToast("Entry deleted");
  }

  function switchPage(page) {
    document.querySelectorAll(".page").forEach(section => section.classList.toggle("hidden", section.id !== `${page}-page`));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    if (page === "reports") renderReport();
    closeMobileMenu();
  }

  function closeMobileMenu() {
    $("mobile-menu-backdrop").classList.add("hidden");
    $("sidebar").classList.remove("mobile-open");
    $("mobile-menu-button").setAttribute("aria-expanded", "false");
  }

  async function boot() {
    if (!ensureConfig()) return;
    client.auth.onAuthStateChange((event, session) => {
      if (session) { user = session.user; showApp(true); loadSettings().then(loadTransactions).catch(error => reportError("Could not load your shop data.", error)); }
      else { user = null; showApp(false); }
    });
    const { data: { session }, error } = await client.auth.getSession();
    if (error) { reportError("Could not connect to Supabase.", error); return; }
    if (session) { user = session.user; showApp(true); try { await loadSettings(); await loadTransactions(); } catch (loadError) { reportError("Could not load your shop data.", loadError); } }
  }

  $("auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) return;
    const email = $("auth-email").value.trim(), password = $("auth-password").value;
    const { error } = $("auth-submit").dataset.mode === "signup" ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password });
    if (error) { reportError(error.message, error); return; }
    if ($("auth-submit").dataset.mode === "signup") showToast("Account created. Check your email to confirm it.");
  });
  $("auth-switch").addEventListener("click", () => {
    const signup = $("auth-submit").dataset.mode !== "signup";
    $("auth-submit").dataset.mode = signup ? "signup" : "signin";
    $("auth-submit").textContent = signup ? "Create account" : "Sign in";
    $("auth-title").textContent = signup ? "Create your account" : "Welcome back";
    $("auth-subtitle").textContent = signup ? "Start tracking your shop in minutes." : "Sign in to see your shop performance.";
    $("auth-switch").textContent = signup ? "Already have an account? Sign in" : "New here? Create an account";
  });
  document.querySelector(".sidebar").id = "sidebar";
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.page)));
  $("mobile-menu-button").addEventListener("click", () => {
    const isOpen = $("sidebar").classList.toggle("mobile-open");
    $("mobile-menu-backdrop").classList.toggle("hidden", !isOpen);
    $("mobile-menu-button").setAttribute("aria-expanded", String(isOpen));
  });
  $("mobile-menu-backdrop").addEventListener("click", closeMobileMenu);
  document.querySelectorAll("[data-page-link]").forEach(button => button.addEventListener("click", () => switchPage(button.dataset.pageLink)));
  document.querySelectorAll("[data-open-transaction]").forEach(button => button.addEventListener("click", () => openTransaction(button.dataset.openTransaction)));
  document.querySelectorAll(".close-dialog").forEach(button => button.addEventListener("click", () => document.getElementById("transaction-dialog").close()));
  $("transaction-form").addEventListener("submit", saveTransaction);
  $("transaction-search").addEventListener("input", renderTransactions);
  $("apply-report").addEventListener("click", renderReport);
  $("report-this-month").addEventListener("click", () => {
    const now = new Date();
    $("report-from").value = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    $("report-to").value = now.toISOString().slice(0, 10);
    renderReport();
  });
  $("print-report").addEventListener("click", () => { renderReport(); window.print(); });
  $("transaction-rows").addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-id]");
    const remove = event.target.closest("[data-delete-id]");
    if (edit) editTransaction(edit.dataset.editId, edit.dataset.editType);
    if (remove) deleteTransaction(remove.dataset.deleteId, remove.dataset.deleteType);
  });
  document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => { transactionFilter = tab.dataset.filter; document.querySelectorAll(".tab").forEach(item => item.classList.toggle("active", item === tab)); renderTransactions(); }));
  $("previous-month").addEventListener("click", () => { selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1); renderDashboard(); });
  $("next-month").addEventListener("click", () => { selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1); renderDashboard(); });
  $("current-month").addEventListener("click", () => { selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderDashboard(); });
  $("settings-form").addEventListener("submit", async event => { event.preventDefault(); const update = { user_id: user.id, shop_name: $("shop-name").value.trim(), currency: $("shop-currency").value, phone: $("shop-phone").value.trim() || null, address: $("shop-address").value.trim() || null, updated_at: new Date().toISOString() }; const { data, error } = await client.from("shop_settings").upsert(update).select().single(); if (error) { reportError("Could not save settings.", error); return; } settings = data; $("brand-name").textContent = settings.shop_name; $("mobile-brand-name").textContent = settings.shop_name; renderDashboard(); showToast("Settings saved"); });
  $("sign-out").addEventListener("click", () => client.auth.signOut());
  $("profile-button").addEventListener("click", () => client.auth.signOut());
  window.addEventListener("resize", () => { if (!appView.classList.contains("hidden")) drawChart(); });
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstall = event; $("install-button").classList.remove("hidden"); });
  $("install-button").addEventListener("click", async () => {
    if (!deferredInstall) {
      showToast("Use your browser menu and choose Install Ledgerly or Add to Home Screen.");
      return;
    }
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    deferredInstall = null;
    $("install-button").classList.add("hidden");
    if (choice.outcome === "accepted") showToast("Ledgerly is being installed");
  });
  window.addEventListener("appinstalled", () => { deferredInstall = null; $("install-button").classList.add("hidden"); showToast("Ledgerly installed"); });
  if ("serviceWorker" in navigator) window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      await registration.update();
    } catch (error) {
      console.warn("PWA registration failed", error);
    }
  });
  boot();
})();
