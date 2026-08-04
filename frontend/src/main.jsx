import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  Truck,
  Building2,
  KeyRound,
  History,
  BarChart3,
  Copy,
  FileSpreadsheet,
  Users,
  Package,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Pencil,
  Trash2,
  Settings,
  Bell,
  CheckCheck,
  X,
  AlertTriangle,
  CircleCheck,
  Clock3,
  Mail,
  Paperclip,
  Upload,
  ExternalLink,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
  Filter,
  ChevronDown,
  ChevronUp,
  MoreVertical
} from 'lucide-react';
import './style.css';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001'
});

function assetUrl(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^(https?:|data:|blob:)/i.test(source)) return source;
  return `${String(api.defaults.baseURL || '').replace(/\/$/, '')}/${source.replace(/^\//, '')}`;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.readAsDataURL(file);
  });
}

const ROLE_LABELS = Object.freeze({
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  VIEWER: 'Consulta',
  USER: 'Operador'
});

const FALLBACK_ROLE_PERMISSIONS = Object.freeze({
  ADMIN: [
    'QUOTE_VIEW', 'QUOTE_CREATE', 'QUOTE_SAVE', 'QUOTE_EXPORT', 'QUOTE_SEND', 'QUOTE_DELETE',
    'TRACKING_VIEW', 'TRACKING_CREATE', 'TRACKING_CHECK', 'TRACKING_EDIT',
    'TRACKING_DELETE', 'TRACKING_EVENT_CREATE', 'TRACKING_PROOF_CREATE',
    'TRACKING_PROOF_DELETE', 'TRACKING_CONFIG_MANAGE',
    'USER_MANAGE', 'COMPANY_MANAGE', 'CARRIER_MANAGE',
    'CREDENTIAL_MANAGE', 'PRODUCT_MANAGE'
  ],
  OPERATOR: [
    'QUOTE_VIEW', 'QUOTE_CREATE', 'QUOTE_SAVE', 'QUOTE_EXPORT', 'QUOTE_SEND',
    'TRACKING_VIEW', 'TRACKING_CREATE', 'TRACKING_CHECK', 'TRACKING_PROOF_CREATE'
  ],
  VIEWER: ['QUOTE_VIEW', 'QUOTE_EXPORT', 'TRACKING_VIEW'],
  USER: [
    'QUOTE_VIEW', 'QUOTE_CREATE', 'QUOTE_SAVE', 'QUOTE_EXPORT', 'QUOTE_SEND',
    'TRACKING_VIEW', 'TRACKING_CREATE', 'TRACKING_CHECK', 'TRACKING_PROOF_CREATE'
  ]
});

function roleLabel(role) {
  return ROLE_LABELS[role] || 'Consulta';
}

function userPermissions(user) {
  if (Array.isArray(user?.permissions)) return user.permissions;
  return FALLBACK_ROLE_PERMISSIONS[user?.role] || [];
}

function can(user, permission) {
  return userPermissions(user).includes(permission);
}

function defaultPageForUser(user) {
  if (user?.mustChangePassword) return 'password';
  if (can(user, 'QUOTE_CREATE')) return 'quotes';
  if (can(user, 'QUOTE_VIEW')) return 'history';
  if (can(user, 'TRACKING_VIEW')) return 'tracking';
  return 'password';
}

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

function money(v) {
  return v
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '-';
}

async function downloadQuoteDocument(quote, format) {
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';
  const response = await api.get(`/quotes/${quote.id}/export-${format}`, { responseType: 'blob' });
  const blob = new Blob([response.data], {
    type: format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cotacao-${quote.id}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', form);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      onLogin(response.data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="card loginCard">
        <div className="loginBrand">
          <Truck size={34} />
          <div>
            <h1>FreteHub</h1>
            <p>Cotação integrada de transportes</p>
          </div>
        </div>

        <label className="fieldLabel">
          E-mail
          <input
            type="email"
            autoComplete="email"
            placeholder="seuemail@empresa.com.br"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>

        <label className="fieldLabel">
          Senha
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>

        {error && <div className="formError">{error}</div>}
        <button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function NotificationCenter({ setPage, user }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const centerRef = useRef(null);
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const browserNotifiedRef = useRef(new Set());

  async function loadNotifications(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [listResponse, countResponse] = await Promise.all([
        api.get('/notifications', { params: { limit: 40 } }),
        api.get('/notifications/unread-count')
      ]);
      const rows = listResponse.data || [];
      setItems(rows);
      setUnreadCount(Number(countResponse.data?.count || 0));

      for (const item of rows.filter((row) => !row.readAt)) {
        if (
          !browserNotifiedRef.current.has(item.id) &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification(item.title, { body: item.message });
          browserNotifiedRef.current.add(item.id);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar central de notificações:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications(true);
    const timer = setInterval(() => loadNotifications(true), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      const clickedBell = centerRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);
      if (!clickedBell && !clickedPanel) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    function positionPanel() {
      const bell = bellRef.current;
      if (!bell) return;
      const rect = bell.getBoundingClientRect();
      const panelWidth = Math.min(400, Math.max(280, window.innerWidth - 32));
      let left = rect.right + 12;
      if (left + panelWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - panelWidth - 16);
      }
      const top = Math.max(16, Math.min(rect.top, window.innerHeight - 120));
      setPanelStyle({ top: `${top}px`, left: `${left}px`, width: `${panelWidth}px` });
    }

    positionPanel();
    window.addEventListener('resize', positionPanel);
    document.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      document.removeEventListener('scroll', positionPanel, true);
    };
  }, [open]);

  async function markRead(item) {
    if (!item.readAt) {
      await api.post(`/notifications/${item.id}/read`).catch(() => {});
      setItems((current) => current.map((row) => (
        row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
    }
  }

  async function openNotification(item) {
    await markRead(item);
    if (item.trackingId && can(user, 'TRACKING_VIEW')) {
      sessionStorage.setItem('fretehubTrackingFocusId', String(item.trackingId));
      window.dispatchEvent(new CustomEvent('fretehub:open-tracking', {
        detail: { trackingId: Number(item.trackingId) }
      }));
      setPage('tracking');
    }
    setOpen(false);
  }

  async function markAllRead() {
    await api.post('/notifications/read-all');
    const now = new Date().toISOString();
    setItems((current) => current.map((row) => ({ ...row, readAt: row.readAt || now })));
    setUnreadCount(0);
  }

  async function archive(item, event) {
    event.stopPropagation();
    await api.delete(`/notifications/${item.id}`);
    setItems((current) => current.filter((row) => row.id !== item.id));
    if (!item.readAt) setUnreadCount((current) => Math.max(0, current - 1));
  }

  function notificationIcon(item) {
    if (item.type === 'DELIVERY') return <CircleCheck size={18} />;
    if (item.type === 'DELAY') return <Clock3 size={18} />;
    if (item.type === 'DELIVERY_PROOF') return <Paperclip size={18} />;
    return <AlertTriangle size={18} />;
  }

  return (
    <div className="notificationCenter" ref={centerRef}>
      <button
        type="button"
        className="notificationBell"
        ref={bellRef}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) loadNotifications();
        }}
        aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="notificationCount">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && createPortal(
        <div className="notificationPanel notificationPanelPortal" ref={panelRef} style={panelStyle}>
          <div className="notificationPanelHeader">
            <div>
              <strong>Notificações</strong>
              <small>{unreadCount} não lida{unreadCount === 1 ? '' : 's'}</small>
            </div>
            <button
              type="button"
              className="notificationTextButton"
              onClick={markAllRead}
              disabled={!unreadCount}
            >
              <CheckCheck size={16} /> Marcar todas
            </button>
          </div>

          <div className="notificationList" aria-live="polite">
            {loading && <div className="notificationEmpty">Carregando...</div>}
            {!loading && !items.length && (
              <div className="notificationEmpty">Nenhuma notificação.</div>
            )}
            {!loading && items.map((item) => (
              <div
                key={item.id}
                className={`notificationItem ${item.readAt ? '' : 'unread'} severity-${item.severity || 'info'}`}
              >
                <button
                  type="button"
                  className="notificationItemMain"
                  onClick={() => openNotification(item)}
                >
                  <span className="notificationItemIcon">{notificationIcon(item)}</span>
                  <span className="notificationItemContent">
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <small>{new Date(item.createdAt).toLocaleString('pt-BR')}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="notificationArchive"
                  aria-label="Arquivar notificação"
                  onClick={(event) => archive(item, event)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Layout({ children, setPage, page, user }) {
  const operationItems = [
    can(user, 'QUOTE_CREATE') && ['quotes', 'Cotação de frete', Truck],
    can(user, 'QUOTE_VIEW') && ['history', 'Histórico de cotações', History],
    can(user, 'TRACKING_VIEW') && ['tracking', 'Tracking de cargas', Truck]
  ].filter(Boolean);

  const adminItems = [
    can(user, 'USER_MANAGE') && ['users', 'Usuários', Users],
    can(user, 'PRODUCT_MANAGE') && ['products', 'Produtos', Package],
    can(user, 'COMPANY_MANAGE') && ['companies', 'Empresas', Building2],
    can(user, 'CARRIER_MANAGE') && ['carriers', 'Transportadoras', Truck],
    can(user, 'CREDENTIAL_MANAGE') && ['credentials', 'Credenciais', KeyRound]
  ].filter(Boolean);

  const items = [
    ...operationItems,
    ...adminItems,
    ['password', 'Alterar senha', ShieldCheck]
  ];

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  }

  return (
    <div className="app">
      <aside>
        <div className="sideBrand"><Truck size={25} /><h2>FreteHub</h2></div>

        <div className="userSummary">
          <div className="userSummaryTop">
            <strong>{user?.name || user?.email}</strong>
            <NotificationCenter setPage={setPage} user={user} />
          </div>
          <small>{user?.email}</small>
          <span className="badge badge-alert">{roleLabel(user?.role)}</span>
        </div>

        {items.map(([id, label, Icon]) => (
          <button
            type="button"
            className={page === id ? 'active' : ''}
            onClick={() => setPage(id)}
            key={id}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}

        <button type="button" className="logoutButton" onClick={logout}>
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      <main>{children}</main>
    </div>
  );
}

function Dashboard() {
  const [qs, setQs] = useState([]);

  useEffect(() => {
    api.get('/quotes').then((r) => setQs(r.data)).catch(() => {});
  }, []);

  const allResults = qs.flatMap((q) =>
    (q.results || []).map((r) => ({
      ...r,
      quote: q
    }))
  );

  const successResults = allResults.filter(
    (r) => r.status === 'success' && r.valorFrete
  );

  const errorResults = allResults.filter((r) => r.status !== 'success');

  const totalFreight = successResults.reduce(
    (sum, r) => sum + Number(r.valorFrete || 0),
    0
  );

  const avgFreight = successResults.length
    ? totalFreight / successResults.length
    : 0;

  const cheapestResult = successResults.length
    ? successResults.reduce((min, r) =>
        Number(r.valorFrete) < Number(min.valorFrete) ? r : min
      )
    : null;

  const carrierRanking = Object.values(
    successResults.reduce((acc, r) => {
      const name = r.carrier?.nome || 'Não informado';

      if (!acc[name]) {
        acc[name] = {
          name,
          cotações: 0,
          total: 0,
          menor: Number(r.valorFrete)
        };
      }

      acc[name].cotações += 1;
      acc[name].total += Number(r.valorFrete || 0);
      acc[name].menor = Math.min(acc[name].menor, Number(r.valorFrete || 0));
      acc[name].média = acc[name].total / acc[name].cotações;

      return acc;
    }, {})
  ).sort((a, b) => a.média - b.média);

  const ufRanking = Object.values(
    qs.reduce((acc, q) => {
      const uf = q.ufDestino || 'N/I';
      if (!acc[uf]) acc[uf] = { uf, cotações: 0 };
      acc[uf].cotações += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.cotações - a.cotações);

  const statusData = [
    { name: 'Cotado', value: successResults.length },
    { name: 'Erro', value: errorResults.length }
  ];

  const timelineData = Object.values(
    qs.reduce((acc, q) => {
      const date = new Date(q.createdAt).toLocaleDateString('pt-BR');

      if (!acc[date]) {
        acc[date] = {
          date,
          cotações: 0
        };
      }

      acc[date].cotações += 1;
      return acc;
    }, {})
  );

  const lastQuotes = [...qs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);

  const errorRate = allResults.length
    ? (errorResults.length / allResults.length) * 100
    : 0;

  return (
    <>
      <h1>Dashboard Operacional</h1>

      <div className="grid4">
        <div className="card metric">
          Total de cotações
          <b>{qs.length}</b>
        </div>

        <div className="card metric">
          Resultados cotados
          <b>{successResults.length}</b>
        </div>

        <div className="card metric">
          Frete médio
          <b>{money(avgFreight)}</b>
        </div>

        <div className="card metric">
          Taxa de erro API
          <b>{errorRate.toFixed(1)}%</b>
        </div>
      </div>

      <div className="grid4">
        <div className="card metric">
          Menor frete
          <b>
            {cheapestResult
              ? `${cheapestResult.carrier?.nome} - ${money(
                  cheapestResult.valorFrete
                )}`
              : '-'}
          </b>
        </div>

        <div className="card metric">
          Total em fretes cotados
          <b>{money(totalFreight)}</b>
        </div>

        <div className="card metric">
          Transportadoras ativas
          <b>{carrierRanking.length}</b>
        </div>

        <div className="card metric">
          UFs atendidas
          <b>{ufRanking.length}</b>
        </div>
      </div>

      <div className="dashboardGrid">
        <div className="card chartCard">
          <h3>Cotações por Dia</h3>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="cotações" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chartCard">
          <h3>Status das Integrações</h3>

          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                label
              >
                {statusData.map((_, index) => (
                  <Cell key={index} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dashboardGrid">
        <div className="card chartCard">
          <h3>Ranking de Transportadoras</h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={carrierRanking}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  typeof value === 'number' ? money(value) : value
                }
              />
              <Bar dataKey="média" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card chartCard">
          <h3>Cotações por UF</h3>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ufRanking}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="uf" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="cotações" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Últimas Cotações</h3>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Empresa</th>
              <th>Destino</th>
              <th>Valor Mercadoria</th>
              <th>Data</th>
            </tr>
          </thead>

          <tbody>
            {lastQuotes.map((q) => (
              <tr key={q.id}>
                <td>{q.id}</td>
                <td>{q.company?.razaoSocial || '-'}</td>
                <td>
                  {q.cidadeDestino || '-'}/{q.ufDestino || '-'}
                </td>
                <td>{money(q.valorMercadoria)}</td>
                <td>{new Date(q.createdAt).toLocaleString()}</td>
              </tr>
            ))}

            {!lastQuotes.length && (
              <tr>
                <td colSpan="5">Nenhuma cotação registrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Companies() {
  const emptyForm = {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    telefone: '',
    email: '',
    logoUrl: '',
    clearLogoFile: false,
    ativo: true
  };

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');

  async function load() {
    try {
      const response = await api.get('/companies');
      setRows(response.data || []);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao carregar empresas.');
    }
  }

  useEffect(() => { load(); }, []);

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
    setLogoFile(null);
    setLogoPreview('');
    setLookupMessage('');
  }

  function edit(company) {
    setEditingId(company.id);
    setForm({
      razaoSocial: company.razaoSocial || '',
      nomeFantasia: company.nomeFantasia || '',
      cnpj: company.cnpj || '',
      inscricaoEstadual: company.inscricaoEstadual || '',
      cep: company.cep || '',
      endereco: company.endereco || '',
      numero: company.numero || '',
      complemento: company.complemento || '',
      bairro: company.bairro || '',
      cidade: company.cidade || '',
      uf: company.uf || '',
      telefone: company.telefone || '',
      email: company.email || '',
      logoUrl: company.logoUrl || '',
      clearLogoFile: false,
      ativo: company.ativo !== false
    });
    setLogoFile(null);
    setLogoPreview(assetUrl(company.effectiveLogoUrl));
    setLookupMessage('');
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function lookupCnpj() {
    const cnpj = String(form.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      setLookupMessage('Informe um CNPJ com 14 dígitos para consultar.');
      return;
    }
    setLookupLoading(true);
    setLookupMessage('Consultando dados cadastrais...');
    try {
      const response = await api.get(`/companies/lookup/cnpj/${cnpj}`);
      const data = response.data || {};
      setForm((current) => ({
        ...current,
        cnpj,
        razaoSocial: data.razaoSocial || current.razaoSocial,
        nomeFantasia: data.nomeFantasia || current.nomeFantasia,
        inscricaoEstadual: data.inscricaoEstadual || current.inscricaoEstadual,
        cep: data.cep || current.cep,
        endereco: data.endereco || current.endereco,
        numero: data.numero || current.numero,
        complemento: data.complemento || current.complemento,
        bairro: data.bairro || current.bairro,
        cidade: data.cidade || current.cidade,
        uf: String(data.uf || current.uf).toUpperCase(),
        telefone: data.telefone || current.telefone,
        email: data.email || current.email
      }));
      setLookupMessage(
        `Dados preenchidos via ${data.provider || 'consulta cadastral'}${data.situacaoCadastral ? ` · Situação: ${data.situacaoCadastral}` : ''}. Revise antes de salvar.`
      );
    } catch (error) {
      setLookupMessage(error.response?.data?.error || error.response?.data?.message || 'Não foi possível consultar o CNPJ.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function selectLogoFile(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      alert('Use uma imagem PNG, JPG ou JPEG.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('A logomarca deve ter no máximo 5 MB.');
      event.target.value = '';
      return;
    }
    setLogoFile(file);
    setForm((current) => ({ ...current, clearLogoFile: false }));
    setLogoPreview(await fileAsDataUrl(file));
  }

  async function save(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (logoFile) {
        payload.logoFileName = logoFile.name;
        payload.logoMimeType = logoFile.type;
        payload.logoDataBase64 = await fileAsDataUrl(logoFile);
      }
      if (editingId) await api.put(`/companies/${editingId}`, payload);
      else await api.post('/companies', payload);
      clearForm();
      await load();
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao salvar empresa.');
    } finally {
      setLoading(false);
    }
  }

  async function activate(id) {
    try { await api.post(`/companies/${id}/activate`); await load(); }
    catch (error) { alert(error.response?.data?.message || 'Erro ao ativar empresa.'); }
  }

  async function deactivate(id) {
    if (!confirm('Desativar esta empresa e bloquear os usuários vinculados?')) return;
    try { await api.post(`/companies/${id}/deactivate`); await load(); }
    catch (error) { alert(error.response?.data?.message || 'Erro ao desativar empresa.'); }
  }

  async function remove(company) {
    const accepted = confirm(
      `Excluir permanentemente “${company.nomeFantasia || company.razaoSocial}”? ` +
      'Esta ação também excluirá cotações, trackings, credenciais e usuários comuns vinculados.'
    );
    if (!accepted) return;
    try {
      await api.delete(`/companies/${company.id}`);
      if (editingId === company.id) clearForm();
      await load();
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao excluir empresa.');
    }
  }

  const field = (name, label, options = {}) => (
    <label className={`fieldLabel ${options.className || ''}`} key={name}>
      {label}
      <input
        type={options.type || 'text'}
        value={form[name] || ''}
        maxLength={options.maxLength}
        required={options.required}
        onBlur={options.onBlur}
        onChange={(event) => setForm({
          ...form,
          [name]: name === 'uf'
            ? event.target.value.toUpperCase()
            : ['cnpj', 'cep'].includes(name)
              ? event.target.value.replace(/\D/g, '')
              : event.target.value
        })}
      />
    </label>
  );

  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Empresas</h1>
          <p>Cadastre empresas, consulte o CNPJ e configure a identidade visual usada nas propostas.</p>
        </div>
      </div>

      <form className="card formGrid" onSubmit={save}>
        {field('razaoSocial', 'Razão social', { required: true, className: 'fieldSpan2' })}
        {field('nomeFantasia', 'Nome fantasia')}

        <label className="fieldLabel cnpjLookupField">
          CNPJ
          <div className="inlineFieldAction">
            <input
              value={form.cnpj}
              maxLength="14"
              required
              inputMode="numeric"
              onChange={(event) => {
                setLookupMessage('');
                setForm({ ...form, cnpj: event.target.value.replace(/\D/g, '') });
              }}
              onBlur={() => {
                if (!editingId && String(form.cnpj || '').replace(/\D/g, '').length === 14 && !form.razaoSocial) lookupCnpj();
              }}
            />
            <button type="button" className="btn-secondary" disabled={lookupLoading} onClick={lookupCnpj}>
              {lookupLoading ? 'Consultando...' : 'Consultar CNPJ'}
            </button>
          </div>
          {lookupMessage && <small className={lookupMessage.includes('Não foi') || lookupMessage.includes('Informe') ? 'lookupError' : 'lookupSuccess'}>{lookupMessage}</small>}
        </label>

        {field('inscricaoEstadual', 'Inscrição estadual')}
        {field('cep', 'CEP', { required: true, maxLength: 8 })}
        {field('endereco', 'Endereço', { required: true, className: 'fieldSpan2' })}
        {field('numero', 'Número')}
        {field('complemento', 'Complemento')}
        {field('bairro', 'Bairro')}
        {field('cidade', 'Cidade', { required: true })}
        {field('uf', 'UF', { required: true, maxLength: 2 })}
        {field('telefone', 'Telefone')}
        {field('email', 'E-mail', { type: 'email' })}

        <div className="fieldSpan companyBrandingBox">
          <div className="companyBrandingFields">
            {field('logoUrl', 'URL da logomarca (opcional)', { className: 'logoUrlField' })}
            <label className="fieldLabel">
              Anexar logomarca
              <input type="file" accept="image/png,image/jpeg" onChange={selectLogoFile} />
              <small>PNG, JPG ou JPEG, até 5 MB. O arquivo anexado tem prioridade sobre a URL.</small>
            </label>
          </div>
          <div className="companyLogoPanel">
            {logoPreview || form.logoUrl ? (
              <img className="companyLogoLargePreview" src={logoPreview || form.logoUrl} alt="Prévia da logomarca" />
            ) : <span className="logoEmptyState">Nenhuma logomarca selecionada</span>}
            {editingId && logoPreview && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setLogoFile(null);
                  setLogoPreview(form.logoUrl || '');
                  setForm((current) => ({ ...current, clearLogoFile: true }));
                }}
              >Remover arquivo anexado</button>
            )}
          </div>
        </div>

        <label className="fieldLabel">
          Status
          <select value={form.ativo ? 'true' : 'false'} onChange={(event) => setForm({ ...form, ativo: event.target.value === 'true' })}>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </label>

        <div className="formActions fieldSpan">
          <button type="submit" disabled={loading}>{loading ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar empresa'}</button>
          {editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar edição</button>}
        </div>
      </form>

      <div className="card tableCard">
        <div className="tableScroll">
          <table>
            <thead><tr><th>Empresa</th><th>Logomarca</th><th>CNPJ</th><th>Cidade/UF</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {rows.map((company) => (
                <tr key={company.id}>
                  <td><strong>{company.nomeFantasia || company.razaoSocial}</strong><br /><small>{company.razaoSocial}</small></td>
                  <td>{company.effectiveLogoUrl ? <img className="companyLogoPreview" src={assetUrl(company.effectiveLogoUrl)} alt={`Logo ${company.nomeFantasia || company.razaoSocial}`} /> : '-'}</td>
                  <td>{company.cnpj}</td>
                  <td>{company.cidade}/{company.uf}</td>
                  <td><span className={`badge ${company.ativo ? 'badge-success' : 'badge-error'}`}>{company.ativo ? 'Ativa' : 'Inativa'}</span></td>
                  <td className="actionsCell">
                    <button type="button" onClick={() => edit(company)}>Editar</button>
                    {company.ativo ? <button type="button" className="btn-secondary" onClick={() => deactivate(company.id)}>Desativar</button> : <button type="button" onClick={() => activate(company.id)}>Ativar</button>}
                    <button type="button" className="btn-danger" onClick={() => remove(company)}>Excluir</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="6">Nenhuma empresa cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Carriers() {
  const emptyForm = {
    nome: '',
    logoUrl: '',
    tipoIntegracao: 'API',
    ambientePadrao: 'HOMOLOGACAO',
    apiUrl: '',
    portalUrl: '',
    observacoes: '',
    ativo: true
  };

  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [testStatus, setTestStatus] = useState({});
  const [form, setForm] = useState(emptyForm);

  async function load() {
    try {
      const response = await api.get('/carriers?active=all');
      setRows(response.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao carregar transportadoras.');
    }
  }

  useEffect(() => { load(); }, []);

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editingId) await api.put(`/carriers/${editingId}`, form);
      else await api.post('/carriers', form);
      clearForm();
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao salvar transportadora.');
    }
  }

  function edit(carrier) {
    setEditingId(carrier.id);
    setForm({
      nome: carrier.nome || '',
      logoUrl: carrier.logoUrl || '',
      tipoIntegracao: carrier.tipoIntegracao || 'API',
      ambientePadrao: carrier.ambientePadrao || 'HOMOLOGACAO',
      apiUrl: carrier.apiUrl || '',
      portalUrl: carrier.portalUrl || '',
      observacoes: carrier.observacoes || '',
      ativo: carrier.ativo !== false
    });
  }

  async function deactivate(id) {
    if (!confirm('Desativar esta transportadora?')) return;
    try {
      await api.delete(`/carriers/${id}`);
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao desativar transportadora.');
    }
  }

  async function testIntegration(carrier) {
    setTestStatus((current) => ({ ...current, [carrier.id]: 'Testando...' }));
    try {
      const response = await api.post(`/carriers/${carrier.id}/test`);
      setTestStatus((current) => ({
        ...current,
        [carrier.id]: response.data.message || 'Teste concluído.'
      }));
    } catch (error) {
      setTestStatus((current) => ({
        ...current,
        [carrier.id]: error.response?.data?.message || 'Falha no teste.'
      }));
    }
  }

  const filteredRows = rows.filter((row) =>
    row.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="pageHeader">
        <div><h1>Transportadoras</h1><p>Integrações, ambientes e canais de cotação.</p></div>
      </div>

      <form className="card formGrid" onSubmit={save}>
        <label className="fieldLabel">Nome
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </label>

        <label className="fieldLabel">Logo (URL)
          <input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
        </label>

        <label className="fieldLabel">Tipo de integração
          <select value={form.tipoIntegracao} onChange={(e) => setForm({ ...form, tipoIntegracao: e.target.value })}>
            <option value="API">API</option>
            <option value="PORTAL">Portal</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>

        <label className="fieldLabel">Ambiente padrão
          <select value={form.ambientePadrao} onChange={(e) => setForm({ ...form, ambientePadrao: e.target.value })}>
            <option value="HOMOLOGACAO">Homologação</option>
            <option value="PRODUCAO">Produção</option>
          </select>
        </label>

        <label className="fieldLabel">Status
          <select value={String(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.value === 'true' })}>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </label>

        <label className="fieldLabel">URL da API
          <input value={form.apiUrl} onChange={(e) => setForm({ ...form, apiUrl: e.target.value })} />
        </label>

        <label className="fieldLabel">URL do portal
          <input value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} />
        </label>

        <label className="fieldLabel fieldSpan">Observações
          <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows="3" />
        </label>

        <div className="formActions fieldSpan">
          <button type="submit">{editingId ? 'Salvar alterações' : 'Cadastrar transportadora'}</button>
          {editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar</button>}
        </div>
      </form>

      <div className="card tableCard">
        <input className="tableSearch" placeholder="Buscar transportadora..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tableScroll">
          <table>
            <thead><tr><th>Logo</th><th>Transportadora</th><th>Integração</th><th>Ambiente</th><th>Status</th><th>Teste</th><th>Ações</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.logoUrl ? <img className="carrierLogo" src={row.logoUrl} alt="" /> : <span className="logoFallback">🚚</span>}</td>
                  <td><strong>{row.nome}</strong><br /><small>{row.observacoes || '-'}</small></td>
                  <td>{row.tipoIntegracao}</td>
                  <td>{row.ambientePadrao === 'PRODUCAO' ? 'Produção' : 'Homologação'}</td>
                  <td><span className={`badge ${row.ativo ? 'badge-success' : 'badge-error'}`}>{row.ativo ? 'Ativa' : 'Inativa'}</span></td>
                  <td><button type="button" className="btn-secondary" onClick={() => testIntegration(row)}>Testar integração</button><small className="testMessage">{testStatus[row.id] || ''}</small></td>
                  <td className="actionsCell"><button type="button" onClick={() => edit(row)}>Editar</button><button type="button" className="btn-danger" onClick={() => deactivate(row.id)}>Desativar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Credentials() {
  const emptyForm = {
    companyId: '',
    carrierId: '',
    ambiente: 'HOMOLOGACAO',
    usuario: '',
    senha: '',
    token: '',
    codigoCliente: '',
    contrato: '',
    cnpjVinculado: '',
    correiosDr: '',
    correiosProdutos: '',
    ativo: true
  };

  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [testStatus, setTestStatus] = useState({});

  function normalizedCarrierName(carrier) {
    return String(carrier?.nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  const selectedCarrier = carriers.find(
    (carrier) => Number(carrier.id) === Number(form.carrierId)
  );
  const selectedCarrierName = normalizedCarrierName(selectedCarrier);
  const isCamiloCredential = selectedCarrierName.includes('camilo');
  const isCorreiosCredential = selectedCarrierName.includes('correios');

  async function load() {
    const [credentialsResponse, companiesResponse, carriersResponse] = await Promise.all([
      api.get('/carrier-credentials'),
      api.get('/companies'),
      api.get('/carriers?active=all')
    ]);
    setRows(credentialsResponse.data);
    setCompanies(companiesResponse.data);
    setCarriers(carriersResponse.data);
  }

  useEffect(() => { load().catch((error) => alert(error.response?.data?.message || 'Erro ao carregar credenciais.')); }, []);

  function clearForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function edit(row) {
    setEditingId(row.id);
    setForm({
      companyId: row.companyId,
      carrierId: row.carrierId,
      ambiente: row.ambiente,
      usuario: row.usuario || '',
      senha: '',
      token: '',
      codigoCliente: row.codigoCliente || '',
      contrato: row.contrato || '',
      cnpjVinculado: row.cnpjVinculado || '',
      correiosDr: row.configuracao?.correiosDr || '',
      correiosProdutos: row.configuracao?.correiosProdutos || '',
      ativo: row.ativo
    });
  }

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!isCorreiosCredential) {
        delete payload.correiosDr;
        delete payload.correiosProdutos;
      }

      if (editingId) await api.put(`/carrier-credentials/${editingId}`, payload);
      else await api.post('/carrier-credentials', payload);
      clearForm();
      await load();
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao salvar credencial.');
    }
  }

  async function testCredential(row) {
    setTestStatus((current) => ({ ...current, [row.id]: 'Testando autenticação...' }));
    try {
      const response = await api.post(`/carrier-credentials/${row.id}/test`);
      const expiresAt = response.data?.details?.expiresAt
        ? ` Token válido até ${new Date(response.data.details.expiresAt).toLocaleString('pt-BR')}.`
        : '';
      setTestStatus((current) => ({
        ...current,
        [row.id]: `${response.data?.message || 'Autenticação concluída.'}${expiresAt}`
      }));
    } catch (error) {
      setTestStatus((current) => ({
        ...current,
        [row.id]: error.response?.data?.error || error.response?.data?.message || 'Falha no teste.'
      }));
    }
  }

  async function deactivate(id) {
    if (!confirm('Desativar esta credencial?')) return;
    await api.delete(`/carrier-credentials/${id}`);
    load();
  }

  return (
    <>
      <div className="pageHeader"><div><h1>Credenciais</h1><p>Os valores de senha, código de acesso e token nunca aparecem na listagem.</p></div></div>

      <form className="card formGrid" onSubmit={save}>
        <label className="fieldLabel">Transportadora
          <select value={form.carrierId} onChange={(e) => setForm({ ...form, carrierId: e.target.value })} required>
            <option value="">Selecione</option>
            {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.nome}</option>)}
          </select>
        </label>

        <label className="fieldLabel">Empresa
          <select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>
            <option value="">Selecione</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>)}
          </select>
        </label>

        <label className="fieldLabel">Ambiente
          <select value={form.ambiente} onChange={(e) => setForm({ ...form, ambiente: e.target.value })}>
            <option value="HOMOLOGACAO">Homologação</option>
            <option value="PRODUCAO">Produção</option>
          </select>
        </label>

        <label className="fieldLabel">
          {isCamiloCredential ? 'Usuário SSW' : isCorreiosCredential ? 'Usuário idCorreios' : 'Usuário'}
          <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
        </label>
        <label className="fieldLabel">
          {isCamiloCredential ? 'Senha do usuário SSW' : isCorreiosCredential ? 'Código de acesso à API' : 'Senha'}
          <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder={editingId ? 'Preencha somente para substituir' : ''} />
        </label>
        <label className="fieldLabel">
          {isCamiloCredential ? 'Senha do pagador' : isCorreiosCredential ? 'Token manual (opcional)' : 'Token'}
          <input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={editingId ? 'Preencha somente para substituir' : ''} />
        </label>
        <label className="fieldLabel">
          {isCamiloCredential ? 'Domínio SSW' : isCorreiosCredential ? 'Cartão de postagem' : 'Código do cliente'}
          <input value={form.codigoCliente} onChange={(e) => setForm({ ...form, codigoCliente: isCorreiosCredential ? e.target.value.replace(/\D/g, '') : e.target.value })} maxLength={isCamiloCredential ? 3 : undefined} />
        </label>
        <label className="fieldLabel">
          {isCamiloCredential ? 'Código da mercadoria (opcional)' : isCorreiosCredential ? 'Contrato (necessário para Busca CEP)' : 'Contrato'}
          <input value={form.contrato} onChange={(e) => setForm({ ...form, contrato: isCorreiosCredential ? e.target.value.replace(/\D/g, '') : e.target.value })} placeholder={isCamiloCredential ? 'Padrão: 1' : ''} />
        </label>

        {isCorreiosCredential ? (
          <>
            <label className="fieldLabel">DR / Superintendência
              <input value={form.correiosDr} onChange={(e) => setForm({ ...form, correiosDr: e.target.value.replace(/\D/g, '') })} maxLength="3" placeholder="Ex.: 72" />
            </label>
            <label className="fieldLabel fieldSpan2">Produtos contratados
              <input value={form.correiosProdutos} onChange={(e) => setForm({ ...form, correiosProdutos: e.target.value })} placeholder="Ex.: 04162:SEDEX; 04669:PAC" />
            </label>
          </>
        ) : (
          <label className="fieldLabel">CNPJ vinculado<input value={form.cnpjVinculado} onChange={(e) => setForm({ ...form, cnpjVinculado: e.target.value.replace(/\D/g, '') })} maxLength="14" /></label>
        )}

        {isCamiloCredential && (
          <div className="infoBox fieldSpan">
            A Camilo usa o SSW: Domínio SSW, usuário, senha do usuário e senha do pagador. O CNPJ do pagador é definido pelo tipo de frete da cotação.
          </div>
        )}
        {isCorreiosCredential && (
          <div className="infoBox fieldSpan">
            Use o código de acesso gerado no CWS, não a senha pessoal do portal. O contrato é usado na Busca CEP; o cartão de postagem é usado na cotação. Informe os códigos de produto habilitados no contrato, e cada código será exibido como uma modalidade separada.
          </div>
        )}
        <label className="fieldLabel">Status
          <select value={String(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Inativa</option></select>
        </label>

        <div className="formActions fieldSpan"><button type="submit">{editingId ? 'Salvar alterações' : 'Cadastrar credencial'}</button>{editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar</button>}</div>
      </form>

      <div className="card tableCard"><div className="tableScroll"><table>
        <thead><tr><th>Transportadora</th><th>Empresa</th><th>Ambiente</th><th>Identificação</th><th>Segredos</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((row) => {
          const isCorreiosRow = normalizedCarrierName(row.carrier).includes('correios');
          return <tr key={row.id}>
            <td>{row.carrier?.nome}</td>
            <td>{row.company?.nomeFantasia || row.company?.razaoSocial}</td>
            <td>{row.ambiente === 'PRODUCAO' ? 'Produção' : 'Homologação'}</td>
            <td>
              {row.usuario || '-'}<br />
              <small>{isCorreiosRow ? 'Cartão' : 'Cliente'}: {row.codigoCliente || '-'} · Contrato: {row.contrato || '-'}</small>
              {isCorreiosRow && <><br /><small>DR: {row.configuracao?.correiosDr || '-'} · Produtos: {row.configuracao?.correiosProdutos || '-'}</small></>}
            </td>
            <td><span className="secretState">Senha/código: {row.hasPassword ? 'configurado' : 'não informado'}</span><br /><span className="secretState">Token: {row.hasToken ? 'configurado' : 'automático'}</span></td>
            <td><span className={`badge ${row.ativo ? 'badge-success' : 'badge-error'}`}>{row.ativo ? 'Ativa' : 'Inativa'}</span></td>
            <td className="actionsCell">
              <button type="button" onClick={() => edit(row)}>Editar</button>
              {isCorreiosRow && <button type="button" className="btn-secondary" onClick={() => testCredential(row)}>Testar autenticação</button>}
              <button type="button" className="btn-danger" onClick={() => deactivate(row.id)}>Desativar</button>
              {testStatus[row.id] && <small className="testMessage">{testStatus[row.id]}</small>}
            </td>
          </tr>;
        })}</tbody>
      </table></div></div>
    </>
  );
}

function Crud({ title, path, fields }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});

  async function load() {
    const response = await api.get(path);
    setRows(response.data);
  }

  useEffect(() => { load().catch(console.error); }, []);

  async function save(e) {
    e.preventDefault();
    try {
      await api.post(path, form);
      setForm({});
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao salvar.');
    }
  }

  async function remove(id) {
    if (!confirm('Desativar este registro?')) return;
    await api.delete(`${path}/${id}`);
    load();
  }

  return (
    <>
      <h1>{title}</h1>
      <form className="card formGrid" onSubmit={save}>
        {fields.map((field) => <label className="fieldLabel" key={field}>{field}<input value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} /></label>)}
        <div className="formActions fieldSpan"><button type="submit">Salvar</button></div>
      </form>
      <div className="card tableCard"><div className="tableScroll"><table><tbody>{rows.map((row) => <tr key={row.id}><td>{row.razaoSocial || row.nome || row.id}</td><td>{row.cnpj || '-'}</td><td>{row.ativo === false ? 'Inativo' : 'Ativo'}</td><td><button type="button" className="btn-danger" onClick={() => remove(row.id)}>Desativar</button></td></tr>)}</tbody></table></div></div>
    </>
  );
}

function ProductsAdmin() {
  const emptyForm = {
    description: '',
    lengthMeters: '',
    widthMeters: '',
    heightMeters: '',
    weightKg: '',
    active: true
  };

  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const response = await api.get('/products?active=all&limit=500');
    setRows(response.data);
  }

  useEffect(() => {
    load().catch((error) => {
      alert(
        error.response?.data?.message ||
          'Erro ao carregar produtos.'
      );
    });
  }, []);

  function clearForm() {
    setEditingId(null);
    setForm({
      description: '',
      lengthMeters: '',
      widthMeters: '',
      heightMeters: '',
      weightKg: '',
      active: true
    });
  }

  function edit(product) {
    setEditingId(product.id);
    setForm({
      description: product.description,
      lengthMeters: product.lengthMeters,
      widthMeters: product.widthMeters,
      heightMeters: product.heightMeters,
      weightKg: product.weightKg,
      active: product.active
    });
  }

  async function save(event) {
    event.preventDefault();

    try {
      const data = {
        description: form.description.trim(),
        lengthMeters: Number(form.lengthMeters),
        widthMeters: Number(form.widthMeters),
        heightMeters: Number(form.heightMeters),
        weightKg: Number(form.weightKg),
        active: form.active
      };

      if (editingId) {
        await api.put(`/products/${editingId}`, data);
      } else {
        await api.post('/products', data);
      }

      clearForm();
      await load();
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Erro ao salvar produto.'
      );
    }
  }

  async function deactivate(id) {
    if (!confirm('Desativar este produto?')) return;

    try {
      await api.delete(`/products/${id}`);
      await load();
    } catch (error) {
      alert(
        error.response?.data?.message ||
          'Erro ao desativar produto.'
      );
    }
  }

  const filtered = rows.filter((row) =>
    row.description
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Produtos</h1>
          <p>
            Cadastre as dimensões em metros e o peso unitário
            em quilogramas.
          </p>
        </div>
      </div>

      <form className="card formGrid" onSubmit={save}>
        <label className="fieldLabel fieldSpan2">
          Descrição
          <input
            value={form.description}
            onChange={(event) =>
              setForm({
                ...form,
                description: event.target.value
              })
            }
            required
          />
        </label>

        <label className="fieldLabel">
          Comprimento (m)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={form.lengthMeters}
            onChange={(event) =>
              setForm({
                ...form,
                lengthMeters: event.target.value
              })
            }
            required
          />
        </label>

        <label className="fieldLabel">
          Largura (m)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={form.widthMeters}
            onChange={(event) =>
              setForm({
                ...form,
                widthMeters: event.target.value
              })
            }
            required
          />
        </label>

        <label className="fieldLabel">
          Altura (m)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={form.heightMeters}
            onChange={(event) =>
              setForm({
                ...form,
                heightMeters: event.target.value
              })
            }
            required
          />
        </label>

        <label className="fieldLabel">
          Peso unitário (kg)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={form.weightKg}
            onChange={(event) =>
              setForm({
                ...form,
                weightKg: event.target.value
              })
            }
            required
          />
        </label>

        <label className="fieldLabel">
          Status
          <select
            value={String(form.active)}
            onChange={(event) =>
              setForm({
                ...form,
                active: event.target.value === 'true'
              })
            }
          >
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </label>

        <div className="formActions fieldSpan">
          <button type="submit">
            {editingId
              ? 'Salvar alterações'
              : 'Cadastrar produto'}
          </button>

          {editingId && (
            <button
              type="button"
              className="btn-secondary"
              onClick={clearForm}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="card tableCard">
        <input
          className="tableSearch"
          placeholder="Buscar pela descrição..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Dimensões (m)</th>
                <th>Peso unitário</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.description}</strong>
                  </td>

                  <td>
                    {row.lengthMeters} × {row.widthMeters} ×{' '}
                    {row.heightMeters}
                  </td>

                  <td>{row.weightKg} kg</td>

                  <td>
                    <span
                      className={`badge ${
                        row.active
                          ? 'badge-success'
                          : 'badge-error'
                      }`}
                    >
                      {row.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>

                  <td className="actionsCell">
                    <button
                      type="button"
                      onClick={() => edit(row)}
                    >
                      Editar
                    </button>

                    {row.active && (
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => deactivate(row.id)}
                      >
                        Desativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function UsersAdmin() {
  const loggedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const emptyForm = { name: '', email: '', initialPassword: '', role: 'OPERATOR', companyId: '', active: true };
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const [usersResponse, companiesResponse] = await Promise.all([api.get('/users'), api.get('/companies')]);
    setRows(usersResponse.data);
    setCompanies(companiesResponse.data);
  }
  useEffect(() => { load().catch((error) => alert(error.response?.data?.message || 'Erro ao carregar usuários.')); }, []);

  function clearForm() { setEditingId(null); setForm(emptyForm); }
  function edit(user) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, initialPassword: '', role: user.role, companyId: user.companyId || '', active: user.active });
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editingId) {
        const { initialPassword, ...payload } = form;
        await api.put(`/users/${editingId}`, payload);
      } else {
        await api.post('/users', form);
      }
      clearForm();
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao salvar usuário.');
    }
  }

  async function resetPassword(user) {
    const initialPassword = prompt(`Informe a nova senha inicial de ${user.name}:`);
    if (!initialPassword) return;
    try {
      await api.post(`/users/${user.id}/reset-password`, { initialPassword });
      alert('Senha redefinida. A alteração será exigida no próximo acesso.');
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao redefinir senha.');
    }
  }

  async function deactivate(id) {
    if (id === loggedUser.id) return alert('Você não pode desativar o próprio usuário.');
    if (!confirm('Desativar este usuário?')) return;
    await api.delete(`/users/${id}`);
    load();
  }

  return (
    <>
      <div className="pageHeader"><div><h1>Usuários</h1><p>O menu é definido automaticamente pelo perfil.</p></div></div>
      <form className="card formGrid" onSubmit={save}>
        <label className="fieldLabel">Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label className="fieldLabel">E-mail<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        {!editingId && <label className="fieldLabel">Senha inicial<input type="password" minLength="8" value={form.initialPassword} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} required /></label>}
        <label className="fieldLabel">Perfil<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="OPERATOR">Operador</option><option value="VIEWER">Consulta</option><option value="ADMIN">Administrador</option></select></label>
        <label className="fieldLabel">Empresa<select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}><option value="">Sem vínculo</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>)}</select></label>
        <label className="fieldLabel">Status<select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        <div className="formActions fieldSpan"><button type="submit">{editingId ? 'Salvar alterações' : 'Criar usuário'}</button>{editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar</button>}</div>
      </form>
      <div className="card tableCard"><div className="tableScroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Empresa</th><th>Status</th><th>Senha</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><span className="badge badge-alert">{roleLabel(user.role)}</span></td><td>{user.company?.nomeFantasia || user.company?.razaoSocial || '-'}</td><td><span className={`badge ${user.active ? 'badge-success' : 'badge-error'}`}>{user.active ? 'Ativo' : 'Inativo'}</span></td><td>{user.mustChangePassword ? 'Alteração pendente' : 'Definida'}</td><td className="actionsCell"><button type="button" onClick={() => edit(user)}>Editar</button><button type="button" className="btn-secondary" onClick={() => resetPassword(user)}>Redefinir senha</button><button type="button" className="btn-danger" onClick={() => deactivate(user.id)}>Desativar</button></td></tr>)}</tbody>
      </table></div></div>
    </>
  );
}

function ChangePassword({ user, onChanged }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [message, setMessage] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    if (form.newPassword !== form.confirmation) return setMessage('A confirmação não confere com a nova senha.');
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      const updatedUser = { ...user, mustChangePassword: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setMessage('Senha alterada com sucesso.');
      setForm({ currentPassword: '', newPassword: '', confirmation: '' });
      onChanged?.(updatedUser);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Não foi possível alterar a senha.');
    }
  }

  return (
    <>
      <div className="pageHeader"><div><h1>Alterar senha</h1><p>Use uma senha com pelo menos 8 caracteres.</p></div></div>
      <form className="card passwordCard" onSubmit={submit}>
        <label className="fieldLabel">Senha atual<input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /></label>
        <label className="fieldLabel">Nova senha<input type="password" minLength="8" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /></label>
        <label className="fieldLabel">Confirmar nova senha<input type="password" minLength="8" value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} required /></label>
        {message && <div className="formNotice">{message}</div>}
        <button type="submit">Alterar senha</button>
      </form>
    </>
  );
}


function ProposalModal({ quote, onClose, onSent }) {
  const [form, setForm] = useState({
    to: '',
    cc: '',
    subject: `Proposta de frete #${quote?.id || ''}`,
    message: 'Olá,\n\nSegue em anexo a proposta de frete solicitada.\n\nAtenciosamente,',
    pdf: true,
    excel: false
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.to.trim()) {
      setError('Informe ao menos um destinatário.');
      return;
    }
    if (!form.pdf && !form.excel) {
      setError('Selecione PDF, Excel ou ambos.');
      return;
    }

    setSending(true);
    try {
      const response = await api.post(`/quotes/${quote.id}/send-proposal`, {
        to: form.to,
        cc: form.cc,
        subject: form.subject,
        message: form.message,
        formats: [form.pdf ? 'pdf' : null, form.excel ? 'excel' : null].filter(Boolean)
      });
      alert(response.data?.message || 'Proposta enviada por e-mail.');
      onSent?.(response.data?.proposal);
      onClose();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
        requestError.response?.data?.message ||
        'Não foi possível enviar a proposta.'
      );
    } finally {
      setSending(false);
    }
  }

  if (!quote) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <form className="modalContent proposalModal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>Enviar proposta #{quote.id}</h2>
            <small>O envio utilizará o provedor de e-mail configurado no FreteHub.</small>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}><X size={16} /> Fechar</button>
        </div>

        <div className="proposalFormGrid">
          <label className="fieldLabel fieldSpan2">
            Destinatário(s)
            <input
              type="text"
              value={form.to}
              onChange={(event) => setForm({ ...form, to: event.target.value })}
              placeholder="cliente@empresa.com.br; outro@empresa.com.br"
              required
            />
            <small>Separe vários endereços por ponto e vírgula ou vírgula.</small>
          </label>

          <label className="fieldLabel fieldSpan2">
            Cópia (CC)
            <input
              type="text"
              value={form.cc}
              onChange={(event) => setForm({ ...form, cc: event.target.value })}
              placeholder="opcional@empresa.com.br"
            />
          </label>

          <label className="fieldLabel fieldSpan">
            Assunto
            <input
              type="text"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              required
            />
          </label>

          <label className="fieldLabel fieldSpan">
            Mensagem
            <textarea
              rows="7"
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
            />
          </label>

          <div className="proposalAttachmentOptions fieldSpan">
            <strong>Arquivos anexados</strong>
            <label className="checkboxLabel">
              <input
                type="checkbox"
                checked={form.pdf}
                onChange={(event) => setForm({ ...form, pdf: event.target.checked })}
              />
              <FileText size={17} /> PDF com logomarca
            </label>
            <label className="checkboxLabel">
              <input
                type="checkbox"
                checked={form.excel}
                onChange={(event) => setForm({ ...form, excel: event.target.checked })}
              />
              <FileSpreadsheet size={17} /> Excel padronizado
            </label>
          </div>
        </div>

        {error && <div className="formError">{error}</div>}

        <div className="formActions">
          <button type="submit" disabled={sending}>
            <Mail size={17} /> {sending ? 'Enviando...' : 'Enviar proposta'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

function Quote({ user }) {
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [products, setProducts] = useState([]);
  const [result, setResult] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [formError, setFormError] = useState('');
  const [proposalQuote, setProposalQuote] = useState(null);
  const [frequentRecipients, setFrequentRecipients] = useState([]);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const quoteRequestInProgress = useRef(false);

  const [form, setForm] = useState({
    companyId: '',
    carrierIds: [],
    cnpjDestinatario: '',
    cnpjTerceiro: '',
    razaoSocialTerceiro: '',
    razaoSocialDestinatario: '',
    cepDestino: '',
    enderecoDestino: '',
    cidadeDestino: '',
    ufDestino: '',
    valorMercadoria: '',
    pesoTotal: '',
    quantidadeVolumes: 0,
    tipoFrete: 'CIF',
    modal: 'Rodoviário',
    items: [
      {
        productId: '',
        productSearch: '',
        descricao: '',
        comprimento: '',
        largura: '',
        altura: '',
        peso: '',
        quantidade: 1
      }
    ]
  });

  const ufs = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
    'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
    'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  function onlyNumbers(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function validDocumentLength(value) {
    const document = onlyNumbers(value);
    return document.length === 11 || document.length === 14;
  }

  function sanitizeNumber(value) {
    const normalized = String(value ?? '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '');

    const [integerPart = '', ...decimalParts] = normalized.split('.');

    return decimalParts.length
      ? `${integerPart}.${decimalParts.join('')}`
      : integerPart;
  }

  function sanitizeInteger(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function parseNumberBR(value) {
    return Number(sanitizeNumber(value)) || 0;
  }

  function formatInputNumber(value, precision = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) return '';

    return String(Number(number.toFixed(precision)));
  }

function formatCurrencyBR(value) {
  const onlyDigits = String(value || '').replace(/\D/g, '');

  if (!onlyDigits) return '';

  const number = Number(onlyDigits) / 100;

  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseCurrencyBR(value) {
  return (
    Number(
      String(value || '')
        .replace(/\D/g, '')
    ) / 100
  ) || 0;
}

async function fetchCnpjData(cnpj) {
  try {
    const clean = onlyNumbers(cnpj);
    if (clean.length !== 14) return;
    const response = await api.get(`/companies/lookup/cnpj/${clean}`);
    const data = response.data || {};
    setForm((prev) => ({
      ...prev,
      razaoSocialDestinatario: data.razaoSocial || data.nomeFantasia || '',
      enderecoDestino: [data.endereco, data.numero].filter(Boolean).join(', '),
      cidadeDestino: data.cidade || '',
      ufDestino: data.uf || '',
      cepDestino: onlyNumbers(data.cep || '')
    }));
  } catch (error) {
    alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao consultar CNPJ.');
  }
}

async function fetchCorreiosCep(value = form.cepDestino) {
  const cep = onlyNumbers(value);
  if (cep.length !== 8) return alert('Informe um CEP com 8 dígitos.');
  if (!form.companyId) return alert('Selecione a empresa remetente antes de consultar o CEP.');

  setCepLookupLoading(true);
  try {
    const response = await api.get(`/correios/cep/${cep}`, {
      params: { companyId: form.companyId }
    });
    const data = response.data || {};
    setForm((current) => ({
      ...current,
      cepDestino: onlyNumbers(data.cep || cep),
      enderecoDestino: data.endereco || current.enderecoDestino,
      cidadeDestino: data.cidade || current.cidadeDestino,
      ufDestino: data.uf || current.ufDestino
    }));
  } catch (error) {
    alert(error.response?.data?.error || error.response?.data?.message || 'Não foi possível consultar o CEP nos Correios.');
  } finally {
    setCepLookupLoading(false);
  }
}

function applyFrequentRecipient(value) {
  const recipient = frequentRecipients.find((item) => item.cnpj === value);
  if (!recipient) return;
  setForm((current) => ({
    ...current,
    cnpjDestinatario: recipient.cnpj || '',
    razaoSocialDestinatario: recipient.razaoSocial || '',
    cepDestino: recipient.cep || '',
    enderecoDestino: recipient.endereco || '',
    cidadeDestino: recipient.cidade || '',
    ufDestino: recipient.uf || ''
  }));
}

  useEffect(() => {
    Promise.all([
      api.get('/companies'),
      api.get('/products?limit=500'),
      api.get('/quotes/recipients/frequent')
    ])
      .then(([companiesResponse, productsResponse, recipientsResponse]) => {
        setCompanies(companiesResponse.data || []);
        setProducts(productsResponse.data || []);
        setFrequentRecipients(recipientsResponse.data || []);

        if (companiesResponse.data.length === 1) {
          setForm((current) => ({
            ...current,
            companyId: String(companiesResponse.data[0].id)
          }));
        }
      })
      .catch((error) => {
        alert(error.response?.data?.message || 'Erro ao carregar dados da cotação.');
      });
  }, []);

  useEffect(() => {
    let active = true;
    const companyId = Number(form.companyId || 0);

    setForm((current) => ({ ...current, carrierIds: [] }));

    if (!companyId) {
      setCarriers([]);
      return () => { active = false; };
    }

    setLoadingCarriers(true);
    api.get('/carriers/available-for-quote', { params: { companyId } })
      .then((response) => {
        if (active) setCarriers(response.data || []);
      })
      .catch((error) => {
        if (active) {
          setCarriers([]);
          alert(error.response?.data?.message || 'Erro ao carregar transportadoras disponíveis.');
        }
      })
      .finally(() => {
        if (active) setLoadingCarriers(false);
      });

    return () => { active = false; };
  }, [form.companyId]);

  function upd(k, v) {
    setFormError('');
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function updateItem(idx, key, value) {
    const decimalFields = ['comprimento', 'largura', 'altura', 'peso'];

    setForm((prev) => {
      const items = [...prev.items];
      let nextValue = value;

      if (decimalFields.includes(key)) {
        nextValue = sanitizeNumber(value);
      }

      if (key === 'quantidade') {
        nextValue = sanitizeInteger(value);
      }

      items[idx] = {
        ...items[idx],
        [key]: nextValue
      };

      return {
        ...prev,
        items
      };
    });
  }

  function normalizeItemNumber(idx, key, precision = 2) {
    setForm((prev) => {
      const items = [...prev.items];
      const currentValue = items[idx]?.[key];

      if (currentValue === '' || currentValue === null || currentValue === undefined) {
        return prev;
      }

      const parsed = parseNumberBR(currentValue);

      items[idx] = {
        ...items[idx],
        [key]: key === 'quantidade'
          ? String(Math.trunc(parsed))
          : formatInputNumber(parsed, precision)
      };

      return {
        ...prev,
        items
      };
    });
  }

  function removeVolume(indexToRemove) {
    if (form.items.length <= 1) return;

    const items = form.items.filter((_, index) => index !== indexToRemove);
    upd('items', items);
  }

  function selectProduct(index, value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  const product = products.find(
    (candidate) =>
      candidate.description.trim().toLowerCase() === normalized
  );

  setForm((current) => {
    const items = [...current.items];

    items[index] = {
      ...items[index],
      productSearch: value,
      ...(product
        ? {
            productId: product.id,
            descricao: product.description,
            comprimento: formatInputNumber(
              Number(product.lengthMeters) * 100,
              2
            ),
            largura: formatInputNumber(
              Number(product.widthMeters) * 100,
              2
            ),
            altura: formatInputNumber(
              Number(product.heightMeters) * 100,
              2
            ),
            peso: formatInputNumber(product.weightKg, 3)
          }
        : {
            productId: ''
          })
    };

    return {
      ...current,
      items
    };
  });
}

  function calculateCubage(item) {
  const comprimentoCm = parseNumberBR(item.comprimento);
  const larguraCm = parseNumberBR(item.largura);
  const alturaCm = parseNumberBR(item.altura);
  const quantidade = parseNumberBR(item.quantidade);

  const comprimentoM = comprimentoCm / 100;
  const larguraM = larguraCm / 100;
  const alturaM = alturaCm / 100;

  return comprimentoM * larguraM * alturaM * quantidade;
}

  function validateVolumeItems() {
    for (let index = 0; index < form.items.length; index += 1) {
      const item = form.items[index];
      const itemNumber = index + 1;
      const comprimento = parseNumberBR(item.comprimento);
      const largura = parseNumberBR(item.largura);
      const altura = parseNumberBR(item.altura);
      const peso = parseNumberBR(item.peso);
      const quantidade = parseNumberBR(item.quantidade);

      if (!String(item.descricao || '').trim()) {
        return `Informe a descrição do volume ${itemNumber}.`;
      }

      if (comprimento <= 0 || largura <= 0 || altura <= 0) {
        return `Informe comprimento, largura e altura do volume ${itemNumber} em centímetros. Exemplo: 25 × 38 × 58.`;
      }

      if (peso <= 0) {
        return `Informe o peso unitário do volume ${itemNumber} em quilogramas.`;
      }

      if (!Number.isInteger(quantidade) || quantidade < 1) {
        return `A quantidade do volume ${itemNumber} deve ser um número inteiro maior ou igual a 1.`;
      }
    }

    return null;
  }

  function validateQuoteForm() {
    const errors = [];
    const selectedCompany = companies.find((company) => Number(company.id) === Number(form.companyId));

    if (!form.companyId) errors.push('Selecione a empresa remetente.');
    if (selectedCompany && onlyNumbers(selectedCompany.cnpj).length !== 14) {
      errors.push('O CNPJ da empresa remetente está incompleto. Corrija o cadastro da empresa.');
    }
    if (selectedCompany && onlyNumbers(selectedCompany.cep).length !== 8) {
      errors.push('O CEP da empresa remetente está incompleto. Corrija o cadastro da empresa.');
    }
    if (!form.carrierIds.length) errors.push('Selecione pelo menos uma transportadora.');
    if (!validDocumentLength(form.cnpjDestinatario)) errors.push('Informe o CPF ou CNPJ completo do destinatário.');
    if (!String(form.razaoSocialDestinatario || '').trim()) errors.push('Informe a razão social ou o nome do destinatário.');
    if (onlyNumbers(form.cepDestino).length !== 8) errors.push('Informe o CEP de destino com 8 dígitos.');
    if (!String(form.enderecoDestino || '').trim()) errors.push('Informe o endereço do destinatário.');
    if (!String(form.cidadeDestino || '').trim()) errors.push('Informe a cidade do destinatário.');
    if (!/^[A-Z]{2}$/.test(String(form.ufDestino || '').trim().toUpperCase())) errors.push('Informe a UF do destinatário.');
    if (parseCurrencyBR(form.valorMercadoria) <= 0) errors.push('Informe um valor de mercadoria maior que zero.');
    if (!String(form.modal || '').trim()) errors.push('Informe o modal da cotação.');

    if (form.tipoFrete === 'TERCEIROS') {
      if (!validDocumentLength(form.cnpjTerceiro)) errors.push('Informe o CPF ou CNPJ completo do terceiro pagador.');
      if (!String(form.razaoSocialTerceiro || '').trim()) errors.push('Informe o nome ou a razão social do terceiro pagador.');
    }

    const volumeError = validateVolumeItems();
    if (volumeError) errors.push(volumeError);
    return errors;
  }

  async function submit() {
  const validationErrors = validateQuoteForm();
  if (validationErrors.length) {
    setFormError(validationErrors.map((error) => `• ${error}`).join('\n'));
    return;
  }
  setFormError('');

  const selectedCompany = companies.find(
  (c) => Number(c.id) === Number(form.companyId)
);

const documentoRemetente = selectedCompany?.cnpj || '';
const documentoDestinatario = form.cnpjDestinatario;
const documentoPagador =
  form.tipoFrete === 'FOB'
    ? form.cnpjDestinatario
    : form.tipoFrete === 'TERCEIROS'
      ? form.cnpjTerceiro
      : selectedCompany?.cnpj || '';

  const items = form.items.map((item) => ({
    ...item,
    comprimento: parseNumberBR(item.comprimento) / 100,
    largura: parseNumberBR(item.largura) / 100,
    altura: parseNumberBR(item.altura) / 100,
    peso: parseNumberBR(item.peso),
    quantidade: parseNumberBR(item.quantidade),
    cubagem: calculateCubage(item)
  }));

  const quantidadeTotal = items.reduce(
    (total, item) => total + Number(item.quantidade || 0),
    0
  );

  const pesoTotal = items.reduce(
    (total, item) =>
      total + Number(item.peso || 0) * Number(item.quantidade || 0),
    0
  );

  const payload = {
    ...form,
    companyId: Number(form.companyId),
    carrierIds: form.carrierIds.map(Number),
    cnpjDestinatario: onlyNumbers(form.cnpjDestinatario),
    cepDestino: onlyNumbers(form.cepDestino),

    documentoPagador: onlyNumbers(documentoPagador),
    documentoRemetente: onlyNumbers(documentoRemetente),
    documentoDestinatario: onlyNumbers(documentoDestinatario),
    cnpjTerceiro: onlyNumbers(form.cnpjTerceiro),
    razaoSocialTerceiro: form.razaoSocialTerceiro,

    quantidadeVolumes: quantidadeTotal,
    valorMercadoria: parseCurrencyBR(form.valorMercadoria),
    pesoTotal: pesoTotal || parseNumberBR(form.pesoTotal),
    items
  };

  if (quoteRequestInProgress.current) {
  return;
    }

    quoteRequestInProgress.current = true;
    setLoadingQuote(true);
    setResult(null);

    try {
      const response = await api.post('/quotes/preview', payload);
      setResult(response.data);
    } catch (error) {
      alert(
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Erro ao gerar cotação.'
      );
    } finally {
      quoteRequestInProgress.current = false;
      setLoadingQuote(false);
    }
}

  async function saveQuote() {
    if (!result?.draftToken || result.saved) return;

    setSavingQuote(true);
    try {
      const response = await api.post('/quotes/save', {
        draftToken: result.draftToken
      });
      setResult(response.data);
      alert('Cotação salva no histórico.');
    } catch (error) {
      alert(
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Erro ao salvar cotação.'
      );
    } finally {
      setSavingQuote(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(
      (result?.results || [])
        .map(
          (r) =>
            `${r.carrier.nome}\t${money(r.valorFrete)}\t${r.prazo || '-'}\t${
              r.status === 'success' ? 'Cotado' : 'Erro'
            }`
        )
        .join('\n')
    );
  }

  async function exportExcel() {
    if (!result?.saved || !result?.id) {
      alert('Salve a cotação antes de exportar para Excel.');
      return;
    }
    try {
      await downloadQuoteDocument(result, 'excel');
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao exportar o Excel.');
    }
  }

  async function exportPdf() {
    if (!result?.saved || !result?.id) {
      alert('Salve a cotação antes de gerar o PDF.');
      return;
    }
    try {
      await downloadQuoteDocument(result, 'pdf');
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao gerar o PDF.');
    }
  }

  return (
    <>
      <h1>Cotação de Frete</h1>
      {formError && <div className="formError quoteValidationSummary">{formError}</div>}

      <div className="card formGrid">
        <label className="fieldLabel">Tipo de frete
          <select value={form.tipoFrete} onChange={(e) => upd('tipoFrete', e.target.value)}>
            <option value="CIF">CIF</option>
            <option value="FOB">FOB</option>
            <option value="TERCEIROS">Terceiros</option>
          </select>
        </label>

        <label className="fieldLabel">Empresa remetente
          <select value={form.companyId} onChange={(e) => upd('companyId', e.target.value)} required>
            <option value="">Selecione a empresa remetente</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.nomeFantasia || company.razaoSocial}
              </option>
            ))}
          </select>
        </label>

        <label className="fieldLabel">Modal
          <select value={form.modal} onChange={(e) => upd('modal', e.target.value)}>
            <option value="Rodoviário">Rodoviário</option>
            <option value="Aéreo">Aéreo</option>
            <option value="Expresso">Expresso</option>
            <option value="Econômico">Econômico</option>
          </select>
        </label>

        {form.tipoFrete === 'TERCEIROS' && (
          <>
            <label className="fieldLabel">CNPJ do terceiro pagador
              <input
                value={form.cnpjTerceiro}
                onChange={(e) => upd('cnpjTerceiro', onlyNumbers(e.target.value))}
                maxLength="14"
                required
              />
            </label>
            <label className="fieldLabel fieldSpan2">Razão social do terceiro
              <input
                value={form.razaoSocialTerceiro}
                onChange={(e) => upd('razaoSocialTerceiro', e.target.value)}
                required
              />
            </label>
          </>
        )}

        <label className="fieldLabel fieldSpan">Destinatários frequentes
          <select defaultValue="" onChange={(event) => applyFrequentRecipient(event.target.value)}>
            <option value="">Selecione para preencher os dados automaticamente</option>
            {frequentRecipients.map((recipient) => (
              <option key={recipient.cnpj} value={recipient.cnpj}>
                {recipient.razaoSocial || recipient.cnpj} · {recipient.cidade || '-'} / {recipient.uf || '-'}
              </option>
            ))}
          </select>
        </label>

        <label className="fieldLabel">CNPJ/CPF do destinatário
          <input
            value={form.cnpjDestinatario}
            onChange={(e) => {
              const value = onlyNumbers(e.target.value);
              upd('cnpjDestinatario', value);
              if (value.length === 14) fetchCnpjData(value);
            }}
            required
          />
        </label>

        <label className="fieldLabel fieldSpan2">Razão social / nome do destinatário
          <input
            value={form.razaoSocialDestinatario}
            onChange={(e) => upd('razaoSocialDestinatario', e.target.value)}
            required
          />
        </label>

        <label className="fieldLabel">CEP
          <div className="inlineFieldAction">
            <input
              value={form.cepDestino}
              onChange={(e) => upd('cepDestino', onlyNumbers(e.target.value))}
              onBlur={() => {
                if (onlyNumbers(form.cepDestino).length === 8 && !form.enderecoDestino) fetchCorreiosCep();
              }}
              maxLength="8"
              required
            />
            <button type="button" className="btn-secondary" disabled={cepLookupLoading} onClick={() => fetchCorreiosCep()}>
              {cepLookupLoading ? 'Consultando...' : 'Buscar CEP'}
            </button>
          </div>
        </label>

        <label className="fieldLabel fieldSpan2">Endereço
          <input value={form.enderecoDestino} onChange={(e) => upd('enderecoDestino', e.target.value)} required />
        </label>

        <label className="fieldLabel">Cidade
          <input value={form.cidadeDestino} onChange={(e) => upd('cidadeDestino', e.target.value)} required />
        </label>

        <label className="fieldLabel">UF
          <select value={form.ufDestino} onChange={(e) => upd('ufDestino', e.target.value)} required>
            <option value="">Selecione</option>
            {ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </label>

        <label className="fieldLabel">Valor da mercadoria
          <input
            value={form.valorMercadoria}
            onChange={(e) => upd('valorMercadoria', formatCurrencyBR(e.target.value))}
            placeholder="R$ 0,00"
            required
          />
        </label>

        <div className="fieldSpan">
          <strong>Transportadoras</strong>
          <div className="checks carrierChecks">
            {carriers.map((carrier) => (
              <label key={carrier.id}>
                <input
                  type="checkbox"
                  checked={form.carrierIds.includes(carrier.id)}
                  onChange={(e) =>
                    upd(
                      'carrierIds',
                      e.target.checked
                        ? [...form.carrierIds, carrier.id]
                        : form.carrierIds.filter((id) => id !== carrier.id)
                    )
                  }
                />
                {carrier.nome}
              </label>
            ))}
            {loadingCarriers && <span className="formNotice">Verificando credenciais...</span>}
            {!loadingCarriers && form.companyId && !carriers.length && (
              <span className="formError">
                Nenhuma transportadora ativa e com credencial válida está disponível para esta empresa.
              </span>
            )}
            {!form.companyId && (
              <span className="formNotice">Selecione a empresa para carregar as transportadoras disponíveis.</span>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Volumes</h3>
        <p className="volumeInstructions">
          Informe as dimensões externas em centímetros, o peso unitário em quilogramas e a quantidade de volumes.
          Exemplo: comprimento 25 cm, largura 38 cm, altura 58 cm, peso 6 kg e quantidade 4.
        </p>

        {form.items.map((i, idx) => (
          <div className="formGrid volumeBox" key={idx}>
            <label className="fieldLabel fieldSpan">Pesquisar produto cadastrado
              <input
                list={`product-options-${idx}`}
                value={i.productSearch || ''}
                placeholder="Digite a descrição do produto"
                onChange={(e) => selectProduct(idx, e.target.value)}
              />
              <datalist id={`product-options-${idx}`}>
                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.description}
                  />
                ))}
              </datalist>
            </label>

            <label className="fieldLabel">
              Produto/descrição
              <input
                value={i.descricao}
                placeholder="Ex.: Impressora Epson L3250"
                required
                onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
              />
            </label>

            <label className="fieldLabel">
              Comprimento (cm)
              <input
                value={i.comprimento}
                placeholder="Ex.: 25"
                required
                inputMode="decimal"
                onChange={(e) => updateItem(idx, 'comprimento', e.target.value)}
                onBlur={() => normalizeItemNumber(idx, 'comprimento', 2)}
              />
            </label>

            <label className="fieldLabel">
              Largura (cm)
              <input
                value={i.largura}
                placeholder="Ex.: 38"
                required
                inputMode="decimal"
                onChange={(e) => updateItem(idx, 'largura', e.target.value)}
                onBlur={() => normalizeItemNumber(idx, 'largura', 2)}
              />
            </label>

            <label className="fieldLabel">
              Altura (cm)
              <input
                value={i.altura}
                placeholder="Ex.: 58"
                required
                inputMode="decimal"
                onChange={(e) => updateItem(idx, 'altura', e.target.value)}
                onBlur={() => normalizeItemNumber(idx, 'altura', 2)}
              />
            </label>

            <label className="fieldLabel">
              Peso unitário (kg)
              <input
                value={i.peso}
                placeholder="Ex.: 6"
                required
                inputMode="decimal"
                onChange={(e) => updateItem(idx, 'peso', e.target.value)}
                onBlur={() => normalizeItemNumber(idx, 'peso', 3)}
              />
            </label>

            <label className="fieldLabel">
              Quantidade de volumes
              <input
                value={i.quantidade}
                placeholder="Ex.: 4"
                required
                inputMode="numeric"
                onChange={(e) => updateItem(idx, 'quantidade', e.target.value)}
                onBlur={() => normalizeItemNumber(idx, 'quantidade', 0)}
              />
            </label>

            <div className="volumeCubage fieldSpan">
              <span>Cubagem deste item</span>
              <b>{calculateCubage(i).toFixed(4)} m³</b>
            </div>

            {form.items.length > 1 && (
              <div className="fieldSpan">
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => removeVolume(idx)}
                >
                  Excluir volume
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="result-summary">
          <div className="summary-card">Volumes totais<b>{form.items.reduce((total, item) => total + parseNumberBR(item.quantidade), 0)}</b></div>
          <div className="summary-card">Peso total<b>{form.items.reduce((total, item) => total + parseNumberBR(item.peso) * parseNumberBR(item.quantidade), 0).toFixed(3)} kg</b></div>
          <div className="summary-card">Cubagem total<b>{form.items.reduce((total, item) => total + calculateCubage(item), 0).toFixed(4)} m³</b></div>
        </div>

        <button
          type="button"
          onClick={() =>
            upd('items', [
              ...form.items,
              {
                productId: '',
                productSearch: '',
                descricao: '',
                comprimento: '',
                largura: '',
                altura: '',
                peso: '',
                quantidade: 1
              }
            ])
          }
        >
          Adicionar volume
        </button>

        <button
          type="button"
          onClick={submit}
          disabled={loadingQuote}
        >
          {loadingQuote ? 'Cotando...' : 'Gerar cotação'}
        </button>
      </div>

      {result &&
        (() => {
          const successfulResults = result.results.filter(
            (r) => r.status === 'success' && r.valorFrete
          );

          const minPrice = successfulResults.length
            ? Math.min(...successfulResults.map((r) => Number(r.valorFrete)))
            : null;

          const minDeadline = successfulResults.length
            ? Math.min(
                ...successfulResults.map((r) =>
                  Number(String(r.prazo || '').replace(/\D/g, '') || 9999)
                )
              )
            : null;

          return (
            <div className="card">
              <div className="resultHeader">
                <h3>Resultado</h3>
                <span className={`badge ${result.saved ? 'badge-success' : 'badge-alert'}`}>
                  {result.saved ? 'Salva no histórico' : 'Prévia não salva'}
                </span>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Transportadora</th>
                    <th>Valor</th>
                    <th>Prazo</th>
                    <th>Modalidade</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>

                <tbody>
                  {result.results.map((r) => {
                    const isBestPrice =
                      minPrice !== null &&
                      Number(r.valorFrete) === minPrice;

                    const prazoNumero = Number(
                      String(r.prazo || '').replace(/\D/g, '') || 9999
                    );

                    const isBestDeadline =
                      minDeadline !== null &&
                      prazoNumero === minDeadline;

                    let rowClass = '';

                    if (isBestPrice && isBestDeadline) {
                      rowClass = 'best-both';
                    } else if (isBestPrice) {
                      rowClass = 'best-price';
                    } else if (isBestDeadline) {
                      rowClass = 'best-deadline';
                    }

                    return (
                      <tr key={r.id || r.carrier?.id} className={rowClass}>
                        <td>
                              <div className="carrier-name-cell">
                                <strong>{r.carrier.nome}</strong>

                                <span className="result-tag-group">
                                  {isBestPrice && (
                                    <span className="tag tag-price">
                                      Menor preço
                                    </span>
                                  )}

                                  {isBestDeadline && (
                                    <span className="tag tag-deadline">
                                      Menor prazo
                                    </span>
                                  )}
                                </span>
                              </div>
                        </td>

                        <td>{money(r.valorFrete)}</td>
                        <td>{r.prazo || '-'}</td>
                        <td>{r.modalidade || '-'}</td>

                        <td>
                          <span
                            className={
                              r.status === 'success'
                                ? 'badge badge-success'
                                : 'badge badge-error'
                            }
                          >
                            {r.status === 'success' ? 'Cotado' : 'Erro'}
                          </span>
                        </td>

                        <td>{r.mensagem || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="result-actions">
                {!result.saved && (
                  <button onClick={saveQuote} disabled={savingQuote}>
                    {savingQuote ? 'Salvando...' : 'Salvar cotação'}
                  </button>
                )}

                <button onClick={copy}>
                  <Copy size={16} />
                  Copiar
                </button>

                {result.saved && (
                  <>
                    <button onClick={exportExcel}>
                      <FileSpreadsheet size={16} />
                      Exportar Excel
                    </button>
                    <button onClick={exportPdf}>
                      <FileText size={16} />
                      Exportar PDF
                    </button>
                    {can(user, 'QUOTE_SEND') && (
                      <button onClick={() => setProposalQuote(result)}>
                        <Mail size={16} />
                        Enviar proposta
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      {proposalQuote && (
        <ProposalModal
          quote={proposalQuote}
          onClose={() => setProposalQuote(null)}
        />
      )}
    </>
  );
}

function TrackingPage({ user }) {
  const isAdmin = user?.role === 'ADMIN';
  const canCreateTracking = can(user, 'TRACKING_CREATE');
  const canCheckTracking = can(user, 'TRACKING_CHECK');
  const canCreateProof = can(user, 'TRACKING_PROOF_CREATE');
  const canDeleteProof = can(user, 'TRACKING_PROOF_DELETE');
  const [selectedTracking, setSelectedTracking] = useState(null);
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loadingTrackingCarriers, setLoadingTrackingCarriers] = useState(false);
  const [showAdminConfig, setShowAdminConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState(user?.email || '');
  const [adminConfig, setAdminConfig] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ companies: [], carriers: [], users: [], statuses: [] });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const paginationRef = useRef(pagination);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofForm, setProofForm] = useState({ file: null, externalUrl: '', description: '' });
  const [configForm, setConfigForm] = useState({
    jamefTrackingUrl: '',
    braspressTrackingUrl: '',
    camiloTrackingUrl: 'https://ssw.inf.br/2/ssw_resultSSW',
    emailNotificationsEnabled: true,
    emailProvider: 'smtp',
    emailFrom: '',
    appUrl: '',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    smtpSecure: false,
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',
    smtpReplyTo: '',
    clearSmtpPassword: false,
    emailWebhookUrl: '',
    emailWebhookToken: '',
    resendApiKey: '',
    clearEmailWebhookToken: false,
    clearResendApiKey: false
  });

  const initialForm = {
    companyId: user?.companyId ? String(user.companyId) : '',
    carrierId: '',
    documento: '',
    notaFiscal: '',
    pedido: '',
    conhecimento: '',
    destinatarioNome: '',
    status: '',
    monitoringActive: true,
    checkIntervalMinutes: '60'
  };

  const [form, setForm] = useState(initialForm);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    companyId: '',
    carrierId: '',
    userId: '',
    documento: '',
    notaFiscal: '',
    pedido: '',
    conhecimento: '',
    destinatario: '',
    status: '',
    createdFrom: '',
    createdTo: '',
    predictionFrom: '',
    predictionTo: '',
    deliveryFrom: '',
    deliveryTo: '',
    delayed: false,
    divergence: false,
    hasError: false,
    proof: '',
    sortBy: 'updatedAt',
    sortDir: 'desc'
  });
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (['sortBy', 'sortDir'].includes(key)) return false;
    return value !== '' && value !== false && value !== null && value !== undefined;
  }).length;

  async function loadTrackings(params = filtersRef.current, silent = false, requestedPage = paginationRef.current.page || 1) {
    if (!silent) setLoading(true);
    try {
      const queryParams = Object.fromEntries(
        Object.entries({
          ...params,
          paged: true,
          page: requestedPage,
          pageSize: paginationRef.current.pageSize || 25
        }).filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined)
      );
      const response = await api.get('/tracking', { params: queryParams });
      const payload = response.data || {};
      const loadedRows = Array.isArray(payload) ? payload : payload.items || [];
      setRows(loadedRows);
      if (!Array.isArray(payload) && payload.pagination) setPagination(payload.pagination);
      const focusId = Number(sessionStorage.getItem('fretehubTrackingFocusId') || 0);
      if (focusId) {
        sessionStorage.removeItem('fretehubTrackingFocusId');
        const focused = loadedRows.find((row) => Number(row.id) === focusId);
        if (focused) openTimeline(focused);
        else openTimeline({ id: focusId });
      }
    } catch (error) {
      if (!silent) alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao consultar tracking.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadFilterOptions(silent = false) {
    try {
      const response = await api.get('/tracking/filter-options');
      setFilterOptions(response.data || { companies: [], carriers: [], users: [], statuses: [] });
    } catch (error) {
      if (!silent) alert(error.response?.data?.message || 'Erro ao carregar filtros do tracking.');
    }
  }

  async function loadAdminConfig(silent = false) {
    if (!isAdmin) return;
    try {
      const response = await api.get('/tracking/admin/config');
      const data = response.data || {};
      setAdminConfig(data);
      setConfigForm((current) => ({
        ...current,
        jamefTrackingUrl: data.jamefTrackingUrl || '',
        braspressTrackingUrl: data.braspressTrackingUrl || '',
        camiloTrackingUrl: data.camiloTrackingUrl || 'https://ssw.inf.br/2/ssw_resultSSW',
        emailNotificationsEnabled: data.emailNotificationsEnabled !== false,
        emailProvider: data.emailProvider || 'none',
        emailFrom: data.emailFrom || '',
        appUrl: data.appUrl || '',
        smtpHost: data.smtpHost || 'smtp.gmail.com',
        smtpPort: String(data.smtpPort || 587),
        smtpSecure: Boolean(data.smtpSecure),
        smtpUser: data.smtpUser || '',
        smtpPassword: '',
        smtpFrom: data.smtpFrom || '',
        smtpReplyTo: data.smtpReplyTo || '',
        clearSmtpPassword: false,
        emailWebhookUrl: data.emailWebhookUrl || '',
        emailWebhookToken: '',
        resendApiKey: '',
        clearEmailWebhookToken: false,
        clearResendApiKey: false
      }));
    } catch (error) {
      if (!silent) {
        alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao carregar configurações do tracking.');
      }
    }
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const companiesResponse = await api.get('/companies');
        if (!active) return;

        const companyRows = (companiesResponse.data || []).filter(
          (company) => company.ativo !== false
        );
        setCompanies(companyRows);
        setForm((current) => ({
          ...current,
          companyId:
            current.companyId ||
            (companyRows.length === 1 ? String(companyRows[0].id) : '')
        }));
      } catch (error) {
        alert(error.response?.data?.message || 'Erro ao preparar o tracking automático.');
      }
    }

    initialize();
    loadTrackings({}, true, 1);
    loadFilterOptions(true);
    loadAdminConfig(true);

    const timer = setInterval(
      () => loadTrackings(filtersRef.current, true, paginationRef.current.page || 1),
      30000
    );

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handleOpenTracking(event) {
      const trackingId = Number(event.detail?.trackingId || 0);
      if (trackingId) openTimeline({ id: trackingId });
    }

    window.addEventListener('fretehub:open-tracking', handleOpenTracking);
    return () => window.removeEventListener('fretehub:open-tracking', handleOpenTracking);
  }, []);

  useEffect(() => {
    let active = true;
    const companyId = Number(form.companyId || 0);

    if (!canCreateTracking) {
      setCarriers([]);
      return () => { active = false; };
    }

    if (!companyId) {
      setCarriers([]);
      return () => { active = false; };
    }

    setLoadingTrackingCarriers(true);
    api.get('/tracking/available-carriers', { params: { companyId } })
      .then((response) => {
        if (!active) return;
        const available = (response.data || []).filter(
          (carrier) => carrier.automaticTracking
        );
        setCarriers(available);
        setForm((current) => {
          const carrierStillAvailable = available.some(
            (carrier) => String(carrier.id) === String(current.carrierId)
          );
          return carrierStillAvailable ? current : { ...current, carrierId: '' };
        });
      })
      .catch((error) => {
        if (active) {
          setCarriers([]);
          alert(error.response?.data?.message || 'Erro ao carregar transportadoras do tracking.');
        }
      })
      .finally(() => {
        if (active) setLoadingTrackingCarriers(false);
      });

    return () => { active = false; };
  }, [form.companyId, adminConfig?.jamefTrackingConfigured, adminConfig?.braspressTrackingConfigured, adminConfig?.camiloTrackingConfigured]);

  async function searchTracking(event) {
    event.preventDefault();
    await loadTrackings(filters, false, 1);
  }

  function resetForm() {
    setEditingId(null);
    setForm((current) => ({
      ...initialForm,
      companyId:
        user?.companyId
          ? String(user.companyId)
          : current.companyId || (companies.length === 1 ? String(companies[0].id) : '')
    }));
  }

  async function saveTracking(event) {
    event.preventDefault();

    if (!canCreateTracking) return alert('Seu perfil possui acesso somente para consulta.');

    if (!form.companyId) return alert('Selecione a empresa do tracking.');
    if (!form.carrierId) return alert('Selecione uma transportadora com tracking automático.');

    const selectedCarrier = carriers.find(
      (carrier) => String(carrier.id) === String(form.carrierId)
    );
    const normalizedCarrierName = String(selectedCarrier?.nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const isBraspress = normalizedCarrierName.includes('braspress');
    const isCamilo = normalizedCarrierName.includes('camilo');

    if (isBraspress) {
      const cnpjTomador = String(form.documento || '').replace(/\D/g, '');

      if (cnpjTomador.length !== 14) {
        return alert('Para a Braspress, informe o CNPJ do tomador do frete com 14 dígitos.');
      }

      if (!form.notaFiscal && !form.pedido) {
        return alert('Para a Braspress, informe a Nota Fiscal ou o número do Pedido.');
      }
    } else if (isCamilo) {
      const cnpjRemetenteOuPagador = String(form.documento || '').replace(/\D/g, '');

      if (cnpjRemetenteOuPagador.length !== 14) {
        return alert('Para a Camilo, informe o CNPJ do remetente ou pagador com 14 dígitos.');
      }

      if (!form.notaFiscal && !form.pedido) {
        return alert('Para a Camilo, informe a Nota Fiscal ou o número do Pedido.');
      }
    } else if (!form.notaFiscal && !form.pedido && !form.conhecimento) {
      return alert('Informe pelo menos Nota Fiscal, Pedido ou Conhecimento/CT-e.');
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        companyId: Number(form.companyId),
        carrierId: Number(form.carrierId),
        checkIntervalMinutes: 60,
        monitoringActive: Boolean(form.monitoringActive),
        clearLastCheckError: Boolean(editingId)
      };

      if (editingId) {
        await api.put(`/tracking/${editingId}`, payload);
        alert('Tracking atualizado. A próxima verificação automática ficou programada para 1 hora.');
      } else {
        await api.post('/tracking', payload);
        alert('Tracking incluído manualmente. A primeira consulta automática ocorrerá em 1 hora; use “Monitorar agora” para consultar imediatamente.');
      }

      resetForm();
      await loadTrackings(filtersRef.current, true, 1);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao salvar tracking.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      companyId: String(row.companyId || ''),
      carrierId: String(row.carrierId || ''),
      documento: row.documento || '',
      notaFiscal: row.notaFiscal || '',
      pedido: row.pedido || '',
      conhecimento: row.conhecimento || '',
      destinatarioNome: row.destinatarioNome || '',
      status: row.status === '-' ? '' : row.status || '',
      monitoringActive: Boolean(row.monitoringActive),
      checkIntervalMinutes: '60'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function forceMonitoring(row) {
    setCheckingId(row.id);
    try {
      const response = await api.post(`/tracking/${row.id}/check`);
      alert(`Monitoramento executado. Status atual: ${response.data?.status || 'consultado'}.`);
      await loadTrackings(filtersRef.current, true, paginationRef.current.page || 1);
      if (selectedTracking?.id === row.id) setSelectedTracking(response.data);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao forçar o monitoramento.');
      await loadTrackings(filtersRef.current, true, paginationRef.current.page || 1);
    } finally {
      setCheckingId(null);
    }
  }

  async function removeTracking(row) {
    if (!window.confirm(`Excluir definitivamente o tracking #${row.id}? A timeline também será removida.`)) return;

    setDeletingId(row.id);
    try {
      await api.delete(`/tracking/${row.id}`);
      alert('Tracking excluído.');
      if (selectedTracking?.id === row.id) setSelectedTracking(null);
      if (editingId === row.id) resetForm();
      await loadTrackings(filtersRef.current, true, paginationRef.current.page || 1);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao excluir tracking.');
    } finally {
      setDeletingId(null);
    }
  }

  async function saveAdminConfig(event) {
    event.preventDefault();
    setSavingConfig(true);
    try {
      const response = await api.put('/tracking/admin/config', configForm);
      setAdminConfig(response.data);
      setConfigForm((current) => ({
        ...current,
        smtpPassword: '',
        emailWebhookToken: '',
        resendApiKey: '',
        clearSmtpPassword: false,
        clearEmailWebhookToken: false,
        clearResendApiKey: false
      }));
      alert('Configurações do tracking salvas. Não é necessário reiniciar a API.');
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  }

  async function testEmailConfiguration() {
    if (!emailTestTo.trim()) return alert('Informe o e-mail que receberá o teste.');
    setTestingEmail(true);
    try {
      const response = await api.post('/tracking/admin/email-test', { to: emailTestTo.trim() });
      alert(`E-mail de teste enviado por ${response.data?.provider || 'provedor configurado'} para ${emailTestTo.trim()}.`);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Falha no envio do e-mail de teste.');
    } finally {
      setTestingEmail(false);
    }
  }

  async function openTimeline(row) {
    try {
      const response = await api.get(`/tracking/${row.id}`);
      setSelectedTracking(response.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao abrir a timeline.');
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadDeliveryProof(event) {
    event.preventDefault();
    if (!selectedTracking?.id) return;
    if (!proofForm.file && !proofForm.externalUrl.trim()) {
      return alert('Selecione um arquivo ou informe o link do comprovante.');
    }
    if (proofForm.file && proofForm.file.size > 8 * 1024 * 1024) {
      return alert('O comprovante deve ter no máximo 8 MB.');
    }

    setUploadingProof(true);
    try {
      const payload = {
        externalUrl: proofForm.externalUrl.trim() || null,
        description: proofForm.description.trim() || null
      };
      if (proofForm.file) {
        payload.fileName = proofForm.file.name;
        payload.mimeType = proofForm.file.type;
        payload.dataBase64 = await fileToDataUrl(proofForm.file);
      }
      await api.post(`/tracking/${selectedTracking.id}/proofs`, payload);
      setProofForm({ file: null, externalUrl: '', description: '' });
      await openTimeline(selectedTracking);
      await loadTrackings(filtersRef.current, true, paginationRef.current.page || 1);
      alert('Comprovante anexado com sucesso.');
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao anexar comprovante.');
    } finally {
      setUploadingProof(false);
    }
  }

  async function downloadDeliveryProof(proof) {
    if (proof.externalUrl && !proof.hasFile) {
      window.open(proof.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const response = await api.get(proof.downloadUrl, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = proof.fileName || `comprovante-${proof.id}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao baixar comprovante.');
    }
  }

  async function removeDeliveryProof(proof) {
    if (!window.confirm('Excluir este comprovante manual?')) return;
    try {
      await api.delete(`/tracking/${selectedTracking.id}/proofs/${proof.id}`);
      await openTimeline(selectedTracking);
      await loadTrackings(filtersRef.current, true, paginationRef.current.page || 1);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao excluir comprovante.');
    }
  }

  function statusClass(row) {
    if (row.dataEntrega || String(row.status).toUpperCase().includes('ENTREG')) return 'badge-success';
    if (row.lastCheckError || row.hasDivergence) return 'badge-error';
    return 'badge-alert';
  }

  const selectedTrackingCarrier = carriers.find(
    (carrier) => String(carrier.id) === String(form.carrierId)
  );
  const selectedTrackingCarrierName = String(selectedTrackingCarrier?.nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const trackingDocumentLabel = selectedTrackingCarrierName.includes('camilo')
    ? 'CNPJ do remetente ou pagador'
    : 'CNPJ do tomador';

  return (
    <div className="trackingPage">
      <div className="pageHeader">
        <div>
          <h1>Tracking de cargas</h1>
          <p>{canCreateTracking ? 'Inclua a carga manualmente. O sistema consulta as transportadoras a cada 1 hora e registra as mudanças na timeline.' : 'Consulte as cargas e acompanhe as ocorrências registradas na timeline.'}</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn-secondary" onClick={() => setShowAdminConfig((current) => !current)}>
            <Settings size={16} />
            {showAdminConfig ? 'Fechar configurações' : 'Configurar tracking'}
          </button>
        )}
      </div>

      {canCreateTracking && (
        <div className="formNotice">
          Após salvar, a primeira consulta automática fica agendada para 1 hora. Para consultar sem esperar, use o botão <strong>Monitorar agora</strong> na carga desejada.
        </div>
      )}

      {isAdmin && showAdminConfig && (
        <form className="card formGrid trackingAdminConfig" onSubmit={saveAdminConfig}>
          <div className="fieldSpan configTitleRow">
            <div>
              <h3>Configurações administrativas</h3>
              <p>As URLs ficam no banco e passam a valer imediatamente. Tokens e chaves são armazenados criptografados.</p>
            </div>
            <div className="configStatusList">
              <span className={`badge ${adminConfig?.jamefTrackingConfigured ? 'badge-success' : 'badge-error'}`}>
                Jamef {adminConfig?.jamefTrackingConfigured ? 'configurada' : 'não configurada'}
              </span>
              <span className={`badge ${adminConfig?.braspressTrackingConfigured ? 'badge-success' : 'badge-error'}`}>
                Braspress {adminConfig?.braspressTrackingConfigured ? 'configurada' : 'não configurada'}
              </span>
              <span className={`badge ${adminConfig?.camiloTrackingConfigured ? 'badge-success' : 'badge-error'}`}>
                Camilo {adminConfig?.camiloTrackingConfigured ? 'configurada' : 'não configurada'}
              </span>
              <span className={`badge ${adminConfig?.emailProvider && adminConfig?.emailProvider !== 'none' ? 'badge-success' : 'badge-alert'}`}>
                E-mail: {adminConfig?.emailProvider === 'smtp' ? 'Gmail/SMTP' : adminConfig?.emailProvider || 'não configurado'}
              </span>
            </div>
          </div>

          <label className="fieldLabel fieldSpan">
            URL de tracking da Jamef
            <input
              type="url"
              placeholder="https://api.jamef.com.br/consulta/v1"
              value={configForm.jamefTrackingUrl}
              onChange={(event) => setConfigForm({ ...configForm, jamefTrackingUrl: event.target.value })}
            />
            <small>Produção: https://api.jamef.com.br/consulta/v1. Homologação: https://api-qa.jamef.com.br/consulta/v1. O sistema acrescenta /rastreamento automaticamente.</small>
          </label>

          <label className="fieldLabel fieldSpan">
            URL de tracking da Braspress
            <input
              type="url"
              placeholder="https://api.braspress.com"
              value={configForm.braspressTrackingUrl}
              onChange={(event) => setConfigForm({ ...configForm, braspressTrackingUrl: event.target.value })}
            />
            <small>
              Produção: https://api.braspress.com. O sistema usa automaticamente a API v3 e acrescenta
              /byNf/CNPJ/NF/json ou /byNumPedido/CNPJ/PEDIDO/json.
            </small>
          </label>

          <label className="fieldLabel fieldSpan">
            URL de tracking da Camilo / SSW
            <input
              type="url"
              placeholder="https://ssw.inf.br/2/ssw_resultSSW"
              value={configForm.camiloTrackingUrl}
              onChange={(event) => setConfigForm({ ...configForm, camiloTrackingUrl: event.target.value })}
            />
            <small>
              O sistema consulta o portal SSW por CNPJ e Nota Fiscal/Pedido e usa a senha do pagador cadastrada em Credenciais.
            </small>
          </label>

          <label className="fieldLabel">
            URL da plataforma
            <input
              type="url"
              placeholder="https://fretehub.seudominio.com.br"
              value={configForm.appUrl}
              onChange={(event) => setConfigForm({ ...configForm, appUrl: event.target.value })}
            />
          </label>

          <label className="fieldLabel">
            Provedor de e-mail
            <select
              value={configForm.emailProvider}
              onChange={(event) => setConfigForm({ ...configForm, emailProvider: event.target.value })}
            >
              <option value="none">Não enviar e-mails</option>
              <option value="smtp">Gmail / SMTP</option>
              <option value="webhook">Webhook</option>
              <option value="resend">Resend</option>
            </select>
          </label>

          <label className="fieldLabel fieldSpan checkboxLabel">
            <input
              type="checkbox"
              checked={configForm.emailNotificationsEnabled}
              onChange={(event) => setConfigForm({ ...configForm, emailNotificationsEnabled: event.target.checked })}
            />
            Enviar e-mails de entrega, atraso, divergência e falha de consulta
          </label>

          {configForm.emailProvider === 'smtp' && (
            <>
              <div className="fieldSpan formNotice smtpNotice">
                Para Gmail, use <strong>smtp.gmail.com</strong>, porta <strong>587</strong>, STARTTLS e uma <strong>senha de aplicativo</strong>. A senha normal da conta não deve ser usada.
              </div>

              <label className="fieldLabel">
                Servidor SMTP
                <input
                  placeholder="smtp.gmail.com"
                  value={configForm.smtpHost}
                  onChange={(event) => setConfigForm({ ...configForm, smtpHost: event.target.value })}
                />
              </label>

              <label className="fieldLabel">
                Porta SMTP
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={configForm.smtpPort}
                  onChange={(event) => setConfigForm({ ...configForm, smtpPort: event.target.value })}
                />
              </label>

              <label className="fieldLabel checkboxLabel smtpSecureField">
                <input
                  type="checkbox"
                  checked={configForm.smtpSecure}
                  onChange={(event) => setConfigForm({ ...configForm, smtpSecure: event.target.checked })}
                />
                SSL direto (normalmente porta 465)
              </label>

              <label className="fieldLabel">
                Usuário SMTP
                <input
                  type="email"
                  placeholder="trackingcargas26@gmail.com"
                  value={configForm.smtpUser}
                  onChange={(event) => setConfigForm({ ...configForm, smtpUser: event.target.value })}
                />
              </label>

              <label className="fieldLabel">
                Senha de aplicativo
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={adminConfig?.smtpPasswordConfigured ? 'Senha já configurada — digite somente para substituir' : 'Senha de aplicativo do Gmail'}
                  value={configForm.smtpPassword}
                  onChange={(event) => setConfigForm({ ...configForm, smtpPassword: event.target.value })}
                />
                <small>{adminConfig?.smtpPasswordConfigured ? 'Uma senha SMTP está armazenada de forma criptografada.' : 'A senha será criptografada antes de ser salva.'}</small>
              </label>

              <label className="fieldLabel">
                Remetente
                <input
                  placeholder="FreteHub <trackingcargas26@gmail.com>"
                  value={configForm.smtpFrom}
                  onChange={(event) => setConfigForm({ ...configForm, smtpFrom: event.target.value })}
                />
              </label>

              <label className="fieldLabel">
                Responder para (opcional)
                <input
                  type="email"
                  placeholder="atendimento@empresa.com.br"
                  value={configForm.smtpReplyTo}
                  onChange={(event) => setConfigForm({ ...configForm, smtpReplyTo: event.target.value })}
                />
              </label>

              <label className="fieldLabel checkboxLabel">
                <input
                  type="checkbox"
                  checked={configForm.clearSmtpPassword}
                  onChange={(event) => setConfigForm({ ...configForm, clearSmtpPassword: event.target.checked })}
                />
                Remover a senha SMTP atual
              </label>

              <div className="fieldSpan emailTestBox">
                <label className="fieldLabel">
                  E-mail para teste
                  <input
                    type="email"
                    placeholder="usuario@empresa.com.br"
                    value={emailTestTo}
                    onChange={(event) => setEmailTestTo(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={testEmailConfiguration}
                  disabled={testingEmail || !adminConfig?.smtpConfigured}
                >
                  <Mail size={16} />
                  {testingEmail ? 'Enviando...' : 'Enviar e-mail de teste'}
                </button>
                {!adminConfig?.smtpConfigured && <small>Salve a configuração SMTP antes de executar o teste.</small>}
              </div>
            </>
          )}

          {configForm.emailProvider === 'webhook' && (
            <>
              <label className="fieldLabel fieldSpan">
                URL do webhook de e-mail
                <input
                  type="url"
                  value={configForm.emailWebhookUrl}
                  onChange={(event) => setConfigForm({ ...configForm, emailWebhookUrl: event.target.value })}
                />
              </label>
              <label className="fieldLabel">
                Token do webhook
                <input
                  type="password"
                  placeholder={adminConfig?.emailWebhookTokenConfigured ? 'Token já configurado — digite apenas para substituir' : 'Token opcional'}
                  value={configForm.emailWebhookToken}
                  onChange={(event) => setConfigForm({ ...configForm, emailWebhookToken: event.target.value })}
                />
              </label>
              <label className="fieldLabel checkboxLabel">
                <input
                  type="checkbox"
                  checked={configForm.clearEmailWebhookToken}
                  onChange={(event) => setConfigForm({ ...configForm, clearEmailWebhookToken: event.target.checked })}
                />
                Remover token atual do webhook
              </label>
            </>
          )}

          {configForm.emailProvider === 'resend' && (
            <>
              <label className="fieldLabel">
                Remetente do e-mail
                <input
                  placeholder="FreteHub <notificacoes@seudominio.com.br>"
                  value={configForm.emailFrom}
                  onChange={(event) => setConfigForm({ ...configForm, emailFrom: event.target.value })}
                />
              </label>
              <label className="fieldLabel">
                Chave da Resend
                <input
                  type="password"
                  placeholder={adminConfig?.resendApiKeyConfigured ? 'Chave já configurada — digite apenas para substituir' : 're_...'}
                  value={configForm.resendApiKey}
                  onChange={(event) => setConfigForm({ ...configForm, resendApiKey: event.target.value })}
                />
              </label>
              <label className="fieldLabel checkboxLabel">
                <input
                  type="checkbox"
                  checked={configForm.clearResendApiKey}
                  onChange={(event) => setConfigForm({ ...configForm, clearResendApiKey: event.target.checked })}
                />
                Remover chave atual da Resend
              </label>
            </>
          )}

          <div className="formActions fieldSpan">
            <button type="submit" disabled={savingConfig}>
              {savingConfig ? 'Salvando...' : 'Salvar configurações'}
            </button>
            <span className="trackingMeta">Intervalo global fixo: 1 hora.</span>
          </div>
        </form>
      )}

      {canCreateTracking && (
        <form className="card formGrid" onSubmit={saveTracking}>
        <h3 className="fieldSpan">{editingId ? `Editar monitoramento #${editingId}` : 'Novo monitoramento'}</h3>

        <label className="fieldLabel">
          Empresa
          <select
            value={form.companyId}
            onChange={(event) => setForm({ ...form, companyId: event.target.value, carrierId: '' })}
            required
            disabled={user?.role !== 'ADMIN' && companies.length === 1}
          >
            <option value="">Selecione</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>
            ))}
          </select>
        </label>

        <label className="fieldLabel">
          Transportadora
          <select value={form.carrierId} onChange={(event) => setForm({ ...form, carrierId: event.target.value })} required>
            <option value="">Selecione</option>
            {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.nome}</option>)}
          </select>
        </label>

        <label className="fieldLabel">
          Intervalo de consulta
          <input value="A cada 1 hora" readOnly />
        </label>

        <label className="fieldLabel">{trackingDocumentLabel}<input value={form.documento} onChange={(event) => setForm({ ...form, documento: event.target.value })} /></label>
        <label className="fieldLabel">Nota Fiscal<input value={form.notaFiscal} onChange={(event) => setForm({ ...form, notaFiscal: event.target.value })} /></label>
        <label className="fieldLabel">Pedido<input value={form.pedido} onChange={(event) => setForm({ ...form, pedido: event.target.value })} /></label>
        <label className="fieldLabel">Conhecimento / CT-e<input value={form.conhecimento} onChange={(event) => setForm({ ...form, conhecimento: event.target.value })} /></label>
        <label className="fieldLabel">Destinatário<input value={form.destinatarioNome} onChange={(event) => setForm({ ...form, destinatarioNome: event.target.value })} placeholder="Nome ou razão social" /></label>

        {isAdmin && editingId && (
          <>
            <label className="fieldLabel">
              Status manual
              <input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} />
            </label>
            <label className="fieldLabel checkboxLabel">
              <input
                type="checkbox"
                checked={form.monitoringActive}
                onChange={(event) => setForm({ ...form, monitoringActive: event.target.checked })}
              />
              Monitoramento automático ativo
            </label>
          </>
        )}

        <div className="formActions fieldSpan">
          <button type="submit" disabled={saving || !carriers.length}>
            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Salvar tracking'}
          </button>
          {editingId && (
            <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar edição</button>
          )}
          {loadingTrackingCarriers && <span className="formNotice">Verificando tracking, URL e credenciais...</span>}
          {!loadingTrackingCarriers && form.companyId && !carriers.length && (
            <span className="formError">
              Nenhuma transportadora está pronta. O administrador deve configurar a URL de tracking e manter uma credencial válida para esta empresa.
            </span>
          )}
        </div>
        </form>
      )}

      <form className="card trackingFilters advancedTrackingFilters" onSubmit={searchTracking}>
        <div className="trackingFilterHeader">
          <button type="button" className="filterToggleButton" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <span><Filter size={18} /> <strong>Filtros avançados</strong></span>
            <span className="filterToggleMeta">
              {pagination.total} resultado{pagination.total === 1 ? '' : 's'}
              {activeFilterCount > 0 && <span className="activeFilterBadge">{activeFilterCount} ativo{activeFilterCount === 1 ? '' : 's'}</span>}
              {filtersOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </span>
          </button>
          <div className="filterHeaderActions">
            <button type="submit" disabled={loading}>{loading ? 'Pesquisando...' : 'Pesquisar'}</button>
            <button type="button" className="btn-secondary" onClick={() => {
              const empty = {
                companyId: '', carrierId: '', userId: '', documento: '', notaFiscal: '', pedido: '',
                conhecimento: '', destinatario: '', status: '', createdFrom: '', createdTo: '',
                predictionFrom: '', predictionTo: '', deliveryFrom: '', deliveryTo: '', delayed: false,
                divergence: false, hasError: false, proof: '', sortBy: 'updatedAt', sortDir: 'desc'
              };
              setFilters(empty);
              filtersRef.current = empty;
              loadTrackings(empty, true, 1);
            }}>Limpar</button>
          </div>
        </div>

        {filtersOpen && (
          <div className="trackingFilterBody">
            <div className="trackingFilterGrid">
          <label className="fieldLabel">Empresa
            <select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.target.value })}>
              <option value="">Todas as empresas</option>
              {(filterOptions.companies || []).map((company) => <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>)}
            </select>
          </label>
          <label className="fieldLabel">Transportadora
            <select value={filters.carrierId} onChange={(event) => setFilters({ ...filters, carrierId: event.target.value })}>
              <option value="">Todas as transportadoras</option>
              {(filterOptions.carriers || []).map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.nome}</option>)}
            </select>
          </label>
          <label className="fieldLabel">Usuário responsável
            <select value={filters.userId} onChange={(event) => setFilters({ ...filters, userId: event.target.value })}>
              <option value="">Todos os usuários</option>
              {(filterOptions.users || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <label className="fieldLabel">Status
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos os status</option>
              {(filterOptions.statuses || []).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="fieldLabel">Nota Fiscal<input placeholder="Número da NF" value={filters.notaFiscal} onChange={(event) => setFilters({ ...filters, notaFiscal: event.target.value })} /></label>
          <label className="fieldLabel">Pedido<input placeholder="Número do pedido" value={filters.pedido} onChange={(event) => setFilters({ ...filters, pedido: event.target.value })} /></label>
          <label className="fieldLabel">Conhecimento / CT-e<input placeholder="Número do CT-e" value={filters.conhecimento} onChange={(event) => setFilters({ ...filters, conhecimento: event.target.value })} /></label>
          <label className="fieldLabel">Destinatário<input placeholder="Nome ou razão social" value={filters.destinatario} onChange={(event) => setFilters({ ...filters, destinatario: event.target.value })} /></label>
          <label className="fieldLabel">CNPJ / CPF<input placeholder="Documento do tracking" value={filters.documento} onChange={(event) => setFilters({ ...filters, documento: event.target.value })} /></label>
          <label className="fieldLabel">Comprovante
            <select value={filters.proof} onChange={(event) => setFilters({ ...filters, proof: event.target.value })}>
              <option value="">Com ou sem comprovante</option>
              <option value="with">Com comprovante</option>
              <option value="without">Sem comprovante</option>
            </select>
          </label>
          <label className="fieldLabel">Criado de<input type="date" value={filters.createdFrom} onChange={(event) => setFilters({ ...filters, createdFrom: event.target.value })} /></label>
          <label className="fieldLabel">Criado até<input type="date" value={filters.createdTo} onChange={(event) => setFilters({ ...filters, createdTo: event.target.value })} /></label>
          <label className="fieldLabel">Previsão de<input type="date" value={filters.predictionFrom} onChange={(event) => setFilters({ ...filters, predictionFrom: event.target.value })} /></label>
          <label className="fieldLabel">Previsão até<input type="date" value={filters.predictionTo} onChange={(event) => setFilters({ ...filters, predictionTo: event.target.value })} /></label>
          <label className="fieldLabel">Entrega de<input type="date" value={filters.deliveryFrom} onChange={(event) => setFilters({ ...filters, deliveryFrom: event.target.value })} /></label>
          <label className="fieldLabel">Entrega até<input type="date" value={filters.deliveryTo} onChange={(event) => setFilters({ ...filters, deliveryTo: event.target.value })} /></label>
          <label className="fieldLabel">Ordenar por
            <select value={filters.sortBy} onChange={(event) => setFilters({ ...filters, sortBy: event.target.value })}>
              <option value="updatedAt">Última atualização</option>
              <option value="createdAt">Data de cadastro</option>
              <option value="previsaoEntrega">Previsão de entrega</option>
              <option value="dataEntrega">Data de entrega</option>
              <option value="status">Status</option>
            </select>
          </label>
          <label className="fieldLabel">Ordem
            <select value={filters.sortDir} onChange={(event) => setFilters({ ...filters, sortDir: event.target.value })}>
              <option value="desc">Mais recentes primeiro</option>
              <option value="asc">Mais antigos primeiro</option>
            </select>
          </label>
        </div>

            <div className="trackingFilterChecks">
              <label className="checkboxLabel"><input type="checkbox" checked={filters.delayed} onChange={(event) => setFilters({ ...filters, delayed: event.target.checked })} /> Somente atrasadas</label>
              <label className="checkboxLabel"><input type="checkbox" checked={filters.divergence} onChange={(event) => setFilters({ ...filters, divergence: event.target.checked })} /> Com divergência</label>
              <label className="checkboxLabel"><input type="checkbox" checked={filters.hasError} onChange={(event) => setFilters({ ...filters, hasError: event.target.checked })} /> Com falha de consulta</label>
            </div>
          </div>
        )}
      </form>

      <div className="card trackingTableCard trackingListCard">
        <div className="trackingResponsiveList">
          {rows.map((row) => (
            <article className="trackingResponsiveItem" key={row.id}>
              <div className="trackingResponsiveIdentity">
                <div className="trackingItemTopline">
                  <span className={`badge ${statusClass(row)}`}>{row.status || '-'}</span>
                  <strong>{row.transportadora}</strong>
                </div>
                <strong>{row.company?.nomeFantasia || row.company?.razaoSocial || '-'}</strong>
                <small>Cadastrado por: {row.user?.name || '-'}</small>
              </div>

              <div className="trackingResponsiveShipment">
                <span className="trackingResponsiveLabel">Documentos e destino</span>
                <strong>NF {row.notaFiscal || '-'}</strong>
                <small>Pedido {row.pedido || '-'} · CT-e {row.conhecimento || '-'}</small>
                <span>{row.cidade || '-'} / {row.uf || '-'}</span>
                {row.destinatarioNome && <small>Destinatário: {row.destinatarioNome}</small>}
              </div>

              <div className="trackingResponsiveOperation">
                <span className="trackingResponsiveLabel">Operação</span>
                <div className="trackingOperationPair">
                  <span><small>Previsão</small><strong>{row.previsaoEntrega || '-'}</strong></span>
                  <span><small>Última ocorrência</small><strong>{row.ultimaOcorrencia || '-'}</strong></span>
                </div>
                <strong>{row.dataEntrega ? 'Concluído' : row.monitoringActive ? 'Monitorando a cada 1h' : 'Pausado'}</strong>
                {row.lastCheckedAt && <small>Última: {new Date(row.lastCheckedAt).toLocaleString('pt-BR')}</small>}
                {row.monitoringActive && row.nextCheckAt && <small>Próxima: {new Date(row.nextCheckAt).toLocaleString('pt-BR')}</small>}
                {row.dataEntrega && row.emailNotificationSentAt && (
                  <small>E-mail enviado: {new Date(row.emailNotificationSentAt).toLocaleString('pt-BR')}</small>
                )}
                {row.dataEntrega && !row.emailNotificationSentAt && row.emailNotificationError && (
                  <small className="trackingError">E-mail pendente: {row.emailNotificationError}</small>
                )}
                {row.lastCheckError && <small className="trackingError">{row.lastCheckError}</small>}
              </div>

              <div className="trackingResponsiveActions">
                <button type="button" className="btn-secondary proofCountButton" onClick={() => openTimeline(row)}>
                  <Paperclip size={15} /> {row.comprovantesTotal || 0} comprovante{Number(row.comprovantesTotal || 0) === 1 ? '' : 's'}
                </button>
                <button type="button" onClick={() => openTimeline(row)}>Ver timeline</button>
                {canCheckTracking && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => forceMonitoring(row)}
                    disabled={checkingId === row.id || Boolean(row.dataEntrega)}
                    title={row.dataEntrega ? 'Carga já entregue' : 'Consultar a transportadora imediatamente'}
                  >
                    <RefreshCw size={15} />
                    {checkingId === row.id ? 'Consultando...' : 'Monitorar agora'}
                  </button>
                )}
                {isAdmin && (
                  <details className="trackingActionMenu">
                    <summary>Ações <ChevronDown size={15} /></summary>
                    <div className="trackingActionMenuPanel">
                      <button type="button" className="btn-secondary" onClick={() => startEdit(row)}>
                        <Pencil size={15} /> Editar
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => removeTracking(row)}
                        disabled={deletingId === row.id}
                      >
                        <Trash2 size={15} /> {deletingId === row.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </details>
                )}
              </div>
            </article>
          ))}
          {!rows.length && <div className="trackingEmptyState">Nenhum tracking encontrado.</div>}
        </div>
        <div className="trackingPagination">
          <span>Página {pagination.page} de {pagination.totalPages} · {pagination.total} resultado{pagination.total === 1 ? '' : 's'}</span>
          <div>
            <button type="button" className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => loadTrackings(filtersRef.current, false, pagination.page - 1)}><ChevronLeft size={16} /> Anterior</button>
            <button type="button" className="btn-secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => loadTrackings(filtersRef.current, false, pagination.page + 1)}>Próxima <ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {selectedTracking && (
        <div className="modalOverlay" onClick={() => setSelectedTracking(null)}>
          <div className="modalContent" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <h2>Timeline logística</h2>
                <small>{selectedTracking.transportadora} · NF {selectedTracking.notaFiscal || '-'}</small>
              </div>
              <div className="tableActions">
                {canCheckTracking && !selectedTracking.dataEntrega && (
                  <button type="button" className="btn-secondary" onClick={() => forceMonitoring(selectedTracking)} disabled={checkingId === selectedTracking.id}>
                    <RefreshCw size={15} /> {checkingId === selectedTracking.id ? 'Consultando...' : 'Monitorar agora'}
                  </button>
                )}
                <button type="button" onClick={() => setSelectedTracking(null)}>Fechar</button>
              </div>
            </div>

            <div className="timeline">
              {(selectedTracking.eventos || []).map((event) => {
                const title = event.tipo || 'OCORRÊNCIA';
                const description = String(event.descricao || '').trim();
                const showDescription =
                  description &&
                  description.toLocaleUpperCase('pt-BR') !==
                    String(title).trim().toLocaleUpperCase('pt-BR');
                const hasDetailedRoute =
                  event.estadoOrigem ||
                  event.municipioOrigem ||
                  event.estadoDestino ||
                  event.municipioDestino;

                return (
                  <div className="timelineItem" key={event.id}>
                    <div className="timelineDot" />
                    <div className="timelineCard">
                      <b className="timelineTitle">{title}</b>
                      {showDescription && <p>{description}</p>}

                      <small>
                        <strong>Data:</strong>{' '}
                        {event.dataEvento
                          ? new Date(event.dataEvento).toLocaleString('pt-BR')
                          : '-'}
                      </small>

                      {hasDetailedRoute ? (
                        <>
                          <br />
                          <small>
                            <strong>Estado origem:</strong>{' '}
                            {event.estadoOrigem || '-'}
                          </small>
                          <br />
                          <small>
                            <strong>Município origem:</strong>{' '}
                            {event.municipioOrigem || '-'}
                          </small>
                          <br />
                          <small>
                            <strong>Estado destino:</strong>{' '}
                            {event.estadoDestino || '-'}
                          </small>
                          <br />
                          <small>
                            <strong>Município destino:</strong>{' '}
                            {event.municipioDestino || '-'}
                          </small>
                        </>
                      ) : (
                        <>
                          <br />
                          <small>
                            {event.cidade || '-'} / {event.uf || '-'}
                          </small>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {!selectedTracking.eventos?.length && <p>Nenhuma ocorrência registrada.</p>}
            </div>

            <section className="deliveryProofSection">
              <div className="deliveryProofHeader">
                <div>
                  <h3><Paperclip size={18} /> Comprovantes de entrega</h3>
                  <small>{selectedTracking.comprovantesTotal || 0} comprovante{selectedTracking.comprovantesTotal === 1 ? '' : 's'} vinculado{selectedTracking.comprovantesTotal === 1 ? '' : 's'}</small>
                </div>
              </div>

              <div className="deliveryProofList">
                {(selectedTracking.comprovantes || []).map((proof) => (
                  <article className="deliveryProofCard" key={proof.id}>
                    <span className="deliveryProofIcon"><FileText size={20} /></span>
                    <div className="deliveryProofInfo">
                      <strong>{proof.fileName || (proof.source === 'CARRIER' ? 'Comprovante da transportadora' : `Comprovante #${proof.id}`)}</strong>
                      <span>{proof.description || (proof.source === 'CARRIER' ? 'Disponibilizado automaticamente pela transportadora.' : 'Anexado manualmente.')}</span>
                      <small>Origem: {proof.source === 'CARRIER' ? 'Transportadora' : 'Manual'} · {new Date(proof.createdAt).toLocaleString('pt-BR')}{proof.uploadedBy?.name ? ` · ${proof.uploadedBy.name}` : ''}</small>
                    </div>
                    <div className="deliveryProofActions">
                      {proof.hasFile && <button type="button" className="btn-secondary" onClick={() => downloadDeliveryProof(proof)}><Download size={15} /> Baixar</button>}
                      {proof.externalUrl && <button type="button" className="btn-secondary" onClick={() => window.open(proof.externalUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /> Abrir link</button>}
                      {canDeleteProof && proof.source === 'MANUAL' && <button type="button" className="btn-danger" onClick={() => removeDeliveryProof(proof)}><Trash2 size={15} /> Excluir</button>}
                    </div>
                  </article>
                ))}
                {!selectedTracking.comprovantes?.length && <p className="proofEmpty">Nenhum comprovante disponível.</p>}
              </div>

              {canCreateProof && (
                <form className="deliveryProofForm" onSubmit={uploadDeliveryProof}>
                  <h4>Anexar comprovante manualmente</h4>
                  <label className="fieldLabel">Arquivo (PDF, JPG ou PNG — até 8 MB)
                    <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setProofForm({ ...proofForm, file: event.target.files?.[0] || null })} />
                  </label>
                  <label className="fieldLabel">Ou link externo
                    <input type="url" placeholder="https://..." value={proofForm.externalUrl} onChange={(event) => setProofForm({ ...proofForm, externalUrl: event.target.value })} />
                  </label>
                  <label className="fieldLabel proofDescription">Observação
                    <input placeholder="Ex.: canhoto assinado pelo destinatário" value={proofForm.description} onChange={(event) => setProofForm({ ...proofForm, description: event.target.value })} />
                  </label>
                  <div className="formActions proofFormActions">
                    <button type="submit" disabled={uploadingProof}><Upload size={16} /> {uploadingProof ? 'Enviando...' : 'Anexar comprovante'}</button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryPage({ user }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [proposalQuote, setProposalQuote] = useState(null);
  const isAdmin = user?.role === 'ADMIN';

  async function load() {
    try {
      const response = await api.get('/quotes');
      setQuotes(response.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function successfulResults(quote) {
    return (quote.results || []).filter((result) => result.status === 'success' && result.valorFrete != null);
  }

  function bestPrice(quote) {
    const results = successfulResults(quote);
    return results.length
      ? results.reduce((best, current) => Number(current.valorFrete) < Number(best.valorFrete) ? current : best)
      : null;
  }

  function deadlineNumber(value) {
    const number = Number(String(value || '').match(/\d+/)?.[0]);
    return Number.isFinite(number) ? number : 999999;
  }

  function bestDeadline(quote) {
    const results = successfulResults(quote).filter((result) => result.prazo);
    return results.length
      ? results.reduce((best, current) => deadlineNumber(current.prazo) < deadlineNumber(best.prazo) ? current : best)
      : null;
  }

  function dimensionCm(value) {
    const number = Number(value || 0) * 100;
    return Number.isInteger(number)
      ? number
      : number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  async function openQuote(quote) {
    setLoadingDetail(true);
    try {
      const response = await api.get(`/quotes/${quote.id}`);
      setSelectedQuote(response.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao visualizar a cotação.');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function exportQuote(quote, event = null) {
    event?.stopPropagation();
    try {
      await downloadQuoteDocument(quote, 'excel');
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao exportar a cotação em Excel.');
    }
  }

  async function exportPdf(quote, event = null) {
    event?.stopPropagation();
    try {
      await downloadQuoteDocument(quote, 'pdf');
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao gerar o PDF da cotação.');
    }
  }


  async function deleteQuote(quote, event = null) {
    event?.stopPropagation();
    if (!confirm(`Excluir a cotação #${quote.id} do histórico?`)) return;

    try {
      await api.delete(`/quotes/${quote.id}`);
      if (selectedQuote?.id === quote.id) setSelectedQuote(null);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao excluir a cotação.');
    }
  }

  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Histórico de cotações</h1>
          <p>Clique sobre uma cotação para visualizar todos os dados. A exportação em Excel está disponível para todos os usuários.</p>
        </div>
      </div>

      <div className="card quoteHistoryCard">
        {loading ? <p>Carregando...</p> : (
          <div className="quoteHistoryList">
            {quotes.map((quote) => {
              const price = bestPrice(quote);
              const deadline = bestDeadline(quote);
              return (
                <article className="quoteHistoryItem" key={quote.id}>
                  <div
                    className="quoteHistoryClickable"
                    tabIndex={0}
                    role="button"
                    title="Clique para visualizar a cotação"
                    onClick={() => openQuote(quote)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openQuote(quote);
                      }
                    }}
                  >
                    <div className="quoteHistoryIdentity">
                      <strong>#{quote.id}</strong>
                      <span>{new Date(quote.createdAt).toLocaleDateString('pt-BR')}</span>
                      <small>{new Date(quote.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
                      <small>por {quote.user?.name || '-'}</small>
                    </div>

                    <div className="quoteHistoryRoute">
                      <small>Rota</small>
                      <strong>{quote.company?.nomeFantasia || quote.company?.razaoSocial || '-'}</strong>
                      <span>→ {quote.razaoSocialDestinatario || quote.cnpjDestinatario || '-'}</span>
                      <small>{quote.cidadeDestino || '-'} / {quote.ufDestino || '-'}</small>
                    </div>

                    <div className="quoteHistoryCargo">
                      <small>Frete e mercadoria</small>
                      <strong>{quote.tipoFrete} · {quote.modal}</strong>
                      <span>{money(quote.valorMercadoria)}</span>
                      <small>{quote.pesoTotal} kg · {quote.quantidadeVolumes} volume{Number(quote.quantidadeVolumes) === 1 ? '' : 's'}</small>
                    </div>

                    <div className="quoteHistoryBest">
                      <small>Melhor opção</small>
                      <strong>{price ? money(price.valorFrete) : '-'}</strong>
                      <span>{price?.carrier?.nome || '-'}</span>
                      <small>{deadline ? `${deadline.prazo} · ${deadline.carrier?.nome || '-'}` : 'Prazo não informado'}</small>
                    </div>
                  </div>

                  <details className="quoteActionMenu" onClick={(event) => event.stopPropagation()}>
                    <summary title="Ações da cotação"><MoreVertical size={18} /> <span>Ações</span></summary>
                    <div className="quoteActionMenuPanel">
                      <button type="button" onClick={() => openQuote(quote)}>Visualizar</button>
                      <button type="button" onClick={(event) => exportQuote(quote, event)}><FileSpreadsheet size={15} /> Excel</button>
                      <button type="button" onClick={(event) => exportPdf(quote, event)}><FileText size={15} /> PDF</button>
                      {can(user, 'QUOTE_SEND') && (
                        <button type="button" onClick={(event) => { event.stopPropagation(); setProposalQuote(quote); }}><Mail size={15} /> Enviar proposta</button>
                      )}
                      {isAdmin && (
                        <button type="button" className="btn-danger" onClick={(event) => deleteQuote(quote, event)}>Excluir</button>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
            {!quotes.length && <p className="quoteHistoryEmpty">Nenhuma cotação salva encontrada.</p>}
          </div>
        )}
      </div>

      {loadingDetail && (
        <div className="modalOverlay">
          <div className="modalContent quoteDetailsModal"><p>Carregando cotação...</p></div>
        </div>
      )}

      {selectedQuote && !loadingDetail && (
        <div className="modalOverlay" onClick={() => setSelectedQuote(null)}>
          <div className="modalContent quoteDetailsModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader quoteModalHeader">
              <div>
                <h2>Cotação #{selectedQuote.id}</h2>
                <small>
                  Realizada por <strong>{selectedQuote.user?.name || '-'}</strong>
                  {selectedQuote.user?.email ? ` · ${selectedQuote.user.email}` : ''}
                  {' · '}{new Date(selectedQuote.createdAt).toLocaleString('pt-BR')}
                </small>
              </div>
              <div className="tableActions">
                <button type="button" onClick={(event) => exportQuote(selectedQuote, event)}>
                  <FileSpreadsheet size={15} /> Exportar Excel
                </button>
                <button type="button" onClick={(event) => exportPdf(selectedQuote, event)}>
                  <FileText size={15} /> Exportar PDF
                </button>
                {can(user, 'QUOTE_SEND') && (
                  <button type="button" onClick={() => setProposalQuote(selectedQuote)}>
                    <Mail size={15} /> Enviar proposta
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={() => setSelectedQuote(null)}>Fechar</button>
              </div>
            </div>

            <div className="quoteDetailGrid">
              <div><small>Empresa remetente</small><strong>{selectedQuote.company?.nomeFantasia || selectedQuote.company?.razaoSocial || '-'}</strong></div>
              <div><small>Destinatário</small><strong>{selectedQuote.razaoSocialDestinatario || '-'}</strong></div>
              <div><small>CNPJ/CPF destinatário</small><strong>{selectedQuote.cnpjDestinatario || '-'}</strong></div>
              <div><small>Destino</small><strong>{selectedQuote.cidadeDestino || '-'} / {selectedQuote.ufDestino || '-'}</strong></div>
              <div><small>Tipo e modal</small><strong>{selectedQuote.tipoFrete} · {selectedQuote.modal}</strong></div>
              <div><small>Valor da mercadoria</small><strong>{money(selectedQuote.valorMercadoria)}</strong></div>
              <div><small>Peso total</small><strong>{selectedQuote.pesoTotal} kg</strong></div>
              <div><small>Quantidade</small><strong>{selectedQuote.quantidadeVolumes} volumes</strong></div>
            </div>

            <h3>Produtos e volumes</h3>
            <div className="tableScroll quoteModalTable">
              <table>
                <thead>
                  <tr><th>Produto</th><th>Dimensões (cm)</th><th>Peso unitário</th><th>Quantidade</th><th>Peso total</th></tr>
                </thead>
                <tbody>
                  {(selectedQuote.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.descricao || item.product?.description || item.sku || '-'}</td>
                      <td>{dimensionCm(item.largura)} × {dimensionCm(item.altura)} × {dimensionCm(item.comprimento)}</td>
                      <td>{Number(item.peso).toLocaleString('pt-BR')} kg</td>
                      <td>{item.quantidade}</td>
                      <td>{(Number(item.peso) * Number(item.quantidade)).toLocaleString('pt-BR')} kg</td>
                    </tr>
                  ))}
                  {!selectedQuote.items?.length && <tr><td colSpan="5">Nenhum item encontrado.</td></tr>}
                </tbody>
              </table>
            </div>

            <h3>Resultados das transportadoras</h3>
            <div className="tableScroll quoteModalTable">
              <table>
                <thead>
                  <tr><th>Transportadora</th><th>Valor</th><th>Prazo</th><th>Modalidade</th><th>Status</th><th>Mensagem</th></tr>
                </thead>
                <tbody>
                  {(selectedQuote.results || []).map((result) => (
                    <tr key={result.id}>
                      <td>{result.carrier?.nome || '-'}</td>
                      <td>{result.valorFrete == null ? '-' : money(result.valorFrete)}</td>
                      <td>{result.prazo || '-'}</td>
                      <td>{result.modalidade || '-'}</td>
                      <td><span className={`badge ${result.status === 'success' ? 'badge-success' : 'badge-error'}`}>{result.status === 'success' ? 'Cotado' : 'Erro'}</span></td>
                      <td>{result.mensagem || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {can(user, 'QUOTE_SEND') && (
              <>
                <h3>Envios da proposta</h3>
                <div className="tableScroll quoteModalTable">
                  <table>
                    <thead><tr><th>Data</th><th>Enviado por</th><th>Destinatários</th><th>Arquivos</th><th>Status</th><th>Erro</th></tr></thead>
                    <tbody>
                      {(selectedQuote.proposalLogs || []).map((proposal) => (
                        <tr key={proposal.id}>
                          <td>{new Date(proposal.createdAt).toLocaleString('pt-BR')}</td>
                          <td>{proposal.user?.name || '-'}</td>
                          <td>{Array.isArray(proposal.recipients) ? proposal.recipients.join(', ') : '-'}</td>
                          <td>{Array.isArray(proposal.formats) ? proposal.formats.join(' + ').toUpperCase() : '-'}</td>
                          <td><span className={`badge ${proposal.status === 'SENT' ? 'badge-success' : proposal.status === 'ERROR' ? 'badge-error' : 'badge-alert'}`}>{proposal.status === 'SENT' ? 'Enviada' : proposal.status === 'ERROR' ? 'Erro' : 'Pendente'}</span></td>
                          <td>{proposal.error || '-'}</td>
                        </tr>
                      ))}
                      {!selectedQuote.proposalLogs?.length && <tr><td colSpan="6">Nenhum envio registrado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {proposalQuote && (
        <ProposalModal
          quote={proposalQuote}
          onClose={() => setProposalQuote(null)}
          onSent={async () => {
            if (selectedQuote?.id === proposalQuote.id) await openQuote(proposalQuote);
          }}
        />
      )}
    </>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem('user');
    const savedUser = saved ? JSON.parse(saved) : null;
    return defaultPageForUser(savedUser);
  });

  if (!user) {
    return (
      <Login
        onLogin={(loggedUser) => {
          setUser(loggedUser);
          setPage(defaultPageForUser(loggedUser));
        }}
      />
    );
  }

  const pages = {
      ...(can(user, 'QUOTE_CREATE') ? { quotes: <Quote user={user} /> } : {}),
      ...(can(user, 'QUOTE_VIEW') ? { history: <HistoryPage user={user} /> } : {}),
      ...(can(user, 'TRACKING_VIEW') ? { tracking: <TrackingPage user={user} /> } : {}),
      ...(can(user, 'COMPANY_MANAGE') ? { companies: <Companies /> } : {}),
      ...(can(user, 'CARRIER_MANAGE') ? { carriers: <Carriers /> } : {}),
      ...(can(user, 'CREDENTIAL_MANAGE') ? { credentials: <Credentials /> } : {}),
      ...(can(user, 'PRODUCT_MANAGE') ? { products: <ProductsAdmin /> } : {}),
      ...(can(user, 'USER_MANAGE') ? { users: <UsersAdmin /> } : {}),
      password: (
        <ChangePassword
          user={user}
          onChanged={(updatedUser) => {
            setUser(updatedUser);
            setPage(defaultPageForUser(updatedUser));
          }}
        />
      )
    };

  const fallbackPage = defaultPageForUser(user);
  const activePage = pages[page] ? page : fallbackPage;

  return (
    <Layout page={activePage} setPage={setPage} user={user}>
      {pages[activePage] || pages.password}
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(<App />);