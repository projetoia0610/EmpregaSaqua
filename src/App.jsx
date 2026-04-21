import { useState, useEffect, createContext, useContext, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://pbjdmlbimzqnpvdzjsxt.supabase.co";
const SUPABASE_KEY = "sb_publishable_8yseeAgQ-nEwN-Zy_Pm7NQ_l9gamc_H";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { lock: (_name, _timeout, fn) => fn() }
});

// ─── SUPABASE SERVICE LAYER ───────────────────────────────────────────────────
// Todos os métodos retornam dados normalizados para o estado local (db)

const dbService = {
  // ── PROFESSIONALS (profiles com role=CANDIDATE) ──
  async getProfessionals() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "CANDIDATE")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normProfile);
  },

  // ── JOBS (pedidos de serviço / vagas) ──
  async getJobs() {
    const { data, error } = await supabase
      .from("jobs")
      .select("*, proposals:proposals(id)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normJob);
  },

  async createJob(jobData) {
    const row = {
      title: jobData.title,
      description: jobData.description,
      category: jobData.category,
      budget: jobData.budget || null,
      bairro: jobData.bairro,
      type: jobData.type,
      company_id: jobData.companyId,
      company_name: jobData.companyName,
      status: "OPEN",
      views: 0,
    };
    const { data, error } = await supabase.from("jobs").insert(row).select("*, proposals:proposals(id)").single();
    if (error) throw error;
    return normJob(data);
  },

  async deleteJob(jobId) {
    const { error } = await supabase.from("jobs").delete().eq("id", jobId);
    if (error) throw error;
  },

  async updateJobStatus(jobId, status) {
    const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
    if (error) throw error;
  },

  // ── PROPOSALS ──
  async getProposals() {
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normProposal);
  },

  async createProposal(propData) {
    const row = {
      job_id: propData.jobId,
      candidate_id: propData.candidateId,
      candidate_name: propData.candidateName,
      candidate_rating: propData.candidateRating || 0,
      price: propData.price,
      message: propData.message,
      status: "PENDING",
    };
    const { data, error } = await supabase.from("proposals").insert(row).select().single();
    if (error) throw error;
    return normProposal(data);
  },

  async updateProposalStatus(proposalId, status) {
    const { error } = await supabase.from("proposals").update({ status }).eq("id", proposalId);
    if (error) throw error;
  },

  // ── REVIEWS ──
  async getReviews() {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normReview);
  },

  async createReview(revData) {
    const row = {
      reviewer_id: revData.reviewerId,
      reviewer_name: revData.reviewerName,
      target_id: revData.targetId,
      target_name: revData.targetName,
      job_id: revData.jobId || null,
      job_title: revData.jobTitle || "Avaliação geral",
      rating: revData.rating,
      comment: revData.comment,
    };
    const { data, error } = await supabase.from("reviews").insert(row).select().single();
    if (error) throw error;
    // Atualizar rating do profissional
    await supabase.rpc("update_profile_rating", { p_id: revData.targetId });
    return normReview(data);
  },

  // ── MESSAGES ──
  async getMessages(userId) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(normMessage);
  },

  async createMessage(msgData) {
    const row = {
      sender_id: msgData.senderId,
      sender_name: msgData.senderName,
      receiver_id: msgData.receiverId,
      job_id: msgData.jobId || null,
      text: msgData.text,
    };
    const { data, error } = await supabase.from("messages").insert(row).select().single();
    if (error) throw error;
    return normMessage(data);
  },

  // ── PROFILE UPDATE ──
  async updateProfile(userId, profileData) {
    const row = {};
    if (profileData.name !== undefined) row.name = profileData.name;
    if (profileData.phone !== undefined) row.phone = profileData.phone;
    if (profileData.bio !== undefined) row.bio = profileData.bio;
    if (profileData.bairro !== undefined) row.bairro = profileData.bairro;
    if (profileData.categories !== undefined) row.categories = profileData.categories;
    const { error } = await supabase.from("profiles").update(row).eq("id", userId);
    if (error) throw error;
  },

  // ── USERS (para o painel admin) ──
  async getUsers() {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normProfile);
  },

  async deleteUser(userId) {
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) throw error;
  },

  // ── PORTFOLIO POSTS ──
  async getPortfolioPosts(professionalId) {
    const { data, error } = await supabase
      .from("portfolio_posts")
      .select("*")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normPost);
  },

  async createPortfolioPost(postData) {
    const row = {
      professional_id: postData.professionalId,
      title: postData.title,
      description: postData.description || null,
      image_url: postData.imageUrl,
    };
    const { data, error } = await supabase.from("portfolio_posts").insert(row).select().single();
    if (error) throw error;
    return normPost(data);
  },

  async deletePortfolioPost(postId, professionalId) {
    const { error } = await supabase
      .from("portfolio_posts")
      .delete()
      .eq("id", postId)
      .eq("professional_id", professionalId);
    if (error) throw error;
  },

  // ── UPLOAD DE IMAGENS (Supabase Storage) ──
  async uploadImage(file, bucket, path) {
    const ext = file.name.split(".").pop();
    const filePath = `${path}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  },

  // ── ATUALIZAR FOTO DE PERFIL ──
  async updateAvatarUrl(userId, avatarUrl) {
    const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId);
    if (error) throw error;
  },
};

// ─── NORMALIZADORES (snake_case do Supabase → camelCase local) ────────────────
function normProfile(p) {
  if (!p) return p;
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    phone: p.phone || "",
    bairro: p.bairro || "",
    city: p.city || "Saquarema",
    state: p.state || "RJ",
    bio: p.bio || "",
    categories: p.categories || [],
    rating: p.rating || 0,
    reviewCount: p.review_count || 0,
    completedJobs: p.completed_jobs || 0,
    responseTime: p.response_time || "—",
    portfolio: p.portfolio || [],
    verified: p.verified || false,
    memberSince: p.member_since || (p.created_at ? p.created_at.slice(0, 7) : ""),
    companyName: p.company_name || "",
    avatarUrl: p.avatar_url || null,
    createdAt: p.created_at,
  };
}

function normPost(p) {
  if (!p) return p;
  return {
    id: p.id,
    professionalId: p.professional_id,
    title: p.title,
    description: p.description || "",
    imageUrl: p.image_url,
    createdAt: p.created_at ? p.created_at.slice(0, 10) : "",
  };
}

function normJob(j) {
  if (!j) return j;
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    category: j.category,
    budget: j.budget || "",
    bairro: j.bairro || "",
    city: j.city || "Saquarema",
    type: j.type || "SERVICE_REQUEST",
    companyId: j.company_id,
    companyName: j.company_name,
    status: j.status || "OPEN",
    views: j.views || 0,
    // proposals é um array de IDs para compatibilidade com o código existente
    proposals: Array.isArray(j.proposals) ? j.proposals.map(p => (typeof p === "object" ? p.candidate_id || p.id : p)) : [],
    createdAt: j.created_at ? j.created_at.slice(0, 10) : "",
  };
}

function normProposal(p) {
  if (!p) return p;
  return {
    id: p.id,
    jobId: p.job_id,
    candidateId: p.candidate_id,
    candidateName: p.candidate_name,
    candidateRating: p.candidate_rating || 0,
    price: p.price,
    message: p.message,
    status: p.status || "PENDING",
    createdAt: p.created_at ? p.created_at.slice(0, 10) : "",
  };
}

function normReview(r) {
  if (!r) return r;
  return {
    id: r.id,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name,
    reviewerRole: r.reviewer_role || "CLIENT",
    targetId: r.target_id,
    targetName: r.target_name,
    jobId: r.job_id || null,
    jobTitle: r.job_title || "Avaliação geral",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at ? r.created_at.slice(0, 10) : "",
  };
}

function normMessage(m) {
  if (!m) return m;
  return {
    id: m.id,
    jobId: m.job_id || null,
    senderId: m.sender_id,
    senderName: m.sender_name,
    receiverId: m.receiver_id,
    text: m.text,
    createdAt: m.created_at || new Date().toISOString(),
  };
}

// ─── CONTEXT ─────────────────────────────────────────────────────────────────
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "ti", label: "TI & Tecnologia", emoji: "💻" },
  { id: "construcao", label: "Construção & Reforma", emoji: "🔨" },
  { id: "limpeza", label: "Limpeza & Conservação", emoji: "🧹" },
  { id: "educacao", label: "Educação & Aulas", emoji: "📚" },
  { id: "saude", label: "Saúde & Bem-estar", emoji: "🏥" },
  { id: "eventos", label: "Eventos & Festas", emoji: "🎉" },
  { id: "juridico", label: "Jurídico & Financeiro", emoji: "⚖️" },
  { id: "design", label: "Design & Marketing", emoji: "🎨" },
  { id: "transporte", label: "Transporte & Logística", emoji: "🚚" },
  { id: "gastronomia", label: "Gastronomia", emoji: "🍽️" },
];

// ─── VERSÃO ───────────────────────────────────────────────────────────────────
const APP_VERSION = "v7";

// ─── BAIRROS ──────────────────────────────────────────────────────────────────
const BAIRROS = [
  "Alvorada", "Areal", "Asfalto Velho", "Aterrado", "Bacaxá", "Barreira",
  "Barra Nova", "Boqueirão", "Bonsucesso", "Caixa d'água", "Condado de Bacaxá",
  "Coqueiral", "Fátima", "Gravatá", "Guarani", "Itaúna", "Jaconé", "Jardim",
  "Leigos", "Madre Bela", "Madressilva", "Nova Itaúna", "Palmital", "Park Swan",
  "Parque Marina", "Porto da Roça", "Porto Novo", "Raia", "Retiro", "Rio da Areia",
  "Rio Seco", "São Geraldo", "Verde Vale", "Vilatur",
];

// ─── BAIRRO SELECT COMPONENT ──────────────────────────────────────────────────
const BairroSelect = ({ value, onChange, required, className }) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtered = BAIRROS.filter(b => b.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (b) => { onChange(b); setSearch(""); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(o => !o)}
        className={`w-full border rounded-xl px-4 py-3 text-sm flex items-center justify-between cursor-pointer bg-white focus-within:ring-2 focus-within:ring-teal-400 ${value ? "text-gray-900" : "text-gray-400"} ${className || "border-gray-300"}`}
      >
        <span>{value || "Selecione seu bairro"}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar bairro..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">Nenhum bairro encontrado</li>
            ) : filtered.map(b => (
              <li key={b} onClick={() => select(b)}
                className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-teal-50 hover:text-teal-700 transition-colors ${value === b ? "bg-teal-50 text-teal-700 font-semibold" : "text-gray-700"}`}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {required && <input tabIndex={-1} required value={value} onChange={() => {}} className="absolute opacity-0 w-0 h-0" />}
    </div>
  );
};

// ─── DATABASE (estado local — populado pelo Supabase no boot) ────────────────
const initialDB = {
  users: [],
  jobs: [],
  proposals: [],
  reviews: [],
  notifications: [],
  messages: [],
};



// ─── HELPERS ─────────────────────────────────────────────────────────────────
const stars = (n, size = "sm") => {
  const s = size === "sm" ? "text-sm" : "text-base";
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} className={`${s} ${i < Math.floor(n) ? "text-yellow-400" : i < n ? "text-yellow-300" : "text-gray-300"}`}>★</span>
  ));
};

const Avatar = ({ user, size = 10 }) => {
  const initials = user?.name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const colors = ["bg-cyan-400", "bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-rose-500", "bg-teal-500"];
  const color = colors[(user?.id?.charCodeAt(0) || 0) % colors.length];
  const px = size * 4;
  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: `${px}px`, height: `${px}px` }}
        onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
      />
    );
  }
  return (
    <div className={`${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
      style={{ width: `${px}px`, height: `${px}px`, fontSize: `${size * 1.6}px` }}>
      {initials}
    </div>
  );
};

const openWhatsApp = (phone, jobTitle) => {
  const clean = phone.replace(/\D/g, "");
  const msg = encodeURIComponent(`Olá! Vi sua proposta para "${jobTitle}" no EmpregaFácil. Vamos conversar?`);
  window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
};

// ─── ICONS ───────────────────────────────────────────────────────────────────
const I = {
  Star: () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  MapPin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Zap: () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-500"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Shield: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Bell: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Send: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,

  Briefcase: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>,
  LogOut: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  Eye: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>,
  Home: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  MessageCircle: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Award: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  TrendingUp: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  Filter: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  User: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Badge = ({ role }) => {
  const m = { CANDIDATE: ["Profissional", "bg-blue-100 text-blue-700"], COMPANY: ["Empresa", "bg-purple-100 text-purple-700"], ADMIN: ["Admin", "bg-red-100 text-red-700"], CLIENT: ["Cliente", "bg-orange-100 text-orange-700"] };
  const [l, c] = m[role] || ["?", "bg-gray-100 text-gray-500"];
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c}`}>{l}</span>;
};



const Alert = ({ type, msg, onClose }) => {
  if (!msg) return null;
  const s = type === "success" ? "bg-teal-50 border-teal-400 text-teal-800" : "bg-red-50 border-red-400 text-red-800";
  return (
    <div className={`border rounded-xl px-4 py-3 flex items-center justify-between ${s} mb-4`}>
      <span className="text-sm font-medium">{msg}</span>
      {onClose && <button onClick={onClose} className="ml-3 text-lg opacity-50 hover:opacity-100">×</button>}
    </div>
  );
};

const Modal = ({ title, children, onClose, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"><I.X /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
const Navbar = () => {
  const { user, setUser, setPage, db, handleLogout } = useApp();
  const [showNotif, setShowNotif] = useState(false);
  const unread = db.notifications.filter(n => n.userId === user?.id && !n.read).length;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <button onClick={() => setPage("home")} className="flex items-center gap-2 font-black text-xl text-teal-700 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-700 to-cyan-500 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white text-sm font-black">EF</span>
          </div>
          <span className="hidden sm:inline">Emprega<span className="text-teal-500">Fácil</span></span>
        </button>

        <div className="flex items-center gap-2 flex-1 max-w-xs hidden md:flex">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <I.Search />
            </span>
            <input
              placeholder="Buscar serviços..."
              className="w-full pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-gray-50"
              style={{ paddingLeft: "2.2rem" }}
              onFocus={() => setPage("services")}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setPage("services")} className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-teal-700 px-3 py-2 rounded-xl hover:bg-teal-50 transition-colors">
            <I.Briefcase /> Serviços
          </button>
          <button onClick={() => setPage("professionals")} className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-teal-700 px-3 py-2 rounded-xl hover:bg-teal-50 transition-colors">
            <I.User /> Profissionais
          </button>

          <a
            href={"https://wa.me/5522997385987?text=Olá%21%20Preciso%20de%20suporte%20no%20EmpregaFácil."}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.523 5.845L.057 23.885a.5.5 0 00.606.61l6.188-1.453A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.937 0-3.745-.524-5.298-1.433l-.38-.224-3.924.921.959-3.802-.247-.393A9.957 9.957 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            Suporte
          </a>

          {user ? (
            <div className="flex items-center gap-2">

              <div className="relative">
                <button onClick={() => setShowNotif(s => !s)} className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
                  <I.Bell />
                  {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">{unread}</span>}
                </button>
                {showNotif && (
                  <div className="absolute right-0 top-12 w-72 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50">
                    <div className="p-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Notificações</div>
                    {db.notifications.filter(n => n.userId === user.id).length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">Nenhuma notificação</div>
                    ) : (
                      db.notifications.filter(n => n.userId === user.id).map(n => (
                        <div key={n.id} className={`px-4 py-3 text-sm border-b border-gray-50 ${!n.read ? "bg-teal-50" : ""}`}>
                          <p className={`${!n.read ? "font-semibold text-gray-900" : "text-gray-600"}`}>{n.msg}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.createdAt}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setPage("dashboard")} className="flex items-center gap-2 hover:bg-gray-100 px-2 py-1.5 rounded-xl transition-colors">
                <Avatar user={user} size={8} />
                <span className="hidden sm:inline text-sm font-semibold text-gray-700">{user.name.split(" ")[0]}</span>
              </button>
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors" title="Sair">
                <I.LogOut />
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => setPage("login")} className="text-sm font-medium text-gray-600 hover:text-teal-700 px-3 py-2">Entrar</button>
              <button onClick={() => setPage("register")} className="text-sm font-bold bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-xl transition-colors shadow-sm">Cadastrar</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const { setPage, db } = useApp();
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-400 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="max-w-6xl mx-auto px-4 py-20 text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6 backdrop-blur-sm border border-white/30">
            ✨ Plataforma #1 de serviços freelance do Brasil
          </div>
          <h1 className="text-4xl sm:text-6xl font-black leading-tight mb-6 tracking-tight">
            Encontre o profissional<br/>
            <span className="text-cyan-200">certo para você</span>
          </h1>
          <p className="text-lg text-cyan-100 mb-10 max-w-xl mx-auto">
            Mais de {db.users.filter(u => u.role === "CANDIDATE").length} profissionais prontos para atender você. Receba orçamentos gratuitos em minutos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => setPage("request-service")} className="bg-white text-teal-800 font-black px-8 py-4 rounded-2xl text-lg hover:bg-teal-50 transition-all shadow-xl hover:-translate-y-1">
              📋 Solicitar Orçamento Grátis
            </button>
            <button onClick={() => setPage("register")} className="bg-teal-900/60 hover:bg-teal-900/80 border border-cyan-400/50 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all backdrop-blur-sm">
              💼 Sou Profissional
            </button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-black text-gray-900 mb-6">O que você precisa?</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setPage("services")} className="bg-white border border-gray-200 hover:border-teal-400 hover:bg-teal-50 rounded-2xl p-4 text-center transition-all hover:shadow-md hover:-translate-y-0.5 group">
              <div className="text-3xl mb-2">{cat.emoji}</div>
              <div className="text-xs font-semibold text-gray-700 group-hover:text-teal-700 leading-tight">{cat.label}</div>
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-black text-center text-gray-900 mb-10">Como funciona?</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { n: "1", icon: "📋", title: "Descreva o que precisa", desc: "Publique um pedido com detalhes do serviço que você precisa. É gratuito!" },
              { n: "2", icon: "💬", title: "Receba propostas", desc: "Profissionais qualificados enviam orçamentos. Compare preços e avaliações." },
              { n: "3", icon: "✅", title: "Contrate o melhor", desc: "Escolha o profissional ideal, combine os detalhes e avalie após o serviço." },
            ].map(s => (
              <div key={s.n} className="bg-white rounded-2xl p-6 shadow-sm text-center border border-gray-100">
                <div className="text-4xl mb-3">{s.icon}</div>
                <div className="w-8 h-8 bg-teal-700 text-white rounded-xl flex items-center justify-center font-black text-sm mx-auto mb-3">{s.n}</div>
                <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top Professionals */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-gray-900">Profissionais em Destaque</h2>
          <button onClick={() => setPage("professionals")} className="text-teal-600 font-semibold text-sm hover:underline">Ver todos →</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {db.users.filter(u => u.role === "CANDIDATE").map(pro => (
            <ProfessionalCard key={pro.id} pro={pro} />
          ))}
        </div>
      </section>

      {/* Stats Banner */}
      <section className="bg-teal-800 text-white py-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { v: db.users.filter(u => u.role === "CANDIDATE").length + "+", l: "Profissionais" },
              { v: db.jobs.length + "+", l: "Serviços publicados" },
              { v: db.proposals.length + "+", l: "Propostas enviadas" },
              { v: "4.8★", l: "Avaliação média" },
            ].map(s => (
              <div key={s.l}>
                <div className="text-3xl font-black">{s.v}</div>
                <div className="text-cyan-200 text-sm mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-8 text-center text-sm">
        <p className="font-bold text-white mb-1">EmpregaFácil</p>
        <p>Conectando profissionais e clientes de forma simples e confiável.</p>
        <p className="mt-2 text-xs text-gray-600">{APP_VERSION}</p>
      </footer>
    </div>
  );
};

// ─── PROFESSIONAL CARD ────────────────────────────────────────────────────────
const ProfessionalCard = ({ pro, onClick }) => {
  const { setSelectedPro, setPage } = useApp();
  return (
    <div
      onClick={() => { setSelectedPro(pro); setPage("profile"); }}
      className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="relative">
          <Avatar user={pro} size={12} />
          {pro.verified && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-cyan-400 rounded-full flex items-center justify-center border-2 border-white"><I.Check /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-gray-900 text-sm truncate">{pro.name}</span>
  
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
            <I.MapPin />{pro.bairro || pro.city || "Saquarema"} — Saquarema/RJ
          </div>
          <div className="flex items-center gap-1 mt-1">
            {stars(pro.rating)}
            <span className="text-xs font-semibold text-gray-700 ml-1">{pro.rating}</span>
            <span className="text-xs text-gray-400">({pro.reviewCount})</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">{pro.bio}</p>
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3 text-gray-400">
          <span className="flex items-center gap-1"><I.Award />{pro.completedJobs} feitos</span>
          <span className="flex items-center gap-1"><I.Clock />{pro.responseTime}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {pro.categories?.slice(0, 1).map(c => {
            const cat = CATEGORIES.find(x => x.id === c);
            return cat ? <span key={c} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium text-xs">{cat.emoji} {cat.label.split(" ")[0]}</span> : null;
          })}
        </div>
      </div>
    </div>
  );
};

// ─── PROFESSIONALS PAGE ───────────────────────────────────────────────────────
const ProfessionalsPage = () => {
  const { db } = useApp();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const pros = db.users.filter(u => u.role === "CANDIDATE" &&
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.bio?.toLowerCase().includes(search.toLowerCase())) &&
    (!catFilter || u.categories?.includes(catFilter))
  );
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-black text-gray-900 mb-6">Profissionais</h1>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><I.Search /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar profissional..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
          <option value="">Todas as áreas</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
      </div>
      {pros.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-4">👤</div><p>Nenhum profissional encontrado</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pros.map(pro => <ProfessionalCard key={pro.id} pro={pro} />)}
        </div>
      )}
    </div>
  );
};

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { selectedPro, db, user, setPage, setDb } = useApp();
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState("portfolio");
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);

  if (!selectedPro) return <div className="p-8 text-center text-gray-400">Nenhum perfil selecionado.</div>;
  const pro = db.users.find(u => u.id === selectedPro.id) || selectedPro;
  const proReviews = db.reviews.filter(r => r.targetId === pro.id);

  // Carregar posts do portfólio
  useEffect(() => {
    if (!pro?.id) return;
    setPostsLoading(true);
    dbService.getPortfolioPosts(pro.id)
      .then(setPosts)
      .catch(e => console.error("Erro ao carregar portfólio:", e))
      .finally(() => setPostsLoading(false));
  }, [pro?.id]);

  const submitReview = async () => {
    if (!reviewForm.comment) return;
    try {
      const newRev = await dbService.createReview({
        reviewerId: user.id, reviewerName: user.name, reviewerRole: user.role,
        targetId: pro.id, targetName: pro.name,
        jobId: null, jobTitle: "Avaliação geral",
        rating: reviewForm.rating, comment: reviewForm.comment,
      });
      const newCount = proReviews.length + 1;
      const newRating = ((pro.rating * proReviews.length) + reviewForm.rating) / newCount;
      setDb(prev => ({
        ...prev,
        reviews: [...prev.reviews, newRev],
        users: prev.users.map(u => u.id === pro.id ? { ...u, rating: Math.round(newRating * 10) / 10, reviewCount: newCount } : u),
      }));
      setShowReviewModal(false);
      setSuccess("Avaliação enviada!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      console.error("Erro ao enviar avaliação:", e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => setPage("professionals")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        ← Voltar para Profissionais
      </button>
      <Alert type="success" msg={success} />

      {/* ── Header do Perfil ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-4 overflow-hidden">
        {/* Capa */}
        <div className="h-32 bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-400 relative">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        </div>

        <div className="px-6 pb-6">
          {/* Avatar sobre a capa */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 mb-4">
            <div className="relative w-24 h-24 ring-4 ring-white rounded-full shadow-lg">
              {pro.avatarUrl ? (
                <img src={pro.avatarUrl} alt={pro.name} className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <Avatar user={pro} size={24} />
              )}
              {pro.verified && (
                <div className="absolute bottom-0 right-0 w-7 h-7 bg-cyan-400 rounded-full flex items-center justify-center border-2 border-white shadow">
                  <I.Check />
                </div>
              )}
            </div>

            <div className="flex gap-2 sm:pb-1">
              {pro.phone && (
                <button onClick={() => openWhatsApp(pro.phone, "serviço")}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors shadow-sm">
                  📱 WhatsApp
                </button>
              )}
              {user && user.id !== pro.id && (
                <button onClick={() => setShowReviewModal(true)}
                  className="flex items-center gap-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 font-bold px-4 py-2 rounded-xl text-sm border border-yellow-200 transition-colors">
                  ★ Avaliar
                </button>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-black text-gray-900">{pro.name}</h1>
              {pro.verified && (
                <span className="text-xs bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <I.Shield />Verificado
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-3">
              <span className="flex items-center gap-1"><I.MapPin />{pro.bairro || "Saquarema"} — RJ</span>
              <span className="flex items-center gap-1"><I.Clock />{pro.responseTime}</span>
              <span>Membro desde {pro.memberSince}</span>
            </div>

            {/* Categorias */}
            {pro.categories?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pro.categories.map(c => {
                  const cat = CATEGORIES.find(x => x.id === c);
                  return cat ? (
                    <span key={c} className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-sm font-medium border border-teal-100">
                      {cat.emoji} {cat.label}
                    </span>
                  ) : null;
                })}
              </div>
            )}

            {pro.bio && <p className="text-gray-600 text-sm leading-relaxed">{pro.bio}</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <div className="text-xl font-black text-gray-900">{posts.length}</div>
              <div className="text-xs text-gray-500">Publicações</div>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="text-xl font-black text-gray-900">{pro.completedJobs}</div>
              <div className="text-xs text-gray-500">Serviços feitos</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black text-gray-900 flex items-center justify-center gap-1">
                {pro.rating > 0 ? <><span className="text-yellow-400">★</span>{pro.rating}</> : "—"}
              </div>
              <div className="text-xs text-gray-500">{pro.reviewCount} avaliações</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex bg-white border border-gray-200 rounded-2xl p-1 mb-4 gap-1">
        {[
          { key: "portfolio", label: "🖼️ Portfólio", count: posts.length },
          { key: "reviews", label: "⭐ Avaliações", count: proReviews.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t.key ? "bg-teal-700 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Portfolio Grid ── */}
      {tab === "portfolio" && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {postsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">🖼️</div>
              <p className="font-semibold">Nenhuma publicação ainda</p>
              <p className="text-sm mt-1">Este profissional ainda não adicionou trabalhos ao portfólio.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 bg-gray-100">
              {posts.map(post => (
                <button key={post.id} onClick={() => setSelectedPost(post)}
                  className="relative aspect-square overflow-hidden group bg-gray-200">
                  <img src={post.imageUrl} alt={post.title}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={e => { e.target.src = "https://placehold.co/400x400/e2e8f0/94a3b8?text=📷"; }} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="text-white font-bold text-xs text-center px-2">{post.title}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reviews ── */}
      {tab === "reviews" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          {proReviews.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhuma avaliação ainda.</div>
          ) : (
            <div className="space-y-4">
              {proReviews.map(r => (
                <div key={r.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                        {r.reviewerName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{r.reviewerName}</p>
                        <p className="text-xs text-gray-400">{r.jobTitle} · {r.createdAt}</p>
                      </div>
                    </div>
                    <div className="flex">{stars(r.rating)}</div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de Post ── */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedPost(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col sm:flex-row shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sm:w-1/2 bg-black flex items-center justify-center">
              <img src={selectedPost.imageUrl} alt={selectedPost.title} className="w-full max-h-96 sm:max-h-full object-contain" />
            </div>
            <div className="sm:w-1/2 p-5 flex flex-col">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
                <Avatar user={pro} size={10} />
                <div>
                  <p className="font-bold text-gray-900 text-sm">{pro.name}</p>
                  <p className="text-xs text-gray-500">{selectedPost.createdAt}</p>
                </div>
                <button onClick={() => setSelectedPost(null)} className="ml-auto text-gray-400 hover:text-gray-700"><I.X /></button>
              </div>
              <h3 className="font-black text-gray-900 mb-2">{selectedPost.title}</h3>
              {selectedPost.description && (
                <p className="text-gray-600 text-sm leading-relaxed">{selectedPost.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Avaliação ── */}
      {showReviewModal && (
        <Modal title="⭐ Avaliar Profissional" onClose={() => setShowReviewModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-2">Nota</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setReviewForm(p => ({ ...p, rating: n }))}
                    className={`text-2xl transition-transform hover:scale-125 ${n <= reviewForm.rating ? "text-yellow-400" : "text-gray-300"}`}>★</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1.5">Comentário</label>
              <textarea value={reviewForm.comment} onChange={e => setReviewForm(p => ({ ...p, comment: e.target.value }))}
                placeholder="Conte como foi a experiência com este profissional..."
                rows={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
            </div>
            <button onClick={submitReview} className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl text-sm transition-colors">
              Enviar Avaliação
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── SERVICES / REQUESTS PAGE ─────────────────────────────────────────────────
const ServicesPage = () => {
  const { db, user, setPage } = useApp();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [type, setType] = useState("");

  const filtered = db.jobs.filter(j =>
    (!search || j.title.toLowerCase().includes(search.toLowerCase()) || j.description.toLowerCase().includes(search.toLowerCase())) &&
    (!cat || j.category === cat) &&
    (!type || j.type === type)
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Pedidos de Serviço</h1>
          <p className="text-gray-500 text-sm mt-0.5">{filtered.length} oportunidades disponíveis</p>
        </div>
        {user && (
          <button onClick={() => setPage("request-service")} className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-5 py-3 rounded-xl text-sm transition-colors shadow-sm whitespace-nowrap">
            <I.Plus /> Publicar Pedido
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><I.Search /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar serviço..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="">Todos os tipos</option>
          <option value="SERVICE_REQUEST">Pedido de Serviço</option>
          <option value="JOB">Vaga de Emprego</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><div className="text-5xl mb-4">🔍</div><p>Nenhum resultado</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map(job => <ServiceCard key={job.id} job={job} />)}
        </div>
      )}
    </div>
  );
};

// ─── SERVICE CARD ─────────────────────────────────────────────────────────────
const ServiceCard = ({ job }) => {
  const { user, db, setDb, setPage } = useApp();
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalForm, setProposalForm] = useState({ price: "", message: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const cat = CATEGORIES.find(c => c.id === job.category);
  const myProposal = user ? db.proposals.find(p => p.jobId === job.id && p.candidateId === user.id) : null;
  const statusMap = { OPEN: ["Aberto", "bg-teal-100 text-teal-700"], IN_PROGRESS: ["Em andamento", "bg-blue-100 text-blue-700"], CLOSED: ["Encerrado", "bg-gray-100 text-gray-500"] };
  const [sLabel, sColor] = statusMap[job.status] || ["?", ""];

  const submitProposal = async () => {
    if (!proposalForm.price || !proposalForm.message) { setError("Preencha todos os campos."); return; }
    try {
      const newProp = await dbService.createProposal({
        jobId: job.id, candidateId: user.id, candidateName: user.name,
        candidateRating: user.rating || 0, price: proposalForm.price, message: proposalForm.message,
      });
      setDb(prev => ({
        ...prev,
        proposals: [...prev.proposals, newProp],
        jobs: prev.jobs.map(j => j.id === job.id ? { ...j, proposals: [...j.proposals, user.id] } : j),
      }));
      setShowProposalModal(false);
      setSuccess("Proposta enviada com sucesso!");
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      console.error("Erro ao enviar proposta:", e);
      setError("Erro ao enviar proposta. Tente novamente.");
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
      {success && <div className="text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded-lg px-3 py-2 font-medium">{success}</div>}

      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sColor}`}>{sLabel}</span>
            {cat && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cat.emoji} {cat.label}</span>}
            <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{job.type === "JOB" ? "💼 Vaga" : "🔧 Serviço"}</span>
          </div>
          <h3 className="font-bold text-gray-900">{job.title}</h3>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="flex items-center gap-1"><I.MapPin />{job.bairro || job.city || "Saquarema"} — Saquarema/RJ</span>
            <span className="flex items-center gap-1"><I.Eye />{job.views} views</span>
          </div>
        </div>
        {job.budget && <div className="text-right shrink-0"><p className="text-xs text-gray-400">Orçamento</p><p className="text-sm font-bold text-teal-700">{job.budget}</p></div>}
      </div>

      <p className="text-gray-600 text-sm leading-relaxed line-clamp-2">{job.description}</p>

      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-gray-400">{job.proposals.length} proposta{job.proposals.length !== 1 ? "s" : ""} · {job.createdAt}</div>
        {user?.role === "CANDIDATE" && job.status === "OPEN" && (
          myProposal ? (
            <span className="flex items-center gap-1 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1.5 rounded-lg"><I.Check />Proposta enviada</span>
          ) : (
            <button onClick={() => setShowProposalModal(true)} className="flex items-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
              <I.Send />Enviar Proposta
            </button>
          )
        )}
        {!user && (
          <button onClick={() => setPage("login")} className="bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-teal-800 transition-colors">
            Entrar para propor
          </button>
        )}
      </div>

      {showProposalModal && (
        <Modal title="💬 Enviar Proposta" onClose={() => { setShowProposalModal(false); setError(""); }}>
          <Alert type="error" msg={error} onClose={() => setError("")} />
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1.5">Seu valor / proposta de preço *</label>
              <input value={proposalForm.price} onChange={e => setProposalForm(p => ({ ...p, price: e.target.value }))}
                placeholder="Ex: R$ 1.200 ou R$ 80/h"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1.5">Sua mensagem para o cliente *</label>
              <textarea value={proposalForm.message} onChange={e => setProposalForm(p => ({ ...p, message: e.target.value }))}
                placeholder="Apresente-se e explique por que você é o profissional ideal..."
                rows={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowProposalModal(false); setError(""); }} className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={submitProposal} className="flex-1 bg-teal-700 text-white font-bold py-3 rounded-xl text-sm hover:bg-teal-800 transition-colors">Enviar Proposta</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── REQUEST SERVICE PAGE ─────────────────────────────────────────────────────
const RequestServicePage = () => {
  const { db, setDb, user, setPage } = useApp();
  const [form, setForm] = useState({ title: "", description: "", category: "", budget: "", bairro: "", type: "SERVICE_REQUEST" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.title || !form.description || !form.category || !form.bairro) { setError("Preencha os campos obrigatórios."); return; }
    try {
      const newJob = await dbService.createJob({
        ...form, companyId: user.id, companyName: user.companyName || user.name,
      });
      setDb(prev => ({ ...prev, jobs: [newJob, ...prev.jobs] }));
      setSuccess("Pedido publicado! Aguarde as propostas dos profissionais.");
      setTimeout(() => setPage("services"), 2000);
    } catch (e) {
      console.error("Erro ao publicar pedido:", e);
      setError("Erro ao publicar pedido. Tente novamente.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={() => setPage("services")} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">← Voltar</button>
      <h1 className="text-2xl font-black text-gray-900 mb-6">📋 Publicar Pedido de Serviço</h1>
      <Alert type="success" msg={success} />
      <Alert type="error" msg={error} onClose={() => setError("")} />
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Título do serviço *</label>
          <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Preciso de pintor para apartamento 60m²"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Categoria *</label>
          <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option value="">Selecionar categoria</option>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Descrição detalhada *</label>
          <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Descreva o que você precisa com o máximo de detalhes possível..."
            rows={5} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Bairro *</label>
          <BairroSelect
            value={form.bairro}
            onChange={v => setForm(p => ({ ...p, bairro: v }))}
            required
          />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Orçamento estimado</label>
          <input value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="Ex: R$ 500 - R$ 1.000 ou A combinar"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
        <div>
          <label className="text-sm font-bold text-gray-700 block mb-1.5">Tipo</label>
          <div className="flex gap-3">
            {[["SERVICE_REQUEST", "🔧 Pedido de Serviço"], ["JOB", "💼 Vaga de Emprego"]].map(([v, l]) => (
              <button key={v} onClick={() => setForm(p => ({ ...p, type: v }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${form.type === v ? "border-teal-500 bg-teal-50 text-teal-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={submit} className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-4 rounded-xl text-base transition-colors shadow-sm">
          Publicar Pedido Grátis
        </button>
      </div>
    </div>
  );
};

// ─── PLANS PAGE ───────────────────────────────────────────────────────────────


// ─── MESSAGES PAGE ────────────────────────────────────────────────────────────
const MessagesPage = () => {
  const { db, user, setDb } = useApp();
  const [newMsg, setNewMsg] = useState("");
  const messagesEndRef = useRef(null);
  const myMessages = db.messages.filter(m => m.senderId === user?.id || m.receiverId === user?.id);

  const send = async () => {
    if (!newMsg.trim()) return;
    try {
      const msg = await dbService.createMessage({
        jobId: null, senderId: user.id, senderName: user.name,
        receiverId: 0, text: newMsg.trim(),
      });
      setDb(prev => ({ ...prev, messages: [...prev.messages, msg] }));
      setNewMsg("");
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      console.error("Erro ao enviar mensagem:", e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2"><I.MessageCircle />Mensagens</h1>
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="h-96 overflow-y-auto p-5 space-y-3 bg-gray-50">
          {myMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Nenhuma mensagem ainda.</div>
          ) : (
            myMessages.map(m => (
              <div key={m.id} className={`flex ${m.senderId === user.id ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm shadow-sm ${m.senderId === user.id ? "bg-teal-700 text-white rounded-br-sm" : "bg-white text-gray-800 rounded-bl-sm border border-gray-200"}`}>
                  {m.senderId !== user.id && <p className="font-bold text-xs mb-1 text-teal-600">{m.senderName}</p>}
                  <p>{m.text}</p>
                  <p className={`text-xs mt-1 ${m.senderId === user.id ? "text-cyan-200" : "text-gray-400"}`}>{m.createdAt.slice(11, 16)}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Digite sua mensagem..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <button onClick={send} className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl transition-colors">
            <I.Send />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── AUTH PAGES ───────────────────────────────────────────────────────────────
const LoginPage = () => {
  const { setUser, setPage } = useApp();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handle = async e => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password,
      });
      if (authError) {
        if (authError.message.includes("Email not confirmed")) {
          setError("Confirme seu email antes de entrar. Verifique sua caixa de entrada.");
        } else {
          setError("Email ou senha incorretos.");
        }
        return;
      }
      // Buscar perfil do usuário
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (profile) { setUser({ ...profile, email: data.user.email }); setPage("dashboard"); }
      else { setError("Perfil não encontrado. Entre em contato com o suporte."); }
    } catch (e) {
      console.error("Erro no login:", e);
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!form.email) { setError("Digite seu email para redefinir a senha."); return; }
    await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: window.location.href });
    setResetSent(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-700 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-black text-xl">EF</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Bem-vindo de volta!</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {resetSent && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4 text-sm text-teal-700 font-medium">
              ✅ Email de redefinição enviado! Verifique sua caixa de entrada.
            </div>
          )}
          <Alert type="error" msg={error} onClose={() => setError("")} />
          <form onSubmit={handle} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1.5">Email</label>
              <input type="email" required value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="seu@email.com" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-700 block mb-1.5">Senha</label>
              <input type="password" required value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-teal-300 text-white font-black py-3.5 rounded-xl text-base transition-colors">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
          <div className="mt-3 text-center">
            <button onClick={handleReset} className="text-xs text-gray-400 hover:text-teal-600 hover:underline">Esqueci minha senha</button>
          </div>
          <div className="mt-4 text-center text-sm text-gray-500">
            Não tem conta? <button onClick={() => setPage("register")} className="text-teal-600 font-bold hover:underline">Cadastre-se</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RegisterPage = ({ type }) => {
  const { setUser, setPage } = useApp();
  const isCompany = type === "company";
  const isClient = type === "client";
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", phone: "", bio: "", companyName: "", bairro: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handle = async e => {
    e.preventDefault(); setLoading(true); setError("");
    if (form.password.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); setLoading(false); return; }
    if (form.password !== form.confirmPassword) { setError("As senhas não coincidem."); setLoading(false); return; }
    const role = isCompany ? "COMPANY" : isClient ? "CLIENT" : "CANDIDATE";
    const displayName = isCompany ? form.companyName : form.name;

    try {
      // 1. Criar conta no Supabase Auth
      const { data, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: displayName, role } },
      });
      if (authError) { setError(authError.message); return; }

      // 2. Inserir perfil na tabela profiles
      const profileData = {
        id: data.user.id,
        name: displayName,
        email: form.email,
        role,
        phone: form.phone || null,
        bairro: form.bairro || null,
        city: "Saquarema",
        state: "RJ",
        ...(isCompany
          ? { company_name: form.companyName, verified: false }
          : isClient
          ? { rating: 0, review_count: 0 }
          : { bio: form.bio || null, categories: [], rating: 0, review_count: 0, completed_jobs: 0, response_time: "—", portfolio: [], verified: false, member_since: new Date().toISOString().slice(0, 7) }
        ),
      };
      await supabase.from("profiles").insert(profileData);
      setEmailSent(true);
    } catch (e) {
      console.error("Erro no cadastro:", e);
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const typeKey = isCompany ? "company" : isClient ? "client" : "candidate";
  const tabs = [["candidate", "👤 Profissional"], ["client", "🛒 Cliente"], ["company", "🏢 Empresa"]];

  if (emailSent) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Confirme seu email!</h2>
          <p className="text-gray-500 text-sm mb-6">Enviamos um link de confirmação para <b className="text-gray-700">{form.email}</b>. Clique no link para ativar sua conta e fazer login.</p>
          <p className="text-xs text-gray-400 mb-6">Não encontrou? Verifique a pasta de spam.</p>
          <button onClick={() => setPage("login")} className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3 rounded-xl text-sm transition-colors">
            Ir para o Login
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-gray-900">Criar conta gratuita</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6 gap-1">
            {tabs.map(([key, label]) => (
              <button key={key} onClick={() => setPage(`register${key === "candidate" ? "" : "-" + key}`)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${typeKey === key ? "bg-white shadow text-teal-700" : "text-gray-500"}`}>{label}</button>
            ))}
          </div>
          <Alert type="error" msg={error} onClose={() => setError("")} />
          <form onSubmit={handle} className="space-y-4">
            {isCompany ? (
              <>
                <input required value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Nome da empresa *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email corporativo *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="password" minLength={6} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Senha * (mín. 6 caracteres)" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Confirmar senha *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Bairro *</label>
                  <BairroSelect value={form.bairro} onChange={v => setForm(p => ({ ...p, bairro: v }))} required />
                </div>
              </>
            ) : (
              <>
                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="password" minLength={6} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Senha * (mín. 6 caracteres)" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input required type="password" value={form.confirmPassword} onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Confirmar senha *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="WhatsApp" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Bairro *</label>
                  <BairroSelect value={form.bairro} onChange={v => setForm(p => ({ ...p, bairro: v }))} required />
                </div>
                {!isClient && <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="Bio profissional" rows={3} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />}
              </>
            )}
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 text-xs text-teal-700 font-medium">
              📍 Plataforma exclusiva para moradores de <b>Saquarema — RJ</b>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-teal-300 text-white font-black py-3.5 rounded-xl text-base transition-colors">
              {loading ? "Criando..." : "Criar Conta Grátis"}
            </button>
          </form>
          <div className="mt-5 text-center text-sm text-gray-500">
            Já tem conta? <button onClick={() => setPage("login")} className="text-teal-600 font-bold hover:underline">Entrar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const DashboardPage = () => {
  const { user } = useApp();
  if (!user) return null;
  if (user.role === "CANDIDATE") return <CandidateDashboard />;
  if (user.role === "COMPANY") return <CompanyDashboard />;
  if (user.role === "CLIENT") return <ClientDashboard />;
  if (user.role === "ADMIN") return <AdminDashboard />;
  return null;
};

const CandidateDashboard = () => {
  const { user, db, setDb, setPage } = useApp();
  const [tab, setTab] = useState("portfolio");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user.name, phone: user.phone || "", bio: user.bio || "", bairro: user.bairro || "" });
  const [success, setSuccess] = useState("");
  const [catForm, setCatForm] = useState(user.categories || []);

  // ── Portfólio ──
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postForm, setPostForm] = useState({ title: "", description: "", imageUrl: "", file: null, preview: null });
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");

  // ── Avatar upload ──
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const myProposals = db.proposals.filter(p => p.candidateId === user.id);
  const myReviews = db.reviews.filter(r => r.targetId === user.id);

  // Carregar posts ao montar
  useEffect(() => {
    dbService.getPortfolioPosts(user.id)
      .then(setPosts)
      .catch(e => console.error(e))
      .finally(() => setPostsLoading(false));
  }, [user.id]);

  const saveProfile = async () => {
    const updated = { ...form, categories: catForm };
    try {
      await dbService.updateProfile(user.id, updated);
      setDb(prev => ({ ...prev, users: prev.users.map(u => u.id === user.id ? { ...u, ...updated } : u) }));
      Object.assign(user, updated);
      setEditing(false); setSuccess("Perfil atualizado!"); setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
    }
  };

  const toggleCat = (id) => setCatForm(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);

  // ── Upload de foto de perfil ──
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setSuccess(""); alert("Arquivo muito grande (máx. 5MB)."); return; }
    setAvatarUploading(true);
    try {
      const url = await dbService.uploadImage(file, "avatars", `${user.id}/avatar`);
      await dbService.updateAvatarUrl(user.id, url);
      setDb(prev => ({ ...prev, users: prev.users.map(u => u.id === user.id ? { ...u, avatarUrl: url } : u) }));
      Object.assign(user, { avatarUrl: url });
      setSuccess("Foto atualizada!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      console.error("Erro no upload do avatar:", e);
      alert("Erro ao enviar foto. Verifique se o bucket 'avatars' está criado no Supabase Storage.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Preview de imagem no modal de post ──
  const handlePostFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setPostError("Arquivo muito grande (máx. 10MB)."); return; }
    const reader = new FileReader();
    reader.onload = ev => setPostForm(p => ({ ...p, file, preview: ev.target.result, imageUrl: "" }));
    reader.readAsDataURL(file);
  };

  // ── Criar nova publicação ──
  const createPost = async () => {
    if (!postForm.title.trim()) { setPostError("Título obrigatório."); return; }
    if (!postForm.file && !postForm.imageUrl.trim()) { setPostError("Adicione uma imagem ou URL."); return; }
    setPostSaving(true); setPostError("");
    try {
      let imageUrl = postForm.imageUrl.trim();
      if (postForm.file) {
        imageUrl = await dbService.uploadImage(postForm.file, "portfolio", `${user.id}/${Date.now()}`);
      }
      const newPost = await dbService.createPortfolioPost({
        professionalId: user.id,
        title: postForm.title.trim(),
        description: postForm.description.trim(),
        imageUrl,
      });
      setPosts(prev => [newPost, ...prev]);
      setShowPostModal(false);
      setPostForm({ title: "", description: "", imageUrl: "", file: null, preview: null });
      setSuccess("Publicação adicionada!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      console.error("Erro ao criar post:", e);
      setPostError("Erro ao salvar. Verifique o bucket 'portfolio' no Supabase Storage.");
    } finally {
      setPostSaving(false);
    }
  };

  // ── Deletar publicação ──
  const deletePost = async (postId) => {
    if (!window.confirm("Remover esta publicação?")) return;
    try {
      await dbService.deletePortfolioPost(postId, user.id);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (e) {
      console.error("Erro ao deletar post:", e);
    }
  };

  const tabs = [
    { key: "portfolio", label: "🖼️ Portfólio", count: posts.length },
    { key: "proposals", label: "💬 Propostas", count: myProposals.length },
    { key: "reviews", label: "⭐ Avaliações", count: myReviews.length },
    { key: "profile", label: "👤 Perfil", count: null },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Avatar com botão de upload */}
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-teal-200">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                : <Avatar user={user} size={16} />
              }
            </div>
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {avatarUploading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <span className="text-white text-xs font-bold">📷</span>
              }
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">{user.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge role="CANDIDATE" />
              {user.rating > 0 && <span className="text-sm flex items-center gap-1 text-yellow-600 font-bold">★ {user.rating}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Clique na foto para atualizar</p>
          </div>
        </div>
      </div>

      <Alert type="success" msg={success} />

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key ? "bg-white shadow text-teal-700" : "text-gray-500"}`}>
            {t.label}
            {t.count !== null && <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Aba Portfólio ── */}
      {tab === "portfolio" && (
        <div className="space-y-4">
          {/* Botão nova publicação */}
          <button onClick={() => { setShowPostModal(true); setPostError(""); }}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-teal-300 text-teal-600 font-bold py-4 rounded-2xl hover:bg-teal-50 transition-colors">
            <I.Plus />Nova Publicação no Portfólio
          </button>

          {postsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-sm font-medium">Nenhuma publicação ainda.</p>
              <p className="text-xs mt-1">Adicione fotos dos seus trabalhos para atrair mais clientes.</p>
            </div>
          ) : (
            /* Grid de posts estilo Instagram */
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 gap-0.5 bg-gray-100">
                {posts.map(post => (
                  <div key={post.id} className="relative aspect-square group bg-gray-200">
                    <img src={post.imageUrl} alt={post.title}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.src = "https://placehold.co/400x400/e2e8f0/94a3b8?text=📷"; }} />
                    {/* Overlay com título e botão deletar */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 p-2">
                      <p className="text-white font-bold text-xs text-center leading-tight">{post.title}</p>
                      <button onClick={() => deletePost(post.id)}
                        className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-lg text-xs font-bold transition-colors">
                        🗑️ Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Aba Propostas ── */}
      {tab === "proposals" && (
        <div className="space-y-3">
          <button onClick={() => setPage("services")} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-teal-300 text-teal-600 font-bold py-4 rounded-2xl hover:bg-teal-50 transition-colors">
            <I.Search />Buscar novos pedidos de serviço
          </button>
          {myProposals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-sm">Você ainda não enviou nenhuma proposta.</p>
            </div>
          ) : myProposals.map(p => {
            const job = db.jobs.find(j => j.id === p.jobId);
            const statusMap = { PENDING: ["Aguardando", "bg-yellow-100 text-yellow-700"], ACCEPTED: ["Aceita ✓", "bg-teal-100 text-teal-700"], REJECTED: ["Recusada", "bg-red-100 text-red-700"] };
            const [sl, sc] = statusMap[p.status] || ["?", ""];
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{job?.title || "Serviço removido"}</p>
                    <p className="text-xs text-gray-500">{job?.companyName} · {p.createdAt}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold text-teal-700 text-sm">{p.price}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc}`}>{sl}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{p.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Aba Avaliações ── */}
      {tab === "reviews" && (
        <div className="space-y-3">
          {myReviews.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">⭐</div>
              <p className="text-sm">Nenhuma avaliação recebida ainda.</p>
            </div>
          ) : myReviews.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{r.reviewerName}</p>
                  <p className="text-xs text-gray-500">{r.jobTitle} · {r.createdAt}</p>
                </div>
                <div className="flex">{stars(r.rating)}</div>
              </div>
              <p className="text-sm text-gray-600">{r.comment}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Aba Perfil ── */}
      {tab === "profile" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between mb-4">
            <h2 className="font-black text-gray-900">Meu Perfil</h2>
            <button onClick={() => setEditing(e => !e)} className="text-sm text-teal-600 font-bold hover:underline">{editing ? "Cancelar" : "✏️ Editar"}</button>
          </div>
          {editing ? (
            <div className="space-y-3">
              {[["Nome", "name"], ["WhatsApp", "phone"]].map(([l, k]) => (
                <div key={k}>
                  <label className="text-xs font-bold text-gray-600 block mb-1">{l}</label>
                  <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Bairro</label>
                <BairroSelect value={form.bairro} onChange={v => setForm(p => ({ ...p, bairro: v }))} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Bio</label>
                <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-2">Áreas de atuação</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => (
                    <button key={c.id} onClick={() => toggleCat(c.id)}
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-colors ${catForm.includes(c.id) ? "bg-teal-700 text-white border-teal-600" : "bg-white text-gray-600 border-gray-300 hover:border-teal-400"}`}>
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={saveProfile} className="bg-teal-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-teal-800">Salvar</button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {[["Email", user.email], ["WhatsApp", user.phone || "—"], ["Bairro", user.bairro || "—"]].map(([l, v]) => (
                <div key={l} className="flex gap-2 py-1.5 border-b border-gray-50">
                  <span className="font-semibold text-gray-500 w-20 shrink-0">{l}</span>
                  <span className="text-gray-700">{v}</span>
                </div>
              ))}
              {user.bio && <p className="text-gray-600 mt-2 bg-gray-50 rounded-xl p-3">{user.bio}</p>}
              <div className="flex flex-wrap gap-2 mt-3">
                {user.categories?.map(c => {
                  const cat = CATEGORIES.find(x => x.id === c);
                  return cat ? <span key={c} className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-semibold">{cat.emoji} {cat.label}</span> : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal de Nova Publicação ── */}
      {showPostModal && (
        <Modal title="🖼️ Nova Publicação" onClose={() => { setShowPostModal(false); setPostForm({ title: "", description: "", imageUrl: "", file: null, preview: null }); setPostError(""); }}>
          <div className="space-y-4">
            {postError && <Alert type="error" msg={postError} onClose={() => setPostError("")} />}

            {/* Preview da imagem */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden">
              {postForm.preview || postForm.imageUrl ? (
                <div className="relative">
                  <img src={postForm.preview || postForm.imageUrl} alt="Preview"
                    className="w-full h-48 object-cover"
                    onError={e => { e.target.src = "https://placehold.co/600x400/e2e8f0/94a3b8?text=URL+inválida"; }} />
                  <button onClick={() => setPostForm(p => ({ ...p, file: null, preview: null, imageUrl: "" }))}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/80">
                    <I.X />
                  </button>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-sm text-gray-500 mb-3">Envie uma foto ou cole uma URL</p>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-sm hover:bg-teal-800 transition-colors">
                    Escolher arquivo
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePostFileChange} />
                </div>
              )}
            </div>

            {/* URL alternativa */}
            {!postForm.file && (
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Ou cole uma URL de imagem</label>
                <input value={postForm.imageUrl}
                  onChange={e => setPostForm(p => ({ ...p, imageUrl: e.target.value, preview: null, file: null }))}
                  placeholder="https://exemplo.com/foto.jpg"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Título *</label>
              <input value={postForm.title}
                onChange={e => setPostForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Ex: Reforma de banheiro completa"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Descrição (opcional)</label>
              <textarea value={postForm.description}
                onChange={e => setPostForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Descreva o trabalho realizado..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => { setShowPostModal(false); setPostForm({ title: "", description: "", imageUrl: "", file: null, preview: null }); setPostError(""); }}
                className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createPost} disabled={postSaving}
                className="flex-1 bg-teal-700 text-white font-bold py-3 rounded-xl text-sm hover:bg-teal-800 disabled:bg-teal-300 transition-colors">
                {postSaving ? "Publicando..." : "Publicar"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const CompanyDashboard = () => {
  const { user, db, setDb, setPage } = useApp();
  const myJobs = db.jobs.filter(j => j.companyId === user.id);
  const [tab, setTab] = useState("jobs");

  const acceptProposal = async (proposalId, jobId) => {
    try {
      await dbService.updateProposalStatus(proposalId, "ACCEPTED");
      // Rejeitar as demais propostas do mesmo job
      const otherProposals = db.proposals.filter(p => p.jobId === jobId && p.id !== proposalId && p.status === "PENDING");
      await Promise.all(otherProposals.map(p => dbService.updateProposalStatus(p.id, "REJECTED")));
      await dbService.updateJobStatus(jobId, "IN_PROGRESS");
      setDb(prev => ({
        ...prev,
        proposals: prev.proposals.map(p => p.id === proposalId ? { ...p, status: "ACCEPTED" } : p.jobId === jobId && p.id !== proposalId ? { ...p, status: "REJECTED" } : p),
        jobs: prev.jobs.map(j => j.id === jobId ? { ...j, status: "IN_PROGRESS" } : j),
      }));
    } catch (e) {
      console.error("Erro ao aceitar proposta:", e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">{user.companyName}</h1>
          <Badge role="COMPANY" />
        </div>
        <button onClick={() => setPage("request-service")} className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <I.Plus />Nova Vaga
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-teal-700">{myJobs.length}</div>
          <div className="text-xs text-teal-600">Publicações</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-blue-700">{myJobs.reduce((a, j) => a + db.proposals.filter(p => p.jobId === j.id).length, 0)}</div>
          <div className="text-xs text-blue-600">Propostas</div>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-purple-700">{myJobs.filter(j => j.status === "IN_PROGRESS").length}</div>
          <div className="text-xs text-purple-600">Em andamento</div>
        </div>
      </div>

      {myJobs.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center text-gray-400">
          <div className="text-5xl mb-3">📋</div>
          <p className="font-bold mb-2">Nenhuma publicação ainda</p>
          <button onClick={() => setPage("request-service")} className="text-teal-600 font-bold hover:underline">Publicar primeira vaga →</button>
        </div>
      ) : myJobs.map(job => {
        const proposals = db.proposals.filter(p => p.jobId === job.id);
        const sMap = { OPEN: "bg-teal-100 text-teal-700", IN_PROGRESS: "bg-blue-100 text-blue-700", CLOSED: "bg-gray-100 text-gray-500" };
        return (
          <div key={job.id} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-black text-gray-900">{job.title}</h3>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sMap[job.status]}`}>{job.status === "OPEN" ? "Aberto" : job.status === "IN_PROGRESS" ? "Em andamento" : "Encerrado"}</span>
                    {job.budget && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{job.budget}</span>}
                  </div>
                </div>
                <button onClick={async () => { if (window.confirm("Excluir este pedido?")) { try { await dbService.deleteJob(job.id); setDb(prev => ({ ...prev, jobs: prev.jobs.filter(j => j.id !== job.id) })); } catch(e) { console.error(e); } } }} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                  <I.Trash />
                </button>
              </div>
            </div>

            {proposals.length > 0 && (
              <div className="border-t border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-700 mb-3">{proposals.length} proposta{proposals.length !== 1 ? "s" : ""} recebida{proposals.length !== 1 ? "s" : ""}</p>
                <div className="space-y-3">
                  {proposals.map(p => {
                    const pCandidate = db.users.find(u => u.id === p.candidateId);
                    const statusColors = { PENDING: "bg-yellow-50 border-yellow-200", ACCEPTED: "bg-teal-50 border-teal-300", REJECTED: "bg-gray-50 border-gray-200" };
                    return (
                      <div key={p.id} className={`border rounded-xl p-4 ${statusColors[p.status]}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Avatar user={pCandidate} size={8} />
                            <div>
                              <p className="font-bold text-gray-900 text-sm">{p.candidateName}</p>
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                {stars(p.candidateRating)} <span>{p.candidateRating}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-teal-700">{p.price}</p>
                            {p.status === "ACCEPTED" && <span className="text-xs font-bold text-teal-600">✓ Aceita</span>}
                            {p.status === "REJECTED" && <span className="text-xs text-gray-400">Recusada</span>}
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">{p.message}</p>
                        {p.status === "PENDING" && (
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => acceptProposal(p.id, job.id)} className="flex-1 bg-teal-700 text-white font-bold py-2 rounded-xl text-sm hover:bg-teal-800 transition-colors">Aceitar</button>
                            {pCandidate?.phone && <button onClick={() => openWhatsApp(pCandidate.phone, job.title)} className="bg-teal-100 text-teal-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-teal-200 transition-colors">📱</button>}
                          </div>
                        )}
                        {p.status === "ACCEPTED" && pCandidate?.phone && (
                          <button onClick={() => openWhatsApp(pCandidate.phone, job.title)} className="mt-2 w-full flex items-center justify-center gap-2 bg-cyan-400 text-white font-bold py-2 rounded-xl text-sm hover:bg-teal-700 transition-colors">📱 Contatar via WhatsApp</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const ClientDashboard = () => {
  const { user, db, setPage } = useApp();
  const myRequests = db.jobs.filter(j => j.companyId === user.id);
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">Olá, {user.name.split(" ")[0]}!</h1>
          <Badge role="CLIENT" />
        </div>
        <button onClick={() => setPage("request-service")} className="flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <I.Plus />Novo Pedido
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center">
          <div className="text-3xl font-black text-teal-700">{myRequests.length}</div>
          <div className="text-sm text-teal-600 mt-1">Pedidos publicados</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
          <div className="text-3xl font-black text-blue-700">{myRequests.reduce((a, j) => a + db.proposals.filter(p => p.jobId === j.id).length, 0)}</div>
          <div className="text-sm text-blue-600 mt-1">Propostas recebidas</div>
        </div>
      </div>
      {myRequests.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center text-gray-400">
          <div className="text-5xl mb-3">🔍</div>
          <p>Você ainda não publicou pedidos.</p>
          <button onClick={() => setPage("request-service")} className="mt-3 text-teal-600 font-bold hover:underline">Solicitar meu primeiro serviço →</button>
        </div>
      ) : myRequests.map(job => {
        const proposals = db.proposals.filter(p => p.jobId === job.id);
        return (
          <div key={job.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-black text-gray-900 mb-1">{job.title}</h3>
            <p className="text-sm text-gray-500 mb-3">{proposals.length} proposta{proposals.length !== 1 ? "s" : ""} recebida{proposals.length !== 1 ? "s" : ""}</p>
            {proposals.map(p => (
              <div key={p.id} className="bg-gray-50 rounded-xl p-3 mb-2 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-gray-800">{p.candidateName}</p>
                  <p className="text-xs text-gray-500">{p.price}</p>
                </div>
                <div className="flex">{stars(p.candidateRating)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

const AdminDashboard = () => {
  const { db, setDb } = useApp();
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "users", "jobs", "proposals", "reviews"];
  const delUser = async id => {
    if (!window.confirm("Excluir usuário?")) return;
    try { await dbService.deleteUser(id); setDb(prev => ({ ...prev, users: prev.users.filter(u => u.id !== id) })); }
    catch(e) { console.error("Erro ao excluir usuário:", e); }
  };
  const delJob = async id => {
    if (!window.confirm("Excluir pedido?")) return;
    try { await dbService.deleteJob(id); setDb(prev => ({ ...prev, jobs: prev.jobs.filter(j => j.id !== id) })); }
    catch(e) { console.error("Erro ao excluir pedido:", e); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600"><I.Shield /></div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Painel Admin</h1>
          <p className="text-xs text-gray-500">Gestão completa da plataforma</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all capitalize ${tab === t ? "bg-white shadow text-red-600" : "text-gray-500"}`}>{t}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            ["Usuários", db.users.length, "👥"],
            ["Vagas/Pedidos", db.jobs.length, "💼"],
            ["Propostas", db.proposals.length, "💬"],
            ["Avaliações", db.reviews.length, "⭐"],
          ].map(([l, v, icon]) => (
            <div key={l} className="bg-white border border-gray-200 rounded-2xl p-5 text-center shadow-sm">
              <div className="text-3xl mb-1">{icon}</div>
              <div className="text-2xl font-black text-gray-900">{v}</div>
              <div className="text-xs text-gray-500">{l}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "users" && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Nome", "Email", "Tipo", "Plano", ""].map(h => <th key={h} className="text-left px-4 py-3 font-bold text-gray-600 text-xs">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {db.users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3"><Badge role={u.role} /></td>

                  <td className="px-4 py-3 text-right">{u.role !== "ADMIN" && <button onClick={() => delUser(u.id)} className="text-red-300 hover:text-red-500"><I.Trash /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "jobs" && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{["Título", "Empresa", "Categoria", "Status", ""].map(h => <th key={h} className="text-left px-4 py-3 font-bold text-gray-600 text-xs">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {db.jobs.map(j => {
                const cat = CATEGORIES.find(c => c.id === j.category);
                return (
                  <tr key={j.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{j.title}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{j.companyName}</td>
                    <td className="px-4 py-3 text-xs hidden md:table-cell">{cat?.emoji} {cat?.label}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-teal-100 text-teal-700 font-bold px-2 py-0.5 rounded-full">{j.status}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => delJob(j.id)} className="text-red-300 hover:text-red-500"><I.Trash /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "proposals" && (
        <div className="space-y-3">
          {db.proposals.map(p => {
            const job = db.jobs.find(j => j.id === p.jobId);
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-gray-900">{p.candidateName} → {job?.title}</p>
                  <p className="text-xs text-gray-500">{p.price} · {p.createdAt}</p>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.status === "ACCEPTED" ? "bg-teal-100 text-teal-700" : p.status === "REJECTED" ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "reviews" && (
        <div className="space-y-3">
          {db.reviews.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <div className="flex justify-between mb-1">
                <p className="font-bold text-sm"><span className="text-gray-500">{r.reviewerName}</span> → {r.targetName}</p>
                <div className="flex">{stars(r.rating)}</div>
              </div>
              <p className="text-sm text-gray-600">{r.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function EmpregaFacilV2() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(initialDB);
  const [selectedPro, setSelectedPro] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(true);

  // ── Carrega todos os dados públicos do Supabase ──
  const loadPublicData = useCallback(async () => {
    setDbLoading(true);
    try {
      const [users, jobs, proposals, reviews] = await Promise.all([
        dbService.getProfessionals(),
        dbService.getJobs(),
        dbService.getProposals(),
        dbService.getReviews(),
      ]);
      setDb(prev => ({ ...prev, users, jobs, proposals, reviews }));
    } catch (e) {
      console.error("Erro ao carregar dados:", e);
    } finally {
      setDbLoading(false);
    }
  }, []);

  // ── Carrega mensagens do usuário logado ──
  const loadUserMessages = useCallback(async (userId) => {
    try {
      const messages = await dbService.getMessages(userId);
      setDb(prev => ({ ...prev, messages }));
    } catch (e) {
      console.error("Erro ao carregar mensagens:", e);
    }
  }, []);

  // ── Inicialização: sessão + dados públicos ──
  useEffect(() => {
    const safetyTimer = setTimeout(() => setAuthLoading(false), 5000);

    const init = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && session?.user) {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
          if (profile) {
            const normUser = normProfile({ ...profile, email: session.user.email });
            setUser(normUser);
            loadUserMessages(normUser.id);
          }
        }
      } catch (e) {
        console.error("Erro ao verificar sessão:", e);
      } finally {
        clearTimeout(safetyTimer);
        setAuthLoading(false);
      }
    };

    // Carrega dados públicos (jobs, profissionais, propostas, avaliações)
    loadPublicData();
    init();

    // Ouvir mudanças de autenticação (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        try {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
          if (profile) {
            const normUser = normProfile({ ...profile, email: session.user.email });
            setUser(normUser);
            setPage("dashboard");
            loadUserMessages(normUser.id);
          }
        } catch (e) {
          console.error("Erro ao carregar perfil:", e);
        }
      }
      if (event === "SIGNED_OUT") {
        setUser(null);
        setPage("home");
        setDb(prev => ({ ...prev, messages: [] }));
      }
    });

    return () => { subscription.unsubscribe(); clearTimeout(safetyTimer); };
  }, [loadPublicData, loadUserMessages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setPage("home");
  };

  const ctx = {
    page, setPage,
    user, setUser,
    db, setDb,
    selectedPro, setSelectedPro,
    handleLogout,
    reloadData: loadPublicData,
    dbLoading,
  };

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-teal-700 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg animate-pulse">
          <span className="text-white font-black text-xl">EF</span>
        </div>
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    </div>
  );

  const renderPage = () => {
    switch (page) {
      case "home": return <HomePage />;
      case "services": return <ServicesPage />;
      case "professionals": return <ProfessionalsPage />;
      case "profile": return <ProfilePage />;
      case "request-service": return user ? <RequestServicePage /> : <LoginPage />;

      case "messages": return user ? <MessagesPage /> : <LoginPage />;
      case "login": return <LoginPage />;
      case "register": return <RegisterPage type="candidate" />;
      case "register-client": return <RegisterPage type="client" />;
      case "register-company": return <RegisterPage type="company" />;
      case "dashboard": return user ? <DashboardPage /> : <LoginPage />;
      default: return <HomePage />;
    }
  };

  // Bottom nav for mobile
  const bottomNav = user && [
    { key: "home", icon: <I.Home />, label: "Início" },
    { key: "services", icon: <I.Briefcase />, label: "Serviços" },
    { key: "professionals", icon: <I.User />, label: "Profissionais" },
    { key: "messages", icon: <I.MessageCircle />, label: "Mensagens" },
    { key: "dashboard", icon: <I.Settings />, label: "Conta" },
  ];

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen bg-gray-50 font-sans pb-16 sm:pb-0">
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; }
          .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          main { animation: fadeIn 0.2s ease; }
        `}</style>
        <Navbar />
        <main key={page}>{renderPage()}</main>

        {/* Mobile bottom navigation */}
        {bottomNav && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex sm:hidden z-40 shadow-lg">
            {bottomNav.map(n => (
              <button key={n.key} onClick={() => setPage(n.key)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${page === n.key ? "text-teal-600" : "text-gray-400 hover:text-gray-600"}`}>
                {n.icon}
                <span className="text-xs font-semibold">{n.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
