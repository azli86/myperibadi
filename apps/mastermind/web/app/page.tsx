"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signInWithGoogle } from "../lib/firebase";

function GoogleIcon(){return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}

type View = "dashboard" | "users" | "households" | "logs";
type Stats = Record<"users"|"active_users"|"households"|"transactions"|"transactions_30d"|"active_wallets"|"requests_24h", number>;
type User = {id:string;name:string|null;email:string;is_active:boolean;email_verified_at:string|null;created_at:string;deactivated_reason:string|null;auth_provider:string|null;phone:string|null};
type Household = {id:number;name:string;status:string;created_at:string;owner_name:string|null;member_count:number};
type LoginLog = {id:number;email:string;status:string;ip_address:string;device_label:string;created_at:string;name:string|null};
type AuditLog = {id:number;actor_email:string;action:string;target_type:string;target_id:string;detail:string;created_at:string};

const fmtDate=(s:string|null|undefined)=>s?new Date(s).toLocaleString("ms-MY",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";

export default function Home() {
  const [authenticated,setAuthenticated]=useState<boolean|null>(null), [stats,setStats]=useState<Stats|null>(null);
  const [view,setView]=useState<View>("dashboard"), [error,setError]=useState("");
  const [googleLoading,setGoogleLoading]=useState(false);
  const [users,setUsers]=useState<User[]>([]);
  const [detail,setDetail]=useState<any|null>(null), [detailUser,setDetailUser]=useState<string|null>(null);
  const [households,setHouseholds]=useState<Household[]>([]);
  const [hhDetail,setHhDetail]=useState<any|null>(null);
  const [loginLogs,setLoginLogs]=useState<LoginLog[]>([]);
  const [auditLogs,setAuditLogs]=useState<AuditLog[]>([]);
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{const r=await fetch("/api/dashboard",{credentials:"include",cache:"no-store"});if(r.status===401){setAuthenticated(false);return}if(!r.ok)throw new Error("Dashboard gagal dimuat");setStats(await r.json());setAuthenticated(true)},[]);
  useEffect(()=>{void load().catch(e=>setError(e.message))},[load]);

  async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");const form=new FormData(e.currentTarget);const r=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:form.get("email"),password:form.get("password")})});if(!r.ok){setError("E-mel atau kata laluan tidak sah");return}await load()}
  async function loginGoogle(){setError("");setGoogleLoading(true);try{const idToken=await signInWithGoogle();const r=await fetch("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id_token:idToken})});if(!r.ok){const d=await r.json().catch(()=>null);setError((d&&d.detail)||"Akaun Google ini bukan pentadbir");return}await load()}finally{setGoogleLoading(false)}}

  async function showUsers(q=""){setView("users");const r=await fetch(`/api/users?q=${encodeURIComponent(q)}`,{credentials:"include"});if(!r.ok){setError("Senarai pengguna gagal dimuat");return}setUsers(await r.json())}
  async function openUser(id:string){setDetailUser(id);const r=await fetch(`/api/users/${id}`,{credentials:"include"});if(!r.ok){setError("Detail pengguna gagal dimuat");return}setDetail(await r.json())}
  async function toggleActive(u:User){if(!window.confirm(`Pasti ${u.is_active?"nyahaktif":"aktifkan semula"} ${u.email}?`))return;setBusy(true);setError("");const r=await fetch(`/api/users/${u.id}/${u.is_active?"deactivate":"reactivate"}`,{method:"POST",credentials:"include"});if(!r.ok){const d=await r.json().catch(()=>null);setError((d&&d.detail)||"Tindakan gagal");}else{await showUsers(document.querySelector<HTMLInputElement>("[data-user-q]")?.value||"")}setBusy(false)}

  async function showHouseholds(q=""){setView("households");setHhDetail(null);const r=await fetch(`/api/households?q=${encodeURIComponent(q)}`,{credentials:"include"});if(!r.ok){setError("Senarai household gagal dimuat");return}setHouseholds(await r.json())}
  async function openHousehold(id:number){const r=await fetch(`/api/households/${id}`,{credentials:"include"});if(!r.ok){setError("Detail household gagal dimuat");return}setHhDetail(await r.json())}

  async function showLogs(kind:"login"|"audit"){setView("logs");const ep=kind==="login"?"login-logs":"audit-logs";const r=await fetch(`/api/${ep}`,{credentials:"include"});if(!r.ok){setError("Log gagal dimuat");return}if(kind==="login")setLoginLogs(await r.json());else setAuditLogs(await r.json())}

  if(authenticated===null)return <main className="login"><p className="muted">Memuatkan Mastermind…</p></main>;
  if(!authenticated)return <main className="login"><form className="card" onSubmit={login}><h1>Mastermind</h1><p className="muted">Portal pentadbiran MyPeribadi</p><button type="button" className="primary google" onClick={()=>void loginGoogle()} disabled={googleLoading}><GoogleIcon/><span>{googleLoading?"Memproses…":"Log masuk dengan Google"}</span></button><div className="divider"><span>atau</span></div><div className="label">Log masuk dengan e-mel</div><input className="field" name="email" type="email" placeholder="E-mel admin" required autoComplete="username"/><input className="field" name="password" type="password" placeholder="Kata laluan" required autoComplete="current-password"/><button className="primary">Log masuk</button>{error&&<p className="error">{error}</p>}</form></main>;

  const cards: [string,number|undefined][]=[["Jumlah pengguna",stats?.users],["Pengguna aktif",stats?.active_users],["Household",stats?.households],["Transaksi",stats?.transactions],["Transaksi 30 hari",stats?.transactions_30d],["Wallet aktif",stats?.active_wallets],["Permintaan 24 jam",stats?.requests_24h]];

  return <div className="shell"><aside className="side"><div className="brand">Mastermind</div><small>MyPeribadi Admin</small><nav className="nav"><button className={view==="dashboard"?"active":""} onClick={()=>setView("dashboard")}>Dashboard</button><button className={view==="users"?"active":""} onClick={()=>void showUsers()}>Pengguna</button><button className={view==="households"?"active":""} onClick={()=>void showHouseholds()}>Household</button><button className={view==="logs"?"active":""} onClick={()=>void showLogs("login")}>Log</button></nav></aside><main className="main"><header className="top"><div><h1>{{dashboard:"Ringkasan sistem",users:"Pengguna",households:"Household",logs:"Log"}[view]}</h1><p className="muted">Akses pentadbiran MyPeribadi.</p></div><button className="primary" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});setAuthenticated(false)}}>Log keluar</button></header>{error&&<p className="error">{error}</p>}
  {view==="dashboard"&&<section className="grid">{cards.map(([label,value])=><article className="card" key={label}><span className="muted">{label}</span><div className="metric">{value?.toLocaleString("ms-MY")??"—"}</div></article>)}</section>}
  {view==="users"&&<><div className="card"><input className="search" data-user-q placeholder="Cari nama atau e-mel" onChange={e=>void showUsers(e.target.value)}/><table className="table"><thead><tr><th>Pengguna</th><th>Status</th><th>Verified</th><th>Daftar</th><th></th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><strong>{u.name||"—"}</strong><br/><span className="muted">{u.email}</span></td><td><span className={u.is_active?"pill ok":"pill bad"}>{u.is_active?"Aktif":u.deactivated_reason||"Tidak aktif"}</span></td><td>{u.email_verified_at?"Ya":"Tidak"}</td><td>{new Date(u.created_at).toLocaleDateString("ms-MY")}</td><td><div className="row"><button className="ghost" onClick={()=>void openUser(u.id)}>Detail</button>{!u.email.endsWith("@invalid.local")&&<button className={u.is_active?"ghost danger":"ghost good"} disabled={busy} onClick={()=>void toggleActive(u)}>{u.is_active?"Nyahaktif":"Aktifkan"}</button>}</div></td></tr>)}</tbody></table></div>
  {detailUser && (
    <div className="card detail">
      <header className="detail-head"><h2>Detail Pengguna</h2><button className="ghost" onClick={()=>{setDetail(null);setDetailUser(null)}}>Tutup</button></header>
      {detail && (
        <>
          <div className="kv"><span>Nama</span><b>{detail.name||"—"}</b></div>
          <div className="kv"><span>E-mel</span><b>{detail.email}</b></div>
          <div className="kv"><span>Telefon</span><b>{detail.phone||"—"}</b></div>
          <div className="kv"><span>Provider</span><b>{detail.auth_provider||"email"}</b></div>
          <div className="kv"><span>Verified</span><b>{detail.email_verified_at?"Ya":"Tidak"}</b></div>
          <div className="kv"><span>Admin</span><b>{detail.is_admin?"Ya":"Tidak"}</b></div>
          <div className="kv"><span>Status</span><b>{detail.is_active?"Aktif":detail.deactivated_reason||"Tidak aktif"}</b></div>
          <div className="kv"><span>Daftar</span><b>{fmtDate(detail.created_at)}</b></div>
          <div className="sub-title">Statistik</div>
          <div className="row">{Object.entries(detail.stats||{}).map(([k,v])=><span className="pill" key={k}>{k.replace(/_/g," ")}: {String(v)}</span>)}</div>
          <div className="sub-title">Keahlian Household</div>
          {(detail.memberships||[]).length ? (
            <table className="table"><thead><tr><th>Household</th><th>Role</th><th>Status</th></tr></thead><tbody>{detail.memberships.map((m:any)=><tr key={m.id}><td>{m.name}</td><td>{m.role}</td><td>{m.status}</td></tr>)}</tbody></table>
          ) : <p className="muted">Tiada keahlian.</p>}
        </>
      )}
    </div>
  )}
  </>}
  {view==="households"&&<><div className="card"><input className="search" placeholder="Cari nama household" onChange={e=>void showHouseholds(e.target.value)}/><table className="table"><thead><tr><th>Household</th><th>Pemilik</th><th>Ahli</th><th>Status</th><th>Daftar</th></tr></thead><tbody>{households.map(h=><tr key={h.id} onClick={()=>void openHousehold(h.id)} style={{cursor:"pointer"}}><td><strong>{h.name}</strong></td><td>{h.owner_name||h.id}</td><td>{h.member_count}</td><td>{h.status}</td><td>{new Date(h.created_at).toLocaleDateString("ms-MY")}</td></tr>)}</tbody></table></div>
  {hhDetail&&<div className="card detail"><header className="detail-head"><h2>Household: {hhDetail.household.name}</h2><button className="ghost" onClick={()=>setHhDetail(null)}>Tutup</button></header><table className="table"><thead><tr><th>Ahli</th><th>Role</th><th>Status</th><th>Sertai</th></tr></thead><tbody>{hhDetail.members.map((m:any)=><tr key={m.id}><td><strong>{m.name||"—"}</strong><br/><span className="muted">{m.email}</span></td><td>{m.role}</td><td><span className={m.is_active?"pill ok":"pill bad"}>{m.status}</span></td><td>{fmtDate(m.joined_at)}</td></tr>)}</tbody></table></div>}
  </>}
  {view==="logs"&&<><div className="row tabs"><button className={loginLogs.length||!auditLogs.length?"tab active":"tab"} onClick={()=>void showLogs("login")}>Log Masuk</button><button className={auditLogs.length&&!loginLogs.length?"tab active":"tab"} onClick={()=>void showLogs("audit")}>Audit</button></div>
  {loginLogs.length?<div className="card"><table className="table"><thead><tr><th>E-mel</th><th>Status</th><th>IP</th><th>Peranti</th><th>Masa</th></tr></thead><tbody>{loginLogs.map(l=><tr key={l.id}><td><strong>{l.name||"—"}</strong><br/><span className="muted">{l.email}</span></td><td><span className={"pill "+(l.status==="success"?"ok":"bad")}>{l.status}</span></td><td>{l.ip_address}</td><td>{l.device_label||"—"}</td><td>{fmtDate(l.created_at)}</td></tr>)}</tbody></table></div>:
  <div className="card"><table className="table"><thead><tr><th>Admin</th><th>Tindakan</th><th>Sasaran</th><th>Masa</th></tr></thead><tbody>{auditLogs.map(l=><tr key={l.id}><td>{l.actor_email}</td><td><span className="pill">{l.action}</span></td><td>{l.target_type} {l.target_id}{l.detail&&<><br/><span className="muted">{l.detail}</span></>}</td><td>{fmtDate(l.created_at)}</td></tr>)}</tbody></table></div>}
  </>}
  </main></div>;
}
