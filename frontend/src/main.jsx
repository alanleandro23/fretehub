import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  Settings
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

function DeliveryNotifications() {
  const [notifications, setNotifications] = useState([]);
  const browserNotifiedRef = useRef(new Set());

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const response = await api.get('/tracking/notifications/pending');
        const pending = response.data || [];
        if (!active || !pending.length) return;

        setNotifications((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...pending.filter((item) => !known.has(item.id))];
        });

        for (const item of pending) {
          if (
            !browserNotifiedRef.current.has(item.id) &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification('Carga entregue', {
              body: `${item.transportadora} · NF ${item.notaFiscal || '-'} · ${item.cidade || '-'}/${item.uf || '-'}`
            });
            browserNotifiedRef.current.add(item.id);
          }
        }
      } catch (error) {
        console.error('Erro ao consultar notificações de entrega:', error);
      }
    }

    poll();
    const timer = setInterval(poll, 30000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function closeNotification(item) {
    await api.post(`/tracking/${item.id}/notifications/ack`).catch(() => {});
    setNotifications((current) => current.filter((row) => row.id !== item.id));
  }

  if (!notifications.length) return null;

  return (
    <div className="notificationStack" aria-live="polite">
      {notifications.map((item) => (
        <div className="deliveryNotification" key={item.id}>
          <div>
            <strong>Carga entregue</strong>
            <p>
              {item.transportadora} · NF {item.notaFiscal || '-'}<br />
              {item.cidade || '-'} / {item.uf || '-'} · {item.dataEntrega || 'entregue'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary notificationClose"
            onClick={() => closeNotification(item)}
            aria-label="Fechar notificação"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function Layout({ children, setPage, page, user }) {
  const operationItems = [
    ['quotes', 'Cotação de frete', Truck],
    ['history', 'Histórico de cotações', History],
    ['tracking', 'Tracking de cargas', Truck]
  ];

  const adminItems = [
    ['users', 'Usuários', Users],
    ['products', 'Produtos', Package],
    ['companies', 'Empresas', Building2],
    ['carriers', 'Transportadoras', Truck],
    ['credentials', 'Credenciais', KeyRound]
  ];

  const items = [
    ...operationItems,
    ...(user?.role === 'ADMIN' ? adminItems : []),
    ['password', 'Alterar senha', ShieldCheck]
  ];

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  }

  return (
    <div className="app">
      <DeliveryNotifications />
      <aside>
        <div className="sideBrand"><Truck size={25} /><h2>FreteHub</h2></div>

        <div className="userSummary">
          <strong>{user?.name || user?.email}</strong>
          <small>{user?.email}</small>
          <span className="badge badge-alert">{user?.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</span>
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
    ativo: true
  };

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

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
      ativo: company.ativo !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event) {
    event.preventDefault();
    setLoading(true);

    try {
      if (editingId) await api.put(`/companies/${editingId}`, form);
      else await api.post('/companies', form);
      clearForm();
      await load();
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao salvar empresa.');
    } finally {
      setLoading(false);
    }
  }

  async function activate(id) {
    try {
      await api.post(`/companies/${id}/activate`);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao ativar empresa.');
    }
  }

  async function deactivate(id) {
    if (!confirm('Desativar esta empresa e bloquear os usuários vinculados?')) return;

    try {
      await api.post(`/companies/${id}/deactivate`);
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao desativar empresa.');
    }
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
        onChange={(event) => setForm({
          ...form,
          [name]: name === 'uf' ? event.target.value.toUpperCase() : event.target.value
        })}
      />
    </label>
  );

  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Empresas</h1>
          <p>Cadastre, edite, ative, desative ou exclua empresas da plataforma.</p>
        </div>
      </div>

      <form className="card formGrid" onSubmit={save}>
        {field('razaoSocial', 'Razão social', { required: true, className: 'fieldSpan2' })}
        {field('nomeFantasia', 'Nome fantasia')}
        {field('cnpj', 'CNPJ', { required: true })}
        {field('inscricaoEstadual', 'Inscrição estadual')}
        {field('cep', 'CEP', { required: true })}
        {field('endereco', 'Endereço', { required: true, className: 'fieldSpan2' })}
        {field('numero', 'Número')}
        {field('complemento', 'Complemento')}
        {field('bairro', 'Bairro')}
        {field('cidade', 'Cidade', { required: true })}
        {field('uf', 'UF', { required: true, maxLength: 2 })}
        {field('telefone', 'Telefone')}
        {field('email', 'E-mail', { type: 'email' })}

        <label className="fieldLabel">
          Status
          <select
            value={form.ativo ? 'true' : 'false'}
            onChange={(event) => setForm({ ...form, ativo: event.target.value === 'true' })}
          >
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </label>

        <div className="formActions fieldSpan">
          <button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar empresa'}
          </button>
          {editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar edição</button>}
        </div>
      </form>

      <div className="card tableCard">
        <div className="tableScroll">
          <table>
            <thead>
              <tr><th>Empresa</th><th>CNPJ</th><th>Cidade/UF</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {rows.map((company) => (
                <tr key={company.id}>
                  <td><strong>{company.nomeFantasia || company.razaoSocial}</strong><br /><small>{company.razaoSocial}</small></td>
                  <td>{company.cnpj}</td>
                  <td>{company.cidade}/{company.uf}</td>
                  <td><span className={`badge ${company.ativo ? 'badge-success' : 'badge-error'}`}>{company.ativo ? 'Ativa' : 'Inativa'}</span></td>
                  <td className="actionsCell">
                    <button type="button" onClick={() => edit(company)}>Editar</button>
                    {company.ativo ? (
                      <button type="button" className="btn-secondary" onClick={() => deactivate(company.id)}>Desativar</button>
                    ) : (
                      <button type="button" onClick={() => activate(company.id)}>Ativar</button>
                    )}
                    <button type="button" className="btn-danger" onClick={() => remove(company)}>Excluir</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="5">Nenhuma empresa cadastrada.</td></tr>}
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
    ativo: true
  };

  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

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
      ativo: row.ativo
    });
  }

  async function save(e) {
    e.preventDefault();
    try {
      if (editingId) await api.put(`/carrier-credentials/${editingId}`, form);
      else await api.post('/carrier-credentials', form);
      clearForm();
      load();
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao salvar credencial.');
    }
  }

  async function deactivate(id) {
    if (!confirm('Desativar esta credencial?')) return;
    await api.delete(`/carrier-credentials/${id}`);
    load();
  }

  return (
    <>
      <div className="pageHeader"><div><h1>Credenciais</h1><p>Os valores de senha e token nunca aparecem na listagem.</p></div></div>

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

        <label className="fieldLabel">Usuário<input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} /></label>
        <label className="fieldLabel">Senha<input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder={editingId ? 'Preencha somente para substituir' : ''} /></label>
        <label className="fieldLabel">Token<input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={editingId ? 'Preencha somente para substituir' : ''} /></label>
        <label className="fieldLabel">Código do cliente<input value={form.codigoCliente} onChange={(e) => setForm({ ...form, codigoCliente: e.target.value })} /></label>
        <label className="fieldLabel">Contrato<input value={form.contrato} onChange={(e) => setForm({ ...form, contrato: e.target.value })} /></label>
        <label className="fieldLabel">CNPJ vinculado<input value={form.cnpjVinculado} onChange={(e) => setForm({ ...form, cnpjVinculado: e.target.value.replace(/\D/g, '') })} maxLength="14" /></label>
        <label className="fieldLabel">Status
          <select value={String(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.value === 'true' })}><option value="true">Ativa</option><option value="false">Inativa</option></select>
        </label>

        <div className="formActions fieldSpan"><button type="submit">{editingId ? 'Salvar alterações' : 'Cadastrar credencial'}</button>{editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar</button>}</div>
      </form>

      <div className="card tableCard"><div className="tableScroll"><table>
        <thead><tr><th>Transportadora</th><th>Empresa</th><th>Ambiente</th><th>Identificação</th><th>Segredos</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{row.carrier?.nome}</td>
          <td>{row.company?.nomeFantasia || row.company?.razaoSocial}</td>
          <td>{row.ambiente === 'PRODUCAO' ? 'Produção' : 'Homologação'}</td>
          <td>{row.usuario || '-'}<br /><small>Cliente: {row.codigoCliente || '-'} · Contrato: {row.contrato || '-'}</small></td>
          <td><span className="secretState">Senha: {row.hasPassword ? 'configurada' : 'não informada'}</span><br /><span className="secretState">Token: {row.hasToken ? 'configurado' : 'não informado'}</span></td>
          <td><span className={`badge ${row.ativo ? 'badge-success' : 'badge-error'}`}>{row.ativo ? 'Ativa' : 'Inativa'}</span></td>
          <td className="actionsCell"><button type="button" onClick={() => edit(row)}>Editar</button><button type="button" className="btn-danger" onClick={() => deactivate(row.id)}>Desativar</button></td>
        </tr>)}</tbody>
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
  const emptyForm = { name: '', email: '', initialPassword: '', role: 'USER', companyId: '', active: true };
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
        <label className="fieldLabel">Perfil<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="USER">Usuário</option><option value="ADMIN">Administrador</option></select></label>
        <label className="fieldLabel">Empresa<select value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}><option value="">Sem vínculo</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>)}</select></label>
        <label className="fieldLabel">Status<select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
        <div className="formActions fieldSpan"><button type="submit">{editingId ? 'Salvar alterações' : 'Criar usuário'}</button>{editingId && <button type="button" className="btn-secondary" onClick={clearForm}>Cancelar</button>}</div>
      </form>
      <div className="card tableCard"><div className="tableScroll"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Empresa</th><th>Status</th><th>Senha</th><th>Ações</th></tr></thead>
        <tbody>{rows.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td><span className="badge badge-alert">{user.role === 'ADMIN' ? 'Administrador' : 'Usuário'}</span></td><td>{user.company?.nomeFantasia || user.company?.razaoSocial || '-'}</td><td><span className={`badge ${user.active ? 'badge-success' : 'badge-error'}`}>{user.active ? 'Ativo' : 'Inativo'}</span></td><td>{user.mustChangePassword ? 'Alteração pendente' : 'Definida'}</td><td className="actionsCell"><button type="button" onClick={() => edit(user)}>Editar</button><button type="button" className="btn-secondary" onClick={() => resetPassword(user)}>Redefinir senha</button><button type="button" className="btn-danger" onClick={() => deactivate(user.id)}>Desativar</button></td></tr>)}</tbody>
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


function Quote({ user }) {
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [products, setProducts] = useState([]);
  const [result, setResult] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [loadingCarriers, setLoadingCarriers] = useState(false);
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

    const response = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${clean}`
    );

    if (!response.ok) {
      alert('CNPJ não encontrado na BrasilAPI.');
      return;
    }

    const data = await response.json();

    setForm((prev) => ({
      ...prev,
      razaoSocialDestinatario: data.razao_social || '',
      enderecoDestino: data.logradouro || '',
      cidadeDestino: data.municipio || '',
      ufDestino: data.uf || '',
      cepDestino: onlyNumbers(data.cep || '')
    }));
  } catch (error) {
    console.error('Erro ao consultar CNPJ:', error);
    alert('Erro ao consultar CNPJ.');
  }
}

  useEffect(() => {
    Promise.all([
      api.get('/companies'),
      api.get('/products?limit=500')
    ])
      .then(([companiesResponse, productsResponse]) => {
        setCompanies(companiesResponse.data || []);
        setProducts(productsResponse.data || []);

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

  async function submit() {
  if (!form.companyId) {
    alert('Selecione uma empresa.');
    return;
  }

  if (!form.carrierIds.length) {
    alert('Selecione pelo menos uma transportadora.');
    return;
  }

  const volumeValidationMessage = validateVolumeItems();

  if (volumeValidationMessage) {
    alert(volumeValidationMessage);
    return;
  }

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
      const response = await api.get(`/quotes/${result.id}/export-excel`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.setAttribute('download', `cotacao-${result.id}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      alert('Erro ao exportar Excel. Verifique o console ou o backend.');
    }
  }

  return (
    <>
      <h1>Cotação de Frete</h1>

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
          <input value={form.cepDestino} onChange={(e) => upd('cepDestino', onlyNumbers(e.target.value))} maxLength="8" required />
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
                onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
              />
            </label>

            <label className="fieldLabel">
              Comprimento (cm)
              <input
                value={i.comprimento}
                placeholder="Ex.: 25"
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
                  <button onClick={exportExcel}>
                    <FileSpreadsheet size={16} />
                    Exportar Excel
                  </button>
                )}
              </div>
            </div>
          );
        })()}
    </>
  );
}

function TrackingPage({ user }) {
  const isAdmin = user?.role === 'ADMIN';
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
  const [adminConfig, setAdminConfig] = useState(null);
  const [configForm, setConfigForm] = useState({
    jamefTrackingUrl: '',
    braspressTrackingUrl: '',
    emailNotificationsEnabled: true,
    emailFrom: '',
    appUrl: '',
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
    status: '',
    monitoringActive: true,
    checkIntervalMinutes: '60'
  };

  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({
    companyId: '',
    carrierId: '',
    documento: '',
    notaFiscal: '',
    pedido: '',
    conhecimento: '',
    status: ''
  });
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  async function loadTrackings(params = filtersRef.current, silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/tracking', {
        params: Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ''))
      });
      setRows(response.data || []);
    } catch (error) {
      if (!silent) alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao consultar tracking.');
    } finally {
      if (!silent) setLoading(false);
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
        emailNotificationsEnabled: data.emailNotificationsEnabled !== false,
        emailFrom: data.emailFrom || '',
        appUrl: data.appUrl || '',
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
    loadTrackings({}, true);
    loadAdminConfig(true);

    const timer = setInterval(
      () => loadTrackings(filtersRef.current, true),
      30000
    );

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const companyId = Number(form.companyId || 0);

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
  }, [form.companyId, adminConfig?.jamefTrackingConfigured, adminConfig?.braspressTrackingConfigured]);

  async function searchTracking(event) {
    event.preventDefault();
    await loadTrackings(filters);
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

    if (!form.companyId) return alert('Selecione a empresa do tracking.');
    if (!form.carrierId) return alert('Selecione uma transportadora com tracking automático.');
    if (!form.notaFiscal && !form.pedido && !form.conhecimento) {
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
      await loadTrackings({}, true);
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
      await loadTrackings(filtersRef.current, true);
      if (selectedTracking?.id === row.id) setSelectedTracking(response.data);
    } catch (error) {
      alert(error.response?.data?.error || error.response?.data?.message || 'Erro ao forçar o monitoramento.');
      await loadTrackings(filtersRef.current, true);
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
      await loadTrackings(filtersRef.current, true);
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
        emailWebhookToken: '',
        resendApiKey: '',
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

  async function openTimeline(row) {
    try {
      const response = await api.get(`/tracking/${row.id}`);
      setSelectedTracking(response.data);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao abrir a timeline.');
    }
  }

  function statusClass(row) {
    if (row.dataEntrega || String(row.status).toUpperCase().includes('ENTREG')) return 'badge-success';
    if (row.lastCheckError) return 'badge-error';
    return 'badge-alert';
  }

  return (
    <>
      <div className="pageHeader">
        <div>
          <h1>Tracking de cargas</h1>
          <p>Inclua a carga manualmente. O sistema consulta as transportadoras a cada 1 hora e registra as mudanças na timeline.</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn-secondary" onClick={() => setShowAdminConfig((current) => !current)}>
            <Settings size={16} />
            {showAdminConfig ? 'Fechar configurações' : 'Configurar tracking'}
          </button>
        )}
      </div>

      <div className="formNotice">
        Após salvar, a primeira consulta automática fica agendada para 1 hora. Para consultar sem esperar, use o botão <strong>Monitorar agora</strong> na carga desejada.
      </div>

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
              <span className={`badge ${adminConfig?.emailProvider !== 'não configurado' ? 'badge-success' : 'badge-alert'}`}>
                E-mail: {adminConfig?.emailProvider || 'não configurado'}
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
              placeholder="Cole o endpoint oficial de rastreio fornecido pela Braspress"
              value={configForm.braspressTrackingUrl}
              onChange={(event) => setConfigForm({ ...configForm, braspressTrackingUrl: event.target.value })}
            />
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
            Remetente do e-mail
            <input
              placeholder="FreteHub <notificacoes@seudominio.com.br>"
              value={configForm.emailFrom}
              onChange={(event) => setConfigForm({ ...configForm, emailFrom: event.target.value })}
            />
          </label>

          <label className="fieldLabel fieldSpan checkboxLabel">
            <input
              type="checkbox"
              checked={configForm.emailNotificationsEnabled}
              onChange={(event) => setConfigForm({ ...configForm, emailNotificationsEnabled: event.target.checked })}
            />
            Ativar notificações de entrega por e-mail
          </label>

          <label className="fieldLabel fieldSpan">
            URL do webhook de e-mail
            <input
              type="url"
              placeholder="Deixe vazio para usar a Resend"
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
              checked={configForm.clearEmailWebhookToken}
              onChange={(event) => setConfigForm({ ...configForm, clearEmailWebhookToken: event.target.checked })}
            />
            Remover token atual do webhook
          </label>

          <label className="fieldLabel checkboxLabel">
            <input
              type="checkbox"
              checked={configForm.clearResendApiKey}
              onChange={(event) => setConfigForm({ ...configForm, clearResendApiKey: event.target.checked })}
            />
            Remover chave atual da Resend
          </label>

          <div className="formActions fieldSpan">
            <button type="submit" disabled={savingConfig}>
              {savingConfig ? 'Salvando...' : 'Salvar configurações'}
            </button>
            <span className="trackingMeta">Intervalo global fixo: 1 hora.</span>
          </div>
        </form>
      )}

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

        <label className="fieldLabel">CNPJ do tomador<input value={form.documento} onChange={(event) => setForm({ ...form, documento: event.target.value })} /></label>
        <label className="fieldLabel">Nota Fiscal<input value={form.notaFiscal} onChange={(event) => setForm({ ...form, notaFiscal: event.target.value })} /></label>
        <label className="fieldLabel">Pedido<input value={form.pedido} onChange={(event) => setForm({ ...form, pedido: event.target.value })} /></label>
        <label className="fieldLabel">Conhecimento / CT-e<input value={form.conhecimento} onChange={(event) => setForm({ ...form, conhecimento: event.target.value })} /></label>

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

      <form className="card trackingFilters" onSubmit={searchTracking}>
        <h3>Pesquisar monitoramentos</h3>
        {isAdmin && (
          <select value={filters.companyId} onChange={(event) => setFilters({ ...filters, companyId: event.target.value })}>
            <option value="">Todas as empresas</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.nomeFantasia || company.razaoSocial}</option>)}
          </select>
        )}
        <input placeholder="Nota Fiscal" value={filters.notaFiscal} onChange={(event) => setFilters({ ...filters, notaFiscal: event.target.value })} />
        <input placeholder="Pedido" value={filters.pedido} onChange={(event) => setFilters({ ...filters, pedido: event.target.value })} />
        <input placeholder="Conhecimento / CT-e" value={filters.conhecimento} onChange={(event) => setFilters({ ...filters, conhecimento: event.target.value })} />
        <input placeholder="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} />
        <button type="submit" disabled={loading}>{loading ? 'Pesquisando...' : 'Pesquisar'}</button>
        <button type="button" className="btn-secondary" onClick={() => {
          const empty = { companyId: '', carrierId: '', documento: '', notaFiscal: '', pedido: '', conhecimento: '', status: '' };
          setFilters(empty);
          loadTrackings({}, true);
        }}>Limpar</button>
      </form>

      <div className="card tableCard">
        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Empresa</th>
                <th>Cadastrado por</th>
                <th>Transportadora</th>
                <th>NF / Pedido / CT-e</th>
                <th>Destino</th>
                <th>Previsão</th>
                <th>Última ocorrência</th>
                <th>Automação</th>
                <th>Timeline</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><span className={`badge ${statusClass(row)}`}>{row.status || '-'}</span></td>
                  <td>{row.company?.nomeFantasia || row.company?.razaoSocial || '-'}</td>
                  <td><strong>{row.user?.name || '-'}</strong></td>
                  <td>{row.transportadora}</td>
                  <td>
                    NF {row.notaFiscal || '-'}<br />
                    <small>Pedido {row.pedido || '-'} · CT-e {row.conhecimento || '-'}</small>
                  </td>
                  <td>{row.cidade || '-'} / {row.uf || '-'}</td>
                  <td>{row.previsaoEntrega || '-'}</td>
                  <td>{row.ultimaOcorrencia || '-'}</td>
                  <td>
                    <strong>{row.dataEntrega ? 'Concluído' : row.monitoringActive ? 'Monitorando a cada 1h' : 'Pausado'}</strong>
                    {row.lastCheckedAt && <small className="trackingMeta">Última: {new Date(row.lastCheckedAt).toLocaleString('pt-BR')}</small>}
                    {row.monitoringActive && row.nextCheckAt && <small className="trackingMeta">Próxima: {new Date(row.nextCheckAt).toLocaleString('pt-BR')}</small>}
                    {row.dataEntrega && row.emailNotificationSentAt && (
                      <small className="trackingMeta">E-mail enviado: {new Date(row.emailNotificationSentAt).toLocaleString('pt-BR')}</small>
                    )}
                    {row.dataEntrega && !row.emailNotificationSentAt && row.emailNotificationError && (
                      <small className="trackingError">E-mail pendente: {row.emailNotificationError}</small>
                    )}
                    {row.lastCheckError && <small className="trackingError">{row.lastCheckError}</small>}
                  </td>
                  <td><button type="button" onClick={() => openTimeline(row)}>Ver timeline</button></td>
                  <td>
                    <div className="tableActions">
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
                      {isAdmin && (
                        <>
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
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={11}>Nenhum tracking encontrado.</td></tr>}
            </tbody>
          </table>
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
                {!selectedTracking.dataEntrega && (
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
                      <b>{title}</b>
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
          </div>
        </div>
      )}
    </>
  );
}

function HistoryPage({ user }) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
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
      const response = await api.get(`/quotes/${quote.id}/export-excel`, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cotacao-${quote.id}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.response?.data?.message || 'Erro ao exportar a cotação.');
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

      <div className="card tableCard">
        {loading ? <p>Carregando...</p> : (
          <div className="tableScroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Realizada por</th>
                  <th>Remetente</th>
                  <th>Destino</th>
                  <th>Frete</th>
                  <th>Mercadoria</th>
                  <th>Menor preço</th>
                  <th>Menor prazo</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>{quotes.map((quote) => {
                const price = bestPrice(quote);
                const deadline = bestDeadline(quote);

                return (
                  <tr
                    key={quote.id}
                    className="clickableRow"
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
                    <td>#{quote.id}</td>
                    <td>
                      <strong>{quote.user?.name || '-'}</strong><br />
                      <small>{quote.user?.email || '-'}</small>
                    </td>
                    <td>{quote.company?.nomeFantasia || quote.company?.razaoSocial}</td>
                    <td>{quote.razaoSocialDestinatario || quote.cnpjDestinatario}<br /><small>{quote.cidadeDestino}/{quote.ufDestino}</small></td>
                    <td>{quote.tipoFrete} · {quote.modal}</td>
                    <td>{money(quote.valorMercadoria)}<br /><small>{quote.pesoTotal} kg · {quote.quantidadeVolumes} volumes</small></td>
                    <td>{price ? <><strong>{money(price.valorFrete)}</strong><br /><small>{price.carrier?.nome}</small></> : '-'}</td>
                    <td>{deadline ? <><strong>{deadline.prazo}</strong><br /><small>{deadline.carrier?.nome}</small></> : '-'}</td>
                    <td>{new Date(quote.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="actionsCell" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={(event) => exportQuote(quote, event)}>
                        <FileSpreadsheet size={15} /> Excel
                      </button>
                      {isAdmin && (
                        <button type="button" className="btn-danger" onClick={(event) => deleteQuote(quote, event)}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
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
          </div>
        </div>
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
    return savedUser?.mustChangePassword ? 'password' : 'quotes';
  });

  if (!user) {
    return (
      <Login
        onLogin={(loggedUser) => {
          setUser(loggedUser);
          setPage(loggedUser.mustChangePassword ? 'password' : 'quotes');
        }}
      />
    );
  }

  const pages = {
      quotes: <Quote user={user} />,
      history: <HistoryPage user={user} />,
      tracking: <TrackingPage user={user} />,
      companies: <Companies />,
      carriers: <Carriers />,
      credentials: <Credentials />,
      products: <ProductsAdmin />,
      users: <UsersAdmin />,
      password: (
        <ChangePassword
          user={user}
          onChanged={(updatedUser) => {
            setUser(updatedUser);
            setPage('quotes');
          }}
        />
      )
    };

  return (
    <Layout page={page} setPage={setPage} user={user}>
      {pages[page] || pages.quotes}
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(<App />);