// ==== Tema (claro/escuro) ====
const THEME_KEY = 'bly_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-switch').checked = theme === 'dark';
  localStorage.setItem(THEME_KEY, theme);
}
document.getElementById('theme-switch').addEventListener('change', (e) => {
  applyTheme(e.target.checked ? 'dark' : 'light');
});
applyTheme(localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

// ==== Helpers de API ====
async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado');
  return data;
}

// ==== Alternância login/cadastro ====
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
document.getElementById('switch-to-register').addEventListener('click', () => {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  document.getElementById('switch-to-register-wrap').classList.add('hidden');
  document.getElementById('switch-to-login-wrap').classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = 'Crie a conta da sua marca';
});
document.getElementById('switch-to-login').addEventListener('click', () => {
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  document.getElementById('switch-to-login-wrap').classList.add('hidden');
  document.getElementById('switch-to-register-wrap').classList.remove('hidden');
  document.getElementById('auth-subtitle').textContent = 'Entre na sua conta pra gerenciar sua marca';
});

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('auth-error').classList.add('hidden');
  try {
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value,
      }),
    });
    await bootApp();
  } catch (err) {
    showAuthError(err.message);
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('auth-error').classList.add('hidden');
  try {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        brandName: document.getElementById('register-brand').value,
        name: document.getElementById('register-name').value,
        email: document.getElementById('register-email').value,
        password: document.getElementById('register-password').value,
      }),
    });
    await bootApp();
  } catch (err) {
    showAuthError(err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
});

// ==== Navegação entre páginas ====
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));
    const page = document.getElementById(`page-${item.dataset.page}`);
    page.classList.remove('hidden');
    loadPageData(item.dataset.page);
  });
});

document.getElementById('campaign-channel').addEventListener('change', (e) => {
  document.getElementById('campaign-subject-field').classList.toggle('hidden', e.target.value !== 'email');
});

// ==== Carregamento de dados por página ====
async function loadPageData(page) {
  try {
    if (page === 'overview') {
      const summary = await api('/dashboard/summary');
      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card glass"><div class="value">${summary.leads}</div><div class="label">Leads</div></div>
        <div class="stat-card glass"><div class="value">${summary.orders}</div><div class="label">Pedidos</div></div>
        <div class="stat-card glass"><div class="value">${summary.pendingPayments}</div><div class="label">Pagamentos pendentes</div></div>
        <div class="stat-card glass"><div class="value">${summary.conversations}</div><div class="label">Conversas</div></div>
      `;
    }
    if (page === 'leads') {
      const leads = await api('/dashboard/leads');
      const body = document.getElementById('leads-table-body');
      body.innerHTML = leads.map((l) => `
        <tr><td>${l.name || '-'}</td><td>${l.phone || '-'}</td><td>${l.email || '-'}</td><td>${new Date(l.created_at).toLocaleDateString('pt-BR')}</td></tr>
      `).join('');
      document.getElementById('leads-empty').classList.toggle('hidden', leads.length > 0);
    }
    if (page === 'orders') {
      const orders = await api('/dashboard/orders');
      const paymentBadge = (s) => ({ paid: 'success', pending: 'warning', cancelled: 'danger', refunded: 'neutral' }[s] || 'neutral');
      const body = document.getElementById('orders-table-body');
      body.innerHTML = orders.map((o) => `
        <tr>
          <td>${o.order_number || '-'}</td>
          <td>${o.lead_name || '-'}</td>
          <td>R$ ${Number(o.total_amount || 0).toFixed(2)}</td>
          <td><span class="badge badge-${paymentBadge(o.payment_status)}">${o.payment_status}</span></td>
          <td>${o.fulfillment_status}</td>
          <td>${o.tracking_code || '-'}</td>
        </tr>
      `).join('');
      document.getElementById('orders-empty').classList.toggle('hidden', orders.length > 0);
    }
    if (page === 'conversations') {
      const convos = await api('/dashboard/conversations');
      const body = document.getElementById('conversations-table-body');
      body.innerHTML = convos.map((c) => `
        <tr>
          <td>${c.lead_name || c.lead_phone || '-'}</td>
          <td>${c.channel}</td>
          <td>${(c.content || '').slice(0, 80)}</td>
          <td>${c.intent ? `<span class="badge badge-neutral">${c.intent}</span>` : '-'}</td>
          <td>${new Date(c.created_at).toLocaleString('pt-BR')}</td>
        </tr>
      `).join('');
      document.getElementById('conversations-empty').classList.toggle('hidden', convos.length > 0);
    }
    if (page === 'settings') {
      const settings = await api('/settings');
      const form = document.getElementById('settings-form');
      Object.entries(settings).forEach(([key, value]) => {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && value) input.value = value;
      });
      document.getElementById('webhook-urls').innerHTML = `
        Shopify (orders/create): ${settings.webhook_base_url}/shopify/orders-create<br/>
        Shopify (orders/paid): ${settings.webhook_base_url}/shopify/orders-paid<br/>
        Shopify (fulfillments/create): ${settings.webhook_base_url}/shopify/fulfillments-create<br/>
        WhatsApp: ${settings.webhook_base_url}/whatsapp<br/>
        Mercado Pago: ${settings.webhook_base_url}/mercadopago
      `;
    }
  } catch (err) {
    console.error(`Erro carregando ${page}:`, err);
  }
}

document.getElementById('leads-search').addEventListener('input', async (e) => {
  const leads = await api(`/dashboard/leads?search=${encodeURIComponent(e.target.value)}`);
  const body = document.getElementById('leads-table-body');
  body.innerHTML = leads.map((l) => `
    <tr><td>${l.name || '-'}</td><td>${l.phone || '-'}</td><td>${l.email || '-'}</td><td>${new Date(l.created_at).toLocaleDateString('pt-BR')}</td></tr>
  `).join('');
});

// ==== Formulário de configurações ====
document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
    const banner = document.getElementById('settings-saved');
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 3000);
  } catch (err) {
    alert(`Erro ao salvar: ${err.message}`);
  }
});

// ==== Disparo de campanha ====
document.getElementById('campaign-send-btn').addEventListener('click', async () => {
  const channel = document.getElementById('campaign-channel').value;
  const message = document.getElementById('campaign-message').value;
  const subject = document.getElementById('campaign-subject').value;
  const resultEl = document.getElementById('campaign-result');
  const errorEl = document.getElementById('campaign-error');
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  if (!message.trim()) return alert('Escreva uma mensagem antes de disparar.');
  if (!confirm(`Confirma o disparo por ${channel === 'whatsapp' ? 'WhatsApp' : 'e-mail'} pra TODOS os leads dessa marca?`)) return;

  try {
    const result = await api('/campaigns/send', { method: 'POST', body: JSON.stringify({ channel, message, subject }) });
    resultEl.textContent = `Disparado! ${result.sent} enviados, ${result.failed} falharam, de ${result.totalLeads} leads.`;
    resultEl.classList.remove('hidden');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});

// ==== Boot: verifica se já está logado ====
async function bootApp() {
  try {
    const me = await api('/auth/me');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('brand-name').textContent = `✦ ${me.tenant.name}`;
    if (me.tenant.theme_color) {
      document.documentElement.style.setProperty('--accent', me.tenant.theme_color);
    }
    loadPageData('overview');
  } catch (err) {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }
}

bootApp();
